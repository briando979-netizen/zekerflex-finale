import { requirePrincipal } from "@/lib/auth";
import { HiddenEmployersList } from "@/components/app/HiddenEmployersList";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function VerborgenOpdrachtgeversPage() {
  await requirePrincipal();
  const ft = await getFreelancerDict();

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={ft.nav.account} />

      <div className="my-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          {ft.acct.hidden}
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 text-sm text-neutralx-500">
          {ft.restTaal.verborgenSub}
        </p>
      </div>

      <HiddenEmployersList />
    </>
  );
}
