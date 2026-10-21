import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getFiscal } from "@/lib/fiscal/store";
import { getFreelancerDict } from "@/lib/i18n/server";

/**
 * Shown across the freelancer dashboard while a changed rekeningnummer is not
 * yet confirmed (payouts are on hold until then — lib/compliance/documents.ts
 * flagIbanChanged). Not on the verification page itself.
 */
export async function IbanHoldBanner({ userId }: { userId: string }) {
  const path = (await headers()).get("x-pathname") ?? "";
  if (path.startsWith("/dashboard/verificatie")) return null;
  const [fp, fiscal] = await Promise.all([
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { payoutIbanPendingVerification: true } }),
    getFiscal(userId).catch(() => null),
  ]);
  if (!fp?.payoutIbanPendingVerification && !fiscal?.ibanPendingVerification) return null;
  const D = (await getFreelancerDict()).detail;
  return (
    <div className="mx-auto mt-3 max-w-2xl px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
        <span className="min-w-0 flex-1">
          <strong className="block text-ink">{D.ibanHoldTitle}</strong>
          <span className="text-neutralx-700">{D.ibanHoldBody}</span>
        </span>
        <Link href="/dashboard/verificatie" className="btn-primary px-4 py-2 text-sm">
          {D.ibanHoldCta}
        </Link>
      </div>
    </div>
  );
}
