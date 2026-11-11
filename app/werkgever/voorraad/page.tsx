import { requirePrincipal } from "@/lib/auth";
import { VoorraadBeheer } from "@/components/voorraad/VoorraadBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Voorraad: wat ligt er, wat is bijna op, en een logboek van elke wijziging.
export default async function VoorraadPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Voorraad</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Wat er ligt, wat bijna op is en wat er is veranderd. Elke wijziging van een aantal komt met reden in het logboek van het artikel.</p>
      <VoorraadBeheer />
    </div>
  );
}
