import { useEffect, useState } from "react";
import { useConnState, useSession } from "../data/hooks";
import { fmtTime } from "../ui/format";

const LABELS: Record<string, string> = {
  "America/New_York": "NY",
  "Europe/London": "LDN",
  "Asia/Tokyo": "TYO",
  "Europe/Berlin": "FRA",
  "Asia/Hong_Kong": "HKG",
  "Australia/Sydney": "SYD",
};

/** NYSE regular session, 09:30 to 16:00 New York time, weekdays. Holidays are not modeled yet. */
export function nyseOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false;
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function StatusBar() {
  const now = useNow();
  const session = useSession();
  const conn = useConnState();
  const clocks = session.data?.clocks ?? ["America/New_York", "Europe/London", "Asia/Tokyo"];
  const mode = session.data?.mode;
  const open = nyseOpen(now);
  return (
    <footer className="status-bar">
      <span className="clocks">
        {clocks.map((tz) => (
          <span key={tz} title={tz}>
            {LABELS[tz] ?? tz.split("/").pop()} {fmtTime(now, tz)}
          </span>
        ))}
      </span>
      <span
        className={open ? "badge open" : "badge"}
        title="NYSE regular session; exchange holidays are not modeled yet"
      >
        NYSE {open ? "open" : "closed"}
      </span>
      {mode === "demo" ? (
        <span
          className="badge demo"
          title="Every value comes from the bundled synthetic demo dataset"
        >
          DEMO
        </span>
      ) : mode === "live" ? (
        <span className="badge live" title="Live mode: values come from configured providers">
          LIVE
        </span>
      ) : null}
      <span className={`badge conn-${conn}`} title="Stream connection">
        {conn === "open"
          ? "Connected"
          : conn === "closed"
            ? "Offline"
            : `${conn[0].toUpperCase()}${conn.slice(1)}…`}
      </span>
      {session.isError && (
        <span className="badge warn">Server unreachable: {String(session.error.message)}</span>
      )}
      <span className="spacer" />
      <span className="dim" aria-live="polite">
        0 alerts
      </span>
    </footer>
  );
}
