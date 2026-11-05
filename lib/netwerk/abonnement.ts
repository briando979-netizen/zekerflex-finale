import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { Principal } from "@/lib/auth";
import { isCompTenant } from "@/lib/billing/comp";
import { createNetwerkCheckoutSession, ensureStripeCustomer, getStripeClient } from "@/lib/billing/stripe";
import { createLead } from "@/lib/sales/leads";
import { MODULE_DEFS, isModule, isVpnVariant, maandbedragCent, type ModuleSleutel, type ModuleStand, type NetwerkStand, type VpnVariant } from "@/lib/netwerk/modules";
import { netwerkStand, standMetAbonnement, zetModuleStand } from "@/lib/netwerk/store";
import { vpnGekoppeld } from "@/lib/netwerk/headscale";
import { wifiServerKlaar } from "@/lib/netwerk/token";

// ---------------------------------------------------------------------------
// Een pakket aanzetten, betalen en opzeggen.
//   - 5G: altijd eerst een gesprek → "aangevraagd" + een lead in de verkooppijplijn.
//   - Wifi of VPN terwijl de server nog niet is ingericht: op de lijst
//     ("aangevraagd"), nog niets betalen.
//   - Kosteloos account (lib/billing/comp): meteen actief voor € 0.
//   - Anders: Stripe-abonnement (zelfde opzet als Website-beheer); de webhook
//     zet het pakket op actief zodra de eerste betaling binnen is.
// ---------------------------------------------------------------------------

/** Kan dit pakket nu echt geleverd worden (de server erachter draait)? */
export function moduleLeverbaar(sleutel: ModuleSleutel): boolean {
  if (sleutel === "wifi") return wifiServerKlaar();
  if (sleutel === "vpn") return vpnGekoppeld();
  return false; // 5g: altijd op aanvraag
}

export interface StartInput {
  sleutel: ModuleSleutel;
  aantal: number;
  variant?: VpnVariant;
  toelichting?: string;
}

export interface StartUitkomst {
  stand: NetwerkStand;
  /** naar Stripe om te betalen; anders is het pakket meteen aangevraagd of actief */
  checkoutUrl?: string;
  melding: string;
}

function schoon(input: StartInput): Required<Pick<StartInput, "sleutel" | "aantal">> & { variant?: VpnVariant; toelichting: string } {
  if (!isModule(input.sleutel)) throw AppError.validation("Onbekend pakket.");
  const aantal = Number.isFinite(input.aantal) ? Math.floor(input.aantal) : 1;
  if (aantal < 1 || aantal > 500) throw AppError.validation("Het aantal is 1 tot 500.");
  const toelichting = (input.toelichting ?? "").trim().slice(0, 2000);
  if (input.sleutel === "vpn") {
    if (!isVpnVariant(input.variant)) throw AppError.validation("Kies per gebruiker of onbeperkt.");
    return { sleutel: input.sleutel, aantal: input.variant === "onbeperkt" ? 1 : aantal, variant: input.variant, toelichting };
  }
  return { sleutel: input.sleutel, aantal, toelichting };
}

export async function startModule(tenantId: string, raw: StartInput, door: Principal): Promise<StartUitkomst> {
  const input = schoon(raw);
  const def = MODULE_DEFS[input.sleutel];
  const huidig = (await netwerkStand(tenantId)).modules[input.sleutel];
  if (huidig?.status === "actief") throw AppError.conflict(`${def.naam} staat al aan.`);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, stripeCustomerId: true } });
  if (!tenant) throw AppError.notFound("Bedrijf niet gevonden.");
  const nu = new Date().toISOString();
  const basis: ModuleStand = { status: "aangevraagd", sinds: nu, aantal: input.aantal, ...(input.variant ? { variant: input.variant } : {}), ...(input.toelichting ? { toelichting: input.toelichting } : {}) };

  // 5G: eerst een gesprek (vergunning, apparatuur, terrein)
  if (def.opAanvraag) {
    const stand = await zetModuleStand(tenantId, input.sleutel, basis);
    await createLead({
      companyName: tenant.name,
      contactName: door.fullName,
      contactEmail: door.email,
      source: "netwerk-5g",
      notes: `Aanvraag eigen 5G-netwerk via Werkgever → Wifi en VPN.${input.toelichting ? `\n\n${input.toelichting}` : ""}`,
      createdById: door.userId,
    }).catch((e: unknown) => logger.warn("lead voor 5g-aanvraag mislukt", { message: e instanceof Error ? e.message : String(e) }));
    await recordAudit({ category: "BILLING", action: "netwerk.5g.aangevraagd", actorUserId: door.userId, summary: `${tenant.name} vroeg een eigen 5G-netwerk aan`, targetType: "tenant", targetId: tenantId });
    return { stand, melding: "Aangevraagd. We nemen contact op om het terrein, de vergunning en de apparatuur door te nemen." };
  }

  // de server erachter draait nog niet: op de lijst, nog niets betalen
  if (!moduleLeverbaar(input.sleutel)) {
    const stand = await zetModuleStand(tenantId, input.sleutel, basis);
    await recordAudit({ category: "BILLING", action: "netwerk.op-de-lijst", actorUserId: door.userId, summary: `${tenant.name} wil ${def.naam} zodra het beschikbaar is`, targetType: "tenant", targetId: tenantId });
    return { stand, melding: `Je staat op de lijst. Zodra ${def.naam.toLowerCase()} klaarstaat, krijg je bericht en kun je het hier aanzetten.` };
  }

  // kosteloos account: meteen aan, € 0
  if (await isCompTenant(tenantId)) {
    const stand = await zetModuleStand(tenantId, input.sleutel, { ...basis, status: "actief", gratis: true });
    await recordAudit({ category: "BILLING", action: "netwerk.actief", actorUserId: door.userId, summary: `${def.naam} aan voor ${tenant.name} (kosteloos account)`, targetType: "tenant", targetId: tenantId });
    return { stand, melding: `${def.naam} staat aan. Gratis voor jouw account.` };
  }

  // betalen via Stripe
  const customerId = await ensureStripeCustomer({ existingCustomerId: tenant.stripeCustomerId, email: door.email, name: tenant.name, tenantId: tenant.id });
  if (customerId !== tenant.stripeCustomerId) await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customerId } });
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
  const perEenheid = input.variant === "onbeperkt" ? (def.onbeperktCent ?? def.prijsCent) : def.prijsCent;
  const session = await createNetwerkCheckoutSession({
    stripeCustomerId: customerId,
    tenantId: tenant.id,
    module: input.sleutel,
    naam: `ZekerFlex ${def.naam}${input.variant === "onbeperkt" ? " (hele bedrijf)" : ` (per ${def.eenheidLabel.een})`}`,
    aantal: input.aantal,
    ...(input.variant ? { variant: input.variant } : {}),
    unitAmountCents: perEenheid,
    successUrl: `${baseUrl}/werkgever/netwerk?pakket=${input.sleutel}&betaald=1`,
    cancelUrl: `${baseUrl}/werkgever/netwerk?pakket=${input.sleutel}&geannuleerd=1`,
  });
  if (!session.url) throw AppError.upstream("Kon geen betaalscherm starten. Probeer het zo opnieuw.");
  const stand = await zetModuleStand(tenantId, input.sleutel, { ...basis, status: "wacht-op-betaling", stripeSessionId: session.id });
  return { stand, checkoutUrl: session.url, melding: "Je gaat naar het betaalscherm." };
}

/** Webhook: de eerste betaling is binnen → actief, met het abonnement erbij. */
export async function activeerNetwerkModule(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.netwerkTenantId;
  const sleutel = session.metadata?.netwerkModule;
  if (!tenantId || !isModule(sleutel)) return;
  const huidig = (await netwerkStand(tenantId)).modules[sleutel];
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  // Stripe stuurt soms dubbel: al actief met dit abonnement → niets doen
  if (huidig?.status === "actief" && huidig.stripeSubId === subId) return;
  const aantal = Number(session.metadata?.netwerkAantal ?? huidig?.aantal ?? 1);
  const variant = session.metadata?.netwerkVariant;
  await zetModuleStand(tenantId, sleutel, {
    status: "actief",
    sinds: new Date().toISOString(),
    aantal: Number.isFinite(aantal) && aantal >= 1 ? aantal : 1,
    ...(isVpnVariant(variant) ? { variant } : {}),
    ...(subId ? { stripeSubId: subId } : {}),
    ...(huidig?.toelichting ? { toelichting: huidig.toelichting } : {}),
  });
  await recordAudit({ category: "BILLING", action: "netwerk.actief", summary: `${MODULE_DEFS[sleutel].naam} betaald en actief`, targetType: "tenant", targetId: tenantId });
}

/** Webhook: het abonnement is bij Stripe beëindigd → opgezegd. */
export async function netwerkAbonnementBeeindigd(stripeSubId: string): Promise<void> {
  const r = await standMetAbonnement(stripeSubId);
  if (!r || r.stand.status === "opgezegd") return;
  await zetModuleStand(r.tenantId, r.sleutel, { ...r.stand, status: "opgezegd", sinds: new Date().toISOString() });
  await recordAudit({ category: "BILLING", action: "netwerk.opgezegd", summary: `${MODULE_DEFS[r.sleutel].naam} beëindigd (Stripe)`, targetType: "tenant", targetId: r.tenantId });
}

/**
 * Opzeggen door het bedrijf. Met een Stripe-abonnement loopt het pakket door
 * tot het einde van de betaalde periode (Stripe meldt dan het einde); een
 * kosteloos of aangevraagd pakket stopt meteen.
 */
export async function zegModuleOp(tenantId: string, sleutel: ModuleSleutel, door: Principal): Promise<{ stand: NetwerkStand; melding: string }> {
  if (!isModule(sleutel)) throw AppError.validation("Onbekend pakket.");
  const huidig = (await netwerkStand(tenantId)).modules[sleutel];
  if (!huidig || huidig.status === "opgezegd") throw AppError.conflict("Dit pakket staat niet aan.");
  const def = MODULE_DEFS[sleutel];
  if (huidig.status === "actief" && huidig.stripeSubId && !huidig.gratis) {
    const sub = await getStripeClient().subscriptions.update(huidig.stripeSubId, { cancel_at_period_end: true });
    // het einde van de betaalde periode staat (nieuwe Stripe-API) op de abonnementsregel
    const eind = sub.items.data[0]?.current_period_end;
    const eindigtOp = eind ? new Date(eind * 1000).toISOString() : new Date(Date.now() + 30 * 86_400_000).toISOString();
    const stand = await zetModuleStand(tenantId, sleutel, { ...huidig, eindigtOp });
    await recordAudit({ category: "BILLING", action: "netwerk.opzegging", actorUserId: door.userId, summary: `${def.naam} opgezegd per ${eindigtOp.slice(0, 10)}`, targetType: "tenant", targetId: tenantId });
    return { stand, melding: `Opgezegd. ${def.naam} werkt nog tot het einde van de betaalde periode.` };
  }
  const stand = await zetModuleStand(tenantId, sleutel, { ...huidig, status: "opgezegd", sinds: new Date().toISOString() });
  await recordAudit({ category: "BILLING", action: "netwerk.opgezegd", actorUserId: door.userId, summary: `${def.naam} gestopt`, targetType: "tenant", targetId: tenantId });
  return { stand, melding: `${def.naam} staat uit.` };
}

/** Het maandbedrag dat een bedrijf voor dit pakket betaalt (voor het beheer). */
export function bedragVan(sleutel: ModuleSleutel, m: ModuleStand): number {
  return m.gratis || m.status !== "actief" ? 0 : maandbedragCent(sleutel, m.aantal, m.variant);
}
