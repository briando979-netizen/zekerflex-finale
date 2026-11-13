import Stripe from "stripe";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  STRIPE_WEBHOOK_EVENTS,
  isLiveSleutel,
  sleutelEindVan,
  stripeAccountSleutelFout,
  waaromNietGebruiken,
  type StripeAccountCheck,
  type StripeAccountInfo,
} from "@/lib/billing/stripe-account-vorm";

// ---------------------------------------------------------------------------
// Het Stripe-account van het platform, gekozen in Beheer → Stripe-account (13 nov 2026). De eigenaar plakt één keer
// de geheime sleutel; de server controleert hem bij Stripe en laat het account zien zonder te wisselen. Pas na "Gebruik
// dit account" staat hij verzegeld in de KV (zoals de sleutel voor ID-foto's, lib/kyc/stripe-fotos.ts), maakt de
// server zelf het webhook-endpoint op dat account aan en bewaart ook dat geheim verzegeld. getStripeClient gebruikt dan
// deze sleutel, anders die uit .env. Het vorige account blijft als terugval. De sleutel en het geheim komen nooit terug,
// nooit in een log of de audit: alleen de laatste 4 en het account-id.
// Gedeeld geheugen via globalThis: Next bundelt routes apart, en een wissel moet overal meteen gelden.
// ---------------------------------------------------------------------------

export const STRIPE_ACTIEF_KV = "stripe:actief-account";
/**
 * Bij welk platform-account hoort een Connect-account van een werker (alleen de id's: connect-id → account-id van het
 * platform, of "env" voor de sleutel uit .env). Hoort het bij een ander platform-account dan het actieve, dan koppelt de
 * werker opnieuw; gaat het platform terug, dan is het weer geldig. Niets wordt gewist.
 */
export const STRIPE_OUDE_CONNECT_KV = "stripe:oude-connect";
/** Het platform-account zonder keuze in Beheer: de sleutel uit .env. */
export const ENV_PLATFORM = "env";
const DOEL_SLEUTEL = "stripe-platform-sleutel";
const DOEL_WEBHOOK = "stripe-platform-webhook";
const HERLAAD_MS = 60_000;

interface Opgeslagen {
  sleutel: string; // verzegeld
  eind: string;
  accountId: string;
  naam: string | null;
  land: string | null;
  webhookId: string | null;
  webhookSecret: string | null; // verzegeld
  ingesteldOp: string;
  door: string;
  vorige: Omit<Opgeslagen, "vorige"> | null;
}

interface Geheugen {
  sleutel: string | null;
  webhook: string | null;
  geladenOp: number;
}

const g = globalThis as unknown as { __zfStripeActief?: Geheugen };

/** De verzegelde sleutel uit Beheer, als die geladen is; anders null (dan geldt .env). Synchroon voor getStripeClient. */
export function actieveStripeSleutelUitGeheugen(): string | null {
  return g.__zfStripeActief?.sleutel ?? null;
}

/** Is de keuze uit Beheer al geladen (bij het opstarten, instrumentation.ts)? Daarvoor mag getStripeClient niet stil .env nemen. */
export function stripeKeuzeGeladen(): boolean {
  return g.__zfStripeActief !== undefined;
}

/** Het webhook-geheim van het account uit Beheer, als dat er is. */
export function actiefWebhookGeheimUitGeheugen(): string | null {
  return g.__zfStripeActief?.webhook ?? null;
}

const openVeilig = (verzegeld: string | null, doel: string): string | null => {
  if (!verzegeld) return null;
  try {
    return openSecret(verzegeld, doel);
  } catch {
    // een gewisselde AUTH_SECRET zonder AUTH_SECRET_PREVIOUS: dan .env, en één waarschuwing
    logger.warn("stripe-account: verzegelde sleutel niet te openen, val terug op .env");
    return null;
  }
};

/**
 * Leest de keuze uit de KV in het geheugen (bij het opstarten, vóór een betaling en bij de webhook), hooguit eens per
 * minuut tenzij `dwing`. Een storing in de KV houdt vast wat er al geladen was.
 */
export async function laadActieveStripeSleutel(nu: number = Date.now(), dwing = false): Promise<void> {
  const m = g.__zfStripeActief;
  if (!dwing && m && nu - m.geladenOp < HERLAAD_MS) return;
  let o: Opgeslagen | null;
  try {
    o = await kvGet<Opgeslagen>(STRIPE_ACTIEF_KV);
  } catch {
    if (m) m.geladenOp = nu;
    else g.__zfStripeActief = { sleutel: null, webhook: null, geladenOp: nu };
    return;
  }
  g.__zfStripeActief = {
    sleutel: o ? openVeilig(o.sleutel, DOEL_SLEUTEL) : null,
    webhook: o ? openVeilig(o.webhookSecret, DOEL_WEBHOOK) : null,
    geladenOp: nu,
  };
}

const client = (sleutel: string) => new Stripe(sleutel, { timeout: 15_000, maxNetworkRetries: 1 });

/** Een rustige melding voor een Stripe-fout, zonder de tekst van Stripe zelf (die kan een deel van de sleutel noemen). */
function stripeFoutTekst(err: unknown): string {
  const type = (err as { type?: string } | null)?.type ?? "";
  if (type === "StripeAuthenticationError") return "Stripe kent deze sleutel niet. Kopieer de geheime sleutel opnieuw uit het juiste account.";
  if (type === "StripePermissionError") return "Deze beperkte sleutel mag het account niet lezen. Geef hem in Stripe leesrecht op Account, of gebruik de geheime sleutel.";
  if (type === "StripeConnectionError") return "Stripe is nu niet bereikbaar. Probeer het zo opnieuw.";
  return "Stripe gaf een fout bij het controleren van deze sleutel. Probeer het opnieuw.";
}

/** Controleert de sleutel bij Stripe en laat het account zien; er verandert niets. */
export async function controleerStripeSleutel(ruw: string): Promise<StripeAccountCheck> {
  const s = ruw.trim();
  const fout = stripeAccountSleutelFout(s);
  if (fout) throw AppError.validation(fout);
  const c = client(s);
  let a: Stripe.Account;
  try {
    a = await c.accounts.retrieveCurrent();
  } catch (err) {
    throw AppError.validation(stripeFoutTekst(err));
  }
  const identity = await c.identity.verificationSessions
    .list({ limit: 1 })
    .then(() => "werkt" as const)
    .catch((err: unknown) => ((err as { type?: string } | null)?.type === "StripePermissionError" || (err as { type?: string } | null)?.type === "StripeInvalidRequestError" ? ("niet toegestaan" as const) : ("onbekend" as const)));
  return {
    accountId: a.id,
    naam: a.business_profile?.name ?? a.settings?.dashboard?.display_name ?? null,
    juridischeNaam: a.company?.name ?? null,
    land: a.country ?? null,
    betalen: Boolean(a.charges_enabled),
    uitbetalen: Boolean(a.payouts_enabled),
    identity,
    live: isLiveSleutel(s),
    eind: sleutelEindVan(s),
  };
}

const info = (o: Opgeslagen): StripeAccountInfo => ({
  accountId: o.accountId,
  naam: o.naam,
  land: o.land,
  eind: o.eind,
  ingesteldOp: o.ingesteldOp,
  door: o.door,
  webhook: Boolean(o.webhookId && o.webhookSecret),
  heeftVorige: Boolean(o.vorige),
});

/** Het account dat nu uit Beheer komt, of null als .env geldt. */
export async function stripeAccountInfo(): Promise<StripeAccountInfo | null> {
  const o = await kvGet<Opgeslagen>(STRIPE_ACTIEF_KV).catch(() => null);
  return o ? info(o) : null;
}

/**
 * "Gebruik dit account": opnieuw gecontroleerd, alleen live en met betalingen aan. Maakt het webhook-endpoint op dit
 * account aan (dezelfde gebeurtenissen als nu) en bewaart sleutel en geheim verzegeld; het vorige blijft als terugval.
 * Hetzelfde account opnieuw: alleen de sleutel wordt vervangen, de webhook blijft.
 */
export async function gebruikStripeAccount(ruw: string, door: string, webhookUrl: string): Promise<StripeAccountInfo> {
  const s = ruw.trim();
  const check = await controleerStripeSleutel(s);
  const nee = waaromNietGebruiken(check);
  if (nee) throw AppError.validation(nee);
  const huidig = await kvGet<Opgeslagen>(STRIPE_ACTIEF_KV).catch(() => null);
  let webhookId = huidig?.accountId === check.accountId ? huidig.webhookId : null;
  let webhookSecret = huidig?.accountId === check.accountId ? huidig.webhookSecret : null;
  if (!webhookId || !webhookSecret) {
    let w: Stripe.WebhookEndpoint;
    try {
      w = await client(s).webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
        description: "ZekerFlex: automatisch aangemaakt in Beheer → Stripe-account",
      });
    } catch (err) {
      throw AppError.validation(`De webhook kon niet worden aangemaakt. ${stripeFoutTekst(err)}`);
    }
    if (!w.secret) throw AppError.validation("Stripe gaf geen webhook-geheim terug. Probeer het opnieuw.");
    webhookId = w.id;
    webhookSecret = sealSecret(w.secret, DOEL_WEBHOOK);
  }
  const vorige = huidig ? (({ vorige: _weg, ...rest }) => rest)(huidig) : null;
  const opslag: Opgeslagen = {
    sleutel: sealSecret(s, DOEL_SLEUTEL),
    eind: check.eind,
    accountId: check.accountId,
    naam: check.naam ?? check.juridischeNaam,
    land: check.land,
    webhookId,
    webhookSecret,
    ingesteldOp: new Date().toISOString(),
    door,
    // hetzelfde account opnieuw: de terugval blijft wat hij was
    vorige: huidig?.accountId === check.accountId ? huidig.vorige : vorige,
  };
  await kvSet(STRIPE_ACTIEF_KV, opslag);
  await laadActieveStripeSleutel(Date.now(), true);
  return info(opslag);
}

/** "Terug naar het vorige account": het vorige uit Beheer, of (was er geen) weer de sleutel uit .env. */
export async function terugNaarVorigStripeAccount(): Promise<StripeAccountInfo | null> {
  const huidig = await kvGet<Opgeslagen>(STRIPE_ACTIEF_KV).catch(() => null);
  if (!huidig) return null;
  if (huidig.vorige) await kvSet(STRIPE_ACTIEF_KV, { ...huidig.vorige, vorige: null } satisfies Opgeslagen);
  else await kvDelete(STRIPE_ACTIEF_KV);
  await laadActieveStripeSleutel(Date.now(), true);
  return huidig.vorige ? info({ ...huidig.vorige, vorige: null }) : null;
}

interface ConnectHerkomst {
  per: Record<string, string>;
  op: string;
}

/** Het platform-account dat nu actief is: het account-id uit Beheer, of "env". */
export async function actiefPlatform(): Promise<string> {
  const o = await kvGet<Opgeslagen>(STRIPE_ACTIEF_KV).catch(() => null);
  return o?.accountId ?? ENV_PLATFORM;
}

/**
 * Vóór een wissel (en vóór "terug"): de Connect-accounts die nu bestaan, horen bij het platform-account dat we verlaten.
 * Een id dat al een herkomst heeft, houdt die (een werker die later opnieuw koppelde, krijgt een nieuw id).
 */
export async function markeerOudeConnectAccounts(ids: readonly string[], platform: string, nu: Date = new Date()): Promise<number> {
  const oud = (await kvGet<ConnectHerkomst>(STRIPE_OUDE_CONNECT_KV).catch(() => null))?.per ?? {};
  const per: Record<string, string> = { ...oud };
  for (const id of ids) if (typeof id === "string" && id.startsWith("acct_") && !Object.hasOwn(per, id)) per[id] = platform;
  await kvSet(STRIPE_OUDE_CONNECT_KV, { per, op: nu.toISOString() } satisfies ConnectHerkomst);
  return Object.keys(per).length;
}

/** Hoort dit Connect-account bij een ander platform-account dan het actieve? Dan moet de werker opnieuw koppelen. */
export async function isOudConnectAccount(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const herkomst = (await kvGet<ConnectHerkomst>(STRIPE_OUDE_CONNECT_KV).catch(() => null))?.per;
  if (!herkomst || !Object.hasOwn(herkomst, id)) return false;
  return herkomst[id] !== (await actiefPlatform());
}
