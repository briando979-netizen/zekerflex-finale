import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inloggen" };

function safePath(raw: string | undefined): string {
  if (!raw) return "/start";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/start";
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string; reset?: string };
}) {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthShell
      image="/marketing/auth-login.jpg"
      title="Welkom bij ZekerFlex"
      subtitle="Vul je gegevens in."
      footer={
        <>
          Nog geen account?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline">
            Aanmaken
          </Link>
        </>
      }
    >
      <LoginForm
        callbackUrl={safePath(searchParams.callbackUrl)}
        googleEnabled={googleEnabled}
        {...(searchParams.error ? { errorCode: searchParams.error } : {})}
        {...(searchParams.reset ? { justReset: true } : {})}
      />
    </AuthShell>
  );
}
