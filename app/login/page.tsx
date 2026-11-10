import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { opPasskeyHost, passkeyBron } from "@/lib/auth/passkey/omgeving";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { inAndroidApp, inIosApp } from "@/lib/app-mode-server";
import { WELKOM_DICTS } from "@/lib/i18n/welkom";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inloggen" };

function safePath(raw: string | undefined): string {
  if (!raw) return "/start";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("\\")) return raw;
  return "/start";
}

export default async function LoginPage(
  props: {
    searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  // niet in de iPhone-app: Apple eist dan ook "inloggen met Apple" (App Store 4.8, lib/app-mode.ts)
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) && !(await inIosApp());
  // passkeys alleen op de vaste host uit APP_BASE_URL (niet op sslip-/voorbeeldadressen)
  const bron = passkeyBron(env.APP_BASE_URL);
  const passkeyEnabled = bron !== null && opPasskeyHost(await headers(), bron);
  const locale = await getLocale();
  const t = AUTH_DICTS[locale].login;

  return (
    <AuthShell
      image="/marketing/auth-login.jpg"
      locale={locale}
      mobile={{ ...WELKOM_DICTS[locale].loginHero, back: WELKOM_DICTS[locale].back, backHref: (await inAndroidApp()) ? "/welkom" : "/" }}
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
        passkeyEnabled={passkeyEnabled}
        {...(searchParams.error ? { errorCode: searchParams.error } : {})}
        {...(searchParams.reset ? { justReset: true } : {})}
      />
    </AuthShell>
  );
}
