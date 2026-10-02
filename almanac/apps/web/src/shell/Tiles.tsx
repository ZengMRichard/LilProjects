import { useQuery } from "@tanstack/react-query";
import { api } from "../data/api";
import { MANIFEST_BY_CODE } from "../functions/registry";
import { parse } from "../grammar/parse";
import { fmtTime } from "../ui/format";
import { FunctionHost } from "./Panel";
import { grammarContext, runCommand } from "./run";
import { useNow } from "./StatusBar";
import { useShell } from "./store";

const CLOCKS: [string, string][] = [
  ["NY", "America/New_York"],
  ["LDN", "Europe/London"],
  ["FRA", "Europe/Berlin"],
  ["TYO", "Asia/Tokyo"],
  ["HKG", "Asia/Hong_Kong"],
];

/** Always-on components beside the panels: watchlist, headlines, clocks and pinned tiles. */
export function Tiles() {
  const tiles = useShell((s) => s.tiles);
  const setTiles = useShell((s) => s.setTiles);
  const focus = useShell((s) => s.focus);
  return (
    <aside className="tiles" aria-label="Tiles">
      <section className="tile">
        <header>Watchlist</header>
        <TileFunction id="tile-wmon" command="WMON" />
      </section>
      <section className="tile">
        <header>Headlines</header>
        <div className="dim small">
          Headlines arrive with <code>NEWS</code> in Phase 2, from news APIs, RSS feeds you add and
          SEC 8-K filings.
        </div>
      </section>
      <section className="tile">
        <header>World clocks</header>
        <WorldClocks />
      </section>
      {tiles.map((t) => (
        <section className="tile" key={t.id}>
          <header>
            <button
              type="button"
              className="link"
              tabIndex={-1}
              onClick={() => void runCommand(t.command, focus)}
            >
              {t.command}
            </button>
            <button
              type="button"
              className="link close"
              aria-label={`Unpin ${t.command}`}
              tabIndex={-1}
              onClick={() => setTiles(tiles.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </header>
          <TileFunction id={t.id} command={t.command} />
        </section>
      ))}
    </aside>
  );
}

/** Renders a function command in compact form. Securities resolve once and are cached. */
function TileFunction({ id, command }: { id: string; command: string }) {
  const p = parse(command, grammarContext());
  const security = p.kind === "invocation" && p.security ? `${p.security} ${p.sector}` : null;
  const res = useQuery({
    queryKey: ["resolve", security],
    queryFn: () => api.resolve(security!),
    enabled: !!security,
    staleTime: Infinity,
  });
  if (p.kind !== "invocation" || !p.code) return null;
  const m = MANIFEST_BY_CODE.get(p.code);
  if (!m) return <div className="dim small">{p.code} is not built yet.</div>;
  if (security && !res.data?.exact)
    return (
      <div className="dim small">{res.isPending ? "Loading…" : `${security} did not resolve`}</div>
    );
  const params: Record<string, string> = Object.fromEntries(
    m.params.filter((x) => x.default !== undefined).map((x) => [x.name, x.default!]),
  );
  Object.assign(params, p.named);
  const positional = m.params.filter((x) => x.positional !== undefined);
  p.positional.forEach((v, i) => {
    if (positional[i])
      params[positional[i].name] =
        positional[i].values?.find((x) => x.toUpperCase() === v.toUpperCase()) ?? v;
  });
  return (
    <div className="tile-body">
      <FunctionHost
        id={id}
        m={m}
        screen={{
          kind: "function",
          code: m.code,
          instrument: res.data?.exact ?? undefined,
          params,
          command,
        }}
        register={() => {}}
        run={(c) => void runCommand(c, useShell.getState().focus)}
        compact
      />
    </div>
  );
}

function WorldClocks() {
  const now = useNow();
  return (
    <div className="clock-grid">
      {CLOCKS.map(([label, tz]) => (
        <div key={tz}>
          <span className="dim">{label}</span> <span className="num">{fmtTime(now, tz)}</span>
        </div>
      ))}
    </div>
  );
}
