import Link from "next/link";
import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { VIEW_AS_COOKIE } from "@/lib/auth/inspect";
import { DEMO_BANNER_TEKST } from "./demo-banner-texts";

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
      <Link
        href={href}
        className="rounded-full bg-brand-mint px-3 py-1 text-xs font-bold text-ink transition hover:brightness-105"
      >
        {knop}
      </Link>
    </div>
  );
}
