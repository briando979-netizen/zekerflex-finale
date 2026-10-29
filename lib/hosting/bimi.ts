import type { HostingConfig } from "@/lib/hosting/config";

// ---------------------------------------------------------------------------
// BIMI (Brand Indicators for Message Identification): laat je merklogo naast je
// e-mails verschijnen in ondersteunende inboxen (Gmail, Apple Mail, Yahoo).
// Vereist:
//   1. DMARC met handhaving (p=quarantine of p=reject) — zonder dit geen logo.
//   2. Een SVG P/S-logo (vierkant, SVG Tiny 1.2 "tiny-ps", zonder scripts) op
//      een publieke HTTPS-URL. ZekerFlex levert er al een: /bimi-logo.svg.
//   3. Optioneel een VMC/CMC-certificaat voor het geverifieerde vinkje in Gmail.
// Het DNS-record is een TXT op `<selector>._bimi` met waarde
// `v=BIMI1; l=<logo-URL>; a=<vmc-URL>`.
// ---------------------------------------------------------------------------

export interface BimiRecord {
  name: string; // bv. "default._bimi"
  value: string; // bv. "v=BIMI1; l=https://…/bimi-logo.svg; a=https://…/vmc.pem"
}

export function bimiRecordName(selector: string): string {
  const sel = (selector || "").trim() || "default";
  return `${sel}._bimi`;
}

// Bouwt het BIMI TXT-record uit de config, of null als er geen logo is ingesteld
// (zonder logo heeft een BIMI-record geen zin).
export function buildBimiRecord(cfg: HostingConfig): BimiRecord | null {
  const logo = cfg.bimi.logoUrl.trim();
  if (!logo) return null;
  const parts = ["v=BIMI1", `l=${logo}`];
  const vmc = cfg.bimi.vmcUrl.trim();
  if (vmc) parts.push(`a=${vmc}`);
  return { name: bimiRecordName(cfg.bimi.selector), value: parts.join("; ") };
}
