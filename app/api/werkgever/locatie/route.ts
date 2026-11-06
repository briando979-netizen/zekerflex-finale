import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { featureEnabled } from "@/lib/flags";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isCompTenant } from "@/lib/billing/comp";
import { createLead } from "@/lib/sales/leads";
import { parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { LABEL_SOORTEN, MODULES, MODULE_DEFS, type LabelInhoud } from "@/lib/locatie/modules";
import { bedrijfsnaam, eisVestiging, locatieScope, locatieStand, zetModule } from "@/lib/locatie/store";
import { bordData } from "@/lib/locatie/bord";
import {
  maakKastjeToken,
  openHandmatig,
  verwerkAankomst,
  verwijderRegistratie,
  zetRegistratie,
  zetVestigingToegang,
} from "@/lib/locatie/toegang";
import { kluisItems, onthulGeheim, verwijderKluisItem, zetKluisItem } from "@/lib/locatie/kluis";
import { maakAgentToken, verwijderAgent, voegOpdrachtToe, zetOpdrachtStatus, zetPrintInstellingen } from "@/lib/locatie/printen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Werkgever → Op locatie: de vier modules (lib/locatie). GET geeft alles voor het
// bord; POST voert één handeling uit. Instellingen, tokens en de kluis vullen
// zijn voor de beheerder van het bedrijf (HQ_ADMIN); een vestigingsbeheerder
// mag openen, bezoekers aanmelden, codes bekijken en labels printen.
// ---------------------------------------------------------------------------

const lokaleTijd = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Kies een datum en tijd.");

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("module"), sleutel: z.enum(MODULES), aan: z.boolean() }),
  // toegang
  z.object({
    action: z.literal("toegang-registratie"),
    kenteken: z.string().min(2).max(20),
    soort: z.enum(["medewerker", "bezoeker", "leverancier"]),
    naam: z.string().min(1).max(80),
    branchId: z.string().max(64).optional(),
    geldigVan: lokaleTijd.optional(),
    geldigTot: lokaleTijd.optional(),
    toelichting: z.string().max(300).optional(),
  }),
  z.object({ action: z.literal("toegang-registratie-weg"), kenteken: z.string().min(2).max(20) }),
  z.object({
    action: z.literal("toegang-vestiging"),
    branchId: z.string().min(1).max(64),
    aan: z.boolean().optional(),
    openSeconden: z.number().int().min(1).max(60).optional(),
    meldPlanner: z.boolean().optional(),
    meldWerker: z.boolean().optional(),
  }),
  z.object({ action: z.literal("toegang-token"), branchId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("toegang-open"), branchId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("toegang-proef"), branchId: z.string().min(1).max(64), kenteken: z.string().min(2).max(20) }),
  // kluis
  z.object({
    action: z.literal("kluis-zet"),
    id: z.string().max(40).optional(),
    titel: z.string().min(1).max(80),
    soort: z.enum(["wifi", "alarm", "sleutelkastje", "inlog", "deur", "overig"]),
    branchId: z.string().max(64).optional(),
    gebruikersnaam: z.string().max(120).optional(),
    geheim: z.string().max(2000).optional(),
    notitie: z.string().max(500).optional(),
    minutenVooraf: z.number().int().min(0).max(1440).optional(),
    vervangNaDienst: z.boolean().optional(),
  }),
  z.object({ action: z.literal("kluis-weg"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("kluis-onthul"), id: z.string().min(1).max(40) }),
  // printen
  z.object({
    action: z.literal("print-instellingen"),
    badgeBijInchecken: z.boolean().optional(),
    badgeSoort: z.enum(LABEL_SOORTEN).optional(),
    branchIds: z.array(z.string().max(64)).max(50).optional(),
    voet: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal("print-nieuw"),
    soort: z.enum(LABEL_SOORTEN),
    kop: z.string().min(1).max(60),
    regels: z.array(z.string().max(80)).max(8),
    voet: z.string().max(60).optional(),
    qr: z.string().max(300).optional(),
    branchId: z.string().max(64).optional(),
  }),
  z.object({ action: z.literal("print-status"), id: z.string().min(1).max(40), status: z.enum(["geprint", "mislukt", "ingetrokken"]) }),
  z.object({ action: z.literal("print-agent-token"), naam: z.string().max(60) }),
  z.object({ action: z.literal("print-agent-weg") }),
]);

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    if (!(await featureEnabled("locatie-modules", { userId: p.userId }))) throw AppError.forbidden("Op locatie staat op dit moment uit.");
    const scope = await locatieScope(p);
    return NextResponse.json(await bordData(scope));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    if (!(await featureEnabled("locatie-modules", { userId: p.userId }))) throw AppError.forbidden("Op locatie staat op dit moment uit.");
    const scope = await locatieScope(p);
    const input = schema.parse(await request.json().catch(() => ({})));
    const door = { userId: p.userId, naam: p.fullName };
    const beheer = () => {
      if (!scope.magBeheren) throw AppError.forbidden("Alleen de beheerder van het bedrijf kan dit instellen.");
    };
    let melding = "Opgeslagen.";
    let geheim: string | undefined;
    let token: string | undefined;
    let proef: unknown;

    switch (input.action) {
      case "module": {
        beheer();
        const was = (await locatieStand(scope.tenantId)).modules[input.sleutel];
        await zetModule(scope.tenantId, input.sleutel, input.aan, door);
        const def = MODULE_DEFS[input.sleutel];
        await recordAudit({
          category: "COMPANY",
          action: input.aan ? "locatie.module.aan" : "locatie.module.uit",
          actorUserId: p.userId,
          summary: `${def.naam} ${input.aan ? "aangezet" : "uitgezet"}`,
          targetType: "tenant",
          targetId: scope.tenantId,
        });
        // de eerste keer aan bij een betalend bedrijf: sales hoort het (de prijs is nog "op aanvraag")
        if (input.aan && !was && !(await isCompTenant(scope.tenantId))) {
          createLead({
            companyName: await bedrijfsnaam(scope.tenantId),
            contactName: p.fullName,
            contactEmail: p.email,
            source: `locatie-${input.sleutel}`,
            notes: `Zette "${def.naam}" aan via Werkgever → Op locatie. Prijs is nog op aanvraag: neem contact op voor een voorstel.`,
            createdById: p.userId,
          }).catch((e: unknown) => logger.warn("lead voor locatiemodule mislukt", { message: e instanceof Error ? e.message : String(e) }));
        }
        melding = input.aan ? `${def.naam} staat aan.` : `${def.naam} staat uit. Je instellingen blijven bewaard.`;
        break;
      }
      case "toegang-registratie": {
        if (input.soort === "medewerker") beheer();
        if (input.branchId) await eisVestiging(scope, input.branchId);
        else if (scope.branchIds) throw AppError.forbidden("Kies een van je eigen vestigingen.");
        await zetRegistratie(
          scope.tenantId,
          {
            kenteken: input.kenteken,
            soort: input.soort,
            naam: input.naam,
            branchId: input.branchId,
            toelichting: input.toelichting,
            geldigVan: input.geldigVan ? parseAmsterdamLocal(input.geldigVan).toISOString() : undefined,
            geldigTot: input.geldigTot ? parseAmsterdamLocal(input.geldigTot).toISOString() : undefined,
          },
          p.userId,
        );
        melding = "Kenteken opgeslagen.";
        break;
      }
      case "toegang-registratie-weg":
        beheer();
        await verwijderRegistratie(scope.tenantId, input.kenteken);
        melding = "Kenteken verwijderd.";
        break;
      case "toegang-vestiging":
        beheer();
        await eisVestiging(scope, input.branchId);
        await zetVestigingToegang(scope.tenantId, input.branchId, { aan: input.aan, openSeconden: input.openSeconden, meldPlanner: input.meldPlanner, meldWerker: input.meldWerker });
        break;
      case "toegang-token": {
        beheer();
        const v = await eisVestiging(scope, input.branchId);
        token = (await maakKastjeToken(scope.tenantId, input.branchId)).token;
        await recordAudit({ category: "SECURITY", action: "locatie.toegang.token", actorUserId: p.userId, summary: `Nieuw token voor het toegangskastje van ${v.naam}`, targetType: "branch", targetId: input.branchId });
        melding = "Nieuw token gemaakt. Zet het in het kastje; je ziet het maar één keer.";
        break;
      }
      case "toegang-open": {
        const v = await eisVestiging(scope, input.branchId);
        await openHandmatig(scope.tenantId, input.branchId, door);
        await recordAudit({ category: "SECURITY", action: "locatie.toegang.handmatig", actorUserId: p.userId, summary: `Slagboom van ${v.naam} handmatig geopend`, targetType: "branch", targetId: input.branchId });
        melding = "Opdracht verstuurd: het kastje opent binnen een paar seconden.";
        break;
      }
      case "toegang-proef": {
        await eisVestiging(scope, input.branchId);
        const { event } = await verwerkAankomst({ tenantId: scope.tenantId, branchId: input.branchId, kenteken: input.kenteken, bron: "proef" });
        proef = event;
        melding = event.besluit.open ? "Proef: dit kenteken zou nu toegang krijgen." : "Proef: dit kenteken zou nu niet opengaan.";
        break;
      }
      case "kluis-zet":
        beheer();
        if (input.branchId) await eisVestiging(scope, input.branchId);
        await zetKluisItem(scope.tenantId, input, door);
        await recordAudit({ category: "SECURITY", action: "locatie.kluis.gewijzigd", actorUserId: p.userId, summary: `Kluis: "${input.titel}" ${input.id ? "bijgewerkt" : "toegevoegd"}`, targetType: "tenant", targetId: scope.tenantId });
        break;
      case "kluis-weg":
        beheer();
        await verwijderKluisItem(scope.tenantId, input.id);
        melding = "Item verwijderd.";
        break;
      case "kluis-onthul": {
        const items = await kluisItems(scope.tenantId, scope.branchIds);
        if (!items.some((i) => i.id === input.id)) throw AppError.notFound("Item niet gevonden.");
        geheim = (await onthulGeheim(scope.tenantId, input.id, { ...door, rol: "team" })).geheim;
        melding = "Zichtbaar; dit staat in het logboek.";
        break;
      }
      case "print-instellingen":
        beheer();
        for (const b of input.branchIds ?? []) await eisVestiging(scope, b);
        await zetPrintInstellingen(scope.tenantId, { badgeBijInchecken: input.badgeBijInchecken, badgeSoort: input.badgeSoort, branchIds: input.branchIds, voet: input.voet });
        break;
      case "print-nieuw": {
        if (input.branchId) await eisVestiging(scope, input.branchId);
        const inhoud: LabelInhoud = { soort: input.soort, kop: input.kop, regels: input.regels, ...(input.voet ? { voet: input.voet } : {}), ...(input.qr ? { qr: input.qr } : {}) };
        proef = await voegOpdrachtToe(scope.tenantId, inhoud, { branchId: input.branchId, door: p.userId, doorNaam: p.fullName, bron: "handmatig" });
        melding = "In de wachtrij gezet.";
        break;
      }
      case "print-status":
        await zetOpdrachtStatus(scope.tenantId, input.id, input.status);
        break;
      case "print-agent-token":
        beheer();
        token = (await maakAgentToken(scope.tenantId, input.naam)).token;
        await recordAudit({ category: "SECURITY", action: "locatie.printen.token", actorUserId: p.userId, summary: "Nieuw token voor de printagent", targetType: "tenant", targetId: scope.tenantId });
        melding = "Nieuw token gemaakt. Zet het in de printagent; je ziet het maar één keer.";
        break;
      case "print-agent-weg":
        beheer();
        await verwijderAgent(scope.tenantId);
        melding = "Printagent losgekoppeld.";
        break;
    }
    return NextResponse.json({ ...(await bordData(scope)), melding, ...(geheim !== undefined ? { geheim } : {}), ...(token ? { token } : {}), ...(proef !== undefined ? { proef } : {}) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
