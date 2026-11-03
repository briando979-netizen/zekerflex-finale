import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { followSuggestions, listFollows } from "@/lib/worker/follows";
import { FollowedEmployersList } from "@/components/app/FollowedEmployersList";
import { FollowEmployerButton } from "@/components/app/FollowEmployerButton";

export const dynamic = "force-dynamic";

export default async function FavorietenPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).follow;
  const [follows, suggestions] = await Promise.all([listFollows(principal.userId), followSuggestions(principal.userId).catch(() => [])]);

  return (
    <>
      <div className="mb-5">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          {t.back}
        </Link>
      </div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.title}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 text-sm text-neutralx-500">{t.subtitle}</p>
      </div>
      <FollowedEmployersList initial={follows} />

      {suggestions.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-base font-semibold text-ink">{t.suggestTitle}</h2>
          <p className="mt-0.5 text-sm text-neutralx-500">{t.suggestBody}</p>
          <ul className="mt-3 divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
            {suggestions.map((s) => (
              <li key={s.tenantId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                  <p className="text-xs text-neutralx-500">{s.shiftsWorked}×</p>
                </div>
                <FollowEmployerButton tenantId={s.tenantId} name={s.name} initialFollowing={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
