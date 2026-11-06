import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { STANDAARD_GRATIS_MODEL, eigenBasisUrl, getGratisStand, setGratisStand } from "@/lib/ai/gratis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: staat "alles gratis" aan, en welke eigen server/model gebruiken we dan.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const stand = await getGratisStand();
  return NextResponse.json({
    ...stand,
    standaardBasis: eigenBasisUrl(),
    standaardModel: STANDAARD_GRATIS_MODEL,
  });
});

const schema = z.object({
  aan: z.boolean().optional(),
  basis: z.string().max(300).optional(),
  model: z.string().max(120).optional(),
});

// PUT: zet de gratis stand (zonder uitrol). Leeg laten = de standaard gebruiken.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldige waarde" } }, { status: 400 });
  }
  const stand = await setGratisStand(parsed.data);
  return NextResponse.json({
    ok: true,
    ...stand,
    standaardBasis: eigenBasisUrl(),
    standaardModel: STANDAARD_GRATIS_MODEL,
  });
});
