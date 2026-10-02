import { useEffect, useMemo, useState } from "react";
import { Link } from "../../ui/components";
import { CATALOG, CATALOG_BY_CODE, type CatalogEntry } from "../catalog";
import { MANIFEST_BY_CODE } from "../registry";
import type { FunctionManifest, FunctionProps } from "../types";

export function searchFunctions(q: string): CatalogEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CATALOG;
  const score = (c: CatalogEntry) => {
    const m = MANIFEST_BY_CODE.get(c.code);
    const hay = [c.code, c.title, c.data, ...c.keywords, ...(m?.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    if (words.length === 1 && c.code.toLowerCase() === words[0]) return 100;
    return words.every((w) => hay.includes(w))
      ? 10 + (c.title.toLowerCase().includes(words[0]) ? 5 : 0)
      : 0;
  };
  return CATALOG.map((c) => [c, score(c)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || a[0].phase - b[0].phase)
    .map(([c]) => c);
}

export default function HelpView({ params, registerHotLinks, run }: FunctionProps) {
  const q = params.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => {
    setText(q);
  }, [q]);
  const exact = CATALOG_BY_CODE.get(q.toUpperCase());
  const about = q.toUpperCase() === "ABOUT";
  const results = useMemo(() => (exact || about ? [] : searchFunctions(q)), [q, exact, about]);
  const m = exact ? MANIFEST_BY_CODE.get(exact.code) : undefined;

  useEffect(() => {
    if (exact) {
      registerHotLinks((m?.examples ?? []).map((ex, i) => ({ n: i + 1, label: ex, command: ex })));
    } else if (!about) {
      registerHotLinks(
        results
          .slice(0, 89)
          .map((c, i) => ({ n: i + 1, label: c.code, command: `HELP ${c.code}` })),
      );
    } else registerHotLinks([]);
  }, [exact, m, results, about, registerHotLinks]);

  return (
    <div className="help">
      <div className="strip">
        <label>
          Search{" "}
          <input
            aria-label="Search functions"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") run(`HELP ${text}`);
            }}
          />
        </label>
        <button type="button" className="link" onClick={() => run("HELP about")} tabIndex={-1}>
          About Almanac
        </button>
      </div>
      {about ? (
        <About />
      ) : exact ? (
        <Detail entry={exact} m={m} run={run} />
      ) : (
        <ol className="results" aria-label="Functions">
          {results.map((c, i) => (
            <li key={c.code}>
              <Link n={i + 1} label="" onClick={() => run(`HELP ${c.code}`)} />
              <code>{c.code}</code> <span>{c.title}</span>{" "}
              <span className="dim">
                {MANIFEST_BY_CODE.has(c.code) ? c.kind : `Phase ${c.phase}`} · {c.data}
              </span>
            </li>
          ))}
          {!results.length && <li className="dim">No function matches "{q}".</li>}
        </ol>
      )}
    </div>
  );
}

function Detail({
  entry,
  m,
  run,
}: {
  entry: CatalogEntry;
  m?: FunctionManifest;
  run: (c: string) => void;
}) {
  return (
    <div className="help-detail">
      <h2>
        <code>{entry.code}</code> {entry.title}
      </h2>
      <p className="dim">
        {entry.kind}
        {m?.assetClasses ? ` (${m.assetClasses.join(", ")})` : ""} · Phase {entry.phase} · Data:{" "}
        {entry.data}
      </p>
      {!m && (
        <p>
          {entry.code} is planned for Phase {entry.phase} and is not built yet. Typing it opens a
          screen that says so.
        </p>
      )}
      {m && (
        <>
          <h3>Usage</h3>
          <p>
            <code>
              {m.kind === "security" ? "<security> " : ""}
              {m.code}{" "}
              {m.params
                .filter((p) => p.positional !== undefined)
                .map((p) => `[${p.name}]`)
                .join(" ")}{" "}
              {m.params
                .filter((p) => p.positional === undefined)
                .map((p) => `[${p.name}=…]`)
                .join(" ")}
            </code>
          </p>
          {m.params.length > 0 && (
            <table className="kv" aria-label="Arguments">
              <tbody>
                {m.params.map((p) => (
                  <tr key={p.name}>
                    <th>
                      <code>{p.name}</code>
                    </th>
                    <td className="txt">
                      {p.help}
                      {p.values ? `: ${p.values.join(", ")}` : ""}
                      {p.default ? ` (default ${p.default})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Examples</h3>
          <div className="links col">
            {(m.examples ?? []).map((ex, i) => (
              <Link key={ex} n={i + 1} label={ex} onClick={() => run(ex)} />
            ))}
          </div>
          <h3>Data</h3>
          <ul>
            {m.data.map((d) => (
              <li key={d.key}>
                <code>{d.key}</code>: {d.shape} of {d.fields.join(", ")}
                {d.optional ? " (optional)" : ""}
              </li>
            ))}
            {!m.data.length && <li>Local state only.</li>}
          </ul>
          <p className="dim">Exports: {m.exports.length ? m.exports.join(", ") : "none"}</p>
        </>
      )}
    </div>
  );
}

function About() {
  return (
    <div className="help-detail about">
      <h2>Almanac</h2>
      <p>
        An open-source, keyboard-first financial terminal that runs on your own machine. Licensed
        under Apache-2.0.
      </p>
      <p className="notice">
        <strong>Data may be delayed or wrong. Nothing in Almanac is investment advice.</strong> In
        demo mode every price is synthetic, generated by a seeded random walk.
      </p>
      <h3>Third-party software</h3>
      <ul>
        <li>
          Charts by{" "}
          <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
            TradingView
          </a>{" "}
          Lightweight Charts (Apache-2.0).
        </li>
        <li>
          React, TanStack Query and Virtual, Zustand (MIT); FastAPI, Pydantic, Uvicorn, NumPy.
        </li>
        <li>Inter and JetBrains Mono fonts (SIL Open Font License).</li>
      </ul>
      <p className="dim">
        See NOTICE in the repository for the full list. No telemetry is collected.
      </p>
    </div>
  );
}
