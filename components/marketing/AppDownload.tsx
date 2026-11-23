import Link from "next/link";
import { InstallAppButton } from "@/components/marketing/InstallAppButton";
import { TelefoonDemo } from "@/components/marketing/TelefoonDemo";
import { featureEnabled } from "@/lib/flags";
import { TesterWordenForm } from "@/components/marketing/TesterWordenForm";
import { ALLEEN_APP_VLAG, installRegel } from "@/lib/app-vereist";

// De Android-app (com.zekerflex.app) staat in een besloten groep op Google Play (nog geen gewone openbare vermelding). De link
// werkt alleen voor Gmail-adressen die ZekerFlex op de lijst heeft gezet; het formulier hieronder regelt dat.
// 23 nov 2026 (eigenaar): geen woord "test" in kopjes, badges en korte regels; in de uitleg-stappen staan de echte productnamen
// (TestFlight, Google Play) wel, want de werker moet ze kunnen vinden. Het blijft waar: de app staat in de EU nog niet in de App
// Store en Android zit in een besloten groep; de korte regel staat in installRegel (lib/app-vereist.ts).
const PLAY_TEST_URL = "https://play.google.com/apps/testing/com.zekerflex.app";
// De iPhone-app staat in de App Store (goedgekeurd door Apple op 10 nov 2026), maar nog niet in de EU: Apple wacht op de
// handelaarsstatus. In Nederland installeert een iPhone hem dus via TestFlight (openbare link). De App Store-knop staat achter de
// vlag `iphone-appstore`; zet die pas aan als de app in Nederland in de App Store te vinden is.
const APPSTORE_URL = "https://apps.apple.com/nl/app/zekerflex/id6832775836";
const TESTFLIGHT_URL = "https://testflight.apple.com/join/2QKhAHn8";
// 21 nov 2026: aanmelden voor Android gaat met een formulier (components/marketing/TesterWordenForm.tsx), niet met een mail

function PlayBadge() {
  return (
    <a
      href={PLAY_TEST_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2.5 text-white transition hover:bg-white/[0.12]"
    >
      <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M3.6 2.2c-.3.2-.5.6-.5 1.1v17.4c0 .5.2.9.5 1.1l9.5-9.8-9.5-9.8Z" fill="currentColor" opacity=".5" />
        <path d="m16.8 8.6-3.2-1.9-2.8 2.9 2.8 2.9 3.3-1.9c.9-.6.9-1.5-.1-2Z" fill="currentColor" opacity=".7" />
        <path d="M13.1 6.7 4.2 1.6c-.3-.2-.6-.2-.9-.1l9.1 9.4 2.7-2.9-2-1.3Z" fill="currentColor" opacity=".6" />
        <path d="m4.2 22.4 8.9-5.1 2-1.3-2.7-2.9-9.1 9.4c.3.1.6.1.9-.1Z" fill="currentColor" opacity=".5" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-brand-mint">Android</span>
        <span className="block text-sm font-bold">Installeren met uitnodiging</span>
      </span>
    </a>
  );
}

function AppleBadge({ store }: { store: boolean }) {
  const inhoud = (
    <>
      <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
        <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6 0 0-2.5-1-2.5-3.8ZM14.2 5.9c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.8-1.3Z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-brand-mint">{store ? "Download in de" : "iPhone"}</span>
        <span className="block text-sm font-bold">{store ? "App Store" : "Installeren met uitnodiging"}</span>
      </span>
    </>
  );
  return (
    <a
      href={store ? APPSTORE_URL : TESTFLIGHT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2.5 text-white transition hover:bg-white/[0.12]"
    >
      {inhoud}
    </a>
  );
}

function IphoneNotice() {
  return (
    <div className="mt-6 max-w-md rounded-xl border border-brand-mint/30 bg-brand-mint/[0.06] p-4 text-sm text-white/80">
      <p className="font-semibold text-white">iPhone: installeer met een uitnodiging</p>
      <p className="mt-1">
        In de EU staat de app nog niet in de App Store. Je zet hem op je iPhone met een uitnodiging, via TestFlight: de
        installatiedienst van Apple.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-white/75">
        <li>Installeer de gratis app TestFlight uit de App Store.</li>
        <li>
          Open op je iPhone{" "}
          <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-mint underline">
            deze link
          </a>{" "}
          en tik op <em>Accepteren</em> en dan <em>Installeren</em>.
        </li>
      </ol>
    </div>
  );
}

function AndroidNotice() {
  return (
    <div className="mt-6 max-w-md rounded-xl border border-brand-mint/30 bg-brand-mint/[0.06] p-4 text-sm text-white/80">
      <p className="font-semibold text-white">Android: installeer met een uitnodiging</p>
      <p className="mt-1">De Android-app staat in een besloten groep op Google Play. Meld je aan voor die groep, dan kun je hem installeren.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-white/75">
        <li>
          Vul je Gmail-adres in: het adres waarmee je in de Play Store bent ingelogd. Wij zetten je op de lijst.
          <TesterWordenForm />
        </li>
        <li>
          Open daarna op je Android-telefoon{" "}
          <a href={PLAY_TEST_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-mint underline">
            deze link
          </a>{" "}
          en tik op <em>Word tester</em> en dan <em>Installeren</em>.
        </li>
      </ol>
      <p className="mt-3 text-xs text-white/55">
        Zie je &ldquo;app niet beschikbaar&rdquo;? Dan staat je adres nog niet op de lijst — probeer het een paar uur later. Liever
        niet wachten? Met &ldquo;Installeer de app&rdquo; hierboven zet je ZekerFlex direct vanuit je browser op je telefoon.
      </p>
    </div>
  );
}

export async function AppDownload({ standalone = false }: { standalone?: boolean }) {
  // vlag `iphone-appstore` (standaard uit): de echte App Store-knop, zodra de app in Nederland in de App Store staat
  const appStore = await featureEnabled("iphone-appstore").catch(() => false);
  // vlag "werker-omgeving alleen in de app" (standaard uit sinds 22 nov 2026: eerst de browser, dan de app)
  const alleenApp = await featureEnabled(ALLEEN_APP_VLAG).catch(() => false);
  return (
    <section id="app" className={`scroll-mt-24 ${standalone ? "" : "hero-ink"} text-white`}>
      <div className={`shell ${standalone ? "py-4" : "py-8 md:py-10"}`}>
        <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            {/* op /app zelf staat de kop al boven dit blok ("De flexwerk-app …"): daar geen tweede kop (22 nov 2026) */}
            {!standalone && (
              <>
                <p className="eyebrow text-brand-mint">De app</p>
                <h2 className="mt-2 max-w-md text-balance font-display text-2xl font-bold leading-tight md:text-[1.75rem]">
                  Neem ZekerFlex mee in je zak
                </h2>
              </>
            )}
            <p className={`${standalone ? "" : "mt-4 "}max-w-md text-white/70`}>
              Reageer op klussen, check in op locatie, dien je uren in en volg je uitbetalingen — alles vanaf je
              telefoon, met meldingen die kloppen.
            </p>
            {/* 21 nov 2026: wie al een account heeft (vaak via de site gemaakt), ziet dat hier meteen, vóór het installeren */}
            {standalone && (
              <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>
                  Al een account?{" "}
                  <Link href="/login" className="font-semibold text-brand-mint underline">
                    Log in
                  </Link>
                </span>
                <span>
                  Nieuw?{" "}
                  <Link href="/register" className="font-semibold text-brand-mint underline">
                    Maak een account
                  </Link>
                </span>
              </p>
            )}
            <div className="mt-7 flex flex-wrap items-start gap-3">
              <InstallAppButton />
              <AppleBadge store={appStore} />
              <PlayBadge />
            </div>
            {standalone ? (
              <>
                {/* ook op /app zelf de korte regel; de uitleg per toestel staat eronder */}
                <p className="mt-3 text-xs text-white/65">{installRegel({ appStore, alleenApp })}</p>
                {!appStore && <IphoneNotice />}
                <AndroidNotice />
              </>
            ) : (
              <p className="mt-3 text-xs text-white/65">
                {installRegel({ appStore, alleenApp })} —{" "}
                <Link href="/app" className="underline hover:text-white/80">
                  zo werkt het
                </Link>
                .
              </p>
            )}
            {/* "alleen in de app" staat sinds 22 nov achter een vlag (lib/app-vereist.ts, standaard uit: eerst de browser). Een
                account aanmaken kan altijd hier, en bedrijven loggen in via de website. */}
            <p className="mt-4 text-xs text-white/65">
              {alleenApp ? "Je werkersomgeving gebruik je in de app. " : ""}Nog geen account?{" "}
              <Link href="/register" className="underline hover:text-white/80">
                Maak er een aan
              </Link>
              . Een bedrijf?{" "}
              <Link href="/login" className="underline hover:text-white/80">
                Log in via de website
              </Link>
              .
            </p>
          </div>

          <TelefoonDemo />
        </div>
      </div>
    </section>
  );
}
