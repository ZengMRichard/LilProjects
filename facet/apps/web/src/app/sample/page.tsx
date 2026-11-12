import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { IconArrow } from "@/components/icons";
import { ReportBody } from "@/components/report/report-body";
import sample from "@/content/sample-report.json";
import type { Report } from "@/lib/api/types";

export const metadata: Metadata = { title: "Sample report" };

export default function SamplePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signedIn={false} />
      <main className="shell flex-1 py-10 md:py-14">
        <div className="card mb-10 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <p className="text-sm leading-relaxed text-fg-2">
            <strong className="font-medium text-fg">This is a sample.</strong> It was produced by running the
            real pipeline on a synthetic model face, so there is no photo and no skin snapshot.
          </p>
          <Link href="/signin?next=/scan" className="btn btn-primary btn-sm shrink-0">
            Scan your own <IconArrow size={15} />
          </Link>
        </div>
        <ReportBody report={sample as unknown as Report} />
      </main>
      <SiteFooter />
    </div>
  );
}
