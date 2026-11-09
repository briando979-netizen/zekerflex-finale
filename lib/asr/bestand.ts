// ---------------------------------------------------------------------------
// Admin → Audio naar tekst: welke bestanden, welke talen, en de woordenlijst
// die Whisper helpt met onze eigen namen ("ZekerFlex" werd anders "Zekervoer").
// Puur bestand: de pagina (browser), de route en de tests delen dit.
// ---------------------------------------------------------------------------

/** Hoogstens zo groot: een uur spraak als mp3 is ±60 MB. */
export const AUDIO_MAX_BYTES = 60_000_000;

export const AUDIO_TALEN = [
  { code: "nl", label: "Nederlands" },
  { code: "en", label: "Engels" },
  { code: "pl", label: "Pools" },
  { code: "ro", label: "Roemeens" },
  { code: "uk", label: "Oekraïens" },
  { code: "de", label: "Duits" },
  { code: "fr", label: "Frans" },
  { code: "tr", label: "Turks" },
  { code: "ar", label: "Arabisch" },
] as const;

export type AudioTaal = (typeof AUDIO_TALEN)[number]["code"];

export function isAudioTaal(v: unknown): v is AudioTaal {
  return typeof v === "string" && AUDIO_TALEN.some((t) => t.code === v);
}

/** Geluid en video (een filmpje van de telefoon): Whisper haalt het geluid er zelf uit. */
const EXTENSIES = new Set(["mp3", "m4a", "mp4", "aac", "ogg", "oga", "opus", "wav", "webm", "flac", "amr", "3gp", "mov", "mpeg", "mpga"]);

/** Wat de browser bij het kiezen mag tonen. */
export const AUDIO_ACCEPT = "audio/*,video/*,.opus,.ogg,.m4a,.amr,.3gp";

/** Woorden die Whisper moet herkennen; zonder deze hint verhaspelt hij onze namen. */
export const WHISPER_HINT = "ZekerFlex, flexwerker, opdrachtgever, klus, dienst, uren, spraakherkenning, uitbetaling, werkgever, uitzendkracht.";

export function extensieVan(naam: string): string {
  const i = naam.lastIndexOf(".");
  return i >= 0 ? naam.slice(i + 1).toLowerCase() : "";
}

/** Een foutmelding voor de gebruiker, of null als het bestand bruikbaar is. */
export function audioBestandFout(naam: string, type: string, grootte: number): string | null {
  if (grootte <= 0) return "Het bestand is leeg.";
  if (grootte > AUDIO_MAX_BYTES) return "Het bestand is te groot (hoogstens 60 MB). Knip de opname op en zet de delen apart om.";
  const soort = type.toLowerCase();
  if (!EXTENSIES.has(extensieVan(naam)) && !soort.startsWith("audio/") && !soort.startsWith("video/")) {
    return "Dit is geen geluids- of videobestand. Gebruik bijvoorbeeld mp3, m4a, ogg of opus (WhatsApp) of wav.";
  }
  return null;
}

/** "8 s", "1 min 05 s": hoe lang het omzetten duurde. */
export function duurTekst(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** Een veilige bestandsnaam voor de tekst: "spraakbericht.txt" bij "spraakbericht.opus". */
export function tekstBestandsnaam(naam: string): string {
  const basis = naam.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60);
  return `${basis || "opname"}.txt`;
}
