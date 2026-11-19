import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { BASE, PAKKETTEN, beeld } from "@/lib/voorstel/smileyapp";
import { WACHTWOORD_MIN, isUitnodigingToken } from "@/lib/voorstel/smileyapp-account-regels";
import { bekijkUitnodiging, toegang } from "@/lib/voorstel/smileyapp-accounts";
import { VOORSTEL_HEADER } from "@/lib/voorstel/subdomein";
import { Inlogkaart, WachtwoordKiezen } from "@/components/voorstel/smileyapp/beheer/Inloggen";
import { SmileyBeheer } from "@/components/voorstel/smileyapp/beheer/SmileyBeheer";

export const dynamic = "force-dynamic";
// no-referrer: de uitnodigingslink (met het token) lekt niet mee naar een volgende pagina
export const metadata: Metadata = { title: "Beheer", referrer: "no-referrer" };

// Het beheer van SmileyApp (19 nov 2026), zonder de omlijsting van de site (zie
// AlleenOpSite in de layout). Toegang: een SmileyApp-account (Martijn en wie hij
// uitnodigt), of een ZekerFlex-platformbeheerder (het vangnet op zekerflex.com:
// die nodigt Martijn als eerste beheerder uit). Zonder sessie staat hier de
// inlogkaart, of met ?uitnodiging=<token> de kaart om een wachtwoord te kiezen.
// Het token wordt hier op de server gecontroleerd en komt in geen enkele log.
export default async function SmileyappBeheerPage({ searchParams }: { searchParams: Promise<{ uitnodiging?: string | string[] }> }) {
  const q = (await searchParams).uitnodiging;
  const token = Array.isArray(q) ? q[0] : q;
  const [wie, kop, uitnodiging] = await Promise.all([toegang(), headers(), isUitnodigingToken(token) ? bekijkUitnodiging(token) : null]);
  const subdomein = kop.get(VOORSTEL_HEADER) !== null;
  const linkKapot = token !== undefined && !uitnodiging;

  // één kop voor de hele pagina (de schermen eronder beginnen bij h2); een geldige uitnodiging gaat voor een bestaande sessie
  const kopje = <h1 className="sr-only">Beheer van Smileyapp</h1>;

  if (wie && !uitnodiging) {
    return (
      <>
        {kopje}
        <SmileyBeheer wie={wie.naam} via={wie.via} vandaag={amsterdamDayKey(new Date())} pakketNamen={Object.fromEntries(PAKKETTEN.map((p) => [p.id, p.naam]))} />
      </>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-smiley-ink px-4 py-12">
      <div className="w-full max-w-md">
        <Link href={BASE} aria-label="Naar de website van Smileyapp" className="mx-auto block w-fit">
          <Image src={beeld("logo.webp")} alt="" width={500} height={260} priority className="h-20 w-auto" />
        </Link>
        <div className="mt-6 rounded-[2rem] bg-white p-6 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] sm:p-8">
          {kopje}
          {uitnodiging && isUitnodigingToken(token) ? (
            <>
              <h2 className="font-display text-2xl font-bold text-smiley-ink">Kies een wachtwoord</h2>
              <p className="mt-2 leading-relaxed text-smiley-mute">
                Welkom, {uitnodiging.naam}. Je logt straks in met <strong className="break-all text-smiley-ink">{uitnodiging.email}</strong> en het wachtwoord dat je hier kiest.
              </p>
              <WachtwoordKiezen token={token} email={uitnodiging.email} minimaal={WACHTWOORD_MIN} />
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-smiley-ink">Inloggen in het beheer</h2>
              {linkKapot ? (
                <p role="alert" className="mt-4 rounded-2xl bg-smiley-sun/40 p-4 text-sm font-semibold leading-relaxed text-smiley-ink">
                  Deze link werkt niet meer, vraag een nieuwe uitnodiging. Heb je al een wachtwoord gekozen, dan kun je hieronder inloggen.
                </p>
              ) : (
                <p className="mt-2 text-smiley-mute">Voor het team van SmileyApp.</p>
              )}
              <Inlogkaart />
            </>
          )}
        </div>
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          {!subdomein && (
            // gewone link (volledige paginalading): de ZekerFlex-login heeft een andere omgeving en CSP
            <a href={`/login?callbackUrl=${encodeURIComponent(`${BASE}/beheer`)}`} className="font-semibold text-white/80 underline underline-offset-4 hover:text-white">
              Inloggen als ZekerFlex-beheerder
            </a>
          )}
          <Link href={BASE} className="font-semibold text-white/80 underline underline-offset-4 hover:text-white">
            Naar de website
          </Link>
        </div>
      </div>
    </div>
  );
}
