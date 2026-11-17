import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { inAndroidApp } from "@/lib/app-mode-server";
import { mijnIntroducties } from "@/lib/introducties/opslag";
import { PageHeader } from "@/components/app/ui";
import { IntroductieFormulier } from "@/components/introductie/IntroductieFormulier";

export const dynamic = "force-dynamic";

// "Introduceer een bedrijf" in de werkgeversapp (17 nov 2026, lib/introducties/regels.ts), onder Instellingen → Account.
// Nederlands of Engels, zoals de rest van /werkgever. In de app zonder de beloning (lib/app-mode.ts), net als bij werkers.
export default async function WerkgeverIntroducerenPage() {
  const principal = await requirePrincipal();
  const [d, inApp, lijst] = await Promise.all([getDict(), inAndroidApp(), mijnIntroducties(principal.userId).catch(() => [])]);
  const t = d.introductie;

  return (
    <>
      <Link href="/werkgever/instellingen" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← {d.shell.settings}
      </Link>
      <PageHeader title={t.titel} subtitle={t.uitleg} />
      <div className="max-w-2xl">
        <IntroductieFormulier rol="werkgever" inApp={inApp} initieel={lijst} texts={t} />
      </div>
    </>
  );
}
