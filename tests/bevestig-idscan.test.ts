import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bevestigOverzicht, type OverzichtInvoer } from "@/lib/werker/bevestig-overzicht";

// Ook aan het eind van de ID-scan (de camera, waar de meeste werkers langs gaan) vraagt het scherm "Weet je zeker dat je alles
// hebt ingevuld?" vóór het insturen: soort, naam zoals getypt, geldigheid en de foto's als kleine voorbeelden. Het documentnummer
// en alles uit de MRZ blijven buiten beeld. Dat geldt ook voor de gewone stroom: bij een goed gelezen MRZ slaat de scan de
// gegevensstap over en rondde hij na de selfie meteen af.

const LABELS: OverzichtInvoer["labels"] = { naam: "Naam op document", soort: "Soort", nummer: "Nummer", geldigTot: "Geldig tot", kvk: "", btw: "", postcode: "", fotos: "Foto's", methode: "Manier" };
const veld = (w: Record<string, string>) => (n: string) => w[n] ?? "";

const invoer = (over: Partial<OverzichtInvoer> = {}): OverzichtInvoer => ({
  methode: "upload",
  nummerTonen: false,
  veld: veld({ nameOnDocument: " Jan de Vries ", documentExpiry: "2030-05-01", documentNumber: "NX1234567" }),
  labels: LABELS,
  soortNaam: "Paspoort",
  bedrijf: null,
  fotoNamen: [],
  viaStripe: "",
  ...over,
});

describe("overzicht aan het eind van de ID-scan", () => {
  it("alleen de naam zoals getypt, de soort en de geldigheid: het documentnummer staat er niet, ook niet als het in het formulier zit", () => {
    const rijen = bevestigOverzicht(invoer());
    expect(rijen).toEqual([
      ["Naam op document", "Jan de Vries"],
      ["Soort", "Paspoort"],
      ["Geldig tot", "2030-05-01"],
    ]);
    expect(JSON.stringify(rijen)).not.toContain("NX1234567");
    expect(rijen.some(([l]) => l === "Nummer")).toBe(false);
  });

  it("een leeg veld staat als streepje, zodat de werker het ziet", () => {
    const rijen = bevestigOverzicht(invoer({ veld: veld({}) }));
    expect(rijen).toEqual([
      ["Naam op document", "—"],
      ["Soort", "Paspoort"],
      ["Geldig tot", "—"],
    ]);
  });

  it("het formulier van de verificatiepagina laat het nummer wel zien (standaardgedrag blijft)", () => {
    const rijen = bevestigOverzicht(invoer({ nummerTonen: undefined }));
    expect(rijen).toContainEqual(["Nummer", "NX1234567"]);
  });
});

describe("de vraag in IdScan.tsx", () => {
  const ROOT = process.cwd();
  // op Windows kan het bestand regeleinden \r\n hebben: gelijktrekken, de controles hieronder lopen over meerdere regels
  const src = readFileSync(path.join(ROOT, "components/app/IdScan.tsx"), "utf8").split("\r\n").join("\n");

  // 13 nov 2026, eigenaar: "je ziet geen knop afronding of indienen of alle gegevens nog een keer zien". Een paneel dat je
  // per ongeluk sloot, liet je bij de camera achter zonder knop; nu is de controle een eigen stap met "Indienen".
  it("een eigen controlestap (geen paneel dat je per ongeluk sluit), geen window.confirm", () => {
    expect(src).not.toMatch(/window\.confirm\(|[^\w.]confirm\(/);
    expect(src).not.toContain("<OnderSheet");
    expect(src).toContain('{stap === "controle" && bevestigFotos && (');
    expect(src).toContain('id="idscan-bevestig-titel"');
    expect(src).toContain("{s.indienen}");
    // terug brengt je naar de laatste foto (met het voorbeeld), of naar de gegevens
    expect(src).toContain('if (st === "controle") return handmatig ? "gegevens" : metBeweging ? "beweging" : "selfie";');
  });

  it("de controle toont alles: de werker, het bedrijf en de thuisbasis (uit het formulier) en het document", () => {
    expect(src).toContain("...overzicht,");
    const form = readFileSync(path.join(ROOT, "components/app/OnboardingForm.tsx"), "utf8").split("\r\n").join("\n");
    expect(form).toContain("overzicht={overzicht}");
    for (const veld of ["w.persoon.voornaam", "w.persoon.achternaam", "w.persoon.geboortedatum", "w.persoon.telefoon", "ft.bevestig.postcode"]) expect(form).toContain(veld);
  });

  it("de controlestap staat los van de gegevensstap: hij komt ook na de selfie, als de scan de gegevensstap overslaat", () => {
    const controle = src.indexOf('{stap === "controle" && bevestigFotos && (');
    const gegevensStap = src.indexOf('{stap === "gegevens" && (');
    const bezigStap = src.indexOf('{stap === "bezig" && (');
    expect(controle).toBeGreaterThan(gegevensStap);
    expect(controle).toBeLessThan(bezigStap);
    expect(src.slice(gegevensStap, controle)).toContain("</>\n            )}");
  });

  it("insturen alleen na 'Ja': op de laptop vraagt zowel de knop als de automatische afronding eerst, op de telefoon (QR) gaat het meteen naar de laptop", () => {
    // drie aanroepen van afronden: de telefoon-tak in verder(), de telefoon-tak van de knop, en 'Ja' in de sheet
    expect(src.match(/void afronden\(/g)?.length).toBe(3);
    expect(src).toContain('else if (modus === "telefoon") void afronden(alle, gegevens);\n    else naarControle(alle);');
    expect(src).toContain('modus === "telefoon" ? void afronden(fotos, gegevens) : naarControle(fotos)');
    expect(src).toContain("if (f) void afronden(f, gegevens);");
    // geen directe, ongevraagde afronding meer na de selfie
    expect(src).not.toMatch(/else void afronden\(alle, gegevens\)/);
  });

  it("het overzicht geeft geen documentnummer door en toont de foto's als kleine voorbeelden die hun adres opruimen", () => {
    const blok = src.slice(src.indexOf("bevestigOverzicht({"), src.indexOf("].map(([label, waarde])"));
    expect(blok).toContain("nummerTonen: false");
    expect(blok).not.toContain("gegevens.nummer");
    expect(blok).not.toContain("documentNumber");
    expect(src).toContain("URL.revokeObjectURL(u)");
    for (const foto of ["bevestigFotos.voor", "bevestigFotos.achter", "bevestigFotos.selfie", "bevestigFotos.beweging"]) expect(src).toContain(`<FotoMini file={${foto}}`);
  });

  it("de live camera, document-live en de automatische foto zijn niet veranderd (alleen de afronding en een klein voorbeeld)", () => {
    for (const stuk of ["/api/onboarding/document-live", "/api/onboarding/gezicht-live", "fotoVanVideo", "meetDocument", "meetGezicht"]) expect(src).toContain(stuk);
    expect(src.match(/^function FotoMini/gm)?.length).toBe(1);
  });
});
