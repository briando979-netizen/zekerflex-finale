import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getHostingConfig, setHostingConfig } from "@/lib/hosting/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — de hosting/domein-config. De provider-API-token wordt GEMASKEERD (nooit
// teruggegeven), met een flag of er een token is ingesteld.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const cfg = await getHostingConfig();
  return NextResponse.json({ ...cfg, api: { ...cfg.api, token: "" }, apiTokenSet: Boolean(cfg.api.token) });
});

const aliasSchema = z.object({ alias: z.string().max(200), forwardsTo: z.string().max(200) });
const recordSchema = z.object({ type: z.string().max(12), name: z.string().max(200), value: z.string().max(1000), ttl: z.string().max(12) });
const schema = z.object({
  mail: z.object({
    imapHost: z.string().max(200), imapPort: z.string().max(6),
    smtpHost: z.string().max(200), smtpPort: z.string().max(6),
    pop3Host: z.string().max(200), pop3Port: z.string().max(6),
    aliases: z.array(aliasSchema).max(100),
  }),
  dns: z.object({
    primaryNs: z.string().max(200),
    secondaryNs: z.array(z.string().max(200)).max(6),
    records: z.array(recordSchema).max(200),
  }),
  domain: z.object({ dnssec: z.boolean(), transferLock: z.boolean(), authCode: z.string().max(200) }),
  ssl: z.object({ status: z.string().max(40), note: z.string().max(2000) }),
  vps: z.object({ provider: z.string().max(100), host: z.string().max(200), ipv4: z.string().max(60), sshKey: z.string().max(4000), note: z.string().max(2000) }),
  api: z.object({ provider: z.string().max(100), endpoint: z.string().max(300), token: z.string().max(400) }),
  bimi: z.object({ enabled: z.boolean(), selector: z.string().max(60), logoUrl: z.string().max(500), vmcUrl: z.string().max(500) }),
});

// PUT — opslaan. Lege api.token = bestaande token behouden (niet overschrijven).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());

  const current = await getHostingConfig();
  const token = parsed.data.api.token.trim() ? parsed.data.api.token : current.api.token;
  await setHostingConfig({ ...parsed.data, api: { ...parsed.data.api, token } });

  await recordAudit({
    category: "ADMIN",
    action: "admin.hosting.updated",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wijzigde de hosting/domein-instellingen`,
  });

  return NextResponse.json({ ok: true });
});
