import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { BRONNEN, KEUZE_DIENSTEN } from "@/lib/gratis/keuze-soorten";
import { getKeuzes, setKeuze } from "@/lib/gratis/keuzes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: welke bron gebruikt elke dienst nu.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () =>
  NextResponse.json({ keuzes: await getKeuzes() }),
);

const schema = z.object({
  dienst: z.enum(KEUZE_DIENSTEN),
  bron: z.enum(BRONNEN),
});

// PUT: zet de bron voor één dienst (zonder uitrol).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Onbekende dienst of bron" } }, { status: 400 });
  }
  const keuzes = await setKeuze(parsed.data.dienst, parsed.data.bron);
  return NextResponse.json({ ok: true, keuzes });
});
