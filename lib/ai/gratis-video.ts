import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Gratis AI-video met LTX-2.3 (Lightricks), via hun openbare Hugging Face-Space
// op ZeroGPU: echte videokaarten, geen sleutel, geen kosten. Dezelfde Gradio-
// API kun je ook zelf draaien op een eigen pc met een NVIDIA-kaart (de Space-
// code van Lightricks, of Pinokio); zet dan VIDEO_GRADIO_URL op dat adres.
// Een HF_TOKEN (gratis Hugging Face-account) geeft meer dagtegoed.
//
// Valkuil: het gemaakte bestand is alleen te downloaden vanaf hetzelfde adres
// dat het verzoek deed (van een andere pc: 403). Daarom haalt de server het
// meteen zelf op.
// ---------------------------------------------------------------------------

export const LTX_STANDAARD_URL = "https://lightricks-ltx-2-3.hf.space";

export type ClipFormaat = "9:16" | "16:9" | "1:1" | "4:5";
export type ClipKwaliteit = "snel" | "scherp";

/**
 * Breedte en hoogte per formaat, altijd veelvouden van 64. Gemeten 4 nov: met
 * een foto en 864 × 1536 brak de Space af binnen 5 s (geen video); 896 × 1536
 * werkte. Ook de presets van Lightricks zijn allemaal veelvouden van 64.
 */
export function ltxMaat(formaat: ClipFormaat, kwaliteit: ClipKwaliteit): { breedte: number; hoogte: number } {
  const tabel: Record<ClipFormaat, Record<ClipKwaliteit, [number, number]>> = {
    "9:16": { scherp: [896, 1536], snel: [576, 1024] },
    "16:9": { scherp: [1536, 896], snel: [1024, 576] },
    "1:1": { scherp: [1024, 1024], snel: [768, 768] },
    "4:5": { scherp: [1024, 1280], snel: [768, 960] },
  };
  const [breedte, hoogte] = tabel[formaat][kwaliteit];
  return { breedte, hoogte };
}

function basis(): string {
  return (env.VIDEO_GRADIO_URL || LTX_STANDAARD_URL).replace(/\/+$/, "");
}

function koppen(json: boolean): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {}),
  };
}

export interface SseGebeurtenis {
  event: string;
  data: string;
}

/** Lees een Gradio-eventstream ("event: x" + "data: y", gescheiden door een lege regel). */
export function leesSse(tekst: string): SseGebeurtenis[] {
  const uit: SseGebeurtenis[] = [];
  for (const blok of tekst.replace(/\r/g, "").split(/\n\n+/)) {
    let event = "";
    const data: string[] = [];
    for (const regel of blok.split("\n")) {
      if (regel.startsWith("event:")) event = regel.slice(6).trim();
      else if (regel.startsWith("data:")) data.push(regel.slice(5).replace(/^ /, ""));
    }
    if (event) uit.push({ event, data: data.join("\n") });
  }
  return uit;
}

const TEGOED = /quota|exceeded|GPU (?:task|time)|ZeroGPU|limit/i;

/** Een Gradio-foutmelding in gewone taal. */
export function vertaalFout(ruw: string | null): string {
  const s = (ruw ?? "").replace(/^"|"$/g, "");
  if (s === "quota" || TEGOED.test(s)) {
    return env.HF_TOKEN
      ? "Het gratis dagtegoed van de Hugging Face-videokaarten is voor nu op. Probeer het over een paar uur opnieuw."
      : "Het gratis tegoed van de Hugging Face-videokaarten is voor nu op. Probeer het over een paar uur opnieuw. Met een gratis Hugging Face-account (sleutel HF_TOKEN, zie Admin → Te doen) krijg je elke dag meer.";
  }
  if (/sleep|paused|building|starting/i.test(s)) return "De gratis videogenerator start net op. Probeer het over een minuut nog eens.";
  return "De gratis videogenerator gaf een fout. Probeer een andere omschrijving of probeer het zo opnieuw.";
}

export interface GratisClipInput {
  /** Engelse omschrijving van de clip. */
  prompt: string;
  duur: number;
  formaat: ClipFormaat;
  kwaliteit: ClipKwaliteit;
  /** Optioneel: een foto die gaat bewegen (JPEG). */
  foto?: Buffer;
}

/** Een foto eerst uploaden (zoals gradio_client doet); geeft het pad op de generator. */
async function uploadFoto(b: string, jpeg: Buffer): Promise<{ path: string; orig_name: string; mime_type: string; size: number; meta: { _type: string } }> {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "foto.jpg");
  const res = await fetch(`${b}/gradio_api/upload`, { method: "POST", headers: koppen(false), body: form, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw AppError.upstream(vertaalFout(await res.text().catch(() => "")));
  const paden = (await res.json().catch(() => [])) as unknown;
  const pad = Array.isArray(paden) && typeof paden[0] === "string" ? paden[0] : null;
  if (!pad) throw AppError.upstream("De foto kon niet naar de videogenerator.");
  return { path: pad, orig_name: "foto.jpg", mime_type: "image/jpeg", size: jpeg.length, meta: { _type: "gradio.FileData" } };
}

/** Maak een clip en geef de MP4-bytes terug. Duurt meestal 1 tot 3 minuten. */
export async function maakGratisClip(input: GratisClipInput): Promise<{ mp4: Buffer; seed: number | null }> {
  const b = basis();
  const { breedte, hoogte } = ltxMaat(input.formaat, input.kwaliteit);
  const duur = Math.max(1, Math.min(10, Math.round(input.duur * 10) / 10));
  const foto = input.foto ? await uploadFoto(b, input.foto) : null;
  const begin = Date.now();
  // Volgorde volgens de Space: foto, prompt, duur, prompt verbeteren, seed, willekeurige seed, hoogte, breedte.
  const start = await fetch(`${b}/gradio_api/call/generate_video`, {
    method: "POST",
    headers: koppen(true),
    body: JSON.stringify({ data: [foto, input.prompt.slice(0, 1500), duur, false, 10, true, hoogte, breedte] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) {
    logger.warn("gratis video start mislukt", { status: start.status, host: new URL(b).host });
    throw AppError.upstream(vertaalFout(await start.text().catch(() => "")));
  }
  const id = ((await start.json().catch(() => ({}))) as { event_id?: string }).event_id;
  if (!id || !/^[\w-]{8,80}$/.test(id)) throw AppError.upstream("De gratis videogenerator gaf geen opdrachtnummer terug.");

  const stroom = await fetch(`${b}/gradio_api/call/generate_video/${id}`, { headers: koppen(false), signal: AbortSignal.timeout(6 * 60_000) });
  if (!stroom.ok) throw AppError.upstream(vertaalFout(await stroom.text().catch(() => "")));
  const gebeurtenissen = leesSse(await stroom.text());
  const fout = gebeurtenissen.find((g) => g.event === "error");
  const klaar = gebeurtenissen.find((g) => g.event === "complete");
  if (!klaar) {
    logger.warn("gratis video mislukt", { fout: (fout?.data ?? "").slice(0, 200), ms: Date.now() - begin });
    // Een fout zonder tekst binnen enkele seconden: de generator weigerde meteen.
    // In de praktijk is dan het gratis tegoed op (gemeten 4 nov: na 2 clips vanaf de server).
    const meteen = (!fout?.data || fout.data === "null") && Date.now() - begin < 15_000;
    throw AppError.upstream(vertaalFout(meteen ? "quota" : (fout?.data ?? null)));
  }
  let uitkomst: unknown;
  try {
    uitkomst = JSON.parse(klaar.data);
  } catch {
    throw AppError.upstream("De gratis videogenerator gaf een onleesbaar antwoord.");
  }
  const [bestand, seed] = Array.isArray(uitkomst) ? uitkomst : [];
  const adres = (bestand as { url?: string } | null)?.url;
  if (!adres) throw AppError.upstream("De gratis videogenerator maakte geen video. Beschrijf het iets anders.");
  // Alleen downloaden van de generator zelf (geen willekeurige adressen).
  if (new URL(adres).host !== new URL(b).host) throw AppError.upstream("De video stond op een onverwacht adres.");
  const dl = await fetch(adres, { headers: koppen(false), signal: AbortSignal.timeout(120_000) });
  if (!dl.ok) throw AppError.upstream(`Downloaden van de video mislukte (${dl.status}).`);
  const mp4 = Buffer.from(await dl.arrayBuffer());
  if (mp4.length < 1000 || mp4.subarray(4, 8).toString("latin1") !== "ftyp") throw AppError.upstream("De gratis videogenerator gaf geen geldige video terug.");
  return { mp4, seed: typeof seed === "number" ? seed : null };
}
