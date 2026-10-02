import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { DemoServer, TOKEN } from "./server";

// Gate 0: a keyboard-only journey opens all six functions, exports a CSV, and restores the
// workspace after a restart. No mouse events are used in this file.

const server = new DemoServer();
test.beforeAll(async () => server.start());
test.afterAll(async () => server.stop());

const panel = (page: Page, n: number) => page.locator(`[data-panel="${n}"]`);

async function command(page: Page, text: string) {
  await page.keyboard.press("Control+K");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function open(page: Page, hash = "") {
  await page.goto(`${server.url}/${hash ? `${hash}&` : "#"}token=${TOKEN}`);
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

test("keyboard-only journey through all six Phase 0 functions", async ({ page }) => {
  await open(page);

  // DESC: every statistic filled in demo mode
  await page.keyboard.press("Alt+1");
  await command(page, "AAPL US EQUITY DESC");
  const p1 = panel(page, 1);
  await expect(p1.locator(".pcode")).toHaveText("DESC");
  await expect(p1.getByTestId("desc-strip")).toContainText("Apple Inc.");
  const stats = p1.getByRole("table", { name: "Key statistics" });
  await expect(stats).toContainText("Market cap");
  await expect(stats.locator(".missing")).toHaveCount(0);

  // Hot link 1 on DESC opens the chart for the same security in the same panel
  await command(page, "1");
  await expect(p1.locator(".pcode")).toHaveText("CHRT");
  await expect(p1.locator(".psec")).toHaveText("AAPL US EQUITY");
  await expect(p1.locator(".chart-host canvas").first()).toBeVisible();

  // CHRT with a period: the loaded security sticks
  await command(page, "CHRT 5Y style=candle");
  await expect(p1.getByTestId("chrt-legend")).toContainText("5Y");

  // Ctrl+E on a chart exports a PNG; Ctrl+Shift+E exports its visible data as CSV
  const png = page.waitForEvent("download");
  await page.keyboard.press("Control+E");
  const pngFile = await png;
  expect(pngFile.suggestedFilename()).toMatch(/aapl-us-equity-chrt-5y\.png$/);
  expect(
    readFileSync(await pngFile.path())
      .subarray(1, 4)
      .toString(),
  ).toBe("PNG");
  const chartCsv = page.waitForEvent("download");
  await page.keyboard.press("Control+Shift+E");
  expect(readFileSync(await (await chartCsv).path(), "utf8")).toContain("time,px.open,px.high");

  // F1 opens help for the current function, and Ctrl+[ comes back
  await page.keyboard.press("F1");
  await expect(p1.locator(".help-detail h2")).toContainText("CHRT");
  await page.keyboard.press("Control+[");
  await expect(p1.locator(".pcode")).toHaveText("CHRT");

  // HIST
  await command(page, "HIST");
  await expect(p1.locator(".pcode")).toHaveText("HIST");
  await expect(p1.getByTestId("hist-summary")).toContainText("adjusted");
  await expect(p1.getByRole("grid")).toContainText("Close");

  // Ctrl+E exports the focused panel as CSV
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+E");
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv.split("\n")[0]).toMatch(/^# source: demo/);
  expect(csv).toContain("date,px.open (USD),px.high (USD)");
  expect(csv.split("\n").length).toBeGreaterThan(200);

  // WMON in panel 2 ticks with demo data
  await page.keyboard.press("Alt+2");
  await command(page, "WMON");
  const p2 = panel(page, 2);
  await expect(p2.locator(".pcode")).toHaveText("WMON");
  await expect(p2.getByRole("grid")).toContainText("AAPL US EQUITY");
  await expect(p2.locator(".badge.mode-demo")).toBeVisible();

  // HELP in panel 3: search finds CURV for "yield"; a code opens its page
  await page.keyboard.press("Alt+3");
  await command(page, "HELP");
  await expect(panel(page, 3).getByRole("list", { name: "Functions" }).locator("li")).toHaveCount(
    30,
  );
  await command(page, "HELP yield");
  const p3 = panel(page, 3);
  await expect(p3.getByRole("list", { name: "Functions" })).toContainText("CURV");
  await command(page, "HELP 10-K");
  await expect(p3.getByRole("list", { name: "Functions" })).toContainText("FIN");
  await expect(p3.getByRole("list", { name: "Functions" })).toContainText("FILE");
  await command(page, "HELP CHRT");
  await expect(p3).toContainText("Examples");

  // RECENT in panel 4 lists what we ran
  await page.keyboard.press("Alt+4");
  await command(page, "RECENT");
  const p4 = panel(page, 4);
  await expect(p4.getByRole("table", { name: "Recent commands" })).toContainText(
    "AAPL US EQUITY DESC",
  );

  // An unknown code never dead-ends
  await page.keyboard.press("Alt+3");
  await command(page, "CHRTT");
  await expect(p3).toContainText("Did you mean:");
  await expect(p3).toContainText("HELP CHRTT");
  await command(page, "AAPL US EQUITY CHRTT");
  await expect(p3.getByRole("alert")).toContainText("Unknown function CHRTT");
  await expect(p3.getByRole("alert")).toContainText("CHRT");
  await page.keyboard.press("Control+[");
  await page.keyboard.press("Control+[");
  await expect(p3.locator(".pcode")).toHaveText("HELP");

  // Let the workspace save, restart the server, and reopen with no URL state.
  await page.waitForTimeout(800);
  await server.restart();
  const fresh = await page.context().newPage();
  await open(fresh);
  await expect(panel(fresh, 1).locator(".pcode")).toHaveText("HIST");
  await expect(panel(fresh, 1).locator(".psec")).toHaveText("AAPL US EQUITY");
  await expect(panel(fresh, 2).locator(".pcode")).toHaveText("WMON");
  await expect(panel(fresh, 3).locator(".pcode")).toHaveText("HELP");
  await expect(panel(fresh, 4).locator(".pcode")).toHaveText("RECENT");
  await expect(panel(fresh, 4).getByRole("table", { name: "Recent commands" })).toContainText(
    "HELP CHRT",
  );
});

test("a link restores each panel's command", async ({ page }) => {
  await open(page, "#p1=MSFT%20US%20EQUITY%20CHRT%201M&p2=EURUSD%20FX%20HIST&f=2");
  await expect(panel(page, 1).locator(".psec")).toHaveText("MSFT US EQUITY");
  await expect(panel(page, 1).getByTestId("chrt-legend")).toContainText("1M");
  await expect(panel(page, 2).locator(".psec")).toHaveText("EURUSD CURNCY");
  await expect(panel(page, 2)).toHaveClass(/focused/);
});

test("no serious or critical accessibility violations", async ({ page }) => {
  await open(
    page,
    "#p1=AAPL%20US%20EQUITY%20CHRT&p2=AAPL%20US%20EQUITY%20DESC&p3=SPX%20INDEX%20HIST&p4=WMON&f=1",
  );
  await expect(panel(page, 2).getByTestId("desc-strip")).toBeVisible();
  await expect(panel(page, 4).getByRole("grid")).toContainText("AAPL");
  const results = await new AxeBuilder({ page }).exclude(".chart-host").analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});
