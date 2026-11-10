import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { appleConfig } from "@/lib/auth/apple";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { RegisterBewaard } from "@/components/auth/RegisterBewaard";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { inAndroidApp, inIosApp } from "@/lib/app-mode-server";
import { WELKOM_DICTS } from "@/lib/i18n/welkom";
import { AANMELDEN_PER_DASHBOARD, dashboardUitParam } from "@/lib/auth/aanmelden-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account aanmaken" };

export default async function RegisterPage(
  props: {
    searchParams: Promise<{ type?: string; company?: string; kvk?: string; email?: string; name?: string; dashboard?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  // Aanmelden voor één product (/aanbod/webshop, …): altijd als bedrijf, met dat dashboard al gekozen.
  const dashboard = dashboardUitParam(searchParams.dashboard);
  const product = dashboard ? AANMELDEN_PER_DASHBOARD[dashboard] : null;
  const defaultType = searchParams.type === "bedrijf" || dashboard ? "bedrijf" : "freelancer";
  const defaultWorkerKind =
    searchParams.type === "uitzendkracht" || searchParams.type === "zzp" || searchParams.type === "flexwerker"
      ? searchParams.type
      : undefined;
  // the person's own name, e.g. from the "ja" on a website proposal (components/websitevoorstel/ProposalClient.tsx)
  const name = typeof searchParams.name === "string" ? searchParams.name.trim().slice(0, 100) : "";
  const prefill =
    searchParams.company || searchParams.kvk || searchParams.email || name
      ? {
          ...(searchParams.company ? { company: searchParams.company } : {}),
          ...(searchParams.kvk && /^\d{8}$/.test(searchParams.kvk) ? { kvk: searchParams.kvk } : {}),
          ...(searchParams.email ? { email: searchParams.email } : {}),
          ...(name ? { name } : {}),
        }
      : undefined;
  const appleEnabled = appleConfig() !== null;
  // Niet in de iPhone-app: Google weigert inloggen in een ingebouwde webview (WKWebView,
  // "disallowed_useragent"). Apple werkt daar wel en is dan de enige aanbieder (App Store 4.8).
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) && !(await inIosApp());
  const locale = await getLocale();
  const t = AUTH_DICTS[locale].register;

  return (
    <AuthShell
      image="/marketing/auth-login.jpg"
      locale={locale}
      mobile={{
        ...WELKOM_DICTS[locale].registerHero,
        // de productpagina's zijn Nederlands, hun aanmelding dus ook
        ...(product ? { title: product.titel, subtitle: product.uitleg } : {}),
        back: WELKOM_DICTS[locale].back,
        backHref: (await inAndroidApp()) ? "/welkom" : "/",
      }}
      title={product?.titel ?? t.title}
      subtitle={product?.uitleg ?? t.subtitle}
      footer={
        <>
          {t.haveAccount}{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            {t.login}
          </Link>
        </>
      }
    >
      <RegisterBewaard type={defaultType} klusText={t.savedKlus} reagerenText={t.savedReageren} />
      <RegisterForm
        locale={locale}
        defaultType={defaultType}
        {...(defaultWorkerKind ? { defaultWorkerKind } : {})}
        {...(prefill ? { prefill } : {})}
        {...(dashboard ? { defaultDashboard: dashboard } : {})}
        googleEnabled={googleEnabled}
        appleEnabled={appleEnabled}
      />
    </AuthShell>
  );
}
