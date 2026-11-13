import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { featureEnabled, setFlag } from "@/lib/flags";
import { liveVersie } from "@/lib/bouwer/versie";
import { herstelNaStop, leesAutoStand, leesNoodremReden, noodremAan, zetNoodrem } from "@/lib/bouwer/auto-uitrol-opslag";
import { LEGE_STAND, meldingen } from "@/lib/bouwer/auto-uitrol-regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin -> Live zetten -> Auto-uitrol: de stand, de schakelaar (vlag auto-uitrol) en de noodrem. Alleen platformbeheer.
async function stand() {
  const [aan, noodrem, s] = await Promise.all([featureEnabled("auto-uitrol").catch(() => false), noodremAan().catch(() => true), leesAutoStand().catch(() => LEGE_STAND)]);
  const live = liveVersie();
  return { aan, noodrem, noodremReden: await leesNoodremReden(), stand: s, meldingen: meldingen(s, live?.sha ?? null, Date.now(), aan) };
}

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await stand()));

const schema = z.object({ aan: z.boolean().optional(), noodrem: z.boolean().optional() });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => ({})));
  if (body.aan !== undefined) {
    // een mens zet hem aan: de harde stop van de nacontrole vervalt (en de noodrem die de nacontrole zelf zette)
    if (body.aan) await herstelNaStop(principal.userId);
    await setFlag("auto-uitrol", { enabled: body.aan }, principal.userId);
    await recordAudit({ category: "ADMIN", action: "admin.auto-uitrol.schakelaar", severity: "info", actorUserId: principal.userId, actorLabel: "user", summary: `Auto-uitrol ${body.aan ? "aangezet" : "uitgezet"}` });
  }
  if (body.noodrem !== undefined) {
    await zetNoodrem(body.noodrem, principal.userId);
    await recordAudit({ category: "ADMIN", action: "admin.auto-uitrol.noodrem", severity: "warn", actorUserId: principal.userId, actorLabel: "user", summary: `Auto-uitrol noodrem ${body.noodrem ? "aan" : "uit"}` });
  }
  return NextResponse.json(await stand());
});