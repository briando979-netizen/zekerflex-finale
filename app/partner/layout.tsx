import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { getLocale } from "@/lib/i18n/server";
import { AuthLanguage } from "@/components/auth/AuthLanguage";
import { PARTNER_TEKSTEN, partnerTaal } from "@/lib/sales-partners/teksten";

export const dynamic = "force-dynamic";

// Het partnerdashboard (/partner) voor sales partners (lib/sales-partners): een eigen, eenvoudige omgeving naast de
// werkers-app en het werkgeversdeel. Wie geen partner is, ziet op de pagina zelf een uitleg (geen 403). Nederlands of
// Engels: de taalknop zet hetzelfde cookie als de rest van de app (lib/sales-partners/teksten.ts).
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/partner");
  const locale = await getLocale();
  const tx = PARTNER_TEKSTEN[partnerTaal(locale)];

  return (
    <div className="min-h-screen bg-paper-soft">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-lg focus-visible:bg-brand-600 focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-white focus-visible:shadow-lg"
      >
        {tx.skipLink}
      </a>
      <header className="border-b border-hair bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:py-4">
          <Link href="/partner" className="font-display text-lg font-bold text-ink">
            ZekerFlex <span className="text-brand-600">Partner</span>
          </Link>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <span className="hidden text-neutralx-400 sm:inline">{principal.fullName}</span>
            <AuthLanguage locale={locale} label={tx.taal} />
            <Link href="/start" className="flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-neutralx-600 hover:text-ink sm:px-3">
              {tx.naarApp}
            </Link>
            <form action={logoutAction}>
              <button className="min-h-11 rounded-lg border border-hairstrong px-3 text-xs font-semibold text-neutralx-600 hover:text-crit sm:px-4">{tx.uitloggen}</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
