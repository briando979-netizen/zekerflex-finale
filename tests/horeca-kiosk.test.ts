import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { magActie, SCHERM_ROLLEN, SCHERMEN, schermBeschikbaar } from "@/lib/horeca/schermen";
import { schermActieSchema } from "@/lib/horeca/schema";
import { ARCHIEF_BRONNEN } from "@/lib/horeca/archief";

// De zelfbestelzuil (15 nov 2026): gasten bestellen zelf op een tablet, hier opeten of meenemen, en krijgen een
// nummer; betalen aan de balie. De zuil staat voor gasten, dus hij krijgt alleen de kaart en kan maar één ding.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("zelfbestelzuil", () => {
  it("een eigen scherm dat alleen een gastbestelling mag plaatsen", () => {
    expect(SCHERM_ROLLEN).toContain("kiosk");
    expect(SCHERMEN.kiosk.acties).toEqual(["kiosk-bestelling"]);
    expect(magActie("kiosk", "afrekenen")).toBe(false);
    expect(magActie("kiosk", "verkoop")).toBe(false);
    expect(magActie("kassa", "kiosk-bestelling")).toBe(false);
    expect(schermBeschikbaar("kiosk", ["bestellen"])).toBe(true);
    expect(schermBeschikbaar("kiosk", ["reserveren"])).toBe(false);
  });

  it("invoer: mand en hier opeten of meenemen", () => {
    expect(schermActieSchema.safeParse({ actie: "kiosk-bestelling", mand: [{ itemId: "i1", aantal: 2 }], hier: true }).success).toBe(true);
    expect(schermActieSchema.safeParse({ actie: "kiosk-bestelling", mand: [], hier: true }).success).toBe(false);
  });

  it("de zuil krijgt alleen de kaart: geen bestellingen, namen, tafels of reserveringen", () => {
    const live = lees("lib/horeca/live.ts");
    const begin = live.indexOf('if (rol === "kiosk")');
    const blok = live.slice(begin, live.indexOf("const live = await liveVan(zaak);", begin));
    expect(begin).toBeGreaterThan(0);
    expect(blok).toContain("return { zaak: zaakKort, items: kaartItems, categorieen: kaartCategorieen }");
    expect(blok).not.toMatch(/liveVan\(|bestellingenVan|bestellingenLive|reserveringenOp|tafelsVan|horecaBestelling\./);
  });

  it("geen weg naar de andere schermen op de zuil; betalen aan de balie", () => {
    expect(lees("components/horeca/scherm/SchermApp.tsx")).toContain('rol !== "kiosk"');
    expect(lees("components/horeca/scherm/KioskScherm.tsx")).toContain("Betaal aan de balie");
  });

  it("de bron telt mee in het archief", () => {
    expect(ARCHIEF_BRONNEN).toContain("kiosk");
  });
});
