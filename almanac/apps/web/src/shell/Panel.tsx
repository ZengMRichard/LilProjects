import { Suspense, useCallback, useEffect } from "react";
import type { Instrument } from "../data/api";
import { CATALOG_BY_CODE } from "../functions/catalog";
import { MANIFEST_BY_CODE, viewFor } from "../functions/registry";
import type { ExportSource, FunctionManifest, HotLink } from "../functions/types";
import { useFunctionData } from "../functions/useFunctionData";
import { defaultCode } from "../grammar/defaults";
import { DemoBadge, Link } from "../ui/components";
import { runCommand, setParam } from "./run";
import { current, exporters, hotLinks, type PanelId, type Screen, useShell } from "./store";
import { toolbar } from "./toolbar";

const TOOLBAR = [
  { n: 90, label: "Refresh", action: "refresh" },
  { n: 95, label: "Pin", action: "pin" },
  { n: 96, label: "Link", action: "link" },
  { n: 97, label: "Settings", action: "settings" },
  { n: 98, label: "Export", action: "export" },
  { n: 99, label: "Help", action: "help" },
];

export function Panel({ id, demo }: { id: PanelId; demo: boolean }) {
  const panel = useShell((s) => s.panels[id]);
  const focused = useShell((s) => s.focus === id);
  const setFocus = useShell((s) => s.setFocus);
  const screen = current(panel);
  const m = screen.kind === "function" ? MANIFEST_BY_CODE.get(screen.code) : undefined;
  // The header names a security only when the screen is about one.
  const sec = "instrument" in screen && screen.instrument ? screen.instrument : undefined;
  const code = screen.kind === "function" || screen.kind === "planned" ? screen.code : "";
  const title = m?.title ?? (code ? CATALOG_BY_CODE.get(code)?.title : "") ?? "";

  return (
    <section
      className={focused ? "panel focused" : "panel"}
      aria-label={`Panel ${id}${code ? `: ${code}` : ""}`}
      data-panel={id}
      onMouseDown={() => setFocus(id)}
    >
      <header className="panel-head">
        <span className="pnum">{id}</span>
        <span className="psec">{sec?.display ?? ""}</span>
        {code && <span className="pcode">{code}</span>}
        <span className="ptitle">{title}</span>
        {demo && screen.kind === "function" && m?.kind !== "tool" && <DemoBadge />}
        <span className="spacer" />
        <span className="toolbar">
          {TOOLBAR.map((t) => (
            <button
              key={t.n}
              type="button"
              tabIndex={-1}
              title={`${t.label} (type ${t.n})`}
              onClick={() => toolbar(t.action, id)}
            >
              {t.n}
            </button>
          ))}
        </span>
      </header>
      <div className="panel-body" data-testid={`panel-${id}-body`}>
        <ScreenView id={id} screen={screen} />
      </div>
    </section>
  );
}

function ScreenView({ id, screen }: { id: PanelId | string; screen: Screen }) {
  const pid = String(id);
  const register = useCallback(
    (links: HotLink[]) => {
      hotLinks.set(pid, links);
    },
    [pid],
  );
  const run = useCallback(
    (cmd: string) => {
      if (typeof id === "number") void runCommand(cmd, id);
    },
    [id],
  );
  switch (screen.kind) {
    case "blank":
      return (
        <div className="hint">
          Type a command, for example <code>AAPL US EQUITY CHRT 5Y</code>, <code>WMON</code> or{" "}
          <code>HELP</code>. Alt+{id} focuses this panel.
        </div>
      );
    case "loading":
      return (
        <div className="block-state" aria-busy="true">
          <span className="skeleton" /> {screen.command}
        </div>
      );
    case "picks":
      return <Picks pid={pid} screen={screen} register={register} run={run} />;
    case "planned":
      return <Planned pid={pid} screen={screen} register={register} run={run} />;
    case "error":
      return <ErrorScreen pid={pid} screen={screen} register={register} run={run} />;
    case "function": {
      const m = MANIFEST_BY_CODE.get(screen.code);
      if (!m) return null;
      return (
        <FunctionHost
          key={screen.code}
          id={id}
          m={m}
          screen={screen}
          register={register}
          run={run}
        />
      );
    }
  }
}

/** A screen's hot links and export belong to it: clear them when it unmounts. */
function useOwnLinks(pid: string) {
  useEffect(
    () => () => {
      hotLinks.delete(pid);
      exporters.delete(pid);
    },
    [pid],
  );
}

export function FunctionHost({
  id,
  m,
  screen,
  register,
  run,
  compact,
}: {
  id: PanelId | string;
  m: FunctionManifest;
  screen: Extract<Screen, { kind: "function" }>;
  register: (l: HotLink[]) => void;
  run: (c: string) => void;
  compact?: boolean;
}) {
  useOwnLinks(String(id));
  const View = viewFor(m.code);
  const { data } = useFunctionData(m, screen.instrument, screen.params);
  const registerExport = useCallback(
    (src: ExportSource | null) => {
      exporters.set(String(id), src);
    },
    [id],
  );
  const set = useCallback(
    (name: string, value: string) => {
      if (typeof id === "number") setParam(id, name, value);
    },
    [id],
  );
  if (!View) return null;
  return (
    <Suspense
      fallback={
        <div className="block-state" aria-busy="true">
          <span className="skeleton" /> {m.title}
        </div>
      }
    >
      <View
        panelId={id as PanelId}
        instrument={screen.instrument}
        params={screen.params}
        data={data}
        registerHotLinks={register}
        registerExport={registerExport}
        run={run}
        setParam={set}
        compact={compact}
      />
    </Suspense>
  );
}

function Picks({
  pid,
  screen,
  register,
  run,
}: {
  pid: string;
  screen: Extract<Screen, { kind: "picks" }>;
  register: (l: HotLink[]) => void;
  run: (c: string) => void;
}) {
  useOwnLinks(pid);
  const cmd = (i: Instrument) => `${i.display} ${screen.pendingTail || defaultCode(i)}`.trim();
  const picks = screen.matches.slice(0, 80);
  const extra = screen.suggestions ?? [];
  useEffect(() => {
    register([
      ...picks.map((m, i) => ({ n: i + 1, label: m.display, command: cmd(m) })),
      ...extra.map((s, i) => ({ n: picks.length + i + 1, label: s, command: s })),
    ]);
  });
  return (
    <div className="picks">
      <div className="strip">
        <span>
          {picks.length
            ? `${screen.matches.length} matches for "${screen.query}". Type a number to pick one.`
            : (screen.message ?? `No matches for "${screen.query}".`)}
        </span>
      </div>
      {screen.message && picks.length > 0 && <div className="dim">{screen.message}</div>}
      <ol className="results" aria-label="Matches">
        {picks.map((m, i) => (
          <li key={m.id}>
            <Link n={i + 1} label="" onClick={() => run(cmd(m))} />
            <span className="badge">{m.asset_class}</span> <strong>{m.display}</strong>{" "}
            <span className="dim">
              {m.name}
              {m.mic ? ` · ${m.mic}` : ""}
            </span>
          </li>
        ))}
      </ol>
      {extra.length > 0 && (
        <div className="links col">
          <span className="dim">{picks.length ? "Or:" : "Did you mean:"}</span>
          {extra.map((s, i) => (
            <Link key={s} n={picks.length + i + 1} label={s} onClick={() => run(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Planned({
  pid,
  screen,
  register,
  run,
}: {
  pid: string;
  screen: Extract<Screen, { kind: "planned" }>;
  register: (l: HotLink[]) => void;
  run: (c: string) => void;
}) {
  useOwnLinks(pid);
  const c = CATALOG_BY_CODE.get(screen.code);
  useEffect(() => {
    register([{ n: 1, label: "Help", command: `HELP ${screen.code}` }]);
  }, [screen.code, register]);
  return (
    <div className="planned">
      <p>
        <code>{screen.code}</code> ({c?.title}) arrives in Phase {c?.phase}. It will use {c?.data}.
      </p>
      {screen.instrument && <p className="dim">Loaded security: {screen.instrument.display}</p>}
      <Link n={1} label={`HELP ${screen.code}`} onClick={() => run(`HELP ${screen.code}`)} />
    </div>
  );
}

function ErrorScreen({
  pid,
  screen,
  register,
  run,
}: {
  pid: string;
  screen: Extract<Screen, { kind: "error" }>;
  register: (l: HotLink[]) => void;
  run: (c: string) => void;
}) {
  useOwnLinks(pid);
  useEffect(() => {
    register(screen.suggestions.map((s, i) => ({ n: i + 1, label: s, command: s })));
  }, [screen.suggestions, register]);
  return (
    <div className="error-screen" role="alert">
      <p>{screen.message}</p>
      {screen.suggestions.length > 0 && (
        <div className="links col">
          <span className="dim">Did you mean:</span>
          {screen.suggestions.map((s, i) => (
            <Link key={s} n={i + 1} label={s} onClick={() => run(s)} />
          ))}
        </div>
      )}
    </div>
  );
}
