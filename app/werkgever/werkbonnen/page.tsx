import { requirePrincipal } from "@/lib/auth";
import { WerkbonnenBeheer } from "@/components/werkbonnen/WerkbonnenBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Werkbonnen: opdrachten voor bouw, installatie en schoonmaak met klant, adres, planning, uren en materialen.
// De pagina zelf laadt de bonnen via de API; een lid zonder beheerdersrol krijgt daar een nette melding (423).
export default async function WerkbonnenPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Werkbonnen</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Een werkbon per opdracht: de klant, het adres, de planning, de gewerkte uren en de gebruikte materialen. Rond hem af als het werk klaar is en druk hem af voor de klant.</p>
      <WerkbonnenBeheer />
    </div>
  );
}
