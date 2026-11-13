import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  cijfersUit,
  LEGE_SAMENVATTING,
  samenvatBlokkades,
  type BeveiligingsCijfers,
  type Blokkade,
  type BlokkadeSamenvatting,
  type Melding,
} from "@/lib/ops/crowdsec-tekst";

// ---------------------------------------------------------------------------
// Aanvalsbescherming (CrowdSec, deploy/crowdsec): de engine in de container
// "crowdsec" leest de toegangslog van Caddy en het ssh-log, herkent scanners,
// brute force en bekende aanvallers (ook via de blokkadelijst van de community);
// de firewall-bouncer op de host blokkeert ze. Dit bestand praat met de lokale
// API (LAPI) van die engine: met de bouncer-sleutel alleen lezen welke adressen
// geblokkeerd zijn; met de machine-login ook de meldingen zien en een blokkade
// opheffen (Admin → Beveiliging). Zonder CROWDSEC_* in de omgeving (lokaal, of
// vóór installeer.sh) doet alles hier niets: null of lege lijsten.
//
// Gedeeld geheugen via globalThis: Next bundelt routes apart (AGENTS.md).
// ---------------------------------------------------------------------------

export interface BeveiligingOverzicht {
  ok: boolean;
  fout: string | null;
  blokkades: BlokkadeSamenvatting;
  /** adressen die nu een eigen of handmatige blokkade hebben (voor "opheffen") */
  geblokkeerd: string[];
  meldingen: Melding[];
  /** null = meldingen konden niet worden gelezen (geen machine-login) */
  meldingenFout: string | null;
  op: string;
}

interface Geheugen {
  token?: { waarde: string; verloopt: number };
  overzicht?: { op: number; data: BeveiligingOverzicht };
  cijfers?: { op: number; data: BeveiligingsCijfers | null };
  /** het verversen van de cijfers dat nu loopt (hooguit één tegelijk) */
  cijfersBezig?: Promise<BeveiligingsCijfers | null>;
}

const g = globalThis as typeof globalThis & { __zfCrowdsec?: Geheugen };
const geheugen: Geheugen = (g.__zfCrowdsec ??= {});

const OVERZICHT_MS = 60_000;
const CIJFERS_MS = 10 * 60_000;

export function crowdsecIngesteld(): boolean {
  return Boolean(env.CROWDSEC_LAPI_URL && env.CROWDSEC_BOUNCER_KEY);
}

function basis(): string {
  return (env.CROWDSEC_LAPI_URL ?? "").replace(/\/+$/, "");
}

/** Inloggen als machine (JWT, ~1 uur geldig); alleen nodig voor meldingen en opheffen. */
async function machineToken(): Promise<string> {
  const t = geheugen.token;
  if (t && t.verloopt > Date.now() + 60_000) return t.waarde;
  if (!env.CROWDSEC_MACHINE_ID || !env.CROWDSEC_MACHINE_PASSWORD) {
    throw new Error("Geen machine-login ingesteld (CROWDSEC_MACHINE_ID en CROWDSEC_MACHINE_PASSWORD)");
  }
  const res = await fetch(`${basis()}/v1/watchers/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ machine_id: env.CROWDSEC_MACHINE_ID, password: env.CROWDSEC_MACHINE_PASSWORD, scenarios: [] }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CrowdSec weigert de machine-login (${res.status})`);
  const d = (await res.json()) as { token: string; expire?: string };
  const verloopt = Date.parse(d.expire ?? "");
  geheugen.token = { waarde: d.token, verloopt: Number.isFinite(verloopt) ? verloopt : Date.now() + 50 * 60_000 };
  return d.token;
}

// De LAPI wil een "naam/versie" als User-Agent; met Node's standaard ("node") logt hij elke aanroep als waarschuwing.
const USER_AGENT = "zekerflex-app/1.0";

async function lapi<T>(pad: string, init: { auth: "bouncer" | "machine"; method?: "GET" | "DELETE" }): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT };
  if (init.auth === "bouncer") headers["X-Api-Key"] = env.CROWDSEC_BOUNCER_KEY ?? "";
  else headers.Authorization = `Bearer ${await machineToken()}`;
  const res = await fetch(`${basis()}${pad}`, { method: init.method ?? "GET", headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CrowdSec gaf ${res.status} op ${pad.replace(/\?.*$/, "")}`);
  const tekst = await res.text();
  return (tekst ? JSON.parse(tekst) : null) as T;
}

/** Alle actieve blokkades (eigen én community); de API geeft null als er geen zijn. */
export async function actieveBlokkades(): Promise<Blokkade[]> {
  if (!crowdsecIngesteld()) return [];
  return (await lapi<Blokkade[] | null>("/v1/decisions", { auth: "bouncer" })) ?? [];
}

/** De eigen meldingen van de afgelopen `uren`, nieuwste eerst (machine-login nodig). */
export async function recenteMeldingen(uren = 24, limiet = 60): Promise<Melding[]> {
  if (!crowdsecIngesteld()) return [];
  const lijst = (await lapi<Melding[] | null>(`/v1/alerts?since=${uren}h&limit=${limiet}`, { auth: "machine" })) ?? [];
  return lijst.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Blokkade van één adres opheffen; geeft het aantal opgeheven blokkades. */
export async function deblokkeer(ip: string): Promise<number> {
  const d = await lapi<{ nbDeleted?: string } | null>(`/v1/decisions?ip=${encodeURIComponent(ip)}`, { auth: "machine", method: "DELETE" });
  delete geheugen.overzicht;
  delete geheugen.cijfers;
  return Number(d?.nbDeleted ?? 0);
}

/** Voor Admin → Beveiliging; een minuut in het geheugen, want de blokkadelijst is groot. */
export async function beveiligingOverzicht(vers = false): Promise<BeveiligingOverzicht | null> {
  if (!crowdsecIngesteld()) return null;
  const c = geheugen.overzicht;
  if (!vers && c && Date.now() - c.op < OVERZICHT_MS) return c.data;
  const op = new Date().toISOString();
  let data: BeveiligingOverzicht;
  try {
    const blokkades = await actieveBlokkades();
    let meldingen: Melding[] = [];
    let meldingenFout: string | null = null;
    try {
      meldingen = await recenteMeldingen(24, 60);
    } catch (e) {
      meldingenFout = (e as Error).message;
    }
    data = {
      ok: true,
      fout: null,
      blokkades: samenvatBlokkades(blokkades),
      geblokkeerd: blokkades.filter((b) => b.origin === "crowdsec" || b.origin === "cscli").map((b) => b.value),
      meldingen,
      meldingenFout,
      op,
    };
  } catch (e) {
    logger.warn("crowdsec overview failed", { error: (e as Error).message });
    data = { ok: false, fout: (e as Error).message, blokkades: LEGE_SAMENVATTING, geblokkeerd: [], meldingen: [], meldingenFout: null, op };
  }
  geheugen.overzicht = { op: Date.now(), data };
  return data;
}

/**
 * Voor de openbare pagina /beveiliging: alleen aantallen, tien minuten in het geheugen. Zijn ze ouder, dan krijgt de
 * bezoeker meteen de vorige cijfers (met hun eigen "bijgewerkt") en ververst het erachter. Gemeten 13 nov: bijna elk
 * bezoek kwam na meer dan tien minuten stilte en wachtte dan 700–900 ms op de hele blokkadelijst; warm is het 15 ms.
 * Alleen de eerste bezoeker na een herstart wacht nog.
 */
export async function beveiligingsCijfers(): Promise<BeveiligingsCijfers | null> {
  if (!crowdsecIngesteld()) return null;
  const c = geheugen.cijfers;
  if (c && Date.now() - c.op < CIJFERS_MS) return c.data;
  if (c) {
    void ververs();
    return c.data;
  }
  return ververs();
}

function ververs(): Promise<BeveiligingsCijfers | null> {
  if (geheugen.cijfersBezig) return geheugen.cijfersBezig;
  const bezig = (async () => {
    let data: BeveiligingsCijfers | null = null;
    try {
      const blokkades = await actieveBlokkades();
      const meldingen7d = await recenteMeldingen(168, 1000)
        .then((m) => m.length)
        .catch(() => null);
      data = cijfersUit(samenvatBlokkades(blokkades), meldingen7d, new Date());
    } catch (e) {
      logger.warn("crowdsec figures failed", { error: (e as Error).message });
    }
    geheugen.cijfers = { op: Date.now(), data };
    return data;
  })().finally(() => {
    delete geheugen.cijfersBezig;
  });
  geheugen.cijfersBezig = bezig;
  return bezig;
}

/** Voor Admin → Systeem: "off" = niet op deze omgeving, "crit" = engine reageert niet. */
export async function crowdsecGezond(): Promise<"ok" | "off" | "crit"> {
  if (!crowdsecIngesteld()) return "off";
  try {
    // een adres dat nooit geblokkeerd is: klein antwoord (null), maar wel een echte controle van sleutel en engine
    await lapi<Blokkade[] | null>("/v1/decisions?ip=192.0.2.1", { auth: "bouncer" });
    return "ok";
  } catch {
    return "crit";
  }
}
