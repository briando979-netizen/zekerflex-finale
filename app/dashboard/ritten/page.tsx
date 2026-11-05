import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { MileageLog } from "@/components/app/MileageLog";
import { currentYear, getMileageLog } from "@/lib/worker/mileage";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { getFreelancerDict } from "@/lib/i18n/server";
import { pompprijsVandaag } from "@/lib/bronnen/tick";

export const dynamic = "force-dynamic";

/** "**vet** rest" → nadruk-span + tekst, zodat elke taal zijn eigen woordvolgorde houdt. */
function rich(text: string) {
  return text.split("**").map((part, i) =>
    i % 2 ? (
      <span key={i} className="font-semibold text-ink">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default async function RittenPage(props: { searchParams: Promise<{ jaar?: string }> }) {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).trips;
  const searchParams = await props.searchParams;
  const thisYear = currentYear();
  const asked = Number(searchParams.jaar);
  const year = Number.isInteger(asked) && asked >= 2020 && asked <= thisYear ? asked : thisYear;
  const log = await getMileageLog(principal.userId, year);
  const pomp = await pompprijsVandaag().catch(() => null);

  if (!log) {
    return (
      <>
        <Back label={t.back} />
        <PageHeader title={t.title} subtitle={t.noProfileSub} />
        <EmptyState icon="🚗" title={t.noProfileTitle} body={t.noProfileBody} />
      </>
    );
  }

  // "… Vul je [adresgegevens] in …" → tekst, link, tekst
  const [beforeLink = "", linkText = "", afterLink = ""] = t.homeUnknown.split(/\[|\]/);

  return (
    <>
      <Back label={t.back} />
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <nav aria-label={t.chooseYear} className="mb-5 flex flex-wrap gap-2">
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
          <Link
            key={y}
            href={`/dashboard/ritten?jaar=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${y === year ? "bg-brand-500 text-white" : "bg-neutralx-100 text-neutralx-600 hover:bg-neutralx-200"}`}
          >
            {y}
          </Link>
        ))}
      </nav>

      {pomp && (
        <p className="mb-5 rounded-xl bg-neutralx-100 px-4 py-3 text-sm text-neutralx-700">
          {t.fuelToday(pomp.benzine, pomp.diesel, pomp.datum)}
        </p>
      )}

      {!log.homeKnown && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-neutralx-700">
          {beforeLink}
          <Link href="/dashboard/profiel" className="font-semibold text-brand-600 hover:underline">
            {linkText}
          </Link>
          {afterLink}
        </div>
      )}

      <MileageLog
        year={year}
        today={amsterdamDayKey(new Date())}
        initialTrips={log.trips}
        ratePerKmCents={log.ratePerKmCents}
        isPayroll={log.isPayroll}
      />

      <div className="mt-6 rounded-xl bg-paper-soft p-4 text-xs leading-relaxed text-neutralx-600">
        {rich(log.isPayroll ? t.payrollNote : t.zzpNote)}
        <span className="mt-2 block text-neutralx-400">{t.estimateNote(log.homePostalCode || t.unknown)}</span>
      </div>
    </>
  );
}

function Back({ label }: { label: string }) {
  return (
    <div className="mb-6">
      <Link href="/dashboard/administratie" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        {label}
      </Link>
    </div>
  );
}
