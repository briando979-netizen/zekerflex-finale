import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { OFFERTE_ID, STATUS_NAAM, effectieveStatus, type Offerte } from "@/lib/offertes/model";
import { leesOfferte } from "@/lib/offertes/store";
import { eigenOrganisatie } from "@/lib/offertes/toegang";
import { OfferteWeergave } from "@/components/offertes/OfferteWeergave";
import { PrintKnop } from "@/components/offertes/PrintKnop";

export const dynamic = "force-dynamic";

// Werkgever → Offertes → Afdrukken: de offerte op een schone pagina. Bij het afdrukken blijft alleen de offerte over
// (het menu en de knoppen gaan weg). Alleen voor de beheerder van de organisatie.

const PRINT_CSS = `@media print { body * { visibility: hidden !important; } #offerte-print, #offerte-print * { visibility: visible !important; } #offerte-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; background: #fff !important; color: #000 !important; } }`;

export default async function OfferteAfdrukPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tekst: string | null = null;
  let offerte: Offerte | null = null;
  let bedrijfsnaam = "";
  try {
    const { tenantId } = await eigenOrganisatie();
    offerte = OFFERTE_ID.test(id) ? await leesOfferte(tenantId, id) : null;
    if (!offerte) tekst = "Deze offerte bestaat niet (meer).";
    else bedrijfsnaam = offerte.bedrijfsnaam || (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name || "";
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    tekst = err.message;
  }
  if (!offerte) {
    return (
      <div className="mx-auto max-w-3xl">
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {tekst}
        </p>
      </div>
    );
  }
  const status = effectieveStatus(offerte, new Date());
  return (
    <div className="mx-auto max-w-3xl">
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-neutralx-600">Status: {STATUS_NAAM[status]}</p>
        <PrintKnop />
      </div>
      <div id="offerte-print" className="rounded-xl border border-hair bg-white p-6">
        <OfferteWeergave o={{ bedrijfsnaam, nummer: offerte.nummer, titel: offerte.titel, inleiding: offerte.inleiding, klantNaam: offerte.klant.naam, klantAdres: offerte.klant.adres, regels: offerte.regels, kortingBp: offerte.kortingBp, geldigTot: offerte.geldigTot, voorwaarden: offerte.voorwaarden }} />
      </div>
    </div>
  );
}
