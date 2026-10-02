// Fetches every data need of a manifest in parallel; each block fills in independently.
import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, type HistRequest, type Instrument } from "../data/api";
import { stream } from "../data/stream";
import type { DataNeed, DataResult, FunctionManifest } from "./types";

/** Substitute {param} references; drop keys whose parameter is unset. */
export function template(
  params: Record<string, string> | undefined,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    const s = v.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
    if (s !== "") out[k] = s;
  }
  return out;
}

function histRequest(id: string, need: DataNeed, p: Record<string, string>): HistRequest {
  return {
    id,
    fields: need.fields,
    period: p.period ?? null,
    freq: p.freq ?? null,
    start: p.start ?? null,
    end: p.end ?? null,
    ccy: p.ccy ?? null,
    adjusted: p.adjusted !== "false",
  };
}

function queryFor(need: DataNeed, inst: Instrument | undefined, values: Record<string, string>) {
  const p = template(need.params, values);
  const id = inst?.id ?? "";
  switch (need.shape) {
    case "reference":
      return {
        queryKey: ["ref", [id], need.fields],
        queryFn: ({ signal }: { signal: AbortSignal }) => api.ref([id], need.fields, signal),
        staleTime: 15_000,
        enabled: !!inst,
      };
    case "history": {
      const req = histRequest(id, need, p);
      return {
        queryKey: ["hist", req],
        queryFn: ({ signal }: { signal: AbortSignal }) => api.hist(req, signal),
        enabled: !!inst,
      };
    }
    case "bulk":
      return {
        queryKey: ["bulk", id, need.fields[0], p],
        queryFn: ({ signal }: { signal: AbortSignal }) => api.bulk(id, need.fields[0], p, signal),
        enabled: !!inst,
      };
    default:
      return { queryKey: ["noop"], queryFn: async () => null, enabled: false };
  }
}

export function useFunctionData(
  m: FunctionManifest,
  inst: Instrument | undefined,
  params: Record<string, string>,
): { data: Record<string, DataResult>; refetch: () => void } {
  const needs = m.data.filter((d) => d.shape !== "stream");
  const results = useQueries({ queries: needs.map((n) => queryFor(n, inst, params)) });

  const streamNeeds = m.data.filter((d) => d.shape === "stream");
  const streamKey = inst ? `${inst.id}:${streamNeeds.flatMap((s) => s.fields).join(",")}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: streamKey captures the inputs
  useEffect(() => {
    if (!inst || !streamNeeds.length) return;
    return stream.subscribe(
      [inst.id],
      streamNeeds.flatMap((s) => s.fields),
    );
  }, [streamKey]);

  const data: Record<string, DataResult> = {};
  needs.forEach((need, i) => {
    const r = results[i];
    if (r.isPending) data[need.key] = { status: "loading" };
    else if (r.isError)
      data[need.key] = { status: "error", error: String(r.error?.message ?? r.error) };
    else {
      const v = r.data as Record<string, unknown> | null;
      if (need.shape === "reference") {
        const values = (v as { values: Record<string, never> }).values[inst?.id ?? ""];
        data[need.key] = { status: "ok", ref: values };
      } else if (need.shape === "history") {
        const h = v as { series: never[]; unavailable: { reasons: string[] } | null };
        data[need.key] = h.unavailable
          ? { status: "unavailable", reasons: h.unavailable.reasons }
          : { status: "ok", series: h.series, stale: r.isPlaceholderData };
      } else {
        const b = v as { table: never; unavailable: { reasons: string[] } | null };
        data[need.key] = b.unavailable
          ? { status: "unavailable", reasons: b.unavailable.reasons }
          : { status: "ok", table: b.table };
      }
    }
  });
  for (const s of streamNeeds) data[s.key] = { status: "ok" };
  const refetch = () => {
    for (const r of results) void r.refetch();
  };
  return { data, refetch };
}
