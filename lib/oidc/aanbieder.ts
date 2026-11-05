import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import type { Principal } from "@/lib/auth";
import { geheim, hash, maakSleutelpaar, pkceKlopt, splitsNaam, tekenJwt, type Sleutelpaar } from "@/lib/oidc/jwt";

// ---------------------------------------------------------------------------
// De OIDC-aanbieder: welke diensten mogen inloggen met ZekerFlex (clients),
// de sleutels (één keer gemaakt, in de KV), de autorisatiecodes (5 minuten,
// één keer te gebruiken) en de toegangstokens (1 uur). Alleen eigen diensten
// op de server staan erin; een client komt uit de omgeving, nooit uit een
// database of formulier.
// ---------------------------------------------------------------------------

const K_SLEUTELS = "oidc:sleutels";
const CODE_SEC = 5 * 60;
const TOKEN_SEC = 60 * 60;

export interface Client {
  id: string;
  naam: string;
  geheim: string;
  redirectUris: string[];
}

export const issuer = () => env.APP_BASE_URL.replace(/\/$/, "");
export const outlinePubliekeUrl = () => (env.OUTLINE_PUBLIC_URL ?? "").replace(/\/$/, "");

/** De diensten die met ZekerFlex mogen inloggen. */
export function clients(): Client[] {
  const uit: Client[] = [];
  if (env.OIDC_OUTLINE_SECRET && outlinePubliekeUrl()) {
    uit.push({ id: "outline", naam: "Kennisbank", geheim: env.OIDC_OUTLINE_SECRET, redirectUris: [`${outlinePubliekeUrl()}/auth/oidc.callback`] });
  }
  return uit;
}

export const clientVan = (id: string | null | undefined) => clients().find((c) => c.id === id) ?? null;

const gelijk = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Het sleutelpaar; de eerste keer gemaakt en bewaard. */
export async function sleutels(): Promise<Sleutelpaar> {
  const s = await kvGet<Sleutelpaar>(K_SLEUTELS);
  if (s?.privaat && s.publiek?.n) return s;
  const nieuw = maakSleutelpaar();
  await kvSet(K_SLEUTELS, nieuw);
  return nieuw;
}

export interface Autorisatie {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/** Controleert een autorisatieverzoek; gooit een nette fout bij een verkeerde client of redirect. */
export function leesAutorisatie(q: URLSearchParams): { client: Client; a: Autorisatie } {
  const client = clientVan(q.get("client_id"));
  if (!client) throw AppError.validation("Onbekende dienst (client_id).");
  const redirectUri = q.get("redirect_uri") ?? "";
  if (!client.redirectUris.includes(redirectUri)) throw AppError.validation("De terugkeerlink (redirect_uri) hoort niet bij deze dienst.");
  if (q.get("response_type") !== "code") throw AppError.validation("Alleen response_type=code wordt ondersteund.");
  const scope = q.get("scope") ?? "openid";
  if (!scope.split(/\s+/).includes("openid")) throw AppError.validation("De scope openid ontbreekt.");
  return {
    client,
    a: { clientId: client.id, redirectUri, scope, state: q.get("state") ?? "", nonce: q.get("nonce") ?? "", codeChallenge: q.get("code_challenge") ?? "", codeChallengeMethod: q.get("code_challenge_method") ?? "" },
  };
}

interface CodeRecord extends Autorisatie {
  userId: string;
  exp: number;
}

/** Een autorisatiecode voor deze gebruiker en dienst (5 min, één keer). */
export async function maakCode(p: Principal, a: Autorisatie): Promise<string> {
  const code = geheim(32);
  await kvSet(`oidc:code:${hash(code)}`, { ...a, userId: p.userId, exp: Date.now() + CODE_SEC * 1000 } satisfies CodeRecord);
  return code;
}

export interface Tokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  id_token: string;
  scope: string;
}

/** De code inwisselen (token-endpoint). Controleert client, redirect, PKCE en vervaltijd. */
export async function wisselCode(i: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier?: string | undefined }, gebruiker: (userId: string) => Promise<Principal | null>): Promise<Tokens> {
  const client = clientVan(i.clientId);
  if (!client || !gelijk(client.geheim, i.clientSecret)) throw AppError.unauthenticated("Dienst of geheim klopt niet.");
  const sleutel = `oidc:code:${hash(i.code)}`;
  const rec = await kvGet<CodeRecord>(sleutel);
  await kvDelete(sleutel); // één keer, ook bij een fout
  if (!rec || rec.exp < Date.now()) throw AppError.validation("De code is verlopen of al gebruikt.");
  if (rec.clientId !== client.id || rec.redirectUri !== i.redirectUri) throw AppError.validation("De code hoort niet bij dit verzoek.");
  if (!pkceKlopt(i.codeVerifier, rec.codeChallenge, rec.codeChallengeMethod)) throw AppError.validation("PKCE-controle mislukt.");
  const p = await gebruiker(rec.userId);
  if (!p) throw AppError.validation("Dit account bestaat niet meer.");
  const nu = Math.floor(Date.now() / 1000);
  const s = await sleutels();
  const idToken = tekenJwt(s, { iss: issuer(), sub: p.userId, aud: client.id, iat: nu, exp: nu + TOKEN_SEC, auth_time: nu, ...(rec.nonce ? { nonce: rec.nonce } : {}), ...claimsVoor(p, rec.scope) });
  const accessToken = geheim(32);
  await kvSet(`oidc:toegang:${hash(accessToken)}`, { userId: p.userId, clientId: client.id, scope: rec.scope, exp: Date.now() + TOKEN_SEC * 1000 });
  return { access_token: accessToken, token_type: "Bearer", expires_in: TOKEN_SEC, id_token: idToken, scope: rec.scope };
}

/** De claims die bij de scopes horen (profile, email). */
export function claimsVoor(p: Principal, scope: string): Record<string, unknown> {
  const scopes = scope.split(/\s+/);
  const uit: Record<string, unknown> = {};
  if (scopes.includes("email")) {
    uit.email = p.email;
    uit.email_verified = Boolean(p.emailVerifiedAt);
  }
  if (scopes.includes("profile")) {
    const { voornaam, achternaam } = splitsNaam(p.fullName);
    uit.name = p.fullName;
    uit.given_name = voornaam;
    uit.family_name = achternaam;
    uit.preferred_username = p.email;
  }
  return uit;
}

/** De gebruiker achter een toegangstoken (userinfo), of null. */
export async function gebruikerVanToken(bearer: string | null): Promise<{ userId: string; scope: string } | null> {
  if (!bearer) return null;
  const rec = await kvGet<{ userId: string; scope: string; exp: number }>(`oidc:toegang:${hash(bearer)}`);
  return rec && rec.exp > Date.now() ? { userId: rec.userId, scope: rec.scope } : null;
}
