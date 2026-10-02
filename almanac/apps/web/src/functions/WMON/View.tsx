import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { api, type Cell, type Instrument, isValue, num } from "../../data/api";
import { useLiveQuote, useReference, useStreamSubscription, useSymbols } from "../../data/hooks";
import { stream } from "../../data/stream";
import { defaultCode } from "../../grammar/defaults";
import { dirOf, Num } from "../../ui/components";
import { fmtAbbrev, fmtPct, fmtPrice, fmtSigned, fmtTime, provenanceText } from "../../ui/format";
import { useGridCopy } from "../../ui/grid";
import type { FunctionProps } from "../types";

export const DEFAULT_LIST = [
  "EQUITY:US:AAPL",
  "EQUITY:US:MSFT",
  "EQUITY:US:NVDA",
  "INDEX:US:SPX",
  "CURNCY:FX:EURUSD",
  "CRYPTO:SPOT:BTCUSD",
  "GOVT:US:UST10Y",
  "CMDTY:EIA:WTI",
];

interface Column {
  field: string;
  label: string;
  fmt: (v: number | null, inst: Instrument) => string;
  dir?: boolean;
}

const COLUMNS: Column[] = [
  { field: "px.last", label: "Last", fmt: (v, i) => fmtPrice(v, i) },
  {
    field: "px.chg",
    label: "Chg",
    fmt: (v, i) => fmtSigned(v, i.asset_class === "CURNCY" ? 5 : 2),
    dir: true,
  },
  { field: "px.chg_pct", label: "Chg %", fmt: (v) => fmtPct(v), dir: true },
  { field: "px.bid", label: "Bid", fmt: (v, i) => fmtPrice(v, i) },
  { field: "px.ask", label: "Ask", fmt: (v, i) => fmtPrice(v, i) },
  { field: "px.volume", label: "Volume", fmt: (v) => fmtAbbrev(v) },
];
const COMPACT = ["px.last", "px.chg_pct"];
const STREAM_FIELDS = COLUMNS.map((c) => c.field);

function useWatchlist(name: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["state", "watchlists"],
    queryFn: () => api.getState<string[]>("watchlists"),
  });
  const ids = q.data ? (q.data[name] ?? (name === "core" ? DEFAULT_LIST : [])) : null;
  const save = async (next: string[]) => {
    qc.setQueryData(["state", "watchlists"], { ...(q.data ?? {}), [name]: next });
    await api.putState("watchlists", name, next);
  };
  return { ids, save, loading: q.isPending, error: q.error };
}

function useUpdateRate() {
  const [rate, setRate] = useState(0);
  useEffect(() => {
    let last = stream.ticks;
    const t = setInterval(() => {
      setRate(stream.ticks - last);
      last = stream.ticks;
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return rate;
}

export default function WmonView({
  params,
  registerHotLinks,
  registerExport,
  run,
  compact,
}: FunctionProps) {
  const name = (params.list ?? "core").toLowerCase();
  const { ids, save, loading } = useWatchlist(name);
  const symbols = useSymbols();
  const byId = useMemo(() => new Map((symbols.data ?? []).map((s) => [s.id, s])), [symbols.data]);
  const rows = (ids ?? []).map((id) => byId.get(id)).filter((x): x is Instrument => !!x);
  const rowIds = rows.map((r) => r.id);
  const [cols, setCols] = useState<string[]>(compact ? COMPACT : STREAM_FIELDS);
  const [focusRow, setFocusRow] = useState(0);
  const [adding, setAdding] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [picks, setPicks] = useState<Instrument[]>([]);
  const rate = useUpdateRate();
  const gridRef = useRef<HTMLDivElement>(null);

  useStreamSubscription(rowIds, STREAM_FIELDS);
  const ref = useReference(rowIds, ["px.last", "px.chg", "px.chg_pct", "px.volume"]);
  const firstMode = useLiveQuote(rowIds[0])?.mode;
  const mode = (firstMode ?? "connecting").toUpperCase();
  const visible = COLUMNS.filter((c) => cols.includes(c.field));

  useEffect(() => {
    registerHotLinks(
      rows.map((r, i) => ({
        n: i + 1,
        label: r.display,
        command: `${r.display} ${r.asset_class === "EQUITY" ? "DESC" : defaultCode(r)}`,
      })),
    );
  });

  const tableRows = () =>
    rows.map((r) => {
      const q = stream.quote(r.id);
      const refv = ref.data?.values[r.id] ?? {};
      return [
        r.display,
        ...visible.map((c) => q?.v[c.field] ?? num(refv[c.field]) ?? null),
        q?.ts ?? "",
      ];
    });
  const header = ["security", ...visible.map((c) => c.field), "time"];

  useEffect(() => {
    registerExport({
      title: `WMON ${name}`,
      table: () => ({
        columns: header,
        rows: tableRows(),
        sources: [`watchlist ${name}`, "live values from the stream"],
      }),
    });
  });

  const onCopy = useGridCopy(() => [header, ...tableRows()]);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (!ids || j < 0 || j >= rowIds.length) return;
    const next = [...rowIds];
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
    setFocusRow(j);
  };

  const add = async (inst: Instrument) => {
    if (rowIds.includes(inst.id)) {
      setAddMsg(`${inst.display} is already on ${name}.`);
      return;
    }
    await save([...rowIds, inst.id]);
    setAdding("");
    setPicks([]);
    setAddMsg(null);
  };

  const submitAdd = async () => {
    const q = adding.trim();
    if (!q) return;
    const r = await api.resolve(q);
    if (r.exact) return add(r.exact);
    if (r.matches?.length) {
      setPicks(r.matches.slice(0, 6));
      setAddMsg(`Pick one for "${q}":`);
    } else setAddMsg(r.message ?? `Nothing matches ${q}.`);
  };

  if (loading) return <div className="block-state">Loading watchlist…</div>;
  return (
    <div className={compact ? "wmon compact" : "wmon"}>
      {!compact && (
        <div className="strip">
          <strong>{name}</strong>
          <span className={`badge mode-${mode.toLowerCase()}`}>{mode}</span>
          <span className="dim">{rate} updates/s</span>
          <span className="dim">{rows.length} rows</span>
          <span className="spacer" />
          <span className="cols" role="group" aria-label="Columns">
            {COLUMNS.map((c) => (
              <label key={c.field} title={c.field}>
                <input
                  type="checkbox"
                  tabIndex={-1}
                  checked={cols.includes(c.field)}
                  onChange={(e) =>
                    setCols(
                      e.target.checked
                        ? STREAM_FIELDS.filter((f) => f === c.field || cols.includes(f))
                        : cols.filter((f) => f !== c.field),
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </span>
        </div>
      )}
      <div
        className="mgrid"
        role="grid"
        aria-label={`Watchlist ${name}`}
        tabIndex={0}
        ref={gridRef}
        onKeyDown={(e) => {
          onCopy(e);
          if (e.altKey && e.key === "ArrowUp") {
            e.preventDefault();
            move(focusRow, -1);
          } else if (e.altKey && e.key === "ArrowDown") {
            e.preventDefault();
            move(focusRow, 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocusRow((r) => Math.max(0, r - 1));
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocusRow((r) => Math.min(rows.length - 1, r + 1));
          } else if (e.key === "Delete" && rows[focusRow]) {
            e.preventDefault();
            void save(rowIds.filter((id) => id !== rows[focusRow].id));
          } else if (e.key === "Enter" && rows[focusRow]) {
            const r = rows[focusRow];
            run(`${r.display} ${r.asset_class === "EQUITY" ? "DESC" : defaultCode(r)}`);
          }
        }}
        style={{
          gridTemplateColumns: compact
            ? `1.4em minmax(3.5em, 1fr) ${visible.map(() => "minmax(4.5em, auto)").join(" ")}`
            : `2.2em minmax(11em, 1.6fr) ${visible.map(() => "minmax(5.5em, 1fr)").join(" ")} 5.5em`,
        }}
      >
        <div className="mrow head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Security</span>
          {visible.map((c) => (
            <span role="columnheader" key={c.field} className="r">
              {c.label}
            </span>
          ))}
          {!compact && (
            <span role="columnheader" className="r">
              Time
            </span>
          )}
        </div>
        {rows.map((r, i) => (
          <MonitorRow
            key={r.id}
            n={i + 1}
            inst={r}
            cols={visible}
            focused={i === focusRow}
            compact={!!compact}
            refv={ref.data?.values[r.id]}
            onOpen={() =>
              run(`${r.display} ${r.asset_class === "EQUITY" ? "DESC" : defaultCode(r)}`)
            }
          />
        ))}
      </div>
      {!compact && (
        <div className="add-row">
          <input
            aria-label="Add a security to this watchlist"
            placeholder="Add security, e.g. TSLA US EQUITY, then Enter"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") void submitAdd();
              if (e.key === "Escape") {
                setAdding("");
                setPicks([]);
                setAddMsg(null);
              }
            }}
          />
          {addMsg && <span className="dim">{addMsg}</span>}
          {picks.map((p) => (
            <button type="button" key={p.id} className="link" onClick={() => void add(p)}>
              {p.display}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MonitorRow = memo(function MonitorRow({
  n,
  inst,
  cols,
  focused,
  compact,
  refv,
  onOpen,
}: {
  n: number;
  inst: Instrument;
  cols: Column[];
  focused: boolean;
  compact: boolean;
  refv: Record<string, Cell> | undefined;
  onOpen: () => void;
}) {
  const q = useLiveQuote(inst.id);
  return (
    <div
      className={focused ? "mrow focused" : "mrow"}
      role="row"
      aria-selected={focused}
      onDoubleClick={onOpen}
    >
      <span role="gridcell" className="n">
        {n}
      </span>
      <span role="gridcell" className="sec" title={inst.name}>
        {compact ? inst.symbol : inst.display}
      </span>
      {cols.map((c) => {
        const live = q?.v[c.field];
        const v = live ?? num(refv?.[c.field]) ?? null;
        const cell = refv?.[c.field];
        const title =
          q?.reason ??
          (live !== undefined
            ? `Source: ${q?.prov} · ${q?.mode ?? ""}`
            : isValue(cell)
              ? provenanceText(cell.prov)
              : (cell?.reasons.join("\n") ?? ""));
        return (
          <span role="gridcell" key={c.field} className="r">
            <Num
              value={v}
              text={c.fmt(v, inst)}
              dir={c.dir ? dirOf(v) : null}
              flash={c.field === "px.last"}
              title={title}
            />
          </span>
        );
      })}
      {!compact && (
        <span role="gridcell" className="r dim">
          {q?.ts ? fmtTime(q.ts, undefined, true) : ""}
        </span>
      )}
    </div>
  );
});
