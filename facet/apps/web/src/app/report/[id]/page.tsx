"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { AppShell, ErrorNote, PageLoading } from "@/components/chrome";
import { IconArrow, IconCheck, IconDownload, IconTrash, Spinner } from "@/components/icons";
import { ReportBody } from "@/components/report/report-body";
import { ApiError, api } from "@/lib/api/client";
import { useCheckout, useImageUrl, useReport, useUpdatePlanItem } from "@/lib/api/hooks";
import type { Report, SignedUrl } from "@/lib/api/types";

const INCLUDES = [
  "Every measured proportion, each with its range and interval",
  "The symmetry map and regional breakdown",
  "The written summary of what is typical and what is distinctive",
  "Your full routine plan, and a PDF of the report",
];

function UpgradeCard({ report }: { report: Report }) {
  const checkout = useCheckout(report.id);
  if (report.tier !== "free_preview" || report.upsell.paused) return null;
  return (
    <section className="card card-raised no-print p-6 md:p-8" aria-labelledby="upgrade-title">
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <p className="eyebrow">Full report</p>
          <h2 id="upgrade-title" className="mt-2 text-2xl font-medium md:text-3xl">
            See the rest of your measurements
          </h2>
          <ul className="mt-5 space-y-2.5 text-sm text-fg-2">
            {INCLUDES.map((line) => (
              <li key={line} className="flex gap-3">
                <IconCheck size={16} className="mt-0.5 shrink-0 text-powder-300" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4 md:text-right">
          <p>
            <span className="text-5xl font-medium tracking-tight">${report.upsell.price_usd}</span>
            <span className="ml-2 text-sm text-fg-3">one-time</span>
          </p>
          {report.upsell.provider === "dev" ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending && <Spinner />}
                Unlock the full report <IconArrow size={16} />
              </button>
              <p className="text-xs text-fg-3">Test mode: no payment is taken in this build.</p>
            </>
          ) : (
            <p className="text-sm text-fg-3">Checkout is not available yet.</p>
          )}
          {checkout.error && <ErrorNote>{checkout.error.message}</ErrorNote>}
        </div>
      </div>
    </section>
  );
}

function ReportScreen({ id }: { id: string }) {
  const report = useReport(id);
  const client = useQueryClient();
  const updatePlan = useUpdatePlanItem();
  const data = report.data;
  const photo = useImageUrl(data?.scan_id ?? "", "front", Boolean(data?.geometry.image.available));
  const [pdfBusy, setPdfBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (report.isLoading) return <PageLoading label="Loading your report" />;
  if (report.error || !data) {
    return (
      <div className="space-y-5">
        <ErrorNote>{report.error?.message ?? "Report not found."}</ErrorNote>
        <Link href="/reports" className="btn btn-secondary">
          All reports
        </Link>
      </div>
    );
  }

  async function savePdf() {
    setPdfBusy(true);
    setNotice(null);
    try {
      const signed = await api<SignedUrl>(`/v1/reports/${id}/pdf`);
      window.open(signed.url, "_blank", "noopener");
    } catch (caught) {
      // No headless Chrome on the server: fall back to the browser's own print dialog.
      if (caught instanceof ApiError && caught.status === 503)
        window.open(`/report/${id}/print?dialog=1`, "_blank");
      else setNotice(caught instanceof ApiError ? caught.message : "The PDF could not be made.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function deletePhotos() {
    if (!data || !window.confirm("Delete the photos from this scan now? Your measurements stay.")) return;
    await api(`/v1/scans/${data.scan_id}/images/purge`, { method: "POST" });
    await client.invalidateQueries({ queryKey: ["report", id] });
    setNotice("The photos from this scan have been deleted.");
  }

  return (
    <>
      {notice && (
        <p role="status" className="mb-6 rounded-xl border border-line-2 px-4 py-3 text-sm text-fg-2">
          {notice}
        </p>
      )}
      <ReportBody
        report={data}
        photoUrl={photo.data?.url ?? null}
        onPlanStatus={(itemId, status) => updatePlan.mutate({ id: itemId, status })}
        planBusyId={updatePlan.isPending ? updatePlan.variables?.id : null}
        upgrade={<UpgradeCard report={data} />}
        actions={
          <>
            {data.tier !== "free_preview" && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={savePdf} disabled={pdfBusy}>
                {pdfBusy ? <Spinner size={15} /> : <IconDownload size={15} />}
                Save as PDF
              </button>
            )}
            {data.geometry.image.available && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={deletePhotos}>
                <IconTrash size={15} />
                Delete photos now
              </button>
            )}
          </>
        }
      />
    </>
  );
}

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell>{() => <ReportScreen id={id} />}</AppShell>;
}
