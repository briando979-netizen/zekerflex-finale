import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { liveVersie } from "@/lib/bouwer/versie";
import { agentLeeft, githubOverzicht, isBezig, leesLive, plaatsVerzoek, trekVerzoekIn } from "@/lib/bouwer/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → ZekerFlex AI → Live zetten. GET = live versie, wat er nieuw is op
// GitHub main, en de status van de live-zetter op de server. POST = een verzoek
// neerleggen dat de server oppakt (zie lib/bouwer/live.ts).

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const vers = new URL(request.url).searchParams.has("vers");
  const live = liveVersie();
  const [stand, github] = await Promise.all([
    leesLive(),
    githubOverzicht(live, vers).then(
      (data) => ({ data, fout: null as string | null }),
      (err: unknown) => ({ data: null, fout: err instanceof Error ? err.message : "GitHub onbereikbaar" }),
    ),
  ]);
  return NextResponse.json({
    live,
    github: github.data,
    githubFout: github.fout,
    status: stand.status,
    log: stand.log,
    verzoek: stand.verzoek,
    agent: { leeft: agentLeeft(stand.hartslag), hartslag: stand.hartslag },
    bezig: isBezig(stand.status),
  });
});

const schema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("uitrollen"),
    migraties: z.array(z.string().regex(/^[\w-]{1,120}$/)).max(50).default([]),
    destructiefAkkoord: z.boolean().default(false),
    forceer: z.boolean().default(false),
  }),
  z.object({ actie: z.literal("terug") }),
  z.object({ actie: z.literal("intrekken") }),
]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekend verzoek");
  const body = parsed.data;

  if (body.actie === "intrekken") {
    await trekVerzoekIn();
    return NextResponse.json({ ok: true });
  }

  const stand = await leesLive();
  if (stand.verzoek) throw AppError.conflict("Er ligt al een verzoek klaar voor de server");
  if (isBezig(stand.status)) throw AppError.conflict("Er loopt al een uitrol");

  const verzoek = await plaatsVerzoek(
    body.actie === "uitrollen"
      ? { actie: "uitrollen", migraties: body.migraties, destructiefAkkoord: body.destructiefAkkoord, forceer: body.forceer, door: principal.email }
      : { actie: "terug", migraties: [], destructiefAkkoord: false, forceer: false, door: principal.email },
  );

  await recordAudit({
    category: "ADMIN",
    action: body.actie === "uitrollen" ? "admin.live.uitrollen" : "admin.live.terug",
    severity: body.actie === "terug" || body.migraties.length > 0 ? "warning" : "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary:
      body.actie === "uitrollen"
        ? `${principal.email} zette de nieuwste versie live${body.migraties.length ? ` met ${body.migraties.length} database-wijziging(en): ${body.migraties.join(", ")}` : ""}${body.forceer ? " (geforceerd)" : ""}`
        : `${principal.email} zette de vorige versie terug`,
  });

  return NextResponse.json({ ok: true, verzoek });
});
