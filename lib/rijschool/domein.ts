import { createHmac } from "node:crypto";
import { Prisma, type Rijschool } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { SITE_HOST_HEADER, siteHostFrom } from "@/lib/sites/host-header";
import { dnsLookups, normalizeDomain, type DnsRecord, type DomainLookups } from "@/lib/sites/domain";

// ---------------------------------------------------------------------------
// Een eigen domein voor de website en app van een rijschool: rijschooljansen.nl
// in plaats van zekerflex.com/rijschool/jansen. Zelfde stappen als bij de
// websites van klanten (lib/sites/domain.ts):
//   1. koppelen: de rijschool vult haar domein in en krijgt de DNS-regels;
//   2. controleren: een TXT-regel met de code van déze rijschool bewijst het
//      eigendom. Pas dan claimen we het domein, onder dezelfde sleutels als de
//      websites ("site-host:<host>", waarde "rijschool:<id>"), zodat één domein
//      nooit tegelijk bij een website en een rijschool hoort;
//   3. actief: onze server antwoordt via https met deze rijschool. Vanaf dan is
//      het domein het hoofdadres (canonical) van haar website.
// De middleware vraagt via /api/rijschool/domein welke rijschool bij een domein
// hoort en zet de paden om (lib/rijschool/domein-pad.ts).
// ---------------------------------------------------------------------------

export interface RijschoolDomein {
  host: string;
  alias: string | null;
  aangevraagd: string;
  geverifieerd: string | null;
  actief: string | null;
  controle: { at: string; txt: boolean; a: boolean; aaaa: boolean; alias: boolean; https: boolean; probleem: string | null } | null;
}

const domeinKey = (rijschoolId: string) => `rijschool-domein:${rijschoolId}`;
/** Gedeeld met de websites (lib/sites/domain.ts): wie eerst claimt, heeft het domein. */
const hostKey = (host: string) => `site-host:${host}`;
const claim = (rijschoolId: string) => `rijschool:${rijschoolId}`;

/** De code die de rijschool in haar DNS zet; afgeleid van het id, dus niets op te slaan. */
export function verificatieRegel(rijschoolId: string): string {
  const code = createHmac("sha256", env.AUTH_SECRET ?? "dev-secret").update(`rijschool-domein:${rijschoolId}`).digest("hex").slice(0, 24);
  return `zekerflex-rijschool=${code}`;
}

const basisVan = (d: Pick<RijschoolDomein, "host" | "alias">) => (d.host.startsWith("www.") && d.alias ? d.alias : d.host);
const wwwVan = (d: Pick<RijschoolDomein, "host" | "alias">) => [d.host, d.alias].find((h) => h?.startsWith("www.")) ?? null;
function kortNaam(naam: string): string {
  const delen = naam.split(".");
  return delen.length <= 2 ? "@" : delen.slice(0, -2).join(".");
}

/** De DNS-regels die de rijschool bij haar domeinprovider zet. */
export function dnsRegels(rijschoolId: string, d: Pick<RijschoolDomein, "host" | "alias">): DnsRecord[] {
  const basis = basisVan(d);
  const www = wwwVan(d);
  const txt = `_zekerflex.${basis}`;
  return [
    { type: "A", name: basis, short: kortNaam(basis), value: env.SITES_IPV4, why: "Laat je domein naar ZekerFlex wijzen. Staat er al een A-regel naar een ander adres? Vervang die." },
    { type: "AAAA", name: basis, short: kortNaam(basis), value: env.SITES_IPV6, why: "Hetzelfde voor IPv6. Een oude AAAA-regel naar een ander adres moet weg." },
    ...(www ? [{ type: "CNAME" as const, name: www, short: kortNaam(www), value: basis, why: "Zodat ook www werkt. Staat er voor www al een andere regel? Vervang die door deze." }] : []),
    { type: "TXT", name: txt, short: kortNaam(txt), value: verificatieRegel(rijschoolId), why: "Bewijst dat het domein van jou is. Alleen jij kunt deze regel zetten." },
  ];
}

export async function domeinVan(rijschoolId: string): Promise<RijschoolDomein | null> {
  return kvGet<RijschoolDomein>(domeinKey(rijschoolId)).catch(() => null);
}

async function audit(action: string, by: { userId: string }, r: Pick<Rijschool, "id">, summary: string): Promise<void> {
  await recordAudit({ category: "SALES", action, actorUserId: by.userId, summary, targetType: "rijschool", targetId: r.id });
}

/** Koppel een domein (of wissel van domein). Er wordt pas iets geclaimd na het TXT-bewijs. */
export async function koppelDomein(r: Pick<Rijschool, "id">, raw: string, by: { userId: string }): Promise<RijschoolDomein> {
  const { host, alias } = normalizeDomain(raw);
  const huidig = await domeinVan(r.id);
  if (huidig?.host === host) return huidig;
  const eigenaar = await kvGet<string>(hostKey(host));
  if (eigenaar && eigenaar !== claim(r.id)) throw AppError.conflict("Dit domein is al gekoppeld aan een andere website of rijschool op ZekerFlex. Is het van jou? Neem dan contact met ons op.");
  if (huidig) await ontkoppelDomein(r, by);
  const d: RijschoolDomein = { host, alias, aangevraagd: new Date().toISOString(), geverifieerd: null, actief: null, controle: null };
  await kvSet(domeinKey(r.id), d);
  await audit("rijschool.domein.gekoppeld", by, r, `Domein ${host} gekoppeld aan een rijschool (nog te bewijzen)`);
  return d;
}

/** Laat het domein los. De website blijft gewoon bereikbaar op zekerflex.com/rijschool/<naam>. */
export async function ontkoppelDomein(r: Pick<Rijschool, "id">, by: { userId: string }): Promise<void> {
  const d = await domeinVan(r.id);
  if (!d) return;
  for (const host of [d.host, d.alias]) {
    if (host && (await kvGet<string>(hostKey(host))) === claim(r.id)) await kvDelete(hostKey(host));
  }
  await kvDelete(domeinKey(r.id));
  await audit("rijschool.domein.ontkoppeld", by, r, `Domein ${d.host} losgekoppeld van een rijschool`);
}

/** Beide namen claimen; wie eerst is, heeft het domein. Een halve claim wordt teruggedraaid. */
async function claimHosts(r: Pick<Rijschool, "id">, d: RijschoolDomein): Promise<void> {
  const gemaakt: string[] = [];
  for (const host of [d.host, d.alias]) {
    if (!host) continue;
    try {
      await prisma.keyValueStore.create({ data: { key: hostKey(host), value: claim(r.id) } });
      gemaakt.push(host);
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      if ((await kvGet<string>(hostKey(host))) === claim(r.id)) continue;
      for (const h of gemaakt) await kvDelete(hostKey(h));
      throw AppError.conflict(`${host} is al gekoppeld aan een andere website of rijschool op ZekerFlex. Is het van jou? Neem dan contact met ons op.`);
    }
  }
}

const zelfdeIp = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Controleer de DNS (en daarna https) en onthoud de uitkomst. */
export async function controleerDomein(r: Pick<Rijschool, "id" | "online">, by: { userId: string }, lookups: DomainLookups = dnsLookups): Promise<RijschoolDomein> {
  const d = await domeinVan(r.id);
  if (!d) throw AppError.notFound("Vul eerst je domein in.");
  const basis = basisVan(d);
  const verwacht = verificatieRegel(r.id);

  const txtRijen = (await Promise.all([`_zekerflex.${basis}`, basis].map((n) => lookups.txt(n)))).flat();
  const txt = txtRijen.some((stukken) => stukken.join("").trim() === verwacht);
  const wijstHier = async (naam: string) => {
    const [v4, v6] = await Promise.all([lookups.a(naam), lookups.aaaa(naam)]);
    return { a: v4.length > 0 && v4.every((ip) => zelfdeIp(ip, env.SITES_IPV4)), aaaa: v6.every((ip) => zelfdeIp(ip, env.SITES_IPV6)) };
  };
  const hoofd = await wijstHier(d.host);
  const alias = d.alias ? await wijstHier(d.alias) : { a: true, aaaa: true };

  let geverifieerd = d.geverifieerd;
  if (txt && !geverifieerd) {
    await claimHosts(r, d);
    geverifieerd = new Date().toISOString();
    await audit("rijschool.domein.bewezen", by, r, `Eigendom van ${d.host} bewezen met een TXT-regel`);
  }
  const klaar = Boolean(geverifieerd) && hoofd.a && hoofd.aaaa;
  const https = klaar ? (await lookups.https(d.host)) === verwacht : false;
  const actief = https ? (d.actief ?? new Date().toISOString()) : null;
  if (actief && !d.actief) await audit("rijschool.domein.actief", by, r, `Rijschool staat nu op https://${d.host}`);

  const probleem = !geverifieerd
    ? "We vinden de TXT-regel nog niet. Zet hem bij je domeinprovider; het kan tot een uur duren voordat hij overal zichtbaar is."
    : !hoofd.a
      ? `${d.host} wijst nog niet naar ZekerFlex. Zet de A-regel op ${env.SITES_IPV4} en haal andere A-regels weg.`
      : !hoofd.aaaa
        ? `Er staat een AAAA-regel naar een ander adres. Verwijder die, of zet hem op ${env.SITES_IPV6}.`
        : !https
          ? "De beveiligde verbinding (https) is nog niet klaar. Probeer het over een paar minuten opnieuw."
          : d.alias && !(alias.a && alias.aaaa)
            ? `Je website staat online op ${d.host}. ${d.alias} wijst nog niet naar ZekerFlex; zet de ${d.alias.startsWith("www.") ? "CNAME" : "A"}-regel, dan werkt dat adres ook.`
            : !r.online
              ? "Je domein werkt. Zet je website nog online (Instellingen), dan kan iedereen hem bezoeken."
              : null;
  const volgende: RijschoolDomein = { ...d, geverifieerd, actief, controle: { at: new Date().toISOString(), txt, a: hoofd.a, aaaa: hoofd.aaaa, alias: alias.a && alias.aaaa, https, probleem } };
  await kvSet(domeinKey(r.id), volgende);
  return volgende;
}

export interface RijschoolOpDomein {
  /** intern; de openbare route geeft het id niet terug */
  id: string;
  slug: string;
  online: boolean;
  /** het adres dat de rijschool koos; de andere vorm (www of zonder) stuurt daarheen door */
  hoofd: string;
}

/** De rijschool achter een eigen domein; null als het onbekend of nog niet bewezen is. */
export async function rijschoolVoorHost(raw: string): Promise<RijschoolOpDomein | null> {
  const host = siteHostFrom(raw);
  if (!host) return null;
  const waarde = await kvGet<string>(hostKey(host));
  if (!waarde?.startsWith("rijschool:")) return null;
  const id = waarde.slice("rijschool:".length);
  const [r, d] = await Promise.all([prisma.rijschool.findUnique({ where: { id }, select: { slug: true, online: true } }), domeinVan(id)]);
  if (!r || !d?.geverifieerd || (host !== d.host && host !== d.alias)) return null;
  return { id, slug: r.slug, online: r.online, hoofd: d.host };
}

/** Caddy's "ask" voor een certificaat: alleen een bewezen domein van een rijschool. */
export async function rijschoolMagCertificaat(host: string): Promise<boolean> {
  return Boolean(await rijschoolVoorHost(host).catch(() => null));
}

/** Het hoofdadres voor zoekmachines: het eigen domein zodra dat actief is, anders zekerflex.com. */
export async function actiefDomein(rijschoolId: string): Promise<string | null> {
  const d = await domeinVan(rijschoolId);
  return d?.actief ? d.host : null;
}

/** Het openbare adres van de website: https://<eigen domein> als dat actief is, anders null (dan geldt zekerflex.com). */
export async function eigenAdres(rijschoolId: string): Promise<string | null> {
  const host = await actiefDomein(rijschoolId).catch(() => null);
  return host ? `https://${host}` : null;
}

/**
 * Het adres waarop deze bezoeker de rijschool gebruikt: https://<eigen domein>
 * als het verzoek via dat domein binnenkwam (Caddy zet de kop), anders null
 * (dan zekerflex.com/rijschool/<naam>). De inlog-cookie hoort bij dat adres,
 * dus terug na iDEAL moet ook daarheen.
 */
export async function adresVanVerzoek(request: Request, r: Pick<Rijschool, "id">): Promise<string | null> {
  const host = siteHostFrom(request.headers.get(SITE_HOST_HEADER));
  if (!host) return null;
  const op = await rijschoolVoorHost(host).catch(() => null);
  return op?.id === r.id ? `https://${op.hoofd}` : null;
}

/** Het actieve eigen domein van de rijschool met deze naam (slug), voor links in mails. */
export async function eigenAdresVoorSlug(slug: string): Promise<string | null> {
  const r = await prisma.rijschool.findUnique({ where: { slug }, select: { id: true } });
  return r ? eigenAdres(r.id) : null;
}
