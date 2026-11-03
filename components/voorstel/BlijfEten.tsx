import Link from "next/link";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { ETEN_NA_ACTIVITEIT, etenAanvraagPad, type NaBoeking } from "@/lib/voorstel/eten-regels";

// Na een reservering: voorstel om te blijven eten, met hun eigen
// restaurantpagina's en een alvast ingevulde aanvraag (Beheer → Aanvragen).

export function BlijfEten({ boeking }: { boeking: NaBoeking }) {
  const kop = `blijf-eten-${boeking.id}`;
  return (
    <section aria-labelledby={kop} className="mt-6 rounded-xl3 bg-schw-sand p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Maak er een dagje uit van</p>
      <h3 id={kop} className="mt-2 font-display text-2xl font-bold">
        Blijf je eten?
      </h3>
      <p className="mt-2 max-w-2xl text-schw-night/80">Na de activiteit samen aan tafel in ons restaurant. Kies wat jullie lekker lijkt, dan maken wij er een voorstel van.</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {ETEN_NA_ACTIVITEIT.map((e) => (
          <li key={e.pad}>
            <Link href={`${BASE}${e.pad}`} className="inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15 hover:ring-schw-orange">
              {e.naam}
            </Link>
          </li>
        ))}
      </ul>
      <Link href={etenAanvraagPad(BASE, boeking)} className="mt-5 inline-block rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream">
        Vraag eten aan voor {boeking.personen} personen
      </Link>
    </section>
  );
}
