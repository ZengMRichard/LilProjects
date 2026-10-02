// Layouts, panel commands and tiles save as a named workspace; the last one restores on start.
// The URL fragment mirrors each panel's command so a view can be bookmarked or shared locally.
import { api } from "../data/api";
import { type Density, type Theme, usePrefs } from "../ui/prefs";
import { restore } from "./run";
import { current, PANEL_IDS, type PanelId, type Tile, useShell } from "./store";

export interface Workspace {
  panels: Partial<Record<PanelId, string>>;
  focus: PanelId;
  tiles: Tile[];
  theme: Theme;
  cvd: boolean;
  density: Density;
}

export const DEFAULT_WORKSPACE: Workspace = {
  panels: {
    1: "AAPL US EQUITY CHRT 1Y",
    2: "AAPL US EQUITY DESC",
    3: "SPX INDEX HIST",
    4: "WMON",
  },
  focus: 1,
  tiles: [],
  theme: "dark",
  cvd: false,
  density: "compact",
};

export function snapshot(): Workspace {
  const st = useShell.getState();
  const prefs = usePrefs.getState();
  const panels: Workspace["panels"] = {};
  for (const id of PANEL_IDS) {
    const s = current(st.panels[id]);
    if (s.command && s.kind !== "loading") panels[id] = s.command;
  }
  return {
    panels,
    focus: st.focus,
    tiles: st.tiles,
    theme: prefs.theme,
    cvd: prefs.cvd,
    density: prefs.density,
  };
}

export function fragmentFor(ws: Pick<Workspace, "panels" | "focus">): string {
  const parts = PANEL_IDS.flatMap((id) =>
    ws.panels[id] ? [`p${id}=${encodeURIComponent(ws.panels[id]!)}`] : [],
  );
  parts.push(`f=${ws.focus}`);
  return parts.join("&");
}

export function parseFragment(hash: string): Partial<Workspace> | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const panels: Workspace["panels"] = {};
  let any = false;
  for (const id of PANEL_IDS) {
    const v = params.get(`p${id}`);
    if (v) {
      panels[id] = v;
      any = true;
    }
  }
  if (!any) return null;
  const f = Number(params.get("f"));
  return { panels, focus: (PANEL_IDS.includes(f as PanelId) ? f : 1) as PanelId };
}

export function workspaceLink(): string {
  return `${location.origin}${location.pathname}#${fragmentFor(snapshot())}`;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let restoring = false;

export function scheduleSave() {
  if (restoring) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ws = snapshot();
    history.replaceState(null, "", `#${fragmentFor(ws)}`);
    void api.putState("workspaces", "last", ws).catch(() => {});
  }, 400);
}

export async function loadWorkspace(): Promise<void> {
  restoring = true;
  try {
    let saved: Partial<Workspace> | undefined;
    try {
      saved = (await api.getState<Workspace>("workspaces")).last;
    } catch {
      saved = undefined;
    }
    const fromUrl = parseFragment(location.hash);
    const ws: Workspace = { ...DEFAULT_WORKSPACE, ...saved, ...fromUrl } as Workspace;
    usePrefs.getState().setPrefs({ theme: ws.theme, cvd: ws.cvd, density: ws.density });
    const st = useShell.getState();
    st.setTiles(ws.tiles ?? []);
    st.setFocus(ws.focus ?? 1);
    await restore(ws.panels ?? {});
  } finally {
    restoring = false;
  }
  scheduleSave();
}

export function watchWorkspace() {
  const a = useShell.subscribe((s, prev) => {
    if (s.panels !== prev.panels || s.focus !== prev.focus || s.tiles !== prev.tiles)
      scheduleSave();
  });
  const b = usePrefs.subscribe(() => scheduleSave());
  return () => {
    a();
    b();
  };
}
