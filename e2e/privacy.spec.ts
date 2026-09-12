import { test, expect } from "@playwright/test";
import { CREDS, login } from "./helpers";

// AVG art. 15/20 — a freelancer downloads everything the platform holds on them.
test("freelancer can export their data as JSON", async ({ page }) => {
  test.slow(); // cold dev compiles /dashboard + the export route + ~18 queries
  await login(page, CREDS.freelancer);

  const res = await page.request.get("/api/me/gegevens/export");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-disposition"]).toContain("attachment");

  const body = await res.json();
  expect(body.subject).toBeTruthy();
  expect(body.sections.account).toBeTruthy();
  expect(body.sections.account).not.toHaveProperty("passwordHash");
  // the seeded gold freelancer has worked shifts
  expect(Array.isArray(body.sections.timesheets)).toBeTruthy();
});
