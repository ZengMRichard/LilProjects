"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type Capture, CaptureFlow } from "@/components/capture/capture-flow";
import { AppShell, ErrorNote } from "@/components/chrome";
import { IconArrow, IconCamera, IconCheck, IconFlask, Spinner } from "@/components/icons";
import { SupportCard } from "@/components/report/sections";
import { ApiError, api } from "@/lib/api/client";
import { useCaptureProtocol } from "@/lib/api/hooks";
import type { Goal, Me, Scan, ScanCreated, Support, ViewName } from "@/lib/api/types";
import { LANDMARK_MODEL_VERSION } from "@/lib/face/landmarker";
import { SYNTHETIC_MODEL_VERSION, syntheticViews, type ViewSubmission } from "@/lib/face/synthetic";
import { cx, formatDate } from "@/lib/format";

const GOALS: { key: Goal; label: string; hint: string }[] = [
  { key: "skin", label: "Skin", hint: "Texture, tone, under-eye" },
  { key: "jaw", label: "Jaw and chin", hint: "Proportions and posture" },
  { key: "style", label: "Style", hint: "Hair, brows, facial hair" },
  { key: "general", label: "Just curious", hint: "Show me everything" },
];
const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
const PREP = [
  "Take off glasses and pull hair back from your forehead and ears.",
  "Face a window or a lamp, so light falls evenly on both cheeks.",
  "Hold the camera at eye level, about an arm's length away.",
  "Relax your face: mouth closed, no smile.",
];

type Step =
  | { name: "context" }
  | { name: "support"; created: ScanCreated; support: Support }
  | { name: "capture"; created: ScanCreated }
  | { name: "working"; label: string }
  | { name: "rejected"; reasons: string[] }
  | { name: "failed"; message: string };

function ScanFlow({ me }: { me: Me }) {
  const router = useRouter();
  const client = useQueryClient();
  const protocol = useCaptureProtocol();
  const [step, setStep] = useState<Step>({ name: "context" });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [note, setNote] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const biometric = me.consents.find((c) => c.type === "biometric_processing");
  const onboarded = me.age_verified && Boolean(biometric?.granted);
  useEffect(() => {
    if (!onboarded && !me.age_blocked) router.replace("/onboarding?next=/scan");
  }, [onboarded, me.age_blocked, router]);

  const fail = (caught: unknown) =>
    setStep({
      name: "failed",
      message: caught instanceof ApiError ? caught.message : "Something went wrong.",
    });

  const awaitReport = useCallback(
    async (scanId: string) => {
      setStep({ name: "working", label: "Measuring your scan" });
      for (let attempt = 0; attempt < 200; attempt++) {
        const scan = await api<Scan>(`/v1/scans/${scanId}`);
        if (scan.status === "complete" && scan.report_id) {
          await client.invalidateQueries();
          router.push(`/report/${scan.report_id}`);
          return;
        }
        if (scan.status === "rejected") return setStep({ name: "rejected", reasons: scan.reject_reasons });
        if (scan.status === "failed")
          return setStep({ name: "failed", message: scan.error ?? "Processing failed." });
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      setStep({ name: "failed", message: "Processing is taking too long. Check Reports in a minute." });
    },
    [client, router],
  );

  async function createScan(source: "camera" | "synthetic"): Promise<ScanCreated | null> {
    setBusy(true);
    setError(null);
    try {
      return await api<ScanCreated>("/v1/scans", {
        method: "POST",
        json: { source, goals, goal_note: note.trim() || null, age_range: ageRange || null },
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit(scanId: string, modelVersion: string, views: Record<string, ViewSubmission>) {
    await api<Scan>(`/v1/scans/${scanId}/submit`, {
      method: "POST",
      json: { model_version: modelVersion, views },
    });
    await awaitReport(scanId);
  }

  async function startCamera() {
    const created = await createScan("camera");
    if (!created) return;
    setStep(
      created.support ? { name: "support", created, support: created.support } : { name: "capture", created },
    );
  }

  async function startSynthetic() {
    const created = await createScan("synthetic");
    if (!created) return;
    try {
      await submit(created.scan.id, SYNTHETIC_MODEL_VERSION, syntheticViews());
    } catch (caught) {
      fail(caught);
    }
  }

  async function finishCapture(created: ScanCreated, captures: Record<string, Capture>) {
    try {
      setStep({ name: "working", label: "Uploading your photos" });
      const views: Record<string, ViewSubmission> = {};
      for (const [view, capture] of Object.entries(captures)) {
        const response = await fetch(created.uploads[view]!, {
          method: "PUT",
          body: capture.blob,
          headers: { "content-type": "image/jpeg" },
        });
        if (!response.ok) throw new ApiError(response.status, `The ${view} photo could not be uploaded.`);
        const { blob: _blob, previewUrl, ...submission } = capture;
        URL.revokeObjectURL(previewUrl);
        views[view] = submission;
      }
      await submit(created.scan.id, LANDMARK_MODEL_VERSION, views);
    } catch (caught) {
      fail(caught);
    }
  }

  if (me.age_blocked) {
    return (
      <ErrorNote>
        Facet is only for people aged 18 or older, so scanning is not available on this account.
      </ErrorNote>
    );
  }
  if (!onboarded) return null;

  if (step.name === "capture") {
    if (!protocol.data) return <Working label="Loading the capture protocol" />;
    return (
      <CaptureFlow
        protocol={protocol.data}
        views={protocol.data.captured_views as ViewName[]}
        onComplete={(captures) => void finishCapture(step.created, captures)}
        onCancel={() => setStep({ name: "context" })}
      />
    );
  }

  if (step.name === "support") {
    return (
      <div className="space-y-6">
        <SupportCard support={step.support} />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep({ name: "capture", created: step.created })}
          >
            Continue to capture
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/reports")}>
            Not today
          </button>
        </div>
      </div>
    );
  }

  if (step.name === "working") return <Working label={step.label} />;

  if (step.name === "rejected") {
    return (
      <div className="card p-8">
        <h2 className="text-xl font-medium">This scan did not pass the quality check</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          Nothing was measured, and the photos from this attempt have been deleted. Here is what to adjust:
        </p>
        <ul className="mt-5 space-y-2 text-sm text-fg-2">
          {step.reasons.map((reason) => (
            <li key={reason} className="rounded-lg border border-line px-4 py-3">
              {reason}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary mt-6" onClick={() => setStep({ name: "context" })}>
          Try again
        </button>
      </div>
    );
  }

  if (step.name === "failed") {
    return (
      <div className="space-y-5">
        <ErrorNote>{step.message}</ErrorNote>
        <button type="button" className="btn btn-secondary" onClick={() => setStep({ name: "context" })}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="card card-raised space-y-8 p-6 md:p-8">
        <fieldset>
          <legend className="text-[15px] font-medium">What are you hoping to learn?</legend>
          <p className="mt-1 text-sm text-fg-3">Optional. It only changes the order of your routine plan.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {GOALS.map((goal) => {
              const selected = goals.includes(goal.key);
              return (
                <label
                  key={goal.key}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
                    selected
                      ? "border-powder-300/50 bg-powder-300/[0.07]"
                      : "border-line hover:border-line-2",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() =>
                      setGoals(selected ? goals.filter((g) => g !== goal.key) : [...goals, goal.key])
                    }
                  />
                  <span
                    className={cx(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      selected ? "border-powder-300 bg-powder-300 text-black" : "border-line-3",
                    )}
                    aria-hidden="true"
                  >
                    {selected && <IconCheck size={13} strokeWidth={2.5} />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{goal.label}</span>
                    <span className="block text-xs text-fg-3">{goal.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="block space-y-2">
          <span className="text-[15px] font-medium">Anything else about your goals?</span>
          <span className="block text-sm text-fg-3">
            Optional. Your words are read once and never stored.
          </span>
          <textarea
            className="field"
            name="goal_note"
            rows={3}
            maxLength={600}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <label className="block max-w-xs space-y-2">
          <span className="text-[15px] font-medium">Age range</span>
          <span className="block text-sm text-fg-3">Optional.</span>
          <select
            className="field"
            name="age_range"
            value={ageRange}
            onChange={(event) => setAgeRange(event.target.value)}
          >
            <option value="">Prefer not to say</option>
            {AGE_RANGES.map((range) => (
              <option key={range} value={range}>
                {range}
              </option>
            ))}
          </select>
        </label>

        {error && <ErrorNote>{error}</ErrorNote>}
        {me.next_scan_at && (
          <p className="rounded-xl border border-line-2 p-4 text-sm leading-relaxed text-fg-2">
            Scans are limited to one every {me.scan_min_interval_days} days, so that a re-scan shows real
            change rather than day-to-day noise. Your next scan opens on{" "}
            <span className="text-fg num">{formatDate(me.next_scan_at)}</span>.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || Boolean(me.next_scan_at)}
            onClick={startCamera}
          >
            {busy ? <Spinner /> : <IconCamera size={17} />}
            Start camera capture <IconArrow size={16} />
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={startSynthetic}>
            <IconFlask size={16} />
            Use the synthetic sample
          </button>
        </div>
        <p className="text-xs leading-relaxed text-fg-3">
          The synthetic sample runs the whole pipeline on a model face instead of yours, with no camera and no
          photo. Its report is labelled as synthetic.
        </p>
      </div>

      <aside className="card h-fit p-6">
        <p className="eyebrow">Before you start</p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-fg-2">
          {PREP.map((line) => (
            <li key={line} className="flex gap-3">
              <IconCheck size={16} className="mt-0.5 shrink-0 text-powder-300" />
              {line}
            </li>
          ))}
        </ul>
        <div className="hairline my-5" />
        <p className="text-[13px] leading-relaxed text-fg-3">
          Three views are taken automatically: front, left and right. You will be asked to blink once, which
          helps confirm a live capture.
        </p>
      </aside>
    </div>
  );
}

function Working({ label }: { label: string }) {
  return (
    <div
      className="card flex min-h-[22rem] flex-col items-center justify-center gap-5 p-8 text-center"
      role="status"
    >
      <span className="relative flex size-16 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full border border-powder-300/40"
          style={{ animation: "pulse-ring 1.6s ease-out infinite" }}
        />
        <span className="text-powder-300">
          <Spinner size={28} />
        </span>
      </span>
      <p className="text-lg font-medium">{label}</p>
      <p className="max-w-sm text-sm text-fg-3">
        Quality check, landmarks, metrics, then the written report.
      </p>
    </div>
  );
}

export default function ScanPage() {
  return (
    <AppShell
      title="New scan"
      intro="Three guided photos, measured in under two minutes. You stay in control of what is kept."
    >
      {(me) => <ScanFlow me={me} />}
    </AppShell>
  );
}
