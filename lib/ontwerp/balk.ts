import { veiligeLink } from "@/lib/ontwerp/paginas";

// ---------------------------------------------------------------------------
// De aankondigingsbalk boven de eigen site (Site-ontwerper → Menu): een korte
// tekst met een link, in een kleur, aan of uit, eventueel alleen tussen twee
// datums (Nederlandse dagen). Een bezoeker kan hem wegklikken; een nieuwe
// tekst komt dan weer terug (de vingerafdruk verandert). Standaard uit, dan
// is de site exact zoals hij was. Puur en browser-veilig.
// ---------------------------------------------------------------------------

/** één kleur = één betekenis: merk/groen = doen, donker = rustig, goud = geld (aanbieding) */
export const BALK_KLEUREN = {
  merk: { label: "ZekerFlex-groen", klasse: "bg-brand-600 text-white", link: "text-white underline" },
  donker: { label: "Donker", klasse: "bg-[#0C0E12] text-white", link: "text-brand-mint underline" },
  goud: { label: "Goud (aanbieding)", klasse: "bg-amber-100 text-amber-950", link: "text-amber-950 underline" },
} as const;

export type BalkKleur = keyof typeof BALK_KLEUREN;

export interface Balk {
  aan: boolean;
  tekst: string;
  linkTekst: string;
  link: string;
  kleur: BalkKleur;
  /** YYYY-MM-DD (Nederlandse dag), leeg = geen begin */
  vanaf: string;
  /** YYYY-MM-DD (Nederlandse dag, tot en met), leeg = geen einde */
  tot: string;
  /** mag een bezoeker hem wegklikken */
  sluitbaar: boolean;
}

export const LEGE_BALK: Balk = { aan: false, tekst: "", linkTekst: "", link: "", kleur: "merk", vanaf: "", tot: "", sluitbaar: true };

const dag = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const schoon = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function normalizeBalk(raw: unknown): Balk {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const tekst = schoon(r.tekst, 160);
  const link = veiligeLink(r.link);
  return {
    // zonder tekst kan hij niet aan
    aan: r.aan === true && Boolean(tekst),
    tekst,
    linkTekst: link ? schoon(r.linkTekst, 40) : "",
    link,
    kleur: typeof r.kleur === "string" && r.kleur in BALK_KLEUREN ? (r.kleur as BalkKleur) : "merk",
    vanaf: dag(r.vanaf),
    tot: dag(r.tot),
    sluitbaar: r.sluitbaar !== false,
  };
}

/** Staat hij op deze Nederlandse dag (YYYY-MM-DD) aan? */
export function balkActief(b: Balk, vandaag: string): boolean {
  if (!b.aan || !b.tekst) return false;
  if (b.vanaf && vandaag < b.vanaf) return false;
  if (b.tot && vandaag > b.tot) return false;
  return true;
}

/** Korte vingerafdruk van de inhoud: weggeklikt geldt alleen voor déze tekst en link. */
export function balkId(b: Balk): string {
  let h = 5381;
  for (const c of `${b.tekst}|${b.link}|${b.linkTekst}`) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export const BALK_COOKIE = "zf_balk_dicht";
