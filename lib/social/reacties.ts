import { logger } from "@/lib/logger";
import {
  MetaFout,
  antwoordFacebook,
  antwoordInstagram,
  haalReactiesFacebook,
  haalReactiesInstagram,
  type GelezenReactie,
} from "@/lib/social/meta";
import type { Reactie, ReactieKanaal } from "@/lib/social/model";
import { schrijfAntwoord } from "@/lib/social/schrijf";
import { beoordeelTekst, vraagtMens } from "@/lib/social/veilig";
import { getAutopilot, getMetaStatus, getReactie, metaToken, reactieSleutel, saveReactie } from "@/lib/social/store";

// ---------------------------------------------------------------------------
// "Praten met ze": reacties onder onze berichten op Facebook en Instagram. Elke ronde (elke 10
// minuten, samen met het plaatsen) haalt de nieuwe reacties op, laat een antwoord voorstellen en
// beantwoordt alleen vanzelf wat veilig is:
//   - de autopilot staat aan met "reageren" aan,
//   - de reactie is van de laatste 48 uur (nooit een stapel oude reacties tegelijk),
//   - er staat nog geen antwoord onder,
//   - het is geen klacht of lastig onderwerp (vraagtMens) en het model wil geen mens (mensNodig),
//   - het antwoord komt door het vangnet (beoordeelTekst) en komt van het model, niet van een vaste zin.
// Al het andere blijft staan voor een mens, met een melding. Hooguit 5 antwoorden per ronde.
// ---------------------------------------------------------------------------

const AUTO_BINNEN_MS = 48 * 3600 * 1000;
const MAX_AUTO_PER_RONDE = 5;
const MAX_NIEUW_PER_RONDE = 30;

async function verstuur(kanaal: ReactieKanaal, token: string, extId: string, tekst: string): Promise<void> {
  if (kanaal === "facebook") await antwoordFacebook(token, extId, tekst);
  else await antwoordInstagram(token, extId, tekst);
}

export interface ReactieRonde {
  nieuw: number;
  automatisch: number;
  wachtOpMens: number;
  fout: string | null;
}

export async function synchroniseerReacties(nu: Date = new Date()): Promise<ReactieRonde> {
  const meta = await metaToken();
  const ronde: ReactieRonde = { nieuw: 0, automatisch: 0, wachtOpMens: 0, fout: null };
  if (!meta) return ronde;
  const [status, inst] = await Promise.all([getMetaStatus(), getAutopilot()]);

  const gelezen: { kanaal: ReactieKanaal; r: GelezenReactie }[] = [];
  try {
    for (const r of await haalReactiesFacebook(meta)) {
      if (r.vanId && r.vanId === meta.pageId) continue; // onze eigen reactie
      gelezen.push({ kanaal: "facebook", r });
    }
  } catch (e) {
    ronde.fout = e instanceof MetaFout ? e.message : "Reacties op Facebook lezen lukte niet.";
  }
  if (meta.igUserId) {
    try {
      for (const r of await haalReactiesInstagram({ token: meta.token, igUserId: meta.igUserId })) {
        if (status.igNaam && r.vanId.toLowerCase() === status.igNaam.toLowerCase()) continue;
        gelezen.push({ kanaal: "instagram", r });
      }
    } catch (e) {
      ronde.fout = ronde.fout ?? (e instanceof MetaFout ? e.message : "Reacties op Instagram lezen lukte niet.");
    }
  }

  for (const { kanaal, r } of gelezen) {
    if (ronde.nieuw >= MAX_NIEUW_PER_RONDE) break;
    const id = reactieSleutel(kanaal, r.extId);
    if (await getReactie(id)) continue;
    ronde.nieuw += 1;

    const voorstel = await schrijfAntwoord({ kanaal, van: r.van, tekst: r.tekst, bericht: r.bericht });
    const leeftijd = nu.getTime() - new Date(r.at).getTime();
    const zelf =
      inst.autoReageren &&
      ronde.automatisch < MAX_AUTO_PER_RONDE &&
      leeftijd <= AUTO_BINNEN_MS &&
      !r.heeftAntwoord &&
      !vraagtMens(r.tekst) &&
      voorstel.bron === "model" &&
      voorstel.mensNodig === null &&
      beoordeelTekst(voorstel.antwoord).veilig;

    const reactie: Reactie = {
      id,
      kanaal,
      extId: r.extId,
      van: r.van,
      tekst: r.tekst,
      bericht: r.bericht,
      at: r.at,
      status: "nieuw",
      concept: voorstel.antwoord,
      mensNodig: voorstel.mensNodig ?? (vraagtMens(r.tekst) ? "Een klacht of lastig onderwerp: lees dit zelf." : r.heeftAntwoord ? "Er staat al een antwoord onder." : null),
    };
    if (zelf) {
      try {
        await verstuur(kanaal, meta.token, r.extId, voorstel.antwoord);
        reactie.status = "beantwoord";
        reactie.antwoord = voorstel.antwoord;
        reactie.antwoordAt = nu.toISOString();
        reactie.automatisch = true;
        ronde.automatisch += 1;
      } catch (e) {
        reactie.fout = e instanceof MetaFout ? e.message : "Antwoorden lukte niet.";
        logger.warn("social: automatisch antwoord mislukt", { kanaal, fout: reactie.fout });
      }
    }
    if (reactie.status === "nieuw") ronde.wachtOpMens += 1;
    await saveReactie(reactie);
  }

  if (ronde.wachtOpMens > 0) {
    try {
      const [{ platformAdminIds }, { sendUserPush }] = await Promise.all([import("@/lib/messaging/contacts"), import("@/lib/notifications/push")]);
      await sendUserPush(await platformAdminIds(), {
        title: "Reacties wachten op een antwoord",
        body: `${ronde.wachtOpMens} nieuwe reactie${ronde.wachtOpMens === 1 ? "" : "s"} op Facebook of Instagram om te bekijken.`,
        data: { type: "social", url: "/admin/social", tag: `social-reacties-${nu.toISOString().slice(0, 13)}` },
        ttlSeconds: 12 * 3600,
      });
    } catch (e) {
      logger.warn("social: melding over reacties mislukt", { error: (e as Error).message });
    }
  }
  return ronde;
}

/** Een mens verstuurt een antwoord (eventueel aangepast) vanuit het beheer. Gooit een MetaFout met een gewone zin. */
export async function verstuurAntwoord(id: string, tekst: string, nu: Date = new Date()): Promise<void> {
  const r = await getReactie(id);
  if (!r) throw new MetaFout("Deze reactie bestaat niet meer. Vernieuw de pagina.");
  const meta = await metaToken();
  if (!meta) throw new MetaFout("Meta is niet gekoppeld, dus antwoorden kan niet vanuit hier. Antwoord in de app zelf.");
  const schoon = tekst.trim();
  if (schoon.length < 2) throw new MetaFout("Schrijf eerst een antwoord.");
  await verstuur(r.kanaal, meta.token, r.extId, schoon);
  await saveReactie({ ...r, status: "beantwoord", antwoord: schoon, antwoordAt: nu.toISOString(), automatisch: false });
}

export async function slaReactieOver(id: string): Promise<void> {
  const r = await getReactie(id);
  if (r) await saveReactie({ ...r, status: "overgeslagen" });
}
