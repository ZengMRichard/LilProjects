// Live capture checks. The thresholds come from the API's capture protocol, and the pose maths is
// shared with the server, so a frame accepted here passes the server's quality gate.
import type { CaptureProtocol, ViewName } from "../api/types";
import { canonical } from "./canonical";
import type { Detection } from "./landmarker";
import { type FrameGeometry, frameGeometry } from "./pose";

export type CheckState = "pass" | "fail" | "pending";

export interface LiveCheck {
  key: string;
  label: string;
  state: CheckState;
  hint: string;
}

export interface FrameAssessment {
  geometry: FrameGeometry;
  checks: LiveCheck[];
  ready: boolean;
  /** The single most useful instruction right now. */
  prompt: string;
}

export interface ImageStats {
  luma: number;
  clipped: number;
  evenness: number | null;
  sharpness: number;
}

const AXIS_HINTS: Record<string, [string, string]> = {
  yaw: ["Turn your head a little to your left", "Turn your head a little to your right"],
  pitch: ["Lower your chin a little", "Lift your chin a little"],
  roll: ["Tilt your head toward your right shoulder", "Tilt your head toward your left shoulder"],
};

const VIEW_TARGET: Record<ViewName, string> = {
  front: "Look straight at the camera",
  left: "Turn your head to your right, so the camera sees your left cheek",
  right: "Turn your head to your left, so the camera sees your right cheek",
};

// The server applies the same thresholds to the re-encoded JPEG; a small margin here keeps a
// frame that passes on the device from failing there.
const MARGIN = 1.25;

function zoneCentroids(points: number[][], zone: string): [number, number][] {
  return canonical.zones[zone]!.map((faceIndex) => {
    const [a, b, c] = canonical.faces[faceIndex]!;
    return [
      (points[a]![0]! + points[b]![0]! + points[c]![0]!) / 3,
      (points[a]![1]! + points[b]![1]! + points[c]![1]!) / 3,
    ];
  });
}

/** Exposure, evenness and sharpness of the face region of a frame. */
export function imageStats(
  source: CanvasImageSource,
  width: number,
  height: number,
  points: number[][],
  ipdPx: number,
  view: ViewName,
  scratch: HTMLCanvasElement,
): ImageStats | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p[0]! < minX) minX = p[0]!;
    if (p[0]! > maxX) maxX = p[0]!;
    if (p[1]! < minY) minY = p[1]!;
    if (p[1]! > maxY) maxY = p[1]!;
  }
  const margin = 0.15 * (maxX - minX);
  const left = Math.max(0, Math.floor(minX - margin));
  const top = Math.max(0, Math.floor(minY - margin));
  const right = Math.min(width, Math.ceil(maxX + margin));
  const bottom = Math.min(height, Math.ceil(maxY + margin));
  const factor = Math.min(1, 120 / ipdPx);
  const w = Math.max(8, Math.round((right - left) * factor));
  const h = Math.max(8, Math.round((bottom - top) * factor));
  if (right - left < 8 || bottom - top < 8) return null;
  scratch.width = w;
  scratch.height = h;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, left, top, right - left, bottom - top, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
  }
  const sample = (zone: string) => {
    const values: number[] = [];
    for (const [x, y] of zoneCentroids(points, zone)) {
      const px = Math.round((x - left) * factor);
      const py = Math.round((y - top) * factor);
      if (px >= 0 && py >= 0 && px < w && py < h) values.push(gray[py * w + px]!);
    }
    return values;
  };
  const cheekL = sample("cheek_l");
  const cheekR = sample("cheek_r");
  const zones =
    view === "left"
      ? [...cheekL, ...sample("forehead"), ...sample("nose")]
      : view === "right"
        ? [...cheekR, ...sample("forehead"), ...sample("nose")]
        : [...cheekL, ...cheekR, ...sample("forehead"), ...sample("nose"), ...sample("chin")];
  if (zones.length < 10) return null;
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const luma = mean(zones);
  const clipped = zones.filter((v) => v > 250 || v < 8).length / zones.length;
  const evenness =
    view === "front" && cheekL.length && cheekR.length ? mean(cheekL) / Math.max(1, mean(cheekR)) : null;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = gray[i - w]! + gray[i + w]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const sharpness = count ? sumSq / count - (sum / count) ** 2 : 0;
  return { luma, clipped, evenness, sharpness };
}

export function assessFrame(
  view: ViewName,
  detection: Detection,
  stats: ImageStats | null,
  protocol: CaptureProtocol,
  blinked: boolean,
): FrameAssessment {
  const geometry = frameGeometry(detection.points);
  const windows = protocol.views[view]!;
  const checks: LiveCheck[] = [];

  let poseHint = "";
  for (const axis of ["yaw", "pitch", "roll"] as const) {
    const [low, high] = windows[axis];
    const angle = geometry.pose[axis];
    if (angle < low || angle > high) {
      poseHint =
        view !== "front" && axis === "yaw" ? VIEW_TARGET[view] : AXIS_HINTS[axis]![angle < low ? 0 : 1];
      break;
    }
  }
  checks.push({ key: "pose", label: "Head angle", state: poseHint ? "fail" : "pass", hint: poseHint });

  const close = geometry.ipdPx >= protocol.min_ipd_px * 1.05;
  checks.push({
    key: "size",
    label: "Distance",
    state: close ? "pass" : "fail",
    hint: close ? "" : "Move closer to the camera",
  });

  const smile =
    ((detection.blendshapes.mouthSmileLeft ?? 0) + (detection.blendshapes.mouthSmileRight ?? 0)) / 2;
  const jawOpen = detection.blendshapes.jawOpen ?? 0;
  const neutral =
    geometry.mouthGap <= protocol.max_mouth_gap * 0.9 &&
    smile <= protocol.max_smile * 0.85 &&
    jawOpen <= protocol.max_jaw_open * 0.85;
  checks.push({
    key: "expression",
    label: "Neutral expression",
    state: neutral ? "pass" : "fail",
    hint: neutral ? "" : "Relax your face and close your mouth",
  });

  if (stats) {
    const [lumaLow, lumaHigh] = protocol.luma_range;
    const dark = stats.luma < lumaLow + 6;
    const bright = stats.luma > lumaHigh - 6 || stats.clipped > protocol.max_clipped * 0.8;
    const [evenLow, evenHigh] = protocol.evenness_range;
    const uneven =
      stats.evenness !== null && (stats.evenness < evenLow * 1.06 || stats.evenness > evenHigh / 1.06);
    const lightHint = dark
      ? "Too dark. Face a window or a lamp"
      : bright
        ? "Too bright. Move out of direct light"
        : uneven
          ? "Uneven light. Turn to face the light source"
          : "";
    checks.push({ key: "light", label: "Lighting", state: lightHint ? "fail" : "pass", hint: lightHint });
    const sharp = stats.sharpness >= protocol.min_sharpness * MARGIN;
    checks.push({
      key: "sharp",
      label: "Sharpness",
      state: sharp ? "pass" : "fail",
      hint: sharp ? "" : "Hold still",
    });
  } else {
    checks.push({ key: "light", label: "Lighting", state: "pending", hint: "" });
    checks.push({ key: "sharp", label: "Sharpness", state: "pending", hint: "" });
  }

  if (view === "front") {
    checks.push({
      key: "live",
      label: "Live capture",
      state: blinked ? "pass" : "pending",
      hint: blinked ? "" : "Blink once",
    });
  }

  const failing = checks.find((check) => check.state === "fail");
  const pending = checks.find((check) => check.state === "pending" && check.hint);
  const ready = checks.every((check) => check.state === "pass");
  return {
    geometry,
    checks,
    ready,
    prompt: ready ? "Hold still" : (failing?.hint ?? pending?.hint ?? VIEW_TARGET[view]),
  };
}

export function blendshapeHints(blendshapes: Record<string, number>): Record<string, number> {
  return {
    smile: ((blendshapes.mouthSmileLeft ?? 0) + (blendshapes.mouthSmileRight ?? 0)) / 2,
    jaw_open: blendshapes.jawOpen ?? 0,
  };
}

export const viewTarget = (view: ViewName) => VIEW_TARGET[view];
