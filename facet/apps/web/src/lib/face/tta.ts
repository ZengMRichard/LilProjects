// Test-time augmentation (spec section 4, step 5): the landmark model runs on eight slightly
// altered copies of the captured frame. Landmarks are mapped back to the original frame, and the
// server turns their spread into each metric's confidence interval.
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { toDetection } from "./landmarker";

interface Augmentation {
  dx: number; // shift, as a fraction of the inter-pupillary distance
  dy: number;
  scale: number;
  brightness: number;
}

export const AUGMENTATIONS: Augmentation[] = [
  { dx: 0.04, dy: 0, scale: 1, brightness: 1 },
  { dx: -0.04, dy: 0, scale: 1, brightness: 1 },
  { dx: 0, dy: 0.04, scale: 1, brightness: 1 },
  { dx: 0, dy: -0.04, scale: 1, brightness: 1 },
  { dx: 0, dy: 0, scale: 1.04, brightness: 1 },
  { dx: 0, dy: 0, scale: 0.96, brightness: 1 },
  { dx: 0, dy: 0, scale: 1, brightness: 1.12 },
  { dx: 0, dy: 0, scale: 1, brightness: 0.88 },
];

/** The affine map applied to the frame: p' = scale * p + offset. */
export function augmentationTransform(a: Augmentation, width: number, height: number, ipdPx: number) {
  return {
    scale: a.scale,
    tx: (width / 2) * (1 - a.scale) + a.dx * ipdPx,
    ty: (height / 2) * (1 - a.scale) + a.dy * ipdPx,
  };
}

/** Map landmarks found in the augmented frame back to original-frame pixels. */
export function unmapPoints(points: number[][], t: { scale: number; tx: number; ty: number }): number[][] {
  return points.map((p) => [(p[0]! - t.tx) / t.scale, (p[1]! - t.ty) / t.scale, p[2]! / t.scale]);
}

export function runAugmentations(
  landmarker: FaceLandmarker,
  frame: HTMLCanvasElement,
  ipdPx: number,
  count: number,
): number[][][] {
  const { width, height } = frame;
  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const context = work.getContext("2d");
  if (!context) return [];
  const out: number[][][] = [];
  for (const augmentation of AUGMENTATIONS.slice(0, count)) {
    const t = augmentationTransform(augmentation, width, height, ipdPx);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.setTransform(t.scale, 0, 0, t.scale, t.tx, t.ty);
    context.drawImage(frame, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (augmentation.brightness !== 1) {
      const lighter = augmentation.brightness > 1;
      context.fillStyle = lighter ? "#fff" : "#000";
      context.globalAlpha = Math.abs(augmentation.brightness - 1);
      context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
    }
    const detection = toDetection(landmarker.detect(work), width, height);
    if (detection) out.push(unmapPoints(detection.points, t));
  }
  return out;
}
