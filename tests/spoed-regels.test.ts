import { describe, expect, it } from "vitest";
import { isOpen, kiesOntvangers, kiesWachtende, leesAntwoord, normaliseerTelefoon, telefoonStaart, telling, verlooptOp, voegWachtToe, type SpoedOproep } from "@/lib/spoed/regels";

// Spoedoproep (lib/spoed/regels.ts): nummers, antwoorden, looptijd en wie er aan de beurt is.

describe("telefoonnummers", () => {
  it("maakt er +31… van, in welke schrijfwijze ook", () => {
    expect(normaliseerTelefoon("06 12 34 56 78")).toBe("+31612345678");
    expect(normaliseerTelefoon("06-12345678")).toBe("+31612345678");
    expect(normaliseerTelefoon("+31 6 12345678")).toBe("+31612345678");
    expect(normaliseerTelefoon("0031612345678")).toBe("+31612345678");
    expect(normaliseerTelefoon("31612345678")).toBe("+31612345678");
    expect(normaliseerTelefoon("+48 600 123 456")).toBe("+48600123456");
    expect(normaliseerTelefoon("")).toBeNull();
    expect(normaliseerTelefoon("12")).toBeNull();
    expect(normaliseerTelefoon("niet een nummer")).toBeNull();
    expect(telefoonStaart("+31612345678")).toBe("612345678");
  });
});

describe("antwoorden", () => {
  it("verstaat 1/2/STOP in de talen van de app", () => {
    expect(leesAntwoord("1")).toBe("ja");
    expect(leesAntwoord(" Ja! ")).toBe("ja");
    expect(leesAntwoord("tak")).toBe("ja");
    expect(leesAntwoord("2")).toBe("nee");
    expect(leesAntwoord("Nee.")).toBe("nee");
    expect(leesAntwoord("ні")).toBe("nee");
    expect(leesAntwoord("STOP")).toBe("stop");
    expect(leesAntwoord("hoe laat begint het?")).toBeNull();
  });
});

describe("looptijd en wachtlijst", () => {
  const nu = new Date("2026-11-06T10:00:00Z");

  it("loopt tot de start, maar hooguit 12 uur; na de start nog 2 uur", () => {
    expect(verlooptOp(new Date("2026-11-06T14:00:00Z"), nu).toISOString()).toBe("2026-11-06T14:00:00.000Z");
    expect(verlooptOp(new Date("2026-11-07T10:00:00Z"), nu).toISOString()).toBe("2026-11-06T22:00:00.000Z");
    expect(verlooptOp(new Date("2026-11-06T09:00:00Z"), nu).toISOString()).toBe("2026-11-06T12:00:00.000Z");
  });

  it("kiest de jongste open oproep als iemand 1 antwoordt", () => {
    let w = voegWachtToe(null, "s1", "2026-11-06T12:00:00Z", nu);
    w = voegWachtToe(w, "s2", "2026-11-06T13:00:00Z", nu);
    expect(kiesWachtende(w, nu)).toBe("s2");
    expect(kiesWachtende(w, new Date("2026-11-06T12:30:00Z"))).toBe("s2");
    expect(kiesWachtende(w, new Date("2026-11-06T14:00:00Z"))).toBeNull();
    // dezelfde dienst nog eens: één regel
    w = voegWachtToe(w, "s2", "2026-11-06T15:00:00Z", nu);
    expect(w.items.filter((i) => i.shiftId === "s2")).toHaveLength(1);
    expect(kiesWachtende(null, nu)).toBeNull();
  });

  it("kiest de dichtstbijzijnde binnen de straal die nog niet bereikt is", () => {
    const k = [
      { userId: "a", km: 30 },
      { userId: "b", km: 4 },
      { userId: "c", km: 12 },
      { userId: "d", km: 8 },
    ];
    expect(kiesOntvangers(k, new Set(["d"]), 25, 2).map((x) => x.userId)).toEqual(["b", "c"]);
    expect(kiesOntvangers(k, new Set(), 50).map((x) => x.userId)).toEqual(["b", "d", "c", "a"]);
  });

  it("telt de antwoorden en weet of een oproep nog open is", () => {
    const o: SpoedOproep = {
      shiftId: "s1",
      tenantId: "t1",
      gestartDoor: "u0",
      at: nu.toISOString(),
      verloopt: "2026-11-06T14:00:00Z",
      radiusKm: 25,
      kanalen: ["push"],
      ontvangers: [
        { userId: "a", naam: "A", km: 1, via: ["push"], at: nu.toISOString(), antwoord: "ja", uitkomst: "ingepland" },
        { userId: "b", naam: "B", km: 2, via: ["push", "sms"], at: nu.toISOString(), antwoord: "nee" },
        { userId: "c", naam: "C", km: 3, via: ["push"], at: nu.toISOString() },
      ],
    };
    expect(telling(o)).toEqual({ verstuurd: 3, ja: 1, nee: 1, open: 1, ingepland: 1 });
    expect(isOpen(o, nu)).toBe(true);
    expect(isOpen(o, new Date("2026-11-06T15:00:00Z"))).toBe(false);
    expect(isOpen({ ...o, gestopt: nu.toISOString() }, nu)).toBe(false);
  });
});
