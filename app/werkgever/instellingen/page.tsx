import Link from "next/link";
import type { ReactNode } from "react";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { getDict } from "@/lib/i18n/server";
import {
  IUser,
  IUsers,
  IMail,
  IPin,
  IHash,
  IKey,
  IDoc,
  IGrid,
  IHeart,
  IList,
  IActivity,
} from "@/components/app/icons";

export const dynamic = "force-dynamic";

interface Card {
  title: string;
  sub: string;
  href?: string;
  icon: ReactNode;
  soon?: boolean;
}

export default async function InstellingenPage() {
  const principal = await requirePrincipal();
  const d = getDict();
  const s = d.settings;
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const extra = tenantId ? await getOrgProfileExtra(tenantId) : {};
  const hasCover = Boolean(extra.photoUploadId || extra.onboarding?.coverStepDone);

  const bedrijf: Card[] = [
    { title: s.cProfileT, sub: s.cProfileS, href: "/werkgever/bedrijf", icon: <IUser /> },
    { title: s.cReviewsT, sub: s.cReviewsS, href: "/werkgever/reviews", icon: <IActivity /> },
    { title: s.cContactT, sub: s.cContactS, href: "/werkgever/bedrijf", icon: <IMail /> },
    { title: s.cLocationsT, sub: s.cLocationsS, href: "/werkgever/bedrijf", icon: <IPin /> },
    { title: s.cCostT, sub: s.cCostS, href: "/werkgever/facturen", icon: <IHash /> },
    { title: s.cUsersT, sub: s.cUsersS, icon: <IUsers />, soon: true },
    { title: s.cApiT, sub: s.cApiS, icon: <IKey />, soon: true },
    { title: s.cDpaT, sub: s.cDpaS, href: "/werkgever/overeenkomsten", icon: <IDoc /> },
  ];

  const klussen: Card[] = [
    { title: s.cTemplatesT, sub: s.cTemplatesS, icon: <IGrid />, soon: true },
    { title: s.cLabelsT, sub: s.cLabelsS, href: "/werkgever/favorieten", icon: <IHeart /> },
    { title: s.cShiftSettingsT, sub: s.cShiftSettingsS, href: "/werkgever/bedrijf", icon: <IList /> },
  ];

  const facturatie: Card[] = [
    { title: s.cInvoiceT, sub: s.cInvoiceS, href: "/werkgever/facturen", icon: <IDoc /> },
  ];

  const account: Card[] = [
    { title: s.cAccountT, sub: s.cAccountS, icon: <IUser />, soon: true },
  ];

  return (
    <>
      <h1 className="mb-8 font-display text-2xl font-bold uppercase tracking-tight text-ink">{s.title}</h1>

      {!hasCover && (
        <div className="mb-10 flex items-start justify-between gap-4 rounded-2xl bg-white p-6 shadow-card">
          <div className="max-w-xl">
            <h2 className="font-display text-lg font-bold text-ink">{s.coverTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{s.coverBody}</p>
            <Link href="/werkgever/bedrijf" className="btn-primary mt-4 inline-block">
              {s.coverCta}
            </Link>
          </div>
          <span className="hidden h-14 w-14 flex-shrink-0 place-items-center rounded-xl bg-paper-soft text-crit sm:grid">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4l2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      )}

      <Section title={s.sectionCompany} cards={bedrijf} soonLabel={d.common.soon} />
      <Section title={s.sectionShifts} cards={klussen} soonLabel={d.common.soon} />
      <Section title={s.sectionInvoicing} cards={facturatie} soonLabel={d.common.soon} />
      <Section title={s.sectionAccount} cards={account} soonLabel={d.common.soon} />
    </>
  );
}

function Section({ title, cards, soonLabel }: { title: string; cards: Card[]; soonLabel: string }) {
  return (
    <section className="mb-10 border-t border-hair pt-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutralx-400">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <>
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-paper-soft text-crit">
                {c.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink">{c.title}</span>
                  {c.soon && (
                    <span className="rounded-full bg-paper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutralx-400">
                      {soonLabel}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-neutralx-500">{c.sub}</span>
              </span>
            </>
          );
          const cls =
            "flex items-start gap-3 rounded-xl border border-hair bg-white p-4 shadow-card transition";
          return c.href && !c.soon ? (
            <Link key={c.title} href={c.href} className={`${cls} hover:-translate-y-0.5 hover:border-brand-300`}>
              {inner}
            </Link>
          ) : (
            <div key={c.title} className={`${cls} cursor-default opacity-70`}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
