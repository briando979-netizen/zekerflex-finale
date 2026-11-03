import Link from "next/link";
import { getPrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { freeAccess } from "@/lib/billing/comp";
import { getManagedWebsite, isUnlocked, WEBSITE_PLANS } from "@/lib/website/manage";
import { WebsiteManage } from "@/components/app/WebsiteManage";
import { renewalView } from "@/lib/website/renewal";
import { monitorView } from "@/lib/website/uptime";

export const dynamic = "force-dynamic";

export default async function WebsiteBeheerPage() {
  // Toegang is al afgedwongen in app/werkgever/layout.tsx.
  const principal = await getPrincipal();
  // platform admins and free (comp) accounts use this without a subscription
  const admin = await freeAccess(principal);
  const scope = principal ? await resolveEmployerScope(principal) : { tenantIds: [] as string[], branchIds: null };
  const tenantId = scope.tenantIds[0];
  const record = tenantId ? await getManagedWebsite(tenantId) : null;
  const renewal = record?.domain && isUnlocked(record) ? await renewalView(record).catch(() => null) : null;
  const monitor = record?.domain && isUnlocked(record) ? await monitorView(record.id, record.domain).catch(() => null) : null;

  return (
    <>
      <Link href="/werkgever/website/bouwer" className="card mb-6 flex flex-wrap items-center gap-4 p-5 transition hover:border-brand-300">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-brand-600 text-white" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18M8 13h5M8 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold text-ink">Bouw je website met ZekerFlex</span>
          <span className="block text-sm text-neutralx-600">Kies je branche en je hebt meteen een complete, snelle website. Wij hosten hem, met je eigen foto&apos;s en een contactformulier.</span>
        </span>
        <span className="btn-primary">Website bouwen</span>
      </Link>
      <Link href="/werkgever/rijschool" className="card mb-6 flex flex-wrap items-center gap-4 p-5 transition hover:border-brand-300">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-ink text-white" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 16v-4.5l1.8-4.6a2 2 0 0 1 1.9-1.3h6.6a2 2 0 0 1 1.9 1.3l1.8 4.6V16M3 16h18v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-.5H7v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold text-ink">Ben je een rijschool?</span>
          <span className="block text-sm text-neutralx-600">Website met proeflesplanner, een app voor je leerlingen en instructeurs, pakketten en tegoed. Klaar voor gebruik.</span>
        </span>
        <span className="btn-ghost">Rijschool-pakket</span>
      </Link>
      <Link href="/werkgever/horeca" className="card mb-6 flex flex-wrap items-center gap-4 p-5 transition hover:border-brand-300">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-ink text-white" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.2 0-4 2.7-4 6v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold text-ink">Heb je een restaurant, café of bar?</span>
          <span className="block text-sm text-neutralx-600">Website met menukaart, en modules erbij zoals reserveren, bestellen aan tafel met een QR-code, een keukenscherm en takenlijsten.</span>
        </span>
        <span className="btn-ghost">Horeca-pakket</span>
      </Link>
      <WebsiteManage
        initial={{
          status: record?.status ?? null,
          unlocked: isUnlocked(record) || admin,
          plan: record?.plan ?? null,
          domain: record?.domain ?? null,
          provider: record?.provider ?? null,
          notes: record?.notes ?? null,
          hasSecrets: Boolean(record?.secretsSealed),
          renewal,
          monitor,
        }}
        plans={WEBSITE_PLANS}
        adminOverride={admin}
      />
    </>
  );
}
