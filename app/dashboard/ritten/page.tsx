import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { MileageLog } from "@/components/app/MileageLog";
import { currentYear, getMileageLog } from "@/lib/worker/mileage";

export const dynamic = "force-dynamic";

export default async function RittenPage(props: { searchParams: Promise<{ jaar?: string }> }) {
  const principal = await requirePrincipal();
  const searchParams = await props.searchParams;
  const thisYear = currentYear();
  const asked = Number(searchParams.jaar);
  const year = Number.isInteger(asked) && asked >= 2020 && asked <= thisYear ? asked : thisYear;
  const log = await getMileageLog(principal.userId, year);

  if (!log) {
    return (
      <>
        <Back />
        <PageHeader title="Kilometer-administratie" subtitle="Je ritten naar je diensten, automatisch bijgehouden." />
        <EmptyState icon="🚗" title="Nog geen profiel" body="Deze pagina verschijnt zodra je als professional bent geregistreerd." />
      </>
    );
  }

  return (
    <>
      <Back />
      <PageHeader
        title="Kilometer-administratie"
        subtitle="Elke dienst die je werkt, staat hier als rit van huis naar de opdrachtgever en terug. Jij hoeft niets bij te houden."
      />

      <nav aria-label="Kies een jaar" className="mb-5 flex flex-wrap gap-2">
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
          <Link
            key={y}
            href={`/dashboard/ritten?jaar=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${y === year ? "bg-brand-500 text-white" : "bg-neutralx-100 text-neutralx-600 hover:bg-neutralx-200"}`}
          >
            {y}
          </Link>
        ))}
      </nav>

      {!log.homeKnown && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-neutralx-700">
          We kennen je thuisadres nog niet, dus we kunnen de afstand niet schatten. Vul je{" "}
          <Link href="/dashboard/profiel" className="font-semibold text-brand-600 hover:underline">adresgegevens</Link>{" "}
          in, of typ per rit zelf de kilometers.
        </div>
      )}

      {log.trips.length === 0 ? (
        <div className="rounded-2xl border border-neutralx-200 bg-white">
          <EmptyState
            icon="🚗"
            title={`Nog geen ritten in ${year}`}
            body="Zodra je je uren voor een dienst indient, verschijnt de rit hier vanzelf."
          />
        </div>
      ) : (
        <MileageLog year={year} initialTrips={log.trips} ratePerKmCents={log.ratePerKmCents} isPayroll={log.isPayroll} />
      )}

      <div className="mt-6 rounded-xl bg-paper-soft p-4 text-xs leading-relaxed text-neutralx-600">
        {log.isPayroll ? (
          <>
            <span className="font-semibold text-ink">Als uitzendkracht </span>
            trek je reiskosten niet zelf af. Je uitzendbureau mag je reiskosten vergoeden, onbelast tot € 0,23 per km. Met dit
            overzicht kun je nagaan of de vergoeding op je loonstrook klopt.
          </>
        ) : (
          <>
            <span className="font-semibold text-ink">Rij je met je eigen auto naar je opdrachtgever? </span>
            Dan mag je als ondernemer € 0,23 per zakelijke kilometer aftrekken. Daarvoor heb je een rittenadministratie nodig:
            datum, van, naar, doel en kilometers. Precies wat de download voor je boekhouder bevat.
          </>
        )}
        <span className="mt-2 block text-neutralx-400">
          De afstand is een schatting over de weg, op basis van je postcode ({log.homePostalCode || "onbekend"}) en het adres
          van de vestiging. Controleer je ritten, want dit is geen belastingadvies. Alleen diensten via ZekerFlex staan hierin.
        </span>
      </div>
    </>
  );
}

function Back() {
  return (
    <div className="mb-6">
      <Link href="/dashboard/administratie" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← Terug
      </Link>
    </div>
  );
}
