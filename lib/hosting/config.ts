import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Hosting & domein-beheercentrum: één bewaarplaats voor de hosting-/domein-/
// mailconfiguratie (mailserver + poorten + aliassen, nameservers, DNS-records,
// DNSSEC, transfer-lock, autorisatiecode, SSL, VPS). Runtime-bewerkbaar via KV
// (geen redeploy), net als de huisstijl/tekst-registry. Dit IS de administratie
// + het koppelpunt: het daadwerkelijk toepassen gebeurt bij je provider, of
// later via een provider-API die deze config als bron gebruikt.
// ---------------------------------------------------------------------------

const KEY = "hosting:config";

export interface MailAlias {
  alias: string;
  forwardsTo: string;
}
export interface DnsRecord {
  type: string; // A, AAAA, CNAME, MX, TXT, …
  name: string;
  value: string;
  ttl: string;
}
export interface HostingConfig {
  mail: {
    imapHost: string;
    imapPort: string;
    smtpHost: string;
    smtpPort: string;
    pop3Host: string;
    pop3Port: string;
    aliases: MailAlias[];
  };
  dns: {
    primaryNs: string;
    secondaryNs: string[];
    records: DnsRecord[];
  };
  domain: {
    dnssec: boolean;
    transferLock: boolean;
    authCode: string;
  };
  ssl: {
    status: string; // "actief" | "verloopt binnenkort" | "geen" | "onbekend"
    note: string;
  };
  vps: {
    provider: string;
    host: string;
    ipv4: string;
    sshKey: string; // publieke SSH-sleutel (publieke sleutels zijn niet geheim)
    note: string;
  };
  api: {
    provider: string; // bv. Cloudflare, TransIP, Vimexx
    endpoint: string;
    token: string; // GEHEIM — gemaskeerd teruggegeven door de route
  };
  updatedAt?: string;
}

export const DEFAULT_HOSTING: HostingConfig = {
  mail: { imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465", pop3Host: "", pop3Port: "995", aliases: [] },
  dns: { primaryNs: "", secondaryNs: ["", "", ""], records: [] },
  domain: { dnssec: false, transferLock: true, authCode: "" },
  ssl: { status: "onbekend", note: "" },
  vps: { provider: "", host: "", ipv4: "", sshKey: "", note: "" },
  api: { provider: "", endpoint: "", token: "" },
};

export async function getHostingConfig(): Promise<HostingConfig> {
  try {
    const v = await kvGet<HostingConfig>(KEY);
    if (v && typeof v === "object") {
      return {
        mail: { ...DEFAULT_HOSTING.mail, ...v.mail, aliases: Array.isArray(v.mail?.aliases) ? v.mail.aliases : [] },
        dns: {
          ...DEFAULT_HOSTING.dns,
          ...v.dns,
          secondaryNs: Array.isArray(v.dns?.secondaryNs) ? v.dns.secondaryNs : DEFAULT_HOSTING.dns.secondaryNs,
          records: Array.isArray(v.dns?.records) ? v.dns.records : [],
        },
        domain: { ...DEFAULT_HOSTING.domain, ...v.domain },
        ssl: { ...DEFAULT_HOSTING.ssl, ...v.ssl },
        vps: { ...DEFAULT_HOSTING.vps, ...v.vps },
        api: { ...DEFAULT_HOSTING.api, ...v.api },
        ...(v.updatedAt ? { updatedAt: v.updatedAt } : {}),
      };
    }
  } catch {
    /* KV onbereikbaar → defaults */
  }
  return DEFAULT_HOSTING;
}

export async function setHostingConfig(cfg: HostingConfig): Promise<void> {
  await kvSet(KEY, { ...cfg, updatedAt: new Date().toISOString() });
}
