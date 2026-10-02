import { create } from "zustand";
import type { Instrument } from "../data/api";
import type { ExportSource, HotLink } from "../functions/types";
import { type Aliases, emptyAliases } from "../grammar/parse";

export type PanelId = 1 | 2 | 3 | 4;
export const PANEL_IDS: PanelId[] = [1, 2, 3, 4];

export type Screen =
  | { kind: "blank"; command: "" }
  | { kind: "loading"; command: string }
  | {
      kind: "function";
      code: string;
      instrument?: Instrument;
      params: Record<string, string>;
      command: string;
    }
  | {
      kind: "picks";
      query: string;
      matches: Instrument[];
      pendingTail: string; // function and arguments to run against the pick
      message?: string | null;
      suggestions?: string[]; // nearby function codes and a HELP search
      command: string;
    }
  | { kind: "planned"; code: string; instrument?: Instrument; command: string }
  | { kind: "error"; message: string; suggestions: string[]; command: string };

export interface PanelState {
  id: PanelId;
  stack: Screen[];
  index: number;
  loaded?: Instrument; // the panel's current security sticks across commands
}

export interface Tile {
  id: string;
  command: string;
}

interface ShellState {
  panels: Record<PanelId, PanelState>;
  focus: PanelId;
  tiles: Tile[];
  aliases: Aliases;
  noticeAck: boolean;
  settingsOpen: boolean;
  aboutOpen: boolean;
  toast: string | null;
  setFocus: (p: PanelId) => void;
  push: (p: PanelId, s: Screen) => void;
  replace: (p: PanelId, s: Screen) => void;
  back: (p: PanelId) => void;
  forward: (p: PanelId) => void;
  setPrefs: (v: Partial<Pick<ShellState, "noticeAck" | "aliases">>) => void;
  setTiles: (t: Tile[]) => void;
  setOverlay: (v: Partial<Pick<ShellState, "settingsOpen" | "aboutOpen">>) => void;
  setToast: (t: string | null) => void;
}

const blank = (id: PanelId): PanelState => ({
  id,
  stack: [{ kind: "blank", command: "" }],
  index: 0,
});

export const MAX_STACK = 50;

export const useShell = create<ShellState>((set) => ({
  panels: { 1: blank(1), 2: blank(2), 3: blank(3), 4: blank(4) },
  focus: 1,
  tiles: [],
  aliases: emptyAliases(),
  noticeAck: true,
  settingsOpen: false,
  aboutOpen: false,
  toast: null,
  setFocus: (focus) => set({ focus }),
  push: (id, s) =>
    set((st) => {
      const p = st.panels[id];
      const cur = p.stack[p.index];
      // a loading placeholder is replaced, not stacked
      const base =
        cur?.kind === "loading" || cur?.kind === "blank"
          ? p.stack.slice(0, p.index)
          : p.stack.slice(0, p.index + 1);
      const stack = [...base, s].slice(-MAX_STACK);
      const loaded = "instrument" in s && s.instrument ? s.instrument : p.loaded;
      return { panels: { ...st.panels, [id]: { ...p, stack, index: stack.length - 1, loaded } } };
    }),
  replace: (id, s) =>
    set((st) => {
      const p = st.panels[id];
      const stack = [...p.stack];
      stack[p.index] = s;
      const loaded = "instrument" in s && s.instrument ? s.instrument : p.loaded;
      return { panels: { ...st.panels, [id]: { ...p, stack, loaded } } };
    }),
  back: (id) =>
    set((st) => {
      const p = st.panels[id];
      if (p.index === 0) return st;
      return { panels: { ...st.panels, [id]: { ...p, index: p.index - 1 } } };
    }),
  forward: (id) =>
    set((st) => {
      const p = st.panels[id];
      if (p.index >= p.stack.length - 1) return st;
      return { panels: { ...st.panels, [id]: { ...p, index: p.index + 1 } } };
    }),
  setPrefs: (v) => set(v),
  setTiles: (tiles) => set({ tiles }),
  setOverlay: (v) => set(v),
  setToast: (toast) => set({ toast }),
}));

export const current = (p: PanelState): Screen => p.stack[p.index];

// Hot links and exports change with every render of a view, so they live outside React state.
export const hotLinks = new Map<string, HotLink[]>();
export const exporters = new Map<string, ExportSource | null>();
