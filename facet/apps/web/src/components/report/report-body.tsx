"use client";

import { type ReactNode, useState } from "react";
import { ResultsDisclaimer } from "@/components/chrome";
import { IconLock } from "@/components/icons";
import type { PlanItem, Report } from "@/lib/api/types";
import { cx, formatDate } from "@/lib/format";
import { FaceFigure, HeatLegend, type Overlay } from "./face-figure";
import { MetricCard } from "./metric-card";
import { SegmentedBar } from "./range-bar";
import { Opener, PlanList, SectionHeading, SkinSnapshot, SupportCard } from "./sections";

interface Props {
  report: Report;
  /** "print" lays everything out expanded for the PDF. */
  mode?: "screen" | "print";
  photoUrl?: string | null;
  actions?: ReactNode;
  upgrade?: ReactNode;
  onPlanStatus?: (id: string, status: PlanItem["status"]) => void;
  planBusyId?: string | null;
}

const TIER_LABEL = { free_preview: "Free preview", full: "Full report", premium: "Premium report" };

export function ReportBody({
  report,
  mode = "screen",
  photoUrl,
  actions,
  upgrade,
  onPlanStatus,
  planBusyId,
}: Props) {
  const print = mode === "print";
  const full = report.tier !== "free_preview";
  const [overlay, setOverlay] = useState<Overlay>("proportions");
  const [showPhoto, setShowPhoto] = useState(true);

  const usePhoto = Boolean(photoUrl) && showPhoto && report.geometry.image.width != null;
  const points: [number, number][] = usePhoto
    ? report.geometry.image.points
    : report.geometry.frontal.map(([x, y]) => [x, -y]);
  const photoSize = usePhoto
    ? { width: report.geometry.image.width!, height: report.geometry.image.height! }
    : undefined;
  const overlays: Overlay[] = report.symmetry ? ["proportions", "symmetry", "mesh"] : ["proportions", "mesh"];
  const fifths = report.figures.fifths;
  const shape = report.face_shape;

  return (
    <div className="space-y-14" data-report-tier={report.tier}>
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill pill-accent">{TIER_LABEL[report.tier]}</span>
            {report.source === "synthetic" && <span className="pill">Synthetic sample, not a real face</span>}
            {report.reference_group.provisional && <span className="pill">Provisional ranges</span>}
          </div>
          <h1 className="text-3xl font-medium md:text-[2.75rem] md:leading-[1.05]">Your report</h1>
          <p className="text-sm text-fg-2">
            <span className="num">{formatDate(report.created_at)}</span> · Compared with:{" "}
            {report.reference_group.label.toLowerCase()}
          </p>
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {report.support && <SupportCard support={report.support} />}

      <Opener report={report} />

      <section aria-labelledby="overview-title">
        <SectionHeading id="overview-title" eyebrow="Overview" title="Shape and proportions">
          The lines are drawn from the same landmarks the numbers use, so you can see exactly what was
          measured.
        </SectionHeading>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="card overflow-hidden">
            {!print && (
              <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex gap-1" role="tablist" aria-label="Overlay">
                  {overlays.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={overlay === option}
                      onClick={() => setOverlay(option)}
                      className={cx(
                        "rounded-full px-3 py-1 text-xs capitalize transition-colors",
                        overlay === option ? "bg-powder-300/12 text-powder-100" : "text-fg-3 hover:text-fg-2",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {photoUrl && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
                    <input
                      type="checkbox"
                      checked={showPhoto}
                      onChange={(event) => setShowPhoto(event.target.checked)}
                      className="accent-powder-300"
                    />
                    Show photo
                  </label>
                )}
              </div>
            )}
            <div className="relative bg-black">
              <FaceFigure
                points={points}
                overlay={print ? "proportions" : overlay}
                pairs={report.symmetry?.pairs}
                thirds={report.figures.thirds as { middle: number; lower: number }}
                photoUrl={usePhoto ? photoUrl : null}
                photoSize={photoSize}
                className="mx-auto block max-h-[34rem] w-full"
              />
              {overlay === "symmetry" && !print && (
                <div className="absolute inset-x-0 bottom-3 flex justify-center">
                  <HeatLegend />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card print-avoid-break p-6" data-face-shape={shape.label}>
              <p className="eyebrow">Face shape</p>
              <p className="mt-2 text-4xl font-medium capitalize tracking-tight">
                {shape.label}
                {shape.runner_up && <span className="text-fg-3"> / {shape.runner_up}</span>}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-fg-2">{shape.text}</p>
              <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4 text-xs text-fg-3">
                <Stat label="Length to width" value={shape.length_to_width} />
                <Stat label="Forehead to cheek" value={shape.forehead_to_cheek} />
                <Stat label="Jaw to cheek" value={shape.jaw_to_cheek} />
              </dl>
            </div>
            <div className="card print-avoid-break space-y-6 p-6">
              <div>
                <p className="mb-3 text-[15px] font-medium">Facial fifths</p>
                <SegmentedBar
                  label="Width of the face in five parts"
                  parts={[
                    { name: "Outer face", share: fifths[0]!, tone: 0 },
                    { name: "Eye", share: fifths[1]!, tone: 1 },
                    { name: "Between the eyes", share: fifths[2]!, tone: 2 },
                    { name: "Eye", share: fifths[3]!, tone: 1 },
                    { name: "Outer face", share: fifths[4]!, tone: 0 },
                  ]}
                />
              </div>
              <div>
                <p className="mb-3 text-[15px] font-medium">Middle and lower thirds</p>
                <SegmentedBar
                  label="Height from brow line to chin in two parts"
                  parts={[
                    { name: "Middle third", share: report.figures.thirds.middle!, tone: 1 },
                    { name: "Lower third", share: report.figures.thirds.lower!, tone: 2 },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {report.regions
        .filter((region) => region.key !== "symmetry")
        .map((region) => {
          const cards = report.metrics.filter((card) => card.region === region.key);
          if (!cards.length) return null;
          return (
            <section key={region.key} aria-labelledby={`region-${region.key}`}>
              <header className="mb-5 flex items-baseline justify-between gap-4">
                <h2 id={`region-${region.key}`} className="text-xl font-medium md:text-2xl">
                  {region.label}
                </h2>
                <span className="text-xs text-fg-3 num">
                  {cards.filter((card) => !card.locked).length} of {cards.length}
                </span>
              </header>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                  <MetricCard key={card.key} card={card} expanded={print} />
                ))}
              </div>
            </section>
          );
        })}

      <section aria-labelledby="symmetry-title">
        <SectionHeading id="symmetry-title" eyebrow="Symmetry" title="Symmetry map">
          {report.symmetry?.note ??
            "How closely the two halves of your face mirror each other, region by region."}
        </SectionHeading>
        {report.symmetry ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <div className="card overflow-hidden bg-black">
              <FaceFigure
                points={report.geometry.frontal.map(([x, y]) => [x, -y])}
                overlay="symmetry"
                pairs={report.symmetry.pairs}
                className="mx-auto block max-h-[30rem] w-full"
              />
              <div className="flex justify-center border-t border-line py-3">
                <HeatLegend />
              </div>
            </div>
            <div className="space-y-4">
              <MetricCard card={report.symmetry.overall} expanded={print} />
              <div className="card print-avoid-break p-6">
                <p className="mb-4 text-[15px] font-medium">Left-right difference by region</p>
                <ul className="space-y-3.5">
                  {report.symmetry.regions.map((region) => (
                    <li
                      key={region.key}
                      className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-4 text-sm"
                      data-symmetry-region={region.key}
                    >
                      <span className="text-fg-2">{region.label}</span>
                      <span
                        className="h-2 rounded-full bg-ink-600"
                        title={`${region.label}: ${region.mean_deviation_pct.toFixed(1)}% of pupil distance`}
                      >
                        <span
                          className="block h-2 rounded-full bg-powder-400"
                          style={{
                            width: `${Math.min(100, (region.mean_deviation_pct / 6) * 100)}%`,
                            minWidth: 3,
                          }}
                        />
                      </span>
                      <span className="text-right text-fg num">{region.mean_deviation_pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-fg-3">
                  Average distance between each point and its mirror twin, as a share of the distance between
                  your pupils.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Locked>The symmetry map and the overall symmetry index are in the full report.</Locked>
        )}
      </section>

      <section aria-labelledby="skin-title">
        <SectionHeading id="skin-title" eyebrow="Skin" title="Skin snapshot" />
        <SkinSnapshot skin={report.skin} />
      </section>

      <section aria-labelledby="summary-title">
        <SectionHeading id="summary-title" eyebrow="Summary" title="How it fits together" />
        {report.summary ? (
          <div className="card card-raised print-avoid-break p-6 md:p-8">
            <p className="max-w-3xl text-[17px] leading-relaxed text-fg">{report.summary.text}</p>
            <p className="mt-4 text-xs text-fg-3">
              {report.summary.source === "llm"
                ? "Written by a language model from the measured findings only, then checked against the banned-phrase list."
                : "Written from a fixed template, so the same findings always read the same way."}
            </p>
          </div>
        ) : (
          <Locked>
            The summary of which proportions are typical and which are distinctive is in the full report.
          </Locked>
        )}
      </section>

      <section aria-labelledby="plan-title">
        <SectionHeading id="plan-title" eyebrow="Routine" title="Your routine plan" />
        <PlanList plan={report.plan} onStatus={print ? undefined : onPlanStatus} busyId={planBusyId} />
      </section>

      {upgrade}

      {full && report.unavailable.length > 0 && (
        <section aria-labelledby="unmeasured-title">
          <SectionHeading id="unmeasured-title" eyebrow="Not measured" title="What this build leaves out">
            These are in the planned metric set but cannot be measured honestly yet, so they are left blank.
          </SectionHeading>
          <ul className="grid gap-3 md:grid-cols-2">
            {report.unavailable.map((item) => (
              <li key={item.key} className="card print-avoid-break p-5">
                <p className="flex items-center justify-between text-[15px] font-medium">
                  {item.title}
                  <span className="text-fg-3 num">—</span>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg-2">{item.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="print-avoid-break text-xs leading-relaxed text-fg-3" aria-label="Method">
        <p className="eyebrow mb-3">Method</p>
        <p className="max-w-3xl">
          Landmarks come from a face mesh; every number is plain geometry on those landmarks, divided by the
          distance between your pupils so camera distance cancels out. Intervals come from re-measuring the
          same frame under small shifts and brightness changes.
        </p>
        <p className="mt-3 num">
          {Object.entries(report.versions)
            .map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`)
            .join(" · ")}
        </p>
      </section>

      <ResultsDisclaimer />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mt-1 text-base text-fg num">{value.toFixed(2)}</dd>
    </div>
  );
}

function Locked({ children }: { children: ReactNode }) {
  return (
    <div className="card flex items-center gap-4 border-dashed p-6 text-sm text-fg-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-fg-3">
        <IconLock size={16} />
      </span>
      {children}
    </div>
  );
}
