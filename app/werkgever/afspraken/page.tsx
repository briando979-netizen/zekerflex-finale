import { requirePrincipal } from "@/lib/auth";
import { AfsprakenBeheer } from "@/components/afspraken/AfsprakenBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Afspraken: de agenda van de week, zelf een afspraak maken, en de instellingen van je boekpagina
// (diensten, medewerkers, openingstijden). Klanten boeken zelf op /boeken/<jouw adres>.
export default async function AfsprakenPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">Afspraken</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Je agenda, en de pagina waar klanten zelf een afspraak maken. Een afspraak komt meteen in je agenda en bij de klant op de klantenkaart.</p>
      <AfsprakenBeheer />
    </div>
  );
}
