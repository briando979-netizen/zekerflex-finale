import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmVerificationToken, currentVerification } from "@/lib/auth/email-verify";
import { smtpConfigured } from "@/lib/mail";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResendVerification } from "@/components/auth/ResendVerification";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "E-mailadres bevestigen" };

export default async function VerifieerEmailPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  // Token in the URL: confirm and route on.
  if (searchParams.token) {
    const result = await confirmVerificationToken(searchParams.token);
    if (result.ok) redirect("/start");
    return (
      <AuthShell
        title="Link niet geldig"
        subtitle={result.reason ?? "Deze verificatielink werkt niet meer."}
        footer={
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            Naar inloggen
          </Link>
        }
      >
        <p className="text-sm text-neutralx-600">
          Log in en vraag een nieuwe verificatielink aan.
        </p>
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
      title="Bevestig je e-mailadres"
      subtitle={`We hebben een code en link gestuurd naar ${user?.email ?? "je e-mailadres"}. Voer de code in of klik de link om je account te activeren.`}
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Terug naar inloggen
        </Link>
      }
    >
      <ResendVerification devLink={local?.link ?? null} devCode={local?.code ?? null} />
    </AuthShell>
  );
}
