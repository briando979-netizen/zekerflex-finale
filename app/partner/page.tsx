import type { Metadata } from "next";
import Link from "next/link";
import { getPrincipal } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { BedrijfRegistreren } from "@/components/partner/BedrijfRegistreren";
import { MODEL_B, euro, laatsteMaanden, maandLabel, uren, type BedrijfStatus } from "@/lib/sales-partners/model";
import { partnerOverzicht } from "@/lib/sales-partners/overzicht";
import { isSalesPartner } from "@/lib/sales-partners/store";
import { PARTNER_TEKSTEN, partnerTaal, vulIn } from "@/lib/sales-partners/teksten";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partnerdashboard", robots: { index: false, follow: false } };

// Kleur per status (één kleur = één betekenis): blauw gepland, groen actief, rood probleem
const STATUS_KLEUR: Record<BedrijfStatus, string> = {
  geregistreerd: "bg-neutralx-100 text-neutralx-600",
  aangemeld: "bg-plan/10 text-plan",
  actief: "bg-brand-500/10 text-brand-700",
  afgewezen: "bg-crit/10 text-crit",
};

// Het partnerdashboard in het Nederlands of het Engels (lib/sales-partners/teksten.ts, taalknop in de layout).
export default async function PartnerDashboard() {
  const taal = partnerTaal(await getLocale());
  const tx = PARTNER_TEKSTEN[taal];
  const datum = (iso: string) => new Date(iso).toLocaleDateString(tx.dateLocale, { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

  const principal = await getPrincipal();
  if (!principal || !(await isSalesPartner(principal.userId))) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-6">
        <h1 className="font-display text-2xl font-bold text-ink">{tx.titel}</h1>
        <p className="mt-2 text-sm text-neutralx-600">
          {tx.geenPartner}{" "}
          <a href="mailto:sales@zekerflex.com" className="font-semibold text-brand-600 underline">
            sales@zekerflex.com
          </a>
          .
        </p>
        <Link href="/start" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white">
          {tx.naarApp}
        </Link>
      </div>
    );
  }

  const { rijen, kpi } = await partnerOverzicht(principal.userId);
  const kaarten = [
    { label: tx.kpi.bedrijven, waarde: String(kpi.bedrijven) },
    { label: tx.kpi.actief, waarde: String(kpi.actief) },
    { label: tx.kpi.uren, waarde: uren(kpi.minuten) },
    {
      label: tx.kpi.commissie,
      waarde: euro(kpi.verdiendCents),
      sub: vulIn(tx.kpi.commissieSub, { klaar: euro(kpi.uitbetaalbaarCents), wacht: euro(Math.max(0, kpi.verdiendCents - kpi.uitbetaalbaarCents)) }),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">{tx.titel}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-brand-mint" />
        <p className="mt-2 max-w-2xl text-sm text-neutralx-500">{tx.intro}</p>
      </div>

      <section aria-label={tx.titel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kaarten.map((k) => (
          <div key={k.label} className="rounded-2xl border border-hair bg-white p-5">
            <p className="text-sm text-neutralx-600">{k.label}</p>
            <p className="num mt-1 font-display text-3xl font-bold text-ink">{k.waarde}</p>
            {k.sub && <p className="mt-1 text-xs text-neutralx-500">{k.sub}</p>}
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">{tx.hoeTitel}</h2>
          <ol className="mt-3 space-y-3">
            {tx.hoeStappen.map((stap, i) => (
              <li key={stap} className="flex gap-3 text-sm text-neutralx-600">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-700">{i + 1}</span>
                <span>{stap}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">{tx.regelsTitel}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutralx-600">
            {tx.regels.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">{tx.formTitel}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{tx.formUitleg}</p>
        <BedrijfRegistreren texts={tx.formulier} />
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">{tx.tabelTitel}</h2>
        {rijen.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">{tx.tabelLeeg}</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutralx-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">{tx.kop.bedrijf}</th>
                  <th className="py-2 pr-3 font-semibold">{tx.kop.status}</th>
                  <th className="py-2 pr-3 font-semibold">{tx.kop.model}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{tx.kop.uren}</th>
                  <th className="py-2 text-right font-semibold">{tx.kop.verdiend}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rijen.map(({ bedrijf: b, uitkomst: u }) => (
                  <tr key={b.id} className="align-top">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-ink">{b.bedrijfsnaam}</p>
                      <p className="text-xs text-neutralx-500">
                        {b.contactnaam} · {vulIn(tx.geregistreerdOp, { datum: datum(b.aangemaaktOp) })}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_KLEUR[u.status]}`} title={tx.statusUitleg[u.status]}>
                        {tx.statusLabel[u.status]}
                      </span>
                      {u.status === "afgewezen" && b.afwijsReden && <p className="mt-1 text-xs text-neutralx-500">{b.afwijsReden}</p>}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-ink">{tx.modelKort[b.model]}</p>
                      {b.model === "A" && u.modelAEinde && <p className="text-xs text-neutralx-500">{vulIn(tx.tot, { datum: datum(u.modelAEinde) })}</p>}
                      {b.model === "B" && u.status === "actief" && u.verdiendCents === 0 && (
                        <p className="text-xs text-neutralx-500">{vulIn(tx.betaaldeUrenVan, { uren: uren(u.betaaldeMinuten), n: MODEL_B.naBetaaldeUren })}</p>
                      )}
                    </td>
                    <td className="num py-3 pr-3 text-right text-ink">
                      {uren(u.minuten)}
                      {u.gratisMinuten > 0 && <p className="text-xs font-normal text-neutralx-500">{vulIn(tx.gratisUren, { uren: uren(u.gratisMinuten) })}</p>}
                    </td>
                    <td className="num py-3 text-right">
                      <p className="font-semibold text-ink">{euro(u.verdiendCents)}</p>
                      {u.verdiendCents > 0 && <p className="text-xs text-neutralx-500">{vulIn(tx.uitbetaalbaar, { bedrag: euro(u.uitbetaalbaarCents) })}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">{tx.exportTitel}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{tx.exportUitleg}</p>
        <form method="get" action="/api/partner/export" className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="export-maand" className="block text-xs font-semibold text-neutralx-600">
              {tx.maand}
            </label>
            <select id="export-maand" name="maand" className="mt-1 min-h-11 rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink">
              {laatsteMaanden(new Date()).map((m) => (
                <option key={m} value={m}>
                  {maandLabel(m, taal)}
                </option>
              ))}
            </select>
          </div>
          <button className="min-h-11 rounded-lg border border-brand-500 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-500/10">{tx.download}</button>
        </form>
      </section>
    </div>
  );
}
