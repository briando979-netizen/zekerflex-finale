import { amsterdamDayKey, amsterdamParts, amsterdamStartOfDay } from "@/lib/time/amsterdam";
import type { Aanvraag, Soort } from "@/lib/voorstel/smileyapp-aanvraag-regels";

// ---------------------------------------------------------------------------
// De wekelijkse mail aan de beheerders van SmileyApp (deel 6a): elke maandag
// vanaf 07:00 Nederlandse tijd een kort overzicht van de zeven dagen ervoor.
// Puur (geen kv, redis of mail), dus los te testen. Alleen tellingen van wat er
// echt is: geen namen, adressen of berichten. De server draait in UTC; elke dag
// en elk uur hier is Nederlandse tijd via lib/time/amsterdam.ts.
// ---------------------------------------------------------------------------

/** Een aanvraag die langer dan zoveel dagen op "Nieuw" staat, telt als openstaand. */
export const OPEN_NA_DAGEN = 2;
export const VERZEND_UUR = 7;

export interface WeekPeriode {
  /** de Nederlandse dag waarop de periode eindigt (JJJJ-MM-DD), bij de maandagmail die maandag: de sleutel van de week */
  sleutel: string;
  /** vanaf 00:00 Nederlandse tijd, zeven dagen eerder */
  van: Date;
  /** tot (niet tot en met) 00:00 Nederlandse tijd vandaag */
  tot: Date;
  /** de zeven Nederlandse dagen van de periode, de oudste eerst */
  dagen: string[];
}

/** De zeven hele Nederlandse dagen vóór vandaag. Op maandag is dat maandag tot en met zondag van de week ervoor. */
export function weekPeriode(nu: Date): WeekPeriode {
  const tot = amsterdamStartOfDay(nu);
  const van = amsterdamStartOfDay(nu, -7);
  return { sleutel: amsterdamDayKey(tot), van, tot, dagen: Array.from({ length: 7 }, (_, i) => amsterdamDayKey(amsterdamStartOfDay(nu, i - 7))) };
}

/** Is het maandag, 07:00 Nederlandse tijd of later? De cron draait in UTC en vraagt het daarom elk uur van de ochtend. */
export function isVerzendMoment(nu: Date): boolean {
  const p = amsterdamParts(nu);
  return p.weekday === 1 && p.hour >= VERZEND_UUR;
}

export interface WeekCijfers {
  /** eerste en laatste dag van de periode (JJJJ-MM-DD) */
  van: string;
  totEnMet: string;
  /** paginaweergaven; null als de tellers niet te lezen waren (dan staat er geen getal in de mail) */
  bezoeken: number | null;
  aanvragen: Record<Soort, number>;
  /** chatgesprekken die in de periode begonnen; null als ze niet te lezen waren */
  chats: number | null;
  /** demo's die in de periode via de agenda zijn geboekt (en niet geannuleerd) */
  demos: number;
  /** aanvragen die nu langer dan OPEN_NA_DAGEN dagen op "Nieuw" staan */
  open: number;
}

const binnen = (iso: string, p: WeekPeriode) => {
  const t = new Date(iso).getTime();
  return t >= p.van.getTime() && t < p.tot.getTime();
};

export function telWeek(o: { periode: WeekPeriode; nu: Date; aanvragen: readonly Aanvraag[]; chatStarts: readonly string[] | null; bezoeken: number | null }): WeekCijfers {
  const nieuw = o.aanvragen.filter((a) => binnen(a.aangemaakt, o.periode));
  const grens = o.nu.getTime() - OPEN_NA_DAGEN * 86_400_000;
  return {
    van: o.periode.dagen[0] ?? "",
    totEnMet: o.periode.dagen[o.periode.dagen.length - 1] ?? "",
    bezoeken: o.bezoeken,
    aanvragen: { demo: nieuw.filter((a) => a.soort === "demo").length, partner: nieuw.filter((a) => a.soort === "partner").length },
    chats: o.chatStarts ? o.chatStarts.filter((s) => binnen(s, o.periode)).length : null,
    demos: nieuw.filter((a) => a.afspraak !== undefined).length,
    open: o.aanvragen.filter((a) => a.status === "nieuw" && new Date(a.aangemaakt).getTime() < grens).length,
  };
}

/** De sleutel van het merk "deze week is verstuurd": één per maandag. */
export const WEEKMAIL_PREFIX = "voorstel-smileyapp:weekmail:";
export const weekmailSleutel = (periode: WeekPeriode) => `${WEEKMAIL_PREFIX}${periode.sleutel}`;
