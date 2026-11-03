import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { bewaarServiceAccount, leesSleutelbestand, serviceAccountInfo, tokenVoor, verwijderServiceAccount } from "@/lib/play/account";
import { bouwerIngesteld } from "@/lib/rijschool/app/bouwer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function stand() {
  const [sa, apps] = await Promise.all([
    serviceAccountInfo(),
    prisma.rijschoolApp.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        pakketnaam: true,
        appNaam: true,
        versie: true,
        gekoppeldOp: true,
        liveSinds: true,
        taakFase: true,
        playVingerafdruk: true,
        updatedAt: true,
        rijschool: { select: { naam: true, slug: true } },
      },
    }),
  ]);
  return { serviceAccount: sa, bouwer: bouwerIngesteld(), apps };
}

// GET: het serviceaccount (alleen het e-mailadres) en alle rijschool-apps.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await stand()));

const schema = z.object({ sleutel: z.string().min(50).max(20_000) });

// PUT: de JSON-sleutel van het serviceaccount; eerst bij Google gecontroleerd, dan verzegeld bewaard.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Plak de volledige inhoud van het sleutelbestand." } }, { status: 400 });
    const sa = leesSleutelbestand(parsed.data.sleutel);
    // een sleutel die Google weigert, bewaren we niet (de vorige blijft dan staan)
    await tokenVoor(sa);
    await bewaarServiceAccount(sa, principal.fullName);
    return NextResponse.json({ ok: true, ...(await stand()) });
  } catch (err) {
    return fout(err);
  }
});

// DELETE: koppeling met Google Play weghalen.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  await verwijderServiceAccount();
  return NextResponse.json({ ok: true, ...(await stand()) });
});
