import { requirePrincipal } from "@/lib/auth";
import { CertificatesManager } from "@/components/app/CertificatesManager";

export const dynamic = "force-dynamic";

export default async function CertificatenPage() {
  await requirePrincipal();

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          Certificaten
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 max-w-2xl text-sm text-neutralx-500">
          VCA, BHV, heftruck, rijbewijzen — voeg je certificaten toe. We controleren de vervaldatum
          automatisch en klussen die een certificaat vragen worden dan voor jou vrijgegeven.
        </p>
      </div>
      <CertificatesManager />
    </>
  );
}
