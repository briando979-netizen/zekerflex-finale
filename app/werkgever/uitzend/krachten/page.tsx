import Link from "next/link";
import { KpiCard, Panel, EmptyState, StatusPill, dateTime, dateShort } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { BureauTabs, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { fmt } from "@/lib/i18n/dictionaries";
import { getDict } from "@/lib/i18n/server";
import { bureauContext, krachtenVan } from "@/lib/uitzend/bureau";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/krachten — Uitzendkrachten (21 nov 2026): iedereen die het bureau op een van zijn diensten inplande, met
// de eerstvolgende dienst, het aantal diensten en de uren bij dit bureau.

const uren = (minuten: number, intl: string) => (minuten / 60).toLocaleString(intl, { maximumFractionDigits: 1 });

export default async function UitzendKrachtenPage() {
  const [ctx, dict] = await Promise.all([bureauContext(), getDict()]);
  const u = dict.uitzendBureau;
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PaginaKop eyebrow={u.eyebrow} title={u.tabs.krachten} />
        <GeenUitzendPartner />
      </>
    );
  }
  const krachten = await krachtenVan(ctx);
  const ingepland = krachten.filter((k) => k.volgende).length;
  const goedgekeurd = krachten.reduce((n, k) => n + k.goedgekeurdMinuten, 0);
  const wachten = krachten.reduce((n, k) => n + k.wachtMinuten, 0);
  const t = u.krachten;

  return (
    <>
      <BureauTabs actief="krachten" />
      <PaginaKop eyebrow={u.eyebrow} title={u.tabs.krachten} subtitle={t.uitleg} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiAantal} value={String(krachten.length)} />
        <KpiCard label={t.kpiVolgende} value={String(ingepland)} tone={ingepland > 0 ? "brand" : "default"} />
        <KpiCard
          label={t.kpiUren}
          value={uren(goedgekeurd, u.intl)}
          hint={wachten > 0 ? fmt(t.urenWachten, { uren: uren(wachten, u.intl) }) : t.allesGoedgekeurd}
          tone={wachten > 0 ? "warn" : "default"}
        />
      </div>
      <Panel title={t.lijstKop} subtitle={t.lijstUitleg}>
        {krachten.length === 0 ? (
          <EmptyState title={t.geen} body={t.geenUitleg} cta={{ href: "/werkgever/uitzend", label: t.naarAanvragen }} />
        ) : (
          <ul className="divide-y divide-hair">
            {krachten.map((k) => (
              <li key={k.werkerId} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{k.naam}</p>
                    {k.idGecontroleerd && <StatusPill tone="ok">{u.idGecontroleerd}</StatusPill>}
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {k.telefoon && (
                      <a href={`tel:${k.telefoon.replace(/\s+/g, "")}`} className="font-medium text-brand-600 underline">
                        {k.telefoon}
                      </a>
                    )}
                    <a href={`mailto:${k.email}`} className="font-medium text-brand-600 underline">
                      {k.email}
                    </a>
                  </p>
                  <p className="mt-1 text-sm text-neutralx-600">
                    {k.volgende
                      ? fmt(t.volgende, { titel: k.volgende.titel, datum: dateTime(k.volgende.startsAt), locatie: k.volgende.locatie })
                      : k.laatste
                        ? fmt(t.laatste, { titel: k.laatste.titel, datum: dateShort(k.laatste.startsAt) })
                        : t.geenDienst}
                  </p>
                </div>
                <div className="flex gap-6 text-sm md:text-right">
                  <div>
                    <p className="text-xs text-neutralx-500">{t.diensten}</p>
                    <p className="num font-semibold text-ink">{k.klussen}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutralx-500">{t.urenGoedgekeurd}</p>
                    <p className="num font-semibold text-ink">{uren(k.goedgekeurdMinuten, u.intl)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-4 text-sm text-neutralx-500">
        {t.voetVoor}{" "}
        <Link href="/werkgever/uren" className="text-brand-600 underline">
          {t.voetUren}
        </Link>
        {t.voetMidden}{" "}
        <Link href="/werkgever/uitzend/verloning" className="text-brand-600 underline">
          {u.tabs.verloning}
        </Link>
        .
      </p>
    </>
  );
}
