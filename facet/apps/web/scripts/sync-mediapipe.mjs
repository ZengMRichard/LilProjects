// Copies the MediaPipe WASM runtime out of node_modules and fetches the face-landmarker model,
// so the capture screen loads both from this origin and never needs a third-party CDN at run time.
// If the model cannot be fetched (offline), the app falls back to Google's model URL in the browser.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";

const wasmSource = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
const wasmTarget = join(root, "public", "mediapipe", "wasm");
mkdirSync(wasmTarget, { recursive: true });
cpSync(wasmSource, wasmTarget, { recursive: true });

const modelDir = join(root, "public", "models");
const modelPath = join(modelDir, "face_landmarker.task");
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

if (existsSync(modelPath) && sha(readFileSync(modelPath)) === MODEL_SHA256) {
  console.log("mediapipe: runtime copied, model already present");
} else {
  try {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (sha(buffer) !== MODEL_SHA256) throw new Error("checksum mismatch");
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(modelPath, buffer);
    console.log(`mediapipe: runtime copied, model downloaded (${(buffer.length / 1e6).toFixed(1)} MB)`);
  } catch (error) {
    console.warn(
      `mediapipe: could not fetch the face model (${error.message}); the browser will load it from Google's CDN instead`,
    );
  }
}
