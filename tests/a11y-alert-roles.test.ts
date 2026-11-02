import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 4.1.3: een foutmelding die verschijnt moet door een schermlezer
// voorgelezen worden (role="alert", of role="status" bij een succes). Deze
// bewaker vindt elke voorwaardelijke melding in foutkleur zonder role of
// aria-live. Badges en labels in foutkleur (geen melding) staan hieronder.

const ROOT = path.resolve(__dirname, "..");
const RE = /\{\s*([A-Za-z_$][\w$.?]*)\s*(?:&&|\?)\s*\(?\s*<(p|div|span)\b([^>]*?)>/g;
const ERROR_LOOK = /(text-crit|text-red-\d{3}|text-rose-\d{3}|var\(--a-crit\)|text-danger|bg-red-50|bg-crit)/;

/** Geen melding maar een badge/label/kop in foutkleur — of al binnen een aria-live-blok. */
const NOT_A_MESSAGE = new Set([
  "components/admin/ClawbacksPanel.tsx|c.workerPaid",
  "components/app/EmployerDashboardHero.tsx|sub",
  "components/app/ShiftCard.tsx|special",
  "components/app/UitzendPanel.tsx|ibanHint",
  "components/auth/RegisterForm.tsx|pwInfo?.breached",
  "components/bank/BankInsurance.tsx|p.arrears",
  "components/bank/BankView.tsx|account.frozen",
  "components/marketing/ShopChrome.tsx|promo",
  "app/dashboard/klussen/[shiftId]/page.tsx|g.required",
]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("foutmeldingen worden voorgelezen", () => {
  it("elke voorwaardelijke melding in foutkleur heeft role of aria-live", () => {
    const missing: string[] = [];
    for (const file of [...tsxFiles(path.join(ROOT, "components")), ...tsxFiles(path.join(ROOT, "app"))]) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RE)) {
        const [, expr, , attrs = ""] = m;
        if (!ERROR_LOOK.test(attrs) || /\brole\s*=/.test(attrs) || /aria-live/.test(attrs)) continue;
        if (NOT_A_MESSAGE.has(`${rel}|${expr}`)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        missing.push(`${rel}:${line} {${expr} && <${m[2]}>`);
      }
    }
    expect(missing, "Zet role=\"alert\" (fout) of role=\"status\" (succes) op deze melding").toEqual([]);
  });
});
