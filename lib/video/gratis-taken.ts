import { randomBytes } from "node:crypto";
import { chat } from "@/lib/ai/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { maakGratisClip, type ClipFormaat, type ClipKwaliteit } from "@/lib/ai/gratis-video";
import { bewaarBestand, type VideoBestand } from "@/lib/video/bestanden";
import { fotoJpeg } from "@/lib/video/foto-bron";

// ---------------------------------------------------------------------------
// Gratis AI-clips (LTX-2.3) als achtergrondtaak: een clip duurt 1 tot 3 minuten,
// langer dan een verzoek mag duren. De taak draait in het serverproces en
// schrijft zijn stand in KV; de editor vraagt die elke paar seconden op.
// Eén taak tegelijk: het gratis tegoed is klein en de wachtrij is gedeeld.
// ---------------------------------------------------------------------------

export interface GratisTaak {
  id: string;
  status: "bezig" | "klaar" | "fout";
  omschrijving: string;
  op: string;
  klaarOp?: string;
  item?: VideoBestand;
  fout?: string;
}

export interface GratisTaakInput {
  omschrijving: string;
  duur: number;
  formaat: ClipFormaat;
  kwaliteit: ClipKwaliteit;
  /** Laat deze foto bewegen (adres uit de editor). */
  fotoBron?: string;
}

const K = (id: string) => `video:taak:${id}`;
const SLOT = "video:gratis:bezig";
const SLOT_MS = 8 * 60_000;
export const isTaakId = (id: string) => /^t[a-z0-9]{12,30}$/.test(id);

/** Nederlandse omschrijving → Engelse filmische prompt (LTX begrijpt Engels het best). */
async function naarPrompt(omschrijving: string, metFoto: boolean): Promise<string> {
  try {
    const { text } = await chat({
      purpose: "video:prompt",
      temperature: 0.6,
      maxTokens: 260,
      retry: false,
      timeoutMs: 20_000,
      messages: [
        {
          role: "system",
          content: metFoto
            ? "You write prompts for the LTX-2 image-to-video model. Describe in English the natural motion and camera movement to add to the given photo (people moving, steam, light, a slow push-in). Keep the scene as it is. Max 60 words, no text overlays, no brand names. Reply with the prompt only."
            : "You write prompts for the LTX-2 text-to-video model. Turn the request into one English cinematic prompt: subject, action, setting, camera movement, light, mood. Realistic, no text overlays, no brand names or logos. Max 70 words. Reply with the prompt only.",
        },
        { role: "user", content: omschrijving },
      ],
    });
    const p = text.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").slice(0, 900);
    if (p.length > 15) return p;
  } catch (err) {
    logger.warn("video prompt via AI mislukt", { error: (err as Error).message });
  }
  return omschrijving;
}

/** Maak een gratis clip nu (Nederlandse omschrijving → Engelse prompt → LTX) en bewaar hem bij Media. */
export async function maakClipNu(input: GratisTaakInput): Promise<VideoBestand> {
  const [prompt, foto] = await Promise.all([naarPrompt(input.omschrijving, Boolean(input.fotoBron)), input.fotoBron ? fotoJpeg(input.fotoBron) : Promise.resolve(null)]);
  const { mp4 } = await maakGratisClip({ prompt, duur: input.duur, formaat: input.formaat, kwaliteit: input.kwaliteit, ...(foto ? { foto } : {}) });
  return bewaarBestand(mp4, `AI-clip ${input.omschrijving.slice(0, 50)}`, { herkomst: "ai-clip", gemeld: "video/mp4", duur: input.duur });
}

/** Neem het gedeelde slot van de gratis generator (één clip tegelijk, ook voor de wachtrij). */
export async function pakClipSlot(id: string): Promise<boolean> {
  const bezig = await kvGet<{ op: string; id: string }>(SLOT).catch(() => null);
  if (bezig && Date.now() - Date.parse(bezig.op) < SLOT_MS) return false;
  await kvSet(SLOT, { op: new Date().toISOString(), id });
  return true;
}

export async function geefClipSlot(): Promise<void> {
  await kvSet(SLOT, null).catch(() => undefined);
}

async function voerUit(taak: GratisTaak, input: GratisTaakInput) {
  try {
    const item = await maakClipNu(input);
    await kvSet(K(taak.id), { ...taak, status: "klaar", klaarOp: new Date().toISOString(), item } satisfies GratisTaak);
  } catch (err) {
    const fout = err instanceof AppError ? err.message : "De gratis clip lukte niet. Probeer het zo nog eens.";
    if (!(err instanceof AppError)) logger.error("gratis clip mislukt", { error: (err as Error).message });
    await kvSet(K(taak.id), { ...taak, status: "fout", klaarOp: new Date().toISOString(), fout } satisfies GratisTaak).catch(() => undefined);
  } finally {
    await geefClipSlot();
  }
}

export async function startGratisTaak(input: GratisTaakInput): Promise<GratisTaak> {
  const taak: GratisTaak = { id: `t${Date.now().toString(36)}${randomBytes(4).toString("hex")}`, status: "bezig", omschrijving: input.omschrijving.slice(0, 200), op: new Date().toISOString() };
  if (!(await pakClipSlot(taak.id))) {
    throw AppError.precondition("Er wordt al een gratis clip gemaakt (misschien door de wachtrij). Wacht tot die klaar is (meestal 1 tot 3 minuten).");
  }
  await kvSet(K(taak.id), taak);
  // Bewust niet afwachten: de taak loopt door nadat dit verzoek klaar is.
  void voerUit(taak, input);
  return taak;
}

export async function leesTaak(id: string): Promise<GratisTaak | null> {
  if (!isTaakId(id)) return null;
  const t = await kvGet<GratisTaak>(K(id));
  // Een taak die na 10 minuten nog "bezig" is, is met een herstart verloren gegaan.
  if (t && t.status === "bezig" && Date.now() - Date.parse(t.op) > 10 * 60_000) return { ...t, status: "fout", fout: "Deze clip is onderbroken (de server is herstart). Probeer het opnieuw." };
  return t;
}
