import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { geefPartnerdeal, lijstPartnerdeal } from "@/lib/billing/partnerdeal-vrij";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Sales → campagne → paneel "De gratis maand" (components/admin/sales/PartnerdealGratis.tsx).
// GET: de bedrijven die de gratis maand kregen. POST { email }: geef het bedrijf van dit account 30 dagen geen
// platformkosten, vanaf vandaag. Het stopt vanzelf; een bedrijf krijgt hem één keer.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ bedrijven: await lijstPartnerdeal() }));

const Invoer = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const invoer = Invoer.safeParse(await request.json().catch(() => null));
  if (!invoer.success) throw AppError.validation("Vul het e-mailadres in waarmee het bedrijf zich heeft aangemeld.");
  const user = await prisma.user.findFirst({
    where: { email: { equals: invoer.data.email, mode: "insensitive" } },
    select: { memberships: { where: { role: "HQ_ADMIN" }, select: { tenantId: true, tenant: { select: { name: true } } } } },
  });
  if (!user) throw AppError.notFound("Er is geen account met dit e-mailadres. Het bedrijf moet zich eerst aanmelden.");
  if (user.memberships.length === 0) throw AppError.validation("Dit account is geen beheerder van een bedrijf. Vraag het adres van de eigenaar van het bedrijfsaccount.");
  const uit = [];
  for (const m of user.memberships) {
    uit.push(await geefPartnerdeal({ tenantId: m.tenantId, bedrijf: m.tenant.name, door: { userId: principal.userId, naam: principal.fullName } }));
  }
  return NextResponse.json({ gegeven: uit.map((u) => ({ nieuw: u.nieuw, bedrijf: u.deal.bedrijf, gratisVanaf: u.deal.gratisVanaf, gratisTot: u.deal.gratisTot })), bedrijven: await lijstPartnerdeal() });
});
