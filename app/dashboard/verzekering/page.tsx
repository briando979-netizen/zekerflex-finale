import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { PageHeader, Panel } from "@/components/app/ui";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";
import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";

export const dynamic = "force-dynamic";

// Verzekering voor zzp'ers en flexwerkers (15 nov 2026). ZekerFlex biedt geen verzekering: er is geen verzekeraar en geen
// polis. Deze pagina zei dat je automatisch verzekerd was en bood een verzekeringsbewijs aan; nu zegt hij wat je zelf regelt.
// Een uitzendkracht is in dienst van ZekerFlex: die gaat naar de verloning. Is ZekerFlex geen uitzender (ZEKERFLEX_UITZENDER
// uit, lib/uitzend/model.ts), dan is het uitzendbureau de werkgever en blijft de verloning leeg: dan naar Mijn klussen.
export default async function VerzekeringPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).verzekering;
  if (invoiceModeFor(await getFiscal(principal.userId)) === "payroll") redirect(ZEKERFLEX_UITZENDER ? "/dashboard/verloning" : "/dashboard/diensten");
  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader title={t.titel} eyebrow={t.eyebrow} subtitle={t.subtitel} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={t.gedekt}>
          <ul className="divide-y divide-hair">
            {t.dekking.map(([title, body]) => (
              <li key={title} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-paper-soft text-neutralx-500" aria-hidden>
                  •
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-sm text-neutralx-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel title={t.kiesTitel}>
            <div className="px-5 py-4">
              <p className="text-sm text-neutralx-600">{t.kiesTekst}</p>
            </div>
          </Panel>
          <Panel title={t.schadeTitel}>
            <div className="px-5 py-4 text-sm text-neutralx-600">
              <p>{t.schadeTekst}</p>
              <ul className="mt-2 space-y-1">
                {t.schadeLijst.map((x) => (
                  <li key={x}>• {x}</li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
