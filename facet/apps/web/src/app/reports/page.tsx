"use client";

import Link from "next/link";
import { AppShell, ErrorNote, PageLoading } from "@/components/chrome";
import { IconArrow } from "@/components/icons";
import { useReports } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

const TIER = { free_preview: "Free preview", full: "Full report", premium: "Premium report" } as Record<
  string,
  string
>;

function ReportList() {
  const reports = useReports();
  if (reports.isLoading) return <PageLoading />;
  if (reports.error) return <ErrorNote>{reports.error.message}</ErrorNote>;
  if (!reports.data?.length) {
    return (
      <div className="card card-raised flex flex-col items-center gap-5 px-6 py-16 text-center">
        <h2 className="text-2xl font-medium">No reports yet</h2>
        <p className="max-w-md text-sm leading-relaxed text-fg-2">
          Your first scan takes about two minutes. If you would rather look around first, the synthetic sample
          runs the full pipeline on a model face.
        </p>
        <Link href="/scan" className="btn btn-primary">
          Start a scan <IconArrow size={16} />
        </Link>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {reports.data.map((report) => (
        <li key={report.id}>
          <Link
            href={`/report/${report.id}`}
            className="card group flex h-full flex-col gap-6 p-6 transition-colors hover:border-line-3"
          >
            <div className="flex flex-wrap gap-2">
              <span className="pill pill-accent">{TIER[report.tier] ?? report.tier}</span>
              {report.source === "synthetic" && <span className="pill">Synthetic sample</span>}
            </div>
            <div>
              <p className="text-2xl font-medium tracking-tight num">{formatDate(report.created_at)}</p>
              <p className="mt-1 text-sm text-fg-3">Proportions, symmetry and skin</p>
            </div>
            <span className="mt-auto flex items-center gap-2 text-sm text-powder-300">
              Open report <IconArrow size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ReportsPage() {
  return (
    <AppShell
      title="Your reports"
      intro="Each scan becomes one report. Photos are deleted on schedule; the measurements stay until you delete them."
    >
      {() => <ReportList />}
    </AppShell>
  );
}
