import Link from "next/link";
import { InstallAppButton } from "@/components/marketing/InstallAppButton";
import { CONTACTS } from "@/lib/seo";

// The Android app (com.zekerflex.app) is in Google Play testing, not yet
// public. The test link only works for Gmail addresses on the tester list, so
// the badge says "testversie" and the block below explains how to get on it.
const PLAY_TEST_URL = "https://play.google.com/apps/internaltest/4701613631596790883";
const TESTER_MAILTO = `mailto:${CONTACTS.support}?subject=${encodeURIComponent("Ik wil de ZekerFlex-app testen")}&body=${encodeURIComponent("Mijn Gmail-adres (zoals in de Play Store op mijn telefoon):\n\n")}`;

function PlayBadgeTest() {
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
        <span className="block text-[10px] uppercase tracking-wide text-brand-mint">Testversie · Android</span>
        <span className="block text-sm font-bold">Google Play</span>
      </span>
    </a>
  );
}

function TestNotice() {
  return (
    <div className="mt-6 max-w-md rounded-xl border border-brand-mint/30 bg-brand-mint/[0.06] p-4 text-sm text-white/80">
      <p className="font-semibold text-white">De Android-app is in testfase</p>
      <p className="mt-1">
        Je kunt hem nu al installeren via Google Play. Het is nog een testversie: er kan af en toe iets haperen, en je
        feedback helpt ons hem af te maken.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-white/75">
        <li>
          <a href={TESTER_MAILTO} className="font-semibold text-brand-mint underline">
            Stuur ons je Gmail-adres
          </a>{" "}
          — het adres waarmee je in de Play Store bent ingelogd. We zetten je op de testerslijst.
        </li>
        <li>
          Open daarna op je Android-telefoon{" "}
          <a href={PLAY_TEST_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-mint underline">
            de testlink
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

export function AppDownload({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="app" className={`scroll-mt-24 ${standalone ? "" : "hero-ink"} text-white`}>
      <div className={`shell ${standalone ? "py-4" : "py-20 md:py-24"}`}>
        <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="eyebrow text-brand-mint">De app</p>
            <h2 className="mt-3 max-w-md text-balance font-display text-3xl font-bold leading-tight md:text-4xl">
              Neem ZekerFlex mee in je zak
            </h2>
            <p className="mt-4 max-w-md text-white/70">
              Reageer op klussen, check in op locatie, dien je uren in en volg je uitbetalingen — alles vanaf je
              telefoon. Dezelfde functies als op het web, met meldingen die kloppen.
            </p>
            <div className="mt-7 flex flex-wrap items-start gap-3">
              <InstallAppButton />
              <PlayBadgeTest />
            </div>
            {standalone ? (
              <TestNotice />
            ) : (
              <p className="mt-3 text-xs text-white/65">
                Android-app in testfase —{" "}
                <Link href="/app" className="underline hover:text-white/80">
                  zo doe je mee
                </Link>
                .
              </p>
            )}
            <p className="mt-4 text-xs text-white/65">
              Ook zonder installeren werkt alles gewoon in je browser via{" "}
              <Link href="/login" className="underline hover:text-white/80">
                inloggen
              </Link>
              .
            </p>
          </div>

          <div className="mx-auto w-[min(240px,60%)]">
            <div className="aspect-[9/19] rounded-[2rem] border border-white/12 bg-gradient-to-b from-white/[0.08] to-transparent p-2">
              <div className="flex h-full flex-col items-center justify-center rounded-[1.6rem] bg-[#0C0E12] text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-mint text-lg font-black text-ink">
                  ZF
                </span>
                <p className="mt-4 px-6 font-display text-sm font-semibold text-white/80">
                  Gematcht in 6 min
                </p>
                <p className="mt-1 px-6 text-xs text-white/60">Vakkenvuller · Amsterdam-West</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
