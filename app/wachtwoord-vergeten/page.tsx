import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wachtwoord vergeten" };

export default function WachtwoordVergetenPage() {
  return (
    <AuthShell
      title="Wachtwoord vergeten?"
      subtitle="Vul je e-mailadres in, dan sturen we je een link om een nieuw wachtwoord in te stellen."
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          ← Terug naar inloggen
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
