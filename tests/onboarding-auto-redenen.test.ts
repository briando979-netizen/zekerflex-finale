import { describe, expect, it } from "vitest";
import { gezichtBeslist, idHardeAfwijzing, redenenNietAutomatisch, type AutoFeiten } from "@/lib/onboarding/auto-redenen";

// Mag de eigen ID-controle zelf goedkeuren, en zo niet: waarom (12 nov 2026, eigenaar: "niet meer handmatig
// beoordelen tenzij het echt niet anders is")? Leeg = zelf goedkeuren.

const ALLES_GOED: AutoFeiten = {
  kvkOk: true,
  naamOk: true,
  nummerFormaatOk: true,
  geldigOk: true,
  rijbewijs: false,
  mrzGeldig: true,
  mrzNummerOk: true,
  mrzNaamOk: true,
  chipFotoVerschil: false,
  werkrecht: "vrij",
  leeftijd: "volwassen",
  viaTweedeToestel: false,
  telefoonGeweigerd: false,
  dubbelDocument: false,
  zegelElders: false,
  gezichtAutomatischAan: true,
  gezichtOordeel: "zelfde",
  gezichtScore: 0.48,
  bewegingOordeel: "ok",
  beeldmodelOk: false,
  aiVerdict: "needs_review",
  aiZeker: false,
  liveBeelden: 14,
};
const met = (over: Partial<AutoFeiten>) => redenenNietAutomatisch({ ...ALLES_GOED, ...over });

describe("redenenNietAutomatisch", () => {
  it("paspoort of ID-kaart met kloppende code, gezicht zeker en een echte hoofddraai: zelf goedkeuren, ook als de tekst-AI twijfelt of niet bereikbaar is", () => {
    expect(met({})).toEqual([]);
    expect(gezichtBeslist(ALLES_GOED)).toBe(true);
    expect(met({ aiVerdict: "approved", aiZeker: true })).toEqual([]);
  });

  it("alleen een uitdrukkelijke afkeuring van de tekst-AI houdt het dan tegen", () => {
    expect(met({ aiVerdict: "rejected" })).toEqual(["de automatische beoordeling zag een tegenstrijdigheid in de gegevens"]);
  });

  it("het gezicht en de hoofddraai: met het percentage en de drempel, en de vlag", () => {
    expect(met({ gezichtOordeel: "twijfel", gezichtScore: 0.41 })).toEqual(["het gezicht lijkt 41% op de pasfoto (zeker vanaf 42%)"]);
    expect(met({ gezichtOordeel: "onbruikbaar", gezichtScore: null })).toEqual(["het gezicht was niet te vergelijken met de pasfoto"]);
    expect(met({ bewegingOordeel: "niet-aangeleverd" })).toEqual(["hoofd draaien: er is geen tweede selfie met een gedraaid hoofd"]);
    expect(met({ bewegingOordeel: "onnatuurlijk" })[0]).toMatch(/platgedrukt/);
    expect(met({ gezichtAutomatischAan: false })).toEqual(["automatisch goedkeuren op het gezicht staat uit (Admin → Vlaggen, id-gezicht-automatisch)"]);
  });

  it("het oude beeldmodel kan het gezichtspad vervangen, maar dan moet de tekst-AI zeker goedkeuren", () => {
    expect(met({ gezichtOordeel: "twijfel", beeldmodelOk: true, aiVerdict: "approved", aiZeker: true })).toEqual([]);
    expect(met({ gezichtOordeel: "twijfel", beeldmodelOk: true })).toEqual(["de automatische beoordeling keurde niet zeker goed"]);
  });

  it("zonder live camerabeelden (zelf gekozen foto's) kijkt altijd een mens, ook als al het andere klopt (review 73)", () => {
    expect(met({ liveBeelden: 0 })).toEqual(["geen live camerabeelden (foto's zelf gekozen, of de live camera viel weg): dan kijkt een medewerker mee"]);
    expect(met({ liveBeelden: 4 })).toHaveLength(1);
    expect(met({ liveBeelden: 5 })).toEqual([]);
  });

  it("wat altijd een mens blijft, elk met een eigen reden", () => {
    expect(met({ mrzGeldig: false, werkrecht: null, leeftijd: null })).toEqual(["de code onderop het document (MRZ) is niet zeker gelezen"]);
    expect(met({ rijbewijs: true, werkrecht: null, leeftijd: null })).toEqual(["een rijbewijs heeft geen code (MRZ) en telt niet als ID voor betaald werk"]);
    expect(met({ werkrecht: "controle" })[0]).toMatch(/geen EU\/EER\/CH-nationaliteit/);
    expect(met({ leeftijd: "minderjarig" })).toEqual(["de werker is jonger dan 18"]);
    expect(met({ viaTweedeToestel: true })[0]).toMatch(/verder op je telefoon/);
    expect(met({ dubbelDocument: true })).toEqual(["dit document is al bij een ander account gebruikt"]);
    expect(met({ zegelElders: true })).toEqual(["deze chip is al bij een ander account gebruikt"]);
    expect(met({ telefoonGeweigerd: true })[0]).toMatch(/niet mijn account/);
    expect(met({ chipFotoVerschil: true })).toEqual(["de chip hoort bij een ander document dan de foto's"]);
    expect(met({ mrzNummerOk: false })[0]).toMatch(/documentnummer wijkt af/);
    expect(met({ mrzNaamOk: false })[0]).toMatch(/naam op het document wijkt af/);
    expect(met({ naamOk: false })[0]).toMatch(/getypte naam/);
    expect(met({ nummerFormaatOk: false })[0]).toMatch(/formaat/);
    expect(met({ geldigOk: false })[0]).toMatch(/verlopen/);
  });

  it("zonder kloppende code geeft het gezicht geen dubbele reden, en meerdere problemen staan er allemaal", () => {
    // gezichtBeslist is dan onwaar, maar de reden is de code, niet het gezicht
    expect(gezichtBeslist({ ...ALLES_GOED, mrzGeldig: false })).toBe(false);
    expect(met({ mrzGeldig: false, werkrecht: null, leeftijd: null })).toHaveLength(1);
    expect(met({ viaTweedeToestel: true, bewegingOordeel: "niet-aangeleverd", gezichtOordeel: "twijfel", gezichtScore: 0.3 })).toHaveLength(3);
  });

  it("elke reden is gewoon Nederlands, zonder Engelse codes", () => {
    const alle = [
      ...met({ mrzGeldig: false, werkrecht: null, leeftijd: null, kvkOk: false, viaTweedeToestel: true }),
      ...met({ gezichtOordeel: "twijfel", gezichtScore: 0.3, bewegingOordeel: "te-onzeker", gezichtAutomatischAan: false }),
    ];
    for (const r of alle) expect(r).not.toMatch(/needs_review|rejected|approved|undefined|null/);
  });
});

describe("de KVK hoort niet bij de ID-controle (13 nov 2026, 86)", () => {
  it("zzp'er, KVK niet te controleren (tegoed op), verder alles goed: automatisch goedgekeurd", () => {
    expect(redenenNietAutomatisch({ ...ALLES_GOED, kvkOk: false })).toEqual([]);
  });

  it("een opgeheven bedrijf (DISSOLVED) blijft een harde afwijzing; de rest van de harde afwijzingen ook", () => {
    const goed = { geldigOk: true, chipVals: false, bedrijfStatus: "ACTIVE", gezichtZekerAnders: false };
    expect(idHardeAfwijzing(goed)).toBe(false);
    expect(idHardeAfwijzing({ ...goed, bedrijfStatus: "ONBEKEND" })).toBe(false);
    expect(idHardeAfwijzing({ ...goed, bedrijfStatus: "DISSOLVED" })).toBe(true);
    expect(idHardeAfwijzing({ ...goed, geldigOk: false })).toBe(true);
    expect(idHardeAfwijzing({ ...goed, chipVals: true })).toBe(true);
    expect(idHardeAfwijzing({ ...goed, gezichtZekerAnders: true })).toBe(true);
  });
});
