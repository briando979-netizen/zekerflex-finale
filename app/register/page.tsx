import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_DICTS } from "@/lib/i18n/auth";

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
  const locale = await getLocale();
  const t = AUTH_DICTS[locale].register;

  return (
    <AuthShell
      image="/marketing/auth-login.jpg"
      locale={locale}
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <>
          {t.haveAccount}{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            {t.login}
          </Link>
        </>
      }
    >
      <RegisterForm
        locale={locale}
        defaultType={defaultType}
        {...(defaultWorkerKind ? { defaultWorkerKind } : {})}
        {...(prefill ? { prefill } : {})}
        googleEnabled={googleEnabled}
      />
    </AuthShell>
  );
}
