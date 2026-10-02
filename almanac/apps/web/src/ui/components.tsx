import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Cell, isValue } from "../data/api";
import type { DataResult } from "../functions/types";
import { DASH, provenanceText } from "./format";

const FLASH_MS = 600;
const GLYPH_MS = 2000;
const MIN_FLASH_GAP_MS = 250; // at most four visual updates per second per cell

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that flashes its direction color when it changes. Missing data renders as a dash
 * whose tooltip gives the reason; present data carries its provenance on hover.
 */
export function Num({
  value,
  text,
  title,
  dir,
  flash = false,
  className = "",
}: {
  value: number | null | undefined;
  text: string;
  title?: string;
  dir?: "up" | "down" | null; // color by sign of a change
  flash?: boolean;
  className?: string;
}) {
  const prev = useRef(value);
  const last = useRef(0);
  const [f, setF] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (!flash || p === undefined || p === null || value === null || value === undefined) return;
    if (p === value) return;
    const now = performance.now();
    if (now - last.current < MIN_FLASH_GAP_MS) return;
    last.current = now;
    setF(value > p ? "up" : "down");
    const t = setTimeout(() => setF(null), reducedMotion() ? GLYPH_MS : FLASH_MS);
    return () => clearTimeout(t);
  }, [value, flash]);
  const cls = ["num", dir ? `c-${dir}` : "", f ? `flash-${f}` : "", className].join(" ");
  return (
    <span className={cls} title={title}>
      {f && reducedMotion() ? <span className="glyph">{f === "up" ? "▲" : "▼"}</span> : null}
      {text}
    </span>
  );
}

/** A reference cell from the API: a value with provenance, or a dash with reasons. */
export function RefNum({
  cell,
  format,
  dirOf,
  flash,
}: {
  cell: Cell | undefined;
  format: (v: number) => string;
  dirOf?: boolean;
  flash?: boolean;
}) {
  if (!cell) return <Num value={null} text={DASH} title="Loading" />;
  if (!isValue(cell))
    return <Num value={null} text={DASH} title={cell.reasons.join("\n")} className="missing" />;
  const v = typeof cell.value === "number" ? cell.value : null;
  return (
    <Num
      value={v}
      text={v === null ? String(cell.value ?? DASH) : format(v)}
      title={provenanceText(cell.prov)}
      dir={dirOf && v !== null ? (v > 0 ? "up" : v < 0 ? "down" : null) : null}
      flash={flash}
    />
  );
}

export function dirOf(v: number | null | undefined): "up" | "down" | null {
  if (v === null || v === undefined || v === 0) return null;
  return v > 0 ? "up" : "down";
}

/** Renders a data block's non-ok states; a failing block shows its reason and a retry link. */
export function DataState({
  result,
  label,
  retry,
  children,
}: {
  result: DataResult | undefined;
  label: string;
  retry?: () => void;
  children: () => ReactNode;
}) {
  if (!result || result.status === "loading")
    return (
      <div className="block-state" aria-busy="true">
        <span className="skeleton" /> Loading {label}…
      </div>
    );
  if (result.status === "error")
    return (
      <div className="block-state error" role="status">
        {label} failed: {result.error}{" "}
        {retry && (
          <button type="button" className="link" onClick={retry}>
            Retry
          </button>
        )}
      </div>
    );
  if (result.status === "unavailable")
    return (
      <div className="block-state missing" role="status">
        {label} unavailable: {result.reasons.join("; ")}
      </div>
    );
  return <>{children()}</>;
}

export function Tabs({
  pages,
  current,
  onSelect,
}: {
  pages: string[];
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {pages.map((p, i) => (
        <button
          type="button"
          role="tab"
          key={p}
          aria-selected={i === current}
          className={i === current ? "tab active" : "tab"}
          onClick={() => onSelect(i)}
          tabIndex={-1}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

/** A numbered link: typing its number in the command bar activates it. */
export function Link({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" className="hotlink" onClick={onClick} tabIndex={-1}>
      <span className="n">{n}</span> {label}
    </button>
  );
}

export function Sparkline({
  values,
  width = 240,
  height = 48,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const sx = width / (values.length - 1);
  const sy = hi === lo ? 0 : (height - 4) / (hi - lo);
  const d = values
    .map(
      (v, i) => `${i ? "L" : "M"}${(i * sx).toFixed(1)},${(height - 2 - (v - lo) * sy).toFixed(1)}`,
    )
    .join("");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      width={width}
      height={height}
      className="sparkline"
      role="img"
      aria-label="One-year price sparkline"
    >
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth="1.5" />
    </svg>
  );
}

export function DemoBadge() {
  return (
    <span className="badge demo" title="Synthetic demo data: not market prices">
      DEMO
    </span>
  );
}
