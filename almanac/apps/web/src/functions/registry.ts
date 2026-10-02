// Manifests are discovered eagerly; views load lazily, so a new function never touches the shell.
import { type ComponentType, lazy } from "react";
import { CATALOG } from "./catalog";
import type { FunctionManifest, FunctionProps } from "./types";

const manifestModules = import.meta.glob<{ manifest: FunctionManifest }>("./*/manifest.ts", {
  eager: true,
});
const viewModules = import.meta.glob<{ default: ComponentType<FunctionProps> }>("./*/View.tsx");

export const MANIFESTS: FunctionManifest[] = Object.values(manifestModules)
  .map((m) => m.manifest)
  .sort((a, b) => a.code.localeCompare(b.code));

export const MANIFEST_BY_CODE = new Map(MANIFESTS.map((m) => [m.code, m]));

const views = new Map<string, ComponentType<FunctionProps>>();
for (const [path, load] of Object.entries(viewModules)) {
  const code = path.split("/")[1];
  views.set(code, lazy(load));
}

export function viewFor(code: string): ComponentType<FunctionProps> | undefined {
  return views.get(code);
}

/** Every code the grammar recognizes: built functions plus the planned catalog. */
export const ALL_CODES = new Set([...CATALOG.map((c) => c.code), ...MANIFESTS.map((m) => m.code)]);
