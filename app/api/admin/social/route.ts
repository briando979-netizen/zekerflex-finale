import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { SITE } from "@/lib/seo";
import { amsterdamParts, amsterdamToUtc, parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { KANAAL_IDS, kanaalDef } from "@/lib/social/kanalen";
import { SLOT_UREN, kanaalIdSchema, komendeWerkdagen, postInvoerSchema, type AutopilotInstelling, type SocialPost } from "@/lib/social/model";
import { MetaFout, controleerToken } from "@/lib/social/meta";
import { verwerkBerichten } from "@/lib/social/publiceer";
import { socialOverzicht } from "@/lib/social/overzicht";
import { schrijfPosts } from "@/lib/social/schrijf";
import { deletePost, getAutopilot, getPost, metaToken, nieuwId, savePost, setAutopilot, setKanaalConfig, setMeta, wisMeta } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // een tekst laten schrijven door het eigen model kan even duren

// GET /api/admin/social: alles voor het scherm van Sociale media.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await socialOverzicht()));

const kanaal = kanaalIdSchema;
const doelgroep = z.enum(["werkgever", "freelancer", "algemeen"]);
const httpsOfLeeg = z
  .string()
  .trim()
  .max(300)
  .refine((u) => u === "" || /^https:\/\/[^\s]+$/i.test(u), "Gebruik een adres dat met https:// begint.");

const bewaar = postInvoerSchema.extend({
  actie: z.literal("bewaar"),
  id: z.string().max(40).optional(),
  planLokaal: z.string().trim().max(30).nullable().default(null),
  goedgekeurd: z.boolean().default(false),
});

const invoer = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("schrijf"), doelgroep, invalshoek: z.string().trim().max(300).optional(), aantal: z.number().int().min(1).max(7).default(1) }),
  bewaar,
  z.object({ actie: z.literal("goedkeuren"), id: z.string().max(40), goedgekeurd: z.boolean() }),
  z.object({ actie: z.literal("verwijder"), id: z.string().max(40) }),
  z.object({ actie: z.literal("geplaatst"), id: z.string().max(40), kanaal }),
  z.object({ actie: z.literal("opnieuw"), id: z.string().max(40), kanaal }),
  z.object({ actie: z.literal("nu"), id: z.string().max(40) }),
  z.object({ actie: z.literal("kanaal"), kanaal, profielUrl: httpsOfLeeg, bevestigd: z.boolean(), notitie: z.string().trim().max(300).default("") }),
  z.object({ actie: z.literal("meta-koppel"), token: z.string().trim().min(20, "Plak het hele token.").max(1000) }),
  z.object({ actie: z.literal("meta-controleer") }),
  z.object({ actie: z.literal("meta-ontkoppel") }),
  z.object({
    actie: z.literal("autopilot"),
    aan: z.boolean(),
    perWeek: z.number().int().min(1).max(7),
    doelgroep,
    kanalen: z.array(kanaal).min(1).max(KANAAL_IDS.length),
    zelfPlaatsen: z.boolean(),
  }),
  z.object({
    actie: z.literal("campagne"),
    doelgroep,
    invalshoek: z.string().trim().min(3, "Beschrijf waar de campagne over gaat.").max(300),
    aantal: z.number().int().min(2).max(7),
    kanalen: z.array(kanaal).min(1).max(KANAAL_IDS.length),
  }),
]);

function planVan(lokaal: string | null): string | null {
  if (!lokaal) return null;
  const d = parseAmsterdamLocal(lokaal);
  if (Number.isNaN(d.getTime())) throw AppError.validation("De gekozen tijd klopt niet.");
  return d.toISOString();
}

const nietGevonden = () => AppError.notFound("Dit bericht bestaat niet meer. Vernieuw de pagina.");

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  const audit = (action: string, summary: string, targetId?: string) =>
    recordAudit({
      category: "ADMIN",
      action,
      actorUserId: principal.userId,
      actorLabel: "user",
      summary,
      targetType: "social",
      ...(targetId ? { targetId } : {}),
    });

  switch (input.actie) {
    case "schrijf": {
      const r = await schrijfPosts({ doelgroep: input.doelgroep, ...(input.invalshoek ? { invalshoek: input.invalshoek } : {}), aantal: input.aantal });
      return NextResponse.json(r);
    }

    case "bewaar": {
      const bestaand = input.id ? await getPost(input.id) : null;
      if (input.id && !bestaand) throw nietGevonden();
      const plan = planVan(input.planLokaal);
      if (input.goedgekeurd && !plan) throw AppError.validation("Kies eerst een tijd om goed te keuren en in te plannen.");
      const p: SocialPost = {
        id: bestaand?.id ?? nieuwId(),
        tekst: input.tekst,
        hashtags: input.hashtags,
        kanalen: input.kanalen,
        beeldUrl: input.beeldUrl || null,
        beeldIdee: input.beeldIdee,
        link: input.link,
        plan,
        goedgekeurd: input.goedgekeurd,
        bron: bestaand?.bron ?? "handmatig",
        doelgroep: input.doelgroep,
        campagne: bestaand?.campagne ?? null,
        // wie een tekst of de kanalen wijzigt, begint opnieuw: eerdere uitslagen horen bij de oude tekst
        uitslag: bestaand && bestaand.tekst === input.tekst ? Object.fromEntries(Object.entries(bestaand.uitslag).filter(([k]) => input.kanalen.some((x) => x === k))) : {},
        gemaakt: bestaand?.gemaakt ?? new Date().toISOString(),
        gemaaktDoor: bestaand?.gemaaktDoor ?? principal.userId,
      };
      await savePost(p);
      await audit(bestaand ? "social.post.updated" : "social.post.created", `Bericht ${bestaand ? "aangepast" : "gemaakt"} (${p.kanalen.join(", ")})`, p.id);
      return NextResponse.json({ id: p.id });
    }

    case "goedkeuren": {
      const p = await getPost(input.id);
      if (!p) throw nietGevonden();
      if (input.goedgekeurd && !p.plan) throw AppError.validation("Kies eerst een tijd voor dit bericht.");
      await savePost({ ...p, goedgekeurd: input.goedgekeurd });
      await audit(input.goedgekeurd ? "social.post.approved" : "social.post.unapproved", input.goedgekeurd ? "Bericht goedgekeurd" : "Goedkeuring ingetrokken", p.id);
      return NextResponse.json({ ok: true });
    }

    case "verwijder": {
      await deletePost(input.id);
      await audit("social.post.deleted", "Bericht verwijderd", input.id);
      return NextResponse.json({ ok: true });
    }

    case "geplaatst": {
      const p = await getPost(input.id);
      if (!p) throw nietGevonden();
      await savePost({ ...p, uitslag: { ...p.uitslag, [input.kanaal]: { status: "gepost", at: new Date().toISOString() } } });
      return NextResponse.json({ ok: true });
    }

    case "opnieuw": {
      const p = await getPost(input.id);
      if (!p) throw nietGevonden();
      const uitslag = { ...p.uitslag };
      delete uitslag[input.kanaal];
      await savePost({ ...p, uitslag });
      return NextResponse.json({ ok: true });
    }

    case "nu": {
      const p = await getPost(input.id);
      if (!p) throw nietGevonden();
      await savePost({ ...p, goedgekeurd: true, plan: new Date().toISOString() });
      await audit("social.post.now", "Bericht nu laten plaatsen", p.id);
      const r = await verwerkBerichten();
      return NextResponse.json(r);
    }

    case "kanaal": {
      const def = kanaalDef(input.kanaal);
      if (!def) throw AppError.validation("Dit kanaal bestaat niet.");
      await setKanaalConfig(input.kanaal, { profielUrl: input.profielUrl, bevestigd: input.bevestigd, notitie: input.notitie });
      await audit("social.channel.updated", `${def.naam}: gegevens bewaard`);
      return NextResponse.json({ ok: true });
    }

    case "meta-koppel": {
      try {
        const c = await controleerToken(input.token);
        await setMeta(input.token, c);
        await audit("social.meta.connected", `Meta gekoppeld: ${c.pageNaam}${c.igNaam ? ` + Instagram @${c.igNaam}` : ""}`);
        return NextResponse.json({ ok: true, pagina: c.pageNaam, instagram: c.igNaam });
      } catch (e) {
        if (e instanceof MetaFout) throw AppError.validation(e.message);
        throw e;
      }
    }

    case "meta-controleer": {
      const m = await metaToken();
      if (!m) throw AppError.precondition("Meta is nog niet gekoppeld.");
      try {
        const c = await controleerToken(m.token);
        await setMeta(m.token, c);
        return NextResponse.json({ ok: true, pagina: c.pageNaam, instagram: c.igNaam });
      } catch (e) {
        if (e instanceof MetaFout) throw AppError.validation(e.message);
        throw e;
      }
    }

    case "meta-ontkoppel": {
      await wisMeta();
      await audit("social.meta.disconnected", "Meta losgekoppeld");
      return NextResponse.json({ ok: true });
    }

    case "autopilot": {
      const nu = await getAutopilot();
      const a: AutopilotInstelling = {
        aan: input.aan,
        perWeek: input.perWeek,
        doelgroep: input.doelgroep,
        kanalen: input.kanalen,
        zelfPlaatsen: input.zelfPlaatsen,
        // opnieuw aanzetten of aanpassen: vandaag meteen weer mee laten doen
        laatsteRun: input.aan && nu.aan ? nu.laatsteRun : null,
      };
      await setAutopilot(a);
      await audit("social.autopilot.updated", `Autopilot ${a.aan ? "aan" : "uit"} (${a.perWeek} per week${a.zelfPlaatsen ? ", plaatst zelf" : ", jij keurt goed"})`);
      return NextResponse.json({ ok: true });
    }

    case "campagne": {
      const { posts, bron } = await schrijfPosts({ doelgroep: input.doelgroep, invalshoek: input.invalshoek, aantal: input.aantal });
      const t = amsterdamParts(new Date());
      const dagen = komendeWerkdagen({ year: t.year, month: t.month, day: t.day }, posts.length);
      const campagne = nieuwId();
      const ids: string[] = [];
      for (const [i, g] of posts.entries()) {
        const dag = dagen[i];
        const slot = SLOT_UREN[1];
        if (!dag || !slot) continue;
        const p: SocialPost = {
          id: nieuwId(),
          tekst: g.tekst,
          hashtags: g.hashtags,
          kanalen: input.kanalen,
          beeldUrl: null,
          beeldIdee: g.beeldIdee,
          link: SITE.url,
          plan: amsterdamToUtc(dag.year, dag.month, dag.day, slot.uur, slot.minuut).toISOString(),
          goedgekeurd: false,
          bron: "campagne",
          doelgroep: input.doelgroep,
          campagne,
          uitslag: {},
          gemaakt: new Date().toISOString(),
          gemaaktDoor: principal.userId,
        };
        await savePost(p);
        ids.push(p.id);
      }
      await audit("social.campaign.created", `Campagne met ${ids.length} berichten gemaakt (${bron})`, campagne);
      return NextResponse.json({ ids, bron, campagne }, { status: 201 });
    }
  }
});
