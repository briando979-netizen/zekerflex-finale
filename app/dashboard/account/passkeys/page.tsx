import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { BackLink } from "@/components/app/BackLink";
import { PasskeySettings } from "@/components/auth/PasskeySettings";

export const dynamic = "force-dynamic";

export default async function PasskeysPage() {
  await requirePrincipal();
  // Alleen platte strings: die mogen als prop naar het client-onderdeel (dat ook werkgevers gebruiken).
  const t = (await getFreelancerDict()).passkeys;
  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <div className="my-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.pageTitle}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-brand-500/40" />
        <p className="mt-2 text-sm text-neutralx-500">{t.pageSub}</p>
      </div>
      <div className="rounded-2xl border border-hair bg-white p-5 shadow-card">
        <PasskeySettings texts={t} />
      </div>
    </>
  );
}
