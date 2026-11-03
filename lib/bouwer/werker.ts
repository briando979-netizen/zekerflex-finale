import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { getLlmApiKey } from "@/lib/ai/llm-key";
import { primeMainModel } from "@/lib/ai/llm-model";
import { modelFor } from "@/lib/ai/models";
import { isLocalInference } from "@/lib/ai/governor";

// ---------------------------------------------------------------------------
// De ZekerFlex Bouwer: een AI-programmeur in een eigen container op de VPS
// (deploy/bouwer/werker). Hij krijgt een opdracht, zoekt/leest/wijzigt in een
// eigen kopie van de codebase, draait tsc + eslint en laat de diff zien. Pas na
// goedkeuring in Admin commit hij, werkt bij met de nieuwste main, controleert
// opnieuw en pusht naar GitHub; de live-zetter (lib/bouwer/live.ts) zet hem
// daarna live. De container heeft geen database of app-geheimen: het model en
// de GitHub-sleutel geeft de app per opdracht mee.
// ---------------------------------------------------------------------------

const URL_BOUWER = process.env.BOUWER_URL || "http://bouwer:4100";
const TOKEN = process.env.BOUWER_TOKEN || "";
const K_INSTELLINGEN = "bouwer:instellingen";
const DOEL_GITHUB = "bouwer-github";

export type TaakStaat = "bezig" | "klaar" | "mislukt" | "conflict" | "goedkeuren" | "gepusht" | "weggegooid";

export interface TaakStap {
  t: string;
  soort: "info" | "denk" | "tool" | "bestand" | "fout" | "klaar";
  tekst: string;
}

export interface Controle {
  ok: boolean;
  tsc: { ok: boolean; uit: string };
  eslint: { ok: boolean; uit: string };
  /** de bestaande tests die de wijziging raken (vitest related); ontbreekt bij oudere opdrachten */
  tests?: { ok: boolean; uit: string };
  op: string;
}

export interface TaakKort {
  id: string;
  opdracht: string;
  door: string;
  model: string;
  staat: TaakStaat;
  begon: string;
  bijgewerkt: string;
  sha: string | null;
  bestanden: number;
  /** de opdracht kwam met een schermafbeelding */
  metAfbeelding?: boolean;
}

export interface Taak extends Omit<TaakKort, "bestanden"> {
  stappen: TaakStap[];
  basis: string | null;
  bestanden: { status: string; pad: string }[];
  samenvatting: string;
  commitbericht: string;
  controle: Controle | null;
  fout: string | null;
  diff: string;
  bezig: boolean;
  /** Bij goedkeuren gevraagd: na de push meteen live zetten. */
  liveZetten?: boolean;
  /** De app heeft dat live-verzoek al neergelegd. */
  liveVerzocht?: boolean;
  /** Gezet zodra iemand op goedkeuren drukte; een mislukte poging mag dan opnieuw. */
  goedgekeurdDoor?: string;
}

interface Instellingen {
  model?: string;
  githubToken?: string;
  /** Zelf reparaties voorstellen voor terugkerende fouten (lib/bouwer/autopilot.ts). */
  autoFouten?: boolean;
}

export function bouwerIngesteld(): boolean {
  return TOKEN.length >= 24;
}

// ---- live voorbeeld (deploy/bouwer/werker/voorbeeld.mjs) ---------------------------

const VOORBEELD_HOST = process.env.BOUWER_VOORBEELD_HOST || "voorbeeld.37-97-226-24.sslip.io";
const VOORBEELD_GELDIG_MS = 2 * 60 * 60_000;

export interface VoorbeeldStand {
  staat: "uit" | "start" | "aan" | "fout";
  sinds: string | null;
  fout: string | null;
  regels: string[];
  host: string;
  beschikbaar: boolean;
  /** "opdracht" = de open opdracht van de Bouwer, "main" = de nieuwste versie op GitHub */
  versie?: "opdracht" | "main";
  sha?: string | null;
}

/** Een link die 2 uur toegang geeft tot het voorbeeld (de bouwer controleert de HMAC met BOUWER_TOKEN). */
export function voorbeeldLink(now = Date.now()): string {
  const exp = String(now + VOORBEELD_GELDIG_MS);
  const sig = createHmac("sha256", TOKEN).update(`voorbeeld:${exp}`).digest("base64url");
  return `https://${VOORBEELD_HOST}/?zf_vb=${exp}.${sig}`;
}

/** Een verzoek aan de bouwer-container; fouten worden een nette AppError. */
export async function bouwer<T>(pad: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!bouwerIngesteld()) throw AppError.precondition("De Bouwer is nog niet geïnstalleerd op de server (BOUWER_TOKEN ontbreekt)");
  let res: Response;
  try {
    res = await fetch(`${URL_BOUWER}${pad}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    });
  } catch {
    throw AppError.upstream("De Bouwer reageert niet (container gestopt of nog aan het opstarten)");
  }
  const data = (await res.json().catch(() => ({}))) as T & { fout?: string };
  if (!res.ok) {
    const msg = data.fout || `Bouwer gaf ${res.status}`;
    if (res.status === 409) throw AppError.conflict(msg);
    if (res.status === 400) throw AppError.validation(msg);
    if (res.status === 404) throw AppError.notFound(msg);
    throw AppError.upstream(msg);
  }
  return data;
}

export async function bouwerGezond(): Promise<{ ok: boolean; bezig: string | null } | null> {
  if (!bouwerIngesteld()) return null;
  try {
    const res = await fetch(`${URL_BOUWER}/gezond`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as { ok: boolean; bezig: string | null }) : null;
  } catch {
    return null;
  }
}

// ---- instellingen (model + GitHub-sleutel, versleuteld) ----------------------------

async function lees(): Promise<Instellingen> {
  return (await kvGet<Instellingen>(K_INSTELLINGEN)) ?? {};
}

// In de proef van 3 nov programmeerde gemini-3.5-flash duidelijk beter dan het
// lichte flash-lite dat de rest van de AI gebruikt, op dezelfde (gratis) sleutel.
const GEMINI_CODE_MODEL = "gemini-3.5-flash";

/** Zonder eigen keuze: het code-model uit de AI-instellingen, maar bij Gemini niet de lichte variant. */
export function standaardBouwerModel(codeModel: string, hoofdModel: string, baseUrl: string): string {
  const model = codeModel || hoofdModel;
  if (/generativelanguage\.googleapis\.com/.test(baseUrl) && /flash-lite/.test(model)) return GEMINI_CODE_MODEL;
  return model;
}

export async function bouwerModel(): Promise<string> {
  await primeMainModel();
  return (await lees()).model || standaardBouwerModel(modelFor("code"), env.LLM_MODEL, env.LLM_BASE_URL);
}

export async function bouwerInstellingen() {
  const i = await lees();
  return { model: await bouwerModel(), modelGekozen: Boolean(i.model), githubSleutel: Boolean(i.githubToken), autoFouten: Boolean(i.autoFouten) };
}

export async function zetBouwerInstellingen(wijziging: { model?: string | null; githubToken?: string | null; autoFouten?: boolean }): Promise<void> {
  const i = await lees();
  const volgende: Instellingen = { ...i };
  if (wijziging.autoFouten !== undefined) volgende.autoFouten = wijziging.autoFouten;
  if (wijziging.model !== undefined) {
    if (wijziging.model) volgende.model = wijziging.model;
    else delete volgende.model;
  }
  if (wijziging.githubToken !== undefined) {
    if (wijziging.githubToken) volgende.githubToken = sealSecret(wijziging.githubToken, DOEL_GITHUB);
    else delete volgende.githubToken;
  }
  await kvSet(K_INSTELLINGEN, volgende);
}

export async function githubSleutel(): Promise<string | null> {
  const i = await lees();
  if (!i.githubToken) return null;
  try {
    return openSecret(i.githubToken, DOEL_GITHUB);
  } catch {
    return null; // AUTH_SECRET gewisseld: opnieuw invullen
  }
}

/**
 * Het taalmodel dat de Bouwer per opdracht meekrijgt (zelfde endpoint/sleutel als de rest van de AI),
 * met het hoofdmodel als reserve voor als het gekozen model overbelast is of aan zijn daglimiet zit.
 */
export async function bouwerLlm(): Promise<{ baseUrl: string; apiKey: string | null; model: string; reserveModel?: string }> {
  // zelfde regel als de governor: code gaat alleen naar een extern model als dat mag
  if (!env.AI_ALLOW_REMOTE && !isLocalInference()) {
    throw AppError.precondition("Het taalmodel staat extern en AI_ALLOW_REMOTE staat uit; de Bouwer stuurt geen code naar buiten.");
  }
  const model = await bouwerModel();
  return {
    baseUrl: env.LLM_BASE_URL,
    apiKey: await getLlmApiKey(),
    model,
    ...(env.LLM_MODEL && env.LLM_MODEL !== model ? { reserveModel: env.LLM_MODEL } : {}),
  };
}
