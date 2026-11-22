import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHATKNOP, CHATKNOP_VRIJ, raaktChatknop } from "@/lib/marketing/chatknop-vrij";

// 22 nov 2026 (gebruikersonderzoek B04b-04): op /klus-plaatsen lag de chatknop op de telefoon over "Totaal excl. btw".

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const telefoon = { breedte: 390, hoogte: 844 };

describe("raakt een blok de chatknop rechtsonder?", () => {
  it("een bedrag rechts onderin het scherm wel", () => {
    // de regel met het totaal, op 40 px van de onderkant, over de hele breedte van de kaart
    expect(raaktChatknop({ top: 780, bottom: 810, left: 45, right: 345 }, telefoon)).toBe(true);
  });

  it("hetzelfde blok hoger op het scherm of alleen links niet", () => {
    expect(raaktChatknop({ top: 300, bottom: 330, left: 45, right: 345 }, telefoon)).toBe(false);
    expect(raaktChatknop({ top: 780, bottom: 810, left: 16, right: 200 }, telefoon)).toBe(false);
  });

  it("de knop zit op 20 px van de rand en is 56 px groot (bottom-5 right-5 h-14 w-14)", () => {
    expect(CHATKNOP).toMatchObject({ rechts: 20, onder: 20, maat: 56 });
    const knop = lees("components/marketing/ChatWidget.tsx");
    expect(knop).toContain("fixed bottom-5 right-5 z-50 flex h-14 w-14");
  });
});

describe("de pagina's", () => {
  it("de chatknop wijkt voor zo'n blok, maar niet als de chat open is", () => {
    const knop = lees("components/marketing/ChatWidget.tsx");
    expect(knop).toContain("document.querySelectorAll(`[${CHATKNOP_VRIJ}]`)");
    expect(knop).toContain('${wijk && !open ? " invisible" : ""}');
  });

  it("de kostenregel op /klus-plaatsen is zo'n blok", () => {
    expect(CHATKNOP_VRIJ).toBe("data-chatknop-vrij");
    expect(lees("components/marketing/KlusConcept.tsx")).toMatch(/<dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm" data-chatknop-vrij="">/);
  });
});
