// ---------------------------------------------------------------------------
// Agentische betaalmotor — voorstel → goedkeuring → uitvoer. De AI (of een
// regel) STELT een betaling/aankoop VOOR; er gebeurt niets tot een mens 'm
// expliciet goedkeurt. De goedkeuringspoort is hier in code afgedwongen:
// executeIntent() GOOIT als de intent niet APPROVED is — geen enkele aanroep,
// ook niet van de AI, kan dat overslaan. Caps, kill-switch en een expliciete
// "mag extern"-schakelaar begrenzen wat een goedkeuring überhaupt mag worden.
// Dit is de brein-/besturingslaag; het echte geld verplaatsen gebeurt door een
// pluggable rail-adapter die de eigenaar bewust aansluit (en die pas draait op
// een APPROVED intent).
// ---------------------------------------------------------------------------

export type IntentStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";

export interface PaymentIntent {
  id: string;
  amountCents: number;
  currency: "EUR";
  recipient: string; // IBAN, merchant of omschrijving
  external: boolean; // true = buiten ZekerFlex (externe partij/markt)
  reason: string; // waarom de AI dit voorstelt
  proposedBy: string; // "ai" of een userId
  status: IntentStatus;
  createdAt: string; // ISO
  approvedBy?: string;
  decidedAt?: string; // ISO
  note?: string;
}

export interface PaymentCaps {
  maxPerIntentCents: number; // hard plafond per betaling
  maxPerDayCents: number; // hard plafond per dag
  allowExternal: boolean; // moet AAN voor betalingen buiten ZekerFlex
  killSwitch: boolean; // true = noodknop: niets wordt goedgekeurd/uitgevoerd
}

export const DEFAULT_CAPS: PaymentCaps = {
  maxPerIntentCents: 25_000, // € 250
  maxPerDayCents: 100_000, // € 1.000
  allowExternal: false,
  killSwitch: false,
};

export interface ProposeInput {
  amountCents: number;
  recipient: string;
  external: boolean;
  reason: string;
  proposedBy: string;
  id?: string;
  now?: Date;
}

/** Een voorstel is altijd veilig (er verplaatst niets); het wordt PENDING. */
export function proposeIntent(input: ProposeInput): PaymentIntent {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Bedrag moet groter dan 0 zijn.");
  if (!input.recipient.trim()) throw new Error("Ontvanger is verplicht.");
  if (!input.reason.trim()) throw new Error("Reden is verplicht (waarom deze betaling?).");
  const now = input.now ?? new Date();
  return {
    id: input.id ?? `pi_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    amountCents: amount,
    currency: "EUR",
    recipient: input.recipient.trim(),
    external: input.external,
    reason: input.reason.trim(),
    proposedBy: input.proposedBy,
    status: "PENDING",
    createdAt: now.toISOString(),
  };
}

/** Mag deze intent goedgekeurd worden gegeven de caps + wat vandaag al uitging? */
export function approvalBlock(intent: PaymentIntent, caps: PaymentCaps, spentTodayCents: number): string | null {
  if (caps.killSwitch) return "Noodknop staat aan — er wordt niets goedgekeurd.";
  if (intent.status !== "PENDING") return `Intent is al ${intent.status.toLowerCase()}.`;
  if (intent.external && !caps.allowExternal) return "Betalingen buiten ZekerFlex staan uit (allowExternal).";
  if (intent.amountCents > caps.maxPerIntentCents) return `Boven het plafond per betaling (${caps.maxPerIntentCents / 100} EUR).`;
  if (spentTodayCents + intent.amountCents > caps.maxPerDayCents) return `Boven het dagplafond (${caps.maxPerDayCents / 100} EUR).`;
  return null;
}

/** Keurt een intent goed — alleen als de caps het toestaan. Mutatie is puur. */
export function approveIntent(
  intent: PaymentIntent,
  approver: string,
  caps: PaymentCaps,
  spentTodayCents: number,
  now = new Date(),
): PaymentIntent {
  const block = approvalBlock(intent, caps, spentTodayCents);
  if (block) throw new Error(block);
  return { ...intent, status: "APPROVED", approvedBy: approver, decidedAt: now.toISOString() };
}

export function rejectIntent(intent: PaymentIntent, by: string, note?: string, now = new Date()): PaymentIntent {
  if (intent.status !== "PENDING") throw new Error(`Intent is al ${intent.status.toLowerCase()}.`);
  return { ...intent, status: "REJECTED", approvedBy: by, decidedAt: now.toISOString(), ...(note ? { note } : {}) };
}

/**
 * Markeert een intent als uitgevoerd. DE HARDE POORT: dit mag ALLEEN op een
 * APPROVED intent. Een rail-adapter die echt geld verplaatst roept dit pas aan
 * ná een geslaagde betaling. Faalt de rail, gebruik markFailed().
 */
export function executeIntent(intent: PaymentIntent, caps: PaymentCaps): PaymentIntent {
  if (caps.killSwitch) throw new Error("Noodknop staat aan — er wordt niets uitgevoerd.");
  if (intent.status !== "APPROVED") throw new Error("Niet uitvoerbaar: de betaling is niet goedgekeurd.");
  return { ...intent, status: "EXECUTED" };
}

export function markFailed(intent: PaymentIntent, note: string): PaymentIntent {
  return { ...intent, status: "FAILED", note };
}
