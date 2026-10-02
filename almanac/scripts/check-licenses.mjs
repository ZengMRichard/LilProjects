// Fails when an installed npm dependency's license is outside the allowlist.
// Allowed: MIT, BSD, ISC, Apache-2.0, MPL-2.0, public domain; fonts may use SIL OFL.
// Approved exceptions live in scripts/license-exceptions.json with a reason each.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOW = /^(MIT|ISC|0BSD|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|MPL-2\.0|CC0-1\.0|Unlicense|BlueOak-1\.0\.0|CC-BY-4\.0)$/;
const FONT_ALLOW = /^OFL-1\.1$/;
const root = new URL("..", import.meta.url).pathname;
const exceptions = JSON.parse(readFileSync(join(root, "scripts/license-exceptions.json"), "utf8")).npm ?? {};

function ok(expr, name) {
  if (!expr) return false;
  const parts = expr.replace(/[()]/g, "").split(/\s+OR\s+/);
  return parts.some((alt) =>
    alt.split(/\s+AND\s+/).every((l) => ALLOW.test(l.trim()) || (name.startsWith("@fontsource/") && FONT_ALLOW.test(l.trim()))),
  );
}

const seen = new Map();
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) {
      if (entry === ".pnpm") walk(join(dir, entry));
      continue;
    }
    const p = join(dir, entry);
    if (entry.startsWith("@")) {
      walk(p);
      continue;
    }
    const pkg = join(p, "package.json");
    if (existsSync(pkg)) {
      const j = JSON.parse(readFileSync(pkg, "utf8"));
      if (j.name && j.version && !seen.has(`${j.name}@${j.version}`)) {
        const lic = typeof j.license === "string" ? j.license : (j.license?.type ?? j.licenses?.map((l) => l.type).join(" OR "));
        seen.set(`${j.name}@${j.version}`, { name: j.name, license: lic });
      }
    }
    if (existsSync(join(p, "node_modules"))) walk(join(p, "node_modules"));
  }
}
walk(join(root, "node_modules"));
walk(join(root, "apps/web/node_modules"));

for (const d of seen.values()) {
  const e = exceptions[d.name];
  if (e && !ok(d.license, d.name)) console.warn(`warning: ${d.name} (${e.license}) is an exception: ${e.status}`);
}
const bad = [...seen.values()].filter((d) => !ok(d.license, d.name) && !exceptions[d.name]);
console.log(`checked ${seen.size} npm packages`);
if (bad.length) {
  for (const d of bad) console.error(`not allowed: ${d.name} (${d.license ?? "no license field"})`);
  process.exit(1);
}
