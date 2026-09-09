import { test, expect } from "@playwright/test";
import { CREDS, login } from "./helpers";

// The money path: an employer approves a submitted timesheet. That single click
// runs lib/timesheets/approve.ts end to end — reverse-billing invoices (freelancer
// + platform fee), a Payment row, and the instant-SEPA attempt. With no SEPA
// provider configured the payout lands in FAILED, which is the correct offline
// outcome; the approval itself must still succeed and issue the invoices.
test("employer approves a submitted timesheet and invoices are issued", async ({
  page,
}) => {
  await login(page, CREDS.employer);

  await page.goto("/werkgever/uren");
  const row = page.locator("li", { hasText: "Liam" }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: /goedkeuren/i }).click();

  // Success renders a pill with "Goedgekeurd…"; a precondition failure renders
  // red error text. Assert we got the success pill.
  await expect(page.locator("text=/Goedgekeurd/i").first()).toBeVisible({
    timeout: 15_000,
  });

  // The freelancer self-billing invoice should now show up for the employer.
  await page.goto("/werkgever/facturen");
  await expect(page.locator("body")).toContainText(/ZF-|factuur|Factuur/i);
});
