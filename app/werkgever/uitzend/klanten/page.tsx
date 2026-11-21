import Link from "next/link";
import { PageHeader, KpiCard, Panel, EmptyState, StatusPill } from "@/components/app/ui";
import { BureauTabs, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { bureauContext, locatiesVan } from "@/lib/uitzend/bureau";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/klanten — Klanten en locaties (21 nov 2026): een uitzendbureau zet werkers in bij zijn eigen klanten.
// Elke klant is een locatie (Branch) van het bureau, met het adres waar ingecheckt wordt. Toevoegen gaat via de bestaande
// pagina Locaties (/werkgever/locaties, adres zoeken via PDOK); hier per locatie de komende diensten en de uren.

export default async function UitzendKlantenPage() {
  const ctx = await bureauContext();
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow="Uitzendbureau" title="Klanten en locaties" />
        <GeenUitzendPartner />
      </>
    );
  }
  const locaties = await locatiesVan(ctx);
  const vast = locaties.filter((l) => l.vast);
  const los = locaties.filter((l) => !l.vast);
  const open = locaties.reduce((n, l) => n + l.openPlekken, 0);
  const komend = locaties.reduce((n, l) => n + l.komendeKlussen, 0);

  return (
    <>
      <BureauTabs actief="klanten" />
      <PageHeader
        eyebrow="Uitzendbureau"
        title="Klanten en locaties"
        subtitle="Maak per klant een locatie aan, met de naam van de klant en het adres waar je uitzendkrachten werken. Daar checken ze in en daar staat de dienst."
        action={
          <Link href="/werkgever/locaties" className="btn-primary">
            Klant toevoegen
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Klanten" value={String(vast.length)} />
        <KpiCard label="Komende diensten" value={String(komend)} />
        <KpiCard label="Open plekken" value={String(open)} tone={open > 0 ? "warn" : "default"} hint="nog niemand ingepland" />
      </div>
      <Panel title="Je klanten" subtitle="Elke locatie is een klant of een vestiging van een klant">
        {vast.length === 0 ? (
          <EmptyState
            title="Nog geen klanten"
            body="Voeg je eerste klant toe: de naam (bijvoorbeeld 'Bakkerij De Vries, Veendam') en het adres. Bij een nieuwe dienst kies je daarna die klant."
            cta={{ href: "/werkgever/locaties", label: "Klant toevoegen" }}
          />
        ) : (
          <ul className="divide-y divide-hair">
            {vast.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{l.naam}</p>
                  <p className="text-sm text-neutralx-600">{l.adres}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    <span className="num font-semibold text-ink">{l.komendeKlussen}</span> komende {l.komendeKlussen === 1 ? "dienst" : "diensten"}
                  </span>
                  {l.openPlekken > 0 && <StatusPill tone="warn">{l.openPlekken} open</StatusPill>}
                  <span className="text-neutralx-500">{l.urenAfgelopen4Weken.toLocaleString("nl-NL")} uur in 4 weken</span>
                  <Link href="/werkgever/diensten/nieuw" className="font-semibold text-brand-600 underline">
                    Dienst plaatsen
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {los.length > 0 && (
        <div className="mt-6">
          <Panel title="Losse adressen" subtitle="Adressen die bij een losse dienst zijn ingevuld">
            <ul className="divide-y divide-hair">
              {los.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-ink">{l.naam}</span>
                  <span className="text-neutralx-500">{l.adres}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
