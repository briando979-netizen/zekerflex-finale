import type { TafelStaat } from "@/lib/horeca/zaal";

// ---------------------------------------------------------------------------
// Eén kleur = één betekenis, ook op de schermen: groen = doen (serveren),
// amber = wacht op jou (lang wachten, oproep), blauw = gepland (reservering),
// goud = geld (rekening open), rood = probleem (te lang, buiten de grens).
// Licht voor het beheer (met donkere varianten uit globals.css), donker voor de
// schermen in keuken, bar en zaal. Kleur is nooit het enige signaal: elke tegel
// heeft ook een tekst.
// ---------------------------------------------------------------------------

export const TEGEL_LICHT: Record<TafelStaat, string> = {
  vrij: "bg-white border border-hair",
  gereserveerd: "bg-plan-soft border border-plan/30",
  bezet: "bg-paper-soft border border-hairstrong",
  wacht: "bg-white border-2 border-amber-500",
  serveren: "bg-white border-2 border-emerald-600",
  rekening: "bg-money-soft border border-money/40",
};

export const LABEL_LICHT: Record<TafelStaat, string> = {
  vrij: "pill-neutral",
  gereserveerd: "text-plan-ink text-xs font-semibold",
  bezet: "pill-neutral",
  wacht: "pill-warn",
  serveren: "pill-ok",
  rekening: "text-money-ink text-xs font-semibold",
};

export const TEGEL_DONKER: Record<TafelStaat, string> = {
  vrij: "bg-white/[0.03] ring-1 ring-white/10",
  gereserveerd: "bg-[#13254A] ring-1 ring-[#3B82F6]/60",
  bezet: "bg-white/[0.08] ring-1 ring-white/25",
  wacht: "bg-[#3A2203] ring-2 ring-[#F59E0B]",
  serveren: "bg-[#06311A] ring-2 ring-[#22C55E]",
  rekening: "bg-[#33260A] ring-1 ring-[#F5C451]/70",
};

export const LABEL_DONKER: Record<TafelStaat, string> = {
  vrij: "text-[#9BA8A1]",
  gereserveerd: "text-[#BFDBFE]",
  bezet: "text-[#EEF2EF]",
  wacht: "text-[#FCD34D]",
  serveren: "text-[#86EFAC]",
  rekening: "text-[#F5C451]",
};

/** Wachttijd op een bon: rustig, let op (amber) of te lang (rood). */
export const wachtNiveau = (min: number, letOp: number, teLang: number): "rustig" | "letop" | "telang" => (min >= teLang ? "telang" : min >= letOp ? "letop" : "rustig");

export const minTekst = (min: number | null) => (min === null ? "" : min < 1 ? "net" : `${min} min`);
