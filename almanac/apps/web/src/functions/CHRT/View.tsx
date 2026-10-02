import { useQueries } from "@tanstack/react-query";
import {
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Instrument } from "../../data/api";
import { formatArgs } from "../../grammar/bind";
import { DataState, Link } from "../../ui/components";
import { withFooter } from "../../ui/export";
import {
  DASH,
  fmtDate,
  fmtDateTime,
  fmtInt,
  fmtPct,
  fmtPrice,
  provenanceText,
} from "../../ui/format";
import { usePrefs } from "../../ui/prefs";
import { bollinger, ema, rebase, sma } from "../../ui/studies";
import type { FunctionProps } from "../types";
import { type Bar, INTRADAY, toBars, toTime } from "./bars";
import { manifest, RANGE_LINKS } from "./manifest";

const COMPARE_COLORS = ["#E3A008", "#A371F7", "#F0883E", "#2DD4BF"];

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Comparison securities: resolved, then fetched over the same period. */
function useComparisons(vs: string | undefined, period: string) {
  const names = (vs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const resolved = useQueries({
    queries: names.map((n) => ({
      queryKey: ["resolve", n],
      queryFn: () => api.resolve(n),
      staleTime: Infinity,
    })),
  });
  const insts = resolved.map((r) => r.data?.exact ?? null);
  const hist = useQueries({
    queries: insts.map((inst) => {
      const req = { id: inst?.id ?? "", fields: ["px.close"], period, adjusted: true };
      return { queryKey: ["hist", req], queryFn: () => api.hist(req), enabled: !!inst };
    }),
  });
  return names.map((name, i) => ({
    name,
    inst: insts[i] as Instrument | null,
    error: resolved[i].data && !resolved[i].data?.exact ? `${name} did not resolve` : null,
    series: hist[i].data?.series?.[0] ?? null,
  }));
}

export default function ChrtView({
  instrument: inst,
  params,
  data,
  registerHotLinks,
  registerExport,
  run,
}: FunctionProps) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Bar | null>(null);
  const [showTable, setShowTable] = useState(false);
  const theme = usePrefs((s) => s.theme);
  const cvd = usePrefs((s) => s.cvd);
  const period = params.period ?? "1Y";
  const style = params.style ?? "line";
  const intraday = INTRADAY.has(period);
  const res = data.bars;
  const series = res?.status === "ok" ? res.series : undefined;
  const bars = useMemo(() => toBars(series, intraday), [series, intraday]);
  const comps = useComparisons(params.vs, period);
  const compKey = comps.map((c) => `${c.name}:${c.series?.points.length ?? 0}`).join("|");
  const filings = data.filings?.status === "ok" ? (data.filings.table?.rows ?? []) : [];
  const studies = (params.study ?? "")
    .toUpperCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const studyKey = studies.join(",");
  const prov = series?.[0]?.prov;

  // Range links 1-8 keep the other parameters.
  useEffect(() => {
    if (!inst) return;
    registerHotLinks(
      RANGE_LINKS.map((p, i) => ({
        n: i + 1,
        label: p,
        command: `${inst.display} CHRT ${formatArgs(manifest, { ...params, period: p })}`,
      })),
    );
  }, [inst, params, registerHotLinks]);

  // Build the chart.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild when inputs change
  useEffect(() => {
    const el = host.current;
    if (!el || !bars.length) return;
    const up = cssVar("--up");
    const down = cssVar("--down");
    const text = cssVar("--text-dim");
    const accent = cssVar("--accent");
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: cssVar("--panel") },
        textColor: text,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: true,
        panes: { separatorColor: cssVar("--line") },
      },
      grid: { vertLines: { color: cssVar("--grid") }, horzLines: { color: cssVar("--grid") } },
      rightPriceScale: { borderColor: cssVar("--line") },
      timeScale: { borderColor: cssVar("--line"), timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    const compare = comps.some((c) => c.series);
    let main: ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | ISeriesApi<"Bar">;
    const closes = bars.map((b) => b.c);
    const decimals = inst?.asset_class === "CURNCY" ? 5 : inst?.asset_class === "GOVT" ? 3 : 2;
    const priceFormat = compare
      ? { type: "custom" as const, formatter: (v: number) => `${v.toFixed(2)}%` }
      : { type: "price" as const, precision: decimals, minMove: 10 ** -decimals };

    if (compare) {
      const rb = rebase(closes);
      main = chart.addSeries(LineSeries, { color: accent, lineWidth: 2, priceFormat });
      main.setData(bars.map((b, i) => ({ time: b.t, value: rb[i] ?? 0 })));
      comps.forEach((c, k) => {
        if (!c.series) return;
        const pts = c.series.points.filter((p) => p.value !== null);
        const r = rebase(pts.map((p) => p.value));
        const s = chart.addSeries(LineSeries, {
          color: COMPARE_COLORS[k % COMPARE_COLORS.length],
          lineWidth: 1,
          priceFormat,
          title: c.inst?.symbol ?? c.name,
        });
        s.setData(pts.map((p, i) => ({ time: toTime(p.ts, intraday), value: r[i] ?? 0 })));
      });
    } else if (style === "candle") {
      main = chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
        priceFormat,
      });
      main.setData(bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
    } else if (style === "bar") {
      main = chart.addSeries(BarSeries, { upColor: up, downColor: down, priceFormat });
      main.setData(bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
    } else {
      main = chart.addSeries(LineSeries, { color: accent, lineWidth: 2, priceFormat });
      main.setData(bars.map((b) => ({ time: b.t, value: b.c })));
    }

    if (!compare) {
      const studyColors = ["#E3A008", "#A371F7", "#F0883E", "#2DD4BF", "#8A93A6"];
      studies.forEach((st, k) => {
        const m = /^(SMA|EMA|BB)(\d+)$/.exec(st);
        if (!m) return;
        const n = Number(m[2]);
        const color = studyColors[k % studyColors.length];
        const lines =
          m[1] === "BB"
            ? Object.values(bollinger(closes, n))
            : [m[1] === "SMA" ? sma(closes, n) : ema(closes, n)];
        for (const vals of lines) {
          const s = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            priceFormat,
          });
          s.setData(
            bars.flatMap((b, i) =>
              vals[i] === null ? [] : [{ time: b.t, value: vals[i] as number }],
            ),
          );
        }
      });
    }

    if (bars.some((b) => b.v !== null)) {
      const vol = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
        1,
      );
      vol.setData(
        bars.map((b, i) => ({
          time: b.t,
          value: b.v ?? 0,
          color: `${i && b.c < bars[i - 1].c ? down : up}66`,
        })),
      );
      chart.panes()[1]?.setHeight(70);
    }

    // SEC filing markers along the time axis, on equities.
    if (inst?.asset_class === "EQUITY" && filings.length && !intraday) {
      const first = bars[0].ts.slice(0, 10);
      const last = bars[bars.length - 1].ts.slice(0, 10);
      const dates = new Set(bars.map((b) => b.ts.slice(0, 10)));
      const markers: SeriesMarker<Time>[] = [];
      for (const f of filings) {
        const d = String(f.filed);
        if (d < first || d > last) continue;
        // snap to the next bar on or after the filing date
        const t = [...dates].find((x) => x >= d);
        if (!t) continue;
        const form = String(f.form);
        markers.push({
          time: t as Time,
          position: "belowBar",
          shape: form === "8-K" ? "circle" : "arrowUp",
          color: form === "8-K" ? text : accent,
          text: form === "8-K" ? "" : form,
          size: form === "8-K" ? 0.5 : 1,
        });
      }
      markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
      createSeriesMarkers(main, markers);
    }

    chart.timeScale().fitContent();
    const byTime = new Map(bars.map((b) => [String(b.t), b]));
    chart.subscribeCrosshairMove((p) => {
      setLegend(p.time !== undefined ? (byTime.get(String(p.time)) ?? null) : null);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, style, studyKey, compKey, filings.length, theme, cvd, intraday, showTable]);

  useEffect(() => {
    const title = `${inst?.display ?? ""} CHRT ${period}`;
    registerExport({
      title,
      png: () => {
        const c = chartRef.current?.takeScreenshot();
        if (!c) return null;
        const src = prov
          ? `${prov.provider}${prov.attribution ? ` (${prov.attribution})` : ""}`
          : "";
        const footer = `${manifest.title} · ${inst?.display} · ${period} · Source: ${src} · ${fmtDateTime(new Date().toISOString())}`;
        return withFooter(c, footer, cssVar("--panel"), cssVar("--text-dim"));
      },
      table: () => ({
        columns: ["time", "px.open", "px.high", "px.low", "px.close", "px.volume (shares)"],
        rows: bars.map((b) => [b.ts, b.o, b.h, b.l, b.c, b.v]),
        sources: prov ? [provenanceText(prov)] : [],
      }),
    });
  }, [bars, inst, period, prov, registerExport]);

  if (!inst) return null;
  const shown = legend ?? bars[bars.length - 1];
  const p = (v: number | undefined) => (v === undefined ? DASH : fmtPrice(v, inst));
  const first = bars[0]?.c;
  const lastC = bars[bars.length - 1]?.c;
  const periodChg = first && lastC ? (lastC / first - 1) * 100 : null;
  return (
    <div className="chrt">
      <div className="strip legend" data-testid="chrt-legend">
        <span className="dim">
          {shown ? (intraday ? fmtDateTime(shown.ts) : fmtDate(shown.ts)) : DASH}
        </span>
        <span>O {p(shown?.o)}</span>
        <span>H {p(shown?.h)}</span>
        <span>L {p(shown?.l)}</span>
        <span>C {p(shown?.c)}</span>
        {shown?.v !== null && shown?.v !== undefined && <span>V {fmtInt(shown.v)}</span>}
        <span className={periodChg && periodChg > 0 ? "c-up" : "c-down"}>
          {period} {fmtPct(periodChg)}
        </span>
        {comps.map((c, k) => (
          <span key={c.name} style={{ color: COMPARE_COLORS[k % COMPARE_COLORS.length] }}>
            {c.error ?? c.inst?.display ?? c.name}
          </span>
        ))}
        {studies.length > 0 && <span className="dim">{studies.join(" ")}</span>}
      </div>
      <div className="ranges">
        {RANGE_LINKS.map((r, i) => (
          <Link
            key={r}
            n={i + 1}
            label={r}
            onClick={() =>
              run(`${inst.display} CHRT ${formatArgs(manifest, { ...params, period: r })}`)
            }
          />
        ))}
        <button
          type="button"
          className="link"
          onClick={() => setShowTable((v) => !v)}
          tabIndex={-1}
        >
          {showTable ? "Chart" : "Data table"}
        </button>
      </div>
      <DataState result={res} label="Price history">
        {() =>
          showTable ? (
            <div className="table-scroll">
              <table className="grid" aria-label={`${inst.display} chart data`}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Open</th>
                    <th>High</th>
                    <th>Low</th>
                    <th>Close</th>
                    <th>Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {bars
                    .slice(-500)
                    .reverse()
                    .map((b) => (
                      <tr key={b.ts}>
                        <td className="date">{intraday ? fmtDateTime(b.ts) : fmtDate(b.ts)}</td>
                        <td>{p(b.o)}</td>
                        <td>{p(b.h)}</td>
                        <td>{p(b.l)}</td>
                        <td>{p(b.c)}</td>
                        <td>{fmtInt(b.v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="chart-host"
              ref={host}
              role="img"
              aria-label={`${inst.display} price chart, ${period}`}
            />
          )
        }
      </DataState>
    </div>
  );
}
