import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonical, EDGES } from "./canonical";
import { estimatePose, frameGeometry, toFaceSpace } from "./pose";
import { syntheticViews } from "./synthetic";

interface PoseCase {
  name: string;
  points: number[][];
  expected: { yaw: number; pitch: number; roll: number; ipd_px: number; mouth_gap: number };
}

const cases: PoseCase[] = JSON.parse(
  readFileSync(new URL("../../../../../packages/fixtures/pose_cases.json", import.meta.url), "utf8"),
);

describe("pose parity with the Python metrics library", () => {
  it.each(cases)("$name", ({ points, expected }) => {
    const geometry = frameGeometry(points);
    expect(geometry.pose.yaw).toBeCloseTo(expected.yaw, 6);
    expect(geometry.pose.pitch).toBeCloseTo(expected.pitch, 6);
    expect(geometry.pose.roll).toBeCloseTo(expected.roll, 6);
    expect(geometry.ipdPx).toBeCloseTo(expected.ipd_px, 6);
    expect(geometry.mouthGap).toBeCloseTo(expected.mouth_gap, 6);
  });
});

describe("canonical mesh", () => {
  it("has the expected shape", () => {
    expect(canonical.vertices).toHaveLength(468);
    expect(canonical.pairs).toHaveLength(220);
    expect(EDGES.length).toBeGreaterThan(1200);
  });

  it("is frontal at rest", () => {
    const pose = estimatePose(canonical.vertices);
    expect(pose.yaw).toBeCloseTo(0, 9);
    expect(pose.pitch).toBeCloseTo(0, 9);
    expect(pose.roll).toBeCloseTo(0, 9);
  });
});

describe("synthetic sample", () => {
  const views = syntheticViews();

  it("is deterministic and lands inside the capture windows", () => {
    expect(syntheticViews().front.landmarks).toEqual(views.front.landmarks);
    const front = estimatePose(toFaceSpace(views.front.landmarks));
    expect(Math.abs(front.yaw)).toBeLessThan(5);
    expect(Math.abs(front.pitch)).toBeLessThan(5);
    expect(Math.abs(front.roll)).toBeLessThan(5);
    // "left" shows the subject's left cheek: a turn toward their right, so yaw is negative.
    expect(estimatePose(toFaceSpace(views.left.landmarks)).yaw).toBeLessThan(-35);
    expect(estimatePose(toFaceSpace(views.right.landmarks)).yaw).toBeGreaterThan(35);
  });

  it("carries 478 landmarks, eight augmentations and a closed mouth", () => {
    expect(views.front.landmarks).toHaveLength(478);
    expect(views.front.augmented).toHaveLength(8);
    expect(frameGeometry(views.front.landmarks).mouthGap).toBeLessThan(0.08);
    expect(frameGeometry(views.front.landmarks).ipdPx).toBeGreaterThan(70);
  });
});

import { AUGMENTATIONS, augmentationTransform, unmapPoints } from "./tta";

describe("test-time augmentation", () => {
  it("maps augmented landmarks back onto the original frame", () => {
    const original = [
      [100, 200, -12],
      [640, 360, 0],
      [900.5, 77.25, 31],
    ];
    for (const augmentation of AUGMENTATIONS) {
      const t = augmentationTransform(augmentation, 1280, 720, 140);
      const moved = original.map((p) => [p[0]! * t.scale + t.tx, p[1]! * t.scale + t.ty, p[2]! * t.scale]);
      const back = unmapPoints(moved, t);
      back.forEach((p, i) => {
        expect(p[0]).toBeCloseTo(original[i]![0]!, 9);
        expect(p[1]).toBeCloseTo(original[i]![1]!, 9);
        expect(p[2]).toBeCloseTo(original[i]![2]!, 9);
      });
    }
    expect(AUGMENTATIONS).toHaveLength(8);
  });
});
