import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendMail } from "@/lib/mail";
import { sendUserPush } from "@/lib/notifications/push";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { transcribeAudio } from "@/lib/asr/transcribe";
import { normalizeNumber } from "@/lib/telephony/consent";
import { berichtenSleutel } from "@/lib/telefoon-berichten/sleutel";
import { getLine, listLines, type PhoneLine } from "@/lib/telephony/lines";
import { selectedOptions } from "@/lib/telephony/plans";
import {
  BEL_SECONDEN,
  geldigeTijd,
  MAX_MENU,
  MAX_NUMMERS,
  nummerTekst,
  standaardInstellingen,
  WEEKDAGEN,
  type BerichtSoort,
  type LijnBericht,
  type LijnInstellingen,
} from "@/lib/telephony/lijn";

// ---------------------------------------------------------------------------
// De server van een actieve klantlijn (lib/telephony/lijn.ts): de lijn bij een gebeld nummer vinden, de instellingen
// bewaren, de berichten (terugbelverzoek, voicemail, opname, sms) bewaren en melden, een voicemail uitschrijven met
// onze eigen Whisper, sms terugsturen en het nummer bij Twilio aan onze webhooks koppelen.
//   key "telefoon:berichten:<eigenaar>:<lijn>" → LijnBericht[] (lib/telefoon-berichten/sleutel.ts; eigenaar = organisatie
//   of, bij een werknummer, de gebruiker: wissen met de organisatie of per gebruiker, lib/privacy)
// Berichten blijven hooguit 90 dagen en hooguit 200 per lijn. Nummers van bellers staan nooit in een log.
// ---------------------------------------------------------------------------

const BEWAAR_DAGEN = 90;
const MAX_BERICHTEN = 200;

const eigenaarVan = (l: PhoneLine) => (l.scope === "bedrijf" ? (l.tenantId ?? "onbekend") : l.userId);
const berichtenKey = (l: PhoneLine) => berichtenSleutel(eigenaarVan(l), l.id);

export const opties = (l: PhoneLine) => selectedOptions(l.selection);

/** De instellingen van een lijn; een lijn die er nog geen heeft, krijgt de standaard (naam en doorschakelnummer uit de aanvraag). */
export function instellingenVan(l: PhoneLine): LijnInstellingen {
  return l.instellingen ?? standaardInstellingen(l.orgName ?? l.requesterName, l.forwardTo ?? (l.selection.kind === "eigen" ? null : l.ownNumber));
}

/** De actieve lijn waarop gebeld of ge-sms't wordt; null = het eigen nummer van ZekerFlex (of onbekend). */
export async function lijnBijNummer(nummer: string | undefined): Promise<PhoneLine | null> {
  if (!nummer) return null;
  const n = normalizeNumber(nummer);
  if (!n || n === normalizeNumber(env.TWILIO_FROM_NUMBER ?? "")) return null;
  return (await listLines()).find((l) => l.status === "actief" && l.number === n) ?? null;
}

const nummer = z
  .string()
  .trim()
  .max(30)
  .refine((v) => /^[\d\s+()./-]+$/.test(v), "Vul een geldig telefoonnummer in, bijvoorbeeld 06 12345678.")
  .transform((v) => normalizeNumber(v))
  .refine((v) => /^\+\d{9,15}$/.test(v), "Vul een geldig telefoonnummer in, bijvoorbeeld 06 12345678.");
const tijd = z.string().refine(geldigeTijd, "Vul een tijd in als 09:00.");
const vak = z.object({ van: tijd, tot: tijd }).nullable();

export const instellingenSchema = z.object({
  naam: z.string().trim().min(2, "Vul de naam in die de beller hoort.").max(60),
  doorschakelen: z.array(nummer).max(MAX_NUMMERS),
  belSeconden: z.number().int().min(BEL_SECONDEN.min).max(BEL_SECONDEN.max),
  openingstijden: z.object(Object.fromEntries(WEEKDAGEN.map((d) => [d, vak])) as Record<(typeof WEEKDAGEN)[number], typeof vak>),
  menu: z
    .array(z.object({ toets: z.number().int().min(1).max(9), label: z.string().trim().min(2).max(40), naar: z.array(nummer).min(1).max(MAX_NUMMERS) }))
    .max(MAX_MENU)
    .refine((m) => new Set(m.map((x) => x.toets)).size === m.length, "Elke toets mag maar één keer voorkomen."),
  opnemen: z.boolean(),
});

/** Instellingen bewaren; alleen wat de lijn echt heeft (zonder teamnummer één doorschakelnummer, zonder keuzemenu geen menu). */
export async function bewaarInstellingen(line: PhoneLine, input: z.infer<typeof instellingenSchema>): Promise<PhoneLine> {
  if (line.status !== "actief") throw AppError.validation("Je kunt dit instellen zodra je lijn actief is.");
  const o = opties(line);
  for (const [dag, v] of Object.entries(input.openingstijden)) {
    if (v && v.tot !== "00:00" && v.tot <= v.van) throw AppError.validation(`Op ${dag} moet de sluitingstijd na de openingstijd liggen.`);
  }
  const inst: LijnInstellingen = {
    naam: input.naam,
    doorschakelen: [...new Set(input.doorschakelen)].slice(0, o.has("team") ? MAX_NUMMERS : 1),
    belSeconden: input.belSeconden,
    openingstijden: input.openingstijden,
    menu: o.has("keuzemenu") ? input.menu.map((m) => ({ ...m, naar: [...new Set(m.naar)].slice(0, o.has("team") ? MAX_NUMMERS : 1) })).sort((a, b) => a.toets - b.toets) : [],
    opnemen: o.has("opnemen") ? input.opnemen : false,
  };
  const next: PhoneLine = { ...line, instellingen: inst };
  await kvSet(`phone-line:${line.id}`, next);
  return next;
}

// ── berichten ───────────────────────────────────────────────────────────────

const vers = (b: LijnBericht, nu: number) => nu - Date.parse(b.op) < BEWAAR_DAGEN * 86_400_000;

export async function berichtenVan(line: PhoneLine, nu = Date.now()): Promise<LijnBericht[]> {
  const lijst = (await kvGet<LijnBericht[]>(berichtenKey(line)).catch(() => null)) ?? [];
  return lijst.filter((b) => vers(b, nu)).sort((a, b) => b.op.localeCompare(a.op));
}

/**
 * Een bericht toevoegen of bijwerken op zijn bron (CallSid, RecordingSid, MessageSid): Twilio stuurt callbacks soms
 * dubbel, en een gesprek gaat stap voor stap (gemist → vraag → naam). Oude berichten vallen eraf.
 */
export async function bewaarBericht(line: PhoneLine, bron: string, patch: Partial<Omit<LijnBericht, "id" | "bron">> & { soort: BerichtSoort }, nu = new Date()): Promise<LijnBericht> {
  const key = berichtenKey(line);
  const lijst = ((await kvGet<LijnBericht[]>(key).catch(() => null)) ?? []).filter((b) => vers(b, nu.getTime()));
  const oud = lijst.find((b) => b.bron === bron);
  const bericht: LijnBericht = oud ? { ...oud, ...patch } : { id: randomUUID().slice(0, 12), bron, tekst: "", op: nu.toISOString(), van: "onbekend", ...patch };
  const rest = lijst.filter((b) => b.bron !== bron);
  await kvSet(key, [...rest, bericht].slice(-MAX_BERICHTEN));
  return bericht;
}

export async function berichtVan(line: PhoneLine, id: string): Promise<LijnBericht | null> {
  return (await berichtenVan(line)).find((b) => b.id === id) ?? null;
}

const twilioAuth = () => (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN ? `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}` : null);
const twilioApi = (pad: string) => `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}${pad}`;

export async function verwijderBericht(line: PhoneLine, id: string): Promise<void> {
  const key = berichtenKey(line);
  const lijst = (await kvGet<LijnBericht[]>(key).catch(() => null)) ?? [];
  const weg = lijst.find((b) => b.id === id);
  if (!weg) throw AppError.notFound("Dit bericht bestaat niet (meer).");
  await kvSet(key, lijst.filter((b) => b.id !== id));
  // de opname ook bij Twilio weg (best effort: het bericht zelf is al weg)
  const auth = twilioAuth();
  if (weg.opnameSid && auth) await fetch(twilioApi(`/Recordings/${weg.opnameSid}.json`), { method: "DELETE", headers: { Authorization: auth } }).catch(() => undefined);
}

/** Wie belde, voor een opname-callback (die stuurt het nummer van de beller niet mee). */
export async function vanGesprek(callSid: string): Promise<string | null> {
  const auth = twilioAuth();
  if (!auth || !/^CA[0-9a-f]{32}$/i.test(callSid)) return null;
  const res = await fetch(twilioApi(`/Calls/${callSid}.json`), { headers: { Authorization: auth } }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { from?: string } | undefined;
  return data?.from ? normalizeNumber(data.from) : null;
}

/** De opname bij Twilio, als stream voor de eigen proxy (de Twilio-URL vraagt de sleutel van het account). */
export async function opnameStream(opnameSid: string): Promise<Response | null> {
  const auth = twilioAuth();
  if (!auth || !/^RE[0-9a-f]{32}$/i.test(opnameSid)) return null;
  const res = await fetch(twilioApi(`/Recordings/${opnameSid}.mp3`), { headers: { Authorization: auth } }).catch(() => null);
  return res?.ok && res.body ? res : null;
}

/** Voicemail of opname uitschrijven met onze eigen Whisper; lukt het niet, dan blijft het geluid er gewoon. */
export async function schrijfUit(line: PhoneLine, bericht: LijnBericht): Promise<LijnBericht> {
  if (!bericht.opnameSid) return bericht;
  const res = await opnameStream(bericht.opnameSid);
  if (!res) return bericht;
  try {
    const audio = Buffer.from(await res.arrayBuffer());
    const { text } = await transcribeAudio(audio, "opname.mp3", { language: "nl", timeoutMs: 120_000 });
    const tekst = text.replace(/\s+/g, " ").trim().slice(0, 4000);
    return tekst ? bewaarBericht(line, bericht.bron, { soort: bericht.soort, tekst }) : bericht;
  } catch (err) {
    logger.info("telefoonlijn: uitschrijven lukte niet", { lijn: line.id, fout: err instanceof Error ? err.message.slice(0, 120) : "onbekend" });
    return bericht;
  }
}

// ── melden ──────────────────────────────────────────────────────────────────

const SOORT_NL: Record<"terugbelverzoek" | "voicemail" | "sms", string> = { terugbelverzoek: "Terugbelverzoek", voicemail: "Voicemail", sms: "Sms" };

/** Een seintje bij een terugbelverzoek, voicemail of sms: push (werker in zijn eigen taal) en een mail aan de aanvrager. */
export async function meldBericht(line: PhoneLine, b: LijnBericht): Promise<void> {
  if (b.soort !== "terugbelverzoek" && b.soort !== "voicemail" && b.soort !== "sms") return;
  const soort = b.soort;
  const van = nummerTekst(b.van);
  const url = line.scope === "bedrijf" ? "/werkgever/telefonie" : "/dashboard/telefonie";
  const tag = `telefoonlijn-${line.id}-${b.id}`;
  try {
    if (line.scope === "persoonlijk") {
      await sendLocalizedPush([line.userId], (t) => ({ title: t.lijnTitle(soort, van), body: t.lijnBody, data: { type: "telefoonlijn", url, tag }, ttlSeconds: 6 * 3600 }));
    } else if (line.tenantId) {
      const leden = await prisma.membership.findMany({ where: { tenantId: line.tenantId, role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] }, user: { disabledAt: null } }, select: { userId: true } });
      await sendUserPush(
        leden.map((l) => l.userId),
        { title: `${SOORT_NL[soort]} van ${van}`, body: b.tekst ? b.tekst.slice(0, 120) : "Bekijk het bij Zakelijk nummer & bellen.", data: { type: "telefoonlijn", url, tag }, ttlSeconds: 6 * 3600 },
      );
    }
  } catch (err) {
    logger.warn("telefoonlijn: push mislukt", { lijn: line.id, fout: err instanceof Error ? err.message : String(err) });
  }
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const regels = [
    `${SOORT_NL[soort]} op je ZekerFlex-nummer ${line.number ? nummerTekst(line.number) : ""}`.trim(),
    `Van: ${van}${b.naam ? ` (${b.naam})` : ""}`,
    b.tekst ? `\n${b.tekst}` : "",
    `\nBekijk en beluister het in ZekerFlex: ${base}${url}`,
  ].filter(Boolean);
  await sendMail({ to: line.requesterEmail, subject: `${SOORT_NL[soort]} van ${van}`, text: regels.join("\n"), kind: "telefoonlijn" }).catch((err: unknown) =>
    logger.warn("telefoonlijn: mail mislukt", { lijn: line.id, fout: err instanceof Error ? err.message : String(err) }),
  );
}

// ── sms ─────────────────────────────────────────────────────────────────────

/**
 * Een sms vanaf de lijn terugsturen. Alleen naar een nummer dat deze lijn al belde of sms'te: zo wordt de lijn
 * nooit een sms-kanon naar willekeurige nummers.
 */
export async function stuurSms(line: PhoneLine, aan: string, tekst: string): Promise<LijnBericht> {
  if (!opties(line).has("sms")) throw AppError.validation("Sms hoort niet bij deze lijn.");
  if (line.status !== "actief" || !line.number) throw AppError.validation("Je lijn is nog niet actief.");
  const naar = normalizeNumber(aan);
  const bekend = (await berichtenVan(line)).some((b) => b.van === naar);
  if (!bekend) throw AppError.validation("Je kunt alleen een sms sturen naar iemand die je al belde of een sms stuurde.");
  const auth = twilioAuth();
  if (!auth) throw AppError.upstream("Sms versturen kan nu even niet.");
  const res = await fetch(twilioApi("/Messages.json"), {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: naar, From: line.number, Body: tekst }),
  }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { sid?: string } | undefined;
  if (!res?.ok || !data?.sid) throw AppError.upstream("De sms kon niet worden verstuurd. Probeer het zo nog eens.");
  return bewaarBericht(line, data.sid, { soort: "sms", van: naar, tekst, uit: true });
}

// ── het nummer bij Twilio koppelen ──────────────────────────────────────────

/**
 * Zet bij een actief gezette lijn het nummer in ons Twilio-account op onze webhooks (bellen en sms), zodat de
 * beheerder dat niet met de hand hoeft te doen. Kost niets en koopt niets. Geeft null of de reden waarom het niet lukte.
 */
export async function koppelNummer(nummer: string): Promise<string | null> {
  const auth = twilioAuth();
  if (!auth) return "Twilio is niet ingesteld op de server.";
  const lijst = await fetch(twilioApi(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(nummer)}`), { headers: { Authorization: auth } }).catch(() => null);
  const data = (await lijst?.json().catch(() => ({}))) as { incoming_phone_numbers?: { sid: string }[] } | undefined;
  const sid = data?.incoming_phone_numbers?.[0]?.sid;
  if (!sid) return "Dit nummer staat niet in ons Twilio-account; zet de webhooks daar zelf op /api/telephony/voice en /api/telephony/sms.";
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(twilioApi(`/IncomingPhoneNumbers/${sid}.json`), {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ VoiceUrl: `${base}/api/telephony/voice`, VoiceMethod: "POST", SmsUrl: `${base}/api/telephony/sms`, SmsMethod: "POST" }),
  }).catch(() => null);
  return res?.ok ? null : "Twilio weigerde het koppelen; zet de webhooks daar zelf op /api/telephony/voice en /api/telephony/sms.";
}

/** Een lijn van deze eigenaar (bedrijf of persoon), of een nette 404. */
export async function lijnVanEigenaar(id: string, scope: PhoneLine["scope"], eigenaar: string): Promise<PhoneLine> {
  const line = await getLine(id);
  if (!line || line.scope !== scope || eigenaarVan(line) !== eigenaar) throw AppError.notFound("Deze lijn bestaat niet (meer).");
  return line;
}
