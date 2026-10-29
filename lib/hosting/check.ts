import type { HostingConfig } from "@/lib/hosting/config";

// ---------------------------------------------------------------------------
// Config-gezondheidscheck voor Hosting & domein. Het paneel sláát de config op;
// deze zuivere functie controleert of de opgeslagen DNS/mail/beveiligings-config
// operationeel klopt. Vooral mail-aflevering valt of staat met MX/SPF/DKIM/DMARC
// (zie deploy/sovereign/README.md — "90% van het werk"); ontbreken ze, dan
// belandt mail in spam of wordt hij geweigerd. Puur (geen IO) → makkelijk te
// testen en herbruikbaar door paneel + export.
// ---------------------------------------------------------------------------

export type HostingCheckLevel = "warn" | "info";

export interface HostingCheck {
  level: HostingCheckLevel;
  title: string;
  hint: string;
}

interface NormRecord {
  type: string;
  name: string;
  value: string;
}

function normRecords(cfg: HostingConfig): NormRecord[] {
  return cfg.dns.records.map((r) => ({
    type: (r.type || "").trim().toUpperCase(),
    name: (r.name || "").trim().toLowerCase(),
    value: (r.value || "").trim(),
  }));
}

export function hostingChecks(cfg: HostingConfig, host: string): HostingCheck[] {
  const domain = (host || "jouwdomein.nl").trim() || "jouwdomein.nl";
  const out: HostingCheck[] = [];
  const recs = normRecords(cfg);
  const txt = recs.filter((r) => r.type === "TXT");

  // Nameservers
  if (!cfg.dns.primaryNs.trim()) {
    out.push({
      level: "warn",
      title: "Geen primaire nameserver",
      hint: `Zonder nameserver is je domein niet vindbaar. Vul de primaire nameserver in (bv. ns1.${domain}).`,
    });
  }
  const secondary = cfg.dns.secondaryNs.map((n) => n.trim()).filter(Boolean);
  if (secondary.length === 0) {
    out.push({
      level: "warn",
      title: "Geen secundaire nameserver",
      hint: "Met één nameserver is je domein onbereikbaar zodra die uitvalt. Voeg minstens één secundaire nameserver toe.",
    });
  }

  // Mail-DNS — alleen relevant als er een mailserver is ingesteld
  const hasMailHost = Boolean(cfg.mail.smtpHost.trim() || cfg.mail.imapHost.trim() || cfg.mail.pop3Host.trim());
  if (hasMailHost) {
    if (!recs.some((r) => r.type === "MX")) {
      out.push({
        level: "warn",
        title: "Geen MX-record",
        hint: `Inkomende mail kan niet worden afgeleverd zonder MX-record (bv. @ MX 10 mail.${domain}.).`,
      });
    }
    if (!txt.some((r) => /v=spf1/i.test(r.value))) {
      out.push({
        level: "warn",
        title: "Geen SPF-record",
        hint: "Zonder SPF belandt je uitgaande mail sneller in spam. Zet TXT @ op 'v=spf1 mx -all'.",
      });
    }
    if (!txt.some((r) => r.name.startsWith("_dmarc") && /v=dmarc1/i.test(r.value))) {
      out.push({
        level: "warn",
        title: "Geen DMARC-record",
        hint: `Zonder DMARC kunnen anderen namens jouw domein mailen. Zet TXT _dmarc op 'v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}'.`,
      });
    }
    if (!txt.some((r) => r.name.includes("_domainkey"))) {
      out.push({
        level: "info",
        title: "Nog geen DKIM-record",
        hint: "Genereer DKIM op je mailserver ('setup config dkim') en zet de TXT (…_domainkey) in je zone voor betrouwbare aflevering.",
      });
    }
  }

  // Domeinbeveiliging
  if (!cfg.domain.dnssec) {
    out.push({
      level: "info",
      title: "DNSSEC staat uit",
      hint: "DNSSEC beschermt tegen DNS-spoofing. Zet aan zodra je nameservers het ondersteunen.",
    });
  }
  if (!cfg.domain.transferLock) {
    out.push({
      level: "warn",
      title: "Transfer-lock staat uit",
      hint: "Zonder transfer-lock kan je domein makkelijker worden gekaapt. Zet aan tenzij je nu verhuist.",
    });
  }

  // SSL
  const ssl = cfg.ssl.status.trim().toLowerCase();
  if (ssl && ssl !== "actief") {
    out.push({
      level: ssl === "verloopt binnenkort" ? "warn" : "info",
      title: `SSL-status: ${cfg.ssl.status.trim()}`,
      hint: "Zorg voor een geldig (Let's Encrypt) certificaat; browsers weigeren anders je site.",
    });
  }

  return out;
}
