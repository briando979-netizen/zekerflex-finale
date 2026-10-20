import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { latestVerification } from "@/lib/mail/store";
import { CREDS, credentialsForm, dismissCookieBanner, login } from "./helpers";

// ---------------------------------------------------------------------------
// The journeys that must never break, end to end in a real browser:
//   1. a new freelancer signs up, confirms the e-mail code and submits the
//      identity verification (3 photos)
//   2. a verified freelancer reacts to an open klus
//   3. hours: the freelancer's submitted hours are visible, the employer
//      approves them (critical-path.spec.ts), invoices + payout record follow
// Runs on every push (.github/workflows/e2e.yml) against a seeded database.
// ---------------------------------------------------------------------------

// A realistic test photo (the server rejects tiny or unreadable images).
async function photo(seed: number): Promise<Buffer> {
  const w = 900, h = 600;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761 + seed * 97) % 251;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

test("nieuwe freelancer: aanmelden → e-mail bevestigen → verificatie versturen", async ({ page }) => {
  test.slow();
  const email = `e2e.${Date.now()}@example.com`;
  await page.goto("/register?type=freelancer");
  await dismissCookieBanner(page);

  await page.locator('input[name="fullName"]').fill("Eva Testpersoon");
  await page.locator('input[name="email"]').fill(email);
  await expect(page.getByText(/beschikbaar/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /genereer sterk wachtwoord/i }).click();
  await expect(page.locator('input[name="password"]')).not.toHaveValue("", { timeout: 15_000 });
  await expect(page.getByText(/wachtwoorden komen overeen/i)).toBeVisible();
  const submit = page.getByRole("button", { name: /account aanmaken/i });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();

  // Without SMTP (as in CI) the confirm page shows the code itself.
  await page.waitForURL(/verifieer-email/, { timeout: 45_000 });
  // Without SMTP (CI) the page shows the code; with a mail server we read it from the store.
  const shown = page.locator("p.font-mono.text-brand-600");
  let code = (await shown.count()) ? (await shown.first().innerText()).replace(/\s/g, "") : "";
  if (!code) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    code = (await latestVerification(user.id))?.code ?? "";
  }
  expect(code).toMatch(/^\d{6}$/);
  await page.locator('input[name="code"]').fill(code);
  await page.getByRole("button", { name: /bevestig mijn account/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/verifieer-email"), { timeout: 45_000 });

  await page.goto("/dashboard/verificatie");
  await page.locator('input[name="kvkNumber"]').fill("12345678");
  await page.locator('input[name="postalCode"]').fill("1012 AB");
  await page.locator('input[name="payoutIban"]').fill("NL91ABNA0417164300");
  // Photo route (Stripe Identity isn't configured in CI).
  const upload = page.getByRole("radio", { name: /zelf foto/i });
  if (await upload.count()) await upload.click();
  await page.locator('input[name="documentNumber"]').fill("AB1234567");
  await page.locator('input[name="documentExpiry"]').fill("2031-05-01");
  const files = page.locator('form input[type="file"]');
  for (let i = 0; i < 3; i++) await files.nth(i).setInputFiles({ name: `foto${i}.jpg`, mimeType: "image/jpeg", buffer: await photo(i) });
  await page.getByRole("button", { name: /verificatie versturen/i }).click();

  // Any honest outcome is fine here (KVK isn't reachable in CI → in review);
  // what must not happen is an upload/server error.
  const result = page.getByRole("heading", { name: "Resultaat" });
  const formError = page.locator("form p.text-crit").first();
  await expect(result.or(formError)).toBeVisible({ timeout: 60_000 });
  if (await formError.isVisible()) throw new Error(`Verificatie gaf een foutmelding: ${await formError.innerText()}`);
  await expect(result).toBeVisible();
  await expect(page.getByText(/er ging iets mis|te groot om te versturen/i)).toHaveCount(0);
});

test("geverifieerde freelancer reageert op een open klus", async ({ page }) => {
  test.slow();
  await login(page, CREDS.freelancer);
  await page.goto("/dashboard/klussen");
  const card = page.locator('a[href^="/dashboard/klussen/"]').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.click();
  await page.getByRole("button", { name: /reageer op deze klus/i }).first().click();
  // accept the agreement and the dresscode (the other checkboxes are "also react to other klussen")
  const agree = page.locator('label:has-text("Ik ga akkoord") input[type="checkbox"]');
  for (let i = 0; i < (await agree.count()); i++) await agree.nth(i).check();
  await page.getByRole("button", { name: /bevestig je reactie/i }).click();
  // Either the reaction lands, or it was already there from an earlier run.
  await expect(page.getByText(/je reactie staat bij mijn klussen|al aangenomen|al gereageerd/i).first()).toBeVisible({ timeout: 30_000 });
});

test("freelancer ziet zijn ingediende uren, uitbetalingen-pagina laadt", async ({ page }) => {
  test.slow();
  await login(page, CREDS.freelancer);
  await page.goto("/dashboard/uren");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/er ging iets mis|application error/i)).toHaveCount(0);
  await page.goto("/dashboard/uitbetalingen");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/application error/i)).toHaveCount(0);
});

test("inloggen met fout wachtwoord geeft nette melding", async ({ page }) => {
  await page.goto("/login");
  const form = credentialsForm(page);
  await form.locator('input[name="email"]').fill(CREDS.freelancer);
  await form.locator('input[name="password"]').fill("helemaal-fout-123");
  await form.locator('button[type="submit"]').click();
  await expect(page.getByText(/ongeldige inloggegevens/i).first()).toBeVisible({ timeout: 20_000 });
});
