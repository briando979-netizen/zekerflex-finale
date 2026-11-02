import { createSign, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// TransIP REST API v6 — mailboxes for ZekerFlex Mail and domain look-ups.
// The VPS may only send mail through TransIP (outbound 25/465/587 elsewhere is
// blocked), and zekerflex.com mail already lives in TransIP Email, so that is
// where ZekerFlex addresses are made. Auth: a key pair from the TransIP
// control panel; each token request is RSA-SHA512 signed and the key only
// works from the whitelisted server IP. Registering a domain creates an
// invoice: that is not in here, and only ever runs on an admin's click.
// ---------------------------------------------------------------------------

const BASE = "https://api.transip.nl/v6";

export function transipConfigured(): boolean {
  return Boolean(env.TRANSIP_LOGIN && env.TRANSIP_PRIVATE_KEY);
}

let cached: { token: string; until: number } | null = null;

/** .env.production keeps the PEM on one line with literal \n. */
const privateKeyPem = () => (env.TRANSIP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

async function token(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  if (!transipConfigured()) throw AppError.precondition("De koppeling met TransIP staat nog niet aan.");
  const body = JSON.stringify({
    login: env.TRANSIP_LOGIN,
    nonce: randomBytes(12).toString("hex"),
    read_only: false,
    expiration_time: "30 minutes",
    label: `zekerflex-${Date.now()}`,
    global_key: false,
  });
  let signature: string;
  try {
    signature = createSign("SHA512").update(body).sign(privateKeyPem(), "base64");
  } catch {
    throw AppError.precondition("De TransIP-sleutel op de server is geen geldige privésleutel.");
  }
  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Signature: signature },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !data.token) {
    logger.warn("transip auth failed", { status: res.status });
    throw AppError.upstream(`TransIP accepteert de sleutel niet${data.error ? `: ${data.error}` : ""}.`);
  }
  cached = { token: data.token, until: Date.now() + 25 * 60_000 };
  return data.token;
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T | undefined> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    if (res.status === 401) cached = null;
    const msg = `TransIP: ${(data as { error?: string } | undefined)?.error ?? `fout ${res.status}`}`;
    if (res.status === 404) throw AppError.notFound(msg);
    if (res.status === 409) throw AppError.conflict(msg);
    if (res.status === 400 || res.status === 406) throw AppError.validation(msg);
    throw AppError.upstream(msg);
  }
  return data as T | undefined;
}

export interface TransipMailbox {
  identifier: string;
  localPart: string;
  domain: string;
  status: string;
  isLocked: boolean;
  imapServer: string;
  imapPort: number;
  smtpServer: string;
  smtpPort: number;
  availableDiskSpace: number;
  usedDiskSpace: number;
  forwardTo: string;
  webmailUrl: string;
}

export interface TransipMailForward {
  id: number;
  localPart: string;
  domain: string;
  status: string;
  forwardTo: string;
}

export async function listMailboxes(domain: string): Promise<TransipMailbox[]> {
  const d = await call<{ mailboxes?: TransipMailbox[] }>("GET", `/email/${encodeURIComponent(domain)}/mailboxes`);
  return d?.mailboxes ?? [];
}

export async function listMailForwards(domain: string): Promise<TransipMailForward[]> {
  const d = await call<{ forwards?: TransipMailForward[] }>("GET", `/email/${encodeURIComponent(domain)}/mail-forwards`);
  return d?.forwards ?? [];
}

export async function createMailbox(domain: string, input: { localPart: string; password: string; maxDiskUsage: number }): Promise<void> {
  await call("POST", `/email/${encodeURIComponent(domain)}/mailboxes`, input);
}

export interface DomainAvailability {
  domainName: string;
  /** free | notfree | inyouraccount | unavailable | internalpull | internalpush */
  status: string;
  actions: string[];
}

export async function domainAvailability(name: string): Promise<DomainAvailability | null> {
  const d = await call<{ availability?: DomainAvailability }>("GET", `/domain-availability/${encodeURIComponent(name)}`);
  return d?.availability ?? null;
}
