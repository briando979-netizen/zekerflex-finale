import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { bouwer, bouwerLlm, githubSleutel, type Taak, type TaakKort } from "@/lib/bouwer/werker";
import { isBezig, leesLive, plaatsVerzoek } from "@/lib/bouwer/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().regex(/^b_[a-z0-9]+$/) });

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const p = paramsSchema.safeParse(params);
  if (!p.success) throw AppError.notFound("Opdracht niet gevonden");
  const taak = await bouwer<Taak>(`/taken/${p.data.id}`);

  // Goedkeuren loopt op de achtergrond; zodra de push gelukt is en "live zetten"
  // gevraagd was, legt de eerstvolgende peiling het verzoek bij de live-zetter neer.
  let live: "gestart" | "bezig" | null = null;
  if (taak.staat === "gepusht" && taak.liveZetten && !taak.liveVerzocht) {
    const stand = await leesLive();
    if (stand.verzoek || isBezig(stand.status)) live = "bezig";
    else {
      await plaatsVerzoek({ actie: "uitrollen", migraties: [], destructiefAkkoord: false, forceer: false, door: principal.email });
      live = "gestart";
    }
    await bouwer(`/taken/${p.data.id}/live-verzocht`, { method: "POST", body: {} });
    taak.liveVerzocht = true;
  }
  return NextResponse.json({ ...taak, live });
});

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("bijsturen"), bericht: z.string().trim().min(2).max(4000) }),
  z.object({ actie: z.literal("goedkeuren"), liveZetten: z.boolean().default(true) }),
  z.object({ actie: z.literal("weggooien") }),
  z.object({ actie: z.literal("stop") }),
]);

export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const p = paramsSchema.safeParse(params);
  if (!p.success) throw AppError.notFound("Opdracht niet gevonden");
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekende actie");
  const body = parsed.data;
  const pad = `/taken/${p.data.id}/${body.actie}`;

  const audit = (action: string, summary: string, severity: "info" | "warning" = "info") =>
    recordAudit({ category: "ADMIN", action, severity, actorUserId: principal.userId, actorLabel: "user", summary });

  if (body.actie === "bijsturen") {
    const taak = await bouwer<TaakKort>(pad, { method: "POST", body: { bericht: body.bericht, door: principal.email, llm: await bouwerLlm() } });
    await audit("admin.bouwer.bijsturen", `${principal.email} stuurde de Bouwer bij: ${body.bericht.slice(0, 200)}`);
    return NextResponse.json(taak);
  }

  if (body.actie === "goedkeuren") {
    const token = await githubSleutel();
    if (!token) throw AppError.precondition("Vul eerst een GitHub-sleutel in (Bouwer → Instellingen)");
    const taak = await bouwer<TaakKort>(pad, { method: "POST", body: { door: principal.email, githubToken: token, liveZetten: body.liveZetten } });
    await audit(
      "admin.bouwer.goedgekeurd",
      `${principal.email} keurde Bouwer-opdracht ${p.data.id} goed${body.liveZetten ? " en liet hem live zetten" : ""}`,
      "warning",
    );
    return NextResponse.json(taak, { status: 202 });
  }

  const taak = await bouwer<TaakKort>(pad, { method: "POST", body: {} });
  if (body.actie === "weggooien") await audit("admin.bouwer.weggegooid", `${principal.email} gooide Bouwer-opdracht ${p.data.id} weg`);
  return NextResponse.json(taak);
});
