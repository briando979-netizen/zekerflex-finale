import type { Metadata } from "next";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ACTIVITEITEN } from "@/lib/voorstel/schwarzwald";
import { huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { boekingenVanAccount } from "@/lib/voorstel/schwarzwald-boekingen";
import { SchwarzwaldAccount } from "@/components/voorstel/SchwarzwaldAccount";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mijn account" };

export default async function AccountPage() {
  const account = await huidigAccount();
  const boekingen = account ? await boekingenVanAccount(account.email) : [];

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-12 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">{account ? "Mijn account" : "Inloggen"}</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {account ? `Hoi ${account.naam.split(" ")[0]}!` : "Welkom terug"}
          </h1>
          <p className="mt-3 max-w-xl text-schw-cream/80">
            {account ? "Je reserveringen en gegevens op één plek." : "Log in of maak een account om je reserveringen terug te zien en zelf te annuleren."}
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8">
        <SchwarzwaldAccount
          account={account ? { email: account.email, naam: account.naam, telefoon: account.telefoon, rol: account.rol } : null}
          boekingen={boekingen.map(({ id, activiteit, datum, tijd, personen, status }) => ({ id, activiteit, datum, tijd, personen, status }))}
          namen={Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam]))}
          vandaag={amsterdamDayKey(new Date())}
        />
      </section>
    </>
  );
}
