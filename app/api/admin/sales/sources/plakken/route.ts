import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { bronUrlSchema } from "@/lib/sales/bron-url";
import { MAX_BRONNEN_PLAKKEN, beoordeelBronnen, deelRegels } from "@/lib/sales/bronnen-plakken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  campaignId: z.string().min(1).max(128),
  tekst: z.string().max(MAX_BRONNEN_PLAKKEN * 600),
  /** false = alleen de voorvertoning (nieuw / dubbel / ongeldig); true = de nieuwe opslaan */
  opslaan: z.boolean().default(false),
});

// POST /api/admin/sales/sources/plakken — meerdere vacaturepagina's tegelijk, per regel een URL of "label | URL" (hooguit 50).
// Eerst een voorvertoning, dan opslaan; ontdubbeld tegen wat er al bij de campagne staat. Eén auditregel met het aantal.
// Toevoegen verstuurt niets (lib/sales/bronnen-plakken.ts).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw AppError.validation(`Plak hooguit ${MAX_BRONNEN_PLAKKEN} regels met per regel een URL of "label | URL".`);
  const { campaignId, tekst, opslaan } = parsed.data;

  const regels = deelRegels(tekst);
  if (regels.length === 0) throw AppError.validation("Plak minstens één URL.");
  if (regels.length > MAX_BRONNEN_PLAKKEN) throw AppError.validation(`Hooguit ${MAX_BRONNEN_PLAKKEN} regels tegelijk; je plakte er ${regels.length}.`);

  const campaign = await prisma.salesCampaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true } });
  if (!campaign) throw AppError.notFound("Campagne niet gevonden");

  const bestaand = await prisma.salesDiscoverySource.findMany({ where: { campaignId }, select: { url: true } });
  const uitslag = beoordeelBronnen(regels, bestaand.map((b) => b.url), (url) => bronUrlSchema.safeParse(url).success);
  if (!opslaan) return NextResponse.json(uitslag);

  const nieuw = uitslag.regels.filter((r) => r.status === "nieuw");
  if (nieuw.length > 0) {
    await prisma.salesDiscoverySource.createMany({
      data: nieuw.map((r) => ({ campaignId, kind: "CAREERS_URL" as const, url: r.url, label: r.label })),
    });
    await recordAudit({
      category: "SALES",
      action: "sales.source.bulk_added",
      actorUserId: principal.userId,
      summary: `${nieuw.length} vacaturepagina('s) tegelijk toegevoegd aan "${campaign.name}" (${uitslag.dubbel} dubbel en ${uitslag.ongeldig} ongeldig overgeslagen)`,
      targetType: "salesCampaign",
      targetId: campaign.id,
    });
  }
  return NextResponse.json({ ...uitslag, opgeslagen: nieuw.length });
});
