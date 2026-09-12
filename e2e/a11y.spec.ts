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
// Acceptance criterion (enforced): zero violations at impact `serious` or
// `critical` — colour-contrast included — on every page below. The palette
// was taken through a contrast pass to clear this (see docs/ACCESSIBILITY.md).
// `moderate` / `minor` findings print as `[a11y advisory]` so they don't rot,
// but don't fail the build.
// ---------------------------------------------------------------------------

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING = new Set(["serious", "critical"]);

async function audit(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const advisory = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));

  if (process.env.A11Y_VERBOSE) {
    for (const v of blocking) {
      for (const n of v.nodes) {
        console.warn(`    ${v.id}  ${n.target.join(" ")}\n      ${n.failureSummary?.split("\n")[1] ?? ""}`);
      }
    }
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
