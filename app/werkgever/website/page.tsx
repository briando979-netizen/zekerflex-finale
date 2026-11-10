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
      {/* de Websitestudio (/studio): website en webshop beheren op een eigen scherm */}
      <Link href="/studio" className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-[#1a1a1a] p-5 text-white shadow-lg transition hover:bg-black">
        {/* bg-[#ffffff] in plaats van bg-white: de donkere modus maakt .bg-white donker, deze zwarte kaart blijft in beide modi gelijk */}
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#ffffff] text-lg font-black text-[#1a1a1a]" aria-hidden>Z</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold">Websitestudio: je website en webshop</span>
          <span className="block text-sm text-white/70">Producten met foto&apos;s en prijzen, bestellingen, ontwerp en pagina&apos;s, alles op één plek. Wij hosten je site, met je eigen domein.</span>
        </span>
        <span className="rounded-xl bg-[#ffffff] px-4 py-2 text-sm font-semibold text-[#1a1a1a]">Open de studio</span>
      </Link>
      {/* de chat op de eigen website (lib/sitechat): aan/uit en meelezen */}
      <Link href="/werkgever/website/chat" className="card mb-6 flex flex-wrap items-center gap-4 p-5 transition hover:border-brand-300">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-ink text-white" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold text-ink">Websitechat met AI-assistent</span>
          <span className="block text-sm text-neutralx-600">Beantwoordt vragen op je website met je eigen gegevens. Lees mee, neem over of laat een collega het oppakken.</span>
        </span>
        <span className="btn-ghost">Open de chat</span>
      </Link>
      {/* rijschool en horeca zijn eigen dashboards (lib/werkgever/werkruimte.ts): die voeg je toe met de wisselaar */}
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
