import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { kettingOverzicht, zetKetting } from "@/lib/ai/ketting-stand";
import { BLIJFT_EIGEN_TEKST, KETTING_DIENSTEN, type DienstId } from "@/lib/ai/ketting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De gratis rij (lib/ai/ketting.ts): per dienst of er een sleutel klaarstaat, of hij aan staat en welk model nu vol zit.
// Sleutels gaan er alleen in, nooit uit.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ diensten: await kettingOverzicht(), blijftEigen: BLIJFT_EIGEN_TEKST });
});

const schema = z.object({
  dienst: z.string().refine((id) => KETTING_DIENSTEN.some((d) => d.id === id), "onbekende dienst"),
  sleutel: z.string().max(400).optional(),
  account: z.string().max(100).optional(),
  aan: z.boolean().optional(),
});

// PUT: een sleutel of accountnummer bewaren (lege tekst = wissen) of een dienst aan/uit zetten. Zonder uitrol.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldige waarde" } }, { status: 400 });
  }
  await zetKetting({ ...parsed.data, dienst: parsed.data.dienst as DienstId });
  return NextResponse.json({ ok: true, diensten: await kettingOverzicht(), blijftEigen: BLIJFT_EIGEN_TEKST });
});
