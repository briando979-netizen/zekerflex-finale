import Link from "next/link";
import { LeadWorkspace } from "@/components/sales/LeadWorkspace";
import { getPrincipal } from "@/lib/auth";
import { WelcomeBack } from "@/components/app/WelcomeBack";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const principal = await getPrincipal();
  const t = await getDict();
  return (
    <>
      <WelcomeBack name={principal?.fullName} labels={t.greet} />
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">Buitendienst</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 max-w-2xl text-sm text-neutralx-500">
          Leg bedrijfsbezoeken vast, zet meteen een account klaar en verstuur het naar de opdrachtgever.
          Laat tijdens het gesprek de{" "}
          <Link href="/uitleg" target="_blank" className="font-semibold text-brand-600 underline">
            uitlegfilmpjes
          </Link>{" "}
          zien.
        </p>
      </div>
      <LeadWorkspace />
    </>
  );
}
