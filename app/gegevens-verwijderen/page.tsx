import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { DataDeletionRequestForm } from "@/components/privacy/DataDeletionRequestForm";

export const metadata: Metadata = {
  title: "Gegevens laten verwijderen",
  description: "Vraag het verwijderen van bepaalde persoonsgegevens aan, zonder je ZekerFlex-account op te heffen.",
  alternates: { canonical: "/gegevens-verwijderen" },
};

// Public, no-login page — the "request data deletion without deleting the
// account" link Google Play asks for in the Data safety form. The full account
// deletion lives at /account-verwijderen.
export default function GegevensVerwijderenPage() {
  return (
    <AuthShell
      title="Gegevens laten verwijderen"
      subtitle="Wil je bepaalde gegevens kwijt, maar je account houden? Kies hieronder wat er weg moet. Je kunt dit ook doen zonder in te loggen."
      footer={
        <span className="space-y-1">
          <span className="block">
            Je hele account opheffen?{" "}
            <Link href="/account-verwijderen" className="font-semibold text-brand-600 hover:underline">
              Account verwijderen
            </Link>
          </span>
          <span className="block">
            Meer over je rechten:{" "}
            <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
              privacyverklaring
            </Link>
          </span>
        </span>
      }
    >
      <DataDeletionRequestForm />
      <div className="mt-8 space-y-2 border-t border-hair pt-6 text-xs leading-relaxed text-neutralx-500">
        <p>
          <strong className="text-neutralx-700">Hoe het werkt:</strong> je krijgt een bevestigingsmail op het adres van je account. Pas als je
          daarop antwoordt, verwijderen we de gekozen gegevens — binnen één maand, zoals de AVG voorschrijft.
        </p>
        <p>
          <strong className="text-neutralx-700">Wat we moeten bewaren:</strong> facturen, loon- en belastinggegevens, je KVK- of btw-nummer en je
          bankrekeningnummer bewaren we zolang de wet dat verplicht (meestal 7 jaar). Al het andere verwijderen we op verzoek.
        </p>
      </div>
    </AuthShell>
  );
}
