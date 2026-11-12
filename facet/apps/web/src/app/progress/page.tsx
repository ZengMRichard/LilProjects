"use client";

import Link from "next/link";
import { AppShell, ErrorNote, PageLoading, ResultsDisclaimer } from "@/components/chrome";
import { Trend } from "@/components/progress/trend";
import { useProgress } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

function ProgressScreen() {
  const progress = useProgress();
  if (progress.isLoading) return <PageLoading />;
  if (progress.error) return <ErrorNote>{progress.error.message}</ErrorNote>;
  const data = progress.data!;
  if (data.scans.length < 2) {
    return (
      <div className="card card-raised px-6 py-14 text-center">
        <h2 className="text-2xl font-medium">Progress needs two scans</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-2">
          {data.scans.length === 1
            ? "You have one scan so far. Re-scan in 4 to 12 weeks, under the same lighting, to see what has changed and what is just noise."
            : "Once you have scanned twice, this page shows each measurement side by side and tells you which changes are real."}
        </p>
        <Link href="/scan" className="btn btn-secondary mt-6">
          Go to scan
        </Link>
      </div>
    );
  }
  const first = data.scans[0]!;
  const last = data.scans[data.scans.length - 1]!;
  const changed = data.metrics.filter((metric) => metric.within_noise === false).length;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-fg-2">
        <span className="pill pill-accent">{data.scans.length} scans</span>
        {data.source === "synthetic" && <span className="pill">Synthetic sample</span>}
        <span className="num">
          {formatDate(first.created_at)} to {formatDate(last.created_at)}
        </span>
        <span>
          · <span className="text-fg num">{changed}</span> of{" "}
          <span className="num">{data.metrics.length}</span> measurements changed by more than noise
        </span>
      </div>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-fg-3">{data.note}</p>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.metrics.map((metric) => {
          const latest = metric.points[metric.points.length - 1]!;
          return (
            <li key={metric.key} className="card flex flex-col gap-4 p-5" data-progress={metric.key}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-medium">{metric.title}</h3>
                <span className="pill shrink-0">
                  {metric.within_noise === null
                    ? "No interval"
                    : metric.within_noise
                      ? "Within noise"
                      : "Changed"}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-[1.75rem] font-medium leading-none tracking-tight">
                  {latest.display}
                </span>
                <span className="text-sm text-fg-2 num">{metric.delta_display} since first scan</span>
              </div>
              <Trend metric={metric} />
              <details className="group text-xs text-fg-3">
                <summary className="cursor-pointer list-none hover:text-fg-2 [&::-webkit-details-marker]:hidden">
                  Values as a table
                </summary>
                <table className="mt-3 w-full text-left num">
                  <thead>
                    <tr className="text-fg-3">
                      <th className="pb-1 font-normal">Scan</th>
                      <th className="pb-1 font-normal">Value</th>
                    </tr>
                  </thead>
                  <tbody className="text-fg-2">
                    {metric.points.map((point) => (
                      <tr key={point.scan_id} className="border-t border-line">
                        <td className="py-1.5">{formatDate(point.at)}</td>
                        <td className="py-1.5">{point.display}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </li>
          );
        })}
      </ul>
      <ResultsDisclaimer />
    </>
  );
}

export default function ProgressPage() {
  return (
    <AppShell
      title="Progress"
      intro="The same measurements, scan after scan, with change separated from measurement noise."
    >
      {() => <ProgressScreen />}
    </AppShell>
  );
}
