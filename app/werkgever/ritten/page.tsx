import { requirePrincipal } from "@/lib/auth";
import { RittenBeheer } from "@/components/ritten/RittenBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Ritten: ritten plannen, voertuigen en chauffeurs beheren en de uren en kilometers per rit bijhouden.
// De pagina zelf laadt alles via de API; een lid zonder beheerdersrol krijgt daar een nette melding (423).
export default async function RittenPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Ritten en voertuigen</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Plan ritten per dag of week, houd je voertuigen en chauffeurs bij en druk een vrachtbrief af. Uren en kilometers vul je zelf in: er is geen GPS en geen routeberekening.</p>
      <RittenBeheer />
    </div>
  );
}
