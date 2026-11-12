"use client";

import Link from "next/link";
import { AppShell, ErrorNote, PageLoading, ResultsDisclaimer } from "@/components/chrome";
import { PlanList } from "@/components/report/sections";
import { usePlan, useUpdatePlanItem } from "@/lib/api/hooks";

function PlanScreen() {
  const plan = usePlan();
  const update = useUpdatePlanItem();
  if (plan.isLoading) return <PageLoading />;
  if (plan.error) return <ErrorNote>{plan.error.message}</ErrorNote>;
  if (!plan.data?.report_id) {
    return (
      <div className="card p-8 text-sm text-fg-2">
        Your routine plan is built from your first report.{" "}
        <Link href="/scan" className="link">
          Start a scan
        </Link>
        .
      </div>
    );
  }
  const done = plan.data.items.filter((item) => item.status === "done").length;
  return (
    <>
      <p className="mb-8 text-sm text-fg-3">
        <span className="text-fg num">{done}</span> of <span className="num">{plan.data.items.length}</span>{" "}
        marked done · from your{" "}
        <Link href={`/report/${plan.data.report_id}`} className="link">
          latest report
        </Link>
      </p>
      <PlanList
        plan={plan.data}
        onStatus={(id, status) => update.mutate({ id, status })}
        busyId={update.isPending ? update.variables?.id : null}
      />
      <ResultsDisclaimer />
    </>
  );
}

export default function PlanPage() {
  return (
    <AppShell
      narrow
      title="Routine plan"
      intro="Non-invasive habits, ordered by how good the evidence is. Mark what you are doing; re-scan in 4 to 12 weeks to see what changed."
    >
      {() => <PlanScreen />}
    </AppShell>
  );
}
