import { describe, expect, it } from "vitest";
import { codeTelling, isMeetcode, isQaPad, stilBij, werkerTrechter, type WerkerFeiten } from "@/lib/admin/werker-trechter-kern";
import type { WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// Admin → Werkerstrechter: hoe ver komen nieuwe echte werkers, en wat doen ze op de schermen van de ID-check. Alleen de telling.

const nu = new Date("2026-11-13T12:00:00+01:00");
const dagenTerug = (d: number) => new Date(nu.getTime() - d * 86_400_000);
const af: WerkerPoortFeiten = { soortGekozen: true, branchesGekozen: true, gegevensIngevuld: true, identiteitIngestuurd: true, werkrechtIngevuld: true, tweestapAan: false, fotoGezet: true };
const w = (dagen: number, poort: Partial<WerkerPoortFeiten> | null, zagVerificatie = false): WerkerFeiten => ({
  aangemeld: dagenTerug(dagen),
  poort: poort === null ? null : { ...af, ...poort },
  zagVerificatie,
});

const werkers: WerkerFeiten[] = [
  w(1, {}, true), // klaar
  w(2, { fotoGezet: false }, true), // stil bij de foto
  w(3, { gegevensIngevuld: false, fotoGezet: false }, true), // ID wel, gegevens niet (zoals 15 van de 20 op 13 nov)
  w(10, { branchesGekozen: false, gegevensIngevuld: false, identiteitIngestuurd: false, fotoGezet: false }),
  w(20, { soortGekozen: false, branchesGekozen: false, gegevensIngevuld: false, identiteitIngestuurd: false, fotoGezet: false }),
  w(25, null), // poort niet op te halen
  w(40, {}), // buiten 30 dagen
];

describe("werkerTrechter", () => {
  it("telt per venster het cohort en per stap wie hem haalde, los van de volgorde", () => {
    const t7 = werkerTrechter(werkers, nu, 7);
    expect(t7.nieuw).toBe(3);
    expect(t7.perStap.map((s) => s.aantal)).toEqual([3, 3, 2, 3, 1]);
    expect(t7.klaar).toBe(1);
    expect(t7.zagVerificatie).toBe(3);
    const t30 = werkerTrechter(werkers, nu, 30);
    expect(t30.nieuw).toBe(6);
    expect(t30.onbekend).toBe(1);
    expect(t30.perStap.find((s) => s.sleutel === "kind")?.aantal).toBe(4);
    expect(t30.perStap.find((s) => s.sleutel === "identiteit")?.aantal).toBe(3);
  });

  it("de stappen dragen een nummer en een naam", () => {
    expect(werkerTrechter([], nu, 7).perStap.map((s) => s.naam)).toEqual([
      "1. Richting gekozen",
      "2. Branches gekozen",
      "3. Gegevens ingevuld",
      "4. ID ingestuurd",
      "5. Profielfoto",
    ]);
  });
});

describe("stilBij", () => {
  it("per werker de eerste open stap, of klaar; zonder poortfeiten telt hij niet", () => {
    const s = Object.fromEntries(stilBij(werkers, nu, 30).map((x) => [x.sleutel, x.aantal]));
    expect(s).toEqual({ kind: 1, branches: 1, gegevens: 1, identiteit: 0, foto: 1, klaar: 1 });
  });
});

describe("meetcodes", () => {
  it("alleen de codes van de ID-check en de gegevens, geen knopteksten", () => {
    expect(isMeetcode("id-controle-indienen")).toBe(true);
    expect(isMeetcode("id-klaar-naar-gegevens")).toBe(true);
    expect(isMeetcode("bsn-voorstel-ja")).toBe(true);
    expect(isMeetcode("gegevens-btw-opslaan")).toBe(true);
    expect(isMeetcode("gegevens-kor")).toBe(true);
    expect(isMeetcode("Indienen")).toBe(false);
    expect(isMeetcode("klus-plaatsknop")).toBe(false);
    expect(isMeetcode(null)).toBe(false);
  });

  it("telt keer en unieke sessies binnen het venster", () => {
    const rij = (label: string, sessionId: string, dagen: number) => ({ label, sessionId, at: dagenTerug(dagen) });
    const rijen = [rij("id-controle-indienen", "a", 1), rij("id-controle-indienen", "a", 1), rij("id-controle-indienen", "b", 2), rij("bsn-voorstel-ja", "c", 10), rij("Indienen", "d", 1)];
    expect(codeTelling(rijen, nu, 7)).toEqual([{ code: "id-controle-indienen", keer: 3, sessies: 2 }]);
    expect(codeTelling(rijen, nu, 30)).toEqual([
      { code: "bsn-voorstel-ja", keer: 1, sessies: 1 },
      { code: "id-controle-indienen", keer: 3, sessies: 2 },
    ]);
  });

  it("een sessie op beheer, studio of de toegankelijkheidscontrole is QA", () => {
    expect(isQaPad("/admin/werker-trechter")).toBe(true);
    expect(isQaPad("/studio")).toBe(true);
    expect(isQaPad("/toegankelijkheid?x=1")).toBe(true);
    expect(isQaPad("/administratie")).toBe(false);
    expect(isQaPad("/dashboard/verificatie")).toBe(false);
  });
});
