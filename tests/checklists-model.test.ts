import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DAGEN,
  MAX_TAKEN,
  berekenOverzicht,
  controleerSjabloon,
  controleerUitvoering,
  herhalingTekst,
  plusDagen,
  schoneKlok,
  venster,
  verlopenUitvoeringen,
  verwachtOp,
  zelfdeNaam,
  type Herhaling,
  type Sjabloon,
  type Uitvoering,
} from "@/lib/checklists/model";

// 2026-11-12 is een donderdag; 14 nov zaterdag, 15 nov zondag, 16 nov maandag.
// Zomertijd 2026: vooruit op zondag 29 maart (23 uur), terug op zondag 25 oktober (25 uur).

let teller = 0;
const nieuwId = () => `id${String(++teller).padStart(6, "0")}`;

const herh = (over: Partial<Herhaling> = {}): Herhaling => ({ soort: "dagelijks", dagen: [], uiterlijk: null, volgendeDag: false, ...over });
const sjabloon = (over: Partial<Sjabloon> = {}): Sjabloon => ({
  id: "abc123",
  naam: "Sluitronde",
  locatie: "Keuken",
  taken: [
    { id: "t1", tekst: "Vloer dweilen", opmerkingVerplicht: false },
    { id: "t2", tekst: "Afval buiten zetten", opmerkingVerplicht: true },
  ],
  herhaling: herh(),
  actief: true,
  gemaaktOp: "2026-01-01T00:00:00Z",
  gearchiveerdOp: null,
  linkHash: null,
  ...over,
});
let volgnr = 0;
const uitvoering = (tijdstip: string, over: Partial<Uitvoering> = {}): Uitvoering => ({
  id: `${tijdstip.slice(0, 10)}~u${String(++volgnr).padStart(6, "0")}`,
  sjabloonId: "abc123",
  sjabloonNaam: "Sluitronde",
  locatie: "Keuken",
  uitvoerder: "Piet",
  tijdstip,
  taken: [],
  notitie: "",
  compleet: true,
  correctieVan: null,
  bron: "link",
  ...over,
});
const rij = (s: Sjabloon[], u: Uitvoering[], van: string, tot: string, nu: string) => berekenOverzicht(s, u, van, tot, new Date(nu));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("herhaling: wanneer wordt een checklist verwacht", () => {
  it("dagelijks elke dag, geen vast moment nooit", () => {
    expect(verwachtOp(herh(), "2026-11-15")).toBe(true);
    expect(verwachtOp(herh({ soort: "geen" }), "2026-11-12")).toBe(false);
  });
  it("werkdagen: maandag t/m vrijdag", () => {
    const h = herh({ soort: "werkdagen" });
    expect(["2026-11-12", "2026-11-13", "2026-11-16"].map((d) => verwachtOp(h, d))).toEqual([true, true, true]);
    expect(["2026-11-14", "2026-11-15"].map((d) => verwachtOp(h, d))).toEqual([false, false]);
  });
  it("wekelijks op gekozen dagen (0 = zondag)", () => {
    const h = herh({ soort: "weekdagen", dagen: [1, 4] });
    expect(verwachtOp(h, "2026-11-12")).toBe(true); // donderdag
    expect(verwachtOp(h, "2026-11-16")).toBe(true); // maandag
    expect(verwachtOp(h, "2026-11-13")).toBe(false);
    expect(verwachtOp(herh({ soort: "weekdagen", dagen: [0] }), "2026-11-15")).toBe(true);
  });
  it("een dag optellen is kalenderrekenen, ook over de omschakeling", () => {
    expect(plusDagen("2026-03-28", 1)).toBe("2026-03-29");
    expect(plusDagen("2026-10-31", 1)).toBe("2026-11-01");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("tekst bij de herhaling", () => {
    expect(herhalingTekst(herh({ uiterlijk: "07:00" }))).toBe("Elke dag, uiterlijk 07:00");
    expect(herhalingTekst(herh({ soort: "weekdagen", dagen: [1, 4] }))).toBe("Elke maandag, donderdag");
    expect(herhalingTekst(herh({ soort: "geen" }))).toBe("Geen vast moment");
    expect(herhalingTekst(herh({ uiterlijk: "02:00", volgendeDag: true }))).toBe("Elke dag, uiterlijk 02:00 (na middernacht)");
  });
});

describe("tijdvensters in Nederlandse tijd", () => {
  const iso = (v: { van: Date; tot: Date }) => [v.van.toISOString(), v.tot.toISOString()];
  it("zonder uiterlijk: de hele Nederlandse dag (winter, +01:00)", () => {
    expect(iso(venster(herh(), "2026-11-12"))).toEqual(["2026-11-11T23:00:00.000Z", "2026-11-12T23:00:00.000Z"]);
  });
  it("uiterlijk 07:00 loopt tot en met die minuut (winter en zomer)", () => {
    expect(iso(venster(herh({ uiterlijk: "07:00" }), "2026-11-12"))[1]).toBe("2026-11-12T06:01:00.000Z");
    expect(iso(venster(herh({ uiterlijk: "07:00" }), "2026-07-01"))[1]).toBe("2026-07-01T05:01:00.000Z");
  });
  it("de dag van de zomertijd duurt 23 uur, de dag van de wintertijd 25 uur", () => {
    expect(iso(venster(herh(), "2026-03-29"))).toEqual(["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
    expect(iso(venster(herh(), "2026-10-25"))).toEqual(["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
  });
  it("een venster na middernacht loopt door op de dag erna", () => {
    expect(iso(venster(herh({ uiterlijk: "02:00", volgendeDag: true }), "2026-11-12"))).toEqual(["2026-11-11T23:00:00.000Z", "2026-11-13T01:01:00.000Z"]);
  });
  it("een venster na middernacht over de zomertijd-omschakeling heen: 03:30 is dan 03:30 zomertijd", () => {
    expect(iso(venster(herh({ uiterlijk: "03:30", volgendeDag: true }), "2026-03-28"))[1]).toBe("2026-03-29T01:31:00.000Z");
  });
  it("klokken: alleen echte tijden", () => {
    expect(schoneKlok("7:05")).toBe("07:05");
    expect(schoneKlok("23:59")).toBe("23:59");
    expect(schoneKlok("24:00")).toBeNull();
    expect(schoneKlok("12:60")).toBeNull();
    expect(schoneKlok("nu")).toBeNull();
    expect(schoneKlok(7)).toBeNull();
  });
});

describe("overzicht: verwacht, gedaan, gemist", () => {
  it("een dag zonder uitvoering is open zolang het venster loopt, daarna gemist, en komende dagen zijn nog niet aan de beurt", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "10:00" }) });
    // 09:00 in Nederland op 12 nov
    const o = rij([s], [], "2026-11-11", "2026-11-13", "2026-11-12T08:00:00Z");
    expect(o.rijen.map((r) => [r.dag, r.status])).toEqual([
      ["2026-11-11", "gemist"],
      ["2026-11-12", "open"],
      ["2026-11-13", "nog-niet"],
    ]);
    expect(o.gemist.map((r) => r.dag)).toEqual(["2026-11-11"]);
  });
  it("precies op de minuut van uiterlijk telt nog mee, een minuut later niet", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "07:00" }) });
    expect(rij([s], [], "2026-11-12", "2026-11-12", "2026-11-12T06:00:30Z").rijen[0]?.status).toBe("open");
    expect(rij([s], [], "2026-11-12", "2026-11-12", "2026-11-12T06:01:00Z").rijen[0]?.status).toBe("gemist");
    const op07 = uitvoering("2026-11-12T06:00:30Z");
    expect(rij([s], [op07], "2026-11-12", "2026-11-12", "2026-11-12T12:00:00Z").rijen[0]?.status).toBe("compleet");
  });
  it("zonder uiterlijk is een dag pas aan het einde van de Nederlandse dag gemist", () => {
    const s = sjabloon();
    expect(rij([s], [], "2026-11-12", "2026-11-12", "2026-11-12T22:59:00Z").rijen[0]?.status).toBe("open");
    expect(rij([s], [], "2026-11-12", "2026-11-12", "2026-11-12T23:00:00Z").rijen[0]?.status).toBe("gemist");
  });
  it("een complete uitvoering in het venster telt; een gedeeltelijke is open voor het uiterlijk en gemist erna", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "10:00" }) });
    const deels = uitvoering("2026-11-12T07:00:00Z", { compleet: false });
    const voor = rij([s], [deels], "2026-11-12", "2026-11-12", "2026-11-12T08:00:00Z").rijen[0];
    expect([voor?.status, voor?.uitgevoerd]).toEqual(["open", "gedeeltelijk"]);
    const na = rij([s], [deels], "2026-11-12", "2026-11-12", "2026-11-12T12:00:00Z").rijen[0];
    expect([na?.status, na?.uitgevoerd]).toEqual(["gemist", "gedeeltelijk"]);
    const klaar = uitvoering("2026-11-12T07:30:00Z");
    const beide = rij([s], [deels, klaar], "2026-11-12", "2026-11-12", "2026-11-12T12:00:00Z").rijen[0];
    expect([beide?.status, beide?.uitvoeringId]).toEqual(["compleet", klaar.id]);
  });
  it("een uitvoering van een ander sjabloon telt niet mee", () => {
    const s = sjabloon();
    const andere = uitvoering("2026-11-12T08:00:00Z", { sjabloonId: "ander99" });
    expect(rij([s], [andere], "2026-11-12", "2026-11-12", "2026-11-13T12:00:00Z").rijen[0]?.status).toBe("gemist");
  });
  it("te laat: wel compleet, maar na het venster van die dag", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "07:00" }) });
    const laat = uitvoering("2026-11-12T08:00:00Z"); // 09:00 NL
    const r = rij([s], [laat], "2026-11-12", "2026-11-12", "2026-11-12T12:00:00Z").rijen[0];
    expect([r?.status, r?.teLaat]).toEqual(["gemist", true]);
  });
  it("een venster na middernacht: de sluitronde van vrijdag om 01:30 zaterdag telt voor vrijdag, niet voor zaterdag", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "02:00", volgendeDag: true }) });
    const naMiddernacht = uitvoering("2026-11-13T00:30:00Z"); // 01:30 NL op vrijdag 13 nov
    const o = rij([s], [naMiddernacht], "2026-11-12", "2026-11-13", "2026-11-14T12:00:00Z");
    expect(o.rijen.map((r) => [r.dag, r.status])).toEqual([
      ["2026-11-12", "compleet"],
      ["2026-11-13", "gemist"],
    ]);
  });
  it("een venster na middernacht: twee uitvoeringen (23:00 en 01:30) tellen voor twee dagen", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "02:00", volgendeDag: true }) });
    const o = rij([s], [uitvoering("2026-11-12T22:00:00Z"), uitvoering("2026-11-13T00:30:00Z")], "2026-11-12", "2026-11-13", "2026-11-14T12:00:00Z");
    expect(o.rijen.map((r) => r.status)).toEqual(["compleet", "compleet"]);
  });
  it("een uitvoering vlak na middernacht telt voor de dag ervoor, ook als de periode op de dag erna begint", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "02:00", volgendeDag: true }) });
    // de periode begint op 13 nov; de uitvoering van 01:30 die nacht hoort bij de ronde van 12 nov en laat 13 nov dus open
    const o = rij([s], [uitvoering("2026-11-13T00:30:00Z")], "2026-11-13", "2026-11-13", "2026-11-14T12:00:00Z");
    expect(o.rijen).toHaveLength(1);
    expect(o.rijen[0]?.status).toBe("gemist");
  });
  it("op de dag van de wintertijd (25 uur): 23:30 telt voor 25 oktober, 00:30 daarna voor 26 oktober", () => {
    const s = sjabloon();
    const laatsteUur = uitvoering("2026-10-25T22:30:00Z"); // 23:30 NL op 25 okt
    const eersteUur = uitvoering("2026-10-25T23:30:00Z"); // 00:30 NL op 26 okt
    const a = rij([s], [laatsteUur], "2026-10-25", "2026-10-26", "2026-10-27T12:00:00Z");
    expect(a.rijen.map((r) => [r.dag, r.status])).toEqual([["2026-10-25", "compleet"], ["2026-10-26", "gemist"]]);
    const b = rij([s], [eersteUur], "2026-10-25", "2026-10-26", "2026-10-27T12:00:00Z");
    expect(b.rijen.map((r) => [r.dag, r.status])).toEqual([["2026-10-25", "gemist"], ["2026-10-26", "compleet"]]);
  });
  it("op de dag van de zomertijd (23 uur): 22:30 UTC is al 30 maart", () => {
    const s = sjabloon();
    const o = rij([s], [uitvoering("2026-03-29T21:30:00Z")], "2026-03-29", "2026-03-30", "2026-03-31T12:00:00Z");
    expect(o.rijen.map((r) => [r.dag, r.status])).toEqual([["2026-03-29", "compleet"], ["2026-03-30", "gemist"]]);
    const p = rij([s], [uitvoering("2026-03-29T22:30:00Z")], "2026-03-29", "2026-03-30", "2026-03-31T12:00:00Z");
    expect(p.rijen.map((r) => [r.dag, r.status])).toEqual([["2026-03-29", "gemist"], ["2026-03-30", "compleet"]]);
  });
  it("uiterlijk 07:00 volgt de zomertijd: 06:30 UTC is in de zomer te laat, in de winter niet", () => {
    const s = sjabloon({ herhaling: herh({ uiterlijk: "07:00" }) });
    expect(rij([s], [uitvoering("2026-07-01T06:30:00Z")], "2026-07-01", "2026-07-01", "2026-07-02T00:00:00Z").rijen[0]?.status).toBe("gemist");
    expect(rij([s], [uitvoering("2026-11-12T05:30:00Z")], "2026-11-12", "2026-11-12", "2026-11-13T00:00:00Z").rijen[0]?.status).toBe("compleet");
  });
  it("voor de dag dat de checklist gemaakt is, of als het venster al voorbij was bij het maken, wordt niets verwacht", () => {
    const s = sjabloon({ gemaaktOp: "2026-11-12T10:00:00Z", herhaling: herh({ uiterlijk: "07:00" }) });
    const o = rij([s], [], "2026-11-10", "2026-11-14", "2026-11-15T12:00:00Z");
    expect(o.rijen.map((r) => r.dag)).toEqual(["2026-11-13", "2026-11-14"]);
  });
  it("een gearchiveerde checklist wordt vanaf het archiveren niet meer verwacht", () => {
    const s = sjabloon({ actief: false, gearchiveerdOp: "2026-11-13T10:00:00Z" });
    const o = rij([s], [], "2026-11-11", "2026-11-16", "2026-11-17T12:00:00Z");
    expect(o.rijen.map((r) => r.dag)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
  });
  it("geen vast moment geeft nooit rijen, en werkdagen slaan het weekend over", () => {
    expect(rij([sjabloon({ herhaling: herh({ soort: "geen" }) })], [], "2026-11-12", "2026-11-18", "2026-11-19T00:00:00Z").rijen).toEqual([]);
    const w = rij([sjabloon({ herhaling: herh({ soort: "werkdagen" }) })], [], "2026-11-12", "2026-11-17", "2026-11-18T00:00:00Z");
    expect(w.rijen.map((r) => r.dag)).toEqual(["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17"]);
  });
  it("de periode is hooguit 31 dagen", () => {
    const o = rij([sjabloon()], [], "2026-10-01", "2026-12-31", "2027-01-01T00:00:00Z");
    expect(o.dagen).toHaveLength(MAX_DAGEN);
    expect(o.dagen[0]).toBe("2026-10-01");
    expect(o.dagen[MAX_DAGEN - 1]).toBe("2026-10-31");
    expect(o.rijen).toHaveLength(31);
  });
  it("gemist staat nieuwste dag eerst, en meerdere checklists per dag staan op naam", () => {
    const a = sjabloon({ id: "aaa111", naam: "Receptie" });
    const b = sjabloon({ id: "bbb222", naam: "Keuken" });
    const o = rij([a, b], [], "2026-11-10", "2026-11-11", "2026-11-13T00:00:00Z");
    expect(o.gemist.map((r) => `${r.dag} ${r.sjabloonNaam}`)).toEqual(["2026-11-11 Keuken", "2026-11-11 Receptie", "2026-11-10 Keuken", "2026-11-10 Receptie"]);
  });
});

describe("controleerSjabloon", () => {
  const basis = { naam: "  Sluitronde  ", locatie: "Keuken", taken: [{ tekst: "Vloer" }, { tekst: "Afval", opmerkingVerplicht: true }], herhaling: { soort: "dagelijks", uiterlijk: "7:00" } };
  it("maakt schoon en geeft elke taak een id, in de volgorde van de lijst", () => {
    const r = controleerSjabloon(basis, nieuwId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.waarde.naam).toBe("Sluitronde");
    expect(r.waarde.taken.map((t) => t.tekst)).toEqual(["Vloer", "Afval"]);
    expect(r.waarde.taken.map((t) => t.opmerkingVerplicht)).toEqual([false, true]);
    expect(new Set(r.waarde.taken.map((t) => t.id)).size).toBe(2);
    expect(r.waarde.herhaling).toEqual({ soort: "dagelijks", dagen: [], uiterlijk: "07:00", volgendeDag: false });
    expect(r.waarde.actief).toBe(true);
  });
  it("behoudt een bestaand taak-id (zo blijft de volgorde veranderen mogelijk) maar nooit twee keer hetzelfde id", () => {
    const r = controleerSjabloon({ ...basis, taken: [{ id: "abcdef12", tekst: "A" }, { id: "abcdef12", tekst: "B" }, { id: "kapot id!", tekst: "C" }] }, nieuwId);
    expect(r.ok && r.waarde.taken[0]?.id).toBe("abcdef12");
    expect(r.ok && new Set(r.waarde.taken.map((t) => t.id)).size).toBe(3);
  });
  it("lege regels vallen weg; zonder taken, zonder naam of met meer dan 60 taken volgt een Nederlandse fout", () => {
    const leeg = controleerSjabloon({ ...basis, taken: [{ tekst: "  " }, { tekst: "Een" }] }, nieuwId);
    expect(leeg.ok && leeg.waarde.taken).toHaveLength(1);
    expect(controleerSjabloon({ ...basis, taken: [{ tekst: " " }] }, nieuwId)).toEqual({ ok: false, fout: "Zet er minstens één taak in." });
    expect(controleerSjabloon({ ...basis, naam: "x" }, nieuwId)).toMatchObject({ ok: false });
    const veel = controleerSjabloon({ ...basis, taken: Array.from({ length: MAX_TAKEN + 1 }, (_, i) => ({ tekst: `Taak ${i}` })) }, nieuwId);
    expect(veel).toMatchObject({ ok: false });
    expect(!veel.ok && veel.fout).toContain("60");
    expect(controleerSjabloon({ ...basis, taken: Array.from({ length: MAX_TAKEN }, (_, i) => ({ tekst: `Taak ${i}` })) }, nieuwId).ok).toBe(true);
  });
  it("wekelijks vraagt minstens één dag; dubbele en ongeldige dagen vallen weg, maandag staat eerst", () => {
    expect(controleerSjabloon({ ...basis, herhaling: { soort: "weekdagen", dagen: [] } }, nieuwId)).toMatchObject({ ok: false });
    const r = controleerSjabloon({ ...basis, herhaling: { soort: "weekdagen", dagen: [0, 4, 4, 9, "x", 1] } }, nieuwId);
    expect(r.ok && r.waarde.herhaling.dagen).toEqual([1, 4, 0]);
  });
  it("een kapotte tijd wordt geweigerd; bij geen vast moment of zonder tijd telt 'na middernacht' niet", () => {
    expect(controleerSjabloon({ ...basis, herhaling: { soort: "dagelijks", uiterlijk: "25:00" } }, nieuwId)).toMatchObject({ ok: false });
    const geen = controleerSjabloon({ ...basis, herhaling: { soort: "geen", uiterlijk: "07:00", volgendeDag: true } }, nieuwId);
    expect(geen.ok && geen.waarde.herhaling).toEqual({ soort: "geen", dagen: [], uiterlijk: null, volgendeDag: false });
    const zonder = controleerSjabloon({ ...basis, herhaling: { soort: "dagelijks", uiterlijk: "", volgendeDag: true } }, nieuwId);
    expect(zonder.ok && zonder.waarde.herhaling.volgendeDag).toBe(false);
    const na = controleerSjabloon({ ...basis, herhaling: { soort: "dagelijks", uiterlijk: "02:00", volgendeDag: true } }, nieuwId);
    expect(na.ok && na.waarde.herhaling.volgendeDag).toBe(true);
  });
  it("een onbekende herhaling (ook 'constructor') wordt 'geen vast moment'", () => {
    const r = controleerSjabloon({ ...basis, herhaling: { soort: "constructor" } }, nieuwId);
    expect(r.ok && r.waarde.herhaling.soort).toBe("geen");
  });
  it("actief: false archiveert", () => {
    const r = controleerSjabloon({ ...basis, actief: false }, nieuwId);
    expect(r.ok && r.waarde.actief).toBe(false);
  });
});

describe("controleerUitvoering", () => {
  const s = sjabloon();
  const goed = { uitvoerder: " Piet  Jansen ", notitie: "Alles rustig", taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: true }] };
  it("alle taken gedaan is compleet, en de tekst van de taak wordt meebewaard", () => {
    const r = controleerUitvoering(s, goed);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.waarde.uitvoerder).toBe("Piet Jansen");
    expect(r.waarde.compleet).toBe(true);
    expect(r.waarde.taken.map((t) => t.tekst)).toEqual(["Vloer dweilen", "Afval buiten zetten"]);
  });
  it("een taak niet gedaan maakt de uitvoering niet compleet; de opmerking mag bij elke taak", () => {
    const r = controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: false, opmerking: "Geen dweil" }, { id: "t2", gedaan: true }] });
    expect(r.ok && r.waarde.compleet).toBe(false);
    expect(r.ok && r.waarde.taken[0]?.opmerking).toBe("Geen dweil");
  });
  it("een naam is verplicht", () => {
    expect(controleerUitvoering(s, { ...goed, uitvoerder: " " })).toMatchObject({ ok: false });
    expect(controleerUitvoering(s, { ...goed, uitvoerder: undefined })).toMatchObject({ ok: false });
  });
  it("elke taak moet beantwoord zijn met een echte ja of nee", () => {
    expect(controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: true }] })).toMatchObject({ ok: false });
    expect(controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: "ja" }] })).toMatchObject({ ok: false });
    expect(controleerUitvoering(s, { ...goed, taken: undefined })).toMatchObject({ ok: false });
  });
  it("een taak die niet bij de checklist hoort, of dubbel is doorgegeven, wordt geweigerd (ook 'constructor')", () => {
    expect(controleerUitvoering(s, { ...goed, taken: [...goed.taken, { id: "t3", gedaan: true }] })).toMatchObject({ ok: false });
    expect(controleerUitvoering(s, { ...goed, taken: [...goed.taken, { id: "constructor", gedaan: true }] })).toMatchObject({ ok: false });
    expect(controleerUitvoering(s, { ...goed, taken: [...goed.taken, { id: "t1", gedaan: false }] })).toMatchObject({ ok: false });
  });
  it("opmerking verplicht als de taak niet gedaan is, maar alleen bij die taak", () => {
    const zonder = controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: false }] });
    expect(zonder).toMatchObject({ ok: false });
    expect(!zonder.ok && zonder.fout).toContain("Afval buiten zetten");
    expect(controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: false, opmerking: "  " }] })).toMatchObject({ ok: false });
    expect(controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: false }, { id: "t2", gedaan: true }] }).ok).toBe(true);
    expect(controleerUitvoering(s, { ...goed, taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: false, opmerking: "Container vol" }] }).ok).toBe(true);
  });
  it("stuurtekens en te lange tekst worden schoongemaakt en afgekapt", () => {
    const r = controleerUitvoering(s, { ...goed, notitie: `a\u0000b${"x".repeat(900)}`, uitvoerder: "P".repeat(200) });
    expect(r.ok && r.waarde.notitie.length).toBe(500);
    expect(r.ok && r.waarde.notitie.includes("\u0000")).toBe(false);
    expect(r.ok && r.waarde.uitvoerder.length).toBe(60);
  });
});

describe("persoonsgegevens", () => {
  it("de bewaartermijn: uitvoeringen ouder dan 2 jaar", () => {
    const nu = new Date("2026-11-12T10:00:00Z");
    const oud = uitvoering("2024-11-12T09:59:00Z");
    const grens = uitvoering("2024-11-12T10:00:00Z");
    const recent = uitvoering("2026-11-01T10:00:00Z");
    expect(verlopenUitvoeringen([oud, grens, recent], nu)).toEqual([oud]);
    expect(verlopenUitvoeringen([oud, recent], nu, 1).map((u) => u.id)).toEqual([oud.id]);
    expect(verlopenUitvoeringen([], nu)).toEqual([]);
  });
  it("een schrikkeldag blijft een geldige grens", () => {
    const nu = new Date("2028-02-29T12:00:00Z");
    expect(verlopenUitvoeringen([uitvoering("2026-02-28T12:00:00Z"), uitvoering("2026-03-02T12:00:00Z")], nu)).toHaveLength(1);
  });
  it("namen vergelijken zonder op hoofdletters of spaties te letten, een lege naam is nooit gelijk", () => {
    expect(zelfdeNaam("Piet  Jansen", " piet jansen ")).toBe(true);
    expect(zelfdeNaam("Piet", "Pieter")).toBe(false);
    expect(zelfdeNaam("", "")).toBe(false);
  });
});
