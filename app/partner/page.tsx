import type { Metadata } from "next";
import Link from "next/link";
import { getPrincipal } from "@/lib/auth";
import { BedrijfRegistreren } from "@/components/partner/BedrijfRegistreren";
import { MODEL_B, MODEL_KORT, STATUS_LABEL, STATUS_UITLEG, euro, laatsteMaanden, maandLabel, uren, type BedrijfStatus } from "@/lib/sales-partners/model";
import { partnerOverzicht } from "@/lib/sales-partners/overzicht";
import { isSalesPartner } from "@/lib/sales-partners/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partnerdashboard", robots: { index: false, follow: false } };

// Kleur per status (één kleur = één betekenis): blauw gepland, groen actief, rood probleem
const STATUS_KLEUR: Record<BedrijfStatus, string> = {
  geregistreerd: "bg-neutralx-100 text-neutralx-600",
  aangemeld: "bg-plan/10 text-plan",
  actief: "bg-brand-500/10 text-brand-700",
  afgewezen: "bg-crit/10 text-crit",
};

const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

export default async function PartnerDashboard() {
  const principal = await getPrincipal();
  if (!principal || !(await isSalesPartner(principal.userId))) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-6">
        <h1 className="font-display text-2xl font-bold text-ink">Partnerdashboard</h1>
        <p className="mt-2 text-sm text-neutralx-600">
          Dit dashboard is voor sales partners van ZekerFlex. Ben je partner geworden en zie je dit toch? Mail dan naar{" "}
          <a href="mailto:sales@zekerflex.com" className="font-semibold text-brand-600 underline">
            sales@zekerflex.com
          </a>
          .
        </p>
        <Link href="/start" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white">
          Naar de app
        </Link>
      </div>
    );
  }

  const { rijen, kpi } = await partnerOverzicht(principal.userId);
  const kaarten = [
    { label: "Aangemelde bedrijven", waarde: String(kpi.bedrijven) },
    { label: "Actieve klanten", waarde: String(kpi.actief) },
    { label: "Gewerkte uren via jouw klanten", waarde: uren(kpi.minuten) },
    { label: "Opgebouwde commissie (excl. btw)", waarde: euro(kpi.verdiendCents), sub: `Uitbetaalbaar: ${euro(kpi.uitbetaalbaarCents)}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">Partnerdashboard</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-brand-mint" />
        <p className="mt-2 max-w-2xl text-sm text-neutralx-500">
          Registreer de bedrijven die je naar ZekerFlex brengt en zie wat je verdient. Alle bedragen zijn exclusief btw.
        </p>
      </div>

      <section aria-label="Overzicht" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kaarten.map((k) => (
          <div key={k.label} className="rounded-2xl border border-hair bg-white p-5">
            <p className="text-sm text-neutralx-600">{k.label}</p>
            <p className="num mt-1 font-display text-3xl font-bold text-ink">{k.waarde}</p>
            {k.sub && <p className="mt-1 text-xs text-neutralx-500">{k.sub}</p>}
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Nieuw bedrijf registreren</h2>
        <p className="mt-1 text-sm text-neutralx-600">
          Kies per bedrijf je model. Je verdient pas als het bedrijf een account op ZekerFlex heeft, wij het aan jouw registratie
          koppelen en er uren gewerkt worden.
        </p>
        <BedrijfRegistreren />
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Jouw bedrijven</h2>
        {rijen.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">Je hebt nog geen bedrijven geregistreerd.</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutralx-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Bedrijf</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Model</th>
                  <th className="py-2 pr-3 text-right font-semibold">Gewerkte uren</th>
                  <th className="py-2 text-right font-semibold">Verdiend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rijen.map(({ bedrijf: b, uitkomst: u }) => (
                  <tr key={b.id} className="align-top">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-ink">{b.bedrijfsnaam}</p>
                      <p className="text-xs text-neutralx-500">
                        {b.contactnaam} · geregistreerd {datum(b.aangemaaktOp)}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_KLEUR[u.status]}`} title={STATUS_UITLEG[u.status]}>
                        {STATUS_LABEL[u.status]}
                      </span>
                      {u.status === "afgewezen" && b.afwijsReden && <p className="mt-1 text-xs text-neutralx-500">{b.afwijsReden}</p>}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-ink">{MODEL_KORT[b.model]}</p>
                      {b.model === "A" && u.modelAEinde && <p className="text-xs text-neutralx-500">tot {datum(u.modelAEinde)}</p>}
                      {b.model === "B" && u.status === "actief" && u.verdiendCents === 0 && (
                        <p className="text-xs text-neutralx-500">
                          {uren(u.betaaldeMinuten)} van {MODEL_B.naBetaaldeUren} betaalde uren
                        </p>
                      )}
                    </td>
                    <td className="num py-3 pr-3 text-right text-ink">{uren(u.minuten)}</td>
                    <td className="num py-3 text-right">
                      <p className="font-semibold text-ink">{euro(u.verdiendCents)}</p>
                      {u.verdiendCents > 0 && <p className="text-xs text-neutralx-500">uitbetaalbaar {euro(u.uitbetaalbaarCents)}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Maandoverzicht voor je factuur</h2>
        <p className="mt-1 text-sm text-neutralx-600">
          Download per maand je uren en commissie (CSV, opent in Excel). Factureer het uitbetaalbare bedrag: dat is de commissie
          over uren waarvan de klant de factuur al betaalde.
        </p>
        <form method="get" action="/api/partner/export" className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="export-maand" className="block text-xs font-semibold text-neutralx-600">
              Maand
            </label>
            <select id="export-maand" name="maand" className="mt-1 min-h-11 rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink">
              {laatsteMaanden(new Date()).map((m) => (
                <option key={m} value={m}>
                  {maandLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <button className="min-h-11 rounded-lg border border-brand-500 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-500/10">Download</button>
        </form>
      </section>
    </div>
  );
}
