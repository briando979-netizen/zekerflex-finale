import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, type Principal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { siteTenantOf } from "@/lib/sites/access";
import { getDomain } from "@/lib/sites/domain";
import { siteOfTenant } from "@/lib/sites/store";
import { gesprekken, haalGesprek, markeerGelezen, voegBerichtToe, wijsToe, zetStatus } from "@/lib/sitechat/gesprek";
import { voorbeeld } from "@/lib/sitechat/regels";
import { chatAan, chatInstelling, siteKanaal, zetChat } from "@/lib/sitechat/site-instelling";
import { chatStandaardAan } from "@/lib/sitechat/site-kennis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De chat op de eigen website (lib/sitechat) in de werkgeversomgeving: alle
// gesprekken, meelezen terwijl de assistent antwoordt, overnemen (de
// assistent zwijgt dan), antwoorden, teruggeven, sluiten, toewijzen aan een
// collega en de chat op de website aan- of uitzetten.
// GET            → instelling, gesprekken en het team
// GET ?id=<id>   → één gesprek (en gelezen)
// POST {actie}   → antwoord | overnemen | teruggeven | sluiten | toewijzen | aan
// ---------------------------------------------------------------------------

/** Beheerders en locatiemanagers van het bedrijf, of een platformbeheerder voor zijn eigen bedrijf. */
async function bedrijfVan(p: Principal): Promise<string> {
  const grant = p.grants.find((g) => g.role === "HQ_ADMIN" || g.role === "LOCAL_MANAGER");
  return grant ? grant.organizationId : siteTenantOf(p);
}

async function team(tenantId: string) {
  const leden = await prisma.membership.findMany({
    where: { tenantId, role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] } },
    select: { user: { select: { email: true, fullName: true } } },
  });
  const gezien = new Set<string>();
  return leden
    .map((l) => ({ email: l.user.email.toLowerCase(), naam: l.user.fullName }))
    .filter((l) => !gezien.has(l.email) && Boolean(gezien.add(l.email)));
}

const fout = (err: unknown) => {
  const { status, body } = toErrorBody(err);
  return NextResponse.json(body, { status });
};

async function context() {
  const p = await requirePrincipal();
  const tenantId = await bedrijfVan(p);
  const site = await siteOfTenant(tenantId);
  return { p, tenantId, site };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { p, tenantId, site } = await context();
    if (!site) return NextResponse.json({ site: null });
    const kanaal = siteKanaal(site.id);
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const g = await haalGesprek(kanaal, id);
      if (!g) throw AppError.notFound("Gesprek niet gevonden.");
      return NextResponse.json({ gesprek: g.ongelezen ? await markeerGelezen(kanaal, id) : g });
    }
    const [lijst, leden, keuze, aan, domein] = await Promise.all([gesprekken(kanaal), team(tenantId), chatInstelling(site.id), chatAan(site), getDomain(site.id).catch(() => null)]);
    const basis = domein?.activeAt ? `https://${domein.host}/` : `${env.APP_BASE_URL.replace(/\/+$/, "")}/site/${site.slug}/`;
    return NextResponse.json({
      site: { naam: site.bedrijf.naam, gepubliceerd: Boolean(site.liveBuild), chatAdres: `${basis}_zf/chat` },
      aan,
      gekozen: Boolean(keuze),
      standaard: chatStandaardAan(site),
      ik: p.email.toLowerCase(),
      team: leden,
      gesprekken: lijst.map((g) => ({
        id: g.id,
        status: g.status,
        laatst: g.laatst,
        ongelezen: g.ongelezen,
        aantal: g.berichten.length,
        toegewezen: g.toegewezen ?? "",
        voorbeeld: voorbeeld(g),
      })),
    });
  } catch (err) {
    return fout(err);
  }
}

const ID = z.string().regex(/^[A-Za-z0-9_-]{16,48}$/);
const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("antwoord"), id: ID, tekst: z.string().trim().min(1, "Schrijf eerst een bericht.").max(2000) }),
  z.object({ actie: z.literal("overnemen"), id: ID }),
  z.object({ actie: z.literal("teruggeven"), id: ID }),
  z.object({ actie: z.literal("sluiten"), id: ID }),
  z.object({ actie: z.literal("toewijzen"), id: ID, wie: z.string().max(200) }),
  z.object({ actie: z.literal("aan"), aan: z.boolean() }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw AppError.validation("Verwacht JSON.");
    const { p, tenantId, site } = await context();
    if (!site) throw AppError.notFound("Je hebt nog geen website.");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Ongeldige actie.");
    const d = parsed.data;
    if (d.actie === "aan") {
      await zetChat(site.id, d.aan, p.fullName);
      return NextResponse.json({ aan: d.aan });
    }
    const kanaal = siteKanaal(site.id);
    if (!(await haalGesprek(kanaal, d.id))) throw AppError.notFound("Gesprek niet gevonden.");
    const naam = `${p.fullName.split(" ")[0] || p.fullName} (${site.bedrijf.naam})`;
    if (d.actie === "antwoord") {
      await voegBerichtToe(kanaal, d.id, { rol: "medewerker", tekst: d.tekst, door: naam });
      await zetStatus(kanaal, d.id, "mens");
    } else if (d.actie === "overnemen") {
      await voegBerichtToe(kanaal, d.id, { rol: "systeem", tekst: `${naam} leest mee en neemt het gesprek over.` });
      await zetStatus(kanaal, d.id, "mens");
    } else if (d.actie === "teruggeven") {
      await voegBerichtToe(kanaal, d.id, { rol: "systeem", tekst: "De assistent helpt je weer verder. Je kunt altijd opnieuw om een medewerker vragen." });
      await zetStatus(kanaal, d.id, "ai");
    } else if (d.actie === "sluiten") {
      await voegBerichtToe(kanaal, d.id, { rol: "systeem", tekst: "Dit gesprek is afgesloten. Stel gerust een nieuwe vraag." });
      await zetStatus(kanaal, d.id, "gesloten");
    } else {
      const e = d.wie.trim().toLowerCase();
      if (e && !(await team(tenantId)).some((t) => t.email === e)) throw AppError.validation("Kies iemand van je team.");
      await wijsToe(kanaal, d.id, e);
    }
    return NextResponse.json({ gesprek: await haalGesprek(kanaal, d.id) });
  } catch (err) {
    return fout(err);
  }
}
