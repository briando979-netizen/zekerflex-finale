import { expect, type Page } from "@playwright/test";

export const CREDS = {
  admin: "admin@zekerflex.nl",
  employer: "hq@supermarktketen.nl",
  freelancer: "liam.gold@freelancer.nl",
  password: "Zeker!2026",
} as const;

/** The credentials form — scoped so we never hit the Google form's submit. */
export function credentialsForm(page: Page) {
  return page.locator('form:has(input[name="password"])');
}

/**
 * Log in via the real form and wait for the post-login redirect to fully
 * settle (past the transient `/start` router page onto the role home screen).
 */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  const form = credentialsForm(page);
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(CREDS.password);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL(
    (url) => {
      const p = url.pathname;
      return !p.startsWith("/login") && !p.startsWith("/start");
    },
    // Cold Next dev compiles the destination route on first hit — be generous.
    { timeout: 45_000 },
  );
}

/** Fail the test on any console error or uncaught page error. */
export function failOnConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

export async function expectNoConsoleErrors(errors: string[]): Promise<void> {
  // Next dev streams a couple of benign warnings; only hard errors matter.
  const real = errors.filter(
    (e) =>
      !e.includes("Download the React DevTools") &&
      !e.toLowerCase().includes("favicon") &&
      !e.includes("[Fast Refresh]"),
  );
  expect(real, `console errors:\n${real.join("\n")}`).toEqual([]);
}
