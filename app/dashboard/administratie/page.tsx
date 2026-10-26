import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { getWorkerMilestones, type Milestone } from "@/lib/worker/milestones";
import { inAndroidApp } from "@/lib/app-mode-server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { ring: string; chip: string; bar: string; label: string }> = {
  ok: { ring: "border-brand-200", chip: "bg-brand-50 text-brand-700", bar: "bg-brand-500", label: "op schema" },
  soon: { ring: "border-warn/30", chip: "bg-warn/10 text-warn", bar: "bg-warn", label: "binnenkort" },
  action: { ring: "border-crit/30", chip: "bg-crit/10 text-crit", bar: "bg-crit", label: "actie nodig" },
  info: { ring: "border-neutralx-200", chip: "bg-neutralx-100 text-neutralx-600", bar: "bg-brand-400", label: "info" },
};

function euro(cents: number): string {
  return `€ ${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

function Card({ m }: { m: Milestone }) {
  const s = STATUS[m.status] ?? STATUS.info!;
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
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>{s.label}</span>
      </div>

      {m.progress && (
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutralx-200">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          <p className="mt-1 text-xs text-neutralx-500">
            {m.progress.unit === "" ? euro(m.progress.value) : `${m.progress.value.toLocaleString("nl-NL")}${m.progress.unit}`} {m.progress.label}
          </p>
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{m.detail}</p>
      {m.impact && (
        <p className="mt-2 rounded-lg bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
          <span className="font-semibold text-ink">Wat dit voor jou betekent: </span>
          {m.impact}
        </p>
      )}
    </div>
  );
}

export default async function AdministratiePage() {
  const principal = await requirePrincipal();
  const [data, inApp] = await Promise.all([getWorkerMilestones(principal.userId), inAndroidApp()]);

  if (!data) {
    return (
      <>
        <Back />
        <PageHeader title="Je administratie" subtitle="Herinneringen en mijlpalen, zodat jij nergens aan hoeft te denken." />
        <EmptyState icon="📋" title="Nog geen profiel" body="Deze pagina verschijnt zodra je als professional bent geregistreerd." />
      </>
    );
  }

  return (
    <>
      <Back />
      <PageHeader
        title="Je administratie, zonder gedoe"
        subtitle="We houden je uren, omzet en deadlines in de gaten en sturen een melding zodra er iets moet gebeuren."
      />

      {!data.fiscalComplete && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-neutralx-700">
          Vul eerst je{" "}
          <Link href="/dashboard/fiscaal" className="font-semibold text-brand-600 hover:underline">werkvorm &amp; fiscale gegevens</Link>{" "}
          in, dan kunnen we dit precies voor je bijhouden.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data.milestones.map((m) => (
          <Card key={m.id} m={m} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        {!inApp && (
          <Link href="/dashboard/bank" className="font-semibold text-brand-600 hover:underline">
            → Belasting-potje &amp; btw-overzicht
          </Link>
        )}
        <Link href="/dashboard/vooruitblik" className="font-semibold text-brand-600 hover:underline">
          → Loon-vooruitblik
        </Link>
      </div>

      <p className="mt-5 text-xs text-neutralx-400">
        Alle bedragen zijn indicaties/vuistregels en geen belastingadvies. Controleer je definitieve aangifte altijd bij
        de Belastingdienst of je boekhouder. Alleen je ZekerFlex-werk is hier meegerekend.
      </p>
    </>
  );
}

function Back() {
  return (
    <div className="mb-6">
      <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← Terug
      </Link>
    </div>
  );
}
