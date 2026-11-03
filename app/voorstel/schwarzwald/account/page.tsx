import type { Metadata } from "next";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ACTIVITEITEN } from "@/lib/voorstel/schwarzwald";
import { AGENDA } from "@/lib/voorstel/schwarzwald-agenda";
import { huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { boekingenVanAccount } from "@/lib/voorstel/schwarzwald-boekingen";
import { aanvragenVan, klantkaart, tijdlijn } from "@/lib/voorstel/schwarzwald-crm";
import { googleAan } from "@/lib/voorstel/google";
import { reviewsVan } from "@/lib/voorstel/schwarzwald-reviews";
import { icsAdres, icsToken } from "@/lib/voorstel/schwarzwald-ics";
import { SchwarzwaldAccount } from "@/components/voorstel/SchwarzwaldAccount";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mijn account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, account] = await Promise.all([searchParams, huidigAccount()]);
  const [boekingen, aanvragen, lijn, kaart, reviews] = account
    ? await Promise.all([boekingenVanAccount(account.email), aanvragenVan(account.email), tijdlijn(account.email), klantkaart(account.email), reviewsVan(account.email)])
    : [[], [], [], null, []];

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-12 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">{account ? "Mijn account" : "Inloggen"}</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{account ? `Hoi ${account.naam.split(" ")[0]}!` : "Welkom terug"}</h1>
          <p className="mt-3 max-w-xl text-schw-cream/80">
            {account ? "Je uitjes, aanvragen, berichten en wensen op één plek." : "Log in of maak een account om je reserveringen terug te zien en zelf te regelen."}
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8">
        <SchwarzwaldAccount
          account={account ? { email: account.email, naam: account.naam, telefoon: account.telefoon, rol: account.rol, google: !!account.google, heeftWachtwoord: account.heeftWachtwoord } : null}
          boekingen={boekingen.map(({ id, activiteit, datum, tijd, personen, status }) => ({ id, activiteit, datum, tijd, personen, status, ics: icsAdres(icsToken({ datum, id })) }))}
          aanvragen={aanvragen.map(({ id, programma, gelegenheid, datum, personen, status, aangemaakt, bedrag }) => ({ id, programma, gelegenheid, datum, personen, status, aangemaakt, bedrag }))}
          berichten={lijn
            .filter((i) => i.soort === "bericht-klant" || i.soort === "bericht-team")
            .map((i) => ({ id: i.id, soort: i.soort as "bericht-klant" | "bericht-team", tekst: i.tekst, door: i.door, datum: i.datum }))}
          wensen={kaart?.wensen ?? ""}
          namen={Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam]))}
          duur={Object.fromEntries(Object.entries(AGENDA).map(([slug, r]) => [slug, r.duurMin]))}
          suggesties={ACTIVITEITEN.map((a) => ({ slug: a.slug, naam: a.naam, kort: a.kort, foto: a.foto, duurMin: AGENDA[a.slug]?.duurMin ?? 60 }))}
          reviews={reviews.map(({ id, boekingId, score, tekst, status, antwoord }) => ({ id, boekingId, score, tekst, status, antwoord }))}
          vandaag={amsterdamDayKey(new Date())}
          googleAan={googleAan()}
          fout={typeof sp.fout === "string" ? sp.fout : ""}
        />
      </section>
    </>
  );
}
