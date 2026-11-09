import { describe, expect, it } from "vitest";
import { mislukteControles, redenTekst } from "@/lib/onboarding/redenen";

const checks = [
  { label: "Documentfoto's", ok: true },
  { label: "Naam komt overeen", ok: false },
  { label: "Code op het document gelezen (MRZ)", ok: false },
  { label: "Ingestuurd vanaf je telefoon", ok: false },
  { label: "Document niet al gebruikt door een ander account", ok: true, intern: true },
];

describe("redenen van een ID-controle", () => {
  it("noemt alleen de controles die niet klopten, in volgorde", () => {
    expect(mislukteControles(checks)).toEqual(["Naam komt overeen", "Code op het document gelezen (MRZ)", "Ingestuurd vanaf je telefoon"]);
  });

  it("kapt af op het maximum", () => {
    expect(mislukteControles(checks, 2)).toHaveLength(2);
  });

  it("geeft een lege tekst als alles klopte", () => {
    expect(redenTekst([{ label: "Naam", ok: true }])).toBe("");
    expect(redenTekst([])).toBe("");
  });

  it("maakt een leesbare toevoeging voor het auditspoor, zonder het woord KVK als dat er niet toe doet", () => {
    const t = redenTekst(checks);
    expect(t).toBe(" (niet in orde: Naam komt overeen; Code op het document gelezen (MRZ); Ingestuurd vanaf je telefoon)");
    expect(t).not.toMatch(/KVK/);
  });
});
