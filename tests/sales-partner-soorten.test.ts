import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beoordeelCampagneTekst, maakCampagneMail, PROEF_INVULLING } from "@/lib/sales/campagne-tekst";
import { PARTNER_CAMPAGNE, PARTNER_SOORTEN, partnerSoort } from "@/lib/sales/partner-soorten";
import { OSM_TAGS_PER_SECTOR, sectorVan, tagsVoorSector } from "@/lib/sales/discovery/osm-tags";

// De partnercampagnes: eerlijke vaste teksten die door dezelfde controle moeten als elke campagnetekst, eigen OpenStreetMap-kenmerken en
// aanmaken als concept zonder dubbelen.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("partnersoorten: de teksten", () => {
  it("er zijn drie soorten met een eigen sector en een eigen campagnenaam", () => {
    expect(PARTNER_SOORTEN.map((s) => s.id)).toEqual(["uitzendbureau", "verzekeraar", "accountant"]);
    expect(new Set(PARTNER_SOORTEN.map((s) => s.campagneNaam)).size).toBe(3);
    expect(partnerSoort("verzekeraar")?.sector).toBe("verzekeraar");
    expect(partnerSoort("constructor")).toBeNull();
  });

  for (const s of PARTNER_SOORTEN) {
    describe(s.label, () => {
      it("komt door de controle van de verkoopmotor (geen verboden woorden, geen vreemde bedragen, juiste plaatshouders)", () => {
        expect(beoordeelCampagneTekst(s.tekst)).toEqual({ goed: true, redenen: [] });
      });

      it("beloofd niets over prijs, marge, verzekering of voorwaarden, en noemt geen klanten die er niet zijn", () => {
        const alles = `${s.tekst.onderwerp}\n${s.tekst.tekst}`;
        expect(alles).not.toMatch(/€|\beuro\b|\d+\s?%/i);
        expect(alles).not.toMatch(/gegarandeerd|garantie|verzekerd|verzekering\b|dekking|exclusief|zonder risico|binnenkort/i);
        expect(alles).not.toMatch(/onze klanten|tevreden klanten|meer dan \d+ bedrijven|marktleider/i);
        expect(alles).toContain("nog in opbouw");
        expect(alles).toContain("bijna 100 werkers");
      });

      it("is persoonlijk geschreven: aanhef, bedrijf en plaats worden ingevuld, geen streepjes, geen invulplekken", () => {
        const mail = maakCampagneMail(s.tekst, PROEF_INVULLING);
        expect(mail.subject).toContain("Voorbeeld B.V.");
        expect(mail.body.startsWith("Beste heer/mevrouw,")).toBe(true);
        expect(mail.body).not.toMatch(/\{|\}/);
        expect(mail.body).not.toMatch(/ — | – /);
        expect(mail.body.endsWith("+31 970 102 51797")).toBe(true);
        expect(s.tekst.zonderVacature).toBe(true);
      });
    });
  }

  it("de uitzendtekst zegt dat ZekerFlex zelf niet uitleent, en de verzekeringstekst dat er zelf niets wordt aangeboden", () => {
    expect(partnerSoort("uitzendbureau")?.tekst.tekst).toContain("ZekerFlex leent zelf geen mensen uit");
    expect(partnerSoort("verzekeraar")?.tekst.tekst).toContain("ZekerFlex biedt zelf niets aan op dat gebied");
  });
});

describe("partnersoorten: ontdekken in OpenStreetMap", () => {
  it("elke sector heeft kenmerken, en een sectornaam uit een campagne wordt herkend", () => {
    for (const s of PARTNER_SOORTEN) {
      expect(Object.hasOwn(OSM_TAGS_PER_SECTOR, s.sector)).toBe(true);
      expect(tagsVoorSector(s.sector).length).toBeGreaterThan(0);
    }
    expect(tagsVoorSector("uitzendbureau")).toEqual([{ sleutel: "office", soorten: ["employment_agency"] }]);
    expect(sectorVan("Zorgverzekeraars")).toBe("verzekeraar"); // niet "zorg"
    expect(sectorVan("administratiekantoren")).toBe("accountant");
    expect(sectorVan("uitzend en detachering")).toBe("uitzendbureau");
    // de bestaande sectoren veranderen niet
    expect(sectorVan("zorg")).toBe("zorg");
    expect(sectorVan("horeca")).toBe("horeca");
  });
});

// ---- aanmaken ------------------------------------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  campagnes: [] as { id: string; name: string; status: string; mode: string }[],
  teksten: new Map<string, unknown>(),
  gemaakt: [] as { name: string; targetSectors?: string[]; minScore?: number; dailyCap?: number; createdById: string }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesCampaign: {
      findMany: async ({ where }: { where: { name: { in: string[] } } }) => h.campagnes.filter((c) => where.name.in.includes(c.name)),
      findFirst: async ({ where }: { where: { name: string } }) => h.campagnes.find((c) => c.name === where.name) ?? null,
    },
  },
}));
vi.mock("@/lib/sales/campaign", () => ({
  createCampaign: async (input: { name: string; targetSectors?: string[]; minScore?: number; dailyCap?: number; createdById: string }) => {
    h.gemaakt.push(input);
    const c = { id: `c${h.campagnes.length + 1}`, name: input.name, status: "DRAFT", mode: "REVIEW" };
    h.campagnes.push(c);
    return c;
  },
}));
vi.mock("@/lib/sales/campagne-tekst-opslag", () => ({
  leesCampagneTekst: async (id: string) => h.teksten.get(id) ?? null,
  bewaarCampagneTekst: async (id: string, tekst: unknown) => void h.teksten.set(id, tekst),
}));

import { maakPartnerCampagnes, partnerStand } from "@/lib/sales/partner-campagnes";

describe("partnercampagnes aanmaken", () => {
  beforeEach(() => {
    h.campagnes.length = 0;
    h.teksten.clear();
    h.gemaakt.length = 0;
  });

  it("maakt drie concepten met hun tekst, en bij nog een keer drukken geen dubbelen", async () => {
    const eerst = await maakPartnerCampagnes({ id: "u1", email: "beheer@zekerflex.test" });
    expect(eerst.aangemaakt).toHaveLength(3);
    expect(eerst.bestond).toHaveLength(0);
    expect(h.gemaakt.map((g) => g.targetSectors)).toEqual([["uitzendbureau"], ["verzekeraar"], ["accountant"]]);
    for (const g of h.gemaakt) {
      expect(g.minScore).toBe(PARTNER_CAMPAGNE.minScore);
      expect(g.dailyCap).toBe(10);
      expect(g.createdById).toBe("u1");
    }
    expect(h.teksten.size).toBe(3);
    const tweede = await maakPartnerCampagnes({ id: "u1", email: "beheer@zekerflex.test" });
    expect(tweede).toEqual({ aangemaakt: [], bestond: PARTNER_SOORTEN.map((s) => s.campagneNaam) });
    expect(h.campagnes).toHaveLength(3);
  });

  it("een bestaande campagne zonder tekst krijgt zijn tekst alsnog, een bestaande tekst blijft staan", async () => {
    await maakPartnerCampagnes({ id: "u1", email: "a@zekerflex.test" });
    const eerste = h.campagnes[0]!;
    h.teksten.delete(eerste.id);
    h.teksten.set(h.campagnes[1]!.id, { onderwerp: "door de eigenaar aangepast" });
    await maakPartnerCampagnes({ id: "u1", email: "a@zekerflex.test" });
    expect(h.teksten.get(eerste.id)).toBeTruthy();
    expect(h.teksten.get(h.campagnes[1]!.id)).toEqual({ onderwerp: "door de eigenaar aangepast" });
  });

  it("de stand laat per soort zien of de campagne bestaat, hoe hij staat en of hij een tekst heeft", async () => {
    expect((await partnerStand()).map((s) => s.campagneId)).toEqual([null, null, null]);
    await maakPartnerCampagnes({ id: "u1", email: "a@zekerflex.test" });
    const stand = await partnerStand();
    expect(stand.every((s) => s.status === "DRAFT" && s.mode === "REVIEW" && s.heeftTekst)).toBe(true);
  });
});

describe("partnercampagnes: aangesloten", () => {
  it("de route is alleen voor platformbeheerders, begrensd en gelogd; de pagina staat in het menu", () => {
    const route = lees("app/api/admin/sales/partner-campagnes/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)).toHaveLength(2);
    expect(route).toContain("enforceRateLimit");
    expect(route).toContain('action: "sales.partner.campagnes"');
    expect(lees("lib/admin/nav.ts")).toContain('{ href: "/admin/sales/partners", label: "Partnercampagnes" }');
    // niets in de partnercampagnes zet een campagne actief of verstuurt iets
    const server = lees("lib/sales/partner-campagnes.ts");
    expect(server).not.toMatch(/activateCampaign|setCampaignMode|sendMail|AUTOPILOT/);
  });
});
