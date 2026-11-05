import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { beveiligingOverzicht, crowdsecIngesteld, deblokkeer } from "@/lib/ops/crowdsec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/beveiliging/crowdsec — de aanvalsbescherming (lib/ops/crowdsec.ts):
// actieve blokkades en de meldingen van de laatste 24 uur, vers opgehaald.
// DELETE { ip } — de blokkade van één adres opheffen (bijvoorbeeld een eigen
// testcomputer die op een scanner leek); de engine en de firewall volgen binnen 10 s.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ ingesteld: crowdsecIngesteld(), overzicht: await beveiligingOverzicht(true) });
});

const schema = z.object({ ip: z.union([z.string().ip({ version: "v4" }), z.string().ip({ version: "v6" })]) });

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  if (!crowdsecIngesteld()) return NextResponse.json({ error: { code: "PRECONDITION", message: "De aanvalsbescherming staat niet op deze omgeving." } }, { status: 412 });
  const { ip } = schema.parse(await request.json().catch(() => ({})));
  const opgeheven = await deblokkeer(ip);
  return NextResponse.json({ ip, opgeheven });
});
