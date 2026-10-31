import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather, gatherDigits, say, dial, hangupAfter } from "@/lib/telephony/twiml";
import { getCall, patchCall, addTurn } from "@/lib/telephony/store";
import { DEPT_MENU, DEPT_OPENING, voiceForLang, recogLang, type Lang } from "@/lib/telephony/scripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/menu — het inkomende keuzemenu (IVR).
//   step=lang : taalkeuze (1 = NL, 2 = EN) → afdelingsmenu in die taal.
//   step=dept : afdeling (1 sales · 2 melding/fraude · 3 support · 4 werk zoeken ·
//               9 medewerker spreken → doorverbinden · anders de AI-assistent).
// Daarna gaat het gesprek verder via /gather, in de gekozen taal + stem.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const callId = url.searchParams.get("callId");
  const step = url.searchParams.get("step");
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const rec = callId ? await getCall(callId) : null;
  if (!callId || !rec) {
    return xmlResponse(twiml(hangupAfter("Er ging iets mis. Bel ons gerust opnieuw.")));
  }

  const digits = (params.Digits ?? "").trim();

  if (step === "lang") {
    const lang: Lang = digits === "2" ? "en" : "nl";
    await patchCall(callId, { lang }).catch(() => undefined);
    const voice = voiceForLang(lang);
    return xmlResponse(
      twiml(gatherDigits(DEPT_MENU[lang], `${base}/api/telephony/menu?callId=${callId}&step=dept`, voice)),
    );
  }

  // step === "dept"
  const lang: Lang = rec.lang ?? "nl";
  const voice = voiceForLang(lang);

  if (digits === "9") {
    await patchCall(callId, { dept: "9" }).catch(() => undefined);
    const fwd = env.TELEPHONY_FORWARD_NUMBER;
    const line = lang === "en" ? "I'll connect you, one moment please." : "Ik verbind u door, een moment alstublieft.";
    if (fwd) {
      await addTurn(callId, "ai", `Doorverbinden → ${fwd}`).catch(() => undefined);
      return xmlResponse(twiml(say(line, voice) + dial(fwd)));
    }
  }

  const dept = ["1", "2", "3", "4"].includes(digits) ? digits : "default";
  await patchCall(callId, { dept }).catch(() => undefined);
  const openings = DEPT_OPENING[dept] ?? DEPT_OPENING.default!;
  const opening = openings[lang];
  await addTurn(callId, "ai", opening).catch(() => undefined);
  return xmlResponse(
    twiml(sayAndGather(opening, `${base}/api/telephony/gather?callId=${callId}`, { voice, recogLang: recogLang(lang) })),
  );
}
