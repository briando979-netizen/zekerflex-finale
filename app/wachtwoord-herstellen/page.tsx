import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { isResetTokenValid } from "@/lib/auth/password-reset";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuw wachtwoord instellen" };

export default async function WachtwoordHerstellenPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const valid = token ? await isResetTokenValid(token) : false;

  return (
    <AuthShell
      title={valid ? "Nieuw wachtwoord instellen" : "Link werkt niet meer"}
      subtitle={
        valid
          ? "Kies een wachtwoord van minstens 8 tekens."
          : "Deze herstellink is verlopen of al gebruikt."
      }
      footer={
        valid ? (
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            ← Terug naar inloggen
          </Link>
        ) : (
          <Link href="/wachtwoord-vergeten" className="font-semibold text-brand-600 hover:underline">
            Vraag een nieuwe link aan
          </Link>
        )
      }
    >
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-neutralx-600">
          Herstellinks zijn één uur geldig en werken maar één keer. Vraag een nieuwe aan om verder te gaan.
        </p>
      )}
    </AuthShell>
  );
}
