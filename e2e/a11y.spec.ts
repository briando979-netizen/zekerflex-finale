import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CREDS, login } from "./helpers";

// ---------------------------------------------------------------------------
// Automated accessibility gate. axe-core catches roughly a third of WCAG 2.1
// AA issues — missing labels/alt text, ARIA misuse, contrast, landmark and
// heading structure, tab order traps. The manual checklist in
// docs/ACCESSIBILITY.md covers the rest (real keyboard walk-through, screen
// reader, focus-visible, reduced motion).
//
// Acceptance criterion (enforced): zero `critical` violations, and zero
// `serious` violations other than `color-contrast`, on every page below.
//
// `color-contrast` is a known, tracked debt — the marketing palette has
// several muted-text tokens that land just under 4.5:1. These are catalogued
// in docs/ACCESSIBILITY.md with the tokens to change; the gate lists them as
// `[a11y contrast-debt]` on each run so the count can only go down. Everything
// else (labels, link names, ARIA, landmarks, names/roles) is hard-blocked.
// `moderate` / `minor` print as `[a11y advisory]`.
// ---------------------------------------------------------------------------

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const HARD_BLOCK = (v: { impact?: string | null; id: string }) =>
  v.impact === "critical" || (v.impact === "serious" && v.id !== "color-contrast");

async function audit(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

  const blocking = results.violations.filter(HARD_BLOCK);
  const contrastDebt = results.violations.filter(
    (v) => v.id === "color-contrast" && v.impact === "serious",
  );
  const advisory = results.violations.filter(
    (v) => !HARD_BLOCK(v) && v.id !== "color-contrast",
  );

  for (const v of contrastDebt) {
    console.warn(`[a11y contrast-debt] ${label}: ${v.nodes.length} node(s) below 4.5:1`);
  }
  if (advisory.length) {
    console.warn(
      `[a11y advisory] ${label}: ${advisory
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`)
        .join(", ")}`,
    );
  }

  expect(
    blocking,
    `${label} — ${blocking.length} serious/critical a11y violation(s):\n` +
      blocking
        .map(
          (v) =>
            `  • ${v.id} [${v.impact}] ${v.help}\n    ${v.helpUrl}\n    ${v.nodes
              .slice(0, 5)
              .map((n) => n.target.join(" "))
              .join("\n    ")}`,
        )
        .join("\n"),
  ).toEqual([]);
}

const PUBLIC_PAGES: Array<[string, string]> = [
  ["home", "/"],
  ["voor-bedrijven", "/voor-bedrijven"],
  ["voor-freelancers", "/voor-freelancers"],
  ["uitzendbureau", "/uitzendbureau"],
  ["login", "/login"],
  ["register", "/register"],
  ["status", "/status"],
];

for (const [label, path] of PUBLIC_PAGES) {
  test(`a11y (public): ${label}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await audit(page, label);
  });
}

test("a11y (auth): freelancer dashboard", async ({ page }) => {
  test.slow();
  await login(page, CREDS.freelancer);
  await audit(page, "freelancer dashboard");
});

test("a11y (auth): employer workspace", async ({ page }) => {
  test.slow();
  await login(page, CREDS.employer);
  await page.goto("/werkgever", { waitUntil: "domcontentloaded" });
  await audit(page, "employer /werkgever");
});

test("a11y (auth): admin console", async ({ page }) => {
  test.slow();
  await login(page, CREDS.admin);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await audit(page, "admin /admin");
});
