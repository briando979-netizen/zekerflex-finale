import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { appleConfig } from "@/lib/auth/apple";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { RegisterBewaard } from "@/components/auth/RegisterBewaard";
import { getLocale } from "@/lib/i18n/server";
import { AUTH } from "@/lib/i18n/auth";
import { inIosApp } from "@/lib/app-mode-server";
import { WELKOM_DICTS } from "@/lib/i18n/welkom";
import { welkomTerug } from "@/lib/welkom/terug";
import { AANMELDEN_PER_DASHBOARD, dashboardUitParam } from "@/lib/auth/aanmelden-dashboard";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { isMachineLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";
// Niet in Google (22 nov 2026): elke knop "Aanmelden" linkt met een eigen ?type=, en een voorstel of uitnodiging zet er ook
// een naam, e-mailadres of bedrijf in (?name=, ?email=, ?company=). Zonder canonical telde Search Console die als dubbele
// pagina's, en zulke adressen horen niet in een zoekmachine. De links op de pagina mag Google wel volgen.
export const metadata: Metadata = { title: "Account aanmaken", robots: { index: false, follow: true } };

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
  const t = (await AUTH.laad(locale)).register;
  // vlag `publiek-alleen-flexwerk`: dan bij het aanmelden geen productkeuze (webshop, website, horeca, rijschool), alleen personeel
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);

  return (
    <AuthShell
      image="/marketing/auth-login-2.jpg"
      locale={locale}
      mobile={{
        ...WELKOM_DICTS[locale].registerHero,
        // "Gratis voor werkers." hoort niet boven de aanmelding van een bedrijf (22 nov 2026): dan de gewone ondertitel
        ...(defaultType === "bedrijf" ? { subtitle: t.subtitle } : {}),
        // de productpagina's zijn Nederlands, hun aanmelding dus ook
        ...(product ? { title: product.titel, subtitle: product.uitleg } : {}),
        back: WELKOM_DICTS[locale].back,
        backHref: await welkomTerug(),
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
        {...(isMachineLocale(locale) ? { authVooraf: await AUTH.laad(locale) } : {})}
        defaultType={defaultType}
        {...(defaultWorkerKind ? { defaultWorkerKind } : {})}
        {...(prefill ? { prefill } : {})}
        {...(dashboard ? { defaultDashboard: dashboard } : {})}
        googleEnabled={googleEnabled}
        appleEnabled={appleEnabled}
        alleenFlexwerk={alleenFlexwerk}
      />
    </AuthShell>
  );
}
