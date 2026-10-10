import { InstallAppButton } from "@/components/marketing/InstallAppButton";

// Google Play badge, intentionally non-interactive: the Android app exists in
// Play Console but is still in Draft (not published), so a link to a store
// listing would 404. This is an honest "coming soon," not a working download
// link — see docs/MOBILE-APP.md for where that stands.
function PlayBadgeComingSoon() {
  return (
    <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-white/50">
      <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M3.6 2.2c-.3.2-.5.6-.5 1.1v17.4c0 .5.2.9.5 1.1l9.5-9.8-9.5-9.8Z" fill="currentColor" opacity=".5" />
        <path d="m16.8 8.6-3.2-1.9-2.8 2.9 2.8 2.9 3.3-1.9c.9-.6.9-1.5-.1-2Z" fill="currentColor" opacity=".7" />
        <path d="M13.1 6.7 4.2 1.6c-.3-.2-.6-.2-.9-.1l9.1 9.4 2.7-2.9-2-1.3Z" fill="currentColor" opacity=".6" />
        <path d="m4.2 22.4 8.9-5.1 2-1.3-2.7-2.9-9.1 9.4c.3.1.6.1.9-.1Z" fill="currentColor" opacity=".5" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-white/40">Binnenkort in de</span>
        <span className="block text-sm font-bold">Google Play Store</span>
      </span>
    </span>
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
              <PlayBadgeComingSoon />
            </div>
            <p className="mt-4 text-xs text-white/65">
              Ook zonder installeren werkt alles gewoon in je browser via{" "}
              <a href="/login" className="underline hover:text-white/80">
                inloggen
              </a>
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
