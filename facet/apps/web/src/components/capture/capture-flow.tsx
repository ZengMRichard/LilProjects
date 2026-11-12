"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCheck, IconDot, IconX, Spinner } from "@/components/icons";
import type { CaptureProtocol, ViewName } from "@/lib/api/types";
import { type Landmarkers, loadLandmarkers, toDetection } from "@/lib/face/landmarker";
import { frameGeometry } from "@/lib/face/pose";
import {
  assessFrame,
  blendshapeHints,
  type FrameAssessment,
  type ImageStats,
  imageStats,
  viewTarget,
} from "@/lib/face/quality";
import type { ViewSubmission } from "@/lib/face/synthetic";
import { runAugmentations } from "@/lib/face/tta";
import { cx } from "@/lib/format";

export interface Capture extends ViewSubmission {
  blob: Blob;
  previewUrl: string;
}

interface Props {
  protocol: CaptureProtocol;
  views: ViewName[];
  onComplete: (captures: Record<string, Capture>) => void;
  onCancel: () => void;
}

const VIEW_TITLE: Record<ViewName, string> = { front: "Front", left: "Left side", right: "Right side" };
const STABLE_FRAMES = 14;

type Phase = "starting" | "live" | "processing" | "error";

/** Guided multi-angle capture. Frames are analysed on the device; nothing leaves it until submit. */
export function CaptureFlow({ protocol, views, onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [assessment, setAssessment] = useState<FrameAssessment | null>(null);
  const [stable, setStable] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [captures, setCaptures] = useState<Record<string, Capture>>({});

  // Mutable state for the frame loop, kept out of React so it never re-renders at 30 fps.
  const loop = useRef({
    landmarkers: null as Landmarkers | null,
    viewIndex: 0,
    stable: 0,
    blinked: false,
    eyesClosed: false,
    frame: 0,
    stats: null as ImageStats | null,
    busy: false,
    lastPaint: 0,
    lastVideoTime: -1,
    captures: {} as Record<string, Capture>,
    scratch: null as HTMLCanvasElement | null,
    stopped: false,
  });
  const view = views[viewIndex]!;

  const finishCapture = useCallback(
    async (video: HTMLVideoElement) => {
      const state = loop.current;
      const landmarkers = state.landmarkers;
      if (!landmarkers) return;
      state.busy = true;
      setPhase("processing");
      const currentView = views[state.viewIndex]!;
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d")!.drawImage(video, 0, 0);
      const retry = (message: string) => {
        state.stable = 0;
        state.busy = false;
        setStable(0);
        setNote(message);
        setPhase("live");
      };
      const detection = toDetection(landmarkers.image.detect(frame), frame.width, frame.height);
      if (!detection) return retry("Lost your face for a moment. Hold still and try again.");
      // Re-check the still itself: this is the frame the server will judge.
      const ipdPx = frameGeometry(detection.points).ipdPx;
      const stats = imageStats(
        frame,
        frame.width,
        frame.height,
        detection.points,
        ipdPx,
        currentView,
        state.scratch!,
      );
      const verdict = assessFrame(currentView, detection, stats, protocol, state.blinked);
      if (!verdict.ready) return retry(`${verdict.prompt}. Retaking.`);
      const augmented = runAugmentations(
        landmarkers.image,
        frame,
        verdict.geometry.ipdPx,
        protocol.tta_count,
      );
      const blob = await new Promise<Blob | null>((resolve) => frame.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) return retry("Could not save the frame. Retaking.");
      const capture: Capture = {
        blob,
        previewUrl: URL.createObjectURL(blob),
        width: frame.width,
        height: frame.height,
        landmarks: detection.points,
        augmented,
        blendshapes: blendshapeHints(detection.blendshapes),
        liveness: state.blinked,
      };
      state.captures = { ...state.captures, [currentView]: capture };
      setCaptures(state.captures);
      setNote(null);
      if (state.viewIndex + 1 >= views.length) {
        state.stopped = true;
        onComplete(state.captures);
        return;
      }
      state.viewIndex += 1;
      state.stable = 0;
      state.stats = null;
      state.busy = false;
      setViewIndex(state.viewIndex);
      setStable(0);
      setAssessment(null);
      setPhase("live");
    },
    [onComplete, protocol, views],
  );

  useEffect(() => {
    const state = loop.current;
    state.stopped = false;
    state.scratch = document.createElement("canvas");
    let stream: MediaStream | null = null;
    let raf = 0;

    const tick = () => {
      if (state.stopped) return;
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const overlay = overlayRef.current;
      const landmarkers = state.landmarkers;
      if (!video || !overlay || !landmarkers || state.busy || video.readyState < 2) return;
      if (video.currentTime === state.lastVideoTime) return;
      state.lastVideoTime = video.currentTime;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
      }
      const context = overlay.getContext("2d")!;
      context.clearRect(0, 0, width, height);
      const currentView = views[state.viewIndex]!;
      const detection = toDetection(
        landmarkers.video.detectForVideo(video, performance.now()),
        width,
        height,
      );
      const now = performance.now();
      if (!detection) {
        state.stable = 0;
        if (now - state.lastPaint > 120) {
          state.lastPaint = now;
          setAssessment(null);
          setStable(0);
        }
        return;
      }

      // Liveness: one full blink, eyes closed then open again.
      const blinkL = detection.blendshapes.eyeBlinkLeft ?? 0;
      const blinkR = detection.blendshapes.eyeBlinkRight ?? 0;
      if (blinkL > 0.5 && blinkR > 0.5) state.eyesClosed = true;
      else if (state.eyesClosed && blinkL < 0.25 && blinkR < 0.25) {
        state.eyesClosed = false;
        state.blinked = true;
      }

      state.frame += 1;
      const quick = assessFrame(currentView, detection, state.stats, protocol, state.blinked);
      if (state.frame % 3 === 0 || !state.stats) {
        state.stats = imageStats(
          video,
          width,
          height,
          detection.points,
          quick.geometry.ipdPx,
          currentView,
          state.scratch!,
        );
      }
      const verdict = assessFrame(currentView, detection, state.stats, protocol, state.blinked);
      state.stable = verdict.ready ? state.stable + 1 : 0;

      // Mesh points, drawn large enough to read over a photo.
      const size = Math.max(2.6, width / 340);
      context.fillStyle = verdict.ready ? "rgba(238, 247, 253, 0.95)" : "rgba(168, 211, 242, 0.8)";
      for (let i = 0; i < 468; i += 1) {
        const p = detection.points[i]!;
        context.beginPath();
        context.arc(p[0]!, p[1]!, size / 2, 0, Math.PI * 2);
        context.fill();
      }

      if (now - state.lastPaint > 100) {
        state.lastPaint = now;
        setAssessment(verdict);
        setStable(state.stable);
      }
      if (state.stable >= STABLE_FRAMES) void finishCapture(video);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser has no camera access.");
        const [media, landmarkers] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
          loadLandmarkers(),
        ]);
        if (state.stopped) {
          for (const track of media.getTracks()) track.stop();
          landmarkers.close();
          return;
        }
        stream = media;
        state.landmarkers = landmarkers;
        const video = videoRef.current!;
        video.srcObject = media;
        await video.play();
        setPhase("live");
        raf = requestAnimationFrame(tick);
      } catch (caught) {
        const name = caught instanceof DOMException ? caught.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site, then try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : caught instanceof Error
                ? caught.message
                : "The camera could not be started.",
        );
        setPhase("error");
      }
    })();

    return () => {
      state.stopped = true;
      cancelAnimationFrame(raf);
      for (const track of stream?.getTracks() ?? []) track.stop();
      state.landmarkers?.close();
      state.landmarkers = null;
    };
  }, [finishCapture, protocol, views]);

  const windows = protocol.views[view]!;
  const pose = assessment?.geometry.pose;
  const prompt =
    phase === "starting"
      ? "Starting the camera and loading the face mesh"
      : phase === "processing"
        ? "Measuring this frame"
        : assessment
          ? assessment.prompt
          : "Bring your face into the frame";

  if (phase === "error") {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-xl font-medium">The camera is not available</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-2">{error}</p>
        <button type="button" className="btn btn-secondary mt-6" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
      <div>
        <div className="card relative overflow-hidden bg-black">
          <div className="relative mx-auto aspect-[4/3] w-full">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 size-full -scale-x-100 object-cover"
            />
            <canvas ref={overlayRef} className="absolute inset-0 size-full -scale-x-100 object-cover" />
            <Corners active={Boolean(assessment?.ready)} />
            {phase !== "live" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <span className="flex items-center gap-3 text-sm text-fg-2">
                  <Spinner /> {prompt}
                </span>
              </div>
            )}
          </div>
          <div className="border-t border-line p-5">
            <p className="text-lg font-medium" role="status" aria-live="polite" data-testid="capture-prompt">
              {prompt}
            </p>
            {note && <p className="mt-1 text-sm text-warn">{note}</p>}
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-ink-600" aria-hidden="true">
              <div
                className="h-full rounded-full bg-powder-300 transition-[width] duration-100"
                style={{ width: `${Math.min(100, (stable / STABLE_FRAMES) * 100)}%` }}
              />
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-fg-3">
          The preview is mirrored. Frames are analysed on this device; photos are uploaded only after all
          three are taken.
        </p>
      </div>

      <div className="space-y-4">
        <ol className="card divide-y divide-line">
          {views.map((name, index) => (
            <li
              key={name}
              className={cx("flex items-center gap-4 p-4", index === viewIndex && "bg-powder-300/[0.04]")}
            >
              {captures[name] ? (
                // biome-ignore lint/performance/noImgElement: a local object URL, not a remote asset
                <img
                  src={captures[name].previewUrl}
                  alt=""
                  className="size-12 -scale-x-100 rounded-lg object-cover"
                />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg border border-line text-xs text-fg-3 num">
                  0{index + 1}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{VIEW_TITLE[name]}</p>
                <p className="truncate text-xs text-fg-3">{viewTarget(name)}</p>
              </div>
              {captures[name] && <IconCheck className="text-good" size={18} />}
            </li>
          ))}
        </ol>

        <div className="card p-5">
          <p className="eyebrow mb-4">Live checks</p>
          <ul className="space-y-2.5 text-sm">
            {(assessment?.checks ?? []).map((check) => (
              <li key={check.key} className="flex items-center gap-3">
                {check.state === "pass" ? (
                  <IconCheck size={16} className="text-good" />
                ) : check.state === "fail" ? (
                  <IconX size={16} className="text-warn" />
                ) : (
                  <IconDot size={16} className="text-fg-3" />
                )}
                <span className={check.state === "pass" ? "text-fg-2" : "text-fg"}>{check.label}</span>
                <span className="sr-only">{check.state}</span>
              </li>
            ))}
            {!assessment && <li className="text-fg-3">Waiting for a face</li>}
          </ul>
        </div>

        <div className="card space-y-4 p-5">
          <p className="eyebrow">Head angle</p>
          <Gauge
            label="Turn"
            value={pose?.yaw}
            window={windows.yaw}
            span={view === "front" ? 25 : 75}
            mirrored
          />
          <Gauge label="Nod" value={pose?.pitch} window={windows.pitch} span={25} />
          <Gauge label="Tilt" value={pose?.roll} window={windows.roll} span={25} />
        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel capture
        </button>
      </div>
    </div>
  );
}

function Corners({ active }: { active: boolean }) {
  const tone = active ? "border-powder-100" : "border-powder-300/50";
  const base = `pointer-events-none absolute size-8 transition-colors ${tone}`;
  return (
    <div aria-hidden="true">
      <span className={`${base} left-4 top-4 rounded-tl-lg border-l-2 border-t-2`} />
      <span className={`${base} right-4 top-4 rounded-tr-lg border-r-2 border-t-2`} />
      <span className={`${base} bottom-4 left-4 rounded-bl-lg border-b-2 border-l-2`} />
      <span className={`${base} bottom-4 right-4 rounded-br-lg border-b-2 border-r-2`} />
    </div>
  );
}

/** A level-style gauge: the target window as a band, the current angle as a marker. */
function Gauge({
  label,
  value,
  window,
  span,
  mirrored = false,
}: {
  label: string;
  value?: number;
  window: [number, number];
  span: number;
  /** The preview is mirrored, so a turn to the subject's right should move the marker right. */
  mirrored?: boolean;
}) {
  const sign = mirrored ? -1 : 1;
  const at = (v: number) => `${((Math.max(-span, Math.min(span, sign * v)) + span) / (2 * span)) * 100}%`;
  const inside = value !== undefined && value >= window[0] && value <= window[1];
  const bandStart = mirrored ? window[1] : window[0];
  const readout =
    value === undefined
      ? "—"
      : mirrored
        ? `${Math.abs(value).toFixed(1)}° ${value > 0.05 ? "left" : value < -0.05 ? "right" : ""}`.trim()
        : `${value >= 0 ? "+" : ""}${value.toFixed(1)}°`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-fg-2">{label}</span>
        <span className="text-fg num">{readout}</span>
      </div>
      <div className="relative h-4" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-2" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-powder-800"
          style={{ left: at(bandStart), width: `${((window[1] - window[0]) / (2 * span)) * 100}%` }}
        />
        {value !== undefined && (
          <div
            className={cx(
              "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-900 transition-[left] duration-100",
              inside ? "bg-powder-100" : "bg-warn",
            )}
            style={{ left: at(value) }}
          />
        )}
      </div>
    </div>
  );
}
