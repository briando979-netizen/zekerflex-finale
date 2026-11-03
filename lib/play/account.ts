import { createSign } from "node:crypto";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Het Google-serviceaccount waarmee ZekerFlex apps in Google Play beheert.
// Eén account voor het hele platform: een rijschool nodigt het e-mailadres
// ervan uit in haar eigen Play Console (Gebruikers en rechten). De sleutel
// (JSON uit Google Cloud) zet de platformbeheerder in Admin → Google Play; hij
// staat verzegeld in de KV, nooit leesbaar terug. Toegangstokens (1 uur) worden
// per proces bewaard op globalThis: de serverbuild heeft meerdere modulekopieën.
// ---------------------------------------------------------------------------

const KV = "play:serviceaccount";
const DOEL = "google-play-serviceaccount";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id?: string;
}

interface Opgeslagen {
  email: string;
  projectId: string | null;
  sleutel: string; // verzegelde JSON
  ingesteldOp: string;
  door: string;
}

/** Leest en controleert de JSON-sleutel die Google Cloud geeft. */
export function leesSleutelbestand(tekst: string): ServiceAccount {
  let data: unknown;
  try {
    data = JSON.parse(tekst.trim());
  } catch {
    throw AppError.validation("Dit is geen JSON-bestand. Plak de volledige inhoud van het sleutelbestand uit Google Cloud.");
  }
  const d = data as Partial<Record<string, unknown>>;
  if (d.type !== "service_account") throw AppError.validation("Dit is geen sleutel van een serviceaccount (type moet service_account zijn).");
  const email = typeof d.client_email === "string" ? d.client_email : "";
  const sleutel = typeof d.private_key === "string" ? d.private_key : "";
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)) throw AppError.validation("Het e-mailadres van het serviceaccount ontbreekt of klopt niet.");
  if (!sleutel.includes("BEGIN PRIVATE KEY")) throw AppError.validation("De privésleutel ontbreekt in het bestand.");
  return {
    client_email: email,
    private_key: sleutel,
    token_uri: typeof d.token_uri === "string" && d.token_uri.startsWith("https://") ? d.token_uri : "https://oauth2.googleapis.com/token",
    ...(typeof d.project_id === "string" ? { project_id: d.project_id } : {}),
  };
}

export async function bewaarServiceAccount(sa: ServiceAccount, door: string): Promise<void> {
  const opslag: Opgeslagen = {
    email: sa.client_email,
    projectId: sa.project_id ?? null,
    sleutel: sealSecret(JSON.stringify(sa), DOEL),
    ingesteldOp: new Date().toISOString(),
    door,
  };
  await kvSet(KV, opslag);
  tokens().delete(sa.client_email);
}

export async function verwijderServiceAccount(): Promise<void> {
  await kvDelete(KV);
  tokens().clear();
}

/** Wat de beheerder en de rijschool mogen zien: het e-mailadres, nooit de sleutel. */
export async function serviceAccountInfo(): Promise<{ email: string; projectId: string | null; ingesteldOp: string; door: string } | null> {
  const o = await kvGet<Opgeslagen>(KV);
  return o ? { email: o.email, projectId: o.projectId, ingesteldOp: o.ingesteldOp, door: o.door } : null;
}

async function serviceAccount(): Promise<ServiceAccount | null> {
  const o = await kvGet<Opgeslagen>(KV);
  if (!o) return null;
  try {
    return JSON.parse(openSecret(o.sleutel, DOEL)) as ServiceAccount;
  } catch {
    // AUTH_SECRET gewisseld: de beheerder zet de sleutel opnieuw
    return null;
  }
}

type Token = { token: string; tot: number };
function tokens(): Map<string, Token> {
  const g = globalThis as typeof globalThis & { __zfPlayTokens?: Map<string, Token> };
  g.__zfPlayTokens ??= new Map();
  return g.__zfPlayTokens;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Een ondertekende JWT-vraag voor een toegangstoken (OAuth 2.0 voor serviceaccounts). */
export function jwtVoor(sa: ServiceAccount, nuSec: number): string {
  const kop = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: nuSec, exp: nuSec + 3600 }));
  const handtekening = createSign("RSA-SHA256").update(`${kop}.${claims}`).sign(sa.private_key);
  return `${kop}.${claims}.${b64url(handtekening)}`;
}

/** Een geldig toegangstoken voor de Google Play-API, of een nette fout als er (nog) geen sleutel is. */
export async function toegangstoken(): Promise<string> {
  const sa = await serviceAccount();
  if (!sa) throw AppError.precondition("ZekerFlex is nog niet gekoppeld aan Google Play. De beheerder van ZekerFlex zet dit aan in Admin → Google Play.");
  return tokenVoor(sa);
}

/** Vraagt (of hergebruikt) een toegangstoken voor dit serviceaccount; ook om een nieuwe sleutel te testen. */
export async function tokenVoor(sa: ServiceAccount): Promise<string> {
  const bewaard = tokens().get(sa.client_email);
  if (bewaard && bewaard.tot > Date.now() + 60_000) return bewaard.token;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwtVoor(sa, Math.floor(Date.now() / 1000)) }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    throw AppError.upstream(
      data.error === "invalid_grant"
        ? "Google weigert de sleutel van het serviceaccount (ingetrokken of verlopen). De beheerder van ZekerFlex zet een nieuwe in Admin → Google Play."
        : "Google gaf geen toegang. Probeer het zo opnieuw.",
    );
  }
  tokens().set(sa.client_email, { token: data.access_token, tot: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

export async function playIngesteld(): Promise<boolean> {
  return (await kvGet<Opgeslagen>(KV)) !== null;
}
