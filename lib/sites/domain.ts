import { createHmac } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { siteHostFrom } from "@/lib/sites/host-header";
import { domainKey, getSite, liveSiteOf, type LiveSite } from "@/lib/sites/store";
import type { DomainCheck, SiteDomain } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Een eigen domein voor een website die ZekerFlex host: bakkerjansen.nl in
// plaats van zekerflex.com/site/bakkerij-jansen.
//   1. koppelen: het bedrijf vult zijn domein in en krijgt de DNS-regels;
//   2. controleren: een TXT-regel met de code van déze site bewijst het
//      eigendom. Pas dan claimen we het domein (KV "site-host:<host>", wie eerst
//      komt) en mag Caddy er een certificaat voor halen (mayIssueCertificate);
//   3. actief: onze server antwoordt via https met deze site. Vanaf dan sturen
//      we /site/<naam> door naar het eigen domein, en mag Google het zien.
// Het domein staat onder een eigen sleutel (domainKey), los van de site, zodat
// het automatisch opslaan in de bouwer het nooit kan overschrijven.
// ---------------------------------------------------------------------------

const hostKey = (host: string) => `site-host:${host}`;

const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local", "internal", "lan", "home", "corp", "intranet"]);

const ownApex = (() => {
  try {
    return new URL(env.APP_BASE_URL).hostname.replace(/^www\./, "");
  } catch {
    return "zekerflex.com";
  }
})();
const isOwn = (host: string) => [ownApex, "zekerflex.com"].some((own) => host === own || host.endsWith(`.${own}`));

const notADomain = () => AppError.validation("Dit is geen domeinnaam. Vul alleen je domein in, bijvoorbeeld bakkerjansen.nl.");

/**
 * "https://WWW.Bakkerij.nl/contact" → { host: "www.bakkerij.nl", alias: "bakkerij.nl" }.
 * The address as typed is the one visitors use; for a plain domain or its www
 * form the other one comes along and redirects. A deeper subdomain has no alias.
 */
export function normalizeDomain(raw: string): { host: string; alias: string | null } {
  const s = raw.trim().toLowerCase();
  if (!s) throw notADomain();
  let hostname: string;
  try {
    hostname = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    throw notADomain();
  }
  const host = siteHostFrom(hostname);
  if (!host) throw notADomain();
  const labels = host.split(".");
  if (RESERVED_TLDS.has(labels[labels.length - 1] ?? "")) throw AppError.validation("Dit domein bestaat niet op internet. Vul het domein in dat bezoekers intypen.");
  if (isOwn(host)) throw AppError.validation("Een adres van ZekerFlex zelf kun je niet koppelen. Vul je eigen domein in.");
  if (host.startsWith("www.") && labels.length >= 3) return { host, alias: host.slice(4) };
  if (labels.length === 2) return { host, alias: `www.${host}` };
  return { host, alias: null };
}

/** The name without www: it carries the A/AAAA and TXT records (a CNAME is not allowed there). */
const baseOf = (d: Pick<SiteDomain, "host" | "alias">) => (d.host.startsWith("www.") && d.alias ? d.alias : d.host);
/** The www name, if this domain has one. */
const wwwOf = (d: Pick<SiteDomain, "host" | "alias">) => [d.host, d.alias].find((h) => h?.startsWith("www.")) ?? null;

/** The code the company puts in its DNS. Derived from the site id, so nothing to store. */
export function verificationCode(siteId: string): string {
  return createHmac("sha256", env.AUTH_SECRET ?? "dev-secret").update(`site-domain:${siteId}`).digest("hex").slice(0, 24);
}
export const verificationRecord = (siteId: string) => `zekerflex-site=${verificationCode(siteId)}`;

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "TXT";
  /** the full name, e.g. "www.bakkerjansen.nl" */
  name: string;
  /** what most providers want in the name field: "@", "www", "_zekerflex" */
  short: string;
  value: string;
  why: string;
}

/** Relative name for the provider's form, assuming the zone is the last two labels (true for .nl, .com, .be, .eu). */
function shortName(name: string): string {
  const labels = name.split(".");
  return labels.length <= 2 ? "@" : labels.slice(0, -2).join(".");
}

/** The DNS records the company sets at its domain provider. */
export function dnsRecords(siteId: string, d: Pick<SiteDomain, "host" | "alias">): DnsRecord[] {
  const base = baseOf(d);
  const www = wwwOf(d);
  const txtName = `_zekerflex.${base}`;
  return [
    { type: "A", name: base, short: shortName(base), value: env.SITES_IPV4, why: "Laat je domein naar ZekerFlex wijzen. Staat er al een A-regel naar een ander adres? Vervang die." },
    { type: "AAAA", name: base, short: shortName(base), value: env.SITES_IPV6, why: "Hetzelfde voor IPv6. Een oude AAAA-regel naar een ander adres moet weg." },
    ...(www ? [{ type: "CNAME" as const, name: www, short: shortName(www), value: base, why: "Zodat ook www werkt. Staat er voor www al een andere regel? Vervang die door deze." }] : []),
    { type: "TXT", name: txtName, short: shortName(txtName), value: verificationRecord(siteId), why: "Bewijst dat het domein van jou is. Alleen jij kunt deze regel zetten." },
  ];
}

export async function getDomain(siteId: string): Promise<SiteDomain | null> {
  return kvGet<SiteDomain>(domainKey(siteId)).catch(() => null);
}

async function audit(action: string, by: { userId: string }, siteId: string, summary: string): Promise<void> {
  await recordAudit({ category: "SALES", action, actorUserId: by.userId, summary, targetType: "site", targetId: siteId });
}

/** Link a domain (or switch to another one). Nothing is claimed until the TXT proof. */
export async function linkDomain(siteId: string, raw: string, by: { userId: string; name: string }): Promise<SiteDomain> {
  const { host, alias } = normalizeDomain(raw);
  const current = await getDomain(siteId);
  if (current?.host === host) return current;
  const owner = await kvGet<string>(hostKey(host));
  if (owner && owner !== siteId) throw AppError.conflict("Dit domein is al gekoppeld aan een andere website op ZekerFlex. Is het van jou? Neem dan contact met ons op.");
  if (current) await unlinkDomain(siteId, by);
  const domain: SiteDomain = { host, alias, addedAt: new Date().toISOString(), verifiedAt: null, activeAt: null, check: null };
  await kvSet(domainKey(siteId), domain);
  await audit("site.domain.linked", by, siteId, `Domein ${host} gekoppeld aan een website (nog te bewijzen)`);
  return domain;
}

/** Release the claims and forget the domain. The site stays online on /site/<naam>. */
export async function unlinkDomain(siteId: string, by: { userId: string; name: string }): Promise<void> {
  const d = await getDomain(siteId);
  if (!d) return;
  for (const host of [d.host, d.alias]) {
    if (host && (await kvGet<string>(hostKey(host))) === siteId) await kvDelete(hostKey(host));
  }
  await kvDelete(domainKey(siteId));
  await audit("site.domain.unlinked", by, siteId, `Domein ${d.host} losgekoppeld van een website`);
}

/** Claim both names for this site; first one wins, and a half claim is rolled back. */
async function claimHosts(siteId: string, d: SiteDomain): Promise<void> {
  const made: string[] = [];
  for (const host of [d.host, d.alias]) {
    if (!host) continue;
    try {
      await prisma.keyValueStore.create({ data: { key: hostKey(host), value: siteId } });
      made.push(host);
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      if ((await kvGet<string>(hostKey(host))) === siteId) continue;
      for (const h of made) await kvDelete(hostKey(h));
      throw AppError.conflict(`${host} is al gekoppeld aan een andere website op ZekerFlex. Is het van jou? Neem dan contact met ons op.`);
    }
  }
}

export interface DomainLookups {
  txt: (name: string) => Promise<string[][]>;
  a: (name: string) => Promise<string[]>;
  aaaa: (name: string) => Promise<string[]>;
  /** fetch https://<host>/.well-known/zekerflex-site through our own Caddy; the body, or null */
  https: (host: string) => Promise<string | null>;
}

const resolver = new Resolver({ timeout: 5000, tries: 2 });
const none = () => [] as never[];

/** GET /.well-known/zekerflex-site over TLS to our own Caddy (SITES_TLS_PROBE), with SNI = host and a checked certificate. */
function probeHttps(host: string): Promise<string | null> {
  const [probeHost = "caddy", probePort = "443"] = env.SITES_TLS_PROBE.split(":");
  return new Promise((resolve) => {
    const req = httpsRequest(
      { host: probeHost, port: Number(probePort), servername: host, path: "/.well-known/zekerflex-site", headers: { host }, timeout: 45_000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 2000) req.destroy();
        });
        res.on("end", () => resolve(res.statusCode === 200 ? body.trim() : null));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

export const dnsLookups: DomainLookups = {
  txt: (name) => resolver.resolveTxt(name).catch(none),
  a: (name) => resolver.resolve4(name).catch(none),
  aaaa: (name) => resolver.resolve6(name).catch(none),
  https: probeHttps,
};

const sameIp = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Check the DNS (and, once it is right, https) and remember the result. The
 * TXT proof claims the domain for this site; https makes it the site's address.
 */
export async function checkDomain(siteId: string, by: { userId: string; name: string }, lookups: DomainLookups = dnsLookups): Promise<SiteDomain> {
  const d = await getDomain(siteId);
  if (!d) throw AppError.notFound("Koppel eerst een domein.");
  const site = await getSite(siteId);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  const base = baseOf(d);
  const expected = verificationRecord(siteId);

  const txtRows = (await Promise.all([`_zekerflex.${base}`, base].map((n) => lookups.txt(n)))).flat();
  const txt = txtRows.some((chunks) => chunks.join("").trim() === expected);
  const pointsHere = async (name: string) => {
    const [v4, v6] = await Promise.all([lookups.a(name), lookups.aaaa(name)]);
    return { a: v4.length > 0 && v4.every((ip) => sameIp(ip, env.SITES_IPV4)), aaaa: v6.every((ip) => sameIp(ip, env.SITES_IPV6)) };
  };
  const main = await pointsHere(d.host);
  const alias = d.alias ? await pointsHere(d.alias) : { a: true, aaaa: true };

  let verifiedAt = d.verifiedAt;
  if (txt && !verifiedAt) {
    await claimHosts(siteId, d);
    verifiedAt = new Date().toISOString();
    await audit("site.domain.verified", by, siteId, `Eigendom van ${d.host} bewezen met een TXT-regel`);
  }
  const ready = Boolean(verifiedAt) && main.a && main.aaaa;
  const https = ready && site.liveBuild ? (await lookups.https(d.host)) === expected : false;
  const activeAt = https ? (d.activeAt ?? new Date().toISOString()) : null;
  if (activeAt && !d.activeAt) await audit("site.domain.active", by, siteId, `Website staat nu op https://${d.host}`);

  const problem = !verifiedAt
    ? "We vinden de TXT-regel nog niet. Zet hem bij je domeinprovider; het kan tot een uur duren voordat hij overal zichtbaar is."
    : !main.a
      ? `${d.host} wijst nog niet naar ZekerFlex. Zet de A-regel op ${env.SITES_IPV4} en haal andere A-regels weg.`
      : !main.aaaa
        ? `Er staat een AAAA-regel naar een ander adres. Verwijder die, of zet hem op ${env.SITES_IPV6}.`
        : !site.liveBuild
          ? "Publiceer je website eerst. Daarna maken we de beveiligde verbinding."
          : !https
            ? "De beveiligde verbinding (https) is nog niet klaar. Probeer het over een paar minuten opnieuw."
            : d.alias && !(alias.a && alias.aaaa)
              ? `Je website staat online. ${d.alias} wijst nog niet naar ZekerFlex; zet de ${d.alias.startsWith("www.") ? "CNAME" : "A"}-regel, dan werkt dat adres ook.`
              : null;
  const check: DomainCheck = { at: new Date().toISOString(), txt, a: main.a, aaaa: main.aaaa, alias: alias.a && alias.aaaa, https, problem };
  const next: SiteDomain = { ...d, verifiedAt, activeAt, check };
  await kvSet(domainKey(siteId), next);
  return next;
}

/** The live site behind an own domain, and the address it lives on; null when unknown, unproven or offline. */
export async function siteForHost(rawHost: string): Promise<{ live: LiveSite; primary: string } | null> {
  const host = siteHostFrom(rawHost);
  if (!host) return null;
  const siteId = await kvGet<string>(hostKey(host));
  if (!siteId) return null;
  const live = await liveSiteOf(await getSite(siteId));
  const d = live?.domein;
  if (!live || !d?.verifiedAt || (host !== d.host && host !== d.alias)) return null;
  return { live, primary: d.host };
}

/** Caddy's on-demand TLS "ask": only proven domains of a published site get a certificate. */
export async function mayIssueCertificate(host: string): Promise<boolean> {
  return Boolean(await siteForHost(host).catch(() => null));
}
