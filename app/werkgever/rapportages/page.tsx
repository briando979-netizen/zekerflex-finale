import type { Metadata } from "next";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { biIngesteld, dashboardLinkVoor, leesBiStand } from "@/lib/bi/metabase";
import { KAARTEN } from "@/lib/bi/dashboards";
import { getTheme } from "@/lib/theme/server";

export const metadata: Metadata = { title: "Rapportages" };
export const dynamic = "force-dynamic";

// Werkgever → Rapportages: het Metabase-dashboard "Mijn bedrijf", ingebed met
// een getekende link waarin het bedrijf vastzit (lib/bi/embed.ts). De link is
// 10 minuten geldig; de pagina ververst hem bij elk bezoek.
export default async function RapportagesPage() {
  const principal = await requirePrincipal();
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  // het dashboard volgt de donkere stand van het portaal (lib/theme: light/dark; Metabase noemt donker "night")
  const thema = (await getTheme()) === "dark" ? "night" : "light";
  const [url, stand] = await Promise.all([tenantId && biIngesteld() ? dashboardLinkVoor(tenantId, thema) : Promise.resolve(null), leesBiStand()]);

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Rapportages</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Mijn bedrijf in cijfers</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutralx-600">Uren, loonkosten, bezetting en facturen, live uit ZekerFlex. Alleen de cijfers van je eigen bedrijf; niets wordt gedeeld.</p>
      </header>
      {url ? (
        <section className="card overflow-hidden p-0" aria-label="Dashboard Mijn bedrijf">
          <iframe src={url} title="Dashboard Mijn bedrijf" className="h-[80vh] min-h-[720px] w-full" allowTransparency />
        </section>
      ) : (
        <section className="card p-6" role="status">
          <h2 className="font-display text-lg font-bold text-ink">Nog even geduld</h2>
          <p className="mt-2 text-sm text-neutralx-600">
            {!tenantId
              ? "Er hoort nog geen bedrijf bij je account."
              : !biIngesteld() || !stand.dashboardId
                ? "De rapportages worden op de server klaargezet. Kom straks terug; dit gebeurt vanzelf."
                : "De rapportages zijn tijdelijk niet beschikbaar. Probeer het over een paar minuten opnieuw."}
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {KAARTEN.map((k) => (
              <li key={k.sleutel} className="rounded-xl border border-hair px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{k.naam}</span>
                <span className="block text-xs text-neutralx-600">{k.uitleg}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
