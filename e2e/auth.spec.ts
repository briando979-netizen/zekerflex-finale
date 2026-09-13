import { test, expect } from "@playwright/test";
import { CREDS, login, credentialsForm } from "./helpers";

test("platform admin lands on /admin", async ({ page }) => {
  test.slow(); // cold dev compiles the whole /admin dashboard on first hit
  await login(page, CREDS.admin);
  await expect(page).toHaveURL(/\/admin(\/|$)/);
});

test("employer lands on /werkgever", async ({ page }) => {
  await login(page, CREDS.employer);
  await expect(page).toHaveURL(/\/werkgever(\/|$)/);
});

test("freelancer lands on /dashboard", async ({ page }) => {
  await login(page, CREDS.freelancer);
  await expect(page).toHaveURL(/\/dashboard(\/|$)/);
});

test("a wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  const form = credentialsForm(page);
  await form.locator('input[name="email"]').fill(CREDS.freelancer);
  await form.locator('input[name="password"]').fill("verkeerd-wachtwoord");
  await form.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("text=/ongeldig|mislukt|onjuist/i").first()).toBeVisible();
});
