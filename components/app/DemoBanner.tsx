import Link from "next/link";
import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { VIEW_AS_COOKIE } from "@/lib/auth/inspect";
import { VOORBEELD_UITGANG } from "@/lib/auth/demo-sessie";
import { DEMO_BANNER_TEKST, DEMO_BANNER_SLUITEN } from "./demo-banner-texts";

/**
 * Server: een balk bovenaan het dashboard als iemand via /voorbeeld in een
 * voorbeeld-sessie (read-only inspect) het echte dashboard bekijkt. Zo weet de
 * bezoeker dat het een demo is en krijgt die een knop om echt een account te maken.
 * De admin-"Bekijk als" heeft zijn eigen balk (ViewAsBanner); die slaan we hier over.
 * Voor een gewone, ingelogde gebruiker (geen inspect) toont dit niets.
 */
export async function DemoBanner({ href, knop }: { href: string; knop: string }) {
  const cs = await cookies();
  if (cs.get(VIEW_AS_COOKIE)?.value) return null;
  const raw = cs.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const claims = await decodeSession(raw);
  if (!claims?.inspect) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-600 px-4 py-2 text-center text-sm text-white">
      <span className="font-medium">{DEMO_BANNER_TEKST}</span>
      {/* op een telefoon minstens 44 px hoog (23 nov 2026: 24 en 16 px); vanaf 640 px de balk zoals hij was */}
      <Link
        href={href}
        className="inline-flex min-h-[44px] items-center rounded-full bg-brand-mint px-4 py-1 text-xs font-bold text-ink transition hover:brightness-105 sm:min-h-0 sm:px-3"
      >
        {knop}
      </Link>
      <Link
        href={VOORBEELD_UITGANG}
        className="inline-flex min-h-[44px] items-center px-2 text-xs font-semibold text-white/90 underline underline-offset-2 hover:text-white sm:min-h-0 sm:px-0"
      >
        {DEMO_BANNER_SLUITEN}
      </Link>
    </div>
  );
}
