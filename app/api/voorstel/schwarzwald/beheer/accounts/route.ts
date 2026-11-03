import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { alleAccounts, beheerAccount, eisBeheerder, eisZelfdeHerkomst, huidigAccount, verwijderAccount } from "@/lib/voorstel/schwarzwald-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accounts in het beheer: lijst, rol (klant/beheerder), blokkeren en
// verwijderen. Je eigen account kun je niet degraderen, blokkeren of wissen,
// zodat er altijd iemand overblijft die erin kan.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ accounts: await alleAccounts(), ik: (await huidigAccount())?.email ?? null });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  email: z.string().trim().email().max(200),
  rol: z.enum(["klant", "beheerder"]).optional(),
  geblokkeerd: z.boolean().optional(),
});

async function nietJezelf(email: string) {
  const ik = await huidigAccount();
  if (ik && ik.email === email.toLowerCase()) throw AppError.validation("Dit is je eigen account.");
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    await nietJezelf(parsed.data.email);
    return NextResponse.json({ account: await beheerAccount(parsed.data.email, { rol: parsed.data.rol, geblokkeerd: parsed.data.geblokkeerd }) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.pick({ email: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekend account.");
    await nietJezelf(parsed.data.email);
    await verwijderAccount(parsed.data.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
