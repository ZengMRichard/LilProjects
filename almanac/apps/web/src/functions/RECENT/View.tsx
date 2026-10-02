import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../../data/api";
import { DataState, Link } from "../../ui/components";
import { fmtDateTime } from "../../ui/format";
import type { DataResult, FunctionProps } from "../types";

export default function RecentView({ registerHotLinks, registerExport, run }: FunctionProps) {
  const q = useQuery({ queryKey: ["history"], queryFn: () => api.history(50), staleTime: 0 });
  const rows = q.data ?? [];

  useEffect(() => {
    registerHotLinks(rows.map((r, i) => ({ n: i + 1, label: r.command, command: r.command })));
    registerExport({
      title: "RECENT",
      table: () => ({
        columns: ["time", "panel", "command"],
        rows: rows.map((r) => [r.ts, r.panel, r.command]),
        sources: ["local command history"],
      }),
    });
  }, [rows, registerHotLinks, registerExport]);

  const result: DataResult = q.isPending
    ? { status: "loading" }
    : q.isError
      ? { status: "error", error: String(q.error) }
      : { status: "ok" };

  return (
    <div className="recent">
      <DataState result={result} label="Command history" retry={() => q.refetch()}>
        {() =>
          rows.length ? (
            <table className="grid" aria-label="Recent commands">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Panel</th>
                  <th className="txt">Command</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.ts}|${r.panel}|${r.command}`}>
                    <td>
                      <Link n={i + 1} label="" onClick={() => run(r.command)} />
                    </td>
                    <td className="date">{fmtDateTime(r.ts)}</td>
                    <td>{r.panel}</td>
                    <td className="txt">
                      <code>{r.command}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="dim">No commands yet.</div>
          )
        }
      </DataState>
    </div>
  );
}
