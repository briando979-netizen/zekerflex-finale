import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// /dashboard/verificatie is de pagina die nieuwe werkers het meest zien. De vaste Nederlandse zinnen (Status, Geverifieerd, Verplichte
// documenten, Uitzenden, de Stripe-zin en de vinkjeslijst) staan nu in de werkerwoordenlijst (fd.verificatie) in vijf talen.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const src = readFileSync(path.join(process.cwd(), "app/dashboard/verificatie/page.tsx"), "utf8").split("\r\n").join("\n");
const dash = readFileSync(path.join(process.cwd(), "lib/dashboard/freelancer.ts"), "utf8").split("\r\n").join("\n");
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

describe("de pagina heeft geen harde Nederlandse zinnen meer", () => {
  it("geen van de oude zinnen staat nog in de pagina", () => {
    for (const zin of [
      'title="Status"',
      "Geverifieerd — je kunt diensten aannemen",
      "Verplichte documenten",
      "Uitzenden — verloning, StiPP",
      "Stripe kon je ID niet goedkeuren",
      '"onbekende reden"',
      "Probeer het opnieuw met goed licht",
    ]) {
      expect(src, zin).not.toContain(zin);
    }
  });

  it("de pagina gebruikt fd.verificatie voor die teksten, ook de vinkjeslijst (op het id van de stap)", () => {
    expect(src).toContain("const vt = fd.verificatie;");
    for (const k of ["vt.status", "vt.geverifieerd", "vt.verplichteDocumenten", "vt.uitzenden", "vt.stripeAfgekeurd", "vt.onbekendeReden"]) expect(src, k).toContain(k);
    expect(src).toContain("Object.hasOwn(vt.stappen, s.id)");
    // het 'Uitzenden'-kopje staat op twee plekken
    expect(src.match(/\{vt\.uitzenden\}/g)?.length).toBe(2);
  });

  it("lib/dashboard/freelancer.ts is ongemoeid: de labels blijven Nederlands (ze worden ook elders gelezen)", () => {
    for (const l of ["Account aangemaakt", "Werkvorm & fiscale gegevens", "Uitzendovereenkomst ondertekend", "KVK/btw gekoppeld en gevalideerd", "Identiteit geverifieerd (KYC)", "Thuisbasis en rekeningnummer ingesteld"]) expect(dash, l).toContain(l);
  });
});

describe("de woordenlijst in vijf talen", () => {
  const ids = ["account", "fiscaal", "contract", "kvk", "kyc", "thuisbasis"];

  it("elke stap-id van het overzicht heeft in elke taal een tekst, en de Nederlandse tekst is gelijk aan het label in freelancer.ts", () => {
    for (const id of ids) {
      expect(dash, id).toContain(`id: "${id}"`);
      const label = new RegExp(`id: "${id}", label: "([^"]+)"`).exec(dash)?.[1];
      expect(FREELANCER_DICTS.nl.verificatie.stappen[id as keyof typeof FREELANCER_DICTS.nl.verificatie.stappen], id).toBe(label);
    }
  });

  it("alle sleutels in alle talen, zelfde plaatshouders, echt vertaald", () => {
    const nl = FREELANCER_DICTS.nl.verificatie;
    for (const taal of TALEN) {
      const v = FREELANCER_DICTS[taal].verificatie;
      for (const k of ["status", "geverifieerd", "verplichteDocumenten", "uitzenden", "stripeAfgekeurd", "onbekendeReden"] as const) {
        expect(v[k].length, `${taal} ${k}`).toBeGreaterThan(2);
        expect(plaats(v[k]), `${taal} ${k}`).toBe(plaats(nl[k]));
        if (taal !== "nl" && nl[k].length > 12) expect(v[k], `${taal} ${k}`).not.toBe(nl[k]);
      }
      expect(Object.keys(v.stappen).sort(), taal).toEqual(Object.keys(nl.stappen).sort());
      for (const id of ids) {
        const t = v.stappen[id as keyof typeof v.stappen];
        expect(t.length, `${taal} ${id}`).toBeGreaterThan(5);
        if (taal !== "nl") expect(t, `${taal} ${id}`).not.toBe(nl.stappen[id as keyof typeof nl.stappen]);
      }
    }
    expect(nl.stripeAfgekeurd).toContain("{reden}");
  });
});
