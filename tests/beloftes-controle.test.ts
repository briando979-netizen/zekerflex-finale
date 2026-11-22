import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD } from "@/lib/marketing/aanbod";
import { ALL_PRODUCTS, DEPLOYMENT_LABEL } from "@/lib/products";
import { JOB_SKILLS } from "@/lib/jobs/skills";
import { RETENTION_RULES } from "@/lib/privacy/retention";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Bewaker (16 nov 2026, schermcontrole van de live site): beloftes die niet klopten en tekst die niet voor klanten bedoeld
// was. Geen bank, geen 5G, geen Peppol-verzending, geen interne verkoopnotities en geen Engelse vaktaal op openbare
// pagina's. Komt iets echt terug (een vergunning, een Peppol-toegangspunt), pas dan deze bewaker bewust aan.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("geen beloftes die niet kloppen", () => {
  it("/prijzen noemt de bank niet als module", () => {
    expect(lees("app/(marketing)/prijzen/page.tsx")).not.toMatch(/uitzend, bank\)/);
  });

  // /werkgever/netwerk (het scherm Verbinding) is op 22 nov 2026 weggehaald; de teksten beloven nog steeds geen eigen 5G
  it("nergens een eigen 5G, en de VPN gebruikt eerlijk de Tailscale-app", () => {
    expect(lees("lib/netwerk/modules.ts")).not.toMatch(/Geen dure diensten als Tailscale/);
    for (const p of ["lib/branches/modules.ts", "lib/os/apps.ts", "lib/i18n/dictionaries.ts", "lib/i18n/dictionary-en.ts"]) {
      expect(lees(p), p).not.toMatch(/en 5G|eigen 5G-netwerk|your own 5G/);
    }
  });

  it("e-facturatie noemt Peppol niet in de naam zolang verzenden via Peppol er niet is", () => {
    const item = AANBOD.find((a) => a.slug === "e-facturatie");
    expect(item?.naam).toBe("E-facturatie (UBL)");
  });

  it("/werkgever/bedrijf toont het blok over het voorschot alleen als het voorschot echt overgemaakt kan worden", () => {
    const scherm = lees("components/werkgever/FastPaySettings.tsx");
    expect(scherm).toContain("s.voorschotKan ?");
    // kan het niet, dan staat er niets (ook geen uitleg dat het niet kan)
    expect(scherm).not.toContain("voorschotNiet");
    expect(scherm.match(/f\.voorschotKop/g)?.length).toBe(1);
    expect(lees("app/api/werkgever/fastpay/route.ts")).toMatch(/directeSepaIngericht\(\) \|\| !\(await stripeBetalenDicht\(\)\)/);
  });

  // /werkgever/website (het websitebeheer) is op 22 nov 2026 weggehaald, met de klantsites
  // de productpagina van de shop (ProductDetail, ShopProductCard) is op 22 nov 2026 weggehaald, met de hele webshop
  it("/demo noemt geen aantal krachten", () => {
    expect(lees("app/(marketing)/demo/page.tsx")).not.toMatch(/duizenden|honderden/);
  });

  it("/nieuwsbrief/afmelden zegt alleen 'Je bent afgemeld' met een geldige code", () => {
    const s = lees("app/(marketing)/nieuwsbrief/afmelden/page.tsx");
    expect(s).toContain('{afgemeld ? "Je bent afgemeld"');
    expect(lees("lib/newsletter/unsubscribe.ts")).toContain("Promise<boolean>");
    expect(lees("app/api/nieuwsbrief/afmelden/route.ts")).toContain("?ongeldig=1");
  });
});

describe("geen interne notities of Engelse vaktaal voor klanten", () => {
  // de pagina's /producten en /producten/<slug> zijn op 22 nov 2026 weggehaald; de productlijst zelf blijft gecontroleerd
  it("de productlijst toont geen interne notities of Engelse vaktaal", () => {
    const zichtbaar = ALL_PRODUCTS.flatMap((p) => [p.kicker, p.tagline, p.concept, p.audience, p.priceLabel, ...p.why, ...p.features]).join(" ");
    expect(zichtbaar).not.toMatch(/self-hosted|as a service|One-command|sourcen|verkoopcyclus|domeinlogica|plug-in|SaaS/i);
    expect(Object.values(DEPLOYMENT_LABEL).join(" ")).not.toMatch(/SaaS|Self-hosted|as a service/);
  });

  it("/about is geen Engelse kopie meer maar stuurt door naar /over-ons", () => {
    const s = lees("app/(marketing)/about/page.tsx");
    expect(s).toContain('permanentRedirect("/over-ons")');
    expect(s).not.toMatch(/About us|Three principles|Join us/);
  });

  it("de keuzes bij een open sollicitatie zijn Nederlands", () => {
    expect(JOB_SKILLS.join(" ")).not.toMatch(/engineering|design\b|analytics|operations|community|partnerships|People|&/);
  });

  it("de lijst van wat er bij het verwijderen gewist of bewaard wordt, is in gewone woorden", () => {
    const tekst = RETENTION_RULES.flatMap((r) => [r.label, ...(r.blocksErasure ? [r.basis] : [])]).join(" ");
    expect(tekst).not.toMatch(/Didit|payload|fingerprint|engagement|self-billing|payroll|append-only|\bPII\b|reset-token|biometrie-score|Jarvis|Brain\b/i);
  });

  it("die lijst staat in de werkerapp in alle vijf talen, en het Nederlands is woord voor woord het bewaarschema", () => {
    const bewaard = RETENTION_RULES.filter((r) => r.blocksErasure);
    for (const r of RETENTION_RULES) expect(FREELANCER_DICTS.nl.restTaal.wisOnderdelen[r.key as keyof typeof FREELANCER_DICTS.nl.restTaal.wisOnderdelen], r.key).toBe(r.label);
    for (const r of bewaard) expect(FREELANCER_DICTS.nl.restTaal.wisGronden[r.key as keyof typeof FREELANCER_DICTS.nl.restTaal.wisGronden], r.key).toBe(r.basis);
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(Object.keys(d.restTaal.wisOnderdelen).sort(), taal).toEqual(RETENTION_RULES.map((r) => r.key).sort());
      expect(Object.keys(d.restTaal.wisGronden).sort(), taal).toEqual(bewaard.map((r) => r.key).sort());
    }
    expect(lees("components/privacy/ErasureScopeInfo.tsx")).toContain("texts.wisOnderdelen?.[r.key] ?? r.label");
    expect(lees("app/dashboard/account/verwijderen/page.tsx")).toContain("texts={ft.restTaal}");
  });

  it("de werkerapp toont de stand van de identiteitscontrole als gewone tekst, in alle vijf talen", () => {
    expect(lees("app/dashboard/profiel/page.tsx")).not.toContain("user?.kycStatus ?? t.nietGestart");
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of ["kycInBehandeling", "kycAfgekeurd", "kycVerlopen", "nietGestart", "geverifieerd"] as const) {
        expect(d.profiel[k].length, `${taal}.${k}`).toBeGreaterThan(2);
      }
      expect(d.fiscaalForm.factuur.reverseBilling, taal).not.toMatch(/reverse billing/i);
      expect(d.fiscaalForm.kinds.zzp.blurb, taal).not.toMatch(/reverse billing/i);
      expect(d.acct.insurance, taal).not.toMatch(/voordelen|benefits|korzyści|beneficii|переваги/i);
    }
  });

  it("de fiscale samenvatting volgt de facturatiewijze van de server (een uitzendkracht krijgt een loonstrook)", () => {
    expect(lees("components/app/FiscalForm.tsx")).toContain('resolvedInvoiceMode: facturatie ?? "reverse-billing"');
    expect(lees("app/dashboard/fiscaal/page.tsx")).toContain("facturatie={invoiceModeFor(fiscal)}");
  });
});
