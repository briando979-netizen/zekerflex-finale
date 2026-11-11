import { requirePrincipal } from "@/lib/auth";
import { KlantenOverzicht } from "@/components/afspraken/KlantenKaart";

export const dynamic = "force-dynamic";

// Werkgever → Klanten: de klantenkaart. Wie een afspraak maakt, komt hier te staan, met geschiedenis en een eigen notitie.
export default async function KlantenPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Klanten</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Alle klanten die een afspraak maakten. Het zijn gegevens van jouw klanten: bewaar niets wat je niet nodig hebt, en wis een klant als die dat vraagt.</p>
      <KlantenOverzicht />
    </div>
  );
}
