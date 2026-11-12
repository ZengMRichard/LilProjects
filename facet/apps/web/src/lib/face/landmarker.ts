// Loads the MediaPipe face landmarker in the browser. Frames are processed on the device.
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

export const LANDMARK_MODEL_VERSION = "mediapipe-face-landmarker-float16-1 (on-device)";
const LOCAL_MODEL = "/models/face_landmarker.task";
const REMOTE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface Landmarkers {
  video: FaceLandmarker;
  image: FaceLandmarker;
  delegate: "GPU" | "CPU";
  close(): void;
}

async function modelPath(): Promise<string> {
  try {
    const head = await fetch(LOCAL_MODEL, { method: "HEAD" });
    const type = head.headers.get("content-type") ?? "";
    if (head.ok && !type.includes("text/html")) return LOCAL_MODEL;
  } catch {
    // fall through
  }
  return REMOTE_MODEL;
}

export async function loadLandmarkers(): Promise<Landmarkers> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const path = await modelPath();
  const create = (delegate: "GPU" | "CPU", runningMode: "VIDEO" | "IMAGE") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: path, delegate },
      runningMode,
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let delegate: "GPU" | "CPU" = "GPU";
  let video: FaceLandmarker;
  let image: FaceLandmarker;
  try {
    video = await create("GPU", "VIDEO");
    image = await create("GPU", "IMAGE");
  } catch {
    delegate = "CPU";
    video = await create("CPU", "VIDEO");
    image = await create("CPU", "IMAGE");
  }
  return {
    video,
    image,
    delegate,
    close() {
      video.close();
      image.close();
    },
  };
}

export interface Detection {
  /** 478 landmarks in image pixels: x right, y down, z in pixels (smaller is closer). */
  points: number[][];
  blendshapes: Record<string, number>;
}

export function toDetection(result: FaceLandmarkerResult, width: number, height: number): Detection | null {
  const face = result.faceLandmarks?.[0];
  if (!face || face.length < 468) return null;
  const points = face.map((p) => [p.x * width, p.y * height, p.z * width]);
  const blendshapes: Record<string, number> = {};
  for (const category of result.faceBlendshapes?.[0]?.categories ?? []) {
    blendshapes[category.categoryName] = category.score;
  }
  return { points, blendshapes };
}
