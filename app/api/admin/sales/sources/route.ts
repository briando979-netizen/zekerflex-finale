import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  campaignId: z.string().min(1).max(128),
  kind: z.enum(["KVKBASE", "CAREERS_URL"]),
  url: z.string().trim().url().max(400).optional(),
  label: z.string().trim().max(120).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const campaignId = new URL(request.url).searchParams.get("campaignId");
    const sources = await prisma.salesDiscoverySource.findMany({
      where: campaignId ? { campaignId } : {},
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ sources });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Ongeldige bron", parsed.error.flatten());
    if (parsed.data.kind === "CAREERS_URL" && !parsed.data.url) {
      throw AppError.validation("Een careers-bron heeft een URL nodig");
    }
    const campaign = await prisma.salesCampaign.findUnique({ where: { id: parsed.data.campaignId } });
    if (!campaign) throw AppError.notFound("Campagne niet gevonden");

    const source = await prisma.salesDiscoverySource.create({
      data: {
        campaignId: parsed.data.campaignId,
        kind: parsed.data.kind,
        url: parsed.data.url ?? null,
        label: parsed.data.label ?? null,
      },
    });
    await recordAudit({
      category: "SALES",
      action: "sales.source.added",
      actorUserId: principal.userId,
      summary: `Discovery-bron toegevoegd (${source.kind}) aan "${campaign.name}"`,
      targetType: "salesDiscoverySource",
      targetId: source.id,
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const deleteSchema = z.object({ id: z.string().min(1).max(128) });

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const { id } = deleteSchema.parse(json);
    await prisma.salesDiscoverySource.delete({ where: { id } }).catch(() => undefined);
    await recordAudit({
      category: "SALES",
      action: "sales.source.removed",
      actorUserId: principal.userId,
      summary: `Discovery-bron verwijderd (${id})`,
      targetType: "salesDiscoverySource",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
