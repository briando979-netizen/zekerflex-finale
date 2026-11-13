import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getPrincipal } from "@/lib/auth";
import { doorsturenAlsIngelogd } from "@/lib/auth/al-ingelogd";
import { recordServerEvent } from "@/lib/analytics/track";
import { appleConfig } from "@/lib/auth/apple";
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
  // Al ingelogd (terugknop, "Inloggen" in de kop, de knop in een mail): door naar het doel in plaats van het
  // formulier, dat iemand laat denken dat hij uitgelogd is (lib/auth/al-ingelogd.ts). Alleen een telling, zonder gebruiker.
  const doel = doorsturenAlsIngelogd((await getPrincipal()) !== null, searchParams);
  if (doel) {
    if (!(await headers()).has("next-router-prefetch")) void recordServerEvent({ path: "/login", label: "al-ingelogd" });
    redirect(doel);
  }
  const appleEnabled = appleConfig() !== null;
  // Niet in de iPhone-app: Google weigert inloggen in een ingebouwde webview (WKWebView,
  // "disallowed_useragent"). Apple werkt daar wel en is dan de enige aanbieder (App Store 4.8).
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
        appleEnabled={appleEnabled}
        passkeyEnabled={passkeyEnabled}
        {...(searchParams.error ? { errorCode: searchParams.error } : {})}
        {...(searchParams.reset ? { justReset: true } : {})}
      />
    </AuthShell>
  );
}
