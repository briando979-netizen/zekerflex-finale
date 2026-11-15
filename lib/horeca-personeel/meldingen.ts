import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendUserPush } from "@/lib/notifications/push";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";
import { KANAAL_TEAM } from "@/lib/horeca-personeel/chat";

// ---------------------------------------------------------------------------
// Pushmeldingen voor het eigen personeel van een horecazaak (ronde 4): een nieuw chatbericht, een mededeling, een nieuwe of
// gewijzigde dienst, het besluit over een ruil of verlof (naar de medewerker), en een ruil, open dienst of verlofaanvraag die op
// goedkeuring wacht (naar de beheerders). Alles best effort: een mislukte push mag nooit een actie laten mislukken, en zonder
// aangemeld apparaat gebeurt er niets. Chatmeldingen komen hooguit eens per 10 minuten per kanaal en ontvanger, anders krijgt
// iedereen bij elk berichtje een melding. De taal is Nederlands (er is nog geen taalvoorkeur per medewerker); de teksten staan
// in TEKST, klaar om per taal te kiezen. Geen tekst van het bericht zelf in de melding bij een gesprek met de beheerder.
// ---------------------------------------------------------------------------

const CHAT_PAUZE_MS = 10 * 60_000;
const BEHEER_URL = "/werkgever/horeca?tab=personeel";
const PERSONEEL_URL = "/personeel";

const dagTekst = (datum: string): string => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

const TEKST = {
  chatTeam: (naam: string) => ({ title: `Nieuw bericht in het team`, body: `${naam} schreef iets in het teamkanaal.` }),
  chatDm: (naam: string) => ({ title: `Nieuw bericht van ${naam}`, body: `Open je berichten om het te lezen.` }),
  mededeling: (tekst: string) => ({ title: "Nieuwe mededeling", body: tekst.length > 90 ? `${tekst.slice(0, 87)}…` : tekst }),
  dienst: (wat: "nieuw" | "gewijzigd" | "weg", datum: string, tijd: string) => ({
    title: wat === "nieuw" ? "Nieuwe dienst" : wat === "gewijzigd" ? "Je dienst is gewijzigd" : "Een dienst is vervallen",
    body: `${dagTekst(datum)} · ${tijd}`,
  }),
  ruilBesluit: (besluit: "goedgekeurd" | "afgewezen") => ({ title: besluit === "goedgekeurd" ? "Je ruil is goedgekeurd" : "Je ruil is afgewezen", body: "Open je rooster voor de details." }),
  verlofBesluit: (besluit: "goedgekeurd" | "afgewezen") => ({ title: besluit === "goedgekeurd" ? "Je verlof is goedgekeurd" : "Je verlof is afgewezen", body: "Open je verlof voor de details." }),
  wachtOpBesluit: (wat: string) => ({ title: "Wacht op jouw besluit", body: wat }),
};

async function stuur(userIds: string[], m: { title: string; body: string }, url: string, tag: string): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await sendUserPush(userIds, { title: m.title, body: m.body, data: { type: "PERSONEEL", url, tag }, ttlSeconds: 6 * 3600 });
  } catch (err) {
    logger.warn("horeca-personeel: push mislukt", { error: (err as Error).message });
  }
}

async function beheerderIds(tenantId: string): Promise<string[]> {
  const rijen = await prisma.membership.findMany({ where: { tenantId, role: "HQ_ADMIN", user: { disabledAt: null } }, select: { userId: true } });
  return rijen.map((r) => r.userId);
}

async function userIdsVan(tenantId: string, medewerkerIds: string[] | null, behalve?: string): Promise<string[]> {
  const d = await leesPersoneelVan(tenantId);
  return d.medewerkers.filter((m) => m.status === "actief" && m.userId && (medewerkerIds === null || medewerkerIds.includes(m.id)) && m.id !== behalve).map((m) => m.userId as string);
}

/** Alleen ontvangers die in het afgelopen venster nog geen melding voor dit kanaal kregen; zet meteen de nieuwe tijd. */
async function nietRecentGemeld(tenantId: string, kanaal: string, userIds: string[], nu: number): Promise<string[]> {
  const sleutel = `horeca:meld:${tenantId}`;
  const ruw = (await kvGet<Record<string, number>>(sleutel)) ?? {};
  const kaart: Record<string, number> = {};
  for (const [k, t] of Object.entries(ruw)) if (typeof t === "number" && nu - t < 24 * 3600_000) kaart[k] = t;
  const nieuw = userIds.filter((u) => nu - (kaart[`${kanaal}|${u}`] ?? 0) >= CHAT_PAUZE_MS);
  for (const u of nieuw) kaart[`${kanaal}|${u}`] = nu;
  if (nieuw.length > 0) await kvSet(sleutel, kaart);
  return nieuw;
}

/** Een nieuw chatbericht: naar het team (behalve de schrijver) of naar de ander in een gesprek met de beheerder. */
export async function meldChat(tenantId: string, kanaal: string, van: { id: string; naam: string }, nu: number = Date.now()): Promise<void> {
  const naarBeheer = kanaal !== KANAAL_TEAM && van.id !== "beheer";
  let ontvangers: string[];
  if (kanaal === KANAAL_TEAM) {
    const medewerkers = await userIdsVan(tenantId, null, van.id);
    ontvangers = van.id === "beheer" ? medewerkers : [...medewerkers, ...(await beheerderIds(tenantId))];
  } else if (naarBeheer) {
    ontvangers = await beheerderIds(tenantId);
  } else {
    ontvangers = await userIdsVan(tenantId, [kanaal.replace(/^dm-/, "")]);
  }
  const doel = await nietRecentGemeld(tenantId, kanaal, ontvangers, nu);
  if (kanaal === KANAAL_TEAM) await stuur(doel, TEKST.chatTeam(van.naam), PERSONEEL_URL, `chat-${kanaal}`);
  else await stuur(doel, TEKST.chatDm(van.naam), naarBeheer ? BEHEER_URL : PERSONEEL_URL, `chat-${kanaal}`);
}

export async function meldMededeling(tenantId: string, dashboardIds: string[], tekst: string): Promise<void> {
  const d = await leesPersoneelVan(tenantId);
  const ids = d.medewerkers.filter((m) => dashboardIds.length === 0 || dashboardIds.includes(m.dashboardId)).map((m) => m.id);
  await stuur(await userIdsVan(tenantId, ids), TEKST.mededeling(tekst), PERSONEEL_URL, "mededeling");
}

export async function meldDienst(tenantId: string, medewerkerId: string | null, wat: "nieuw" | "gewijzigd" | "weg", datum: string, tijd: string): Promise<void> {
  if (!medewerkerId) return;
  await stuur(await userIdsVan(tenantId, [medewerkerId]), TEKST.dienst(wat, datum, tijd), PERSONEEL_URL, `dienst-${datum}`);
}

export async function meldBesluit(tenantId: string, medewerkerIds: (string | null)[], soort: "ruil" | "verlof", besluit: "goedgekeurd" | "afgewezen"): Promise<void> {
  const ids = medewerkerIds.filter((x): x is string => x !== null);
  await stuur(await userIdsVan(tenantId, ids), soort === "ruil" ? TEKST.ruilBesluit(besluit) : TEKST.verlofBesluit(besluit), PERSONEEL_URL, `${soort}-besluit`);
}

export async function meldBeheerders(tenantId: string, wat: string, tag: string): Promise<void> {
  await stuur(await beheerderIds(tenantId), TEKST.wachtOpBesluit(wat), BEHEER_URL, tag);
}
