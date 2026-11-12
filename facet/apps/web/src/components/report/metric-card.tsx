import { IconFlask, IconLock } from "@/components/icons";
import type { MetricCard as Card } from "@/lib/api/types";
import { ConfidenceGlyph, RangeBar } from "./range-bar";

const SIDE_LABEL = {
  below: "Below typical range",
  typical: "Within typical range",
  above: "Above typical range",
};

/**
 * Every metric card follows one pattern (spec section 3): what was measured, your value, the
 * typical range, what it means in plain words, and how confident the system is.
 */
export function MetricCard({ card, expanded = false }: { card: Card; expanded?: boolean }) {
  if (card.locked) {
    return (
      <article
        className="card print-avoid-break flex flex-col gap-4 p-5 opacity-80"
        aria-label={`${card.title}, in the full report`}
      >
        <header className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-medium text-fg-2">{card.title}</h3>
          <IconLock className="mt-0.5 shrink-0 text-fg-3" size={16} />
        </header>
        <div aria-hidden="true" className="space-y-3">
          <div className="h-8 w-24 rounded-md bg-ink-700" />
          <div className="h-2 rounded-full bg-ink-700" />
          <div className="h-3 w-4/5 rounded bg-ink-700/70" />
        </div>
        <p className="text-xs text-fg-3">In the full report</p>
      </article>
    );
  }
  const reference = card.reference;
  return (
    <article className="card print-avoid-break flex flex-col gap-4 p-5" data-metric={card.key}>
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-medium">{card.title}</h3>
        {card.confidence && (
          <span
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-fg-3"
            title={card.confidence_reason ?? undefined}
          >
            <ConfidenceGlyph level={card.confidence} />
            <span>
              <span className="sr-only">Confidence: </span>
              {card.confidence} confidence
            </span>
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-[2rem] font-medium leading-none tracking-tight">{card.display}</span>
        {reference && (
          <span className="pill">
            {SIDE_LABEL[reference.side]}
            {reference.provisional && <span className="text-fg-3">· provisional</span>}
          </span>
        )}
        {card.experimental && (
          <span className="pill">
            <IconFlask size={12} />
            Experimental
          </span>
        )}
      </div>

      <RangeBar card={card} />

      <p className="text-sm leading-relaxed text-fg-2">{card.meaning}</p>

      <Details expanded={expanded}>
        <dl className="space-y-2.5 text-[13px] leading-relaxed text-fg-2">
          <Row term="What was measured">{card.what}</Row>
          {reference && (
            <Row term="Typical range">
              {reference.range_display} for {reference.group_label.toLowerCase()}
              {reference.provisional ? " (provisional placeholder, not from a cited study)" : ""}
            </Row>
          )}
          {card.ci_display && <Row term="95% interval">{card.ci_display}</Row>}
          {card.confidence_reason && <Row term="Confidence">{card.confidence_reason}</Row>}
          {card.landmarks?.length ? <Row term="Landmarks">{card.landmarks.join(", ")}</Row> : null}
          {card.definition && <Row term="Definition">{card.definition}</Row>}
        </dl>
      </Details>
    </article>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3">
      <dt className="text-fg-3">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Details({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  if (expanded) return <div className="border-t border-line pt-4">{children}</div>;
  return (
    <details className="group border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-fg-3 transition-colors hover:text-fg-2 [&::-webkit-details-marker]:hidden">
        How this was measured
        <span className="transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
