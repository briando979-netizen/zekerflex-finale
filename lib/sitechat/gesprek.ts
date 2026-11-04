import { kvDelete, kvDeleteStale, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { BEWAAR_DAGEN, isGesprekId, isKanaal, metBericht, nieuwGesprek, verlopen, type ChatRol, type ChatStatus, type SiteGesprek } from "@/lib/sitechat/regels";

// ---------------------------------------------------------------------------
// Opslag van websitechats per kanaal (één site). KV: sitechat:<kanaal>:<id>.
// Het id is een willekeurig token uit de browser van de gast; wie het heeft,
// kan alleen de berichten van het team in dat ene gesprek ophalen.
// Gesprekken vervallen 90 dagen na het laatste bericht (regels.ts).
// ---------------------------------------------------------------------------

export const sitechatPrefix = (kanaal: string) => `sitechat:${kanaal}:`;
const sleutel = (kanaal: string, id: string) => `${sitechatPrefix(kanaal)}${id}`;

function controleer(kanaal: string, id: string) {
  if (!isKanaal(kanaal) || !isGesprekId(id)) throw AppError.validation("Onbekend gesprek.");
}

export async function haalGesprek(kanaal: string, id: string): Promise<SiteGesprek | null> {
  if (!isKanaal(kanaal) || !isGesprekId(id)) return null;
  return kvGet<SiteGesprek>(sleutel(kanaal, id));
}

export async function voegBerichtToe(
  kanaal: string,
  id: string,
  bericht: { rol: ChatRol; tekst: string; door?: string | undefined },
  extra: { pagina?: string | undefined; account?: string | undefined } = {},
): Promise<SiteGesprek> {
  controleer(kanaal, id);
  const nu = new Date().toISOString();
  const huidig = (await haalGesprek(kanaal, id)) ?? nieuwGesprek(kanaal, id, nu);
  const volgend: SiteGesprek = {
    ...metBericht(huidig, bericht, nu),
    ...(extra.pagina && !huidig.pagina ? { pagina: extra.pagina.slice(0, 200) } : {}),
    ...(extra.account ? { account: extra.account.toLowerCase() } : {}),
  };
  await kvSet(sleutel(kanaal, id), volgend);
  return volgend;
}

async function wijzig(kanaal: string, id: string, f: (g: SiteGesprek) => SiteGesprek): Promise<SiteGesprek> {
  controleer(kanaal, id);
  const g = await haalGesprek(kanaal, id);
  if (!g) throw AppError.notFound("Gesprek niet gevonden.");
  const volgend = f(g);
  await kvSet(sleutel(kanaal, id), volgend);
  return volgend;
}

export const zetStatus = (kanaal: string, id: string, status: ChatStatus) => wijzig(kanaal, id, (g) => ({ ...g, status }));

/** Toewijzen aan iemand van het team; leeg = niemand. */
export const wijsToe = (kanaal: string, id: string, wie: string) =>
  wijzig(kanaal, id, (g) => {
    const { toegewezen: _weg, ...rest } = g;
    return wie.trim() ? { ...rest, toegewezen: wie.trim().slice(0, 200) } : rest;
  });

export const markeerGelezen = (kanaal: string, id: string) => wijzig(kanaal, id, (g) => (g.ongelezen ? { ...g, ongelezen: 0 } : g));

/** Alle gesprekken van een kanaal, nieuwste eerst; verlopen gesprekken worden meteen gewist. */
export async function gesprekken(kanaal: string): Promise<SiteGesprek[]> {
  if (!isKanaal(kanaal)) return [];
  const nu = new Date();
  const rijen = await kvListEntries<SiteGesprek>(sitechatPrefix(kanaal), 5000);
  await Promise.all(rijen.filter((r) => verlopen(r.value.laatst, nu)).map((r) => kvDelete(r.key)));
  return rijen
    .map((r) => r.value)
    .filter((g) => !verlopen(g.laatst, nu))
    .sort((a, b) => (a.laatst < b.laatst ? 1 : -1));
}

/**
 * Elke nacht (deploy/cron/entrypoint.sh): gesprekken waar BEWAAR_DAGEN dagen
 * niets in gebeurde wissen, van alle sites, ook als niemand de inbox opent.
 * Elk bericht schrijft de rij opnieuw, dus de wijzigdatum is het laatste bericht.
 */
export async function ruimVerlopenGesprekkenOp(nu = Date.now()): Promise<{ gewist: number }> {
  const gewist = await kvDeleteStale("sitechat:", new Date(nu - BEWAAR_DAGEN * 86_400_000));
  return { gewist };
}

/** Gesprekken van een ingelogde gast (inzage), met hun KV-sleutels (wissen). */
export async function gesprekkenVanAccount(kanaal: string, email: string): Promise<{ key: string; value: SiteGesprek }[]> {
  if (!isKanaal(kanaal)) return [];
  const e = email.trim().toLowerCase();
  return (await kvListEntries<SiteGesprek>(sitechatPrefix(kanaal), 5000)).filter((r) => r.value.account === e);
}
