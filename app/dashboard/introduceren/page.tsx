import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { inAndroidApp } from "@/lib/app-mode-server";
import { mijnIntroducties } from "@/lib/introducties/opslag";
import { IntroductieFormulier } from "@/components/introductie/IntroductieFormulier";

export const dynamic = "force-dynamic";

// "Introduceer een bedrijf" in de werkersapp (17 nov 2026, lib/introducties/regels.ts), onder Account. In de taal van de
// werker. In de Android- en iPhone-app (zelfde app-cookie) zonder de beloning: die geeft de app een 18+-keuring en werkers
// kunnen 16 of 17 zijn (lib/app-mode.ts). Het voorstellen zelf en de twee weken zonder platformkosten staan er wel.
export default async function IntroducerenPage() {
  const principal = await requirePrincipal();
  const [ft, inApp, lijst] = await Promise.all([getFreelancerDict(), inAndroidApp(), mijnIntroducties(principal.userId).catch(() => [])]);
  const t = ft.introductie;

  return (
    <>
      <div className="mb-5">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← {ft.nav.account}
        </Link>
      </div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.titel}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 text-sm text-neutralx-500">{t.uitleg}</p>
      </div>
      <IntroductieFormulier rol="werker" inApp={inApp} initieel={lijst} texts={t} />
    </>
  );
}
