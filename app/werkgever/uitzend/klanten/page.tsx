import Link from "next/link";
import { PageHeader, KpiCard, Panel, EmptyState, StatusPill } from "@/components/app/ui";
import { BureauTabs, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { fmt } from "@/lib/i18n/dictionaries";
import { getDict } from "@/lib/i18n/server";
import { bureauContext, locatiesVan } from "@/lib/uitzend/bureau";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/klanten — Klanten en locaties (21 nov 2026): een uitzendbureau zet werkers in bij zijn eigen klanten.
// Elke klant is een locatie (Branch) van het bureau, met het adres waar ingecheckt wordt. Toevoegen gaat via de bestaande
// pagina Locaties (/werkgever/locaties, adres zoeken via PDOK); hier per locatie de komende diensten en de uren.

export default async function UitzendKlantenPage() {
  const [ctx, dict] = await Promise.all([bureauContext(), getDict()]);
  const u = dict.uitzendBureau;
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow={u.eyebrow} title={u.tabs.klanten} />
        <GeenUitzendPartner />
      </>
    );
  }
  const locaties = await locatiesVan(ctx);
  const vast = locaties.filter((l) => l.vast);
  const los = locaties.filter((l) => !l.vast);
  const open = locaties.reduce((n, l) => n + l.openPlekken, 0);
  const komend = locaties.reduce((n, l) => n + l.komendeKlussen, 0);
  const k = u.klanten;

  return (
    <>
      <BureauTabs actief="klanten" />
      <PageHeader
        eyebrow={u.eyebrow}
        title={u.tabs.klanten}
        subtitle={k.uitleg}
        action={
          <Link href="/werkgever/locaties" className="btn-primary">
            {k.toevoegen}
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label={k.kpiKlanten} value={String(vast.length)} />
        <KpiCard label={k.kpiKomend} value={String(komend)} />
        <KpiCard label={k.kpiOpen} value={String(open)} tone={open > 0 ? "warn" : "default"} hint={k.kpiOpenHint} />
      </div>
      <Panel title={k.lijstKop} subtitle={k.lijstUitleg}>
        {vast.length === 0 ? (
          <EmptyState title={k.geen} body={k.geenUitleg} cta={{ href: "/werkgever/locaties", label: k.toevoegen }} />
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
                    <span className="num font-semibold text-ink">{l.komendeKlussen}</span> {l.komendeKlussen === 1 ? k.komendeEen : k.komendeMeer}
                  </span>
                  {l.openPlekken > 0 && <StatusPill tone="warn">{fmt(k.open, { n: l.openPlekken })}</StatusPill>}
                  <span className="text-neutralx-500">{fmt(k.urenVierWeken, { uren: l.urenAfgelopen4Weken.toLocaleString(u.intl) })}</span>
                  <Link href="/werkgever/diensten/nieuw" className="font-semibold text-brand-600 underline">
                    {u.dienstPlaatsen}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {los.length > 0 && (
        <div className="mt-6">
          <Panel title={k.losKop} subtitle={k.losUitleg}>
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
