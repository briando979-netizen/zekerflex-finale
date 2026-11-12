import { createHash } from "node:crypto";

// De rekenregels van het BSN, puur (geen kv of prisma): het fiscale formulier (lib/fiscal/store.ts geeft ze door) en
// het BSN van het document (lib/kyc/bsn-uit-document.ts) gebruiken dezelfde.

/**
 * Alleen de cijfers van een BSN. Een oud BSN (sofinummer) van 8 cijfers krijgt de 0 ervoor, zoals de Belastingdienst
 * het vraagt: zonder die 0 viel het door de elfproef ("klopt niet") terwijl het nummer echt is (13 nov). Al bewaarde
 * hashes veranderen niet: die zijn altijd van 9 cijfers gemaakt.
 */
export function bsnCijfers(bsn: string): string {
  const d = bsn.replace(/\D/g, "");
  return d.length === 8 ? `0${d}` : d;
}

export function hashBsn(bsn: string): { hash: string; last4: string } {
  const digits = bsnCijfers(bsn);
  return { hash: createHash("sha256").update(`bsn:${digits}`).digest("hex"), last4: digits.slice(-4) };
}

/**
 * Elfproef (BSN check digit): 9x het eerste cijfer + 8x het tweede ... + 2x het achtste - 1x het laatste moet door 11
 * deelbaar zijn. Dit kijkt alleen of het nummer kán bestaan (een tikfout of twee omgedraaide cijfers vallen er bijna
 * altijd door), niet of het van deze persoon is: dat weet alleen de overheid.
 */
export function validBsn(bsn: string): boolean {
  const d = bsnCijfers(bsn);
  if (d.length !== 9 || d === "000000000") return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (9 - i);
  sum += Number(d[8]) * -1;
  return sum % 11 === 0;
}
