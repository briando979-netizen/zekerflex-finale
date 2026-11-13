import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNTANT_VRAGEN, ONDERWERP_NAAM, alleOpenVragen, vraagRegel } from "@/lib/accountant/open-vragen";
import { STRUCTUUR } from "@/lib/accountant/structuur";
import { dossierHtml, esc } from "@/lib/accountant/dossier";

// De vragen voor een menselijk accountant op één plek (13 nov 2026): lib/accountant/open-vragen.ts. Het dossier
// (hoofdstuk 4) en Beheer → Accountant (tab "Open vragen") tonen dezelfde lijst, ook zonder echte administratie. Alleen
// vragen, geen antwoorden of adviezen.

describe("de lijst open vragen", () => {
  it("elke vraag is een vraag, met een geldig onderwerp, een datum en een bestaand structuurpunt", () => {
    const ids = ACCOUNTANT_VRAGEN.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of ACCOUNTANT_VRAGEN) {
      expect(v.vraag.trim().endsWith("?"), v.id).toBe(true);
      expect(Object.hasOwn(ONDERWERP_NAAM, v.onderwerp), v.id).toBe(true);
      expect(v.sinds, v.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${v.sinds}T12:00:00+01:00`)), v.id).toBe(false);
      if (v.structuurId) expect(STRUCTUUR.some((p) => p.id === v.structuurId), v.id).toBe(true);
    }
  });

  it("de vragen van 13 november staan erop", () => {
    expect(ACCOUNTANT_VRAGEN.map((v) => v.id)).toEqual(
      expect.arrayContaining([
        "83b-nl-eigenaar",
        "vs-aangifte-2026",
        "loonheffingskorting-standaard",
        "opgaaf-volledig-adres",
        "btw-buitenlandse-diensten",
        "inc-werkgever-uitzend",
      ]),
    );
    expect(ACCOUNTANT_VRAGEN).toHaveLength(6);
    // de eigenaar (13 nov): de facturen met "ZekerFlex B.V." gingen naar zijn eigen testbedrijf, staan op geannuleerd,
    // € 0 open; "Die ZekerFlex BV mag je helemaal vergeten". Geen vraag aan de accountant.
    expect(ACCOUNTANT_VRAGEN.some((v) => /B\.?V\b/.test(`${v.vraag} ${v.stand ?? ""}`))).toBe(false);
  });

  it("voor het dossier: eerst de jaarvragen (of de melding zonder administratie), dan de vaste lijst", () => {
    const zonder = alleOpenVragen(null);
    expect(zonder[0]).toBe("Er is nog geen echte administratie: eerst de boekhouding inrichten.");
    expect(zonder.slice(1)).toEqual(ACCOUNTANT_VRAGEN.map(vraagRegel));
    expect(alleOpenVragen(["Klopt de koers?"]).slice(0, 2)).toEqual(["Klopt de koers?", vraagRegel(ACCOUNTANT_VRAGEN[0]!)]);
    expect(vraagRegel(ACCOUNTANT_VRAGEN.find((v) => v.id === "opgaaf-volledig-adres")!)).toBe(
      "Loon en loonheffingen: Moeten we voor de opgaaf gegevens voor de loonheffingen van een uitzendkracht het volledige adres bewaren? (Nu bewaren we alleen naam, BSN, geboortedatum en postcode.)",
    );
  });

  it("het dossier zet ze in hoofdstuk 4, ge-escaped", () => {
    // een eigen vraag met aanhalingstekens, & en < bewijst het escapen
    const proef = vraagRegel({ id: "proef", onderwerp: "btw", vraag: 'Is "A & B" <verlegd>?', sinds: "2026-11-13" });
    expect(proef).toBe('Btw: Is "A & B" <verlegd>?');
    const html = dossierHtml({ administratie: "nog geen echte administratie", gemaaktOp: "2026-11-13", concept: null, vragen: [...alleOpenVragen(null), proef], structuur: {}, termijnen: [] });
    const h4 = html.slice(html.indexOf("<h2>4. Open vragen"), html.indexOf("<h2>5."));
    for (const v of ACCOUNTANT_VRAGEN) expect(h4).toContain(`<li>${esc(vraagRegel(v))}</li>`);
    expect(h4).toContain("<li>Btw: Is &quot;A &amp; B&quot; &lt;verlegd&gt;?</li>");
    expect(h4).not.toContain("<verlegd>");
  });

  it("de dossierroute en Beheer gebruiken dezelfde lijst", () => {
    expect(readFileSync("app/api/admin/accountant/dossier/route.ts", "utf8")).toContain("alleOpenVragen(eerste?.vragen ?? null)");
    const hub = readFileSync("components/admin/accountant/AccountantHub.tsx", "utf8");
    expect(hub).toContain('{ id: "open", label: "Open vragen" }');
    expect(hub).toContain('{tab === "open" && <OpenVragen />}');
  });
});
