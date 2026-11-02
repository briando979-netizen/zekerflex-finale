import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { backupSite, getBackupState, listSiteBackups, openSiteBackup, restoreSiteBackup } from "@/lib/website/site-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Back-ups van beheerde klantsites (alleen platformbeheer): overzicht, nu maken,
// downloaden en terugzetten.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("siteId") ?? "";
  const download = url.searchParams.get("download");
  if (download) {
    const file = await openSiteBackup(siteId, download).catch(() => null);
    if (!file) throw AppError.notFound("Back-up niet gevonden");
    await recordAudit({ category: "ADMIN", action: "website.backup.downloaded", actorUserId: principal.userId, summary: `Back-up ${download} gedownload`, targetType: "managed-website", targetId: siteId });
    return new NextResponse(Readable.toWeb(file.stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(file.bytes),
        "Content-Disposition": `attachment; filename="${download}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  try {
    return NextResponse.json({ state: await getBackupState(siteId), files: await listSiteBackups(siteId) });
  } catch (err) {
    throw AppError.validation((err as Error).message);
  }
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("now"), siteId: z.string().min(1) }),
  z.object({ action: z.literal("restore"), siteId: z.string().min(1), file: z.string().min(1).max(200) }),
]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  }));
  if (body.action === "now") {
    const state = await getBackupState(body.siteId);
    if (state?.running) throw AppError.validation("Er loopt al een back-up voor deze site.");
    // Op de achtergrond: een grote site kan minuten duren; het scherm vraagt de voortgang op.
    void backupSite(body.siteId, principal.userId).catch((err) => logger.warn("manual site backup failed", { siteId: body.siteId, error: (err as Error).message }));
    return NextResponse.json({ ok: true, started: true });
  }
  try {
    return NextResponse.json({ ok: true, ...(await restoreSiteBackup(body.siteId, body.file, principal.userId)) });
  } catch (err) {
    throw AppError.validation((err as Error).message);
  }
});
