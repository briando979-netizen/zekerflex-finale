import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { bezorgingMislukt } from "@/lib/mail/test-adres";
import { getLocale } from "@/lib/i18n/server";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { enforceRateLimit } from "@/lib/rate-limit";
import { eisBeheer } from "@/lib/horeca/toegang";
import { BLOKKEN, MAX_TEKST } from "@/lib/horeca-personeel/model";
import { uitnodigingMail } from "@/lib/horeca-personeel/mail";
import { personeelTeksten } from "@/lib/horeca-personeel/teksten";
import {
  bewaarDashboard,
  leesPersoneelVan,
  nieuweUitnodiging,
  nodigUit,
  plaatsMededeling,
  stopMedewerker,
  uitnodigingsLink,
  verwijderDashboard,
  verwijderMededeling,
  verwijderMedewerker,
  wijzigMedewerker,
} from "@/lib/horeca-personeel/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Het personeel van de horecazaak (lib/horeca-personeel): dashboards per rol, medewerkers uitnodigen en mededelingen.
// Alleen de beheerder van het bedrijf (lib/horeca/toegang.ts). GET geeft alles voor het scherm, POST één actie.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

const kort = z.string().trim().min(1).max(60);
const id = z.string().min(1).max(40);

const actieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("voorbeeld") }),
  z.object({ actie: z.literal("dashboard"), id: id.optional(), naam: kort, blokken: z.array(z.enum(BLOKKEN)).max(BLOKKEN.length) }),
  z.object({ actie: z.literal("dashboard-weg"), id }),
  z.object({ actie: z.literal("uitnodigen"), naam: kort, email: z.string().trim().email().max(200), functie: z.string().trim().max(60).default(""), dashboardId: id }),
  z.object({ actie: z.literal("nieuwe-link"), id }),
  z.object({ actie: z.literal("wijzig"), id, functie: z.string().trim().max(60).optional(), dashboardId: id.optional() }),
  z.object({ actie: z.literal("stop"), id }),
  z.object({ actie: z.literal("weg"), id }),
  z.object({ actie: z.literal("mededeling"), tekst: z.string().trim().min(1).max(MAX_TEKST), dashboardIds: z.array(id).max(12).default([]) }),
  z.object({ actie: z.literal("mededeling-weg"), id }),
]);

export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eisBeheer();
    return NextResponse.json({ data: await leesPersoneelVan(tenantId) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { p, tenantId, zaak } = await eisBeheer();
    await enforceRateLimit({ name: "horeca-personeel", identifier: tenantId, limit: 120, windowSeconds: 3600 });
    const parsed = actieSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    const a = parsed.data;
    const locale = await getLocale();
    const t = personeelTeksten(locale);

    switch (a.actie) {
      case "voorbeeld": {
        const huidig = await leesPersoneelVan(tenantId);
        if (huidig.dashboards.length > 0) return NextResponse.json({ data: huidig });
        await bewaarDashboard(tenantId, { naam: locale === "en" ? "Front of house" : "Bediening", blokken: ["taken", "mededelingen"] });
        return NextResponse.json({ data: await bewaarDashboard(tenantId, { naam: locale === "en" ? "Kitchen" : "Keuken", blokken: ["taken", "mededelingen"] }) });
      }
      case "dashboard":
        return NextResponse.json({ data: await bewaarDashboard(tenantId, { id: a.id, naam: a.naam, blokken: a.blokken }) });
      case "dashboard-weg":
        return NextResponse.json({ data: await verwijderDashboard(tenantId, a.id) });
      case "uitnodigen": {
        const { data, medewerker, token } = await nodigUit(tenantId, zaak.naam, { naam: a.naam, email: a.email, functie: a.functie, dashboardId: a.dashboardId });
        const link = uitnodigingsLink(token);
        const mail = uitnodigingMail({ naam: medewerker.naam, zaak: zaak.naam, beheerder: p.fullName, link, taal: locale });
        const res = await sendMail({ ...mail, to: medewerker.email }).catch((err: unknown) => {
          logger.warn("horeca-personeel: uitnodiging mailen mislukt", { tenantId, error: (err as Error).message });
          return null;
        });
        const verstuurd = Boolean(res?.delivered) && !bezorgingMislukt(res, medewerker.email);
        await recordAudit({
          category: "COMPANY",
          action: "horeca.personeel.uitgenodigd",
          actorUserId: p.userId,
          actorLabel: "user",
          summary: `${p.email} nodigde een medewerker uit voor ${zaak.naam}`,
          targetType: "horecaMedewerker",
          targetId: medewerker.id,
          metadata: { tenantId, dashboardId: a.dashboardId },
        });
        return NextResponse.json({ data, link, melding: verstuurd ? t.beheer.uitnodigingVerstuurd : t.beheer.mailMislukt, mailVerstuurd: verstuurd, email: medewerker.email }, { status: 201 });
      }
      case "nieuwe-link": {
        const { medewerker, token } = await nieuweUitnodiging(tenantId, zaak.naam, a.id);
        const link = uitnodigingsLink(token);
        const mail = uitnodigingMail({ naam: medewerker.naam, zaak: zaak.naam, beheerder: p.fullName, link, taal: locale });
        const res = await sendMail({ ...mail, to: medewerker.email }).catch(() => null);
        const verstuurd = Boolean(res?.delivered) && !bezorgingMislukt(res, medewerker.email);
        return NextResponse.json({ data: await leesPersoneelVan(tenantId), link, melding: verstuurd ? t.beheer.uitnodigingVerstuurd : t.beheer.mailMislukt, mailVerstuurd: verstuurd, email: medewerker.email });
      }
      case "wijzig":
        return NextResponse.json({ data: await wijzigMedewerker(tenantId, a.id, { functie: a.functie, dashboardId: a.dashboardId }) });
      case "stop":
        return NextResponse.json({ data: await stopMedewerker(tenantId, a.id) });
      case "weg":
        return NextResponse.json({ data: await verwijderMedewerker(tenantId, a.id) });
      case "mededeling":
        return NextResponse.json({ data: await plaatsMededeling(tenantId, { tekst: a.tekst, dashboardIds: a.dashboardIds }) });
      case "mededeling-weg":
        return NextResponse.json({ data: await verwijderMededeling(tenantId, a.id) });
    }
  } catch (err) {
    return fout(err);
  }
}
