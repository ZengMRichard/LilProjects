"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "./client";
import type {
  AuditEntry,
  CaptureProtocol,
  CheckoutResult,
  ConsentState,
  Me,
  Plan,
  PlanItem,
  Progress,
  Report,
  ReportSummary,
  Scan,
  SignedUrl,
} from "./types";

const noRetryOnAuth = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2;

export function useMe() {
  return useQuery<Me, ApiError>({ queryKey: ["me"], queryFn: () => api<Me>("/v1/me"), retry: noRetryOnAuth });
}

export function useReports() {
  return useQuery<ReportSummary[], ApiError>({
    queryKey: ["reports"],
    queryFn: () => api<ReportSummary[]>("/v1/reports"),
    retry: noRetryOnAuth,
  });
}

export function useReport(id: string) {
  return useQuery<Report, ApiError>({
    queryKey: ["report", id],
    queryFn: () => api<Report>(`/v1/reports/${id}`),
    retry: noRetryOnAuth,
  });
}

export function useScans() {
  return useQuery<Scan[], ApiError>({
    queryKey: ["scans"],
    queryFn: () => api<Scan[]>("/v1/scans"),
    retry: noRetryOnAuth,
  });
}

export function useProgress() {
  return useQuery<Progress, ApiError>({
    queryKey: ["progress"],
    queryFn: () => api<Progress>("/v1/progress"),
    retry: noRetryOnAuth,
  });
}

export function usePlan() {
  return useQuery<Plan, ApiError>({
    queryKey: ["plan"],
    queryFn: () => api<Plan>("/v1/plan"),
    retry: noRetryOnAuth,
  });
}

export function useAudit(enabled: boolean) {
  return useQuery<AuditEntry[], ApiError>({
    queryKey: ["audit"],
    queryFn: () => api<AuditEntry[]>("/v1/me/audit"),
    enabled,
    retry: noRetryOnAuth,
  });
}

export function useCaptureProtocol() {
  return useQuery<CaptureProtocol, ApiError>({
    queryKey: ["capture-protocol"],
    queryFn: () => api<CaptureProtocol>("/v1/capture-protocol"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** A short-lived signed URL for one photo. Every fetch is written to the audit log. */
export function useImageUrl(scanId: string, view: string, enabled: boolean) {
  return useQuery<SignedUrl, ApiError>({
    queryKey: ["image-url", scanId, view],
    queryFn: () => api<SignedUrl>(`/v1/scans/${scanId}/images/${view}`),
    enabled,
    staleTime: 4 * 60 * 1000,
    retry: false,
  });
}

export function useCheckout(reportId: string) {
  const client = useQueryClient();
  return useMutation<CheckoutResult, ApiError>({
    mutationFn: () =>
      api<CheckoutResult>("/v1/billing/checkout", { method: "POST", json: { report_id: reportId } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["report", reportId] });
      client.invalidateQueries({ queryKey: ["reports"] });
      client.invalidateQueries({ queryKey: ["plan"] });
    },
  });
}

export function useSetConsent() {
  const client = useQueryClient();
  return useMutation<ConsentState[], ApiError, { type: string; version: string; grant: boolean }, unknown>({
    mutationFn: ({ type, version, grant }) =>
      grant
        ? api<ConsentState[]>("/v1/consents", { method: "POST", json: { type, version } })
        : api<ConsentState[]>(`/v1/consents/${type}`, { method: "DELETE" }),
    // Awaited, so a page that navigates on success sees the new consent state.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["me"] }),
        client.invalidateQueries({ queryKey: ["scans"] }),
        client.invalidateQueries({ queryKey: ["audit"] }),
      ]),
  });
}

export function useUpdatePlanItem() {
  const client = useQueryClient();
  return useMutation<PlanItem, ApiError, { id: string; status: PlanItem["status"] }>({
    mutationFn: ({ id, status }) => api<PlanItem>(`/v1/plan/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["plan"] });
      client.invalidateQueries({ queryKey: ["report"] });
    },
  });
}
