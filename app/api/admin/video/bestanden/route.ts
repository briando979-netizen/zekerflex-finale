import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { beeldBackend } from "@/lib/ai/images";
import { geminiBeschikbaar, geminiSlot } from "@/lib/ai/gemini-media";
import { MAX_BESTAND_BYTES, bestandenLijst, bewaarBestand, isBestandId, verwijderBestand, zetBestandInfo, type BestandHerkomst } from "@/lib/video/bestanden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// GET: alle bestanden van de video-editor + wat de AI nu kan.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [bestanden, beeld, gemini, slotBeeld, slotVideo] = await Promise.all([
    bestandenLijst(),
    beeldBackend(),
    geminiBeschikbaar(),
    geminiSlot("beeld"),
    geminiSlot("video"),
  ]);
  return NextResponse.json({
    bestanden,
    ai: {
      beeld,
      gemini,
      beeldMelding: slotBeeld?.melding ?? null,
      videoMelding: slotVideo?.melding ?? null,
    },
  });
});

const HERKOMST: BestandHerkomst[] = ["upload", "export", "opname", "muziek"];

// POST: een bestand toevoegen. Body = de ruwe bytes; naam in ?naam=, soort uit Content-Type.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const lengte = Number(request.headers.get("content-length") ?? 0);
  if (lengte > MAX_BESTAND_BYTES) throw AppError.validation("Dit bestand is groter dan 200 MB. Maak het korter of kleiner.");
  const url = new URL(request.url);
  const naam = (url.searchParams.get("naam") ?? "Bestand").slice(0, 120);
  const herkomstRuw = url.searchParams.get("herkomst") ?? "upload";
  const herkomst = (HERKOMST as string[]).includes(herkomstRuw) ? (herkomstRuw as BestandHerkomst) : "upload";
  const duurRuw = Number(url.searchParams.get("duur"));
  const data = Buffer.from(await request.arrayBuffer());
  const item = await bewaarBestand(data, naam, {
    gemeld: (request.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "",
    herkomst,
    ...(Number.isFinite(duurRuw) && duurRuw > 0 ? { duur: duurRuw } : {}),
  });
  return NextResponse.json({ ok: true, item });
});

const wijziging = z.object({
  id: z.string().refine(isBestandId),
  naam: z.string().max(80).optional(),
  duur: z.number().min(0).max(36000).optional(),
  breedte: z.number().int().min(0).max(20000).optional(),
  hoogte: z.number().int().min(0).max(20000).optional(),
});

// PATCH: naam of gemeten duur/maat (die meet de browser na het uploaden).
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const parsed = wijziging.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze wijziging kon niet worden gelezen.");
  const { id, ...info } = parsed.data;
  const item = await zetBestandInfo(id, {
    ...(info.naam !== undefined ? { naam: info.naam } : {}),
    ...(info.duur !== undefined ? { duur: info.duur } : {}),
    ...(info.breedte !== undefined ? { breedte: info.breedte } : {}),
    ...(info.hoogte !== undefined ? { hoogte: info.hoogte } : {}),
  });
  if (!item) throw AppError.validation("Dit bestand bestaat niet meer.");
  return NextResponse.json({ ok: true, item });
});

// DELETE ?id=…
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isBestandId(id)) throw AppError.validation("Onbekend bestand.");
  await verwijderBestand(id);
  return NextResponse.json({ ok: true });
});
