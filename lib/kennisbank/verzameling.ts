// Puur hulpje (geen imports, zodat het los te testen is): leest het bestand
// `_verzameling.md` van een map in docs/kennisbank. Eerste regel (`# Naam`) =
// naam van de verzameling, de rest = omschrijving. Een regel `Toegang: intern`
// maakt de verzameling privé in Outline: alleen de beheerder (de eigenaar van de
// API-sleutel) en wie hij er zelf aan toevoegt zien hem. Iedere ZekerFlex-
// gebruiker kan via "Inloggen met ZekerFlex" de kennisbank in, dus zonder die
// regel leest ook een flexwerker of opdrachtgever mee.

export interface VerzamelingKop {
  naam: string;
  uitleg: string;
  intern: boolean;
}

const TOEGANG = /^toegang:\s*(.+?)\s*$/i;

export function leesVerzamelingKop(tekst: string, standaardNaam: string): VerzamelingKop {
  const [eerste = "", ...rest] = tekst.trim().split("\n");
  const naam = eerste.replace(/^#\s*/, "").trim() || standaardNaam;
  let intern = false;
  const uitleg = rest
    .filter((regel) => {
      const m = TOEGANG.exec(regel.trim());
      if (!m) return true;
      intern = m[1]?.toLowerCase() === "intern";
      return false;
    })
    .join("\n")
    .trim();
  return { naam, uitleg, intern };
}
