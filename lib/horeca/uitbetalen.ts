import type { HorecaZaak } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { getStripeClient } from "@/lib/billing/stripe";
import { euroTekst, euroUit, isAutomatisch, opneemBedrag, statusTekst } from "@/lib/horeca/uitbetalen-kern";

// ---------------------------------------------------------------------------
// Uitbetalen voor een horecazaak (Afrekenen → "Jullie geld"). Alles loopt via
// het eigen Stripe-account van de zaak (Connect Express, lib/horeca/betalen.ts):
// Stripe bewaart het geld, ZekerFlex leest alleen het saldo, zet het
// uitbetaalschema op automatisch of met de hand, en start op verzoek van de zaak
// een uitbetaling. Die gaat altijd naar de bankrekening die bij Stripe staat;
// ZekerFlex kan het geld nergens anders heen sturen.
// ---------------------------------------------------------------------------

export interface Uitbetaling {
  id: string;
  bedragCent: number;
  status: string;
  statusTekst: string;
  aankomst: string | null;
  handmatig: boolean;
}

export interface UitbetaalStand {
  automatisch: boolean;
  beschikbaarCent: number;
  onderwegCent: number;
  uitbetalingen: Uitbetaling[];
}

function eisAccount(z: Pick<HorecaZaak, "stripeAccountId">): string {
  if (!z.stripeAccountId) throw AppError.precondition("Koppel eerst jullie Stripe-account.");
  return z.stripeAccountId;
}

/** Saldo, schema en de laatste uitbetalingen; null als er (nog) geen account is of Stripe even niet antwoordt. */
export async function uitbetaalStand(z: Pick<HorecaZaak, "id" | "stripeAccountId">): Promise<UitbetaalStand | null> {
  if (!z.stripeAccountId) return null;
  const stripe = getStripeClient();
  const opties = { stripeAccount: z.stripeAccountId };
  try {
    const [account, saldo, lijst] = await Promise.all([
      stripe.accounts.retrieve(z.stripeAccountId),
      stripe.balance.retrieve({}, opties),
      stripe.payouts.list({ limit: 5 }, opties),
    ]);
    return {
      automatisch: isAutomatisch(account.settings?.payouts?.schedule?.interval),
      beschikbaarCent: euroUit(saldo.available),
      onderwegCent: euroUit(saldo.pending),
      uitbetalingen: lijst.data.map((p) => ({
        id: p.id,
        bedragCent: p.amount,
        status: p.status,
        statusTekst: statusTekst(p.status),
        aankomst: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
        handmatig: !p.automatic,
      })),
    };
  } catch (err) {
    logger.warn("horeca: uitbetaalstand niet gelezen", { zaakId: z.id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Automatisch uitbetalen (elke werkdag) aan of uit. Uit = het geld blijft klaarstaan tot de zaak opneemt. */
export async function zetAutomatischUitbetalen(z: Pick<HorecaZaak, "id" | "tenantId" | "stripeAccountId">, aan: boolean, door: { userId: string }): Promise<UitbetaalStand | null> {
  const id = eisAccount(z);
  try {
    await getStripeClient().accounts.update(id, { settings: { payouts: { schedule: aan ? { interval: "daily" } : { interval: "manual" } } } });
  } catch (err) {
    logger.warn("horeca: uitbetaalschema niet gezet", { zaakId: z.id, error: err instanceof Error ? err.message : String(err) });
    throw AppError.upstream("Stripe nam de instelling niet aan. Probeer het zo opnieuw, of zet het in het Stripe-overzicht.");
  }
  await recordAudit({
    category: "BILLING",
    action: "horeca.uitbetalen.schema",
    actorUserId: door.userId,
    actorLabel: "user",
    summary: aan ? "Automatisch uitbetalen aangezet" : "Automatisch uitbetalen uitgezet: geld blijft klaarstaan tot de zaak opneemt",
    targetType: "horeca-zaak",
    targetId: z.id,
    metadata: { tenantId: z.tenantId, automatisch: aan },
  }).catch(() => undefined);
  return uitbetaalStand(z);
}

/** Neem (een deel van) het klaarstaande geld op naar de eigen bankrekening. Alleen als automatisch uit staat. */
export async function neemOp(z: Pick<HorecaZaak, "id" | "tenantId" | "stripeAccountId">, gevraagdCent: number | null, door: { userId: string }, nu = Date.now()): Promise<{ bedragCent: number; aankomst: string | null; stand: UitbetaalStand | null }> {
  const id = eisAccount(z);
  const stand = await uitbetaalStand(z);
  if (!stand) throw AppError.upstream("Het saldo bij Stripe is nu niet te lezen. Probeer het zo opnieuw.");
  if (stand.automatisch) throw AppError.precondition("Automatisch uitbetalen staat aan: Stripe zet het geld al elke werkdag op jullie rekening. Zet het uit om zelf op te nemen.");
  const k = opneemBedrag(gevraagdCent, stand.beschikbaarCent);
  if (!k.ok) throw AppError.validation(k.fout);
  let p;
  try {
    // dubbel klikken binnen dezelfde minuut met hetzelfde bedrag = één opname
    p = await getStripeClient().payouts.create(
      { amount: k.bedragCent, currency: "eur", description: "Opname via ZekerFlex", metadata: { horecaZaakId: z.id } },
      { stripeAccount: id, idempotencyKey: `horeca-opname:${z.id}:${k.bedragCent}:${Math.floor(nu / 60_000)}` },
    );
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    logger.warn("horeca: opname mislukt", { zaakId: z.id, bedragCent: k.bedragCent, error: m });
    throw AppError.upstream(/insufficient/i.test(m) ? "Er staat minder klaar dan gedacht. Ververs de pagina en probeer het opnieuw." : "Stripe nam de opname niet aan. Probeer het zo opnieuw, of kijk in het Stripe-overzicht.");
  }
  await recordAudit({
    category: "BILLING",
    action: "horeca.uitbetalen.opname",
    actorUserId: door.userId,
    actorLabel: "user",
    summary: `Opname van ${euroTekst(k.bedragCent)} naar de eigen bankrekening gestart`,
    targetType: "horeca-zaak",
    targetId: z.id,
    metadata: { tenantId: z.tenantId, payoutId: p.id, bedragCent: k.bedragCent },
  }).catch(() => undefined);
  return { bedragCent: k.bedragCent, aankomst: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null, stand: await uitbetaalStand(z) };
}
