import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/app/ui";
import { CalendarFeedCard } from "@/components/app/CalendarFeedCard";
import { setFeedLanguage, workerFeedToken } from "@/lib/worker/calendar-feed";
import { getFreelancerDict, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AgendaKoppelingPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).feed;
  const token = await workerFeedToken(principal.userId);
  // De agenda-app stuurt geen taal mee: onthoud die van de app voor de feedteksten.
  await setFeedLanguage(principal.userId, await getLocale());
  const url = `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/public/v1/werker-agenda/${token}.ics`;

  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          {t.back}
        </Link>
      </div>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <CalendarFeedCard initialUrl={url} />
    </>
  );
}
