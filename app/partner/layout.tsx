import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

// Het partnerdashboard (/partner) voor sales partners (lib/sales-partners): een eigen, eenvoudige omgeving naast de
// werkers-app en het werkgeversdeel. Wie geen partner is, ziet op de pagina zelf een uitleg (geen 403).
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/partner");

  return (
    <div className="min-h-screen bg-paper-soft">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-lg focus-visible:bg-brand-600 focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-white focus-visible:shadow-lg"
      >
        Naar hoofdinhoud
      </a>
      <header className="border-b border-hair bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <Link href="/partner" className="font-display text-lg font-bold text-ink">
            ZekerFlex <span className="text-brand-600">Partner</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-neutralx-400 sm:inline">{principal.fullName}</span>
            <Link href="/start" className="flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-neutralx-600 hover:text-ink">
              Naar de app
            </Link>
            <form action={logoutAction}>
              <button className="min-h-11 rounded-lg border border-hairstrong px-4 text-xs font-semibold text-neutralx-600 hover:text-crit">Uitloggen</button>
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
