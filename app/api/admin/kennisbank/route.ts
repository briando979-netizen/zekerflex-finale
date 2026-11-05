import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { clients, outlinePubliekeUrl } from "@/lib/oidc/aanbieder";
import { bewaarApiSleutel, handleidingenOpSchijf, kennisbankIngesteld, leesStand, outlineGezond, vulKennisbank } from "@/lib/kennisbank/outline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → AI & automatisering → Kennisbank: de stand van Outline, de koppeling
// "Inloggen met ZekerFlex", de API-sleutel en het vullen met de handleidingen.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [stand, gezond, opSchijf] = await Promise.all([leesStand(), outlineGezond(), handleidingenOpSchijf()]);
  return NextResponse.json({
    ingesteld: kennisbankIngesteld(),
    gezond,
    url: outlinePubliekeUrl(),
    interneUrl: env.OUTLINE_URL ?? null,
    oidc: clients().map((c) => ({ id: c.id, naam: c.naam, redirectUris: c.redirectUris })),
    stand,
    opSchijf: opSchijf.map((v) => ({ verzameling: v.verzameling, documenten: v.documenten.map((d) => d.titel) })),
  });
});

const schema = z.discriminatedUnion("actie", [z.object({ actie: z.literal("api-sleutel"), sleutel: z.string().min(10).max(200) }), z.object({ actie: z.literal("vullen") })]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekend verzoek.");
  if (parsed.data.actie === "api-sleutel") {
    await bewaarApiSleutel(parsed.data.sleutel);
    return NextResponse.json({ ok: true });
  }
  const stand = await vulKennisbank();
  return NextResponse.json({ ok: !stand.laatsteFout, stand });
});
