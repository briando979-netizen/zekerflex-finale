import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { HiddenEmployersList } from "@/components/app/HiddenEmployersList";

export const dynamic = "force-dynamic";

export default async function VerborgenOpdrachtgeversPage() {
  await requirePrincipal();

  return (
    <>
      <Link
        href="/dashboard/account"
        className="text-sm font-medium text-neutralx-500 hover:text-brand-600"
      >
        ← Terug naar account
      </Link>

      <div className="my-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          Verborgen opdrachtgevers
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 text-sm text-neutralx-500">
          Klussen van deze opdrachtgevers zie je niet meer bij Ontdekken. Dit staat alleen op dit apparaat.
        </p>
      </div>

      <HiddenEmployersList />
    </>
  );
}
