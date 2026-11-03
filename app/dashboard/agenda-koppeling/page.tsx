import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/app/ui";
import { CalendarFeedCard } from "@/components/app/CalendarFeedCard";
import { workerFeedToken } from "@/lib/worker/calendar-feed";

export const dynamic = "force-dynamic";

export default async function AgendaKoppelingPage() {
  const principal = await requirePrincipal();
  const token = await workerFeedToken(principal.userId);
  const url = `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/public/v1/werker-agenda/${token}.ics`;

  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Terug
        </Link>
      </div>
      <PageHeader
        title="Diensten in je eigen agenda"
        subtitle="Koppel je agenda één keer. Elke dienst die je aanneemt, staat er daarna vanzelf in, en een afgezegde dienst gaat er weer uit."
      />
      <CalendarFeedCard initialUrl={url} />
    </>
  );
}
