import Stripe from "stripe";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import type { FotoSoort } from "@/lib/admin/kyc-weergave";
import { sleutelEind, stripeBestandId, stripeFotoSleutelFout } from "@/lib/kyc/stripe-fotos-vorm";

// ---------------------------------------------------------------------------
// De foto's van een Stripe-controle (voorkant, achterkant, selfie) in Admin → Gebruikers.
// Stripe bewaart ze zelf en geeft ze niet aan de gewone geheime sleutel: daarvoor is een
// beperkte sleutel (rk_…) nodig met de rechten Identity Verification Results, Recent/All
// Detailed Verification Results (lezen) en Files (schrijven). Zonder IP-beperking leest zo'n
// sleutel alleen controles van de laatste 48 uur; met IP-beperking (de server) alles.
// De beheerder plakt hem één keer op de gebruikerspagina; hij staat verzegeld in de KV en is
// nooit leesbaar terug. Een foto gaat via een bestandslink van 30 seconden rechtstreeks van
// Stripe naar de beheerder; ZekerFlex bewaart geen kopie (Stripe raadt dat aan).
// ---------------------------------------------------------------------------

const KV = "stripe-identity:fotosleutel";
const DOEL = "stripe-identity-fotosleutel";
const MAX_BYTES = 15 * 1024 * 1024;

interface Opgeslagen {
  sleutel: string; // verzegeld
  eind: string;
  ingesteldOp: string;
  door: string;
}

export interface StripeFotoSleutelInfo {
  eind: string;
  ingesteldOp: string;
  door: string;
}

const liveAccount = (): boolean => (env.STRIPE_SECRET_KEY ?? "").replace(/^["']/, "").startsWith("sk_live_");
const client = (sleutel: string) => new Stripe(sleutel, { timeout: 10_000, maxNetworkRetries: 1 });

/** Wat de beheerder mag zien: de laatste vier tekens en wie hem zette, nooit de sleutel. */
export async function stripeFotoSleutelInfo(): Promise<StripeFotoSleutelInfo | null> {
  const o = await kvGet<Opgeslagen>(KV).catch(() => null);
  return o ? { eind: o.eind, ingesteldOp: o.ingesteldOp, door: o.door } : null;
}

async function sleutel(): Promise<string | null> {
  const o = await kvGet<Opgeslagen>(KV).catch(() => null);
  if (!o) return null;
  try {
    return openSecret(o.sleutel, DOEL);
  } catch {
    return null; // AUTH_SECRET gewisseld: de beheerder zet hem opnieuw
  }
}

/** Een Stripe-client met de verzegelde beperkte sleutel, of null als er geen (bruikbare) sleutel staat. Ook voor lib/kyc/stripe-kopie.ts. */
export async function stripeFotoClient(): Promise<Stripe | null> {
  const s = await sleutel();
  return s ? client(s) : null;
}

/** Een Stripe-fout in gewone taal (Stripe antwoordt in het Engels). */
export function stripeFout(err: unknown): string {
  const type = (err as { type?: string } | null)?.type;
  if (type === "StripeAuthenticationError") return "Stripe kent deze sleutel niet (meer). Maak een nieuwe en zet hem opnieuw.";
  if (type === "StripePermissionError") return "De sleutel mist een recht bij Stripe. Zet Identity Verification Results en Recent Detailed Verification Results op Lezen en Files op Schrijven.";
  if (type === "StripeInvalidRequestError") return "Stripe vond deze controle niet met deze sleutel (hoort de sleutel bij hetzelfde Stripe-account, en in de live-modus?).";
  return "Stripe is nu niet bereikbaar. Probeer het zo opnieuw.";
}

/** Controleert de sleutel bij Stripe en bewaart hem verzegeld; een sleutel die Stripe weigert, bewaren we niet. */
export async function bewaarStripeFotoSleutel(ruw: string, door: string): Promise<StripeFotoSleutelInfo> {
  const fout = stripeFotoSleutelFout(ruw, liveAccount());
  if (fout) throw AppError.validation(fout);
  const s = ruw.trim();
  try {
    await client(s).identity.verificationSessions.list({ limit: 1 });
  } catch (err) {
    throw AppError.validation(stripeFout(err));
  }
  const opslag: Opgeslagen = { sleutel: sealSecret(s, DOEL), eind: sleutelEind(s), ingesteldOp: new Date().toISOString(), door };
  await kvSet(KV, opslag);
  return { eind: opslag.eind, ingesteldOp: opslag.ingesteldOp, door };
}

export async function verwijderStripeFotoSleutel(): Promise<void> {
  await kvDelete(KV);
}

export type StripeFoto = { ok: true; bytes: Uint8Array; mimeType: string } | { ok: false; reden: string };

/** Eén foto van een Stripe-controle, rechtstreeks van Stripe (niets bewaard). */
export async function stripeIdFoto(sessieId: string, welk: FotoSoort): Promise<StripeFoto> {
  const s = await sleutel();
  if (!s) return { ok: false, reden: "Er staat nog geen Stripe-sleutel voor de foto's. Zet hem bij Identiteitscontroles op deze pagina." };
  const stripe = client(s);
  try {
    const sessie = await stripe.identity.verificationSessions.retrieve(sessieId, { expand: ["last_verification_report"] });
    const bestandId = stripeBestandId(sessie.last_verification_report, welk);
    if (!bestandId) {
      return {
        ok: false,
        reden:
          welk === "back"
            ? "Bij deze controle is geen achterkant (een paspoort heeft er geen), of Stripe gaf hem niet vrij."
            : "Stripe gaf deze foto niet vrij. Zonder IP-beperking leest de sleutel alleen controles van de laatste 48 uur.",
      };
    }
    return await haalStripeBestand(stripe, bestandId);
  } catch (err) {
    // nooit de link of de sleutel loggen (capability-URL), alleen het soort fout
    logger.warn("stripe identity foto niet op te halen", { type: (err as { type?: string } | null)?.type ?? "onbekend", welk });
    return { ok: false, reden: stripeFout(err) };
  }
}

/**
 * Eén bestand van Stripe binnenhalen: een bestandslink van 30 seconden (Stripe staat voor ID-foto's niets langers toe), en
 * alleen een afbeelding tot 15 MB. Gooit bij een Stripe-fout; de link zelf komt nooit in een log (capability-URL).
 */
export async function haalStripeBestand(stripe: Stripe, bestandId: string): Promise<StripeFoto> {
  const link = await stripe.fileLinks.create({ file: bestandId, expires_at: Math.floor(Date.now() / 1000) + 30 });
  if (!link.url) return { ok: false, reden: "Stripe gaf geen link naar de foto." };
  const res = await fetch(link.url, { signal: AbortSignal.timeout(10_000) });
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!res.ok || !mimeType.startsWith("image/")) return { ok: false, reden: "De foto kwam niet goed door van Stripe." };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reden: "De foto is te groot." };
  return { ok: true, bytes, mimeType };
}
