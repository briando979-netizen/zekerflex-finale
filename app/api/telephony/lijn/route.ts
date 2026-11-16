import { after } from "next/server";
import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";
import { say, sayAndGather, twiml } from "@/lib/telephony/twiml";
import { getLine } from "@/lib/telephony/lines";
import { normalizeNumber } from "@/lib/telephony/consent";
import { belplan, ZINNEN } from "@/lib/telephony/lijn";
import { bellenTwiml, lijnUrl, menuTwiml, nuInNederland, terugvalTwiml } from "@/lib/telephony/lijn-twiml";
import { bewaarBericht, instellingenVan, meldBericht, opties, schrijfUit, vanGesprek } from "@/lib/telephony/lijn-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/lijn?lijn=<id>&stap=<stap> — de vervolgstappen van een gesprek naar een klantlijn
// (lib/telephony/lijn.ts; het begin staat in /api/telephony/voice). Twilio-handtekening vereist (openbaar onder
// /api/telephony). Stappen: menu (toets gekozen), na-bellen (niemand nam op?), vraag en naam (de assistent),
// voicemail (ingesproken), opname (de opname is klaar: uitschrijven en melden). Het bericht hangt aan het CallSid.

const leeg = () => new Response(null, { status: 204 });

export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();

  const q = new URL(request.url).searchParams;
  const lijn = await getLine(q.get("lijn") ?? "").catch(() => null);
  const stap = q.get("stap") ?? "";
  const callSid = params.CallSid ?? "";
  if (!lijn || lijn.status !== "actief") return stap === "opname" ? leeg() : xmlResponse(twiml("<Hangup/>"));
  const inst = instellingenVan(lijn);
  const plan = belplan(opties(lijn), lijn.answerAt.includes("ai"), inst, nuInNederland());
  const van = params.From ? normalizeNumber(params.From) : "onbekend";
  const callerId = /^\+\d{9,15}$/.test(van) ? van : (lijn.number ?? "");

  // niemand nam op of het is buiten de tijden: het gemiste gesprek bewaren, dan de terugval
  const terugval = async () => {
    await bewaarBericht(lijn, callSid, { soort: "gemist", van }).catch(() => undefined);
    return xmlResponse(twiml(terugvalTwiml(lijn.id, inst.naam, plan.terugval)));
  };

  switch (stap) {
    case "menu": {
      const keuze = plan.menu?.find((m) => String(m.toets) === (params.Digits ?? ""));
      if (keuze) return xmlResponse(twiml(bellenTwiml(lijn.id, keuze.naar, inst.belSeconden, plan.melding, callerId)));
      const poging = Number(q.get("poging") ?? "1");
      if (plan.menu && poging < 2) return xmlResponse(twiml(menuTwiml(lijn.id, inst.naam, plan.menu, poging + 1)));
      return terugval();
    }
    case "na-bellen":
      // opgenomen en het gesprek is klaar: ophangen; anders (bezet, geen antwoord, mislukt) de terugval
      if (params.DialCallStatus === "completed") return xmlResponse(twiml("<Hangup/>"));
      return terugval();
    case "vraag": {
      const vraag = (params.SpeechResult ?? "").trim().slice(0, 600);
      if (vraag) await bewaarBericht(lijn, callSid, { soort: "terugbelverzoek", van, tekst: vraag }).catch(() => undefined);
      return xmlResponse(twiml(sayAndGather(ZINNEN.naamVraag, lijnUrl(lijn.id, "naam"))));
    }
    case "naam": {
      const naam = (params.SpeechResult ?? "").trim().replace(/[.!?]+$/, "").slice(0, 80);
      const b = await bewaarBericht(lijn, callSid, { soort: "terugbelverzoek", van, ...(naam ? { naam } : {}) }).catch(() => null);
      if (b) after(() => meldBericht(lijn, b));
      return xmlResponse(twiml(say(ZINNEN.bedankt(naam)) + "<Hangup/>"));
    }
    case "voicemail": {
      if (params.RecordingSid) {
        await bewaarBericht(lijn, callSid, { soort: "voicemail", van, opnameSid: params.RecordingSid, duurS: Number(params.RecordingDuration ?? "0") || 0 }).catch(() => undefined);
      }
      return xmlResponse(twiml(say(ZINNEN.voicemailBedankt) + "<Hangup/>"));
    }
    case "opname": {
      // de opname is klaar (voicemail of een opgenomen gesprek): bewaren, uitschrijven met onze eigen Whisper, melden
      if (params.RecordingStatus !== "completed" || !params.RecordingSid) return leeg();
      const soort = q.get("soort") === "voicemail" ? "voicemail" : "opname";
      const bron = soort === "voicemail" ? callSid : `opname:${callSid}`;
      const recSid = params.RecordingSid;
      const duurS = Number(params.RecordingDuration ?? "0") || 0;
      after(async () => {
        // de callback noemt de beller niet; bij een voicemail staat hij er meestal al (stap voicemail), anders opvragen
        const beller = await vanGesprek(callSid);
        const b = await bewaarBericht(lijn, bron, { soort, opnameSid: recSid, duurS, ...(beller ? { van: beller } : {}) });
        const uit = await schrijfUit(lijn, b);
        if (soort === "voicemail") await meldBericht(lijn, uit);
      });
      return leeg();
    }
    default:
      return xmlResponse(twiml("<Hangup/>"));
  }
}
