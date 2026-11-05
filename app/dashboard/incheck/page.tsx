import { Suspense } from "react";
import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { IncheckOpLocatie } from "@/components/app/IncheckOpLocatie";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";

// Inchecken bij een terminal of NFC-sticker op de werkplek (lib/incheck). De QR
// op het scherm en de sticker sturen hierheen met ?t=<code> (zekerflex.com/i/<code>).
export default async function IncheckPage() {
  await requirePrincipal();
  const t = (await getFreelancerDict()).incheck;
  return (
    <>
      <BackLink fallbackHref="/dashboard/klussen" label={t.back} />
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.title}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-brand-500/40" />
      </div>
      <Suspense fallback={<p className="text-sm text-neutralx-500">{t.loading}</p>}>
        <IncheckOpLocatie />
      </Suspense>
    </>
  );
}
