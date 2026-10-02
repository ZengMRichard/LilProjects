import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { DataState, dirOf, Num } from "../../ui/components";
import { fmtDate, fmtInt, fmtPct, fmtPrice, fmtSigned, provenanceText } from "../../ui/format";
import { useGridCopy } from "../../ui/grid";
import type { FunctionProps } from "../types";

interface Row {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  chg: number | null;
  chgPct: number | null;
}

const ROW_PX = { compact: 18, comfortable: 22 };

export default function HistView({
  instrument: inst,
  params,
  data,
  registerExport,
}: FunctionProps) {
  const res = data.bars;
  const series = res?.status === "ok" ? res.series : undefined;
  const close = series?.find((s) => s.field === "px.close");
  const currency = close?.currency ?? inst?.currency ?? "";
  const adjusted = close?.prov.adjusted;

  const rows: Row[] = useMemo(() => {
    if (!close || !series) return [];
    const by = Object.fromEntries(series.map((s) => [s.field, s]));
    const get = (f: string, i: number) => by[f]?.points[i]?.value ?? null;
    const out: Row[] = close.points.map((p, i) => {
      const prev = i > 0 ? close.points[i - 1].value : null;
      const c = p.value;
      const chg = c !== null && prev !== null ? c - prev : null;
      return {
        ts: p.ts,
        open: get("px.open", i),
        high: get("px.high", i),
        low: get("px.low", i),
        close: c,
        volume: get("px.volume", i),
        chg,
        chgPct: chg !== null && prev ? (chg / prev) * 100 : null,
      };
    });
    return out.reverse(); // newest first
  }, [close, series]);

  const summary = useMemo(() => {
    if (!rows.length) return null;
    let hi = rows[0];
    let lo = rows[0];
    let sum = 0;
    let vol = 0;
    let nv = 0;
    for (const r of rows) {
      if ((r.high ?? -Infinity) > (hi.high ?? -Infinity)) hi = r;
      if ((r.low ?? Infinity) < (lo.low ?? Infinity)) lo = r;
      sum += r.close ?? 0;
      if (r.volume !== null) {
        vol += r.volume;
        nv++;
      }
    }
    const first = rows[rows.length - 1];
    const lastRow = rows[0];
    const firstRef = first.close;
    const chg = lastRow.close !== null && firstRef !== null ? lastRow.close - firstRef : null;
    return {
      hi,
      lo,
      avg: sum / rows.length,
      chg,
      chgPct: chg !== null && firstRef ? (chg / firstRef) * 100 : null,
      avgVol: nv ? vol / nv : null,
    };
  }, [rows]);

  const columns = [
    "date",
    `px.open (${currency})`,
    `px.high (${currency})`,
    `px.low (${currency})`,
    `px.close (${currency})`,
    "change",
    "change %",
    "px.volume (shares)",
  ];
  const toRow = (r: Row) => [
    fmtDate(r.ts),
    r.open,
    r.high,
    r.low,
    r.close,
    r.chg,
    r.chgPct,
    r.volume,
  ];

  // Registering is a cheap map write, so it runs after every render with the latest rows.
  useEffect(() => {
    registerExport({
      title: `${inst?.display ?? ""} HIST ${params.freq ?? ""}`,
      table: () => ({
        columns,
        rows: rows.map(toRow),
        sources: close ? [provenanceText(close.prov)] : [],
      }),
    });
  });

  const parent = useRef<HTMLDivElement>(null);
  const density =
    document.documentElement.dataset.density === "comfortable" ? "comfortable" : "compact";
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => ROW_PX[density],
    overscan: 20,
  });
  const onKeyDown = useGridCopy(() => [columns, ...rows.map(toRow)]);

  if (!inst) return null;
  const p = (x: number | null) => fmtPrice(x, inst);
  return (
    <div className="hist">
      <DataState result={res} label="Price history">
        {() => (
          <>
            <div className="strip" data-testid="hist-summary">
              <span>
                High <Num value={summary?.hi.high} text={p(summary?.hi.high ?? null)} />{" "}
                <span className="dim">{summary ? fmtDate(summary.hi.ts) : ""}</span>
              </span>
              <span>
                Low <Num value={summary?.lo.low} text={p(summary?.lo.low ?? null)} />{" "}
                <span className="dim">{summary ? fmtDate(summary.lo.ts) : ""}</span>
              </span>
              <span>
                Avg <Num value={summary?.avg} text={p(summary?.avg ?? null)} />
              </span>
              <span>
                Chg{" "}
                <Num
                  value={summary?.chg}
                  text={fmtSigned(summary?.chg)}
                  dir={dirOf(summary?.chg)}
                />{" "}
                <Num
                  value={summary?.chgPct}
                  text={fmtPct(summary?.chgPct)}
                  dir={dirOf(summary?.chgPct)}
                />
              </span>
              <span>
                Avg vol <Num value={summary?.avgVol} text={fmtInt(summary?.avgVol)} />
              </span>
              <span className="dim">
                {rows.length} rows · {params.freq ?? "1d"} · {currency} ·{" "}
                {adjusted === true
                  ? "adjusted"
                  : adjusted === false
                    ? "unadjusted"
                    : "adjustment unknown"}
              </span>
            </div>
            <div
              className="vgrid"
              ref={parent}
              role="grid"
              aria-label={`${inst.display} price history`}
              aria-rowcount={rows.length + 1}
              tabIndex={0}
              onKeyDown={onKeyDown}
            >
              <div className="vrow head" role="row">
                {["Date", "Open", "High", "Low", "Close", "Change", "Chg %", "Volume"].map((h) => (
                  <span role="columnheader" key={h}>
                    {h}
                  </span>
                ))}
              </div>
              <div style={{ height: v.getTotalSize(), position: "relative" }}>
                {v.getVirtualItems().map((item) => {
                  const r = rows[item.index];
                  return (
                    <div
                      className="vrow"
                      role="row"
                      aria-rowindex={item.index + 2}
                      key={item.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: item.size,
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <span role="gridcell" className="date">
                        {fmtDate(r.ts)}
                      </span>
                      <span role="gridcell">{p(r.open)}</span>
                      <span role="gridcell">{p(r.high)}</span>
                      <span role="gridcell">{p(r.low)}</span>
                      <span role="gridcell">{p(r.close)}</span>
                      <span role="gridcell" className={`c-${dirOf(r.chg) ?? ""}`}>
                        {fmtSigned(r.chg, inst.asset_class === "CURNCY" ? 5 : 2)}
                      </span>
                      <span role="gridcell" className={`c-${dirOf(r.chgPct) ?? ""}`}>
                        {fmtPct(r.chgPct)}
                      </span>
                      <span role="gridcell">{fmtInt(r.volume)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </DataState>
    </div>
  );
}
