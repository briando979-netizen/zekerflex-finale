import { requirePrincipal } from "@/lib/auth";
import { KamersBeheer } from "@/components/kamers/KamersBeheer";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";

// Werkgever → Kamers: kamers, boekingen op één kalender, beschikbaarheid en schoonmaakstatus voor hotel, B&B en vakantieverhuur.
export default async function KamersPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-bold text-ink">Kamers en verblijven</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Je kamers, de boekingen op één kalender, welke kamer vrij is en of hij schoon is.</p>
      <KamersBeheer vandaag={amsterdamDayKey(new Date())} />
    </div>
  );
}
