import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather, gatherDigits, hangupAfter } from "@/lib/telephony/twiml";
import { getCall, patchCall, addTurn } from "@/lib/telephony/store";
import { BEDRIJF_MENU, DEPT_OPENING, MENU_KEUZE, ROL_MENU, WERKER_MENU, voiceForLang, recogLang, type Lang } from "@/lib/telephony/scripts";
import { binnenKantoortijd, naarMedewerkerTwiml } from "@/lib/telephony/wachtrij";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/menu — het inkomende keuzemenu (IVR), sinds 13 nov 2026 eerst wie er belt (eigenaar):
//   step=lang    : taal (1 = NL, 2 = EN) → wie belt er
//   step=rol     : 1 werknemer → werknemersmenu · 2 bedrijf → bedrijvenmenu · 0 een medewerker (wachtrij)
//   step=werker  : 1 werk zoeken · 2 account, uren, uitbetaling · 3 iets melden · 0 medewerker · * terug
//   step=bedrijf : 1 personeel of een klus · 2 account, facturen, uren · 3 iets melden · 0 medewerker · * terug
//   step=dept    : het menu van vóór 13 nov, voor gesprekken die tijdens een uitrol al liepen (9 = medewerker)
// Niets of iets onbekends getoetst: het menu nog één keer (keer=2), daarna de assistent. Het gesprek gaat verder via /gather.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();

  const url = new URL(request.url);
  const callId = url.searchParams.get("callId");
  const step = url.searchParams.get("step");
  const opnieuw = url.searchParams.get("keer") === "2";
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const rec = callId ? await getCall(callId) : null;
  if (!callId || !rec) {
    return xmlResponse(twiml(hangupAfter("Er ging iets mis. Bel ons gerust opnieuw.")));
  }

  const digits = (params.Digits ?? "").trim();
  const menu = (tekst: string, stap: string, lang: Lang, keer = false) =>
    xmlResponse(twiml(gatherDigits(tekst, `${base}/api/telephony/menu?callId=${callId}&step=${stap}${keer ? "&keer=2" : ""}`, voiceForLang(lang))));

  if (step === "lang") {
    const lang: Lang = digits === "2" ? "en" : "nl";
    await patchCall(callId, { lang }).catch(() => undefined);
    return menu(ROL_MENU[lang], "rol", lang);
  }

  const lang: Lang = rec.lang ?? "nl";
  const voice = voiceForLang(lang);
  const assistent = async (dept: string) => {
    await patchCall(callId, { dept }).catch(() => undefined);
    const opening = (DEPT_OPENING[dept] ?? DEPT_OPENING.default!)[lang];
    await addTurn(callId, "ai", opening).catch(() => undefined);
    return xmlResponse(twiml(sayAndGather(opening, `${base}/api/telephony/gather?callId=${callId}`, { voice, recogLang: recogLang(lang) })));
  };
  // dept zegt de medewerker wie er wacht (DEPT_LABEL): "werker" of "bedrijf" als dat al gekozen is
  const medewerker = async (dept = "0") => {
    await patchCall(callId, { dept }).catch(() => undefined);
    await addTurn(callId, "ai", "(naar een medewerker, in de wachtrij)").catch(() => undefined);
    return xmlResponse(
      twiml(naarMedewerkerTwiml({ base, callId, lang, voice, kantoor: binnenKantoortijd(new Date()), heeftNummer: Boolean(env.TELEPHONY_FORWARD_NUMBER) })),
    );
  };

  if (step === "rol") {
    if (digits === "1") return menu(WERKER_MENU[lang], "werker", lang);
    if (digits === "2") return menu(BEDRIJF_MENU[lang], "bedrijf", lang);
    if (digits === "0") return medewerker();
    return opnieuw ? assistent("default") : menu(ROL_MENU[lang], "rol", lang, true);
  }

  if (step === "werker" || step === "bedrijf") {
    if (digits === "*") return menu(ROL_MENU[lang], "rol", lang);
    if (digits === "0") return medewerker(step);
    const keuzes = MENU_KEUZE[step];
    if (Object.hasOwn(keuzes, digits)) return assistent(keuzes[digits] ?? "default");
    return opnieuw ? assistent("default") : menu(step === "werker" ? WERKER_MENU[lang] : BEDRIJF_MENU[lang], step, lang, true);
  }

  // step=dept: het oude afdelingsmenu
  if (digits === "9") return medewerker();
  return assistent(["1", "2", "3", "4"].includes(digits) ? digits : "default");
}
