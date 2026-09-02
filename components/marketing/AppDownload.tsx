import { APP_LINKS } from "@/lib/seo";

function AppleBadge() {
  return (
    <a
      href={APP_LINKS.appStore}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-white transition-colors hover:border-brand-mint hover:bg-white/[0.08]"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8ZM14.3 5.7c.6-.8 1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-white/50">Download in de</span>
        <span className="block text-sm font-bold">App Store</span>
      </span>
    </a>
  );
}

function PlayBadge() {
  return (
    <a
      href={APP_LINKS.playStore}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-white transition-colors hover:border-brand-mint hover:bg-white/[0.08]"
    >
      <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M3.6 2.2c-.3.2-.5.6-.5 1.1v17.4c0 .5.2.9.5 1.1l9.5-9.8-9.5-9.8Z" fill="#4FE0A0" />
        <path d="m16.8 8.6-3.2-1.9-2.8 2.9 2.8 2.9 3.3-1.9c.9-.6.9-1.5-.1-2Z" fill="#fff" />
        <path d="M13.1 6.7 4.2 1.6c-.3-.2-.6-.2-.9-.1l9.1 9.4 2.7-2.9-2-1.3Z" fill="#fff" opacity=".85" />
        <path d="m4.2 22.4 8.9-5.1 2-1.3-2.7-2.9-9.1 9.4c.3.1.6.1.9-.1Z" fill="#fff" opacity=".7" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-white/50">Verkrijgbaar via</span>
        <span className="block text-sm font-bold">Google Play</span>
      </span>
    </a>
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
            <div className="mt-7 flex flex-wrap gap-3">
              <AppleBadge />
              <PlayBadge />
            </div>
            <p className="mt-4 text-xs text-white/45">
              Ook zonder app werkt alles gewoon in je browser via{" "}
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
                <p className="mt-1 px-6 text-xs text-white/40">Vakkenvuller · Amsterdam-West</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
