import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Content-Security-Policy. Playwright's default webServer is `next dev`, whose
// CSP is deliberately loose (React Refresh needs 'unsafe-inline'/'unsafe-eval').
// The strict assertions therefore only run when they see the production shape
// (a nonce in the header) — e.g. against `PLAYWRIGHT_BASE_URL` pointing at a
// `next build` server. The always-on checks below hold in both modes.
// ---------------------------------------------------------------------------

function directive(csp: string, name: string): string {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) ?? "";
}

test("every response carries the hardened CSP baseline", async ({ request }) => {
  const res = await request.get("/voor-bedrijven");
  const csp = res.headers()["content-security-policy"];
  expect(csp, "CSP header present").toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
});

test("production CSP: script-src is nonce + strict-dynamic, no unsafe-inline", async ({ request }) => {
  const res = await request.get("/voor-bedrijven");
  const csp = res.headers()["content-security-policy"] ?? "";
  const scriptSrc = directive(csp, "script-src");

  test.skip(!scriptSrc.includes("'nonce-"), "dev server — loose CSP by design");

  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
});

test("production CSP: the nonce is fresh per request", async ({ request }) => {
  const a = (await request.get("/voor-bedrijven")).headers()["content-security-policy"] ?? "";
  const b = (await request.get("/voor-bedrijven")).headers()["content-security-policy"] ?? "";
  const nonceA = a.match(/'nonce-([^']+)'/)?.[1];
  test.skip(!nonceA, "dev server — no nonce");
  const nonceB = b.match(/'nonce-([^']+)'/)?.[1];
  expect(nonceB).toBeTruthy();
  expect(nonceA).not.toBe(nonceB);
});

test("production CSP: the page's JS runs — nonce propagated, no CSP violations, React hydrates", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("pageerror", (e) => violations.push(String(e)));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /content security policy|refused to (execute|load|apply|connect)/i.test(m.text())
    ) {
      violations.push(m.text());
    }
  });

  const res = await page.goto("/voor-bedrijven", { waitUntil: "networkidle" });
  const csp = res?.headers()["content-security-policy"] ?? "";
  test.skip(!csp.includes("'nonce-"), "dev server — strict path not exercised");
  const nonce = csp.match(/'nonce-([^']+)'/)![1];

  // The browser strips the nonce *value* from the DOM (a CSP feature), but the
  // IDL property still reflects what Next emitted. Read it directly.
  const scriptNonce = await page.evaluate(
    () => document.querySelector<HTMLScriptElement>("script[src]")?.nonce ?? null,
  );
  expect(scriptNonce, "Next stamped its script tags with a nonce").toBe(nonce);

  // React actually hydrated (a nonce-blocked bundle would leave this false).
  const hydrated = await page.evaluate(
    () => !!document.querySelector("[data-reactroot], #__next, main")?.children.length,
  );
  expect(hydrated).toBe(true);
  await expect(page.locator("body")).toBeVisible();
  expect(violations, `CSP violations / page errors:\n${violations.join("\n")}`).toEqual([]);
});
