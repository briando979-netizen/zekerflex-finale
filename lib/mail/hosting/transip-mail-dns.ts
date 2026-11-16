// De DNS-regels voor TransIP E-mail op een domein (16 nov 2026: zakelijke e-mail op het eigen domein van een klant).
// Overgenomen van zekerflex.com zelf, waar de mail al bij TransIP staat (openbare DNS, gemeten 16 nov): MX, SPF, de drie
// DKIM-verwijzingen van TransIP en een rustige DMARC. Puur bestand; addDnsEntry (transip.ts) zet ze één voor één en slaat
// een regel over die er al staat. Alleen voor een domein in het TransIP-account van ZekerFlex (gekocht of verhuisd).

import type { DnsRecord } from "@/lib/mail/hosting/dns-record";

export const TRANSIP_MAIL_DNS: readonly DnsRecord[] = [
  { name: "@", expire: 3600, type: "MX", content: "10 mx.transip.email." },
  { name: "@", expire: 3600, type: "TXT", content: "v=spf1 include:_spf.transip.email ~all" },
  { name: "transip-A._domainkey", expire: 3600, type: "CNAME", content: "_dkim-A.transip.email." },
  { name: "transip-B._domainkey", expire: 3600, type: "CNAME", content: "_dkim-B.transip.email." },
  { name: "transip-C._domainkey", expire: 3600, type: "CNAME", content: "_dkim-C.transip.email." },
  { name: "_dmarc", expire: 3600, type: "TXT", content: "v=DMARC1; p=none" },
];
