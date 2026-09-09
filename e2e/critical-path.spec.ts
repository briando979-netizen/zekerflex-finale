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
  test.slow(); // login + approve + navigate, each a cold Next dev compile
  await login(page, CREDS.employer);

  await page.goto("/werkgever/uren");
  const row = page.locator("li", { hasText: "Liam" }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: /goedkeuren/i }).click();

  // Success fires a toast ("Goedgekeurd…") that survives the row leaving the
  // SUBMITTED/DISPUTED list when the server action revalidates it (Next 15).
  await expect(page.getByText(/Goedgekeurd/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/goedkeuren mislukt/i)).toHaveCount(0);

  // The real proof of the money path: both reverse-billing invoices (freelancer
  // self-bill + platform fee) now exist for the employer.
  await page.goto("/werkgever/facturen");
  await expect(page.locator("body")).toContainText(/ZF-SB-2026/);
  await expect(page.locator("body")).toContainText(/ZF-PF-2026/);
});
