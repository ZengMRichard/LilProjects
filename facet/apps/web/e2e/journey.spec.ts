import { expect, type Page, test } from "@playwright/test";

// The core journey (spec section 2) on the synthetic sample: sign in, age gate, biometric
// consent, scan, free preview, unlock, full report, progress, plan, settings.

async function signIn(page: Page, email: string, next = "/scan") {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function onboard(page: Page, email: string) {
  await signIn(page, email);
  await page.getByLabel("Date of birth").fill("1992-06-15");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your face geometry is biometric data" })).toBeVisible();
  // Consent cannot be given until the text has been acknowledged.
  await expect(page.getByRole("button", { name: "I consent" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "I consent" }).click();
  await expect(page.getByText("What are you hoping to learn?")).toBeVisible();
}

async function syntheticScan(page: Page) {
  await page.getByRole("button", { name: /Use the synthetic sample/ }).click();
  await expect(page.getByRole("heading", { name: "Your report" })).toBeVisible({ timeout: 30_000 });
}

test("landing page states the product honestly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Understand your face");
  await expect(page.getByText("no attractiveness score")).toBeVisible();
  await expect(page.getByText("Development build", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "See a sample report" }).first().click();
  await expect(page.getByText("This is a sample.")).toBeVisible();
  await expect(page.locator("[data-metric]")).toHaveCount(17);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/signin\?next=%2Freports/);
});

test("under-18s are stopped at the age gate", async ({ page }) => {
  await signIn(page, "minor@example.com");
  const year = new Date().getFullYear() - 16;
  await page.getByLabel("Date of birth").fill(`${year}-01-01`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Facet is only for adults" })).toBeVisible();
});

test("scan to free preview to full report", async ({ page }) => {
  await onboard(page, "journey@example.com");
  await page.getByText("Skin", { exact: true }).click();
  await syntheticScan(page);

  // Free preview: three headline cards, everything else locked, starter plan, then the upgrade.
  await expect(page.locator("[data-report-tier=free_preview]")).toBeVisible();
  await expect(page.getByText("Synthetic sample, not a real face")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What these numbers can and cannot tell you" }),
  ).toBeVisible();
  await expect(page.locator("[data-metric]")).toHaveCount(3);
  await expect(page.getByText("In the full report").first()).toBeVisible();
  await expect(page.locator("[data-face-shape]")).toBeVisible();
  await expect(page.locator("[data-plan]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Save as PDF" })).toHaveCount(0);

  // The routine plan comes before the paid upgrade on the page, never after it.
  const planTop = (await page.locator("#plan-title").boundingBox())!.y;
  const upgradeTop = (await page.locator("#upgrade-title").boundingBox())!.y;
  expect(planTop).toBeLessThan(upgradeTop);

  await page.getByRole("button", { name: /Unlock the full report/ }).click();
  await expect(page.locator("[data-report-tier=full]")).toBeVisible();
  await expect(page.locator("[data-metric]")).toHaveCount(17);
  await expect(page.locator("[data-symmetry-region]")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "What this build leaves out" })).toBeVisible();
  await expect(
    page.getByText("General information, not a diagnosis or medical advice.").first(),
  ).toBeVisible();

  // A metric card: value, range, plain meaning, confidence, and the working behind it.
  const tilt = page.locator('[data-metric="eyes.canthal_tilt"]');
  await expect(tilt).toContainText("°");
  await expect(tilt).toContainText("typical range");
  await expect(tilt).toContainText("confidence");
  await tilt.getByText("How this was measured").click();
  await expect(tilt).toContainText("endocanthion, exocanthion");
  await expect(page.locator('[data-metric="nose.nasofrontal_angle"]')).toContainText("Experimental");

  // Plan check-ins persist.
  const first = page.locator("[data-plan]").first();
  await first.getByRole("button", { name: "Doing" }).click();
  await expect(first.getByRole("button", { name: "Doing" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/plan");
  await expect(page.locator("[data-plan]").first().getByRole("button", { name: "Doing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // A second scan gives progress something to compare.
  await page.goto("/scan");
  await syntheticScan(page);
  await page.goto("/progress");
  await expect(page.locator("[data-progress]").first()).toBeVisible();
  await expect(page.getByText("Within noise").first()).toBeVisible();
});

test("distress in the goals shows support and removes the upgrade prompt", async ({ page }) => {
  await onboard(page, "support@example.com");
  await page.getByLabel(/Anything else about your goals/).fill("I hate my face and feel hopeless");
  await syntheticScan(page);
  await expect(page.getByRole("heading", { name: "You matter more than any measurement" })).toBeVisible();
  await expect(page.getByRole("link", { name: /988/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Unlock the full report/ })).toHaveCount(0);
});

test("consent is revocable and the account can be deleted", async ({ page }) => {
  await onboard(page, "settings@example.com");
  await page.goto("/settings");
  const research = page.locator("[data-consent=research_use]").getByRole("switch");
  await expect(research).toHaveAttribute("aria-checked", "false");
  await research.click();
  await expect(research).toHaveAttribute("aria-checked", "true");
  await research.click();
  await expect(research).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("[data-consent=analyst_review]").getByRole("switch")).toBeDisabled();

  await page.getByRole("button", { name: "Show log" }).click();
  await expect(page.getByRole("cell", { name: "Consent given" }).first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download export" }).click();
  expect((await download).suggestedFilename()).toBe("facet-export.zip");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-consent=biometric_processing]").getByRole("switch").click();
  await expect(page.locator("[data-consent=biometric_processing]").getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await expect(page.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/signin/);
});
