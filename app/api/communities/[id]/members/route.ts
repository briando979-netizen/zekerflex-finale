import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { addMember, canManage, getCommunity, isMember, leaveCommunity, removeMember, setMemberRole } from "@/lib/communities/store";
import { prisma } from "@/lib/prisma";
import { postMessage } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({ userId: z.string().min(1) });

// POST /api/communities/:id/members — owner/admin adds someone directly.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    if (!canManage(c, p.userId)) throw AppError.forbidden("Alleen beheerders kunnen leden toevoegen.");
    const { userId } = addSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, disabledAt: true } });
    if (!user || user.disabledAt) throw AppError.validation("Gebruiker niet gevonden");
    await addMember(c, userId);
    if (c.threadId) await postMessage(c.threadId, "system", `${user.fullName} is toegevoegd aan de community.`, "system");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/communities/:id/members?userId=  — remove a member, or leave yourself.
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    const target = new URL(request.url).searchParams.get("userId") ?? p.userId;
    if (target !== p.userId && !canManage(c, p.userId)) {
      throw AppError.forbidden("Alleen beheerders kunnen leden verwijderen.");
    }
    const naam = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { fullName: true } }))?.fullName ?? "Iemand";
    let regel: string;
    try {
      if (target === p.userId) {
        // zelf verlaten; de eigenaar geeft de groep door (lib/communities/store.ts leaveCommunity)
        const { newOwnerId } = await leaveCommunity(c, target);
        regel = `${p.fullName} heeft de groep verlaten.${newOwnerId ? ` ${await naam(newOwnerId)} is nu de eigenaar.` : ""}`;
      } else {
        await removeMember(c, target);
        regel = `${p.fullName} heeft ${await naam(target)} uit de groep gehaald.`;
      }
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
    if (c.threadId) await postMessage(c.threadId, "system", regel, "system").catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(["admin", "member"]) });

// PATCH /api/communities/:id/members — owner/admin makes someone admin, or takes it back (like WhatsApp).
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    if (!canManage(c, p.userId)) throw AppError.forbidden("Alleen beheerders kunnen dit wijzigen.");
    const { userId, role } = roleSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }));
    try {
      await setMemberRole(c, userId, role);
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
    const naam = (await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }))?.fullName ?? "Iemand";
    const regel = role === "admin" ? `${p.fullName} heeft ${naam} beheerder gemaakt.` : `${naam} is geen beheerder meer.`;
    if (c.threadId) await postMessage(c.threadId, "system", regel, "system").catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
