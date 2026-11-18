import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { featureEnabled, setFlag } from "@/lib/flags";
import { leesInfoStand } from "@/lib/mail/info-opslag";
import { INFO_MAIL_VLAG } from "@/lib/mail/info-ronde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Mail → paneel "Postbus info@ afhandelen" (components/admin/InfoMailPanel.tsx).
// GET: de stand (proef of echt) en de laatste beslissingen. POST { stand }: wisselen tussen proef en echt.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ echt: await featureEnabled(INFO_MAIL_VLAG), stand: await leesInfoStand() });
});

const Invoer = z.object({ stand: z.enum(["proef", "echt"]) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const invoer = Invoer.safeParse(await request.json().catch(() => null));
  if (!invoer.success) throw AppError.validation("Kies proef of echt.");
  const echt = invoer.data.stand === "echt";
  await setFlag(INFO_MAIL_VLAG, { enabled: echt, note: echt ? "echt: verplaatsen, antwoorden en melden" : "proef: alleen opschrijven" }, principal.email);
  return NextResponse.json({ echt });
});
