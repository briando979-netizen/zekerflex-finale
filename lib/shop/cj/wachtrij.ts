// ---------------------------------------------------------------------------
// "Alles overnemen": het werk achter de wachtrij (18 nov 2026). Eén wachtrij tegelijk, in KV
// (shop:cj:wachtrij). De cron (/api/internal/shop/cj-wachtrij, elke 2 minuten) doet per ronde
// hooguit WACHTRIJ_PER_RONDE producten binnen een tijdsbudget, met een slot zodat twee rondes
// elkaar niet in de weg lopen. Elk product gaat door importeerCjProduct (claims, foto's, echte
// voorraad en verzendtarief, vertaling); zonder Nederlandse tekst gaat het niet aan maar wacht
// het op de Bijwerken-ronde (activerenNaVertaling). Pauze, hervatten en stoppen zijn een veldje.
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet, kvSetIfAbsent, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { cjZoek } from "@/lib/shop/cj/cj-client";
import { importeerCjProduct, leesCjInstellingen } from "@/lib/shop/cj/importeer";
import { naarEngelsZoekwoord } from "@/lib/shop/cj/zoekwoord";
import { WACHTRIJ_PER_PAGINA, WACHTRIJ_PER_RONDE, metPagina, metProduct, nieuweWachtrij, schatting, volgendeStap, voortgang, type CjWachtrij, type WachtrijStatus } from "@/lib/shop/cj/wachtrij-core";

const K_WACHTRIJ = "shop:cj:wachtrij";
const K_SLOT = "shop:cj:wachtrij:slot";
/** een ronde die zo lang geleden begon is vastgelopen (herstart midden in een ronde); dan mag de volgende het slot nemen */
const SLOT_MAX_MS = 4 * 60_000;

export const leesWachtrij = () => kvGet<CjWachtrij>(K_WACHTRIJ).catch(() => null);

async function bewaar(w: CjWachtrij): Promise<CjWachtrij> {
  await kvSet(K_WACHTRIJ, w);
  return w;
}

export interface WachtrijStand {
  wachtrij: CjWachtrij | null;
  voortgang: { afgehandeld: number; rest: number; procent: number } | null;
  schatting: string;
}

export async function wachtrijStand(): Promise<WachtrijStand> {
  const w = await leesWachtrij();
  return { wachtrij: w, voortgang: w ? voortgang(w) : null, schatting: w ? schatting(w).tekst : "" };
}

/** Start: de eerste pagina van de zoekuitslag ophalen (50 punten) en de wachtrij wegzetten. Eén tegelijk. */
export async function startWachtrij(o: { q: string; land?: string | undefined; categorie: string | null; actief: boolean; actorUserId: string | null }): Promise<WachtrijStand> {
  const huidig = await leesWachtrij();
  if (huidig && (huidig.status === "loopt" || huidig.status === "pauze")) throw AppError.conflict("Er loopt al een wachtrij. Stop die eerst, of wacht tot hij klaar is.");
  const instel = await leesCjInstellingen();
  const land = (o.land !== undefined ? o.land : instel.land).toUpperCase();
  const zoek = naarEngelsZoekwoord(o.q);
  const eerste = await cjZoek({ q: zoek.q, pagina: 1, land: land || undefined, perPagina: WACHTRIJ_PER_PAGINA });
  const w = nieuweWachtrij({ q: zoek.q, getypt: o.q, land, categorie: o.categorie, actief: o.actief, totaal: eerste.totaal, eerstePagina: eerste.treffers.map((t) => t.pid) });
  await bewaar(w);
  await recordAudit({
    category: "ADMIN",
    action: "shop.cj.wachtrij-gestart",
    actorUserId: o.actorUserId,
    actorLabel: "user",
    summary: `Wachtrij "Alles overnemen" gestart: ${w.totaal} producten voor "${o.q.slice(0, 60)}"${w.categorie ? ` in ${w.categorie}` : ""}${w.actief ? ", meteen aan" : ""}`,
    targetType: "shop-cj-wachtrij",
    targetId: w.id,
    metadata: { totaal: w.totaal, q: zoek.q, land, categorie: w.categorie, actief: w.actief },
  });
  return wachtrijStand();
}

/** Pauze, hervatten of stoppen. Stoppen is definitief voor deze wachtrij (wat al overgenomen is, blijft). */
export async function zetWachtrijStatus(status: Exclude<WachtrijStatus, "klaar">, actorUserId: string | null): Promise<WachtrijStand> {
  const w = await leesWachtrij();
  if (!w) throw AppError.validation("Er is geen wachtrij.");
  if (w.status === "klaar" || w.status === "gestopt") throw AppError.precondition("Deze wachtrij is al klaar of gestopt. Start een nieuwe vanuit een zoekopdracht.");
  await bewaar({ ...w, status, bijgewerktOp: new Date().toISOString() });
  await recordAudit({ category: "ADMIN", action: "shop.cj.wachtrij-status", actorUserId, actorLabel: "user", summary: `Wachtrij "Alles overnemen" → ${status} (${voortgang(w).afgehandeld} van ${w.totaal} gedaan)`, targetType: "shop-cj-wachtrij", targetId: w.id });
  return wachtrijStand();
}

/** De wachtrij weghalen uit Beheer (alleen als hij klaar of gestopt is). */
export async function wisWachtrij(): Promise<void> {
  const w = await leesWachtrij();
  if (w && (w.status === "loopt" || w.status === "pauze")) throw AppError.precondition("Stop de wachtrij eerst.");
  await kvDelete(K_WACHTRIJ);
}

export interface RondeUitkomst {
  gedaan: number;
  paginas: number;
  status: WachtrijStatus | "geen" | "bezet";
  rest: number;
}

/**
 * Eén ronde van de cron: hooguit `max` producten binnen `budgetMs`. Een pagina ophalen telt niet als product.
 * Komt de cron terwijl de vorige ronde nog loopt, dan slaat hij over (slot met tijd; een vastgelopen slot vervalt na 4 min).
 */
export async function rondeWachtrij(o: { budgetMs?: number; max?: number } = {}): Promise<RondeUitkomst> {
  const start = Date.now();
  const budget = o.budgetMs ?? 100_000;
  const max = o.max ?? WACHTRIJ_PER_RONDE;
  let w = await leesWachtrij();
  if (!w || w.status !== "loopt") return { gedaan: 0, paginas: 0, status: w?.status ?? "geen", rest: w ? voortgang(w).rest : 0 };

  const slot = { bezig: new Date().toISOString() };
  const oud = await kvGet<{ bezig?: string }>(K_SLOT).catch(() => null);
  if (oud?.bezig && Date.now() - Date.parse(oud.bezig) < SLOT_MAX_MS) return { gedaan: 0, paginas: 0, status: "bezet", rest: voortgang(w).rest };
  if (oud) await kvDelete(K_SLOT).catch(() => undefined);
  if (!(await kvSetIfAbsent(K_SLOT, slot))) return { gedaan: 0, paginas: 0, status: "bezet", rest: voortgang(w).rest };

  let gedaan = 0;
  let paginas = 0;
  try {
    while (gedaan < max && Date.now() - start < budget) {
      const stap = volgendeStap(w);
      if (stap === "wacht" || stap === "klaar") break;
      if (stap === "pagina") {
        try {
          const r = await cjZoek({ q: w.q, pagina: w.paginaVolgende, land: w.land || undefined, perPagina: WACHTRIJ_PER_PAGINA });
          w = await bewaar(metPagina(w, r.treffers.map((t) => t.pid)));
          paginas++;
          // een lege pagina terwijl CJ meer beloofde: dan zijn we klaar
          if (r.treffers.length === 0) w = await bewaar({ ...w, paginaKlaar: true });
        } catch (e) {
          w = await bewaar({ ...w, laatsteFout: `pagina ${w.paginaVolgende}: ${(e as Error).message.slice(0, 140)}` });
          break;
        }
        continue;
      }
      const pid = w.buffer[0];
      if (!pid) break;
      try {
        const u = await importeerCjProduct(pid, { actorUserId: null, actief: w.actief, categorie: w.categorie ?? undefined });
        w = await bewaar(metProduct(w, pid, u.bestaand ? "bestaand" : u.vertaald ? "gedaan" : "nogTeVertalen"));
      } catch (e) {
        const m = e instanceof AppError ? e.message : (e as Error).message;
        w = await bewaar(metProduct(w, pid, "mislukt", m));
        logger.warn("cj: wachtrij-product mislukt", { error: m.slice(0, 140) });
      }
      gedaan++;
    }
    if (volgendeStap(w) === "klaar" && w.status === "loopt") {
      w = await bewaar({ ...w, status: "klaar", bijgewerktOp: new Date().toISOString() });
      await recordAudit({ category: "ADMIN", action: "shop.cj.wachtrij-klaar", actorLabel: "system:cj", summary: `Wachtrij "Alles overnemen" klaar: ${w.gedaan} overgenomen (${w.nogTeVertalen} nog te vertalen), ${w.bestaand} stonden er al, ${w.mislukt} mislukt van ${w.totaal}`, targetType: "shop-cj-wachtrij", targetId: w.id });
    }
  } finally {
    await kvVerwijderAlsVeld(K_SLOT, "bezig", slot.bezig).catch(() => undefined);
  }
  return { gedaan, paginas, status: w.status, rest: voortgang(w).rest };
}
