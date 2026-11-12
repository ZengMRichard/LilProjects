// A synthetic sample scan: the canonical model face with a small fixed asymmetry, projected into
// three views. It lets anyone see a full report without a camera, and it is always labelled as
// synthetic. No photo is involved, so the skin snapshot is unavailable for it.
import { canonical, EYE_RING_L, EYE_RING_R, type Vec3 } from "./canonical";

export const SYNTHETIC_MODEL_VERSION = "synthetic-canonical-1";
const WIDTH = 720;
const HEIGHT = 960;
const SCALE = 42;

/** Deterministic PRNG (mulberry32) so the sample is the same every time. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function rotation(yawDeg: number, pitchDeg: number, rollDeg: number) {
  const [y, p, r] = [yawDeg, pitchDeg, rollDeg].map((d) => (d * Math.PI) / 180) as [number, number, number];
  const [cy, sy, cp, sp, cr, sr] = [
    Math.cos(y),
    Math.sin(y),
    Math.cos(p),
    Math.sin(p),
    Math.cos(r),
    Math.sin(r),
  ];
  return [
    [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp],
    [cp * sr, cp * cr, -sp],
    [-sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp],
  ];
}

/** The model face: mouth closed, with mild left-right differences like any real face. */
function sampleFace(): Vec3[] {
  const random = prng(20261111);
  const vertices = canonical.vertices.map((v) => [...v] as Vec3);
  const upper = vertices[13]!;
  vertices[14] = [upper[0], upper[1] - 0.05, upper[2]];
  // Smooth, low-amplitude asymmetry: the left side is shifted by a slowly varying offset.
  const ax = (random() - 0.5) * 0.16;
  const ay = (random() - 0.5) * 0.2;
  for (const [, left] of canonical.pairs) {
    const v = vertices[left]!;
    const fall = Math.exp(-((v[1] + 2) * (v[1] + 2)) / 40);
    v[0] += ax * fall + gaussian(random) * 0.015;
    v[1] += ay * fall + gaussian(random) * 0.015;
  }
  return vertices;
}

function project(face: Vec3[], yaw: number, pitch: number, roll: number): number[][] {
  const m = rotation(yaw, pitch, roll);
  const points = face.map((v) => {
    const x = m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2];
    const y = m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2];
    const z = m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2];
    return [WIDTH / 2 + SCALE * x, HEIGHT / 2 - SCALE * (y + 0.6), -SCALE * z];
  });
  // Iris landmarks (five per eye) at the centre of each eye opening.
  for (const ring of [EYE_RING_R, EYE_RING_L]) {
    const centre = [0, 1, 2].map((k) => ring.reduce((sum, i) => sum + points[i]![k]!, 0) / ring.length);
    for (let i = 0; i < 5; i++) points.push([...centre]);
  }
  return points;
}

function jitter(points: number[][], random: () => number, sigma: number): number[][] {
  return points.map((p) => p.map((c) => c + gaussian(random) * sigma));
}

export interface ViewSubmission {
  width: number;
  height: number;
  landmarks: number[][];
  augmented: number[][][];
  blendshapes: Record<string, number>;
  liveness: boolean;
}

export function syntheticViews(): Record<"front" | "left" | "right", ViewSubmission> {
  const face = sampleFace();
  const random = prng(7);
  const view = (yaw: number, pitch: number, roll: number): ViewSubmission => {
    const landmarks = project(face, yaw, pitch, roll);
    return {
      width: WIDTH,
      height: HEIGHT,
      landmarks,
      // Stand-in for test-time augmentation: eight slightly perturbed landmark sets.
      augmented: Array.from({ length: 8 }, () => jitter(landmarks, random, 0.3)),
      blendshapes: {},
      liveness: false,
    };
  };
  return { front: view(1.4, -1.1, 0.7), left: view(-46, 2, -1), right: view(45, -1.5, 1.2) };
}
