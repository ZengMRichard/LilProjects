// Head pose from landmarks. The same algorithm as facet_metrics/geometry.py (Horn's quaternion
// method over the rigid upper face), so the capture screen and the server agree on every angle.
// packages/fixtures/pose_cases.json pins both implementations to the same numbers.
import {
  canonical,
  EYE_RING_L,
  EYE_RING_R,
  LANDMARKS,
  MESH_VERTICES_WITH_IRIS,
  PUPIL_L,
  PUPIL_R,
  type Vec3,
} from "./canonical";

export type Mat3 = [Vec3, Vec3, Vec3];

export interface Pose {
  /** > 0: turned toward the subject's own left. */
  yaw: number;
  /** > 0: chin down. */
  pitch: number;
  /** > 0: tilted toward the subject's right shoulder. */
  roll: number;
  rotation: Mat3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const DEG = 180 / Math.PI;

export function centroid(points: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / points.length, y / points.length, z / points.length];
}

/** Image pixels (x right, y down, z away) to face space (x left, y up, z toward the camera). */
export function toFaceSpace(pointsPx: ArrayLike<ArrayLike<number>>): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < pointsPx.length; i++) {
    const p = pointsPx[i]!;
    out.push([p[0]!, -p[1]!, -p[2]!]);
  }
  return out;
}

function jacobiEigenSymmetric(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const v: number[][] = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i]![j]! * a[i]![j]!;
    if (off < 1e-22) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p]![q]!) < 1e-300) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]!), vectors: v };
}

/** Rotation R minimising sum |R (s - mean s) - (t - mean t)|^2. */
export function bestRotation(source: Vec3[], target: Vec3[]): Mat3 {
  const cs = centroid(source);
  const ct = centroid(target);
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < source.length; i++) {
    const a = sub(source[i]!, cs);
    const b = sub(target[i]!, ct);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r]![c]! += a[r]! * b[c]!;
  }
  const [sxx, sxy, sxz] = m[0] as Vec3;
  const [syx, syy, syz] = m[1] as Vec3;
  const [szx, szy, szz] = m[2] as Vec3;
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const { values, vectors } = jacobiEigenSymmetric(n);
  let k = 0;
  for (let i = 1; i < 4; i++) if (values[i]! > values[k]!) k = i;
  let [w, x, y, z] = [vectors[0]![k]!, vectors[1]![k]!, vectors[2]![k]!, vectors[3]![k]!];
  const length = Math.hypot(w, x, y, z);
  w /= length;
  x /= length;
  y /= length;
  z /= length;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

const RIGID_MODEL = canonical.rigid.map((i) => canonical.vertices[i]!);

export function estimatePose(facePoints: Vec3[]): Pose {
  const r = bestRotation(
    RIGID_MODEL,
    canonical.rigid.map((i) => facePoints[i]!),
  );
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    pitch: -Math.asin(clamp(r[1][2])) * DEG,
    yaw: Math.atan2(r[0][2], r[2][2]) * DEG,
    roll: Math.atan2(r[1][0], r[1][1]) * DEG,
    rotation: r,
  };
}

function pupils(points: Vec3[]): [Vec3, Vec3] {
  if (points.length >= MESH_VERTICES_WITH_IRIS) return [points[PUPIL_R]!, points[PUPIL_L]!];
  return [centroid(EYE_RING_R.map((i) => points[i]!)), centroid(EYE_RING_L.map((i) => points[i]!))];
}

export interface FrameGeometry {
  pose: Pose;
  /** Inter-pupillary distance in pixels, measured in 3D so a head turn does not shrink it. */
  ipdPx: number;
  /** Lip gap divided by mouth width, with head rotation removed. */
  mouthGap: number;
}

/** Everything the capture checks need from one landmark set (image pixels). */
export function frameGeometry(pointsPx: ArrayLike<ArrayLike<number>>): FrameGeometry {
  const face = toFaceSpace(pointsPx);
  const pose = estimatePose(face);
  const r = pose.rotation;
  // Multiply by the transpose (the inverse rotation).
  const rotated = face.map(
    (p): Vec3 => [
      r[0][0] * p[0] + r[1][0] * p[1] + r[2][0] * p[2],
      r[0][1] * p[0] + r[1][1] * p[1] + r[2][1] * p[2],
      r[0][2] * p[0] + r[1][2] * p[1] + r[2][2] * p[2],
    ],
  );
  const [right, left] = pupils(rotated);
  const ipdPx = Math.sqrt(dot(sub(right, left), sub(right, left)));
  const upper = rotated[LANDMARKS.stomion_upper]!;
  const lower = rotated[LANDMARKS.stomion_lower]!;
  const cr = rotated[LANDMARKS.cheilion_r]!;
  const cl = rotated[LANDMARKS.cheilion_l]!;
  const mouthWidth = Math.hypot(cr[0] - cl[0], cr[1] - cl[1]);
  return { pose, ipdPx, mouthGap: (upper[1] - lower[1]) / mouthWidth };
}
