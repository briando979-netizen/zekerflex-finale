import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { koppelAccount, leesPersoneelVan, type UitnodigingsToken } from "@/lib/horeca-personeel/store";

// Een medewerker gebruikt de uitnodiging: een nieuw account, of een bestaand account dat al ingelogd is met hetzelfde e-mailadres.
// Het account krijgt geen rol in ZekerFlex: alleen de verwijzing naar de zaak (lib/horeca-personeel/store.ts). Het e-mailadres
// geldt als bevestigd, want de link kwam alleen in die postbus.

async function eisNogGeldig(t: UitnodigingsToken): Promise<void> {
  const d = await leesPersoneelVan(t.tenantId);
  const m = d.medewerkers.find((x) => x.id === t.medewerkerId);
  if (!m || m.status !== "uitgenodigd" || m.email !== t.email) {
    throw AppError.precondition("Deze uitnodiging is niet meer geldig. Vraag je werkgever om een nieuwe.");
  }
}

export async function maakMedewerkerAccount(t: UitnodigingsToken, input: { fullName: string; password: string }): Promise<{ userId: string }> {
  await eisNogGeldig(t);
  const bestaand = await prisma.user.findUnique({ where: { email: t.email }, select: { id: true } });
  if (bestaand) throw AppError.conflict("Er bestaat al een account met dit e-mailadres. Log in om de uitnodiging te gebruiken.");
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({ data: { email: t.email, fullName: input.fullName, passwordHash, emailVerifiedAt: new Date() }, select: { id: true } });
  await koppelAccount(t.tenantId, t.medewerkerId, user.id);
  await recordAudit({
    category: "AUTH",
    action: "horeca.personeel.account",
    actorUserId: user.id,
    actorLabel: "user",
    summary: `${t.email} maakte een account aan als medewerker van ${t.tenantName}`,
    targetType: "user",
    targetId: user.id,
    metadata: { tenantId: t.tenantId },
  });
  return { userId: user.id };
}

export async function koppelBestaandAccount(t: UitnodigingsToken, userId: string, userEmail: string): Promise<void> {
  if (userEmail.trim().toLowerCase() !== t.email) throw AppError.forbidden("Deze uitnodiging is voor een ander e-mailadres. Log in met het adres waar de mail naartoe ging.");
  await eisNogGeldig(t);
  await koppelAccount(t.tenantId, t.medewerkerId, userId);
  await recordAudit({
    category: "AUTH",
    action: "horeca.personeel.gekoppeld",
    actorUserId: userId,
    actorLabel: "user",
    summary: `${t.email} koppelde het bestaande account aan ${t.tenantName}`,
    targetType: "user",
    targetId: userId,
    metadata: { tenantId: t.tenantId },
  });
}
