import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if (!hasRole(principal, "SALES", "PLATFORM_ADMIN")) redirect("/start");

  return (
    <div className="min-h-screen bg-paper-soft">
      <header className="border-b border-hair bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/sales" className="font-display text-lg font-bold text-ink">
              ZekerFlex <span className="text-brand-600">Sales</span>
            </Link>
            <nav className="hidden gap-4 text-sm font-medium text-neutralx-500 sm:flex">
              <Link href="/sales" className="hover:text-ink">Bezoeken</Link>
              <Link href="/uitleg" target="_blank" className="hover:text-ink">Uitlegfilmpjes</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-neutralx-400 sm:inline">{principal.fullName}</span>
            <form action={logoutAction}>
              <button className="rounded-lg border border-hairstrong px-3 py-1.5 text-xs font-semibold text-neutralx-600 hover:text-crit">
                Uitloggen
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
