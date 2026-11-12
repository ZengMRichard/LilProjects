// Runs the API (with its in-process worker) and the web app together.
//   pnpm dev          development servers with reload
//   pnpm dev --start  the built web app (run `pnpm build` first)
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const start = process.argv.includes("--start");
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FACET_API_URL: process.env.FACET_API_URL ?? "http://127.0.0.1:8787" };

const processes = [
  { name: "api", color: 36, command: "uv", args: ["run", "facet", "serve", "--port", "8787"], cwd: root },
  { name: "web", color: 34, command: "pnpm", args: ["-C", "apps/web", start ? "start" : "dev"], cwd: root },
].map(({ name, color, command, args, cwd }) => {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const prefix = `\x1b[${color}m${name}\x1b[0m │ `;
  for (const stream of [child.stdout, child.stderr]) {
    let rest = "";
    stream.on("data", (chunk) => {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop();
      for (const line of lines) process.stdout.write(`${prefix}${line}\n`);
    });
  }
  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with code ${code}\n`);
    shutdown(code ?? 1);
  });
  return child;
});

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of processes) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
console.log("Facet: web on http://localhost:3000, API on http://127.0.0.1:8787");
