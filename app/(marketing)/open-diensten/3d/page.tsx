import type { Metadata } from "next";
import Link from "next/link";
import { getOpenShiftMap } from "@/lib/shifts/open-map";
import { getSupplyMap, MIN_PER_CELL } from "@/lib/shifts/supply-map";
import { OpenShifts3D } from "@/components/marketing/OpenShifts3D";

export const dynamic = "force-dynamic";

// Voorbeeldpagina van de 3D-kaart. Bewust nog niet in Google en nergens gelinkt:
// de eigenaar beslist of en waar hij op de site komt (bijv. de homepage).
export const metadata: Metadata = {
  title: { absolute: "Vraag en aanbod in 3D | ZekerFlex" },
  description: "Open diensten en beschikbare krachten in Nederland, als 3D-kaart.",
  robots: { index: false, follow: false },
};

export default async function OpenShifts3DPage() {
  const [map, supply] = await Promise.all([getOpenShiftMap(), getSupplyMap()]);
  return (
    <div className="bg-paper">
      <section className="shell-4k py-12 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Live op het platform</p>
          <h1 className="fluid-h2 mt-3 text-balance font-display font-bold">Vraag en aanbod in 3D</h1>
          <p className="fluid-lead mt-4 text-neutralx-600">
            {map.totalShifts} open {map.totalShifts === 1 ? "dienst" : "diensten"} in {map.totalCities} {map.totalCities === 1 ? "plaats" : "plaatsen"}
            {supply.shown > 0 ? `, en ${supply.shown} beschikbare krachten in ${supply.cells.length} ${supply.cells.length === 1 ? "regio" : "regio's"}` : ""}.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-5xl">
          <OpenShifts3D cities={map.cities} supply={supply.cells} />
          <p className="mt-3 text-xs text-neutralx-500">
            Diensten per plaats, nooit het exacte adres of de werkgever. Krachten per vak van ongeveer 16 km, pas vanaf {MIN_PER_CELL} mensen en op het midden van het vak, nooit iemands eigen locatie.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="font-display text-lg font-semibold">Open diensten per plaats</h2>
              {map.cities.length === 0 ? (
                <p className="mt-2 text-sm text-neutralx-500">Nu geen open diensten.</p>
              ) : (
                <ul className="mt-3 divide-y divide-neutralx-200 overflow-hidden rounded-2xl border border-neutralx-200 bg-white">
                  {map.cities.slice(0, 10).map((c) => (
                    <li key={c.city} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-medium">{c.city}</span>
                      <span className="num text-neutralx-600">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-sm text-neutralx-600">
              <h2 className="font-display text-lg font-semibold text-ink">Zelf aan de slag</h2>
              <p className="mt-2">Werk zoeken of personeel nodig? Op de gewone kaart zie je de diensten met uurtarieven.</p>
              <Link href="/open-diensten" className="btn-primary mt-4">Naar de open diensten</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
