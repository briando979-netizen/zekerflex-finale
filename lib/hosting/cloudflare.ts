// Back-compat re-export. De Cloudflare-adapter verhuisde naar het algemene
// DNS-providerraamwerk in lib/hosting/dns/. Bestaande imports blijven werken.
export { applyDnsToCloudflare } from "./dns/cloudflare";
export type { ApplyResult } from "./dns/plan";
