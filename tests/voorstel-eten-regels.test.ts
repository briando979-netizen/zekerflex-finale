import { describe, expect, it } from "vitest";
import { etenAanvraagPad, leesEtenInvulling } from "@/lib/voorstel/eten-regels";

const namen = { "buggy-rijden": "Buggy rijden" };

describe("blijf je eten", () => {
  it("bouwt een link en leest die weer terug", () => {
    const pad = etenAanvraagPad("/voorstel/schwarzwald", { id: "ABCDEF12", activiteit: "buggy-rijden", datum: "2026-11-07", tijd: "14:00", personen: 6 });
    expect(pad.startsWith("/voorstel/schwarzwald/reserveren?voor=restaurant&")).toBe(true);
    expect(pad.endsWith("#aanvraag")).toBe(true);
    const q = Object.fromEntries(new URL(pad, "https://x.nl").searchParams);
    expect(leesEtenInvulling(q, namen)).toEqual({
      datum: "2026-11-07",
      aantal: "6",
      bericht: "Wij willen graag eten na onze reservering ABCDEF12 (Buggy rijden om 14:00 uur).",
    });
  });

  it("alleen bij voor=restaurant", () => {
    expect(leesEtenInvulling({ voor: "bedrijfsuitje", datum: "2026-11-07" }, namen)).toBeNull();
    expect(leesEtenInvulling({}, namen)).toBeNull();
  });

  it("laat wat niet klopt leeg, en zet geen vreemde tekst in het bericht", () => {
    expect(leesEtenInvulling({ voor: "restaurant", datum: "7-11-2026", personen: "6" }, namen)).toEqual({ datum: "", aantal: "6", bericht: "" });
    expect(leesEtenInvulling({ voor: "restaurant", personen: "0" }, namen)).toBeNull();
    expect(leesEtenInvulling({ voor: "restaurant", personen: "2.5", datum: "2026-11-07" }, namen)?.aantal).toBe("");
    // onbekende activiteit, rare tijd of nummer: geen bericht
    expect(leesEtenInvulling({ voor: "restaurant", datum: "2026-11-07", na: "<script>", tijd: "14:00", nr: "ABCDEF12" }, namen)?.bericht).toBe("");
    expect(leesEtenInvulling({ voor: "restaurant", datum: "2026-11-07", na: "toString", tijd: "14:00", nr: "ABCDEF12" }, namen)?.bericht).toBe("");
    expect(leesEtenInvulling({ voor: "restaurant", datum: "2026-11-07", na: "buggy-rijden", tijd: "14u", nr: "ABCDEF12" }, namen)?.bericht).toBe("");
    expect(leesEtenInvulling({ voor: "restaurant", datum: "2026-11-07", na: "buggy-rijden", tijd: "14:00", nr: "abc" }, namen)?.bericht).toBe("");
  });
});
