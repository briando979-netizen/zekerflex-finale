import { describe, expect, it } from "vitest";
import { inboekVanAanvraag } from "@/lib/voorstel/inboek-regels";

const namen = { "buggy-rijden": "Buggy rijden", segway: "Segway" };
const aanvraag = {
  id: "abc123",
  programma: "Buggy rijden",
  gelegenheid: "Bedrijfsuitje",
  datum: "2026-11-20",
  personen: 14,
  naam: "Anna Aanvraag",
  email: "anna@example.com",
  telefoon: "0612345678",
  bericht: "Graag met lunch",
};

describe("aanvraag inboeken", () => {
  it("neemt de gegevens over en herkent de activiteit", () => {
    expect(inboekVanAanvraag(aanvraag, namen)).toEqual({
      aanvraag: "abc123",
      activiteit: "buggy-rijden",
      datum: "2026-11-20",
      personen: "14",
      naam: "Anna Aanvraag",
      email: "anna@example.com",
      telefoon: "0612345678",
      opmerking: "Uit aanvraag (Bedrijfsuitje: Graag met lunch)",
    });
  });

  it("laat activiteit en datum leeg als die niet te herkennen zijn", () => {
    const r = inboekVanAanvraag({ ...aanvraag, programma: "Escape Room Deluxe", datum: "", gelegenheid: "", bericht: " " }, namen);
    expect(r.activiteit).toBe("");
    expect(r.datum).toBe("");
    expect(r.opmerking).toBe("Uit aanvraag");
  });

  it("houdt de opmerking kort", () => {
    const r = inboekVanAanvraag({ ...aanvraag, bericht: "x".repeat(2000) }, namen);
    expect(r.opmerking.length).toBe(300);
    expect(r.opmerking.endsWith("…")).toBe(true);
  });
});
