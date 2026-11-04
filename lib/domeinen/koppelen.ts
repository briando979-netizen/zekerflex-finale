import { env } from "@/lib/env";
import { getDomain, linkRegisteredDomain } from "@/lib/sites/domain";
import { siteOfTenant } from "@/lib/sites/store";
import type { TransipDnsEntry } from "@/lib/mail/hosting/transip";

// Een domeinnaam die ZekerFlex voor een bedrijf vastlegt, komt meteen op de
// website van dat bedrijf (de bouwer; de winkel uit de Studio is dezelfde site).
// Wij houden de DNS, dus een TXT-bewijs is niet nodig (linkRegisteredDomain in
// lib/sites/domain.ts). Een ander eigen domein dat al op de site staat, laten we staan.

export type Koppeling = { soort: "gekoppeld" } | { soort: "geen-site" } | { soort: "ander-domein"; host: string } | { soort: "fout"; melding: string };

export async function koppelAanSite(tenantId: string, domein: string, door: { userId: string; name: string }): Promise<Koppeling> {
  const site = await siteOfTenant(tenantId);
  if (!site) return { soort: "geen-site" };
  if (await linkRegisteredDomain(site.id, domein, door)) return { soort: "gekoppeld" };
  return { soort: "ander-domein", host: (await getDomain(site.id))?.host ?? "" };
}

/** De namen die nu op de website van dit bedrijf staan (het domein en de www-vorm). */
export async function domeinenOpWebsite(tenantId: string): Promise<string[]> {
  const site = await siteOfTenant(tenantId).catch(() => null);
  const d = site ? await getDomain(site.id) : null;
  return d ? [d.host, d.alias].filter((h): h is string => Boolean(h)) : [];
}

/** De DNS-regels waarmee een nieuw domein naar onze server wijst: het domein zelf (IPv4 en IPv6) en www. */
export function dnsVoorWebsite(domein: string): TransipDnsEntry[] {
  return [
    { name: "@", expire: 3600, type: "A", content: env.SITES_IPV4 },
    { name: "@", expire: 3600, type: "AAAA", content: env.SITES_IPV6 },
    { name: "www", expire: 3600, type: "CNAME", content: `${domein}.` },
  ];
}

/** Korte regel voor de notitie in Admin → Domeinen. */
export function koppelNotitie(k: Koppeling): string {
  switch (k.soort) {
    case "gekoppeld":
      return "Op de website van de klant gezet.";
    case "geen-site":
      return "Klant heeft nog geen website; die koppelt de naam later zelf.";
    case "ander-domein":
      return `De website gebruikt al ${k.host}; niet vervangen.`;
    case "fout":
      return `Koppelen aan de website lukte niet: ${k.melding}`;
  }
}

/** Wat de klant in de mail leest over zijn website. */
export function koppelUitleg(domein: string, k: Koppeling): string {
  switch (k.soort) {
    case "gekoppeld":
      return `We hebben hem meteen aan je website gekoppeld. Zodra de DNS overal is bijgewerkt (meestal binnen een paar uur), staat je website op https://${domein}. Open daarna in de websitebouwer de tab Domein en klik op Controleer: dan sturen we bezoekers voortaan naar ${domein}.`;
    case "geen-site":
      return `Maak je website in ZekerFlex (Website → Bouwer). Daarna klik je bij Jouw domeinnamen op "Koppel aan mijn website" en staat hij erop.`;
    case "ander-domein":
      return `Je website gebruikt nu ${k.host}. Wil je liever ${domein}? Koppel ${k.host} los in de websitebouwer (tab Domein) en klik daarna bij Jouw domeinnamen op "Koppel aan mijn website".`;
    case "fout":
      return "We koppelen hem aan je website of webshop; je hoort het als dat klaar is.";
  }
}
