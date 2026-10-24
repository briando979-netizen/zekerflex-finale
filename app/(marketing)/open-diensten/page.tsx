import type { Metadata } from "next";
import Link from "next/link";
import { canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { getOpenShiftMap } from "@/lib/shifts/open-map";
import { OpenShiftsMap } from "@/components/marketing/OpenShiftsMap";

export const dynamic = "force-dynamic";

const TITLE = "Open diensten in heel Nederland — live kaart | ZekerFlex";
const DESCRIPTION =
  "Bekijk live waar er werk is: open flex- en uitzenddiensten per plaats in heel Nederland, met uurtarieven. Reageer direct via ZekerFlex — geen tussenpartijen, snel uitbetaald.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  ...canonical("/open-diensten", { title: TITLE, description: DESCRIPTION }),
};

function euro(cents: number): string {
  return `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OpenShiftsPage() {
  const map = await getOpenShiftMap();
  const hasWork = map.totalShifts > 0;

  return (
    <div className="bg-paper">
      <section className="shell-4k py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Live op het platform</p>
          <h1 className="fluid-h2 mt-3 text-balance font-display font-bold">Waar is er nú werk in Nederland?</h1>
          <p className="fluid-lead mt-4 text-neutralx-600">
            {hasWork
              ? `${map.totalShifts} open ${map.totalShifts === 1 ? "dienst" : "diensten"} in ${map.totalCities} ${map.totalCities === 1 ? "plaats" : "plaatsen"} — reageer direct, kies zelf hoe snel je wordt uitbetaald.`
              : "Op dit moment staan er geen open diensten op de marktplaats. Maak een profiel aan, dan ben je er als eerste bij."}
          </p>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          {/* kaart */}
          <div className="rounded-3xl border border-neutralx-200 bg-paper-soft p-6">
            {hasWork ? (
              <OpenShiftsMap cities={map.cities} />
            ) : (
              <div className="grid h-64 place-items-center text-sm text-neutralx-400">Nog geen open diensten</div>
            )}
          </div>

          {/* lijst */}
          <div>
            {hasWork && (
              <>
                <h2 className="font-display text-xl font-semibold">Open diensten per plaats</h2>
                <ul className="mt-4 divide-y divide-neutralx-200 overflow-hidden rounded-2xl border border-neutralx-200 bg-white">
                  {map.cities.slice(0, 14).map((c) => (
                    <li key={c.city} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{c.city}</p>
                        <p className="truncate text-xs text-neutralx-500">
                          {c.sampleTitles.slice(0, 3).join(" · ") || "Diverse diensten"}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3 text-right">
                        <span className="text-xs text-neutralx-500">vanaf {euro(c.minRateCents)}/u</span>
                        <span className="pill bg-brand-50 text-brand-700">{c.count}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-mint text-base">Ik zoek werk</Link>
              <Link href="/voor-bedrijven" className="btn-ghost text-base">Ik zoek mensen</Link>
            </div>
            <p className="mt-4 text-xs text-neutralx-400">
              Locaties zijn samengevat per plaats — werkgever en exact adres zie je pas na het reageren. Bijgewerkt:{" "}
              {new Date(map.generatedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}.
            </p>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: TITLE,
            description: DESCRIPTION,
            url: `${SITE.url}/open-diensten`,
          }),
        }}
      />
    </div>
  );
}
