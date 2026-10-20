import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmVerificationToken, currentVerification } from "@/lib/auth/email-verify";
import { smtpConfigured } from "@/lib/mail";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_DICTS, fill } from "@/lib/i18n/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "E-mailadres bevestigen" };

export default async function VerifieerEmailPage(
  props: {
    searchParams: Promise<{ token?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const locale = await getLocale();
  const t = AUTH_DICTS[locale].verify;
  // Token in the URL: confirm and route on.
  if (searchParams.token) {
    const result = await confirmVerificationToken(searchParams.token);
    if (result.ok) redirect("/start");
    return (
      <AuthShell
        locale={locale}
        title={t.badLink}
        subtitle={result.reason ?? t.badLink}
        footer={
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            {t.backToLogin}
          </Link>
        }
      >
        <p className="text-sm text-neutralx-600">{t.badLinkBody}</p>
      </AuthShell>
    );
  }

  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (user?.emailVerifiedAt) redirect("/start");

  // When there's no real SMTP yet, surface the code + link here so verification
  // never blocks. With SMTP configured the mail actually arrives and we hide it.
  const local = smtpConfigured() ? null : await currentVerification(principal.userId);

  return (
    <AuthShell
      locale={locale}
      title={t.title}
      subtitle={fill(t.subtitle, { email: user?.email ?? "" })}
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          {t.backToLogin}
        </Link>
      }
    >
      <ResendVerification locale={locale} devLink={local?.link ?? null} devCode={local?.code ?? null} />
    </AuthShell>
  );
}
