import { NextResponse } from "next/server";
import { userIdFromToken } from "@/lib/passport/token";
import { isPassportPublic } from "@/lib/passport/share";
import { buildPassport } from "@/lib/passport/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publieke, machinaal-leesbare echtheidscontrole van een werkpaspoort. Bouwt de
// huidige momentopname opnieuw op, berekent het zegel opnieuw en bevestigt dat
// de gegevens door ZekerFlex zijn uitgegeven (niet gemanipuleerd).
export async function GET(_req: Request, props: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await props.params;
  const userId = userIdFromToken(token);
  if (!userId || !(await isPassportPublic(userId))) {
    return NextResponse.json({ valid: false, reason: "Onbekend of niet (meer) gedeeld paspoort." }, { status: 404 });
  }
  const p = await buildPassport(userId);
  if (!p) {
    return NextResponse.json({ valid: false, reason: "Paspoort niet gevonden." }, { status: 404 });
  }
  return NextResponse.json({
    valid: true,
    issuer: p.seal.issuer,
    reference: p.seal.reference,
    contentHash: p.seal.contentHash,
    serverSeal: p.seal.serverSeal,
    sealedAt: p.seal.sealedAt,
    holder: {
      name: p.fullName,
      kvkNumber: p.kvkNumber,
      kvkVerified: p.kvkVerified,
      badgeLevel: p.badgeLevel,
      shiftsCompleted: p.shiftsCompleted,
      rating: p.rating,
    },
  });
}
