import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { listManagedWebsites, revealWebsiteSecrets, setManagedWebsiteStatus } from "@/lib/website/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — alle website-beheer-aanvragen/-abonnementen (admin).
export const GET = withAdminAccess(["PLATFORM_ADMIN", "HQ_ADMIN"], async () => {
  return NextResponse.json({ sites: await listManagedWebsites() });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reveal"), id: z.string().min(1) }),
  z.object({
    action: z.literal("set-status"),
    id: z.string().min(1),
    status: z.enum(["PENDING_PAYMENT", "ONBOARDING", "SUBMITTED", "ACTIVE", "PAUSED", "CANCELLED"]),
  }),
]);

// POST — toegangsgegevens onthullen (geaudit) of de status aanpassen.
export const POST = withAdminAccess(["PLATFORM_ADMIN", "HQ_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    }),
  );
  if (body.action === "reveal") {
    const secrets = await revealWebsiteSecrets(body.id, principal.userId);
    return NextResponse.json({ secrets });
  }
  await setManagedWebsiteStatus(body.id, body.status, principal.userId);
  return NextResponse.json({ ok: true });
});
