import { useEffect, useState } from "react";
import { ApiError, api } from "../data/api";
import { useSession } from "../data/hooks";
import { stream } from "../data/stream";
import { usePrefs } from "../ui/prefs";
import { CommandBar } from "./CommandBar";
import { KEYMAP, onGlobalKey } from "./keymap";
import { Panel } from "./Panel";
import { onToolbar } from "./run";
import { StatusBar } from "./StatusBar";
import { PANEL_IDS, useShell } from "./store";
import { Tiles } from "./Tiles";
import { toolbar } from "./toolbar";
import { loadWorkspace, watchWorkspace } from "./workspace";

let booted = false; // StrictMode runs effects twice in development; boot once

export function App() {
  const session = useSession();
  const theme = usePrefs((s) => s.theme);
  const cvd = usePrefs((s) => s.cvd);
  const density = usePrefs((s) => s.density);
  const toast = useShell((s) => s.toast);
  const setToast = useShell((s) => s.setToast);
  const noticeAck = useShell((s) => s.noticeAck);
  const settingsOpen = useShell((s) => s.settingsOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.dataset.cvd = String(cvd);
    el.dataset.density = density;
  }, [theme, cvd, density]);

  useEffect(() => {
    onToolbar(toolbar);
    window.addEventListener("keydown", onGlobalKey);
    stream.start();
    let unwatch = () => {};
    if (booted) {
      unwatch = watchWorkspace();
      setReady(true);
      return () => {
        window.removeEventListener("keydown", onGlobalKey);
        unwatch();
      };
    }
    booted = true;
    (async () => {
      try {
        const [aliases, settings] = await Promise.all([
          api.getState<Record<string, string>>("aliases"),
          api.getState("settings"),
        ]);
        useShell.getState().setPrefs({
          aliases: {
            functions: aliases.functions ?? {},
            sectors: aliases.sectors ?? {},
            securities: aliases.securities ?? {},
          },
          noticeAck: !!settings.notice_ack,
        });
      } catch {
        /* the session error banner explains why */
      }
      await loadWorkspace().catch(() => {});
      unwatch = watchWorkspace();
      setReady(true);
    })();
    return () => {
      window.removeEventListener("keydown", onGlobalKey);
      unwatch();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (session.error instanceof ApiError && session.error.status === 401) {
    return (
      <div className="fatal" role="alert">
        <h1>Almanac</h1>
        <p>This page has no valid session token.</p>
        <p>
          Start the server with <code>almanac start</code> (or <code>almanac demo</code>) and open
          the link it prints. Tokens change on every start.
        </p>
      </div>
    );
  }

  const demo = session.data?.mode === "demo";
  return (
    <div className="app" data-ready={ready}>
      {!noticeAck && <Notice />}
      <CommandBar />
      <main className="workspace">
        <div className="dock">
          {PANEL_IDS.map((id) => (
            <Panel key={id} id={id} demo={demo} />
          ))}
        </div>
        <Tiles />
      </main>
      <StatusBar />
      {settingsOpen && <Settings />}
      <div className="toast" role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function Notice() {
  const ack = () => {
    useShell.getState().setPrefs({ noticeAck: true });
    void api.putState("settings", "notice_ack", true).catch(() => {});
  };
  return (
    <div className="notice-bar" role="note">
      <span>
        <strong>Data may be delayed or wrong. Nothing in Almanac is investment advice.</strong> Demo
        mode uses synthetic prices. No telemetry is collected.
      </span>
      <button type="button" onClick={ack}>
        Got it
      </button>
    </div>
  );
}

const close = () => useShell.getState().setOverlay({ settingsOpen: false });

function Settings() {
  const prefs = usePrefs();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="dialog">
        <h2>Settings</h2>
        <fieldset>
          <legend>Theme</legend>
          {(["dark", "light"] as const).map((t) => (
            <label key={t}>
              <input
                type="radio"
                name="theme"
                checked={prefs.theme === t}
                onChange={() => prefs.setPrefs({ theme: t })}
              />{" "}
              Almanac {t === "dark" ? "Dark" : "Light"}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Colors</legend>
          <label>
            <input
              type="checkbox"
              checked={prefs.cvd}
              onChange={(e) => prefs.setPrefs({ cvd: e.target.checked })}
            />{" "}
            Color-vision-deficiency palette (blue up, orange down)
          </label>
        </fieldset>
        <fieldset>
          <legend>Row density</legend>
          {(["compact", "comfortable"] as const).map((d) => (
            <label key={d}>
              <input
                type="radio"
                name="density"
                checked={prefs.density === d}
                onChange={() => prefs.setPrefs({ density: d })}
              />{" "}
              {d}
            </label>
          ))}
        </fieldset>
        <h3>Keys</h3>
        <table className="kv">
          <tbody>
            {KEYMAP.map((k) => (
              <tr key={k.action}>
                <th>{k.action}</th>
                <td className="txt">{k.keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={close} autoFocus>
          Close (Esc)
        </button>
      </div>
    </div>
  );
}
