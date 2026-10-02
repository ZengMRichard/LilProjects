// Panel toolbar: 90 refresh, 95 pin as tile, 96 copy link, 97 settings, 98 export, 99 help.
import { queryClient } from "../data/hooks";
import { MANIFEST_BY_CODE } from "../functions/registry";
import { exportCsv, exportPng } from "../ui/export";
import { runCommand } from "./run";
import { current, exporters, type PanelId, useShell } from "./store";
import { workspaceLink } from "./workspace";

const TERMS = "Provider terms govern what you share.";

export function exportPanel(panel: PanelId, format?: "csv" | "png") {
  const st = useShell.getState();
  const s = current(st.panels[panel]);
  const src = exporters.get(String(panel));
  const m = s.kind === "function" ? MANIFEST_BY_CODE.get(s.code) : undefined;
  if (!src || !m?.exports.length) {
    st.setToast(`Nothing to export on panel ${panel}.`);
    return;
  }
  // The manifest lists its preferred format first; Ctrl+Shift+E always asks for CSV.
  const first = m.exports.find((f) => f === "csv" || f === "png");
  const want = format ?? first ?? "csv";
  if (!m.exports.includes(want)) {
    st.setToast(`${m.code} does not export ${want.toUpperCase()}.`);
    return;
  }
  const ok = want === "png" ? exportPng(src) : exportCsv(src);
  st.setToast(
    ok ? `Exported ${src.title} as ${want.toUpperCase()}. ${TERMS}` : `Could not export ${want}.`,
  );
}

export function toolbar(action: string, panel: PanelId) {
  const st = useShell.getState();
  const s = current(st.panels[panel]);
  st.setFocus(panel);
  switch (action) {
    case "refresh":
      void queryClient.invalidateQueries();
      st.setToast(`Refreshed panel ${panel}.`);
      break;
    case "pin": {
      if (s.kind !== "function") return st.setToast("Only a function screen can be pinned.");
      const id = `t${Date.now().toString(36)}`;
      st.setTiles([...st.tiles, { id, command: s.command }]);
      st.setToast(`Pinned ${s.command} as a tile.`);
      break;
    }
    case "link": {
      const url = workspaceLink();
      void navigator.clipboard?.writeText(url).then(
        () => st.setToast("Copied a link to this workspace."),
        () => st.setToast(url),
      );
      break;
    }
    case "settings":
      st.setOverlay({ settingsOpen: true });
      break;
    case "export":
      exportPanel(panel);
      break;
    case "help":
      void runCommand(
        s.kind === "function" || s.kind === "planned" ? `HELP ${s.code}` : "HELP",
        panel,
      );
      break;
  }
}
