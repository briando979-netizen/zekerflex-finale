import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { ontvangerDomeinen } from "@/lib/mail/log-domein";
import { BI_ROL, BI_VIEWS, inrichtSql, isHexWachtwoord, sqlTekst } from "@/lib/bi/views";
import { DASHBOARD_NAAM, KAARTEN } from "@/lib/bi/dashboards";
import { geldigeInbedsleutel, inbedToken, inbedUrl } from "@/lib/bi/embed";

// ---------------------------------------------------------------------------
// Metabase (open source, in Docker op de eigen server: docker-compose.vps.yml →
// metabase) als rapportagelaag. ZekerFlex richt hem zelf in, zonder klikken:
//   1. de database `metabase` voor zijn eigen gegevens, en de leesrol zf_bi op
//      het schema bi (lib/bi/views.ts) voor onze gegevens
//   2. de eerste beheerder (setup-token), de verbinding met het schema bi
//   3. de kaarten en het dashboard "Mijn bedrijf" (lib/bi/dashboards.ts), met
//      het bedrijf als vastgezette parameter
//   4. inbedden aan, de inbedsleutel, en de link voor /werkgever/rapportages
// De stand staat in KV `bi:metabase`; inrichten is idempotent (elk uur via cron
// en op verzoek in Admin → Rapportages). Zonder METABASE_URL doet dit niets.
// ---------------------------------------------------------------------------

export const K_BI = "bi:metabase";

export interface BiStand {
  /** laatste geslaagde inrichting */
  ingerichtOp: string | null;
  databaseId: number | null;
  collectionId: number | null;
  dashboardId: number | null;
  /** kaartsleutel → Metabase card id */
  kaarten: Record<string, number>;
  /** 64 hex: de inbedsleutel van Metabase (gelijk aan de instelling daar) */
  inbedsleutel: string | null;
  /** wachtwoord van de leesrol zf_bi (hex) */
  rolWachtwoord: string | null;
  beheerderEmail: string;
  laatsteFout: string | null;
  laatstePoging: string | null;
  versie: string | null;
}

const LEEG: BiStand = { ingerichtOp: null, databaseId: null, collectionId: null, dashboardId: null, kaarten: {}, inbedsleutel: null, rolWachtwoord: null, beheerderEmail: "", laatsteFout: null, laatstePoging: null, versie: null };

export const biIngesteld = () => Boolean(env.METABASE_URL);
export const biPubliekeUrl = () => (env.METABASE_PUBLIC_URL ?? "").replace(/\/$/, "");

export async function leesBiStand(): Promise<BiStand> {
  return { ...LEEG, ...((await kvGet<Partial<BiStand>>(K_BI)) ?? {}) };
}

// ── Metabase-API ─────────────────────────────────────────────────────────────

interface Sessie {
  token: string;
}

async function api<T>(pad: string, init: { method?: string; body?: unknown; sessie?: Sessie | null; timeoutMs?: number } = {}): Promise<T> {
  const basis = (env.METABASE_URL ?? "").replace(/\/$/, "");
  const res = await fetch(`${basis}/api${pad}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.sessie ? { "x-metabase-session": init.sessie.token } : {}) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
  const tekst = await res.text();
  let data: unknown = null;
  try {
    data = tekst ? JSON.parse(tekst) : null;
  } catch {
    data = tekst;
  }
  if (!res.ok) {
    const d = data as { message?: string; errors?: Record<string, string> } | string | null;
    const uitleg = typeof d === "string" ? d.slice(0, 200) : d?.message ?? (d?.errors ? JSON.stringify(d.errors).slice(0, 200) : `status ${res.status}`);
    throw new Error(`Metabase ${init.method ?? "GET"} ${pad}: ${uitleg}`);
  }
  return data as T;
}

/** Draait Metabase en is hij klaar voor verzoeken? */
export async function metabaseGezond(): Promise<{ ok: boolean; versie: string | null }> {
  if (!biIngesteld()) return { ok: false, versie: null };
  try {
    const h = await api<{ status: string }>("/health", { timeoutMs: 5000 });
    const p = await api<{ version?: { tag?: string } }>("/session/properties", { timeoutMs: 8000 }).catch(() => ({}) as { version?: { tag?: string } });
    return { ok: h.status === "ok", versie: p.version?.tag ?? null };
  } catch {
    return { ok: false, versie: null };
  }
}

// ── 1. Database en leesrol ───────────────────────────────────────────────────

async function databaseVoorMetabase(): Promise<void> {
  const rijen = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_database WHERE datname = 'metabase'`;
  if ((rijen[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`CREATE DATABASE metabase`);
    logger.info("bi: database metabase aangemaakt");
  }
}

async function leesrolEnViews(stand: BiStand): Promise<string> {
  const wachtwoord = stand.rolWachtwoord && isHexWachtwoord(stand.rolWachtwoord) ? stand.rolWachtwoord : randomBytes(24).toString("hex");
  for (const sql of inrichtSql(sqlTekst(wachtwoord))) await prisma.$executeRawUnsafe(sql);
  return wachtwoord;
}

// ── 2. Beheerder en verbinding ───────────────────────────────────────────────

async function sessieVoorBeheerder(stand: BiStand): Promise<{ sessie: Sessie; email: string }> {
  const email = env.METABASE_ADMIN_EMAIL;
  const wachtwoord = env.METABASE_ADMIN_PASSWORD;
  if (!wachtwoord) throw new Error("METABASE_ADMIN_PASSWORD ontbreekt (de uitrol maakt hem aan via deploy/scripts/env-aanvullen.sh)");
  const props = await api<{ "setup-token"?: string | null; "has-user-setup"?: boolean }>("/session/properties");
  if (props["setup-token"] && !props["has-user-setup"]) {
    // nieuwe installatie: de eerste beheerder aanmaken via het setup-token
    const r = await api<{ id: string }>("/setup", {
      method: "POST",
      body: {
        token: props["setup-token"],
        user: { email, password: wachtwoord, first_name: "ZekerFlex", last_name: "Beheer", site_name: "ZekerFlex Rapportages" },
        prefs: { site_name: "ZekerFlex Rapportages", site_locale: "nl", allow_tracking: false },
      },
      timeoutMs: 60_000,
    });
    logger.info("bi: metabase ingericht met eerste beheerder", { domein: ontvangerDomeinen(email) });
    return { sessie: { token: r.id }, email };
  }
  const r = await api<{ id: string }>("/session", { method: "POST", body: { username: stand.beheerderEmail || email, password: wachtwoord } });
  return { sessie: { token: r.id }, email: stand.beheerderEmail || email };
}

async function verbindingMetBi(sessie: Sessie, stand: BiStand, rolWachtwoord: string): Promise<number> {
  const details = { host: env.METABASE_DB_HOST, port: 5432, dbname: env.METABASE_DB_NAME, user: BI_ROL, password: rolWachtwoord, ssl: false, "schema-filters-type": "inclusion", "schema-filters-patterns": "bi" };
  const lijst = await api<{ data?: { id: number; name: string }[] } | { id: number; name: string }[]>("/database", { sessie });
  const bestaande = (Array.isArray(lijst) ? lijst : (lijst.data ?? [])).find((d) => d.name === "ZekerFlex");
  if (bestaande) {
    await api(`/database/${bestaande.id}`, { method: "PUT", sessie, body: { details, engine: "postgres", name: "ZekerFlex" } });
    await api(`/database/${bestaande.id}/sync_schema`, { method: "POST", sessie }).catch(() => undefined);
    return bestaande.id;
  }
  const r = await api<{ id: number }>("/database", { method: "POST", sessie, body: { engine: "postgres", name: "ZekerFlex", details, is_full_sync: true, is_on_demand: false, auto_run_queries: true }, timeoutMs: 60_000 });
  void stand;
  return r.id;
}

// ── 3. Kaarten en dashboard ──────────────────────────────────────────────────

const PARAM_ID = "tenant_id";

function kaartBody(sleutel: string, databaseId: number, collectionId: number) {
  const k = KAARTEN.find((x) => x.sleutel === sleutel);
  if (!k) throw new Error(`onbekende kaart ${sleutel}`);
  return {
    name: k.naam,
    description: k.uitleg,
    display: k.weergave,
    collection_id: collectionId,
    visualization_settings: k.instellingen ?? {},
    dataset_query: {
      type: "native",
      database: databaseId,
      native: {
        query: k.sql.replace(/\s+/g, " ").trim(),
        "template-tags": { tenant_id: { id: "a1b2c3d4-0000-4000-8000-00000000bi01", name: "tenant_id", "display-name": "Bedrijf", type: "text", required: true, default: "-" } },
      },
    },
  };
}

async function collectie(sessie: Sessie, stand: BiStand): Promise<number> {
  if (stand.collectionId) {
    const c = await api<{ id: number; archived?: boolean }>(`/collection/${stand.collectionId}`, { sessie }).catch(() => null);
    if (c && !c.archived) return c.id;
  }
  const r = await api<{ id: number }>("/collection", { method: "POST", sessie, body: { name: "ZekerFlex", description: "Rapporten die ZekerFlex zelf bijhoudt. Wijzigingen worden bij de volgende inrichting overschreven.", color: "#0E5C4A" } });
  return r.id;
}

async function kaarten(sessie: Sessie, stand: BiStand, databaseId: number, collectionId: number): Promise<Record<string, number>> {
  const uit: Record<string, number> = {};
  for (const k of KAARTEN) {
    const body = kaartBody(k.sleutel, databaseId, collectionId);
    const bestaand = stand.kaarten[k.sleutel];
    if (bestaand) {
      const ok = await api(`/card/${bestaand}`, { method: "PUT", sessie, body }).then(() => true, () => false);
      if (ok) {
        uit[k.sleutel] = bestaand;
        continue;
      }
    }
    const r = await api<{ id: number }>("/card", { method: "POST", sessie, body });
    uit[k.sleutel] = r.id;
  }
  return uit;
}

async function dashboard(sessie: Sessie, stand: BiStand, collectionId: number, kaartIds: Record<string, number>): Promise<number> {
  const parameters = [{ id: PARAM_ID, name: "Bedrijf", slug: "tenant_id", type: "string/=", sectionId: "string" }];
  let id = stand.dashboardId;
  if (id) {
    const bestaat = await api(`/dashboard/${id}`, { sessie }).then(() => true, () => false);
    if (!bestaat) id = null;
  }
  if (!id) {
    // een eerdere poging kan het dashboard al gemaakt hebben en daarna gestrand zijn:
    // dan die hergebruiken, anders komt er bij elke poging een nieuwe "Mijn bedrijf" bij
    const items = await api<{ data?: Array<{ id: number; name?: string; model?: string }> }>(`/collection/${collectionId}/items?models=dashboard`, { sessie }).catch(() => null);
    id = items?.data?.find((d) => d.model === "dashboard" && d.name === DASHBOARD_NAAM)?.id ?? null;
  }
  if (!id) {
    const r = await api<{ id: number }>("/dashboard", { method: "POST", sessie, body: { name: DASHBOARD_NAAM, description: "Uren, kosten, bezetting en facturen van het eigen bedrijf.", collection_id: collectionId, parameters } });
    id = r.id;
  }
  const dashcards = KAARTEN.map((k, i) => ({
    id: -(i + 1),
    card_id: kaartIds[k.sleutel],
    row: k.rij,
    col: k.kolom,
    size_x: k.breedte,
    size_y: k.hoogte,
    series: [],
    visualization_settings: {},
    parameter_mappings: [{ parameter_id: PARAM_ID, card_id: kaartIds[k.sleutel], target: ["variable", ["template-tag", "tenant_id"]] }],
  }));
  await api(`/dashboard/${id}`, { method: "PUT", sessie, body: { name: DASHBOARD_NAAM, parameters, dashcards, enable_embedding: true, embedding_params: { tenant_id: "locked" } }, timeoutMs: 60_000 });
  return id;
}

// ── 4. Inbedden ──────────────────────────────────────────────────────────────

/**
 * Embedden aanzetten, vóór het dashboard met de embed-vlag wordt opgeslagen (anders
 * weigert Metabase dat: "Embedding is not enabled"). Sinds 0.52 heet de instelling
 * enable-embedding-static (getekende links); oudere versies kennen alleen enable-embedding.
 */
async function inbeddenAan(sessie: Sessie): Promise<void> {
  const fouten: string[] = [];
  for (const naam of ["enable-embedding-static", "enable-embedding"]) {
    try {
      await api(`/setting/${naam}`, { method: "PUT", sessie, body: { value: true } });
      return;
    } catch (e) {
      fouten.push(`${naam}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Embedden aanzetten mislukt (${fouten.join("; ")})`);
}

async function inbedden(sessie: Sessie, stand: BiStand): Promise<string> {
  const huidig = await api<{ value?: string } | string | null>("/setting/embedding-secret-key", { sessie }).catch(() => null);
  const waarde = typeof huidig === "string" ? huidig : huidig?.value;
  if (geldigeInbedsleutel(waarde)) return waarde;
  const nieuw = stand.inbedsleutel && geldigeInbedsleutel(stand.inbedsleutel) ? stand.inbedsleutel : randomBytes(32).toString("hex");
  await api("/setting/embedding-secret-key", { method: "PUT", sessie, body: { value: nieuw } });
  return nieuw;
}

// ── Alles samen ──────────────────────────────────────────────────────────────

/** Metabase (opnieuw) inrichten. Idempotent; geeft de stand terug. */
export async function richtBiIn(): Promise<BiStand> {
  if (!biIngesteld()) throw AppError.precondition("Metabase is niet ingesteld (METABASE_URL ontbreekt).");
  const stand = await leesBiStand();
  stand.laatstePoging = new Date().toISOString();
  try {
    await databaseVoorMetabase();
    const gezond = await metabaseGezond();
    if (!gezond.ok) throw new Error("Metabase antwoordt nog niet (hij start een paar minuten na de eerste uitrol).");
    stand.versie = gezond.versie;
    const rolWachtwoord = await leesrolEnViews(stand);
    stand.rolWachtwoord = rolWachtwoord;
    const { sessie, email } = await sessieVoorBeheerder(stand);
    stand.beheerderEmail = email;
    stand.databaseId = await verbindingMetBi(sessie, stand, rolWachtwoord);
    stand.collectionId = await collectie(sessie, stand);
    stand.kaarten = await kaarten(sessie, stand, stand.databaseId, stand.collectionId);
    await inbeddenAan(sessie);
    stand.dashboardId = await dashboard(sessie, stand, stand.collectionId, stand.kaarten);
    stand.inbedsleutel = await inbedden(sessie, stand);
    stand.ingerichtOp = new Date().toISOString();
    stand.laatsteFout = null;
    await api("/session", { method: "DELETE", sessie }).catch(() => undefined);
    logger.info("bi: metabase ingericht", { dashboard: stand.dashboardId, kaarten: Object.keys(stand.kaarten).length, views: BI_VIEWS.length });
  } catch (e) {
    stand.laatsteFout = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    logger.warn("bi: inrichten mislukt", { fout: stand.laatsteFout });
  }
  await kvSet(K_BI, stand);
  return stand;
}

/** De ingebedde dashboardlink voor één bedrijf, of null als er nog geen dashboard is. */
export async function dashboardLinkVoor(tenantId: string, thema: "light" | "night" = "light"): Promise<string | null> {
  const stand = await leesBiStand();
  if (!stand.dashboardId || !stand.inbedsleutel || !biPubliekeUrl()) return null;
  return inbedUrl(biPubliekeUrl(), inbedToken(stand.inbedsleutel, stand.dashboardId, { tenant_id: tenantId }), { titel: false, rand: false, thema });
}
