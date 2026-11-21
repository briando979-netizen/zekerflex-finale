import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { smtpConfig } from "@/lib/mail";
import { verifySmtp } from "@/lib/mail/smtp";
import { geldigVerkoopAdres, verkoopMailboxStand, wisVerkoopLogin, zetVerkoopLogin } from "@/lib/mail/verkoop-mailbox";
import { zonderAdressen } from "@/lib/mail/log-domein";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Mail → Verkoopmailbox (21 nov 2026, lib/mail/verkoop-mailbox.ts). De eigenaar typt hier zelf het adres en het
// wachtwoord van de verkoopmailbox die hij bij TransIP maakte. Opslaan gebeurt pas als TransIP de login aanneemt (inloggen
// zonder iets te versturen); het wachtwoord komt nooit terug in een antwoord, de audit of het log.

const bodySchema = z.object({
  adres: z.string().trim().max(200),
  wachtwoord: z.string().min(1).max(500),
});

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json(await verkoopMailboxStand());
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { adres, wachtwoord } = bodySchema.parse(await request.json().catch(() => ({})));
  if (!geldigVerkoopAdres(adres)) throw AppError.validation("Gebruik een adres op zekerflex.com, bijvoorbeeld sales@zekerflex.com.");
  const basis = smtpConfig();
  if (!basis) throw AppError.precondition("Er is geen mailserver ingesteld (SMTP_HOST).");
  try {
    await verifySmtp({ ...basis, user: adres.trim(), pass: wachtwoord });
  } catch (e) {
    throw AppError.validation(`TransIP nam deze login niet aan: ${zonderAdressen((e as Error).message).slice(0, 200)}. Controleer het adres en het wachtwoord.`);
  }
  await zetVerkoopLogin(adres, wachtwoord);
  await recordAudit({
    category: "ADMIN",
    action: "admin.mail.verkoopmailbox.ingesteld",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} stelde de verkoopmailbox in (${adres.trim().toLowerCase()})`,
    targetType: "mail",
    targetId: "verkoop-mailbox",
  });
  return NextResponse.json(await verkoopMailboxStand());
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  await wisVerkoopLogin();
  await recordAudit({
    category: "ADMIN",
    action: "admin.mail.verkoopmailbox.gewist",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wiste de verkoopmailbox uit Beheer`,
    targetType: "mail",
    targetId: "verkoop-mailbox",
  });
  return NextResponse.json(await verkoopMailboxStand());
});
