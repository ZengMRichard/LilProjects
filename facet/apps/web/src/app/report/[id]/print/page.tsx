import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/chrome";
import { ReportBody } from "@/components/report/report-body";
import type { Report, SignedUrl } from "@/lib/api/types";
import { PrintDialog } from "./print-dialog";

export const metadata: Metadata = { title: "Report", robots: { index: false } };
export const dynamic = "force-dynamic";

const API = process.env.FACET_API_URL ?? "http://127.0.0.1:8787";

/**
 * The print layout: the same React report, rendered on the server so headless Chromium can turn
 * it straight into the PDF. It is reached either by the signed-in owner or with a short-lived
 * render token minted by the API for the PDF renderer.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ render_token?: string; dialog?: string }>;
}) {
  const { id } = await params;
  const { render_token: token, dialog } = await searchParams;
  const query = token ? `?render_token=${encodeURIComponent(token)}` : "";
  const headers = { cookie: (await cookies()).toString() };
  const response = await fetch(`${API}/v1/reports/${encodeURIComponent(id)}${query}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) notFound();
  const report = (await response.json()) as Report;

  let photoUrl: string | null = null;
  if (report.geometry.image.available) {
    const signed = await fetch(`${API}/v1/scans/${report.scan_id}/images/front${query}`, {
      headers,
      cache: "no-store",
    });
    if (signed.ok) photoUrl = ((await signed.json()) as SignedUrl).url;
  }

  return (
    <main className="shell py-10">
      <div className="mb-10 flex items-center justify-between">
        <Wordmark />
        <span className="text-xs text-fg-3 num">facet report · {report.id}</span>
      </div>
      <ReportBody report={report} mode="print" photoUrl={photoUrl} />
      {dialog && <PrintDialog />}
    </main>
  );
}
