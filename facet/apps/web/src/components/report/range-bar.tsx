import type { MetricCard } from "@/lib/api/types";

/**
 * One value against its typical range: a hairline axis, the range as a band, the value as a dot
 * and the 95% interval as a whisker. One hue throughout; the numbers are printed beside it, so
 * the picture never carries a value on its own.
 */
export function RangeBar({ card }: { card: MetricCard }) {
  const reference = card.reference;
  if (!reference || card.value == null) return null;
  const span = reference.high - reference.low;
  let low = reference.low - span * 0.6;
  let high = reference.high + span * 0.6;
  const reach = [card.value, card.ci_low ?? card.value, card.ci_high ?? card.value];
  low = Math.min(low, Math.min(...reach) - span * 0.12);
  high = Math.max(high, Math.max(...reach) + span * 0.12);
  const at = (v: number) => `${(((v - low) / (high - low)) * 100).toFixed(2)}%`;
  const width = (a: number, b: number) => `${(((b - a) / (high - low)) * 100).toFixed(2)}%`;
  const [rangeLow, rangeHigh] = reference.range_display.split(" to ");
  const label =
    `${card.title}: ${card.display}. Typical range ${reference.range_display}.` +
    (card.ci_display ? ` 95% interval ${card.ci_display}.` : "");

  return (
    <div className="select-none pt-1" role="img" aria-label={label} title={label}>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-2" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-powder-800"
          style={{ left: at(reference.low), width: width(reference.low, reference.high) }}
        />
        {card.ci_low != null && card.ci_high != null && (
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-powder-300/70"
            style={{ left: at(card.ci_low), width: width(card.ci_low, card.ci_high), minWidth: 2 }}
          />
        )}
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-powder-100 ring-2 ring-ink-900"
          style={{ left: at(card.value) }}
        />
      </div>
      <div className="relative h-4 text-[11px] text-fg-3 num">
        <span className="absolute -translate-x-1/2" style={{ left: at(reference.low) }}>
          {rangeLow}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: at(reference.high) }}>
          {rangeHigh}
        </span>
      </div>
    </div>
  );
}

/** One whole split into parts: 28px blocks with 2px gaps, the share printed where it fits. */
export function SegmentedBar({
  parts,
  label,
}: {
  parts: { name: string; share: number; tone: 0 | 1 | 2 }[];
  label: string;
}) {
  const tones = ["bg-powder-700 text-white", "bg-powder-500 text-[#03121d]", "bg-powder-200 text-[#03121d]"];
  const dots = ["bg-powder-700", "bg-powder-500", "bg-powder-200"];
  const summary = parts.map((p) => `${p.name} ${(p.share * 100).toFixed(1)}%`).join(", ");
  const legend = parts.filter((p, i) => parts.findIndex((q) => q.name === p.name) === i);
  return (
    <div>
      <div className="flex h-7 gap-0.5" role="img" aria-label={`${label}: ${summary}`}>
        {parts.map((part, index) => (
          <div
            key={index}
            title={`${part.name}: ${(part.share * 100).toFixed(1)}%`}
            className={`flex min-w-0 items-center rounded px-2 text-[11px] font-medium num ${tones[part.tone]}`}
            style={{ width: `${part.share * 100}%` }}
          >
            {part.share >= 0.13 ? `${(part.share * 100).toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        {legend.map((part) => (
          <li key={part.name} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-sm ${dots[part.tone]}`} />
            {part.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A three-step level indicator for low / medium / high, on one hue. */
export function BandMeter({ band }: { band: "low" | "medium" | "high" | null }) {
  const level = band === "high" ? 3 : band === "medium" ? 2 : band === "low" ? 1 : 0;
  const fills = ["bg-powder-700", "bg-powder-500", "bg-powder-200"];
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((step) => (
        <span key={step} className={`h-2 w-6 rounded-sm ${step < level ? fills[step] : "bg-ink-600"}`} />
      ))}
    </span>
  );
}

/** Small signal-bars glyph for confidence. */
export function ConfidenceGlyph({ level }: { level: "high" | "medium" | "low" }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((step) => (
        <span
          key={step}
          className={`w-[3px] rounded-[1px] ${step < filled ? "bg-powder-300" : "bg-ink-500"}`}
          style={{ height: 5 + step * 3 }}
        />
      ))}
    </span>
  );
}

/** Four dots for the evidence level of a plan item. */
export function EvidenceDots({ level }: { level: "strong" | "moderate" | "limited" | "anecdotal" }) {
  const filled = { strong: 4, moderate: 3, limited: 2, anecdotal: 1 }[level];
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((step) => (
        <span
          key={step}
          className={`size-1.5 rounded-full ${step < filled ? "bg-powder-300" : "bg-ink-500"}`}
        />
      ))}
    </span>
  );
}
