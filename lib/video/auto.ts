import { chatJson } from "@/lib/ai/client";
import { fixBrandName } from "@/lib/ai/brand";
import { beeldBackend, generateImage } from "@/lib/ai/images";
import { STYLE_SUFFIX } from "@/lib/ai/image-prompts";
import { geminiStem, type GeminiBeeldModel } from "@/lib/ai/gemini-media";
import { synthesizeSpeech } from "@/lib/ai/neural-tts";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { bestandAdres, bewaarBestand } from "@/lib/video/bestanden";
import { bouwAutoProject, schoonScenario, standaardScenario, type Scenario } from "@/lib/video/auto-bouw";
import { bewaarProject } from "@/lib/video/projecten";
import { FORMATEN, type Formaat, type Project } from "@/lib/video/model";
import { kiesStockFoto } from "@/lib/video/stock";
import { wavDuur } from "@/lib/video/wav";

// ---------------------------------------------------------------------------
// AI-video in één klik: de taal-AI schrijft een scenario (scènes met kop,
// voorleestekst en beeld), de beeld-AI maakt per scène een foto (Nano Banana,
// of een eigen stockfoto als dat niet kan), Gemini spreekt de tekst in, en
// bouwAutoProject zet alles op de tijdlijn. Het resultaat is een gewoon
// project in de editor: alles blijft daarna aan te passen.
// ---------------------------------------------------------------------------

export interface AutoInput {
  onderwerp: string;
  formaat: Formaat;
  lengte: number;
  stijl: "zakelijk" | "vrolijk" | "stoer" | "rustig" | "luxe";
  stem: boolean;
  stemNaam: string;
  aiFotos: boolean;
  beeldModel?: GeminiBeeldModel;
  ondertiteling: boolean;
}

export interface AutoResultaat {
  project: Project;
  meldingen: string[];
}

const STIJL_UITLEG: Record<AutoInput["stijl"], string> = {
  zakelijk: "zakelijk en betrouwbaar, korte heldere zinnen",
  vrolijk: "vrolijk en energiek, met tempo",
  stoer: "stoer en direct, krachtige woorden",
  rustig: "rustig en warm, persoonlijk",
  luxe: "chic en verfijnd, weinig woorden",
};

async function schrijfScenario(input: AutoInput, scenes: number): Promise<{ scenario: Scenario; viaAi: boolean }> {
  const woorden = Math.round(input.lengte * 2.3);
  try {
    const ruw = await chatJson<unknown>({
      purpose: "video:scenario",
      temperature: 0.8,
      maxTokens: 1400,
      retry: false,
      timeoutMs: 45_000,
      messages: [
        {
          role: "system",
          content:
            "Je schrijft korte video's voor sociale media (Reels, TikTok, YouTube) in gewoon Nederlands, voor ZekerFlex en zijn klanten. " +
            "Regels: geen verzonnen kortingen, prijzen, cijfers, beloftes of nep-haast; noem nooit een uitzendopslag; geen merknamen van anderen. " +
            'Antwoord ALLEEN met JSON: {"titel": string, "scenes": [{"kop": string (max 6 woorden, op het scherm), "voorlezen": string (1-2 korte zinnen die de stem zegt), "beeld": string (Engelse beschrijving van een echte foto bij deze scène, zonder tekst in beeld), "trefwoorden": string[] (2-4 Nederlandse woorden over het onderwerp, bv. horeca, magazijn, team)}], "slot": {"kop": string (max 4 woorden), "onder": string (website of oproep)}}.',
        },
        {
          role: "user",
          content: `Onderwerp: ${input.onderwerp}\nToon: ${STIJL_UITLEG[input.stijl]}\nAantal scènes: ${scenes}\nTotaal voorleestekst: ongeveer ${woorden} woorden (de video duurt ${input.lengte} seconden).\nBegin met een haak die in 2 seconden de aandacht pakt. Eindig met een duidelijke oproep.`,
        },
      ],
    });
    const scenario = schoonScenario(ruw, scenes + 1);
    if (scenario) {
      const merk = (s: string) => fixBrandName(s);
      return {
        viaAi: true,
        scenario: {
          titel: merk(scenario.titel),
          scenes: scenario.scenes.map((x) => ({ ...x, kop: merk(x.kop), voorlezen: merk(x.voorlezen) })),
          slot: { kop: merk(scenario.slot.kop), onder: merk(scenario.slot.onder) },
        },
      };
    }
  } catch (err) {
    logger.warn("video scenario via AI mislukt", { error: (err as Error).message });
  }
  return { scenario: standaardScenario(input.onderwerp, scenes), viaAi: false };
}

/** Voorleestekst: zo spreekt een stem "zekerflex.com" goed uit. */
export function uitspraak(s: string): string {
  return s.replace(/\bzekerflex\.com\b/gi, "zekerflex punt com").replace(/\bZekerFlex\b/g, "Zekerflex");
}

export async function maakAutoVideo(input: AutoInput): Promise<AutoResultaat> {
  const meldingen: string[] = [];
  const scenes = Math.max(3, Math.min(8, Math.round(input.lengte / 5)));
  const { scenario, viaAi } = await schrijfScenario(input, scenes);
  if (!viaAi) meldingen.push("De taal-AI antwoordde niet; er staat een standaardscenario klaar dat je zelf kunt aanpassen.");

  // 1. Beelden: AI-foto's waar dat kan, anders passende eigen foto's.
  const beelden: string[] = [];
  const gebruikt = new Set<string>();
  let aiAan = input.aiFotos && (await beeldBackend()) !== null;
  if (input.aiFotos && !aiAan) meldingen.push("Er is geen beeld-AI gekoppeld; de video gebruikt eigen foto's.");
  const { w, h } = FORMATEN[input.formaat];
  for (const [i, scene] of scenario.scenes.entries()) {
    if (aiAan && scene.beeld) {
      try {
        const img = await generateImage({
          prompt: `${scene.beeld}, ${STYLE_SUFFIX}`,
          width: w,
          height: h,
          purpose: "video:scene",
          geminiGrootte: "2K",
          ...(input.beeldModel ? { geminiModel: input.beeldModel } : {}),
        });
        const item = await bewaarBestand(Buffer.from(img.b64, "base64"), `AI-foto ${i + 1} ${scenario.titel}`, { herkomst: "ai-foto" });
        beelden.push(bestandAdres(item.id));
        continue;
      } catch (err) {
        aiAan = false;
        meldingen.push(err instanceof AppError ? `AI-foto's lukten niet: ${err.message} De video gebruikt nu eigen foto's.` : "AI-foto's lukten niet; de video gebruikt nu eigen foto's.");
      }
    }
    const foto = kiesStockFoto([...scene.trefwoorden, input.onderwerp], gebruikt);
    gebruikt.add(foto.adres);
    beelden.push(foto.adres);
  }

  // 2. Stem: alles in één keer inspreken (één verzoek = zuinig met het dagtegoed).
  let stem: { adres: string; duur: number } | null = null;
  if (input.stem) {
    const tekst = uitspraak(scenario.scenes.map((s) => s.voorlezen).join("\n\n"));
    const wav = await geminiStem(tekst, input.stemNaam, `Lees ${STIJL_UITLEG[input.stijl]} voor, als een reclamespot`).catch(() => null);
    if (wav) {
      const duur = wavDuur(wav);
      const item = await bewaarBestand(wav, `AI-stem ${scenario.titel}`, { herkomst: "ai-stem", gemeld: "audio/wav", ...(duur ? { duur } : {}) });
      if (duur) stem = { adres: bestandAdres(item.id), duur };
    } else {
      const mp3 = await synthesizeSpeech(tekst).catch(() => null);
      if (mp3) {
        // MP3 heeft geen kop met de duur; schat hem (ruim 2,5 woord per seconde).
        const duur = Math.max(2, tekst.split(/\s+/).length / 2.6);
        const item = await bewaarBestand(mp3, `AI-stem ${scenario.titel}`, { herkomst: "ai-stem", gemeld: "audio/mpeg", duur });
        stem = { adres: bestandAdres(item.id), duur };
      } else {
        meldingen.push("De AI-stem is vandaag op (Google geeft op de gratis laag een klein dagtegoed). De video heeft nu tekst en ondertiteling; probeer de stem later opnieuw of neem hem zelf op.");
      }
    }
  }

  const project = bouwAutoProject(scenario, {
    formaat: input.formaat,
    lengte: input.lengte,
    beelden,
    stem,
    ondertiteling: input.ondertiteling,
  });
  const bewaard = await bewaarProject(project);
  return { project: bewaard, meldingen };
}
