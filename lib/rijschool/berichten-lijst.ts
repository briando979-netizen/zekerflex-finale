// ---------------------------------------------------------------------------
// Berichten tussen leerling en rijschool: de vormen die de schermen krijgen en
// pure hulpjes (geen prisma, dus ook bruikbaar in de browser). De opslag en de
// mails staan in lib/rijschool/berichten.ts.
// ---------------------------------------------------------------------------

/** Langste bericht dat je kunt sturen. */
export const BERICHT_MAX = 2000;

export interface BerichtRij {
  id: string;
  vanLeerling: boolean;
  /** wie namens de school schreef (leeg bij de leerling) */
  afzender: string;
  tekst: string;
  at: string;
  gelezen: boolean;
}

/** Een gesprek in het beheer: de leerling, het laatste bericht en hoeveel nog ongelezen zijn. */
export interface Gesprek {
  leerlingId: string;
  leerlingNaam: string;
  laatste: BerichtRij;
  /** berichten van de leerling die de school nog niet las */
  ongelezen: number;
}

/**
 * Tekst zoals hij bewaard wordt: zonder spaties aan de randen, regeleinden als
 * \n, hoogstens twee lege regels achter elkaar en geen onzichtbare stuurtekens.
 */
export function schoonBericht(tekst: string): string {
  return tekst
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex -- stuurtekens weghalen, regeleinden en tabs blijven
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Van losse berichten (nieuwste eerst, van meerdere leerlingen) naar één gesprek
 * per leerling, het meest recente gesprek bovenaan.
 */
export function gesprekkenUit(berichten: (BerichtRij & { leerlingId: string; leerlingNaam: string })[]): Gesprek[] {
  const alsRij = ({ id, vanLeerling, afzender, tekst, at, gelezen }: BerichtRij): BerichtRij => ({ id, vanLeerling, afzender, tekst, at, gelezen });
  const per = new Map<string, Gesprek>();
  for (const b of berichten) {
    const g = per.get(b.leerlingId);
    const ongelezen = b.vanLeerling && !b.gelezen ? 1 : 0;
    if (!g) {
      per.set(b.leerlingId, { leerlingId: b.leerlingId, leerlingNaam: b.leerlingNaam, laatste: alsRij(b), ongelezen });
    } else {
      g.ongelezen += ongelezen;
      if (b.at > g.laatste.at) g.laatste = alsRij(b);
    }
  }
  return [...per.values()].sort((a, b) => b.laatste.at.localeCompare(a.laatste.at));
}

/** Een korte voorvertoning van een bericht voor in een lijst. */
export function voorvertoning(tekst: string, max = 80): string {
  const plat = tekst.replace(/\s+/g, " ").trim();
  return plat.length > max ? `${plat.slice(0, max - 1).trimEnd()}…` : plat;
}
