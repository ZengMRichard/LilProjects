import { useEffect } from "react";
import { type Cell, isValue, num } from "../../data/api";
import { useLiveQuote } from "../../data/hooks";
import { DataState, dirOf, Link, Num, RefNum, Sparkline, Tabs } from "../../ui/components";
import {
  DASH,
  fmtAbbrev,
  fmtDate,
  fmtDateTime,
  fmtInt,
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtSigned,
  provenanceText,
} from "../../ui/format";
import type { FunctionProps } from "../types";

const PAGES = ["profile", "stats", "ids"] as const;

const LINKS = [
  { n: 1, label: "Chart", code: "CHRT" },
  { n: 2, label: "History", code: "HIST" },
  { n: 3, label: "Financials", code: "FIN" },
  { n: 4, label: "Filings", code: "FILE" },
  { n: 5, label: "News", code: "NEWS" },
  { n: 6, label: "Peers", code: "PEER" },
];

export default function DescView({
  instrument: inst,
  params,
  data,
  registerHotLinks,
  registerExport,
  run,
  setParam,
}: FunctionProps) {
  const ref = data.ref?.status === "ok" ? (data.ref.ref ?? {}) : {};
  const live = useLiveQuote(inst?.id);
  const page = Math.max(0, PAGES.indexOf(params.page as (typeof PAGES)[number]));

  useEffect(() => {
    if (!inst) return;
    registerHotLinks(
      LINKS.map((l) => ({ n: l.n, label: l.label, command: `${inst.display} ${l.code}` })),
    );
  }, [inst, registerHotLinks]);

  useEffect(() => {
    registerExport({
      title: `${inst?.display ?? ""} DESC`,
      table: () => ({
        columns: ["field", "value", "unit", "source", "as_of"],
        rows: Object.entries(ref).map(([f, c]) =>
          isValue(c)
            ? [
                f,
                c.value as string | number | null,
                c.unit ?? "",
                c.prov.provider,
                c.prov.as_of ?? "",
              ]
            : [f, null, "", `unavailable: ${c.reasons.join("; ")}`, ""],
        ),
        sources: [
          ...new Set(
            Object.values(ref)
              .filter(isValue)
              .map((c) => provenanceText(c.prov)),
          ),
        ],
      }),
    });
  }, [inst, ref, registerExport]);

  if (!inst) return null;
  const last = live?.v["px.last"] ?? num(ref["px.last"]);
  const chg = live?.v["px.chg"] ?? num(ref["px.chg"]);
  const chgPct = live?.v["px.chg_pct"] ?? num(ref["px.chg_pct"]);
  const asOf = live?.ts || (isValue(ref["px.last"]) ? ref["px.last"].prov.as_of : null);
  const price = (v: number) => fmtPrice(v, inst);

  return (
    <div className="desc">
      <div className="strip" data-testid="desc-strip">
        <strong>{text(ref["ref.name"]) ?? inst.name}</strong>
        <span className="dim">{inst.display}</span>
        <span className="dim">{text(ref["ref.mic"]) ?? DASH}</span>
        <span className="dim">{text(ref["ref.currency"]) ?? inst.currency}</span>
        <span className="big">
          <Num
            value={last}
            text={fmtPrice(last, inst)}
            flash
            title={liveTitle(live?.prov, ref["px.last"])}
          />
        </span>
        <Num value={chg} text={fmtSigned(chg, 2)} dir={dirOf(chg)} />
        <Num value={chgPct} text={fmtPct(chgPct)} dir={dirOf(chgPct)} />
        <span className="dim">{asOf ? fmtDateTime(asOf) : DASH}</span>
      </div>
      <Tabs
        pages={["Profile", "Statistics", "Identifiers"]}
        current={page}
        onSelect={(i) => setParam("page", PAGES[i])}
      />
      <DataState result={data.ref} label="Reference data">
        {() =>
          page === 0 ? (
            <div className="desc-grid">
              <div className="desc-left">
                <p className="clamp6" title={text(ref["ref.description"]) ?? ""}>
                  {text(ref["ref.description"]) ?? <MissingText cell={ref["ref.description"]} />}
                </p>
                <div className="spark">
                  <div className="label">1Y</div>
                  <DataState result={data.spark} label="One-year prices">
                    {() => {
                      const pts =
                        data.spark?.status === "ok" ? (data.spark.series?.[0]?.points ?? []) : [];
                      return (
                        <Sparkline
                          values={pts.map((p) => p.value ?? Number.NaN).filter(Number.isFinite)}
                        />
                      );
                    }}
                  </DataState>
                </div>
              </div>
              <KeyStats ref_={ref} price={price} />
            </div>
          ) : page === 1 ? (
            <FullStats ref_={ref} price={price} />
          ) : (
            <table className="kv" aria-label="Identifiers">
              <tbody>
                <Row label="Almanac ID" value={inst.id} />
                <Row label="Display" value={inst.display} />
                <Row label="Exchange (MIC)" value={inst.mic ?? DASH} />
                <Row label="Country" value={inst.country ?? DASH} />
                <Row label="Currency" value={inst.currency ?? DASH} />
                <tr>
                  <th>SEC CIK</th>
                  <td>{text(ref["ref.cik"]) ?? <MissingText cell={ref["ref.cik"]} />}</td>
                </tr>
                <tr>
                  <th>FIGI</th>
                  <td>{text(ref["ref.figi"]) ?? <MissingText cell={ref["ref.figi"]} />}</td>
                </tr>
                {Object.entries(inst.provider_symbols ?? {}).map(([p, s]) => (
                  <Row key={p} label={`Symbol at ${p}`} value={s} />
                ))}
              </tbody>
            </table>
          )
        }
      </DataState>
      {page === 0 && (
        <div className="filings">
          <div className="label">Recent filings</div>
          <DataState result={data.filings} label="Filings">
            {() => {
              const rows = data.filings?.status === "ok" ? (data.filings.table?.rows ?? []) : [];
              if (!rows.length) return <div className="dim">No filings.</div>;
              return (
                <table className="grid" aria-label="Recent filings">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.filed}${r.form}${r.description}`}>
                        <td className="date">{String(r.filed)}</td>
                        <td className="txt">{String(r.form)}</td>
                        <td className="txt">{String(r.description)}</td>
                        <td>
                          <a href={String(r.url)} target="_blank" rel="noreferrer" tabIndex={-1}>
                            EDGAR
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            }}
          </DataState>
        </div>
      )}
      <div className="links">
        {LINKS.map((l) => (
          <Link
            key={l.n}
            n={l.n}
            label={l.label}
            onClick={() => run(`${inst.display} ${l.code}`)}
          />
        ))}
      </div>
    </div>
  );
}

function text(c: Cell | undefined): string | null {
  return isValue(c) && c.value !== null ? String(c.value) : null;
}

function MissingText({ cell }: { cell: Cell | undefined }) {
  const why = cell && !isValue(cell) ? cell.reasons.join("\n") : "Loading";
  return (
    <span className="missing" title={why}>
      {DASH}
    </span>
  );
}

function liveTitle(liveProv: string | undefined, c: Cell | undefined) {
  if (liveProv) return `Source: ${liveProv} · streaming`;
  return isValue(c) ? provenanceText(c.prov) : "";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value}</td>
    </tr>
  );
}

function StatRow({
  label,
  cell,
  format,
}: {
  label: string;
  cell: Cell | undefined;
  format: (v: number) => string;
}) {
  return (
    <tr>
      <th>{label}</th>
      <td>
        <RefNum cell={cell} format={format} />
      </td>
    </tr>
  );
}

function KeyStats({ ref_, price }: { ref_: Record<string, Cell>; price: (v: number) => string }) {
  return (
    <table className="kv stats" aria-label="Key statistics">
      <tbody>
        <StatRow label="Market cap" cell={ref_["val.mkt_cap"]} format={(v) => fmtAbbrev(v)} />
        <StatRow
          label="P/E, trailing 12 months"
          cell={ref_["val.pe_ttm"]}
          format={(v) => fmtNum(v, 2)}
        />
        <StatRow
          label="Dividend yield"
          cell={ref_["val.div_yield"]}
          format={(v) => fmtPct(v, false)}
        />
        <StatRow label="52-week high" cell={ref_["px.hi_52w"]} format={price} />
        <StatRow label="52-week low" cell={ref_["px.lo_52w"]} format={price} />
        <StatRow
          label="Shares outstanding"
          cell={ref_["fin.shares_out"]}
          format={(v) => fmtAbbrev(v)}
        />
        <tr>
          <th>Industry</th>
          <td className="txt">
            {text(ref_["ref.industry"]) ?? <MissingText cell={ref_["ref.industry"]} />}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function FullStats({ ref_, price }: { ref_: Record<string, Cell>; price: (v: number) => string }) {
  return (
    <table className="kv stats wide" aria-label="Statistics">
      <tbody>
        <StatRow label="Last price" cell={ref_["px.last"]} format={price} />
        <StatRow label="Change" cell={ref_["px.chg"]} format={(v) => fmtSigned(v)} />
        <StatRow label="Change %" cell={ref_["px.chg_pct"]} format={(v) => fmtPct(v)} />
        <StatRow label="Volume" cell={ref_["px.volume"]} format={fmtInt} />
        <StatRow label="52-week high" cell={ref_["px.hi_52w"]} format={price} />
        <StatRow label="52-week low" cell={ref_["px.lo_52w"]} format={price} />
        <StatRow label="Market cap" cell={ref_["val.mkt_cap"]} format={fmtInt} />
        <StatRow label="Shares outstanding" cell={ref_["fin.shares_out"]} format={fmtInt} />
        <StatRow
          label="P/E, trailing 12 months"
          cell={ref_["val.pe_ttm"]}
          format={(v) => fmtNum(v, 2)}
        />
        <StatRow
          label="Dividend yield"
          cell={ref_["val.div_yield"]}
          format={(v) => fmtPct(v, false)}
        />
        <tr>
          <th>SIC</th>
          <td className="txt">
            {text(ref_["ref.sic"]) ?? DASH} {text(ref_["ref.industry"]) ?? ""}
          </td>
        </tr>
        <tr>
          <th>Fetched</th>
          <td className="txt">
            {isValue(ref_["ref.name"]) ? fmtDate(ref_["ref.name"].prov.fetched_at) : DASH}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
