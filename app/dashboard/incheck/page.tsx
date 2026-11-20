import { Suspense } from "react";
import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { IncheckOpLocatie } from "@/components/app/IncheckOpLocatie";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/ui";

export const dynamic = "force-dynamic";

// Inchecken bij een terminal of NFC-sticker op de werkplek (lib/incheck). De QR
// op het scherm en de sticker sturen hierheen met ?t=<code> (zekerflex.com/i/<code>).
export default async function IncheckPage() {
  await requirePrincipal();
  const t = (await getFreelancerDict()).incheck;
  return (
    <>
      <BackLink fallbackHref="/dashboard/klussen" label={t.back} />
      <PageHeader title={t.title} />
      <Suspense fallback={<p className="text-sm text-neutralx-500">{t.loading}</p>}>
        <IncheckOpLocatie />
      </Suspense>
    </>
  );
}
