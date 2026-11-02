import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { isUnlocked } from "@/lib/website/manage";
import { checkDnsVerification, getVerification, hostOf, verificationRecord, verifyByAdmin } from "@/lib/website/verify";
import { latestMirror, startMirror } from "@/lib/website/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Website-verhuizer (alleen platformbeheerders): eigendom bewijzen, een kopie met
// verbeteringen maken, en de voortgang/uitkomst ophalen.

async function site(id: string) {
  const s = await prisma.managedWebsite.findUnique({ where: { id }, select: { id: true, tenantId: true, domain: true, status: true } });
  if (!s) throw AppError.notFound("Website niet gevonden");
  return s;
}

// GET ?siteId= — de DNS-code, het eigendomsbewijs en de laatste kopie.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const siteId = new URL(request.url).searchParams.get("siteId") ?? "";
  const s = await site(siteId);
  return NextResponse.json({
    host: hostOf(s.domain),
    record: verificationRecord(s.id),
    verification: await getVerification(s.id, s.domain),
    mirror: await latestMirror(s.id),
  });
});

const schema = z.object({
  action: z.enum(["check-dns", "admin-verify", "start"]),
  siteId: z.string().min(1),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    }),
  );
  const s = await site(body.siteId);
  const host = hostOf(s.domain);
  if (!host) throw AppError.validation("Deze klant heeft nog geen geldig domein ingevuld.");

  if (body.action === "check-dns") {
    const res = await checkDnsVerification(s.id, s.domain);
    return NextResponse.json({ ok: res.ok, verification: await getVerification(s.id, s.domain) });
  }
  if (body.action === "admin-verify") {
    return NextResponse.json({ ok: true, verification: await verifyByAdmin(s.id, s.domain, principal.userId) });
  }

  if (!isUnlocked(s)) throw AppError.validation("Deze klant heeft geen lopend abonnement.");
  if (!(await getVerification(s.id, s.domain))) throw AppError.validation("Eerst het eigendom van het domein bewijzen.");
  try {
    const rec = await startMirror({ siteId: s.id, tenantId: s.tenantId, host, startedBy: principal.userId });
    await recordAudit({
      category: "ADMIN",
      action: "website.mirror.started",
      actorUserId: principal.userId,
      summary: `Kopie met verbeteringen gestart van ${host}`,
      targetType: "managedWebsite",
      targetId: s.id,
    });
    return NextResponse.json({ ok: true, mirror: rec });
  } catch (err) {
    throw AppError.validation((err as Error).message);
  }
});
