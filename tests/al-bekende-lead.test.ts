import { describe, expect, it } from "vitest";
import { alBekendeLeads, kvkCijfers, naamSleutel, waarschuwingTekst, type LeadKort } from "@/lib/sales/al-bekende-lead";
import { zakelijkDomein } from "@/lib/sales/vrije-maildomeinen";

// Een commissiepartner krijgt € 1 per gewerkt uur, zes maanden lang. Meldt hij een bedrijf aan dat ZekerFlex zelf al als
// lead had, dan betaalt de eigenaar voor iets wat hij al bezat. Deze vergelijking blokkeert niets: ze waarschuwt alleen.

const lead = (o: Partial<LeadKort> & { id: string; companyName: string }): LeadKort => ({
  kvkNumber: null,
  contactEmail: null,
  discoveredEmail: null,
  status: "NEW",
  source: "kvkbase",
  createdAt: new Date("2026-11-01T00:00:00+01:00"),
  ...o,
});

describe("kvkCijfers", () => {
  it("houdt alleen een nummer van acht cijfers over", () => {
    expect(kvkCijfers("12345678")).toBe("12345678");
    expect(kvkCijfers("1234 5678")).toBe("12345678");
    expect(kvkCijfers("KVK 12345678")).toBe("12345678");
  });
  it("weigert alles wat geen acht cijfers is", () => {
    for (const v of ["1234567", "123456789", "", null, undefined, "abc"]) expect(kvkCijfers(v), String(v)).toBeNull();
  });
});

describe("zakelijkDomein", () => {
  it("geeft het domein van een zakelijk adres", () => {
    expect(zakelijkDomein("info@jansen.nl")).toBe("jansen.nl");
    expect(zakelijkDomein("Info@Jansen.NL")).toBe("jansen.nl");
  });
  // de lijst is gedeeld met de rest van het platform (lib/sales/vrije-maildomeinen.ts): een eigen kopie liep achter
  it("negeert gratis diensten: daar zegt het domein niets over het bedrijf", () => {
    for (const e of ["jan@gmail.com", "jan@hotmail.nl", "jan@outlook.nl", "jan@ziggo.nl", "jan@proton.me"]) expect(zakelijkDomein(e), e).toBeNull();
  });
  it("geeft niets terug bij iets wat geen adres is", () => {
    for (const e of ["", "geen adres", "jan@", "@nl"]) expect(zakelijkDomein(e), e).toBeNull();
  });
});

describe("naamSleutel", () => {
  it("ziet dezelfde naam met een andere rechtsvorm als gelijk", () => {
    expect(naamSleutel("Jansen B.V.")).toBe(naamSleutel("Jansen BV"));
    expect(naamSleutel("Jansen Holding")).toBe(naamSleutel("jansen"));
  });
  it("ziet een ander bedrijf niet als gelijk", () => {
    expect(naamSleutel("Jansen Transport")).not.toBe(naamSleutel("Jansen B.V."));
  });
});

describe("alBekendeLeads", () => {
  it("vindt niets als er niets lijkt", () => {
    const uit = alBekendeLeads({ bedrijfsnaam: "Nieuw Bedrijf", kvk: "87654321", email: "info@nieuw.nl" }, [lead({ id: "a", companyName: "Jansen BV", kvkNumber: "12345678" })]);
    expect(uit).toEqual([]);
  });

  it("herkent hetzelfde KVK-nummer", () => {
    const uit = alBekendeLeads({ bedrijfsnaam: "Heel andere naam", kvk: "1234 5678", email: null }, [lead({ id: "a", companyName: "Jansen BV", kvkNumber: "12345678" })]);
    expect(uit).toHaveLength(1);
    expect(uit[0]!.soort).toBe("kvk");
  });

  it("herkent hetzelfde zakelijke e-maildomein, maar niet via gmail", () => {
    const leads = [lead({ id: "a", companyName: "Jansen", contactEmail: "info@jansen.nl" }), lead({ id: "b", companyName: "Pietersen", contactEmail: "pietersen@gmail.com" })];
    expect(alBekendeLeads({ bedrijfsnaam: "X", kvk: null, email: "verkoop@jansen.nl" }, leads).map((m) => m.lead.id)).toEqual(["a"]);
    expect(alBekendeLeads({ bedrijfsnaam: "Y", kvk: null, email: "iemand@gmail.com" }, leads)).toEqual([]);
  });

  it("herkent een vrijwel gelijke naam als vermoeden", () => {
    const uit = alBekendeLeads({ bedrijfsnaam: "Jansen B.V.", kvk: null, email: null }, [lead({ id: "a", companyName: "Jansen BV" })]);
    expect(uit).toHaveLength(1);
    expect(uit[0]!.soort).toBe("naam");
  });

  it("noemt een lead hoogstens één keer, met de zekerste reden", () => {
    const leads = [lead({ id: "a", companyName: "Jansen BV", kvkNumber: "12345678", contactEmail: "info@jansen.nl" })];
    const uit = alBekendeLeads({ bedrijfsnaam: "Jansen B.V.", kvk: "12345678", email: "info@jansen.nl" }, leads);
    expect(uit).toHaveLength(1);
    expect(uit[0]!.soort).toBe("kvk");
  });

  it("laat een afgesloten lead buiten beschouwing: die hadden we feitelijk niet meer", () => {
    for (const status of ["WON", "LOST", "DISQUALIFIED", "UNSUBSCRIBED"]) {
      const uit = alBekendeLeads({ bedrijfsnaam: "Jansen", kvk: "12345678", email: null }, [lead({ id: "a", companyName: "Jansen", kvkNumber: "12345678", status })]);
      expect(uit, status).toEqual([]);
    }
  });

  it("een lopende lead telt wel", () => {
    for (const status of ["NEW", "ENRICHED", "QUEUED", "DRAFTED", "REPLIED"]) {
      const uit = alBekendeLeads({ bedrijfsnaam: "Jansen", kvk: "12345678", email: null }, [lead({ id: "a", companyName: "Jansen", kvkNumber: "12345678", status })]);
      expect(uit, status).toHaveLength(1);
    }
  });
});

describe("waarschuwingTekst", () => {
  it("zegt sinds wanneer, waar hij vandaan komt en hoe zeker het is", () => {
    const t = waarschuwingTekst({ lead: lead({ id: "a", companyName: "Jansen", kvkNumber: "12345678" }), soort: "kvk" });
    expect(t).toContain("zelfde KVK-nummer");
    expect(t).toContain("2026-11-01");
    expect(t).toContain("kvkbase");
    expect(t).toContain("NEW");
  });
  it("waarschuwt extra bij een naam, want dat kan toeval zijn", () => {
    expect(waarschuwingTekst({ lead: lead({ id: "a", companyName: "Jansen" }), soort: "naam" })).toContain("kan toeval zijn");
  });
  it("blokkeert nooit: het is alleen een melding", () => {
    const t = waarschuwingTekst({ lead: lead({ id: "a", companyName: "Jansen" }), soort: "domein" });
    expect(t.startsWith("Let op:")).toBe(true);
  });
});
