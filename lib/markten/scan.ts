// De marktscanner met netwerk: haalt gratis koersen op (CoinGecko, Yahoo Finance;
// geen sleutel, geen kosten), laat lib/markten/core.ts er signalen van maken en
// legt hoogstens een paar VOORSTELLEN klaar in de betaalmotor (lib/agent-pay).
// Er gaat nooit geld of handel uit zichzelf: een voorstel is PENDING tot de
// eigenaar goedkeurt, en de betaalrail staat standaard uit. Zonder speelgeld-
// budget dat de eigenaar zelf instelde, worden er helemaal geen voorstellen gemaakt.

import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { listIntents, saveIntent } from "@/lib/agent-pay/store";
import { proposeIntent } from "@/lib/agent-pay/intents";
import { ACTIVA, AFWIJZING, analyseerCoin, analyseerReeks, kiesKansen, parseYahoo, soortCoin, voorstelBedragCents, type Analyse, type CoinMarkt } from "./core";

const K_BUDGET = "markten:budget";
const K_LAATSTE = "markten:laatste";
const MAX_VOORSTELLEN_PER_DAG = 3;
const UA = "Mozilla/5.0 (compatible; ZekerFlexMarkten/1.0)";

export type MarktRapport = { op: string; analyses: Analyse[]; kansen: Analyse[]; voorstellen: string[]; budgetCents: number; fouten: string[]; afwijzing: string };

async function haalJson(url: string, ms = 12_000): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function leesBudgetCents(): Promise<number> {
  const v = await kvGet<number>(K_BUDGET).catch(() => null);
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}
export async function zetBudgetCents(cents: number): Promise<number> {
  const n = Math.max(0, Math.min(10_000_000, Math.round(cents)));
  await kvSet(K_BUDGET, n);
  return n;
}
export async function leesLaatsteRapport(): Promise<MarktRapport | null> {
  return (await kvGet<MarktRapport>(K_LAATSTE).catch(() => null)) ?? null;
}

/** Alle markten scannen en (met budget) voorstellen klaarzetten. */
export async function scanMarkten(opties: { voorstellen?: boolean } = {}): Promise<MarktRapport> {
  const fouten: string[] = [];
  const analyses: Analyse[] = [];

  // Aandelen, indices en grondstoffen (Yahoo), parallel maar met een eigen foutafvang per activum
  await Promise.all(
    ACTIVA.filter((a) => a.bron === "yahoo").map(async (a) => {
      try {
        const json = await haalJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.symbool)}?range=3mo&interval=1d`);
        const an = analyseerReeks(a, parseYahoo(json));
        if (an) analyses.push(an);
        else fouten.push(`${a.naam}: te weinig koersen`);
      } catch (e) {
        fouten.push(`${a.naam}: ${(e as Error).message}`);
      }
    }),
  );

  // Crypto en memecoins (CoinGecko): top 40 op marktwaarde plus wat nu in trek is
  try {
    const markt = (await haalJson("https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=60&page=1&price_change_percentage=24h,7d,30d")) as (CoinMarkt & { market_cap_rank?: number | null })[];
    for (const c of markt) analyses.push(analyseerCoin(c, soortCoin(c.id, c.market_cap_rank ?? null)));
    const trend = (await haalJson("https://api.coingecko.com/api/v3/search/trending").catch(() => null)) as { coins?: { item?: { id?: string } }[] } | null;
    const ids = (trend?.coins ?? []).map((c) => c.item?.id).filter((x): x is string => !!x && !analyses.some((a) => a.id === x)).slice(0, 7);
    if (ids.length) {
      const extra = (await haalJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${ids.join(",")}&price_change_percentage=24h,7d,30d`)) as (CoinMarkt & { market_cap_rank?: number | null })[];
      for (const c of extra) analyses.push(analyseerCoin(c, soortCoin(c.id, c.market_cap_rank ?? 999)));
    }
  } catch (e) {
    fouten.push(`Crypto: ${(e as Error).message}`);
  }

  const kansen = kiesKansen(analyses, 6);
  const budgetCents = await leesBudgetCents();
  const voorstellen: string[] = [];

  if (opties.voorstellen !== false && budgetCents > 0 && kansen.length) {
    const bestaand = await listIntents().catch(() => []);
    const vandaag = new Date().toISOString().slice(0, 10);
    const vandaagGemaakt = bestaand.filter((i) => i.proposedBy === "ai-markten" && i.createdAt.startsWith(vandaag)).length;
    const open = new Set(bestaand.filter((i) => i.proposedBy === "ai-markten" && i.status === "PENDING").map((i) => i.recipient));
    let ruimte = MAX_VOORSTELLEN_PER_DAG - vandaagGemaakt;
    for (const k of kansen) {
      if (ruimte <= 0) break;
      const ontvanger = `Markt — ${k.naam}`;
      const bedrag = voorstelBedragCents(k.risico, budgetCents);
      if (open.has(ontvanger) || bedrag <= 0) continue;
      const i = proposeIntent({
        amountCents: bedrag,
        recipient: ontvanger,
        external: true,
        reason: `${k.naam}: ${k.uitleg} (7 dagen ${k.r7 ?? "?"}%, 30 dagen ${k.r30 ?? "?"}%, risico ${k.risico}/100). ${AFWIJZING}`,
        proposedBy: "ai-markten",
      });
      try {
        await saveIntent(i);
        voorstellen.push(i.id);
        ruimte--;
      } catch (e) {
        logger.warn("markten: voorstel opslaan mislukt", { error: (e as Error).message });
      }
    }
  }

  const rapport: MarktRapport = { op: new Date().toISOString(), analyses: analyses.sort((a, b) => a.naam.localeCompare(b.naam)), kansen, voorstellen, budgetCents, fouten, afwijzing: AFWIJZING };
  await kvSet(K_LAATSTE, rapport).catch(() => undefined);
  return rapport;
}
