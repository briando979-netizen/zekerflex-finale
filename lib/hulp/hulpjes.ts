// ---------------------------------------------------------------------------
// Typen, vaste adressen en pure hulpjes van het hulpcentrum (components/app/HulpCentrum.tsx).
// Los van lib/hulp/teksten.ts, zodat de browser niet alle vijf talen meekrijgt.
// ---------------------------------------------------------------------------

export interface HulpLink {
  href: string;
  label: string;
}

export interface HulpVraag {
  id: string;
  v: string;
  a: string;
  link?: HulpLink;
}

export interface HulpNieuws {
  id: string;
  /** dag in Amsterdam, JJJJ-MM-DD (voor de volgorde en de stip) */
  dag: string;
  /** dezelfde dag voluit, in de taal van de werker */
  datum: string;
  titel: string;
  tekst: string;
  link?: HulpLink;
}

export interface HulpTeksten {
  knop: string;
  titel: string;
  onder: string;
  zoek: string;
  sluit: string;
  terug: string;
  tabs: { home: string; hulp: string; nieuws: string };
  home: {
    vragen: [string, string];
    handleidingen: [string, string];
    chat: [string, string];
    mail: [string, string];
    feedback: [string, string];
    status: { titel: string; ok: string; traag: string; storing: string; onbekend: string };
  };
  hulp: { titel: string; leeg: string; vraagHet: string; alles: string };
  feedback: { titel: string; uitleg: string; veld: string; plaatshouder: string; stuur: string; bezig: string; klaar: string; fout: string; teKort: string };
  nieuws: { titel: string; nieuw: string };
  vragen: HulpVraag[];
  nieuwsItems: HulpNieuws[];
}

/** Het gesprek met ZekerFlex Support openen (components/chat/InboxPage.tsx leest ?support=1). */
export const SUPPORT_CHAT = "/dashboard/berichten?support=1";
/** Zolang de onboarding loopt, is de chat dicht (lib/onboarding/werker-poort.ts): dan mailen. */
export const SUPPORT_MAIL = "mailto:support@zekerflex.com";
/** localStorage: id van het nieuwste nieuwsbericht dat de werker heeft gezien. */
export const HULP_NIEUWS_GEZIEN = "zf-hulp-nieuws";

/** Kleine letters zonder accenten, voor het zoeken (ą → a, ș → s; Cyrillisch blijft). */
function plat(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

/** Vragen waarin elk woord van de zoekterm voorkomt (in de vraag of het antwoord). Leeg = alles. */
export function zoekVragen(vragen: HulpVraag[], zoekterm: string): HulpVraag[] {
  const woorden = plat(zoekterm).split(/\s+/).filter((w) => w.length > 1);
  if (woorden.length === 0) return vragen;
  return vragen.filter((v) => {
    const tekst = plat(`${v.v} ${v.a}`);
    return woorden.every((w) => tekst.includes(w));
  });
}

/** Is er nieuws dat de werker nog niet zag? `gezien` = het id van het nieuwste bericht bij de vorige keer kijken. */
export function heeftNieuwsOngezien(nieuws: HulpNieuws[], gezien: string | null): boolean {
  const nieuwste = nieuws[0];
  return Boolean(nieuwste && nieuwste.id !== gezien);
}
