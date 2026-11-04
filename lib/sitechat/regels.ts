// ---------------------------------------------------------------------------
// Websitechat voor sites die op ZekerFlex draaien: een AI-assistent die
// antwoordt met de gegevens van het bedrijf, en een medewerker die kan
// meelezen, overnemen en teruggeven. Zelfde opzet als de chat op de
// ZekerFlex-homepage (lib/chat/webchat.ts), maar per kanaal (één site).
// Pure regels, los te testen; opslag in gesprek.ts, het antwoord in antwoord.ts.
// ---------------------------------------------------------------------------

/** ai = de assistent antwoordt; wacht = de gast vroeg om een medewerker (AI antwoordt nog); mens = een medewerker heeft overgenomen; gesloten = afgerond */
export type ChatStatus = "ai" | "wacht" | "mens" | "gesloten";
export type ChatRol = "gast" | "ai" | "medewerker" | "systeem";

export interface ChatBericht {
  rol: ChatRol;
  tekst: string;
  op: string;
  /** naam van de medewerker */
  door?: string;
}

export interface SiteGesprek {
  id: string;
  kanaal: string;
  status: ChatStatus;
  gestart: string;
  laatst: string;
  berichten: ChatBericht[];
  /** berichten van de gast die het team nog niet zag */
  ongelezen: number;
  pagina?: string;
  /** e-mail van het ingelogde account van de gast (inzage en wissen) */
  account?: string;
  /** wie van het team het gesprek oppakt */
  toegewezen?: string;
}

export const MAX_BERICHTEN = 200;
/** Gesprekken vervallen 90 dagen na het laatste bericht (AVG: niet langer dan nodig). */
export const BEWAAR_DAGEN = 90;

export const isGesprekId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{16,48}$/.test(id);
export const isKanaal = (k: string) => /^[a-z0-9][a-z0-9:_-]{1,59}$/.test(k);

export function nieuwGesprek(kanaal: string, id: string, nu: string): SiteGesprek {
  return { id, kanaal, status: "ai", gestart: nu, laatst: nu, berichten: [], ongelezen: 0 };
}

/** Een bericht erbij: een gast die terugkomt heropent een gesloten gesprek; een antwoord van het team zet ongelezen op 0. */
export function metBericht(g: SiteGesprek, b: { rol: ChatRol; tekst: string; door?: string | undefined }, nu: string): SiteGesprek {
  const bericht: ChatBericht = { rol: b.rol, tekst: b.tekst.trim().slice(0, 4000), op: nu, ...(b.door ? { door: b.door } : {}) };
  return {
    ...g,
    laatst: nu,
    berichten: [...g.berichten, bericht].slice(-MAX_BERICHTEN),
    status: b.rol === "gast" && g.status === "gesloten" ? "ai" : g.status,
    ongelezen: b.rol === "gast" ? g.ongelezen + 1 : b.rol === "medewerker" ? 0 : g.ongelezen,
  };
}

/** Zolang geen medewerker heeft overgenomen, antwoordt de assistent. */
export const aiMagAntwoorden = (g: Pick<SiteGesprek, "status">) => g.status === "ai" || g.status === "wacht";

/** Wat de gast bij het verversen ziet: berichten van het team en meldingen vanaf positie `sinds`. */
export function voorGast(g: SiteGesprek, sinds: number) {
  return {
    status: g.status,
    totaal: g.berichten.length,
    berichten: g.berichten
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => i >= sinds && (b.rol === "medewerker" || b.rol === "systeem"))
      // met de positie i, zodat de widget nooit iets dubbel toont
      .map(({ b, i }) => ({ i, rol: b.rol, tekst: b.tekst, door: b.door ?? "", op: b.op })),
  };
}

export const wilMens = (tekst: string) =>
  /(medewerker|met een mens|echte? (persoon|mens)|iemand (spreken|bellen)|een collega|persoon spreken|niet met een (bot|robot|computer))/i.test(tekst);

export const wilBoeken = (tekst: string) => /(reserv|boek|afspra|inplan|plek (vrij|over)|beschikba|wanneer kan|kunnen we komen|plannen)/i.test(tekst);

export function verlopen(laatst: string, nu: Date, dagen = BEWAAR_DAGEN): boolean {
  const t = Date.parse(laatst);
  return Number.isNaN(t) || nu.getTime() - t > dagen * 86_400_000;
}

/** Laatste vraag van de gast, voor de lijst in het beheer. */
export const voorbeeld = (g: SiteGesprek) => [...g.berichten].reverse().find((b) => b.rol === "gast")?.tekst.slice(0, 140) ?? "";

// ---------------------------------------------------------------------------
// Kennis: de gegevens van het bedrijf als losse fragmenten. Per vraag gaan
// alleen de vaste fragmenten en de best passende mee naar het model, zodat
// het antwoord kort en feitelijk blijft.
// ---------------------------------------------------------------------------

export interface Fragment {
  titel: string;
  tekst: string;
  /** altijd meesturen (contact, openingstijden) */
  altijd?: boolean;
}

const STOP = new Set(
  "aan als bij dan dat de deze die dit doe doen een en er ge had heb hebben het hier hij hoe hun ik in is je jij jullie kan kun kunnen maar me met mij mijn na naar niet nog nu of om ons onze ook op over te tot u uit van veel voor waar wat we wel welk welke wie wij wil wordt zal zij zijn zo zou".split(" "),
);

/** Woorden van een tekst, zonder accenten en stopwoorden; meervoud eraf en lange woorden op hun begin (quad/quads, buggy/buggy's, rijden/rijdt). */
export function woorden(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(en|s)$/, "") : w))
    .map((w) => (w.length > 5 ? w.slice(0, 5) : w));
}

function score(vraag: Set<string>, f: Fragment): number {
  let s = 0;
  for (const w of new Set(woorden(f.titel))) if (vraag.has(w)) s += 3;
  for (const w of new Set(woorden(f.tekst))) if (vraag.has(w)) s += 1;
  return s;
}

/** De vaste fragmenten plus de `max` best passende bij de vraag (en de vorige vraag, voor vervolgvragen). */
export function kiesFragmenten(vraag: string, fragmenten: readonly Fragment[], max = 6): Fragment[] {
  const v = new Set(woorden(vraag));
  const vast = fragmenten.filter((f) => f.altijd);
  const rest = fragmenten
    .filter((f) => !f.altijd)
    .map((f, i) => ({ f, i, s: score(v, f) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.f);
  return [...vast, ...rest];
}

export function bouwSysteem(o: { bedrijf: string; omschrijving: string; regels?: readonly string[] }, fragmenten: readonly Fragment[]): string {
  return [
    `Je bent de chatassistent op de website van ${o.bedrijf}. ${o.omschrijving}`,
    "",
    "Regels:",
    "- Antwoord in de taal van de bezoeker (meestal Nederlands), vriendelijk en kort: hooguit vier zinnen.",
    "- Gebruik alleen de gegevens hieronder. Verzin geen prijzen, tijden, acties, kortingen of beloftes.",
    '- Weet je iets niet zeker, zeg dat eerlijk en bied aan dat een medewerker meekijkt via de knop "Medewerker".',
    "- Vraag nooit om betaalgegevens, wachtwoorden of een burgerservicenummer.",
    ...(o.regels ?? []).map((r) => `- ${r}`),
    "",
    `Gegevens van ${o.bedrijf}:`,
    ...fragmenten.map((f) => `\n## ${f.titel}\n${f.tekst}`),
  ].join("\n");
}

/** Antwoord zonder taalmodel (of als het model niet reageert): het best passende fragment, of een eerlijke doorverwijzing. */
export function antwoordZonderModel(vraag: string, fragmenten: readonly Fragment[], contact: string): string {
  const beste = kiesFragmenten(vraag, fragmenten.filter((f) => !f.altijd), 1)[0];
  if (beste) {
    const tekst = beste.tekst.length > 420 ? `${beste.tekst.slice(0, 400).replace(/\s+\S*$/, "")} …` : beste.tekst;
    return `${beste.titel}: ${tekst}\n\nWil je meer weten? Klik op "Medewerker", of ${contact}.`;
  }
  return `Daar weet ik niet direct het antwoord op. Klik op "Medewerker", dan kijkt een collega mee, of ${contact}.`;
}
