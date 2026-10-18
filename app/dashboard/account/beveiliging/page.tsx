import { requirePrincipal } from "@/lib/auth";
import { BackLink } from "@/components/app/BackLink";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";

export const dynamic = "force-dynamic";

export default async function BeveiligingPage() {
  await requirePrincipal();
  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label="Account" />
      <div className="my-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">Tweestapsverificatie</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-brand-500/40" />
        <p className="mt-2 text-sm text-neutralx-500">Extra bescherming voor je account en je uitbetalingen.</p>
      </div>
      <div className="rounded-2xl border border-hair bg-white p-5 shadow-card">
        <TwoFactorSettings />
      </div>
    </>
  );
}
