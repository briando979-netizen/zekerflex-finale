import { requirePrincipal } from "@/lib/auth";
import { featureEnabled } from "@/lib/flags";
import { getLocale } from "@/lib/i18n/server";
import { kanalenVoor } from "@/lib/locatie/portofoon";
import { locatieTeksten } from "@/lib/locatie/teksten";
import { Portofoon } from "@/components/locatie/Portofoon";

export const dynamic = "force-dynamic";

// Werker → Portofoon: de kanalen van de klussen waarvoor je nu ingepland staat
// (lib/locatie/portofoon.ts). Vijf talen via lib/locatie/teksten.ts.
export default async function PortofoonPage({ searchParams }: { searchParams: Promise<{ kanaal?: string }> }) {
  const principal = await requirePrincipal();
  const t = locatieTeksten(await getLocale());
  const aan = await featureEnabled("locatie-modules", { userId: principal.userId });
  const kanalen = aan ? await kanalenVoor(principal) : [];
  const { kanaal } = await searchParams;
  if (!aan) {
    return (
      <p className="rounded-2xl border border-hair bg-white px-4 py-8 text-center text-sm text-neutralx-500" role="status">
        {t.portofoon.uit}
      </p>
    );
  }
  return (
    <Portofoon
      kanalen={kanalen.map((k) => ({ id: k.id, soort: k.soort, titel: k.titel, ondertitel: k.ondertitel, tenantId: k.tenantId }))}
      ik={{ userId: principal.userId, naam: principal.fullName }}
      startKanaal={kanaal ?? null}
      t={t.portofoon}
      terugHref="/dashboard/account"
      terugLabel={t.terug}
      chatHref="/dashboard/berichten"
    />
  );
}
