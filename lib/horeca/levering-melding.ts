import type { HorecaBestelling, HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendUserPush } from "@/lib/notifications/push";
import { nieuweLeveringZaak, verstuur } from "@/lib/horeca/mail";
import { teBetalenCent, tijdTekst } from "@/lib/horeca/bezorgen";

// ---------------------------------------------------------------------------
// Een seintje aan de zaak bij een nieuwe online afhaal- of bezorgbestelling (15 nov 2026): een push naar de
// beheerders en managers van het bedrijf (telefoon of browser) en een mail naar het adres van de zaak. Zonder
// seintje blijft een bestelling die nog bevestigd moet worden makkelijk liggen. Pushes aan opdrachtgevers zijn
// Nederlands (AGENTS.md). Gaat iets mis, dan logt het zonder klantgegevens; de bestelling staat er al.
// ---------------------------------------------------------------------------

type Levering = Pick<HorecaBestelling, "nummer" | "soort" | "naam" | "telefoon" | "adres" | "postcode" | "plaats" | "gewenstOp" | "totaalCent" | "kortingCent" | "bezorgkostenCent" | "opmerking">;

/** De pushtekst: kort genoeg voor een vergrendelscherm. */
export function leveringPush(b: Levering): { title: string; body: string } {
  const soort = b.soort === "bezorgen" ? "bezorging" : "afhaalbestelling";
  const bedrag = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(teBetalenCent(b) / 100);
  const tijd = tijdTekst(b.gewenstOp);
  return { title: `Nieuwe online ${soort} ${b.nummer}`, body: `${tijd === "ZSM" ? "Zo snel mogelijk" : `Om ${tijd}`} · ${bedrag} · bevestig de tijd op het bord` };
}

export async function meldNieuweLevering(zaak: HorecaZaak, b: Levering): Promise<void> {
  try {
    const leden = await prisma.membership.findMany({ where: { tenantId: zaak.tenantId, role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] }, user: { disabledAt: null } }, select: { userId: true } });
    const p = leveringPush(b);
    await sendUserPush(
      leden.map((l) => l.userId),
      { ...p, data: { type: "horeca-levering", url: "/werkgever/horeca?tab=bestellingen", tag: `horeca-levering-${zaak.id}-${b.nummer}` }, ttlSeconds: 2 * 3600 },
    );
  } catch (err) {
    logger.warn("horeca: push nieuwe levering mislukt", { error: err instanceof Error ? err.message : String(err) });
  }
  await verstuur(
    nieuweLeveringZaak(zaak, {
      nummer: b.nummer,
      soort: b.soort,
      naam: b.naam,
      telefoon: b.telefoon,
      adres: b.adres,
      postcode: b.postcode,
      plaats: b.plaats,
      tijd: tijdTekst(b.gewenstOp),
      bedragCent: teBetalenCent(b),
      opmerking: b.opmerking,
    }),
  );
}
