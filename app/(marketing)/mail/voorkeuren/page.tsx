import type { Metadata } from "next";
import Link from "next/link";
import { findByToken, mailPrefsView } from "@/lib/mail/prefs";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "E-mailvoorkeuren", robots: { index: false } };

export default async function MailVoorkeurenPage({
  searchParams,
}: {
  searchParams: { token?: string; done?: string };
}) {
  const token = searchParams.token ?? "";
  const rec = token ? await findByToken(token) : null;
  const view = rec ? await mailPrefsView(rec.email) : null;

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">E-mail</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight md:text-4xl">
            {view ? "Je e-mailvoorkeuren" : "Deze link werkt niet meer"}
          </h1>
          {view && (
            <p className="mt-4 max-w-xl text-white/70">
              Voor <strong className="text-white">{rec!.email}</strong>. Kies welke optionele e-mail je van
              ZekerFlex wilt ontvangen. Wijzigingen worden direct opgeslagen.
            </p>
          )}
        </div>
      </div>

      <section className="bg-paper">
        <div className="shell max-w-2xl py-14 md:py-16">
          {view ? (
            <>
              {searchParams.done && (
                <p className="mb-6 rounded-xl border border-brand-mint/30 bg-mintwash px-4 py-3 text-sm text-brand-700">
                  Je bent afgemeld. Hieronder kun je losse categorieën weer aanzetten.
                </p>
              )}
              <MailPrefsToggles
                token={view.token}
                initialCategories={view.categories}
                initialUnsubscribedAll={view.unsubscribedAll}
              />
              <p className="mt-8 text-sm text-neutralx-500">
                Belangrijke e-mail — verificatie, wachtwoordherstel, facturen, loonstroken en juridische
                kennisgevingen — kun je hier niet uitzetten. Die zijn nodig om je account en betalingen te laten
                werken.
              </p>
            </>
          ) : (
            <p className="text-neutralx-600">
              De link is ongeldig of verlopen. Open een recente e-mail van ZekerFlex en gebruik de link onderaan,
              of pas je voorkeuren aan in je account.{" "}
              <Link href="/" className="text-brand-600 underline">
                Naar de homepage
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </>
  );
}
