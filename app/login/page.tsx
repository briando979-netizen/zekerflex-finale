import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_DICTS } from "@/lib/i18n/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inloggen" };

function safePath(raw: string | undefined): string {
  if (!raw) return "/start";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/start";
}

export default async function LoginPage(
  props: {
    searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const locale = await getLocale();
  const t = AUTH_DICTS[locale].login;

  return (
    <AuthShell
      image="/marketing/auth-login.jpg"
      locale={locale}
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <>
          {t.noAccount}{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline">
            {t.create}
          </Link>
        </>
      }
    >
      <LoginForm
        locale={locale}
        callbackUrl={safePath(searchParams.callbackUrl)}
        googleEnabled={googleEnabled}
        {...(searchParams.error ? { errorCode: searchParams.error } : {})}
        {...(searchParams.reset ? { justReset: true } : {})}
      />
    </AuthShell>
  );
}
