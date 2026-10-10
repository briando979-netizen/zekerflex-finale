import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { AccountDeletionRequestForm } from "@/components/auth/AccountDeletionRequestForm";
import { ErasureScopeInfo } from "@/components/privacy/ErasureScopeInfo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account verwijderen",
  description: "Vraag het verwijderen van je ZekerFlex-account en persoonsgegevens aan.",
};

// Public, no-login page — this is the web resource Google Play requires apps
// that support account creation to publish: a reachable URL, outside the app,
// that explains the deletion process and lets someone start it without being
// able to log in. Confirmed by a mailed one-time link (lib/privacy/deletion-request.ts),
// same proof-of-ownership pattern as /wachtwoord-vergeten.
export default function AccountVerwijderenPage() {
  return (
    <AuthShell
      title="Account verwijderen"
      subtitle="Vul het e-mailadres van je ZekerFlex-account in. We sturen een bevestigingslink; pas na bevestigen wordt er iets verwijderd."
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          ← Terug naar inloggen
        </Link>
      }
    >
      <AccountDeletionRequestForm />
      <div className="mt-8 border-t border-hair pt-6">
        <ErasureScopeInfo />
      </div>
    </AuthShell>
  );
}
