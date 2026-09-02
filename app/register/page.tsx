import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account aanmaken" };

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const defaultType = searchParams.type === "bedrijf" ? "bedrijf" : "freelancer";
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthShell
      image="/marketing/auth-login.jpg"
      title="Maak je account aan"
      subtitle="Vul je gegevens in."
      footer={
        <>
          Heb je al een account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            Inloggen
          </Link>
        </>
      }
    >
      <RegisterForm defaultType={defaultType} googleEnabled={googleEnabled} />
    </AuthShell>
  );
}
