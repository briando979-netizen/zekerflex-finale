import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { generateImage } from "@/lib/ai/images";
import { STYLE_SUFFIX } from "@/lib/ai/image-prompts";
import { bestandAdres, bewaarBestand } from "@/lib/video/bestanden";
import { geefClipSlot, maakClipNu, pakClipSlot } from "@/lib/video/gratis-taken";
import { maakAutoVideo } from "@/lib/video/auto";
import { bewaarProject, leesProject } from "@/lib/video/projecten";
import { FORMATEN, vervangClip, type BeeldClip, type Formaat } from "@/lib/video/model";

// ---------------------------------------------------------------------------
// De wachtrij van de video-editor: opdrachten (een videoclip, een foto of een
// hele AI-video) die de server op de achtergrond afwerkt, ook als niemand de
// pagina open heeft. Eén opdracht tegelijk. Is het gratis tegoed op (Hugging
// Face, Cloudflare, Google), dan wacht de opdracht en probeert de server het
// later vanzelf opnieuw. Klaar of mislukt → een pushmelding aan wie hem
// klaarzette. De cron tikt elke 10 minuten (/api/internal/video/wachtrij).
// ---------------------------------------------------------------------------

export type WachtSoort = "clip" | "foto" | "video";
export type WachtStatus = "wacht" | "bezig" | "klaar" | "fout" | "tegoed";

export interface WachtTaak {
  id: string;
  soort: WachtSoort;
  omschrijving: string;
  formaat: Formaat;
  /** Seconden: lengte van de clip of de video. */
  duur: number;
  fotoBron?: string;
  status: WachtStatus;
  door: string;
  op: string;
  bijgewerkt: string;
  pogingen: number;
  volgendePoging?: string;
  resultaat?: { soort: "bestand" | "project"; id: string; naam: string };
  melding?: string;
}

const KEY = "video:wachtrij";
const SLOT = "video:wachtrij:bezig";
const MAX = 200;
const MAX_POGINGEN = 3;
/** Hoe lang een opdracht wacht na "tegoed op" voor hij het opnieuw probeert. */
export const WACHT_NA_TEGOED_MS = 3 * 60 * 60_000;
/** Zolang mag één ronde werken (de cron tikt elke 10 minuten). */
const RONDE_MS = 8 * 60_000;

export const isWachtId = (id: string) => /^w[a-z0-9]{10,30}$/.test(id);

export async function wachtrij(): Promise<WachtTaak[]> {
  return (await kvGet<WachtTaak[]>(KEY).catch(() => null)) ?? [];
}

async function bewaar(lijst: WachtTaak[]) {
  await kvSet(KEY, lijst.slice(-MAX));
}

async function werkBij(id: string, deel: Partial<WachtTaak>): Promise<WachtTaak | null> {
  const lijst = await wachtrij();
  const i = lijst.findIndex((t) => t.id === id);
  const oud = lijst[i];
  if (!oud) return null;
  const nieuw: WachtTaak = { ...oud, ...deel, bijgewerkt: new Date().toISOString() };
  lijst[i] = nieuw;
  await bewaar(lijst);
  return nieuw;
}

export interface NieuweTaak {
  soort: WachtSoort;
  omschrijving: string;
  formaat: Formaat;
  duur: number;
  fotoBron?: string;
}

/** Zet opdrachten in de wachtrij (achteraan). */
export async function zetInWachtrij(nieuw: NieuweTaak[], door: string): Promise<WachtTaak[]> {
  const nu = new Date().toISOString();
  const taken: WachtTaak[] = nieuw.map((t) => ({
    id: `w${Date.now().toString(36)}${randomBytes(4).toString("hex")}`,
    soort: t.soort,
    omschrijving: t.omschrijving.trim().slice(0, 400),
    formaat: t.formaat,
    duur: t.duur,
    ...(t.fotoBron ? { fotoBron: t.fotoBron } : {}),
    status: "wacht",
    door,
    op: nu,
    bijgewerkt: nu,
    pogingen: 0,
  }));
  const lijst = await wachtrij();
  const open = lijst.filter((t) => t.status === "wacht" || t.status === "tegoed" || t.status === "bezig").length;
  if (open + taken.length > 50) throw AppError.validation("Er staan al veel opdrachten klaar (meer dan 50). Wacht tot er een paar af zijn.");
  await bewaar([...lijst, ...taken]);
  return taken;
}

/** Een opdracht die nog niet loopt weghalen (een lopende maakt de server af). */
export async function haalUitWachtrij(id: string): Promise<boolean> {
  const lijst = await wachtrij();
  const t = lijst.find((x) => x.id === id);
  if (!t || t.status === "bezig") return false;
  await bewaar(lijst.filter((x) => x.id !== id));
  return true;
}

/** Fouten waar wachten helpt: tegoed op, of (nog) geen gekoppelde AI. */
export function isWachtFout(err: unknown): boolean {
  if (!(err instanceof AppError)) return false;
  return /tegoed|dagtegoed|niet gekoppeld|niet ingeschakeld|geen gemini-sleutel/i.test(err.message) || err.code === "PRECONDITION_FAILED";
}

async function voerTaakUit(t: WachtTaak): Promise<WachtTaak["resultaat"]> {
  if (t.soort === "foto") {
    const { w, h } = FORMATEN[t.formaat];
    const img = await generateImage({ prompt: `${t.omschrijving}, ${STYLE_SUFFIX}`, width: w, height: h, purpose: "video:wachtrij", geminiGrootte: "2K" });
    const item = await bewaarBestand(Buffer.from(img.b64, "base64"), `AI-foto ${t.omschrijving.slice(0, 50)}`, { herkomst: "ai-foto" });
    return { soort: "bestand", id: item.id, naam: item.naam };
  }
  if (t.soort === "clip") {
    const item = await maakClipNu({ omschrijving: t.omschrijving, duur: t.duur, formaat: t.formaat, kwaliteit: "scherp", ...(t.fotoBron ? { fotoBron: t.fotoBron } : {}) });
    return { soort: "bestand", id: item.id, naam: item.naam };
  }
  // Hele AI-video: scenario, beelden, stem, ondertiteling; daarna probeert de
  // server het openingsshot echt te laten bewegen (gratis LTX). Lukt dat niet
  // (tegoed op), dan blijft de foto staan: de video is dan toch klaar.
  const { project, meldingen } = await maakAutoVideo({
    onderwerp: t.omschrijving,
    formaat: t.formaat,
    lengte: t.duur,
    stijl: "vrolijk",
    stem: true,
    stemNaam: "Kore",
    aiFotos: true,
    ondertiteling: true,
  });
  const eerste = project.clips.filter((c): c is BeeldClip => c.soort === "foto" && c.spoor === "s-beeld").sort((a, b) => a.start - b.start)[0];
  if (eerste) {
    try {
      const duur = Math.min(10, Math.max(2, Math.ceil(eerste.duur)));
      const clip = await maakClipNu({ omschrijving: `${eerste.naam}. ${t.omschrijving}`, duur, formaat: t.formaat, kwaliteit: "scherp", fotoBron: eerste.bron });
      const actueel = (await leesProject(project.id)) ?? project;
      const bronDuur = clip.duur ?? duur;
      await bewaarProject(
        vervangClip(actueel, { ...eerste, soort: "video", bron: bestandAdres(clip.id), naam: `${eerste.naam} (bewegend)`.slice(0, 80), inpunt: 0, bronDuur, duur: Math.min(eerste.duur, bronDuur), beweging: "geen", volume: 0 }),
      );
    } catch (err) {
      meldingen.push(isWachtFout(err) ? "Het openingsshot is een foto gebleven (gratis videotegoed op)." : "Het openingsshot is een foto gebleven.");
    }
  }
  if (meldingen.length) await werkBij(t.id, { melding: meldingen.join(" ") });
  return { soort: "project", id: project.id, naam: project.naam };
}

async function meld(t: WachtTaak) {
  try {
    const { sendUserPush } = await import("@/lib/notifications/push");
    const klaar = t.status === "klaar";
    const wat = t.soort === "foto" ? "AI-foto" : t.soort === "clip" ? "AI-clip" : "AI-video";
    await sendUserPush([t.door], {
      title: klaar ? `${wat} is klaar` : `${wat} lukte niet`,
      body: klaar ? t.omschrijving.slice(0, 120) : (t.melding ?? t.omschrijving).slice(0, 160),
      data: { type: "video", url: t.resultaat?.soort === "project" ? `/admin/video?project=${t.resultaat.id}` : "/admin/video", tag: `video-${t.id}` },
      ttlSeconds: 12 * 3600,
    });
  } catch {
    /* geen push: de wachtrij in de editor toont het ook */
  }
}

/**
 * Werk de wachtrij af tot hij leeg is, het tegoed op is of de ronde om is.
 * Draait hooguit één keer tegelijk (slot in KV). Gooit nooit.
 */
export async function verwerkWachtrij(): Promise<{ gedaan: number; klaar: number; wacht: number }> {
  const res = { gedaan: 0, klaar: 0, wacht: 0 };
  try {
    const bezig = await kvGet<{ op: string }>(SLOT).catch(() => null);
    if (bezig && Date.now() - Date.parse(bezig.op) < RONDE_MS + 60_000) return res;
    await kvSet(SLOT, { op: new Date().toISOString() });
  } catch {
    return res;
  }
  const begin = Date.now();
  // Wat bij een herstart halverwege bleef hangen, gaat terug naar "wacht".
  for (const t of await wachtrij()) {
    if (t.status === "bezig" && Date.now() - Date.parse(t.bijgewerkt) > 15 * 60_000) await werkBij(t.id, { status: "wacht" });
  }
  try {
    const tegoedOp = new Set<WachtSoort>();
    while (Date.now() - begin < RONDE_MS) {
      const nu = Date.now();
      const volgende = (await wachtrij()).find(
        (t) => !tegoedOp.has(t.soort) && (t.status === "wacht" || t.status === "tegoed") && (!t.volgendePoging || Date.parse(t.volgendePoging) <= nu),
      );
      if (!volgende) break;
      // Clips en hele video's gebruiken de gratis videogenerator: deel het slot met de knop in de editor.
      const metClip = volgende.soort !== "foto";
      if (metClip && !(await pakClipSlot(volgende.id))) break;
      await werkBij(volgende.id, { status: "bezig", pogingen: volgende.pogingen + 1 });
      res.gedaan++;
      try {
        const resultaat = await voerTaakUit(volgende);
        const klaar = await werkBij(volgende.id, { status: "klaar", ...(resultaat ? { resultaat } : {}) });
        res.klaar++;
        if (klaar) await meld(klaar);
      } catch (err) {
        const bericht = err instanceof AppError ? err.message : "Er ging iets mis bij het maken.";
        if (isWachtFout(err)) {
          // Tegoed op: deze soort slaat de rest van de ronde over en probeert het later opnieuw.
          tegoedOp.add(volgende.soort);
          await werkBij(volgende.id, { status: "tegoed", melding: bericht, pogingen: volgende.pogingen, volgendePoging: new Date(Date.now() + WACHT_NA_TEGOED_MS).toISOString() });
          res.wacht++;
        } else if (volgende.pogingen + 1 >= MAX_POGINGEN) {
          const fout = await werkBij(volgende.id, { status: "fout", melding: bericht });
          if (fout) await meld(fout);
        } else {
          logger.warn("video wachtrij: opdracht mislukt, later opnieuw", { soort: volgende.soort, error: (err as Error).message });
          // Niet meteen opnieuw in dezelfde ronde: over een kwartier.
          await werkBij(volgende.id, { status: "wacht", melding: bericht, volgendePoging: new Date(Date.now() + 15 * 60_000).toISOString() });
        }
      } finally {
        if (metClip) await geefClipSlot();
      }
    }
  } finally {
    await kvSet(SLOT, null).catch(() => undefined);
  }
  return res;
}
