// The lifecycle of one command: parse, resolve the security, find the manifest, validate the
// asset class and arguments, then push a screen onto the panel's history.
import { api, type Instrument } from "../data/api";
import { CATALOG_BY_CODE } from "../functions/catalog";
import { ALL_CODES, MANIFEST_BY_CODE } from "../functions/registry";
import { bindArgs, formatArgs, nearest } from "../grammar/bind";
import { defaultCode } from "../grammar/defaults";
import { type GrammarContext, parse } from "../grammar/parse";
import { current, hotLinks, type PanelId, type Screen, useShell } from "./store";

export function grammarContext(): GrammarContext {
  const { aliases } = useShell.getState();
  return { codes: ALL_CODES, aliases };
}

const TOOLBAR: Record<number, string> = {
  90: "refresh",
  95: "pin",
  96: "link",
  97: "settings",
  98: "export",
  99: "help",
};

type ToolbarHandler = (action: string, panel: PanelId) => void;
let toolbarHandler: ToolbarHandler = () => {};
export function onToolbar(h: ToolbarHandler) {
  toolbarHandler = h;
}

let recordHistory = true;

export async function runCommand(text: string, panel: PanelId, opts: { record?: boolean } = {}) {
  const st = useShell.getState();
  const parsed = parse(text, grammarContext());
  const push = (s: Screen) => st.push(panel, s);

  if (parsed.kind === "empty") return;
  if (parsed.kind === "hotlink") {
    if (TOOLBAR[parsed.n]) return toolbarHandler(TOOLBAR[parsed.n], panel);
    const link = (hotLinks.get(String(panel)) ?? []).find((l) => l.n === parsed.n);
    if (link) return runCommand(link.command, panel, opts);
    st.setToast(`No link ${parsed.n} on panel ${panel}`);
    return;
  }

  const shouldRecord = (opts.record ?? true) && recordHistory;
  if (shouldRecord) void api.addHistory(String(panel), text.trim()).catch(() => {});

  if (parsed.kind === "search") {
    push({ kind: "loading", command: text });
    try {
      const r = await api.resolve(parsed.text);
      const words = parsed.text.split(" ");
      const codes = words.length === 1 ? nearest(words[0], [...ALL_CODES], 3) : [];
      st.replace(panel, {
        kind: "picks",
        query: parsed.text,
        matches: r.matches ?? [],
        pendingTail: "",
        message: r.message,
        suggestions: [...codes, `HELP ${parsed.text}`],
        command: text.trim(),
      });
    } catch (e) {
      st.replace(panel, errorScreen(text, `Search failed: ${(e as Error).message}`));
    }
    return;
  }

  // invocation
  let inst: Instrument | undefined;
  const tail = [
    parsed.code ?? "",
    ...parsed.positional,
    ...Object.entries(parsed.named).map(([k, v]) =>
      /[\s,]/.test(v) ? `${k}="${v}"` : `${k}=${v}`,
    ),
  ]
    .filter(Boolean)
    .join(" ");

  if (parsed.security) {
    push({ kind: "loading", command: text });
    const q = `${parsed.security} ${parsed.sector}`;
    try {
      const r = await api.resolve(q);
      if (!r.exact) {
        st.replace(panel, {
          kind: "picks",
          query: q,
          matches: r.matches ?? [],
          pendingTail: tail,
          message: r.message ?? (r.matches?.length ? null : `Nothing matches ${q}.`),
          command: text.trim(),
        });
        return;
      }
      inst = r.exact;
    } catch (e) {
      st.replace(panel, errorScreen(text, `Could not resolve ${q}: ${(e as Error).message}`));
      return;
    }
  }

  const code = parsed.code ?? (inst ? defaultCode(inst) : null);
  if (!code) return push(errorScreen(text, "Type a function code or a security."));

  const m = MANIFEST_BY_CODE.get(code);
  const show = (s: Screen) => (parsed.security ? st.replace(panel, s) : push(s));
  if (!m) {
    const planned = CATALOG_BY_CODE.get(code);
    if (planned)
      return show({
        kind: "planned",
        code,
        instrument: inst ?? st.panels[panel].loaded,
        command: text.trim(),
      });
    return show({
      kind: "error",
      message: `Unknown function ${code}.`,
      suggestions: [...nearest(code, [...ALL_CODES]), `HELP ${code}`],
      command: text.trim(),
    });
  }

  if (m.kind === "security") {
    inst = inst ?? st.panels[panel].loaded;
    if (!inst)
      return show(
        errorScreen(text, `${code} needs a security, for example AAPL US EQUITY ${code}.`, [
          `AAPL US EQUITY ${tail}`,
        ]),
      );
    if (m.assetClasses && !m.assetClasses.includes(inst.asset_class)) {
      const fix = defaultCode(inst);
      return show(
        errorScreen(
          text,
          `${code} works on ${m.assetClasses.join(", ")}, not ${inst.asset_class}.`,
          [`${inst.display} ${fix}`],
        ),
      );
    }
  }

  const bound = bindArgs(m, parsed.positional, parsed.named);
  if (!bound.ok) return show(errorScreen(text, bound.error, bound.suggestions));

  const args = formatArgs(m, bound.params);
  const canonical = [m.kind === "security" && inst ? inst.display : "", code, args]
    .filter(Boolean)
    .join(" ");
  show({
    kind: "function",
    code,
    instrument: m.kind === "security" ? inst : undefined,
    params: bound.params,
    command: canonical,
  });
}

function errorScreen(text: string, message: string, suggestions: string[] = []): Screen {
  return { kind: "error", message, suggestions, command: text.trim() };
}

/** Re-run the focused screen with one parameter changed (range buttons, tabs, fields). */
export function setParam(panel: PanelId, name: string, value: string) {
  const st = useShell.getState();
  const s = current(st.panels[panel]);
  if (s.kind !== "function") return;
  const m = MANIFEST_BY_CODE.get(s.code);
  if (!m) return;
  const params = { ...s.params, [name]: value };
  const command = [s.instrument?.display, s.code, formatArgs(m, params)].filter(Boolean).join(" ");
  st.replace(panel, { ...s, params, command });
}

/** Restore commands without writing them to history. */
export async function restore(commands: Partial<Record<PanelId, string>>) {
  recordHistory = false;
  try {
    await Promise.all(
      Object.entries(commands).map(([p, c]) => (c ? runCommand(c, Number(p) as PanelId) : null)),
    );
  } finally {
    recordHistory = true;
  }
}
