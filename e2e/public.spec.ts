import { test, expect } from "@playwright/test";
import { failOnConsoleErrors, expectNoConsoleErrors } from "./helpers";

const PAGES = ["/", "/voor-bedrijven", "/voor-freelancers", "/uitzendbureau", "/status"];

for (const path of PAGES) {
  test(`public page renders: ${path}`, async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
    await expectNoConsoleErrors(errors);
  });
}

test("/api/status reports health and the deployment target", async ({ request }) => {
  const res = await request.get("/api/status");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(["operational", "degraded", "down"]).toContain(body.overall);
  expect(body.deployment).toBeTruthy();
  expect(["sovereign-box", "vercel-demo", "unknown"]).toContain(body.deployment.target);
  expect(typeof body.deployment.demo).toBe("boolean");
  expect(Array.isArray(body.components)).toBeTruthy();
});
