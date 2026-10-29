import type { HostingConfig } from "@/lib/hosting/config";
import type { ApplyResult } from "./plan";
import { applyDnsToCloudflare } from "./cloudflare";
import { applyDnsToHetzner } from "./hetzner";

// Registry van DNS-providers. "Algemeen" = pluggable: een nieuwe provider
// toevoegen is één adapter die apply(cfg, domain) implementeert op de reconcile-
// kern (zie plan.ts) + één regel hieronder. De provider wordt gekozen op basis
// van het "Provider"-veld in Admin → Hosting & domein → Provider-API.

export interface DnsProvider {
  id: string;
  label: string;
  match: RegExp; // matcht de provider-naam uit de config
  tokenHint: string; // wat voor token nodig is (voor foutmeldingen/UI)
  apply(cfg: HostingConfig, domain: string): Promise<ApplyResult>;
}

export const DNS_PROVIDERS: DnsProvider[] = [
  { id: "cloudflare", label: "Cloudflare", match: /cloudflare/i, tokenHint: "API-token met Zone:Read + DNS:Edit", apply: applyDnsToCloudflare },
  { id: "hetzner", label: "Hetzner DNS", match: /hetzner/i, tokenHint: "Hetzner DNS API-token", apply: applyDnsToHetzner },
];

export function resolveDnsProvider(provider: string): DnsProvider | null {
  const p = (provider || "").trim();
  if (!p) return null;
  return DNS_PROVIDERS.find((x) => x.match.test(p)) ?? null;
}

export function dnsProviderLabels(): string[] {
  return DNS_PROVIDERS.map((p) => p.label);
}
