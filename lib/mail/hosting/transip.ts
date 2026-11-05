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
// invoice: registerDomain only ever runs on an admin's click (Admin → Domeinen).
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

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T | undefined> {
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

export interface TransipDnsEntry {
  /** relative to the domain: "@" for the domain itself, "www" */
  name: string;
  /** TTL in seconds */
  expire: number;
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT";
  content: string;
}

/** Een whois-contact zoals TransIP het kent (houder, beheerder, technisch). */
export interface TransipContact {
  type: "registrant" | "administrative" | "technical";
  firstName: string;
  lastName: string;
  companyName: string;
  companyKvk: string;
  companyType: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  phoneNumber: string;
  faxNumber: string;
  email: string;
  country: string;
}

/**
 * Register a domain in the ZekerFlex TransIP account, with these DNS records.
 * Without contacts TransIP uses the account defaults (ZekerFlex as holder);
 * lib/domeinen/houder.ts passes the customer as holder. This creates a TransIP
 * invoice to ZekerFlex: only after the customer paid (lib/domeinen/bestelling.ts legVast).
 */
export async function registerDomain(domainName: string, dnsEntries: TransipDnsEntry[], contacts?: TransipContact[]): Promise<void> {
  await call("POST", "/domains", { domainName, dnsEntries, ...(contacts && contacts.length > 0 ? { contacts } : {}) });
}

/** De contacten (houder, beheerder, technisch) van een domein in ons account. */
export async function domainContacts(domainName: string): Promise<TransipContact[]> {
  const d = await call<{ contacts?: TransipContact[] }>("GET", `/domains/${encodeURIComponent(domainName)}/contacts`);
  return d?.contacts ?? [];
}

export interface TransipDomain {
  name: string;
  /** de verhuiscode (token) van het register; alleen naar de klant via lib/domeinen/behoud.ts */
  authCode?: string;
  isTransferLocked?: boolean;
  supportsLocking?: boolean;
  hasActionRunning?: boolean;
  status?: string;
  /** "2026-11-05" */
  registrationDate?: string;
  /** de datum waarop TransIP de naam verlengt (en ZekerFlex factureert) */
  renewalDate?: string;
  /** "" | "signed" | "cancelled" */
  cancellationStatus?: string;
  cancellationDate?: string;
}

/**
 * Het verhuisslot aan of uit. Dicht = de naam kan niet zonder ons naar een
 * andere partij. TransIP wil het hele domeinobject terug (PUT), dus eerst ophalen.
 */
export async function setTransferLock(domainName: string, locked: boolean): Promise<void> {
  const d = await call<{ domain?: TransipDomain }>("GET", `/domains/${encodeURIComponent(domainName)}`);
  if (!d?.domain) throw AppError.notFound(`TransIP: ${domainName} staat niet in het account`);
  if (d.domain.supportsLocking === false || d.domain.isTransferLocked === locked) return;
  await call("PUT", `/domains/${encodeURIComponent(domainName)}`, { domain: { ...d.domain, isTransferLocked: locked } });
}

export interface TransipTld {
  name: string;
  /** inkoop eerste jaar, centen */
  price: number;
  /** inkoop verlenging, centen */
  recurringPrice: number;
  cancelTimeFrame?: number;
}

/** De extensies van het account met de inkoopprijzen (voor de margebewaking). */
export async function listTlds(): Promise<TransipTld[]> {
  const d = await call<{ tlds?: TransipTld[] }>("GET", "/tlds");
  return d?.tlds ?? [];
}

/** Een domein in het ZekerFlex-account, met zijn verlengdatum. */
export async function domainInfo(domainName: string): Promise<TransipDomain | null> {
  const d = await call<{ domain?: TransipDomain }>("GET", `/domains/${encodeURIComponent(domainName)}`);
  return d?.domain ?? null;
}

/**
 * Zeg een domein op aan het eind van de lopende periode (endTime "end"): de
 * naam blijft werken tot de verlengdatum en wordt dan niet verlengd. Alleen
 * vanuit lib/domeinen/verlengen.ts (klant betaalde niet, of wil niet verlengen).
 */
export async function cancelDomain(domainName: string): Promise<void> {
  await call("DELETE", `/domains/${encodeURIComponent(domainName)}`, { endTime: "end" });
}
