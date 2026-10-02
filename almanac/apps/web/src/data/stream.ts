// One WebSocket per tab carries every live value. Panels subscribe through here; the client
// reference-counts each instrument-field pair, so the server sees one subscription per pair.

import { token } from "./api";

export type StreamMode = "live" | "delayed" | "polled" | "demo" | "unavailable";
export type ConnState = "connecting" | "open" | "reconnecting" | "closed";

export interface LiveQuote {
  v: Record<string, number | null>;
  ts: string;
  prov: string;
  mode?: StreamMode;
  reason?: string;
}

type Listener = () => void;

const HEARTBEAT_MS = 15_000;
const BACKOFF_START_MS = 500;
const BACKOFF_CAP_MS = 30_000;

export class StreamClient {
  private ws: WebSocket | null = null;
  private req = 0;
  private refs = new Map<string, Map<string, number>>(); // id -> field -> count
  private quotes = new Map<string, LiveQuote>();
  private idListeners = new Map<string, Set<Listener>>();
  private stateListeners = new Set<Listener>();
  private backoff = BACKOFF_START_MS;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  state: ConnState = "closed";
  ticks = 0; // total ticks received, for update-rate readouts

  constructor(private url: () => string) {}

  start() {
    if (!this.stopped && this.ws) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  private setState(s: ConnState) {
    this.state = s;
    for (const l of this.stateListeners) l();
  }

  private connect() {
    if (typeof WebSocket === "undefined") return;
    this.setState(this.state === "closed" ? "connecting" : "reconnecting");
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = BACKOFF_START_MS;
      this.setState("open");
      const byFields = new Map<string, string[]>();
      for (const [id, fields] of this.refs) {
        const key = [...fields.keys()].sort().join(",");
        byFields.set(key, [...(byFields.get(key) ?? []), id]);
      }
      for (const [key, ids] of byFields) this.send({ op: "sub", ids, fields: key.split(",") });
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send({ op: "ping", t: Date.now() }), HEARTBEAT_MS);
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      if (ws !== this.ws) return; // a socket we already replaced
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.stopped) return this.setState("closed");
      this.setState("reconnecting");
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, BACKOFF_CAP_MS);
    };
  }

  private send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, req: ++this.req }));
    }
  }

  private onMessage(m: {
    op: string;
    id?: string;
    v?: Record<string, number>;
    ts?: string;
    prov?: string;
    mode?: Record<string, StreamMode>;
    state?: StreamMode;
    reason?: string;
  }) {
    if (m.op === "tick" && m.id) {
      this.ticks++;
      const prev = this.quotes.get(m.id);
      this.quotes.set(m.id, {
        v: { ...prev?.v, ...m.v },
        ts: m.ts ?? "",
        prov: m.prov ?? "",
        mode: prev?.mode,
      });
      this.emit(m.id);
    } else if (m.op === "ack" && m.mode) {
      for (const [id, mode] of Object.entries(m.mode)) {
        const prev = this.quotes.get(id);
        this.quotes.set(id, { v: prev?.v ?? {}, ts: prev?.ts ?? "", prov: prev?.prov ?? "", mode });
        this.emit(id);
      }
    } else if (m.op === "status" && m.id) {
      const prev = this.quotes.get(m.id);
      this.quotes.set(m.id, {
        v: prev?.v ?? {},
        ts: prev?.ts ?? "",
        prov: prev?.prov ?? "",
        mode: m.state,
        reason: m.reason,
      });
      this.emit(m.id);
    }
  }

  private emit(id: string) {
    for (const l of this.idListeners.get(id) ?? []) l();
  }

  /** Subscribe ids x fields; returns an unsubscribe function. */
  subscribe(ids: string[], fields: string[]): () => void {
    const fresh: string[] = [];
    for (const id of ids) {
      let f = this.refs.get(id);
      if (!f) {
        f = new Map();
        this.refs.set(id, f);
      }
      for (const field of fields) {
        const n = f.get(field) ?? 0;
        if (n === 0) fresh.push(id);
        f.set(field, n + 1);
      }
    }
    if (fresh.length) this.send({ op: "sub", ids: [...new Set(fresh)], fields });
    return () => {
      const gone: string[] = [];
      for (const id of ids) {
        const f = this.refs.get(id);
        if (!f) continue;
        for (const field of fields) {
          const n = (f.get(field) ?? 1) - 1;
          if (n <= 0) f.delete(field);
          else f.set(field, n);
        }
        if (f.size === 0) {
          this.refs.delete(id);
          gone.push(id);
        }
      }
      if (gone.length) this.send({ op: "unsub", ids: gone });
    };
  }

  quote(id: string): LiveQuote | undefined {
    return this.quotes.get(id);
  }

  onQuote(id: string, l: Listener): () => void {
    let s = this.idListeners.get(id);
    if (!s) {
      s = new Set();
      this.idListeners.set(id, s);
    }
    s.add(l);
    return () => s.delete(l);
  }

  onState(l: Listener): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  /** Test hook: inject a tick as if it came from the server. */
  inject(id: string, v: Record<string, number>, prov = "demo") {
    this.onMessage({ op: "tick", id, v, ts: new Date().toISOString(), prov });
  }
}

export const stream = new StreamClient(() => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/v1/stream?token=${encodeURIComponent(token() ?? "")}`;
});
