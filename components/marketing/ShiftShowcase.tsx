import { ShiftCard } from "@/components/app/ShiftCard";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { travelByMode, fastestMode } from "@/lib/geo/travel-modes";
import { Reveal } from "@/components/marketing/Reveal";

function sample(
  id: string,
  title: string,
  branch: string,
  city: string,
  skill: string | null,
  hourlyRateCents: number,
  hours: number,
  km: number,
  score: number,
  inDays: number,
  hour: number,
): MarketplaceShift {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + inDays);
  startsAt.setHours(hour, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);
  const meters = km * 1000;
  const byMode = travelByMode(meters);
  return {
    id,
    title,
    description: null,
    branch,
    city,
    branchLat: 52.37,
    branchLng: 4.9,
    startsAt,
    endsAt,
    breakMinutes: hours >= 6 ? 30 : 0,
    hourlyRateCents,
    positions: 3,
    taken: 1,
    skill,
    grossCents: Math.round(hours * hourlyRateCents),
    hours,
    daypart: hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
    weekday: startsAt.getDay(),
    workedHereBefore: id === "s2" ? 4 : 0,
    series: null,
    isReplacement: false,
    replacementNote: null,
    myOffer: null,
    travel: { distanceKm: km, fastest: fastestMode(byMode), byMode },
    match: {
      score: score / 100,
      travelMinutes: fastestMode(byMode).minutes,
      distanceKm: km,
      reasons: [`${fastestMode(byMode).minutes} min reistijd`, "vakmatch hoog", "betrouwbaarheid 0,92"],
      belowDesiredRate: false,
    },
  };
}

const SHIFTS: MarketplaceShift[] = [
  sample("s1", "Vakkenvuller · avonddienst", "Supermarkt Centrum", "Amsterdam", "Vakkenvullen", 1950, 5, 3.4, 94, 1, 17),
  sample("s2", "Bediening · weekendbrunch", "Grand Café De Plek", "Amsterdam", "Bediening", 2100, 6, 6.1, 88, 2, 10),
  sample("s3", "Orderpicker · ochtend", "DC Westpoort", "Amsterdam", "Orderpicken", 1875, 8, 11.8, 81, 3, 6),
];

export function ShiftShowcase() {
  return (
    <section className="relative bg-paper">
      <div className="shell-4k py-28 lg:py-36">
        <Reveal>
          <p className="eyebrow">Zo werkt het aanbod</p>
          <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">
            Elke klus met foto, tarief en reistijd per vervoerswijze
          </h2>
          <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">
            Je ziet meteen wat het oplevert, hoe lang je onderweg bent met OV, auto, fiets of te voet,
            en hoe goed de match is — nog vóór je reageert.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SHIFTS.map((s, i) => (
            <Reveal key={s.id} delay={i * 110}>
              <ShiftCard shift={s} href="/register" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
