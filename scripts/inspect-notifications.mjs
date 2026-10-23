// Screenshot the MELDINGEN dropdown (the bell, top-right) at phone size, via a
// read-only inspection link (Admin → Gebruikers → <testaccount> → "AI-inspectie").
//
//   node scripts/inspect-notifications.mjs "<link or token>" [--web] [--out dir] [/page]
//
// Opens a page that has the bell, clicks it, waits for the dropdown and shoots
// the viewport (not fullPage) so you see the panel exactly as on a phone.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const linkArg = args.find((a) => !a.startsWith("--") && !a.startsWith("/"));
if (!linkArg) {
  console.error('usage: node scripts/inspect-notifications.mjs "<inspectielink of token>" [--web] [--out dir] [/page]');
  process.exit(1);
}
const token = linkArg.includes("zf_inspect=") ? new URL(linkArg).searchParams.get("zf_inspect") : linkArg;
const base = linkArg.startsWith("http") ? new URL(linkArg).origin : "https://www.zekerflex.com";
const app = !args.includes("--web");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : "inspect-shots";
const pageArg = args.find((a) => a.startsWith("/")) ?? "/dashboard/klussen";

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "nl-NL" });
const page = await ctx.newPage();

await page.goto(`${base}/start?zf_inspect=${encodeURIComponent(token)}${app ? "&app=1" : ""}`, { waitUntil: "networkidle", timeout: 60000 });
for (const label of ["Alles accepteren", "Accepteren", "Akkoord", "Alleen noodzakelijk"]) {
  const b = page.getByRole("button", { name: label }).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click().catch(() => {});
    break;
  }
}

await page.goto(`${base}${pageArg}`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500); // let the bell poll /api/me/notifications

const bell = page.getByRole("button", { name: "Meldingen" }).first();
if (!(await bell.isVisible().catch(() => false))) {
  console.log("bel niet gevonden op", pageArg);
  await browser.close();
  process.exit(1);
}
await bell.click();
await page.waitForTimeout(900); // dropdown open + items render

const file = path.join(out, `meldingen${app ? "_app" : "_web"}.png`);
await page.screenshot({ path: file }); // viewport only — zie de dropdown over de balk
console.log(`dropdown -> ${file}`);
await browser.close();
