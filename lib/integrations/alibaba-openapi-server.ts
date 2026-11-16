import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { leesTokenAntwoord, verzoekParams, type AlibabaToken } from "@/lib/integrations/alibaba-openapi";

// ---------------------------------------------------------------------------
// De server van de Alibaba-koppeling (lib/integrations/alibaba-openapi.ts): de instellingen uit de omgeving, een
// ondertekend verzoek naar de gateway, het token maken en vernieuwen, en bewaren: versleuteld (sealSecret), want
// wie het token heeft, handelt namens het Alibaba-account van de eigenaar. Nooit een token of code in een log.
//   key "alibaba:token"        → verzegeld AlibabaToken
//   key "alibaba:state:<s>"    → { op } (de autorisatie die net begon; 10 minuten geldig, één keer te gebruiken)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "alibaba:token";
const DOEL = "alibaba-openapi-token";
const STATE_MS = 10 * 60_000;
/** een dag voor het verlopen alvast vernieuwen */
const VERNIEUW_MS = 24 * 3600_000;

export interface AlibabaInstellingen {
  appKey: string;
  secret: string;
  api: string;
  auth: string;
}

/** Wat er nog ontbreekt in de omgeving (namen, geen waarden). */
export function alibabaOntbreekt(): string[] {
  return (["ALIBABA_APP_KEY", "ALIBABA_APP_SECRET", "ALIBABA_API_URL", "ALIBABA_AUTH_URL"] as const).filter((k) => !env[k]?.trim());
}

export function alibabaInstellingen(): AlibabaInstellingen | null {
  if (alibabaOntbreekt().length) return null;
  return { appKey: env.ALIBABA_APP_KEY!.trim(), secret: env.ALIBABA_APP_SECRET!.trim(), api: env.ALIBABA_API_URL!.trim().replace(/\/+$/, ""), auth: env.ALIBABA_AUTH_URL!.trim() };
}

/** Het adres waar Alibaba de beheerder na de toestemming heen stuurt (zo ook in de app op het Open Platform zetten). */
export const alibabaTerugAdres = () => `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/admin/alibaba/terug`;

/** Een ondertekend verzoek naar de gateway; het antwoord als JSON. */
export async function alibabaVerzoek(apiPad: string, zaak: Record<string, string>, opts: { accessToken?: string } = {}): Promise<unknown> {
  const inst = alibabaInstellingen();
  if (!inst) throw AppError.validation(`De Alibaba-koppeling is nog niet ingesteld (ontbreekt: ${alibabaOntbreekt().join(", ")}).`);
  const params = verzoekParams(apiPad, zaak, { appKey: inst.appKey, secret: inst.secret, accessToken: opts.accessToken });
  const res = await fetch(`${inst.api}${apiPad}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  }).catch((err: unknown) => {
    logger.warn("alibaba: gateway niet bereikbaar", { pad: apiPad, fout: err instanceof Error ? err.message.slice(0, 120) : "onbekend" });
    return null;
  });
  if (!res) throw AppError.upstream("Alibaba is nu niet bereikbaar. Probeer het zo nog eens.");
  return res.json().catch(() => ({ message: `Alibaba antwoordde met ${res.status}.` }));
}

async function bewaar(t: AlibabaToken): Promise<void> {
  await kvSet(TOKEN_KEY, { verzegeld: sealSecret(JSON.stringify(t), DOEL), verlooptOp: t.verlooptOp, account: t.account });
}

async function gelezen(): Promise<AlibabaToken | null> {
  const rij = await kvGet<{ verzegeld?: string }>(TOKEN_KEY).catch(() => null);
  if (!rij?.verzegeld) return null;
  try {
    return JSON.parse(openSecret(rij.verzegeld, DOEL)) as AlibabaToken;
  } catch {
    return null;
  }
}

/** Een nieuwe autorisatie beginnen: een state die maar één keer en 10 minuten geldig is. */
export async function nieuweState(): Promise<string> {
  const state = randomUUID().replace(/-/g, "");
  await kvSet(`alibaba:state:${state}`, { op: Date.now() });
  return state;
}

/** Klopt de state van de terugweg? Daarna is hij op (ook als hij niet klopte). */
export async function stateGeldig(state: string, nu = Date.now()): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(state)) return false;
  const rij = await kvGet<{ op?: number }>(`alibaba:state:${state}`).catch(() => null);
  await kvDelete(`alibaba:state:${state}`).catch(() => undefined);
  return typeof rij?.op === "number" && nu - rij.op <= STATE_MS;
}

/** De code van de terugweg omruilen voor een token (/auth/token/create) en bewaren. */
export async function maakToken(code: string): Promise<AlibabaToken> {
  const t = leesTokenAntwoord(await alibabaVerzoek("/auth/token/create", { code }), Date.now());
  if ("fout" in t) throw AppError.validation(`Koppelen met Alibaba lukte niet: ${t.fout}`);
  await bewaar(t);
  return t;
}

/** Een geldig access_token; een dag voor het verlopen wordt het vernieuwd (/auth/token/refresh). null = niet gekoppeld. */
export async function geldigToken(nu = Date.now()): Promise<string | null> {
  const t = await gelezen();
  if (!t) return null;
  if (Date.parse(t.verlooptOp) - nu > VERNIEUW_MS) return t.access;
  if (!t.refresh || (t.refreshVerlooptOp && Date.parse(t.refreshVerlooptOp) <= nu)) return Date.parse(t.verlooptOp) > nu ? t.access : null;
  const nieuw = leesTokenAntwoord(await alibabaVerzoek("/auth/token/refresh", { refresh_token: t.refresh }).catch(() => null), nu);
  if ("fout" in nieuw) {
    logger.warn("alibaba: vernieuwen lukte niet", { fout: nieuw.fout.slice(0, 120) });
    return Date.parse(t.verlooptOp) > nu ? t.access : null;
  }
  // altijd het nieuwste refresh_token bewaren (het oude vervalt)
  await bewaar({ ...nieuw, refresh: nieuw.refresh || t.refresh, account: nieuw.account ?? t.account });
  return nieuw.access;
}

export interface AlibabaStand {
  ingesteld: boolean;
  ontbreekt: string[];
  gekoppeld: boolean;
  account: string | null;
  verlooptOp: string | null;
  terugAdres: string;
}

/** Voor Beheer → Webshop: ingesteld, gekoppeld, met welk account en tot wanneer. Geen token. */
export async function alibabaStand(): Promise<AlibabaStand> {
  const rij = await kvGet<{ verzegeld?: string; verlooptOp?: string; account?: string | null }>(TOKEN_KEY).catch(() => null);
  const ontbreekt = alibabaOntbreekt();
  return { ingesteld: ontbreekt.length === 0, ontbreekt, gekoppeld: Boolean(rij?.verzegeld), account: rij?.account ?? null, verlooptOp: rij?.verlooptOp ?? null, terugAdres: alibabaTerugAdres() };
}

export async function ontkoppel(): Promise<void> {
  await kvDelete(TOKEN_KEY);
}
