import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { listFollows } from "@/lib/worker/follows";
import { FollowedEmployersList } from "@/components/app/FollowedEmployersList";

export const dynamic = "force-dynamic";

export default async function FavorietenPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).follow;
  const follows = await listFollows(principal.userId);

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
    </>
  );
}
