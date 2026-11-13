import { describe, expect, it } from "vitest";
import { platformnaamTodo } from "@/lib/admin/todo-platformnaam";
import { PLATFORM_NAAM } from "@/lib/platform/bedrijf";

// Eigenaar-taak (13 nov): facturen van het platform tonen als afzender de naam van de platformorganisatie, en die heet in
// de database nog "ZekerFlex B.V.". De taak staat open zolang er zulke facturen zijn en de naam niet klopt.

describe("eigenaar-taak: facturen met de oude platformnaam", () => {
  it("staat open zolang er uitgegeven facturen zijn en de naam afwijkt", () => {
    const t = platformnaamTodo({ naam: "ZekerFlex B.V.", aantal: 11, totaalCents: 117_613 });
    expect(t).not.toBeNull();
    expect(t?.done).toBe(false);
    expect(t?.auto).toBe(true);
    expect(t?.group).toBe("Juridisch");
    // Intl zet een vaste spatie tussen € en het bedrag (breekt niet af op de telefoon)
    expect(t?.title.replace(/ /g, " ")).toBe('Facturen met afzender "ZekerFlex B.V." (11, € 1.176,13): met de accountant afstemmen');
    expect(t?.how.join(" ")).toContain(PLATFORM_NAAM);
  });

  it("vinkt zichzelf af zodra de naam gelijk is aan de rechtspersoon", () => {
    expect(platformnaamTodo({ naam: PLATFORM_NAAM, aantal: 11, totaalCents: 117_613 })?.done).toBe(true);
  });

  it("geen taak zonder facturen (dan kan de naam zo worden bijgewerkt) of zonder telling", () => {
    expect(platformnaamTodo({ naam: "ZekerFlex B.V.", aantal: 0, totaalCents: 0 })).toBeNull();
    expect(platformnaamTodo(null)).toBeNull();
  });

  it("noemt nooit een ontvanger: alleen de naam van het platform, het aantal en het totaal", () => {
    const t = platformnaamTodo({ naam: "ZekerFlex B.V.", aantal: 2, totaalCents: 1_000 });
    const tekst = JSON.stringify(t);
    expect(tekst).not.toMatch(/recipient|ontvanger:/i);
  });
});
