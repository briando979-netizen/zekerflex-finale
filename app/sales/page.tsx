import Link from "next/link";
import { LeadWorkspace } from "@/components/sales/LeadWorkspace";

export const dynamic = "force-dynamic";

export default function SalesPage() {
  return (
    <>
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
