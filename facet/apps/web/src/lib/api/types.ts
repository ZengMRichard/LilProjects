// Friendly names for the generated API types. Regenerate schema.d.ts with `pnpm gen:api`.
import type { components } from "./schema";

type S = components["schemas"];

export type Me = S["Me"];
export type ConsentState = S["ConsentState"];
export type Scan = S["ScanOut"];
export type ScanCreated = S["ScanCreated"];
export type Report = S["ReportOut"];
export type ReportSummary = S["ReportSummary"];
export type MetricCard = S["MetricCard"];
export type Reference = S["Reference"];
export type Symmetry = S["SymmetryOut"];
export type Skin = S["SkinOut"];
export type SkinAttribute = S["SkinAttributeOut"];
export type Plan = S["PlanOut"];
export type PlanItem = S["PlanItemOut"];
export type Progress = S["ProgressOut"];
export type ProgressMetric = S["ProgressMetric"];
export type Support = S["Support"];
export type SignedUrl = S["SignedUrl"];
export type AuditEntry = S["AuditEntry"];
export type CheckoutResult = S["CheckoutResult"];
export type MagicLinkResponse = S["MagicLinkResponse"];
export type ViewName = "front" | "left" | "right";
export type Goal = "skin" | "jaw" | "style" | "general";

export interface CaptureProtocol {
  version: string;
  views: Record<string, { yaw: [number, number]; pitch: [number, number]; roll: [number, number] }>;
  captured_views: ViewName[];
  min_ipd_px: number;
  max_mouth_gap: number;
  max_smile: number;
  max_jaw_open: number;
  tta_count: number;
  luma_range: [number, number];
  max_clipped: number;
  evenness_range: [number, number];
  min_sharpness: number;
}
