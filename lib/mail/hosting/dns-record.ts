// Pure controle van één DNS-record voor de TransIP-koppeling (addDnsEntry in transip.ts).
// Geen imports: zo is het zonder netwerk of sleutels te testen.

export const DNS_TYPES = ["TXT", "CNAME", "A", "AAAA", "MX"] as const;
export type DnsType = (typeof DNS_TYPES)[number];

export interface DnsRecord {
  /** relatief aan het domein: "@" voor het domein zelf, "_dmarc", "www" */
  name: string;
  /** TTL in seconden */
  expire: number;
  type: DnsType;
  content: string;
}

export type DnsRecordUitslag = { ok: true; record: DnsRecord } | { ok: false; reden: string };

const DOMEIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const NAAM = /^(@|\*|[A-Za-z0-9_*]([A-Za-z0-9_.*-]{0,251}[A-Za-z0-9_*])?)$/;
// eslint-disable-next-line no-control-regex
const STUURTEKEN = /[\x00-\x1f\x7f]/;

export function geldigDomein(domein: string): boolean {
  return DOMEIN.test(domein);
}

export function valideerDnsRecord(invoer: { name: unknown; expire?: unknown; type: unknown; content: unknown }): DnsRecordUitslag {
  const name = typeof invoer.name === "string" ? invoer.name.trim() : "";
  if (!name) return { ok: false, reden: "De naam van het record is leeg." };
  if (!NAAM.test(name)) return { ok: false, reden: "De naam van het record is ongeldig." };

  const type = typeof invoer.type === "string" ? invoer.type.trim().toUpperCase() : "";
  if (!(DNS_TYPES as readonly string[]).includes(type)) return { ok: false, reden: "Dit recordtype is niet toegestaan (alleen TXT, CNAME, A, AAAA en MX)." };

  const content = typeof invoer.content === "string" ? invoer.content.trim() : "";
  if (!content) return { ok: false, reden: "De inhoud van het record is leeg." };
  if (content.length > 2048 || STUURTEKEN.test(content)) return { ok: false, reden: "De inhoud van het record is ongeldig." };

  const expire = invoer.expire === undefined ? 3600 : invoer.expire;
  if (typeof expire !== "number" || !Number.isInteger(expire) || expire < 60 || expire > 86_400) {
    return { ok: false, reden: "De looptijd (TTL) moet een geheel aantal seconden tussen 60 en 86400 zijn." };
  }
  return { ok: true, record: { name, expire, type: type as DnsType, content } };
}

const zonderAanhaling = (s: string) => (s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

/** Zelfde record = zelfde naam (hoofdletters tellen niet), type en inhoud (TTL telt niet; aanhalingstekens rond een TXT ook niet). */
export function zelfdeRecord(a: { name: string; type: string; content: string }, b: { name: string; type: string; content: string }): boolean {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    a.type.trim().toUpperCase() === b.type.trim().toUpperCase() &&
    zonderAanhaling(a.content.trim()) === zonderAanhaling(b.content.trim())
  );
}
