// ---------------------------------------------------------------------------
// Websites van klanten op hun eigen domein. Caddy zet deze kop alleen in het
// blok voor klantdomeinen (deploy/caddy/Caddyfile) en haalt hem weg op
// zekerflex.com zelf, dus een bezoeker kan hem niet vervalsen. Middleware en
// route lezen hem; dit bestand blijft vrij van Node-code, want de middleware
// draait op de edge.
// ---------------------------------------------------------------------------

export const SITE_HOST_HEADER = "x-zf-site-host";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The host from the header, lowercased and checked: letters, digits, hyphens and dots only, with a letter TLD. */
export function siteHostFrom(raw: string | null | undefined): string | null {
  const host = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  return /^[a-z]/.test(labels[labels.length - 1] ?? "") ? host : null;
}
