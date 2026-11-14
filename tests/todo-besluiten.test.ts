import { describe, expect, it } from "vitest";
import { functiesWachtenTodo, type BesluitenStand } from "@/lib/admin/todo-besluiten";
import type { BounceMeting } from "@/lib/mail/bounce-ronde";
import type { VerlopenMeting } from "@/lib/shifts/verlopen";

// De eigenaar-taak "functies wachten op jouw ja" (14 nov 2026): per vlag de laatste droge telling uit KV, in één zin wat
// aanzetten doet, de weg naar Functies aan en uit, een vinkje per vlag die aan staat, en af zodra beide aan staan.

const verlopen: VerlopenMeting = { at: "2026-11-14T03:20:00Z", droog: true, gevonden: 15, gesloten: 0, zonderInschrijving: 22 };
const bounces: BounceMeting = {
  at: "2026-11-14T05:00:00Z",
  droog: true,
  nieuw: 0,
  venster: { hard: 1, beleid: 10, zacht: 0 },
  codes: { "5.7.1": 10 },
  aanbieders: { microsoft: 10 },
  gedaan: { onderdrukt: 0, leads: 0, mailLog: 0, meldingen: 0, zachtNaarHard: 0 },
};
const beideUit: BesluitenStand = { verlopen: { aan: false, meting: verlopen }, bounces: { aan: false, meting: bounces } };

describe("functiesWachtenTodo", () => {
  it("beide uit: open taak met de twee tellingen, wat aanzetten doet en de weg naar de vlaggen", () => {
    const t = functiesWachtenTodo(beideUit)!;
    expect(t.id).toBe("functies-wachten-op-ja");
    expect(t.auto).toBe(true);
    expect(t.done).toBe(false);
    expect(t.title).toBe("Twee functies wachten op jouw ja: ze tellen al, maar veranderen nog niets");
    const hoe = t.how.join("\n");
    // de telling, met de datum in Nederlandse tijd, en de vlagnaam
    expect(hoe).toContain("○ uit · Klussen na afloop vanzelf afronden. Laatste telling (14-11-2026, droog): 15 klussen na afloop met iemand erop zou naar Afgerond; 22 klussen zonder inschrijving blijven bewust open");
    expect(hoe).toContain("klussen-verlopen-sluiten");
    expect(hoe).toContain("○ uit · Terugkaatsers (bounces) verwerken. Laatste telling (14-11-2026, droog, laatste 30 dagen): 1 harde terugkaatser (adres bestaat niet), 10 weigeringen door een provider");
    expect(hoe).toContain("mail-bounce-verwerken");
    // wat aanzetten doet
    expect(hoe).toContain("Aanzetten doet: elke nacht gaat een klus");
    expect(hoe).toContain("Aanzetten doet: een hard adres komt op de onderdrukkingslijst");
    expect(hoe).toContain("Beheer → Systeem → tab Functies aan en uit");
    expect(t.doneNote).toBeUndefined();
  });

  it("één aan: vinkje bij die functie, de titel noemt de andere", () => {
    const t = functiesWachtenTodo({ ...beideUit, verlopen: { aan: true, meting: { ...verlopen, droog: false, gesloten: 15 } } })!;
    expect(t.done).toBe(false);
    expect(t.title).toBe("Eén functie wacht op jouw ja: terugkaatsers (bounces) verwerken");
    expect(t.how[0]).toContain("✓ aan · Klussen na afloop vanzelf afronden. Laatste telling (14-11-2026): 15 klussen na afloop met iemand erop ging naar Afgerond");
    expect(t.how[1]).toContain("○ uit · Terugkaatsers");
  });

  it("beide aan: afgevinkt, met een notitie", () => {
    const t = functiesWachtenTodo({ verlopen: { aan: true, meting: verlopen }, bounces: { aan: true, meting: bounces } })!;
    expect(t.done).toBe(true);
    expect(t.doneNote).toBe("beide vlaggen staan aan");
    expect(t.title).toBe("Twee functies die op jouw ja wachtten staan aan");
  });

  it("nog geen telling: zegt dat, zonder verzonnen aantallen", () => {
    const t = functiesWachtenTodo({ verlopen: { aan: false, meting: null }, bounces: { aan: false, meting: null } })!;
    expect(t.how[0]).toContain("Nog geen telling: de nachtelijke taak (03:20 UTC) heeft nog niet gedraaid.");
    expect(t.how[1]).toContain("Nog geen telling: de uurlijkse ronde heeft nog niet gedraaid.");
    expect(t.how.join("\n")).not.toMatch(/\d+ klus/);
  });

  it("een vlag die niet te lezen is valt weg; beide onleesbaar = geen taak", () => {
    const t = functiesWachtenTodo({ verlopen: { aan: undefined, meting: verlopen }, bounces: { aan: false, meting: bounces } })!;
    expect(t.title).toBe("Eén functie wacht op jouw ja: terugkaatsers (bounces) verwerken");
    expect(t.how.filter((h) => h.startsWith("○") || h.startsWith("✓"))).toHaveLength(1);
    expect(functiesWachtenTodo({ verlopen: { aan: undefined, meting: null }, bounces: { aan: undefined, meting: null } })).toBeNull();
  });

  it("enkelvoud klopt", () => {
    const t = functiesWachtenTodo({ ...beideUit, verlopen: { aan: false, meting: { ...verlopen, gevonden: 1, zonderInschrijving: 1 } } })!;
    expect(t.how[0]).toContain("1 klus na afloop met iemand erop zou naar Afgerond; 1 klus zonder inschrijving blijft bewust open");
  });
});
