import { withAdminAccess } from "@/lib/auth/handlers";
import { getHostingConfig } from "@/lib/hosting/config";
import { buildBimiRecord } from "@/lib/hosting/bimi";
import { SITE } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/hosting/export — genereert uit de opgeslagen config een echte,
// bruikbare DNS-zone (BIND-stijl, werkt met CoreDNS/BIND/PowerDNS die je zelf
// draait) + Postfix virtual-alias-regels voor je eigen mailserver. Zo is het
// paneel niet alleen opslag maar produceert het de config voor je soevereine stack.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const cfg = await getHostingConfig();
  let host = "jouwdomein.nl";
  try {
    host = new URL(SITE.url).host.replace(/^www\./, "");
  } catch {
    /* fallback blijft staan */
  }

  const serial = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "01";
  const nsList = [cfg.dns.primaryNs, ...cfg.dns.secondaryNs].map((n) => n.trim()).filter(Boolean);
  const primaryNs = nsList[0] || `ns1.${host}`;

  const lines: string[] = [];
  lines.push(`; === Authoritative DNS-zone voor ${host} — self-hosted (CoreDNS/BIND/PowerDNS) ===`);
  lines.push(`$ORIGIN ${host}.`);
  lines.push(`$TTL 3600`);
  lines.push(`@\tIN\tSOA\t${primaryNs}. hostmaster.${host}. (`);
  lines.push(`\t\t${serial} ; serial`);
  lines.push(`\t\t3600       ; refresh`);
  lines.push(`\t\t900        ; retry`);
  lines.push(`\t\t1209600    ; expire`);
  lines.push(`\t\t3600 )     ; minimum`);
  for (const ns of nsList) lines.push(`@\tIN\tNS\t${ns}.`);
  for (const r of cfg.dns.records) {
    const name = r.name.trim() || "@";
    const ttl = r.ttl.trim() || "3600";
    lines.push(`${name}\t${ttl}\tIN\t${r.type.trim().toUpperCase()}\t${r.value.trim()}`);
  }

  // BIMI (merklogo in de inbox): voeg het TXT-record toe als er een logo is
  // ingesteld en het nog niet handmatig in de records staat.
  const bimi = buildBimiRecord(cfg);
  if (bimi) {
    const already = cfg.dns.records.some(
      (r) => r.type.trim().toUpperCase() === "TXT" && r.name.trim().toLowerCase() === bimi.name.toLowerCase(),
    );
    if (!already) lines.push(`${bimi.name}\t3600\tIN\tTXT\t"${bimi.value}"`);
  }

  lines.push("");
  lines.push(`; === Postfix virtual aliases (self-hosted mail: Postfix + Dovecot) ===`);
  const aliases = cfg.mail.aliases.filter((a) => a.alias.trim());
  if (aliases.length === 0) lines.push("; (geen aliassen ingesteld)");
  for (const a of aliases) lines.push(`${a.alias.trim()}\t${a.forwardsTo.trim()}`);

  lines.push("");
  lines.push(`; Mailserver (zet deze als MX + records in je zone hierboven):`);
  lines.push(`;   IMAP ${cfg.mail.imapHost || "mail." + host}:${cfg.mail.imapPort}  SMTP ${cfg.mail.smtpHost || "mail." + host}:${cfg.mail.smtpPort}  POP3 ${cfg.mail.pop3Host || "mail." + host}:${cfg.mail.pop3Port}`);
  lines.push(`; Zie deploy/sovereign/README.md voor de volledige zelf-gehoste stack.`);

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${host}-sovereign-config.txt"`,
      "Cache-Control": "no-store",
    },
  });
});
