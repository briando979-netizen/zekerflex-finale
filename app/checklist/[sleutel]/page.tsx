import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { herhalingTekst } from "@/lib/checklists/model";
import { sjabloonVanSleutel } from "@/lib/checklists/store";
import { ChecklistInvullen } from "@/components/checklists/ChecklistInvullen";

export const dynamic = "force-dynamic";

// /checklist/<sleutel>: de invulpagina voor personeel zonder account (schoonmaak, horeca, hotel). De sleutel in het adres
// is het bewijs; het bedrijf kan hem intrekken. Niet voor zoekmachines en niet in de cache van een tussenpartij.

type Props = { params: Promise<{ sleutel: string }> };

export const metadata: Metadata = { title: "Checklist invullen", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ChecklistPagina({ params }: Props) {
  const { sleutel } = await params;
  const open = await sjabloonVanSleutel(sleutel);
  if (!open) notFound();
  const s = open.sjabloon;
  return (
    <main className="flex min-h-screen items-start justify-center bg-paper-soft px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg">
        {open.bedrijfsnaam && <p className="text-sm font-semibold text-neutralx-600">{open.bedrijfsnaam}</p>}
        <h1 className="font-display text-2xl font-bold text-ink">{s.naam}</h1>
        <p className="mb-5 mt-1 text-sm text-neutralx-600">
          {[s.locatie, herhalingTekst(s.herhaling)].filter(Boolean).join(" · ")}
        </p>
        <ChecklistInvullen
          eindpunt={`/api/checklist/${sleutel}`}
          taken={s.taken.map((t) => ({ id: t.id, tekst: t.tekst, opmerkingVerplicht: t.opmerkingVerplicht }))}
          botveld
          opslagSleutel={s.id}
        />
        <p className="mt-6 text-center text-xs text-neutralx-500">Checklist via ZekerFlex namens {open.bedrijfsnaam || "je werkgever"}. Je naam en antwoorden gaan alleen naar dit bedrijf.</p>
      </div>
    </main>
  );
}
