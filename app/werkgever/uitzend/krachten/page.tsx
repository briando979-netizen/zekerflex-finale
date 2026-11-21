import Link from "next/link";
import { PageHeader, KpiCard, Panel, EmptyState, StatusPill, dateTime, dateShort } from "@/components/app/ui";
import { BureauTabs, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { bureauContext, krachtenVan } from "@/lib/uitzend/bureau";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/krachten — Uitzendkrachten (21 nov 2026): iedereen die het bureau op een van zijn diensten inplande, met
// de eerstvolgende dienst, het aantal diensten en de uren bij dit bureau.

const uren = (minuten: number) => (minuten / 60).toLocaleString("nl-NL", { maximumFractionDigits: 1 });

export default async function UitzendKrachtenPage() {
  const ctx = await bureauContext();
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow="Uitzendbureau" title="Uitzendkrachten" />
        <GeenUitzendPartner />
      </>
    );
  }
  const krachten = await krachtenVan(ctx);
  const ingepland = krachten.filter((k) => k.volgende).length;
  const goedgekeurd = krachten.reduce((n, k) => n + k.goedgekeurdMinuten, 0);
  const wachten = krachten.reduce((n, k) => n + k.wachtMinuten, 0);

  return (
    <>
      <BureauTabs actief="krachten" />
      <PageHeader eyebrow="Uitzendbureau" title="Uitzendkrachten" subtitle="Iedereen die je via ZekerFlex op een dienst inplande, met hun uren bij jouw bureau." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Uitzendkrachten" value={String(krachten.length)} />
        <KpiCard label="Met een volgende dienst" value={String(ingepland)} tone={ingepland > 0 ? "brand" : "default"} />
        <KpiCard label="Goedgekeurde uren" value={uren(goedgekeurd)} hint={wachten > 0 ? `${uren(wachten)} uur wacht op goedkeuring` : "alles goedgekeurd"} tone={wachten > 0 ? "warn" : "default"} />
      </div>
      <Panel title="Je uitzendkrachten" subtitle="Wie een volgende dienst heeft, staat bovenaan">
        {krachten.length === 0 ? (
          <EmptyState
            title="Nog geen uitzendkrachten"
            body="Plan je iemand in vanuit Aanvragen, dan staat hij hier."
            cta={{ href: "/werkgever/uitzend", label: "Naar de aanvragen" }}
          />
        ) : (
          <ul className="divide-y divide-hair">
            {krachten.map((k) => (
              <li key={k.werkerId} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{k.naam}</p>
                    {k.idGecontroleerd && <StatusPill tone="ok">ID gecontroleerd</StatusPill>}
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
                    {k.volgende ? `Volgende dienst: ${k.volgende.titel}, ${dateTime(k.volgende.startsAt)} (${k.volgende.locatie})` : k.laatste ? `Laatste dienst: ${k.laatste.titel}, ${dateShort(k.laatste.startsAt)}` : "Nog geen dienst"}
                  </p>
                </div>
                <div className="flex gap-6 text-sm md:text-right">
                  <div>
                    <p className="text-xs text-neutralx-500">Diensten</p>
                    <p className="num font-semibold text-ink">{k.klussen}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutralx-500">Uren goedgekeurd</p>
                    <p className="num font-semibold text-ink">{uren(k.goedgekeurdMinuten)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-4 text-sm text-neutralx-500">
        Uren goedkeuren doe je bij{" "}
        <Link href="/werkgever/uren" className="text-brand-600 underline">
          Uren
        </Link>
        . De goedgekeurde uren per week voor je loonpakket staan bij{" "}
        <Link href="/werkgever/uitzend/verloning" className="text-brand-600 underline">
          Uren voor verloning
        </Link>
        .
      </p>
    </>
  );
}
