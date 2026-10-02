import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../data/api";
import { useSymbols } from "../data/hooks";
import { CATALOG } from "../functions/catalog";
import { MANIFESTS } from "../functions/registry";
import { type Suggestion, suggest } from "../grammar/autocomplete";
import { grammarContext, runCommand } from "./run";
import { current, useShell } from "./store";

const DEBOUNCE_MS = 50;

export function CommandBar() {
  const focus = useShell((s) => s.focus);
  const panel = useShell((s) => s.panels[s.focus]);
  const aliases = useShell((s) => s.aliases);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const [histIdx, setHistIdx] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const symbols = useSymbols();
  const recent = useQuery({
    queryKey: ["history"],
    queryFn: () => api.history(50),
    staleTime: 5_000,
  });
  const screen = current(panel);
  const loaded = "instrument" in screen && screen.instrument ? screen.instrument : panel.loaded;

  // Up/Down cycle the focused panel's own history, newest first.
  const panelHistory = useMemo(
    () =>
      [...panel.stack]
        .map((s) => s.command)
        .filter(Boolean)
        .reverse(),
    [panel.stack],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: aliases feed grammarContext
  useEffect(() => {
    const t = setTimeout(() => {
      if (!open) return;
      setRows(
        suggest(text, {
          symbols: symbols.data ?? [],
          manifests: MANIFESTS,
          catalog: CATALOG,
          recent: [...new Set((recent.data ?? []).map((r) => r.command))],
          ctx: grammarContext(),
        }),
      );
      setSel(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, open, symbols.data, recent.data, aliases]);

  // Switching panels starts history browsing over.
  const [histFor, setHistFor] = useState(focus);
  if (histFor !== focus) {
    setHistFor(focus);
    setHistIdx(-1);
  }

  const runIt = (cmd: string) => {
    setText("");
    setOpen(false);
    setHistIdx(-1);
    void runCommand(cmd, focus).then(() => recent.refetch());
  };

  const accept = (s: Suggestion) => {
    setText(s.insert);
    setSel(-1);
    input.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const visible = open && rows.length > 0;
    if (e.key === "Enter") {
      e.preventDefault();
      if (visible && sel >= 0) {
        const s = rows[sel];
        runIt(s.badge === "SEARCH" ? s.insert : s.insert.trim());
      } else runIt(text);
    } else if (e.key === "Tab") {
      if (visible) {
        e.preventDefault();
        accept(rows[Math.max(sel, 0)]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (visible) setOpen(false);
      else {
        setText("");
        setHistIdx(-1);
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (visible && (sel >= 0 || text)) {
        setSel((i) => Math.min(rows.length - 1, Math.max(-1, i + d)));
      } else {
        const next = Math.min(panelHistory.length - 1, Math.max(-1, histIdx - d));
        setHistIdx(next);
        setText(next >= 0 ? panelHistory[next] : "");
        setOpen(false);
      }
    }
  };

  return (
    <div className="command-bar" role="search">
      <span className="pnum focused" title="Focused panel (Alt+1 to Alt+4)">
        {focus}
      </span>
      {loaded && (
        <span className="chip" title={loaded.name}>
          {loaded.display}
        </span>
      )}
      <div className="cmd-wrap">
        <input
          id="command-input"
          ref={input}
          role="combobox"
          aria-label="Command"
          aria-expanded={open && rows.length > 0}
          aria-controls="suggestions"
          aria-autocomplete="list"
          aria-activedescendant={sel >= 0 ? `sugg-${sel}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder="Security, function, number or search: AAPL US EQUITY CHRT 5Y"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(!!text)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          autoFocus
        />
        {open && rows.length > 0 && (
          <div id="suggestions" className="suggestions" role="listbox">
            {rows.map((r, i) => (
              <div
                key={`${r.badge}${r.label}`}
                id={`sugg-${i}`}
                role="option"
                aria-selected={i === sel}
                className={i === sel ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (r.badge === "SEARCH") runIt(r.insert);
                  else accept(r);
                }}
              >
                <span className={`badge b-${r.badge.toLowerCase()}`}>{r.badge}</span>
                <span className="label">{r.label}</span>
                <span className="detail">{r.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="hints dim">Enter runs · Esc clears · Tab completes</span>
    </div>
  );
}
