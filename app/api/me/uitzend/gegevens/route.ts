import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor, setFiscal } from "@/lib/fiscal/store";
import { controleerWoonadres, gegevensVoorContractCompleet, leesWoonadres, netteNlPostcode } from "@/lib/agreements/uitzend-gegevens";
import { controleerGeboortedatum } from "@/lib/onboarding/wie-ben-jij";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De gegevens van de uitzendkracht in de uitzendovereenkomst (sjabloon v3, 15 nov 2026): geboortedatum en woonadres. Het scherm
// vraagt ze vóór de knop "Ondertekenen" (components/app/UitzendContractCard.tsx); de overeenkomst neemt ze over bij het tekenen.

type Stand = { naam: string; geboortedatum: string | null; woonadres: ReturnType<typeof leesWoonadres>; postcodeVoorstel: string | null; compleet: boolean };

async function stand(userId: string, naam: string): Promise<Stand> {
  const [fiscal, profiel] = await Promise.all([
    getFiscal(userId),
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { homePostalCode: true } }).catch(() => null),
  ]);
  return {
    naam,
    geboortedatum: fiscal.birthDate,
    woonadres: leesWoonadres(fiscal.woonadres),
    // de postcode van de thuisbasis als begin, zodat de werker die niet opnieuw hoeft te typen
    postcodeVoorstel: netteNlPostcode(profiel?.homePostalCode ?? ""),
    compleet: gegevensVoorContractCompleet(fiscal),
  };
}

// GET /api/me/uitzend/gegevens: mijn naam, geboortedatum en woonadres zoals ze in de overeenkomst komen.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    return NextResponse.json(await stand(p.userId, p.fullName), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/me/uitzend/gegevens { woonadres: { straat, huisnummer, postcode, plaats, land }, geboortedatum? }: opslaan en de
// bewaarde stand teruggeven. De geboortedatum alleen als hij nog ontbreekt of wordt meegestuurd (stap 1 vraagt hem ook).
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    await enforceRateLimit({ name: "me-uitzend-gegevens", identifier: p.userId, limit: 30, windowSeconds: 600, message: "Even te vaak. Probeer het over een paar minuten opnieuw." });
    const fiscal = await getFiscal(p.userId);
    if (invoiceModeFor(fiscal) !== "payroll") throw AppError.precondition("Alleen uitzendkrachten hebben een uitzendovereenkomst.");

    const body = (await request.json().catch(() => ({}))) as { woonadres?: unknown; geboortedatum?: unknown };
    const adres = controleerWoonadres(body.woonadres);
    if (!adres.ok) throw AppError.validation("Controleer je woonadres.", { veld: adres.veld });
    const patch: { woonadres: typeof adres.adres; birthDate?: string } = { woonadres: adres.adres };
    if (body.geboortedatum !== undefined && body.geboortedatum !== null && body.geboortedatum !== "") {
      const datum = typeof body.geboortedatum === "string" ? body.geboortedatum : "";
      const fout = controleerGeboortedatum(datum);
      if (fout) {
        throw AppError.validation(fout === "onder18" ? "Je moet minimaal 18 jaar zijn om via ZekerFlex te werken." : "Controleer je geboortedatum.", {
          veld: "geboortedatum",
          reden: fout,
        });
      }
      patch.birthDate = datum;
    } else if (!fiscal.birthDate) {
      throw AppError.validation("Vul je geboortedatum in.", { veld: "geboortedatum", reden: "leeg" });
    }
    await setFiscal(p.userId, patch);
    // geen adres of datum in het auditlog: alleen dat het is bijgewerkt
    await recordAudit({
      category: "AGREEMENT",
      action: "uitzendcontract.gegevens_bijgewerkt",
      severity: "info",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: "Gegevens voor de uitzendovereenkomst (woonadres) bijgewerkt",
      targetType: "user",
      targetId: p.userId,
    }).catch(() => undefined);
    return NextResponse.json(await stand(p.userId, p.fullName));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
