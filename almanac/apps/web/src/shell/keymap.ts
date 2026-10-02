// Global keymap. Every action works without a mouse; one command line reaches any screen.
import { MANIFEST_BY_CODE } from "../functions/registry";
import { runCommand, setParam } from "./run";
import { current, PANEL_IDS, type PanelId, useShell } from "./store";
import { exportPanel } from "./toolbar";

export const KEYMAP: { action: string; keys: string }[] = [
  { action: "Run the command", keys: "Enter" },
  { action: "Close suggestions, then clear", keys: "Esc" },
  { action: "Focus the command bar", keys: "/ or Ctrl+K" },
  { action: "Focus panel 1 to 4", keys: "Alt+1 to Alt+4" },
  { action: "Back and forward within a panel", keys: "Ctrl+[ and Ctrl+]" },
  { action: "Help for the current function", keys: "F1, or ? outside a text field" },
  { action: "Previous or next page of results", keys: "Page Up, Page Down" },
  { action: "Previous or next page tab", keys: "Ctrl+Left, Ctrl+Right" },
  { action: "Command history", keys: "Up, Down in the command bar" },
  { action: "Export (CSV with Shift)", keys: "Ctrl+E, Ctrl+Shift+E" },
  { action: "Copy grid as tab-separated text", keys: "Ctrl+C in a grid" },
];

export function focusCommandBar() {
  document.getElementById("command-input")?.focus();
}

function inTextField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function switchPage(panel: PanelId, d: -1 | 1) {
  const s = current(useShell.getState().panels[panel]);
  if (s.kind !== "function") return false;
  const m = MANIFEST_BY_CODE.get(s.code);
  const spec = m?.params.find((p) => p.name === "page");
  if (!m?.pages || !spec?.values) return false;
  const i = spec.values.indexOf(s.params.page ?? spec.default ?? spec.values[0]);
  const next = spec.values[(i + d + spec.values.length) % spec.values.length];
  setParam(panel, "page", next);
  return true;
}

export function onGlobalKey(e: KeyboardEvent) {
  const st = useShell.getState();
  const panel = st.focus;
  const text = inTextField(e.target);
  const cmdEmpty = !(document.getElementById("command-input") as HTMLInputElement | null)?.value;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    return focusCommandBar();
  }
  if (e.key === "/" && !text) {
    e.preventDefault();
    return focusCommandBar();
  }
  if (e.altKey && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    return st.setFocus(Number(e.key) as PanelId);
  }
  if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
    e.preventDefault(); // macOS Option+digit types a symbol; use the physical key
    return st.setFocus(Number(e.code.slice(5)) as PanelId);
  }
  if (e.ctrlKey && e.key === "[") {
    e.preventDefault();
    return st.back(panel);
  }
  if (e.ctrlKey && e.key === "]") {
    e.preventDefault();
    return st.forward(panel);
  }
  if (e.key === "F1" || (e.key === "?" && !text)) {
    e.preventDefault();
    const s = current(st.panels[panel]);
    void runCommand(
      s.kind === "function" || s.kind === "planned" ? `HELP ${s.code}` : "HELP",
      panel,
    );
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    return exportPanel(panel, e.shiftKey ? "csv" : undefined);
  }
  if (e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && (!text || cmdEmpty)) {
    if (switchPage(panel, e.key === "ArrowLeft" ? -1 : 1)) e.preventDefault();
    return;
  }
  if ((e.key === "PageDown" || e.key === "PageUp") && (!text || cmdEmpty)) {
    const body = document.querySelector<HTMLElement>(
      `[data-panel="${panel}"] .vgrid, [data-panel="${panel}"] .panel-body`,
    );
    if (body) {
      e.preventDefault();
      body.scrollBy({ top: (e.key === "PageDown" ? 1 : -1) * body.clientHeight * 0.9 });
    }
    return;
  }
  // Typing anywhere outside a field goes to the command bar.
  if (!text && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    focusCommandBar();
  }
}

export const panelIds = PANEL_IDS;
