// Query hooks over the local API: cached, deduplicated, cancelled when a view unmounts.
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { api, type HistRequest } from "./api";
import { type LiveQuote, stream } from "./stream";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function useReference(ids: string[], fields: string[], enabled = true) {
  return useQuery({
    queryKey: ["ref", ids, fields],
    queryFn: ({ signal }) => api.ref(ids, fields, signal),
    enabled: enabled && ids.length > 0 && fields.length > 0,
    staleTime: 15_000,
  });
}

export function useHist(req: HistRequest | null) {
  return useQuery({
    queryKey: ["hist", req],
    queryFn: ({ signal }) => api.hist(req!, signal),
    enabled: !!req,
    placeholderData: (prev) => prev,
  });
}

export function useBulk(id: string | null, field: string, params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ["bulk", id, field, params],
    queryFn: ({ signal }) => api.bulk(id!, field, params, signal),
    enabled: !!id,
  });
}

export function useSession() {
  return useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity });
}

export function useSymbols() {
  return useQuery({ queryKey: ["symbols"], queryFn: api.symbols, staleTime: Infinity });
}

export function useResolve(q: string | null) {
  return useQuery({
    queryKey: ["resolve", q],
    queryFn: ({ signal }) => api.resolve(q!, signal),
    enabled: !!q,
  });
}

/** Subscribe to live values for a set of instruments while the component is mounted. */
export function useStreamSubscription(ids: string[], fields: string[]) {
  const key = `${ids.join("|")}::${fields.join("|")}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: key captures ids and fields
  useEffect(() => stream.subscribe(ids, fields), [key]);
}

/** The latest live quote for one instrument; re-renders only when that instrument ticks. */
export function useLiveQuote(id: string | undefined): LiveQuote | undefined {
  return useSyncExternalStore(
    (l) => (id ? stream.onQuote(id, l) : () => {}),
    () => (id ? stream.quote(id) : undefined),
  );
}

export function useConnState() {
  return useSyncExternalStore(
    (l) => stream.onState(l),
    () => stream.state,
  );
}
