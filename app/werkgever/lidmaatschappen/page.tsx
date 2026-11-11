import { requirePrincipal } from "@/lib/auth";
import { LidmaatschappenBeheer } from "@/components/lidmaatschappen/LidmaatschappenBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Lidmaatschappen: leden, abonnementen en strippenkaarten, en wie er wanneer kwam.
export default async function LidmaatschappenPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Lidmaatschappen</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Wie er lid is, van welke vorm, en wanneer iemand komt. Betalingen en incasso loop je nog buiten ZekerFlex.</p>
      <LidmaatschappenBeheer />
    </div>
  );
}
