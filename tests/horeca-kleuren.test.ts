import { describe, expect, it } from "vitest";
import { CREME, ZAND, contrast, leesbaarOpLicht } from "@/lib/rijschool/kleuren";

// De horecasite gebruikt de accentkleur van de zaak voor kleine labels op crème
// én op het zandkleurige vlak (Openingstijden). Op beide moet hij AA halen.
describe("horeca-kleuren", () => {
  const accenten = ["#FF5F1F", "#F2B544", "#FFD400", "#22C55E", "#0EA5E9", "#E11D48", "#FFFFFF", "#0A120E"];

  it.each(accenten)("accent %s blijft leesbaar op zand en crème", (a) => {
    expect(contrast(leesbaarOpLicht(a, ZAND), ZAND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(leesbaarOpLicht(a, CREME), CREME)).toBeGreaterThanOrEqual(4.5);
  });
});
