import type { EigenLimiet } from "@/lib/ai/ketting-limiet";

// ---------------------------------------------------------------------------
// De gratis rij: gratis AI-diensten met een OpenAI-vorm (/chat/completions), de beste eerst. Staat "alles gratis"
// aan (lib/ai/gratis.ts), dan krijgt het eerste model met een sleutel dat niet vol zit de vraag; zit het aan zijn
// limiet (429), dan gaat dezelfde vraag meteen naar het volgende. Kan niemand, dan antwoordt ons eigen model op de VPS,
// zoals nu. De rij valt dus nooit stil.
//
// Onderzocht op 16 nov 2026 (bronnen hieronder per dienst). Alleen deze drie zijn echt gratis én mogen zakelijk vanuit de
// EER zonder dat ze onze vragen gebruiken om te trainen. Afgevallen: Gemini gratis (niet voor gebruikers in de EER,
// mensen lezen mee), NVIDIA (alleen proef, traint), Cohere (niet zakelijk), OpenRouter :free (sommige trainen, 50 per
// dag), GitHub Models (gestopt 30 juli 2026), Hugging Face (geen gratis tegoed meer), Cerebras (betaalkaart, eenmalig),
// SambaNova (tegoed kopen, 20 per dag), Scaleway (betaalkaart).
//
// Puur bestand (geen kv, geen fetch): het beheerscherm leest dezelfde lijst. De sleutels staan in Beheer (KV,
// lib/ai/ketting-stand.ts), nooit hier. Elk model heeft bij Groq en Cloudflare een eigen limiet, dus twee modellen van
// één dienst geven twee keer zoveel gratis vragen met dezelfde sleutel.
// ---------------------------------------------------------------------------

export type DienstId = "groq" | "mistral" | "cloudflare";

export interface KettingDienst {
  id: DienstId;
  naam: string;
  /** OpenAI-vorm, zonder / op het eind; "{account}" = het accountnummer (Cloudflare) */
  basis: string;
  /** heeft naast de sleutel een accountnummer nodig */
  accountNodig: boolean;
  /** waar de vragen verwerkt worden */
  waar: string;
  /** waar de eigenaar een gratis sleutel maakt */
  aanmelden: string;
  /** de gratis limiet in gewone woorden */
  limietTekst: string;
  /** wat je moet weten (voorwaarden, gegevens) */
  opmerking: string;
}

export interface KettingAanbieder {
  /** uniek per model in de rij */
  id: string;
  dienst: DienstId;
  model: string;
  /** kan response_format json_object aan; anders vragen we JSON alleen in de tekst (extractJson leest het toch) */
  json: boolean;
  /** kan stromen (stream: true) */
  stream: boolean;
  /** onze eigen grens, iets onder die van de dienst, zodat we niet steeds tegen zijn 429 lopen */
  limiet: EigenLimiet;
  /** vaste extra velden in elke vraag (bijv. weinig denkwerk) */
  extra: Record<string, unknown>;
  /** een denkend model telt zijn denkwerk mee in max_tokens: zoveel extra ruimte, anders blijft het antwoord leeg */
  denkRuimte: number;
}

export const KETTING_DIENSTEN: KettingDienst[] = [
  {
    id: "groq",
    naam: "Groq",
    basis: "https://api.groq.com/openai/v1",
    accountNodig: false,
    waar: "VS (Google Cloud), via Groq UK",
    aanmelden: "https://console.groq.com/keys",
    limietTekst: "per model 30 vragen per minuut, 1.000 per dag en 200.000 woorddelen per dag (console.groq.com/docs/rate-limits, 16 nov 2026)",
    opmerking:
      "Heel snel. Groq mag onze vragen volgens zijn voorwaarden niet gebruiken om te trainen (Services Agreement §4.2) en bewaart standaard niets. Zet in de console ook 'Zero Data Retention' aan.",
  },
  {
    id: "mistral",
    naam: "Mistral",
    basis: "https://api.mistral.ai/v1",
    accountNodig: false,
    waar: "EU (Frankrijk)",
    aanmelden: "https://console.mistral.ai/api-keys",
    limietTekst: "gratis plan 'Experiment'; de limieten staan alleen in de console (16 nov 2026)",
    opmerking:
      "Europees en goed in het Nederlands. Let op: op het gratis plan mag Mistral vragen gebruiken om te trainen, tenzij je dat uitzet: in de Mistral-console bij Admin → Privacy 'Anonymous improvement data' uitzetten. Mistral noemt het gratis plan bedoeld om te proberen.",
  },
  {
    id: "cloudflare",
    naam: "Cloudflare Workers AI",
    basis: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
    accountNodig: true,
    waar: "wereldwijd netwerk van Cloudflare",
    aanmelden: "https://dash.cloudflare.com/?to=/:account/ai/workers-ai",
    limietTekst: "10.000 'neurons' per dag, gedeeld met de AI-foto's (ongeveer 100 tot 500 vragen, afhankelijk van het model), terug om 01:00 Nederlandse tijd",
    opmerking: "Cloudflare gebruikt onze vragen niet om te trainen en bewaart ze niet na het antwoord. Dezelfde sleutel als voor de AI-foto's.",
  },
];

export const KETTING_AANBIEDERS: KettingAanbieder[] = [
  // snel en sterk eerst
  { id: "groq-gpt-oss-120b", dienst: "groq", model: "openai/gpt-oss-120b", json: true, stream: true, limiet: { perMinuut: 25, perDag: 950 }, extra: { reasoning_effort: "low" }, denkRuimte: 512 },
  { id: "mistral-large", dienst: "mistral", model: "mistral-large-latest", json: true, stream: true, limiet: { perMinuut: 30 }, extra: {}, denkRuimte: 0 },
  { id: "groq-gpt-oss-20b", dienst: "groq", model: "openai/gpt-oss-20b", json: true, stream: true, limiet: { perMinuut: 25, perDag: 950 }, extra: { reasoning_effort: "low" }, denkRuimte: 512 },
  { id: "mistral-small", dienst: "mistral", model: "mistral-small-latest", json: true, stream: true, limiet: { perMinuut: 30 }, extra: {}, denkRuimte: 0 },
  // Cloudflare als laatste: zijn tegoed is ook voor de AI-foto's
  { id: "cloudflare-mistral-small", dienst: "cloudflare", model: "@cf/mistralai/mistral-small-3.1-24b-instruct", json: false, stream: true, limiet: { perMinuut: 250 }, extra: {}, denkRuimte: 0 },
  { id: "cloudflare-gemma", dienst: "cloudflare", model: "@cf/google/gemma-4-26b-a4b-it", json: false, stream: true, limiet: { perMinuut: 250 }, extra: {}, denkRuimte: 0 },
];

export const dienstVan = (id: DienstId): KettingDienst | undefined => KETTING_DIENSTEN.find((d) => d.id === id);

/**
 * Taken die nooit door de rij gaan en altijd op onze eigen server blijven:
 *  - ai-warm houdt juist óns model warm;
 *  - de rest bevat persoonsgegevens van werkers, bellers of klanten (ID-controle, telefoongesprekken, chats tussen
 *    gebruikers, cv's, geldzaken). Die sturen we niet naar een gratis dienst.
 */
export const BLIJFT_EIGEN = new Set<string>([
  "ai-warm",
  "kyc-review",
  "kyc-vision",
  "bank-login",
  "phone-agent",
  "phone-outcome",
  "chat-assist",
  "companion",
  "recruiter-agent",
  "recruiter-draft",
  "motivation-writer",
  "accountant-vraag",
  "bon-lezen",
  "mijn-ai",
]);

/** Mag deze taak door de gratis rij? Een taak zonder naam niet (dan weten we niet wat erin zit). */
export function magViaKetting(purpose: string | undefined): boolean {
  if (!purpose) return false;
  return !BLIJFT_EIGEN.has(purpose);
}

/** De taken die op onze eigen server blijven, in gewone woorden (voor het beheerscherm). */
export const BLIJFT_EIGEN_TEKST =
  "ID-controle, telefoongesprekken, chats tussen gebruikers, cv's en sollicitaties, geldzaken en bonnetjes, en het warm houden van ons eigen model";
