import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { PageHeader, Panel } from "@/components/app/ui";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function VerzekeringPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).verzekering;
  // zzp-verzekeringen — an uitzendkracht is insured through ZekerFlex as employer.
  if (invoiceModeFor(await getFiscal(principal.userId)) === "payroll") redirect("/dashboard/verloning");
  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader
        title={t.titel}
        eyebrow={t.eyebrow}
        subtitle={t.subtitel}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={t.gedekt}>
          <ul className="divide-y divide-hair">
            {t.dekking.map(([title, body]) => (
              <li key={title} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-ok/10 text-ok">✓</span>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-sm text-neutralx-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-hair px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-ink">{t.nietGedekt}</p>
            <ul className="space-y-1 text-sm text-neutralx-600">
              {t.nietGedektLijst.map((x) => (
                <li key={x} className="flex gap-2">
                  <span className="text-neutralx-400">–</span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title={t.bewijsTitel}>
            <div className="px-5 py-4">
              <p className="text-sm text-neutralx-600">
                {t.bewijsTekst}
              </p>
              <a
                href="/api/me/insurance"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-3 inline-block"
              >
                {t.bewijsKnop}
              </a>
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
