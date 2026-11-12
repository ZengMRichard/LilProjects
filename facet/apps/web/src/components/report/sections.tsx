import type { ReactNode } from "react";
import { IconCheck, IconFlask, IconHeart, IconInfo, IconX } from "@/components/icons";
import type { Plan, PlanItem, Report, Skin, Support } from "@/lib/api/types";
import { BandMeter, EvidenceDots } from "./range-bar";

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 max-w-2xl space-y-2">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="text-2xl font-medium md:text-[1.75rem]">
        {title}
      </h2>
      {children && <p className="text-sm leading-relaxed text-fg-2">{children}</p>}
    </header>
  );
}

/** Every report opens with what the numbers can and cannot tell you (spec section 9). */
export function Opener({ report }: { report: Report }) {
  const { opener } = report;
  return (
    <section className="card card-raised print-avoid-break p-6 md:p-8" aria-labelledby="opener-title">
      <h2 id="opener-title" className="text-xl font-medium md:text-2xl">
        {opener.title}
      </h2>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-3">They can tell you</p>
          <ul className="space-y-3 text-sm leading-relaxed text-fg-2">
            {opener.can.map((line) => (
              <li key={line} className="flex gap-3">
                <IconCheck className="mt-0.5 shrink-0 text-powder-300" size={16} />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3">They cannot tell you</p>
          <ul className="space-y-3 text-sm leading-relaxed text-fg-2">
            {opener.cannot.map((line) => (
              <li key={line} className="flex gap-3">
                <IconX className="mt-0.5 shrink-0 text-fg-3" size={16} />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="hairline my-6" />
      <p className="text-sm leading-relaxed text-fg-2">
        {opener.asymmetry} {opener.ranges}
      </p>
      {report.reference_group.provisional && (
        <p className="mt-4 flex gap-3 rounded-xl border border-line-2 bg-powder-300/[0.04] p-4 text-[13px] leading-relaxed text-fg-2">
          <IconInfo className="mt-0.5 shrink-0 text-powder-300" size={16} />
          <span>
            <strong className="font-medium text-fg">Provisional reference ranges.</strong> The typical ranges
            in this build are development placeholders. They are not taken from a cited study and have not
            been checked against this camera-based measurement method, so read each band as a rough guide
            only.
          </span>
        </p>
      )}
    </section>
  );
}

export function SupportCard({ support }: { support: Support }) {
  return (
    <section
      className="card print-avoid-break border-powder-300/30 p-6 md:p-8"
      aria-labelledby="support-title"
    >
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-powder-300/10 text-powder-200">
          <IconHeart size={20} />
        </span>
        <div className="space-y-3">
          <h2 id="support-title" className="text-xl font-medium">
            {support.title}
          </h2>
          <p className="text-sm leading-relaxed text-fg-2">{support.body}</p>
        </div>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {support.resources.map((resource) => (
          <li key={resource.url} className="rounded-xl border border-line p-4">
            <a href={resource.url} target="_blank" rel="noreferrer" className="link text-sm font-medium">
              {resource.name}
            </a>
            <p className="mt-1 text-[13px] text-fg-2">{resource.detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[13px] text-fg-3">{support.note}</p>
    </section>
  );
}

export function SkinSnapshot({ skin }: { skin: Skin }) {
  return (
    <div className="card print-avoid-break p-6">
      <p className="mb-5 flex gap-3 text-[13px] leading-relaxed text-fg-2">
        <IconFlask className="mt-0.5 shrink-0 text-powder-300" size={16} />
        {skin.note}
      </p>
      {skin.status === "unavailable" ? (
        <p className="rounded-xl border border-dashed border-line-2 p-5 text-sm text-fg-2">{skin.reason}</p>
      ) : (
        <ul className="divide-y divide-line">
          {skin.attributes.map((attribute) => (
            <li
              key={attribute.key}
              className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[11rem_9rem_1fr] sm:items-center"
              data-skin={attribute.key}
            >
              <span className="text-[15px] font-medium">{attribute.label}</span>
              <span className="flex items-center gap-3">
                <BandMeter band={attribute.band} />
                <span className="text-sm capitalize text-fg-2">{attribute.band ?? "not assessed"}</span>
              </span>
              <span className="text-sm leading-relaxed text-fg-2">{attribute.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<PlanItem["status"], string> = {
  todo: "Not started",
  doing: "Doing",
  done: "Done",
  skipped: "Skipped",
};

export function PlanList({
  plan,
  onStatus,
  busyId,
}: {
  plan: Plan;
  onStatus?: (id: string, status: PlanItem["status"]) => void;
  busyId?: string | null;
}) {
  const groups: { label: string; items: PlanItem[] }[] = [];
  for (const item of plan.items) {
    const group = groups.find((g) => g.label === item.category_label);
    if (group) group.items.push(item);
    else groups.push({ label: item.category_label, items: [item] });
  }
  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-sm leading-relaxed text-fg-2">{plan.preface}</p>
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="eyebrow mb-3">{group.label}</h3>
          <ul className="space-y-3">
            {group.items.map((item) => (
              <li key={item.id} className="card print-avoid-break p-5" data-plan={item.key}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h4 className="text-[15px] font-medium leading-snug">{item.action}</h4>
                  <span
                    className="flex shrink-0 items-center gap-2 text-xs text-fg-2"
                    title={item.evidence_note}
                  >
                    <EvidenceDots level={item.evidence_level} />
                    <span>
                      Evidence: <span className="capitalize">{item.evidence_level}</span>
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-fg-2">{item.detail}</p>
                <p className="mt-3 text-[13px] text-fg-3">
                  {item.reason} {item.evidence_note}
                </p>
                {onStatus && (
                  <fieldset className="mt-4 flex flex-wrap gap-1.5" disabled={busyId === item.id}>
                    <legend className="sr-only">Status for: {item.action}</legend>
                    {(["todo", "doing", "done", "skipped"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={item.status === status}
                        onClick={() => onStatus(item.id, status)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          item.status === status
                            ? "border-powder-300/50 bg-powder-300/10 text-powder-100"
                            : "border-line text-fg-3 hover:border-line-2 hover:text-fg-2"
                        }`}
                      >
                        {STATUS_LABEL[status]}
                      </button>
                    ))}
                  </fieldset>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {plan.locked_count > 0 && (
        <p className="text-sm text-fg-3">
          {plan.locked_count} more {plan.locked_count === 1 ? "item is" : "items are"} in the full report.
        </p>
      )}
    </div>
  );
}
