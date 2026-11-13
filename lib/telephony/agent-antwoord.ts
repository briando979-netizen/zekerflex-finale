import { env } from "@/lib/env";
import { xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather } from "@/lib/telephony/twiml";
import { getCall, addTurn, type CallRecord } from "@/lib/telephony/store";
import { phoneSystem, voiceForLang, recogLang, type Lang } from "@/lib/telephony/scripts";
import { chat, fastModel, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Het antwoord van de AI-telefonist, ook als het taalmodel er langer over doet
// dan een beller stil wil zijn. Twilio wacht 15 s per webhook, een beller veel
// korter. Is er na EERSTE_WACHT_MS nog geen antwoord, dan zegt de telefonist
// "een ogenblik" en haalt een <Redirect> naar /api/telephony/gather/vervolg het
// antwoord hier op. Zo heeft het model ANTWOORD_MAX_MS in plaats van de 8 s van
// vóór 13 nov: het eigen model (alles gratis, gemma3:4b op de cpu) haalde die
// niet, en de beller kreeg na 8 s stilte de standaardzin.
//
// Het wachtende antwoord staat op globalThis: gather en vervolg zijn aparte
// bundels. Na een herstart is het weg; dan volgt gewoon de standaardzin.
// Dat werkt alleen met één app-proces (zo staat het in docker-compose.vps.yml).
// Komen er ooit twee app-containers, dan moet dit naar KV met een korte TTL.
// ---------------------------------------------------------------------------

/** Zo lang mag een beller na zijn zin stilte horen voordat de telefonist "een ogenblik" zegt. */
export const EERSTE_WACHT_MS = 2_500;
/** Zo lang wacht de vervolgaanvraag hooguit; ruim onder de 15 s die Twilio per webhook wacht. */
export const VERVOLG_WACHT_MS = 11_000;
/**
 * Zo lang mag het model in totaal. Niet langer dan de eerste wacht plus de vervolgwacht, zodat het model altijd eerder
 * stopt dan de vervolgaanvraag (die begint pas nadat "een ogenblik" is uitgesproken).
 */
export const ANTWOORD_MAX_MS = 13_000;
const BEWAAR_MS = 60_000;

export const EEN_OGENBLIK: Record<Lang, string> = {
  nl: "Een ogenblik, ik zoek het even voor u op.",
  en: "One moment, let me look that up for you.",
};
export const FALLBACK: Record<Lang, string> = {
  nl: "Dat kan ik het beste via de website regelen: kijk op zekerflex punt com, of mail naar info at zekerflex punt com. Kan ik u verder nog ergens mee helpen?",
  en: "I can best arrange that via the website: visit zekerflex dot com, or e-mail info at zekerflex dot com. Can I help you with anything else?",
};
export const ERR_LINE: Record<Lang, string> = {
  nl: "Er ging iets mis. Bel ons gerust opnieuw. Tot ziens.",
  en: "Something went wrong. Please feel free to call us again. Goodbye.",
};

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
export const gatherUrl = (callId: string) => `${basis()}/api/telephony/gather?callId=${callId}`;
export const vervolgUrl = (callId: string) => `${basis()}/api/telephony/gather/vervolg?callId=${callId}`;

/** Vraag het taalmodel om een antwoord. Gooit nooit: geen antwoord (fout, time-out, leeg) is null. */
export async function vraagModel(callId: string, rec: CallRecord, lang: Lang): Promise<string | null> {
  try {
    await ensureAiNode();
    if (llmConfigProblem()) return null;
    const fresh = (await getCall(callId)) ?? rec;
    const history = fresh.transcript.slice(-10).map((t) => ({
      role: (t.who === "ai" ? "assistant" : "user") as "assistant" | "user",
      content: t.text,
    }));
    const out = await chat({
      purpose: "phone-agent",
      model: fastModel(),
      temperature: 0.3,
      maxTokens: 140,
      timeoutMs: ANTWOORD_MAX_MS,
      retry: false,
      messages: [{ role: "system", content: phoneSystem(lang) }, ...history],
    });
    return out.text.trim() || null;
  } catch (err) {
    logger.warn("phone agent reply failed", { error: (err as Error).message });
    return null;
  }
}

export type Uitslag = { klaar: true; tekst: string | null } | { klaar: false };

/** Wacht hooguit `ms` op het antwoord. */
export async function binnen(antwoord: Promise<string | null>, ms: number): Promise<Uitslag> {
  let klok: ReturnType<typeof setTimeout> | undefined;
  const teLaat = new Promise<Uitslag>((r) => {
    klok = setTimeout(() => r({ klaar: false }), ms);
  });
  try {
    return await Promise.race([antwoord.then((tekst): Uitslag => ({ klaar: true, tekst })), teLaat]);
  } finally {
    if (klok) clearTimeout(klok);
  }
}

type Wachtend = { antwoord: Promise<string | null>; at: number };
const g = globalThis as typeof globalThis & { __zfBelAntwoorden?: Map<string, Wachtend> };
const wachtend = (): Map<string, Wachtend> => (g.__zfBelAntwoorden ??= new Map());

/**
 * Zet een antwoord klaar voor de vervolgaanvraag. Alleen in het geheugen (niet in KV) en hooguit BEWAAR_MS: hangt de
 * beller op tijdens het wachten, dan gaat het vanzelf weg. Er staat geen nummer in, alleen het antwoord van het model.
 */
export function parkeer(callId: string, antwoord: Promise<string | null>, nu = Date.now()): void {
  const m = wachtend();
  for (const [k, v] of m) if (nu - v.at > BEWAAR_MS) m.delete(k);
  const w: Wachtend = { antwoord, at: nu };
  m.set(callId, w);
  const klok = setTimeout(() => {
    if (m.get(callId) === w) m.delete(callId);
  }, BEWAAR_MS);
  (klok as { unref?: () => void }).unref?.();
}

/** Het klaargezette antwoord, één keer. Null als er niets klaarstaat (bv. na een herstart). */
export function haalOp(callId: string): Promise<string | null> | null {
  const m = wachtend();
  const w = m.get(callId);
  if (!w) return null;
  m.delete(callId);
  return w.antwoord;
}

/** Spreek het antwoord uit, zet het in het transcript en luister weer. */
export async function spreekAntwoord(callId: string, tekst: string, lang: Lang): Promise<Response> {
  await addTurn(callId, "ai", tekst).catch(() => undefined);
  return xmlResponse(twiml(sayAndGather(tekst, gatherUrl(callId), { voice: voiceForLang(lang), recogLang: recogLang(lang) })));
}
