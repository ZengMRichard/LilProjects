import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TOKEN = "e2e-token";
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

export class DemoServer {
  proc: ChildProcess | null = null;
  readonly home = mkdtempSync(join(tmpdir(), "almanac-e2e-"));
  constructor(readonly port = 8766) {}

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    const bin = process.env.ALMANAC_BIN ?? join(ROOT, ".venv", "bin", "almanac");
    this.proc = spawn(bin, ["demo", "--no-browser"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ALMANAC_HOME: this.home,
        ALMANAC_PORT: String(this.port),
        ALMANAC_TOKEN: TOKEN,
      },
      stdio: "ignore",
    });
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`${this.url}/v1/session`, { headers: { "X-Almanac-Token": TOKEN } });
        if (r.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("demo server did not start");
  }

  async stop() {
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    await new Promise<void>((done) => {
      p.once("exit", () => done());
      p.kill("SIGTERM");
    });
  }

  async restart() {
    await this.stop();
    await this.start();
  }
}
