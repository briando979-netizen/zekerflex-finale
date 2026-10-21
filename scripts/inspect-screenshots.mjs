// Screenshot the site as a test account, through a read-only inspection link
// (Admin → Gebruikers → <testaccount> → "AI-inspectie"). Phone-sized, in
// Android-app mode by default.
//
//   node scripts/inspect-screenshots.mjs "<link or token>" [--web] [--out dir] [/path ...]
//
// The link may be the full "App-weergave" URL or just the zf_inspect token.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const linkArg = args.find((a) => !a.startsWith("--") && !a.startsWith("/"));
if (!linkArg) {
  console.error('usage: node scripts/inspect-screenshots.mjs "<inspectielink of token>" [--web] [--out dir] [/pad ...]');
  process.exit(1);
}
const token = linkArg.includes("zf_inspect=") ? new URL(linkArg).searchParams.get("zf_inspect") : linkArg;
const base = linkArg.startsWith("http") ? new URL(linkArg).origin : "https://www.zekerflex.com";
const app = !args.includes("--web");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : "inspect-shots";
const paths = args.filter((a) => a.startsWith("/"));
const PAGES = paths.length
  ? paths
  : ["/start", "/dashboard/klussen", "/dashboard/diensten", "/dashboard/uren", "/dashboard/berichten", "/dashboard/account", "/dashboard/verificatie"];

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "nl-NL" });
const page = await ctx.newPage();

// First hit carries the link; middleware sets the read-only session (+ app) cookie.
await page.goto(`${base}/start?zf_inspect=${encodeURIComponent(token)}${app ? "&app=1" : ""}`, { waitUntil: "networkidle", timeout: 60000 });
for (const label of ["Alles accepteren", "Accepteren", "Akkoord", "Alleen noodzakelijk"]) {
  const b = page.getByRole("button", { name: label }).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click().catch(() => {});
    break;
  }
}

for (const p of PAGES) {
  try {
    const res = await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    const file = path.join(out, `${(app ? "app" : "web") + p.replace(/[^a-z0-9]+/gi, "_")}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${res?.status() ?? "?"} ${p} -> ${page.url().replace(base, "")}  ${file}`);
  } catch (e) {
    console.log(`fout ${p}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
