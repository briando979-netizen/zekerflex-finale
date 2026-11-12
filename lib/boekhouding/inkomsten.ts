// ---------------------------------------------------------------------------
// Boekhouding: inkomsten. Platformfacturen worden verkoopboekingen (bron FACTUUR, bronId = Invoice.id) en een
// betaling sluit de debiteur (bron FACTUUR_BETALING, bronId = Invoice.id). Alles loopt via boek(): idempotent.
// Deze functie wordt nergens vanzelf aangeroepen (geen cron, geen koppeling met de geldstroom in lib/billing):
// een mens of een latere taak start boekOpenFacturen. De betaalregistratie op de Invoice is status PAID + paidAt;
// alleen een Stripe-betaling (stripePaymentIntentId) wordt geboekt, een andere betaalweg niet.
// ---------------------------------------------------------------------------

import type { InvoiceType } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boek, keerOm } from "./boek";
import {
  FACTUURSOORTEN_VOOR_OMZET,
  REKENING_DEBITEUREN,
  REKENING_STRIPE_SALDO,
  REKENING_TE_BETALEN_BTW,
  BTW_CODE_0,
  BTW_CODE_21,
  BTW_CODE_9,
  OMZET_REKENING_PER_FACTUURSOORT,
  bouwBetalingBoeking,
  bouwFactuurBoeking,
  type BoekContext,
  type FactuurGegevens,
} from "./inkomsten-kern";

export interface OpenFacturenOpties {
  /** alleen facturen aangemaakt op of na dit moment */
  sinds?: Date | undefined;
  /** hooguit zoveel facturen per run (standaard 200, maximaal 1000) */
  limiet?: number | undefined;
  now?: Date | undefined;
}

export interface FactuurFout {
  invoiceId: string;
  nummer: string;
  fout: string;
}

export interface OpenFacturenResultaat {
  verwerkt: number;
  nieuweFacturen: number;
  nieuweBetalingen: number;
  nieuweTegenboekingen: number;
  /** al geboekt, niets nieuws geschreven */
  alGeboekt: number;
  overgeslagen: number;
  fouten: FactuurFout[];
}

const FACTUUR_SELECT = {
  id: true,
  number: true,
  type: true,
  status: true,
  currency: true,
  vatTreatment: true,
  vatRate: true,
  subtotalCents: true,
  vatCents: true,
  totalCents: true,
  issuedAt: true,
  createdAt: true,
  paidAt: true,
  stripePaymentIntentId: true,
} as const;

async function laadContext(administratieId: string): Promise<{ ctx: BoekContext; platformTenantId: string }> {
  const administratie = await prisma.boekAdministratie.findUnique({
    where: { id: administratieId },
    select: { id: true, valuta: true, actief: true, platformTenantId: true },
  });
  if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");
  if (!administratie.actief) throw AppError.validation("Deze administratie is niet actief: er wordt niet meer in geboekt.");
  if (!administratie.platformTenantId) {
    throw AppError.validation("Bij deze administratie is geen platform-tenant ingesteld: zonder die koppeling weet het systeem niet welke facturen hierbij horen.");
  }
  const nummers = [REKENING_DEBITEUREN, REKENING_TE_BETALEN_BTW, REKENING_STRIPE_SALDO, ...Object.values(OMZET_REKENING_PER_FACTUURSOORT)];
  const rekeningen = await prisma.boekRekening.findMany({
    where: { administratieId, nummer: { in: nummers } },
    select: { id: true, nummer: true },
  });
  const codes = await prisma.boekBtwCode.findMany({
    where: { administratieId, code: { in: [BTW_CODE_21, BTW_CODE_9, BTW_CODE_0] } },
    select: { id: true, code: true },
  });
  const perNummer = new Map(rekeningen.map((r) => [r.nummer, r.id] as const));
  const perCode = new Map(codes.map((c) => [c.code, c.id] as const));
  return {
    platformTenantId: administratie.platformTenantId,
    ctx: {
      administratieId,
      valuta: administratie.valuta,
      rekeningId: (nummer) => {
        const id = perNummer.get(nummer);
        if (!id) throw AppError.validation(`Rekening ${nummer} ontbreekt in deze administratie.`);
        return id;
      },
      btwCodeId: (code) => {
        const id = perCode.get(code);
        if (!id) throw AppError.validation(`Btw-code ${code} ontbreekt in deze administratie.`);
        return id;
      },
    },
  };
}

function boekdagVan(d: Date | null, terugval: Date): string {
  return amsterdamDayKey(d ?? terugval);
}

/**
 * Boekt de facturen van het platform die nog niet geboekt zijn, in volgorde van aanmaken. Idempotent: een tweede run
 * schrijft niets nieuws. Een fout bij een factuur wordt in `fouten` gemeld en de run gaat door met de volgende.
 * Een geannuleerde factuur die al geboekt was krijgt een tegenboeking (keerOm), tenzij er al een betaling op boekt is.
 */
export async function boekOpenFacturen(administratieId: string, opties: OpenFacturenOpties = {}): Promise<OpenFacturenResultaat> {
  const limiet = Math.min(Math.max(Math.trunc(opties.limiet ?? 200), 1), 1000);
  const { ctx, platformTenantId } = await laadContext(administratieId);

  const facturen: FactuurGegevens[] = await prisma.invoice.findMany({
    where: {
      issuerTenantId: platformTenantId,
      type: { in: FACTUURSOORTEN_VOOR_OMZET as InvoiceType[] },
      status: { in: ["ISSUED", "PAID", "CANCELLED"] },
      ...(opties.sinds ? { createdAt: { gte: opties.sinds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limiet,
    select: FACTUUR_SELECT,
  });

  const uitkomst: OpenFacturenResultaat = {
    verwerkt: 0,
    nieuweFacturen: 0,
    nieuweBetalingen: 0,
    nieuweTegenboekingen: 0,
    alGeboekt: 0,
    overgeslagen: 0,
    fouten: [],
  };

  for (const f of facturen) {
    uitkomst.verwerkt += 1;
    try {
      if (f.status === "CANCELLED") {
        const sleutel = (bron: "FACTUUR" | "FACTUUR_BETALING") => ({ administratieId_bron_bronId: { administratieId, bron, bronId: f.id } });
        const boeking = await prisma.boekBoeking.findUnique({ where: sleutel("FACTUUR"), select: { id: true } });
        const betaling = await prisma.boekBoeking.findUnique({ where: sleutel("FACTUUR_BETALING"), select: { id: true } });
        if (!boeking || betaling) {
          uitkomst.overgeslagen += 1; // nooit geboekt, of al betaald geboekt: een mens beslist
          if (betaling) uitkomst.fouten.push({ invoiceId: f.id, nummer: f.number, fout: "Geannuleerde factuur met een geboekte betaling: een accountant beslist hoe dit wordt teruggedraaid." });
          continue;
        }
        const terug = await keerOm(boeking.id, "Factuur geannuleerd na het boeken", { ...(opties.now ? { now: opties.now } : {}) });
        if (terug.nieuw) uitkomst.nieuweTegenboekingen += 1;
        else uitkomst.alGeboekt += 1;
        continue;
      }

      const verkoop = bouwFactuurBoeking(f, ctx, boekdagVan(f.issuedAt, f.createdAt));
      if (!verkoop) {
        uitkomst.overgeslagen += 1;
        continue;
      }
      const r = await boek(verkoop);
      if (r.nieuw) uitkomst.nieuweFacturen += 1;
      else uitkomst.alGeboekt += 1;

      if (f.status === "PAID") {
        const betaling = bouwBetalingBoeking(f, ctx, boekdagVan(f.paidAt, f.createdAt));
        if (betaling) {
          const b = await boek(betaling);
          if (b.nieuw) uitkomst.nieuweBetalingen += 1;
        }
      }
    } catch (e) {
      // Alleen het factuurnummer en de fouttekst: geen klantgegevens in de uitkomst of het log.
      uitkomst.fouten.push({ invoiceId: f.id, nummer: f.number, fout: e instanceof Error ? e.message : "Onbekende fout" });
    }
  }
  return uitkomst;
}
