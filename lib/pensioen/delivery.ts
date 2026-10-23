import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { alertOwner } from "@/lib/ops/alert";
import { getPensioenAangifte, savePensioenAangifte, type PensioenAangifte } from "@/lib/pensioen/aangifte";

// ---------------------------------------------------------------------------
// Levering van de StiPP-aangifte aan de pensioenuitvoerder.
//
// De echte UPA gaat via SBR/Digipoort of het leverkanaal van de uitvoerder
// (vaak APG namens StiPP), met een aansluiting en certificaten — dat regelt de
// eigenaar eenmalig. Deze adapter is het koppelpunt: staat er een
// STIPP_UPA_ENDPOINT + token ingesteld, dan POST't hij de aangifte-dataset
// daarheen (bijv. naar je eigen relay/koppelpartij); zo niet, dan blijft de
// aangifte "concept" en download/lever je hem handmatig via de export. Zo kan
// de maandelijkse levering volledig geautomatiseerd lopen zodra het kanaal er is.
// ---------------------------------------------------------------------------

export interface DeliveryResult {
  ok: boolean;
  detail: string;
}

/** Can the aangifte be transmitted automatically right now? */
export function deliveryConfigured(): boolean {
  return Boolean(env.STIPP_UPA_ENDPOINT && env.STIPP_UPA_TOKEN);
}

/** Only complete lines may be filed; incomplete ones (missing BSN/etc.) are reported, not sent. */
function readyForDelivery(a: PensioenAangifte): { ok: boolean; reason?: string } {
  if (a.lines.length === 0) return { ok: false, reason: "geen uitzendkrachten met pensioenopbouw in dit tijdvak" };
  if (!a.aansluitnummer) return { ok: false, reason: "STIPP_AANSLUITNUMMER ontbreekt" };
  if (a.totals.incompleet > 0) return { ok: false, reason: `${a.totals.incompleet} werknemer(s) met ontbrekende gegevens (o.a. BSN) — vul die eerst aan` };
  return { ok: true };
}

export async function deliverPensioenAangifte(period: string): Promise<DeliveryResult> {
  const a = await getPensioenAangifte(period);
  if (!a) return { ok: false, detail: "Aangifte niet gevonden — genereer hem eerst." };

  const ready = readyForDelivery(a);
  if (!ready.ok) {
    await persist(a, "mislukt", `Niet geleverd: ${ready.reason}`);
    return { ok: false, detail: ready.reason ?? "niet leverbaar" };
  }

  if (!deliveryConfigured()) {
    // channel not wired yet — the owner delivers via the export; make that explicit
    await persist(a, "concept", "Klaar voor levering. Geen automatisch kanaal (STIPP_UPA_ENDPOINT) ingesteld — download de export of koppel het leverkanaal.");
    return { ok: false, detail: "Geen leverkanaal ingesteld; aangifte staat klaar als export." };
  }

  try {
    const res = await fetch(env.STIPP_UPA_ENDPOINT!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.STIPP_UPA_TOKEN}` },
      body: JSON.stringify({
        uitvoerder: "StiPP",
        aansluitnummer: a.aansluitnummer,
        tijdvak: a.period,
        regels: a.lines.map((l) => ({
          bsnLaatste4: l.bsnLaatste4,
          geboortedatum: l.geboortedatum,
          regeling: l.regeling,
          uren: l.uren,
          pensioengevendLoonCents: l.pensioengevendLoonCents,
          werknemerPremieCents: l.werknemerPremieCents,
          werkgeverPremieCents: l.werkgeverPremieCents,
        })),
        totalen: a.totals,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`leverkanaal antwoordde HTTP ${res.status}`);
    await persist(a, "geleverd", `Geleverd aan ${new URL(env.STIPP_UPA_ENDPOINT!).host} (HTTP ${res.status}).`);
    return { ok: true, detail: "Aangifte geleverd." };
  } catch (err) {
    const detail = (err as Error).message;
    await persist(a, "mislukt", `Levering mislukt: ${detail}`);
    await alertOwner({
      key: `pensioen-aangifte:${period}`,
      title: `StiPP-aangifte ${a.label} mislukt`,
      detail: `De pensioenaangifte over ${a.label} kon niet geleverd worden: ${detail}.`,
      severity: "critical",
      url: "/admin/pensioen",
    }).catch(() => undefined);
    logger.error("stipp aangifte delivery failed", { period, error: detail });
    return { ok: false, detail };
  }
}

async function persist(a: PensioenAangifte, status: PensioenAangifte["status"], detail: string): Promise<void> {
  await savePensioenAangifte({
    ...a,
    status,
    geleverdOp: status === "geleverd" ? new Date().toISOString() : a.geleverdOp,
    leveringDetail: detail,
  });
}
