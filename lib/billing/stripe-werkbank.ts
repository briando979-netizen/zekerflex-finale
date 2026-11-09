import type Stripe from "stripe";
import { env } from "@/lib/env";
import { getStripeClient } from "@/lib/billing/stripe";
import type { EventKern } from "@/lib/billing/stripe-events-tekst";

// ---------------------------------------------------------------------------
// Gegevens voor het Stripe-werkbank in admin: de events van de laatste dagen
// (Stripe bewaart er 30), de webhook-bestemmingen en de sleutel in gebruik.
// Stripe geeft de API-logboeken en de reactietijden van webhooks niet via de
// API; wat hier staat komt dus uit de events zelf (elk event noemt het verzoek
// dat het veroorzaakte) en niet uit een logboek dat we niet kunnen lezen.
// ---------------------------------------------------------------------------

export interface WerkbankEvent {
  kern: EventKern;
  /** Het object waar het event over gaat, zoals Stripe het stuurt. Alleen voor de detailweergave. */
  data: unknown;
  livemode: boolean;
}

export interface WebhookBestemming {
  id: string;
  url: string;
  status: string;
  /** Aantal soorten events waarop geluisterd wordt; "*" betekent alles. */
  luistertNaar: string;
  apiVersion: string | null;
  aangemaakt: string;
}

export interface Werkbank {
  livemode: boolean;
  events: WerkbankEvent[];
  webhooks: WebhookBestemming[];
  sleutelEinde: string | null;
  fouten: string[];
  opgehaald: string;
}

const iso = (s: number) => new Date(s * 1000).toISOString();

function klantIdUit(object: Record<string, unknown> | null): string | null {
  if (!object) return null;
  const c = object.customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") return (c as { id: string }).id;
  return null;
}

/** Maakt van een Stripe-event de vaste kern die de schermen en de tests gebruiken. */
export function eventKern(e: Stripe.Event): EventKern {
  const object = e.data.object as unknown as Record<string, unknown> | null;
  return {
    id: e.id,
    type: e.type,
    created: e.created,
    objectId: object && typeof object.id === "string" ? object.id : null,
    objectType: object && typeof object.object === "string" ? object.object : null,
    customerId: klantIdUit(object),
    requestId: e.request?.id ?? null,
    idempotencyKey: e.request?.idempotency_key ?? null,
    apiVersion: e.api_version ?? null,
    pendingWebhooks: e.pending_webhooks,
  };
}

export async function haalEvents(dagen: number, max: number): Promise<WerkbankEvent[]> {
  const stripe = getStripeClient();
  const sinds = Math.floor(Date.now() / 1000) - dagen * 24 * 60 * 60;
  const lijst = await stripe.events.list({ created: { gte: sinds }, limit: 100 }).autoPagingToArray({ limit: max });
  return lijst.map((e) => ({ kern: eventKern(e), data: e.data.object, livemode: e.livemode }));
}

function foutTekst(onderdeel: string, reden: unknown): string {
  const msg = reden instanceof Error ? reden.message : String(reden);
  return /permission|restricted|does not have/i.test(msg)
    ? `${onderdeel}: de Stripe-sleutel heeft hier geen leesrechten voor.`
    : `${onderdeel}: ${msg}`;
}

export async function getWerkbank(): Promise<Werkbank> {
  const stripe = getStripeClient();
  const [events, hooks] = await Promise.allSettled([haalEvents(7, 1000), stripe.webhookEndpoints.list({ limit: 100 })]);
  const fouten: string[] = [];
  const uit: Werkbank = {
    livemode: /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? ""),
    events: [],
    webhooks: [],
    sleutelEinde: env.STRIPE_SECRET_KEY ? env.STRIPE_SECRET_KEY.slice(-4) : null,
    fouten,
    opgehaald: new Date().toISOString(),
  };
  if (events.status === "fulfilled") uit.events = events.value;
  else fouten.push(foutTekst("Evenementen", events.reason));
  if (hooks.status === "fulfilled") {
    uit.webhooks = hooks.value.data.map((h) => ({
      id: h.id,
      url: h.url,
      status: h.status,
      luistertNaar: h.enabled_events.includes("*") ? "alles" : `${h.enabled_events.length} soorten`,
      apiVersion: h.api_version ?? null,
      aangemaakt: iso(h.created),
    }));
  } else {
    fouten.push(foutTekst("Webhooks", hooks.reason));
  }
  return uit;
}
