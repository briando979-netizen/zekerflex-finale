import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { ErasureScopeInfo } from "@/components/privacy/ErasureScopeInfo";
import { DeleteOwnAccountForm } from "@/components/app/DeleteOwnAccountForm";

export const dynamic = "force-dynamic";

export default async function VerwijderAccountPage() {
  await requirePrincipal();

  return (
    <>
      <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← Terug naar account
      </Link>

      <div className="my-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          Account verwijderen
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 text-sm text-neutralx-500">
          Dit kan niet ongedaan gemaakt worden en je wordt direct uitgelogd. Lees hieronder precies wat er gebeurt.
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-hair bg-white p-5 shadow-card">
        <ErasureScopeInfo />
        <DeleteOwnAccountForm />
      </div>
    </>
  );
}
