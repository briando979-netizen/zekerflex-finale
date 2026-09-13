import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account aanmaken" };

export default async function RegisterPage(
  props: {
    searchParams: Promise<{ type?: string; company?: string; kvk?: string; email?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const defaultType = searchParams.type === "bedrijf" ? "bedrijf" : "freelancer";
  const defaultWorkerKind =
    searchParams.type === "uitzendkracht" || searchParams.type === "zzp" || searchParams.type === "flexwerker"
      ? searchParams.type
      : undefined;
  const prefill =
    searchParams.company || searchParams.kvk || searchParams.email
      ? {
          ...(searchParams.company ? { company: searchParams.company } : {}),
          ...(searchParams.kvk && /^\d{8}$/.test(searchParams.kvk) ? { kvk: searchParams.kvk } : {}),
          ...(searchParams.email ? { email: searchParams.email } : {}),
        }
      : undefined;
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
      <RegisterForm
        defaultType={defaultType}
        {...(defaultWorkerKind ? { defaultWorkerKind } : {})}
        {...(prefill ? { prefill } : {})}
        googleEnabled={googleEnabled}
      />
    </AuthShell>
  );
}
