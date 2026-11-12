import { describe, expect, it } from "vitest";
import { banknummerVoor, bouwBankBoeking, controleerBedragVoorDoel } from "@/lib/boekhouding/bank/boeking-kern";
import { beslis, datumPast, naamOvereenkomst, nummerInTekst, type MatchContext, type TransactieKern } from "@/lib/boekhouding/bank/matching-kern";
import { leesVoorstel, voorstelUitBeslissing } from "@/lib/boekhouding/bank/voorstel";
import { valideerBoeking } from "@/lib/boekhouding/sluiting";

const leeg: MatchContext = { facturen: [], bonnen: [], betaaldeBonnen: [] };
const t = (o: Partial<TransactieKern> = {}): TransactieKern => ({
  bedragCents: 12100,
  boekdag: "2026-11-02",
  tegenIban: "NL02ABNA0123456789",
  tegenNaam: "Klant BV",
  omschrijving: "Betaling factuur ZF-2026-000123",
  ...o,
});
const factuur = (o: Partial<MatchContext["facturen"][number]> = {}) => ({ invoiceId: "inv1", nummer: "ZF-2026-000123", openCents: 12100, bekendeIbans: [] as string[], ...o });
const bon = (o: Partial<MatchContext["bonnen"][number]> = {}) => ({ bonId: "bon1", openCents: 1210, leverancier: "Hetzner Online GmbH", leverancierNummer: "R2026-5521", bonDatum: "2026-10-20", ...o });

describe("nummer in tekst", () => {
  it("vindt het nummer ook met andere spaties of streepjes, maar alleen uit hele woorden", () => {
    expect(nummerInTekst("Betaling factuur ZF-2026-000123", "ZF-2026-000123")).toBe(true);
    expect(nummerInTekst("zf 2026 000123 bedankt", "ZF-2026-000123")).toBe(true);
    expect(nummerInTekst("ZF2026000123", "ZF-2026-000123")).toBe(true);
    expect(nummerInTekst("ZF-2026-0001234", "ZF-2026-000123")).toBe(false);
    expect(nummerInTekst("ZF-2026-00012", "ZF-2026-000123")).toBe(false);
    expect(nummerInTekst("niets", "ZF-2026-000123")).toBe(false);
    expect(nummerInTekst(null, "ZF-2026-000123")).toBe(false);
  });

  it("een te kort nummer telt niet", () => {
    expect(nummerInTekst("factuur 1234 betaald", "1234")).toBe(false);
  });
});

describe("naam en datum", () => {
  it("een naam komt overeen op een betekenisvol woord, niet op bv of inc", () => {
    expect(naamOvereenkomst("HETZNER ONLINE GMBH", "Hetzner Online GmbH")).toBe(true);
    expect(naamOvereenkomst("Hetzner", "Hetzner Online GmbH")).toBe(true);
    expect(naamOvereenkomst("Jansen BV", "Pietersen BV")).toBe(false);
    expect(naamOvereenkomst(null, "Hetzner")).toBe(false);
  });

  it("de datum past tot 3 dagen voor en 120 dagen na de bon", () => {
    expect(datumPast("2026-10-20", "2026-10-20")).toBe(true);
    expect(datumPast("2026-10-20", "2026-10-17")).toBe(true);
    expect(datumPast("2026-10-20", "2026-10-16")).toBe(false);
    expect(datumPast("2026-10-20", "2027-02-17")).toBe(true);
    expect(datumPast("2026-10-20", "2027-02-18")).toBe(false);
    expect(datumPast(null, "2026-10-20")).toBe(false);
  });
});

describe("ontvangen bedrag: facturen", () => {
  it("boekt vanzelf bij exact factuurnummer, exact bedrag en één kandidaat", () => {
    const b = beslis(t(), { ...leeg, facturen: [factuur(), factuur({ invoiceId: "inv2", nummer: "ZF-2026-000999", openCents: 5000 })] });
    expect(b.actie).toBe("boek");
    expect(b.gekozen?.zekerheid).toBe(1000);
    expect(b.gekozen?.voorstel).toMatchObject({ soort: "factuur", invoiceId: "inv1" });
  });

  it("boekt NIET als het bedrag afwijkt: even kijken met voorstel (deelbetaling)", () => {
    const b = beslis(t({ bedragCents: 6000 }), { ...leeg, facturen: [factuur()] });
    expect(b.actie).toBe("even-kijken");
    expect(b.gekozen?.zekerheid).toBe(700);
    expect(b.reden).toMatch(/deelbetaling/);
  });

  it("boekt NIET als het factuurnummer ontbreekt, ook niet bij een exact bedrag", () => {
    const b = beslis(t({ omschrijving: "Bedankt" }), { ...leeg, facturen: [factuur()] });
    expect(b.actie).toBe("even-kijken");
    expect(b.gekozen?.zekerheid).toBe(400);
  });

  it("een bekende tegenrekening van dezelfde klant maakt een bedragsmatch zekerder, maar boekt nog niet", () => {
    const b = beslis(t({ omschrijving: "Bedankt" }), { ...leeg, facturen: [factuur({ bekendeIbans: ["NL02ABNA0123456789"] })] });
    expect(b.actie).toBe("even-kijken");
    expect(b.gekozen?.zekerheid).toBe(750);
  });

  it("twee facturen in de omschrijving: even kijken (dubbele kandidaat)", () => {
    const b = beslis(t({ omschrijving: "ZF-2026-000123 en ZF-2026-000124" }), {
      ...leeg,
      facturen: [factuur(), factuur({ invoiceId: "inv2", nummer: "ZF-2026-000124" })],
    });
    expect(b.actie).toBe("even-kijken");
    expect(b.kandidaten).toHaveLength(2);
    expect(b.reden).toMatch(/meerdere/);
  });

  it("twee openstaande facturen met hetzelfde bedrag zonder nummer: even kijken", () => {
    const b = beslis(t({ omschrijving: "Bedankt" }), { ...leeg, facturen: [factuur(), factuur({ invoiceId: "inv2", nummer: "ZF-2026-000124" })] });
    expect(b.actie).toBe("even-kijken");
    expect(b.kandidaten).toHaveLength(2);
  });

  it("zonder kandidaat blijft het even kijken met een uitleg", () => {
    const b = beslis(t(), leeg);
    expect(b).toMatchObject({ actie: "even-kijken", gekozen: null, kandidaten: [] });
    expect(b.reden).toMatch(/Geen openstaande factuur/);
  });

  it("een nul-bedrag wordt nooit geboekt", () => {
    expect(beslis(t({ bedragCents: 0 }), { ...leeg, facturen: [factuur()] }).actie).toBe("even-kijken");
  });
});

describe("betaald bedrag: bonnen", () => {
  const uit = (o: Partial<TransactieKern> = {}) => t({ bedragCents: -1210, tegenNaam: "HETZNER ONLINE GMBH", omschrijving: "Rechnung R2026-5521", boekdag: "2026-10-25", ...o });

  it("boekt vanzelf bij het factuurnummer van de bon, exact bedrag en één kandidaat", () => {
    const b = beslis(uit(), { ...leeg, bonnen: [bon()] });
    expect(b.actie).toBe("boek");
    expect(b.gekozen?.voorstel).toMatchObject({ soort: "bon", bonId: "bon1" });
  });

  it("een bon die al met de bank betaald is geboekt wordt alleen gekoppeld, niet nog eens geboekt", () => {
    const b = beslis(uit(), { ...leeg, betaaldeBonnen: [{ bonId: "bon9", boekingId: "bk9", totaalCents: 1210, leverancier: "Hetzner", leverancierNummer: "R2026-5521", bonDatum: "2026-10-20" }] });
    expect(b.actie).toBe("koppel");
    expect(b.gekozen?.voorstel).toMatchObject({ soort: "bon-betaald", boekingId: "bk9" });
  });

  it("zonder factuurnummer: naam + bedrag + datum is zeker (900) maar boekt niet vanzelf", () => {
    const b = beslis(uit({ omschrijving: "Hosting oktober" }), { ...leeg, bonnen: [bon()] });
    expect(b.actie).toBe("even-kijken");
    expect(b.gekozen?.zekerheid).toBe(900);
  });

  it("de rangorde: naam+bedrag 800, bedrag+datum 600, alleen bedrag 300", () => {
    const o = uit({ omschrijving: "x" });
    expect(beslis({ ...o, boekdag: "2028-01-01" }, { ...leeg, bonnen: [bon()] }).gekozen?.zekerheid).toBe(800);
    expect(beslis({ ...o, tegenNaam: "Onbekend" }, { ...leeg, bonnen: [bon()] }).gekozen?.zekerheid).toBe(600);
    expect(beslis({ ...o, tegenNaam: "Onbekend", boekdag: "2028-01-01" }, { ...leeg, bonnen: [bon()] }).gekozen?.zekerheid).toBe(300);
  });

  it("twee bonnen met hetzelfde bedrag: even kijken, ook bij een naamovereenkomst", () => {
    const b = beslis(uit({ omschrijving: "Hosting" }), { ...leeg, bonnen: [bon(), bon({ bonId: "bon2", leverancierNummer: "R2026-5522" })] });
    expect(b.actie).toBe("even-kijken");
    expect(b.kandidaten).toHaveLength(2);
  });

  it("een bonnummer in de omschrijving met twee bonnen die allebei passen: geen vanzelf boeken", () => {
    const b = beslis(uit(), { ...leeg, bonnen: [bon(), bon({ bonId: "bon2", leverancierNummer: "R2026-5521" })] });
    expect(b.actie).toBe("even-kijken");
  });

  it("een Stripe-uitbetaling wordt alleen gemarkeerd, nooit geboekt", () => {
    const b = beslis(t({ bedragCents: 50000, tegenNaam: "Stripe Payments Europe", omschrijving: "STRIPE PAYOUT ZF-2026-000123" }), { ...leeg, facturen: [factuur({ openCents: 50000 })] });
    expect(b.actie).toBe("even-kijken");
    expect(b.gekozen?.voorstel.soort).toBe("stripe");
    expect(b.reden).toMatch(/Stripe is nog niet aangesloten/);
  });
});

describe("opgeslagen voorstel", () => {
  it("bewaart alleen id's, nummers en redenen en leest rommel veilig terug", () => {
    const b = beslis(t(), { ...leeg, facturen: [factuur()] });
    const json = JSON.parse(JSON.stringify(voorstelUitBeslissing(b)));
    expect(JSON.stringify(json)).not.toMatch(/Klant|NL02ABNA/);
    expect(leesVoorstel(json).kandidaten).toHaveLength(1);
    expect(leesVoorstel(null)).toMatchObject({ kandidaten: [], gekozen: null });
    expect(leesVoorstel({ kandidaten: [{ voorstel: { soort: "onzin" }, zekerheid: 1, reden: "x" }, 5] }).kandidaten).toEqual([]);
    expect(leesVoorstel({ gekoppeldAan: { soort: "factuur", invoiceId: "inv1", nummer: "F1", openCents: 5 } }).gekoppeldAan).toMatchObject({ invoiceId: "inv1" });
    expect(leesVoorstel({ gekoppeldAan: { soort: "factuur" } }).gekoppeldAan).toBeUndefined();
  });
});

describe("boeking van een banktransactie", () => {
  const basis = { administratieId: "adm1", valuta: "EUR", transactieId: "cm0abcdefghij12345678", boekdag: "2026-11-02", bankRekeningId: "r1100", tegenRekeningId: "r1200", aangemaaktDoor: "admin-1" };

  it("ontvangen: bank debet, debiteuren credit met de postSleutel van de factuur; bron BANK en bronId = transactie", () => {
    const b = bouwBankBoeking({ ...basis, bedragCents: 12100, doel: { soort: "factuur", invoiceId: "inv1" } });
    expect(b).toMatchObject({ dagboek: "BANK", bron: "BANK", bronId: basis.transactieId, datum: "2026-11-02" });
    expect(b.regels).toEqual([
      { rekeningId: "r1100", debetCents: 12100 },
      { rekeningId: "r1200", creditCents: 12100, postSleutel: "factuur:inv1" },
    ]);
    expect(b.omschrijving).toBe(`Banktransactie ${banknummerVoor(basis.transactieId)}`);
    expect(() => valideerBoeking(b, "EUR")).not.toThrow();
  });

  it("betaald op een bon: crediteuren debet met de postSleutel van de bon, bank credit", () => {
    const b = bouwBankBoeking({ ...basis, tegenRekeningId: "r2200", bedragCents: -1210, doel: { soort: "bon", bonId: "bon1" } });
    expect(b.regels).toEqual([
      { rekeningId: "r2200", debetCents: 1210, postSleutel: "bon:bon1" },
      { rekeningId: "r1100", creditCents: 1210 },
    ]);
    expect(() => valideerBoeking(b, "EUR")).not.toThrow();
  });

  it("als kosten: kostenrekening debet zonder postSleutel, en nooit een naam of IBAN in de omschrijving", () => {
    const b = bouwBankBoeking({ ...basis, tegenRekeningId: "r4800", bedragCents: -250, doel: { soort: "kosten", rekeningId: "r4800" } });
    expect(b.regels[0]).toEqual({ rekeningId: "r4800", debetCents: 250 });
    expect(JSON.stringify(b)).not.toMatch(/NL\d\d[A-Z]{4}\d/);
  });

  it("weigert het verkeerde teken en een bedrag boven wat openstaat", () => {
    expect(() => bouwBankBoeking({ ...basis, bedragCents: -100, doel: { soort: "factuur", invoiceId: "i" } })).toThrow(/bijschrijving/);
    expect(() => bouwBankBoeking({ ...basis, bedragCents: 100, doel: { soort: "kosten", rekeningId: "r" } })).toThrow(/afschrijving/);
    expect(() => bouwBankBoeking({ ...basis, bedragCents: 0, doel: { soort: "kosten", rekeningId: "r" } })).toThrow(/niet te boeken/);
    expect(() => controleerBedragVoorDoel(20000, { soort: "factuur", invoiceId: "i" }, 12100, "EUR")).toThrow(/meer dan er op deze factuur openstaat/);
    expect(() => controleerBedragVoorDoel(-5000, { soort: "bon", bonId: "b" }, 1210, "EUR")).toThrow(/meer dan er op deze bon openstaat/);
    expect(() => controleerBedragVoorDoel(6000, { soort: "factuur", invoiceId: "i" }, 12100, "EUR")).not.toThrow();
  });
});
