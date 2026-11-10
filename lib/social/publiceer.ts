import { logger } from "@/lib/logger";
import { SITE } from "@/lib/seo";
import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { MetaFout, plaatsOpFacebook, plaatsOpInstagram } from "@/lib/social/meta";
import { tekstVoorKanaal, type KanaalId } from "@/lib/social/kanalen";
import {
  SLOT_UREN,
  isAanDeBeurt,
  komendeWerkdagen,
  type KanaalUitslag,
  type SocialPost,
} from "@/lib/social/model";
import { schrijfPosts } from "@/lib/social/schrijf";
import { getAutopilot, listPosts, metaToken, nieuwId, savePost, setAutopilot } from "@/lib/social/store";

// ---------------------------------------------------------------------------
// De achtergrondronde van het sociale-mediaonderdeel (elke 10 minuten, deploy/cron):
//  1. berichten die goedgekeurd zijn en aan de beurt: plaatsen waar de koppeling het kan
//     (Facebook, Instagram), voor de rest staat het bericht klaar voor een mens ("Jij plaatst");
//  2. de autopilot (alleen als hij aan staat): een week aan berichten klaarzetten.
// Een bericht dat niet goedgekeurd is gaat nooit weg. Een fout stopt de ronde niet.
// ---------------------------------------------------------------------------

async function pushBeheerders(titel: string, tekst: string, tag: string): Promise<void> {
  try {
    const [{ platformAdminIds }, { sendUserPush }] = await Promise.all([import("@/lib/messaging/contacts"), import("@/lib/notifications/push")]);
    await sendUserPush(await platformAdminIds(), {
      title: titel,
      body: tekst,
      data: { type: "social", url: "/admin/social", tag },
      ttlSeconds: 12 * 3600,
    });
  } catch (e) {
    logger.warn("social: melding aan beheerders mislukt", { error: (e as Error).message });
  }
}

/** Plaatst één bericht op één kanaal; geeft de uitslag terug. Gooit nooit. */
async function plaatsOpKanaal(p: SocialPost, kanaal: KanaalId, nu: Date): Promise<KanaalUitslag> {
  const at = nu.toISOString();
  const tekst = tekstVoorKanaal(kanaal, p.tekst, p.hashtags);
  if (kanaal !== "facebook" && kanaal !== "instagram") return { status: "handmatig", at };
  const meta = await metaToken();
  if (!meta) return { status: "handmatig", at, fout: "Meta is niet gekoppeld; plaats dit bericht zelf." };
  try {
    if (kanaal === "facebook") {
      const extId = await plaatsOpFacebook(meta, { tekst, link: p.link, beeldUrl: p.beeldUrl });
      return { status: "gepost", at, ...(extId ? { extId } : {}) };
    }
    if (!meta.igUserId) return { status: "handmatig", at, fout: "Er is geen Instagram-zakelijk-account aan het token gekoppeld; plaats dit bericht zelf." };
    if (!p.beeldUrl) return { status: "handmatig", at, fout: "Instagram heeft een beeld nodig. Voeg een beeld toe of plaats het zelf." };
    const extId = await plaatsOpInstagram({ token: meta.token, igUserId: meta.igUserId }, { tekst, beeldUrl: p.beeldUrl });
    return { status: "gepost", at, ...(extId ? { extId } : {}) };
  } catch (e) {
    const fout = e instanceof MetaFout ? e.message : "Plaatsen mislukte om een onbekende reden.";
    logger.warn("social: plaatsen mislukt", { kanaal, postId: p.id, fout });
    return { status: "mislukt", at, fout };
  }
}

export async function verwerkBerichten(nu: Date = new Date()): Promise<{ verwerkt: number; gepost: number; handmatig: number; mislukt: number }> {
  const alle = await listPosts();
  const teDoen = alle.filter((p) => isAanDeBeurt(p, nu)).slice(0, 20);
  let gepost = 0;
  let handmatig = 0;
  let mislukt = 0;
  for (const p of teDoen) {
    for (const kanaal of p.kanalen) {
      if ((p.uitslag[kanaal]?.status ?? "wacht") !== "wacht") continue;
      const u = await plaatsOpKanaal(p, kanaal, nu);
      p.uitslag[kanaal] = u;
      if (u.status === "gepost") gepost += 1;
      else if (u.status === "handmatig") handmatig += 1;
      else if (u.status === "mislukt") mislukt += 1;
    }
    await savePost(p);
    const kort = p.tekst.length > 70 ? `${p.tekst.slice(0, 70)}…` : p.tekst;
    if (p.kanalen.some((k) => p.uitslag[k]?.status === "handmatig")) await pushBeheerders("Bericht klaar om te plaatsen", kort, `social-${p.id}-hand`);
    if (p.kanalen.some((k) => p.uitslag[k]?.status === "mislukt")) await pushBeheerders("Een bericht is niet geplaatst", kort, `social-${p.id}-fout`);
  }
  return { verwerkt: teDoen.length, gepost, handmatig, mislukt };
}

/** Een week aan berichten klaarzetten, als de autopilot aan staat en er nog niet genoeg liggen. */
export async function autopilotRonde(nu: Date = new Date()): Promise<{ gemaakt: number; reden: string }> {
  const inst = await getAutopilot();
  if (!inst.aan) return { gemaakt: 0, reden: "uit" };
  const dagSleutel = nu.toISOString().slice(0, 10);
  if (inst.laatsteRun === dagSleutel) return { gemaakt: 0, reden: "vandaag al gedaan" };

  const grens = nu.getTime() + 7 * 24 * 3600 * 1000;
  const bestaand = (await listPosts()).filter((p) => p.bron === "autopilot" && p.plan && new Date(p.plan).getTime() > nu.getTime() && new Date(p.plan).getTime() <= grens);
  const nodig = inst.perWeek - bestaand.length;
  if (nodig <= 0) {
    await setAutopilot({ ...inst, laatsteRun: dagSleutel });
    return { gemaakt: 0, reden: "er liggen al genoeg berichten" };
  }

  const { posts } = await schrijfPosts({ doelgroep: inst.doelgroep, aantal: nodig });
  const t = amsterdamParts(nu);
  const dagen = komendeWerkdagen({ year: t.year, month: t.month, day: t.day }, Math.max(nodig, 1));
  let gemaakt = 0;
  for (const [i, g] of posts.entries()) {
    const dag = dagen[i % dagen.length];
    const slot = SLOT_UREN[(i + bestaand.length) % SLOT_UREN.length];
    if (!dag || !slot) continue;
    await savePost({
      id: nieuwId(),
      tekst: g.tekst,
      hashtags: g.hashtags,
      kanalen: inst.kanalen,
      beeldUrl: null,
      beeldIdee: g.beeldIdee,
      link: SITE.url,
      plan: amsterdamToUtc(dag.year, dag.month, dag.day, slot.uur, slot.minuut).toISOString(),
      goedgekeurd: inst.zelfPlaatsen,
      bron: "autopilot",
      doelgroep: inst.doelgroep,
      campagne: null,
      uitslag: {},
      gemaakt: nu.toISOString(),
      gemaaktDoor: null,
    });
    gemaakt += 1;
  }
  await setAutopilot({ ...inst, laatsteRun: dagSleutel });
  if (gemaakt > 0 && !inst.zelfPlaatsen) {
    await pushBeheerders("Sociale media: berichten om goed te keuren", `De autopilot zette ${gemaakt} bericht${gemaakt === 1 ? "" : "en"} klaar voor de komende week.`, `social-autopilot-${dagSleutel}`);
  }
  return { gemaakt, reden: "gemaakt" };
}

export async function socialTick(nu: Date = new Date()): Promise<{ berichten: Awaited<ReturnType<typeof verwerkBerichten>>; autopilot: Awaited<ReturnType<typeof autopilotRonde>> }> {
  const berichten = await verwerkBerichten(nu);
  const autopilot = await autopilotRonde(nu).catch((e) => {
    logger.warn("social: autopilot mislukte", { error: (e as Error).message });
    return { gemaakt: 0, reden: "fout" };
  });
  return { berichten, autopilot };
}
