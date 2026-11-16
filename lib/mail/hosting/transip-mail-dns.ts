// De DNS-regels voor TransIP E-mail op een domein (16 nov 2026: zakelijke e-mail op het eigen domein van een klant).
// Overgenomen van zekerflex.com zelf, waar de mail al bij TransIP staat (openbare DNS, gemeten 16 nov): MX, SPF, de drie
// DKIM-verwijzingen van TransIP en een rustige DMARC. Puur bestand; addDnsEntry (transip.ts) zet ze één voor één.
// Alleen voor een domein in het TransIP-account van ZekerFlex (gekocht of verhuisd).
//
// Een VERHUISD domein kan al mail hebben bij een andere aanbieder (Google, Microsoft …). addDnsEntry voegt toe naast wat er
// staat: een tweede MX splitst de binnenkomende mail, een tweede SPF geeft een permerror (mail van de klant in spam). Daarom
// eerst mailDnsPlan op de bestaande regels: staat er mail van een ander, dan stoppen met een melding voor de beheerder; een
// bestaande DMARC blijft staan; wat er al goed staat, wordt niet nog eens gezet (da, 16 nov).

import { zelfdeRecord, type DnsRecord } from "@/lib/mail/hosting/dns-record";

export const TRANSIP_MAIL_DNS: readonly DnsRecord[] = [
  { name: "@", expire: 3600, type: "MX", content: "10 mx.transip.email." },
  { name: "@", expire: 3600, type: "TXT", content: "v=spf1 include:_spf.transip.email ~all" },
  { name: "transip-A._domainkey", expire: 3600, type: "CNAME", content: "_dkim-A.transip.email." },
  { name: "transip-B._domainkey", expire: 3600, type: "CNAME", content: "_dkim-B.transip.email." },
  { name: "transip-C._domainkey", expire: 3600, type: "CNAME", content: "_dkim-C.transip.email." },
  { name: "_dmarc", expire: 3600, type: "TXT", content: "v=DMARC1; p=none" },
];

export interface BestaandRecord {
  name: string;
  type: string;
  content: string;
}

const zonderAanhaling = (s: string) => s.trim().replace(/^"(.*)"$/, "$1");
const isApex = (r: BestaandRecord) => r.name.trim() === "@" || r.name.trim() === "";
const isSpf = (r: BestaandRecord) => r.type.toUpperCase() === "TXT" && /^v=spf1\b/i.test(zonderAanhaling(r.content));

/**
 * Wat er op een domein nog moet voor TransIP E-mail, of waarom het niet kan. `conflict` = er staat al mail bij een andere
 * aanbieder (een MX die niet op transip.email wijst, een SPF zonder TransIP, of een DKIM-naam die ergens anders heen wijst):
 * dan niets zetten. `toevoegen` = de regels die nog ontbreken (niets dubbel; een bestaande DMARC blijft zoals hij is).
 */
export function mailDnsPlan(bestaand: readonly BestaandRecord[]): { conflict: string | null; toevoegen: DnsRecord[] } {
  const mx = bestaand.filter((r) => isApex(r) && r.type.toUpperCase() === "MX");
  const vreemdeMx = mx.find((r) => !/transip\.email\.?$/i.test(r.content.trim()));
  if (vreemdeMx) {
    return { conflict: `Dit domein heeft al mail bij een andere aanbieder (MX: ${vreemdeMx.content.trim()}). Vraag de klant eerst of die mail mag verhuizen.`, toevoegen: [] };
  }
  const spf = bestaand.filter((r) => isApex(r) && isSpf(r));
  const vreemdeSpf = spf.find((r) => !/include:_spf\.transip\.email/i.test(r.content));
  if (vreemdeSpf) {
    return {
      conflict: `Dit domein heeft al een SPF-regel voor een andere aanbieder (${zonderAanhaling(vreemdeSpf.content)}). Vraag de klant eerst of die mail mag verhuizen.`,
      toevoegen: [],
    };
  }
  for (const r of TRANSIP_MAIL_DNS.filter((x) => x.type === "CNAME")) {
    const zelfde = bestaand.find((b) => b.name.trim().toLowerCase() === r.name.toLowerCase());
    if (zelfde && !zelfdeRecord(zelfde, r)) {
      return { conflict: `Dit domein gebruikt ${r.name} al voor iets anders (${zelfde.type} ${zelfde.content.trim()}). Kijk dit eerst na.`, toevoegen: [] };
    }
  }
  const heeftDmarc = bestaand.some((b) => b.name.trim().toLowerCase() === "_dmarc");
  const toevoegen = TRANSIP_MAIL_DNS.filter((r) => {
    if (r.type === "MX") return mx.length === 0; // een MX naar TransIP staat er al
    if (r.type === "TXT" && r.name === "@") return spf.length === 0; // een SPF met TransIP staat er al
    if (r.name === "_dmarc") return !heeftDmarc; // een bestaande DMARC laten we staan
    return !bestaand.some((b) => zelfdeRecord(b, r));
  });
  return { conflict: null, toevoegen };
}
