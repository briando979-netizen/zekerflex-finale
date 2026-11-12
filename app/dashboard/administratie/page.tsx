import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { getWorkerMilestones, type Milestone } from "@/lib/worker/milestones";
import { inAndroidApp } from "@/lib/app-mode-server";
import { currentYear } from "@/lib/worker/mileage";
import { BANK_AAN } from "@/lib/app-mode";
import { getFreelancerDict } from "@/lib/i18n/server";
import { vulIn } from "@/lib/i18n/vul-in";
import type { FreelancerDict } from "@/lib/i18n/freelancer";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { ring: string; chip: string; bar: string }> = {
  ok: { ring: "border-brand-200", chip: "bg-brand-50 text-brand-700", bar: "bg-brand-500" },
  soon: { ring: "border-warn/30", chip: "bg-warn/10 text-warn", bar: "bg-warn" },
  action: { ring: "border-crit/30", chip: "bg-crit/10 text-crit", bar: "bg-crit" },
  info: { ring: "border-neutralx-200", chip: "bg-neutralx-100 text-neutralx-600", bar: "bg-brand-400" },
};

type T = FreelancerDict["administratie"];

function Card({ m, t, intl }: { m: Milestone; t: T; intl: string }) {
  const euro = (cents: number) => `€ ${Math.round(cents / 100).toLocaleString(intl)}`;
  const s = STATUS[m.status] ?? STATUS.info!;
  const label = (t.status as Record<string, string>)[m.status] ?? t.status.info;
  const pct = m.progress ? Math.min(100, Math.round((m.progress.value / m.progress.max) * 100)) : 0;
  return (
    <div className={`rounded-2xl border bg-white p-5 ${s.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>{m.icon}</span>
          <div>
            <h2 className="font-display text-base font-semibold">{m.title}</h2>
            <p className="mt-0.5 text-sm font-medium text-ink-soft">{m.headline}</p>
          </div>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>{label}</span>
      </div>

      {m.progress && (
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutralx-200">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          <p className="mt-1 text-xs text-neutralx-500">
            {m.progress.unit === "" ? euro(m.progress.value) : `${m.progress.value.toLocaleString(intl)}${m.progress.unit}`} {m.progress.label}
          </p>
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{m.detail}</p>
      {m.impact && (
        <p className="mt-2 rounded-lg bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
          <span className="font-semibold text-ink">{t.impact}</span>
          {m.impact}
        </p>
      )}
    </div>
  );
}

export default async function AdministratiePage() {
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const t = ft.administratie;
  const [data, inApp] = await Promise.all([getWorkerMilestones(principal.userId), inAndroidApp()]);
  const year = currentYear();

  if (!data) {
    return (
      <>
        <Back t={t} />
        <PageHeader title={t.titel} subtitle={t.subtitelLeeg} />
        <EmptyState icon="📋" title={t.leegTitel} body={t.leegTekst} />
      </>
    );
  }

  return (
    <>
      <Back t={t} />
      <PageHeader title={t.titelVol} subtitle={t.subtitel} />

      {!data.fiscalComplete && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-neutralx-700">
          {t.vulEerst}{" "}
          <Link href="/dashboard/fiscaal" className="font-semibold text-brand-600 hover:underline">{t.werkvorm}</Link>{" "}
          {t.vulIn}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data.milestones.map((m) => (
          <Card key={m.id} m={m} t={t} intl={ft.intl} />
        ))}
      </div>

      {data.workerKind !== "uitzendkracht" && data.fiscalComplete && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutralx-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🧾</span>
            <div>
              <h2 className="font-display text-base font-semibold">{t.jaarTitel}</h2>
              <p className="mt-0.5 text-sm text-neutralx-600">
                {t.jaarTekst}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[year, year - 1].map((y) => (
              <a
                key={y}
                href={`/api/me/jaaroverzicht?jaar=${y}`}
                target="_blank"
                rel="noopener noreferrer"
                className={y === year ? "btn-primary text-sm" : "rounded-lg border border-neutralx-200 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-neutralx-50"}
              >
                {vulIn(t.pdf, { jaar: y })}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        {!inApp && BANK_AAN && (
          <Link href="/dashboard/bank" className="font-semibold text-brand-600 hover:underline">
            {t.potje}
          </Link>
        )}
        <Link href="/dashboard/vooruitblik" className="font-semibold text-brand-600 hover:underline">
          {t.vooruitblik}
        </Link>
        <Link href="/dashboard/ritten" className="font-semibold text-brand-600 hover:underline">
          {t.km}
        </Link>
      </div>

      <p className="mt-5 text-xs text-neutralx-400">
        {t.disclaimer}
      </p>
    </>
  );
}

function Back({ t }: { t: T }) {
  return (
    <div className="mb-6">
      <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← {t.back}
      </Link>
    </div>
  );
}
