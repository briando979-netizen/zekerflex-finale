import Link from "next/link";

// ---------------------------------------------------------------------------
// YoungCapital-achtige "vacaturebank"-landing voor het uitzendbureau, in
// ZekerFlex-stijl. Alle browse-links funnelen naar registratie als
// uitzendkracht (de klussen zelf staan achter login).
// ---------------------------------------------------------------------------

const REG = "/register?type=uitzendkracht";

const PLAATSEN = [
  "Amsterdam",
  "Rotterdam",
  "Den Haag",
  "Utrecht",
  "Eindhoven",
  "Groningen",
  "Tilburg",
  "Leeuwarden",
  "Breda",
  "Nijmegen",
];

const WERKVORMEN = [
  "Avonddienst",
  "Weekendwerk",
  "Bijbaan",
  "Vakantiewerk",
  "Parttime",
  "Fulltime",
  "Flexibel werk",
  "Losse klus",
  "Overdag",
  "Nachtdienst",
];

const SECTOREN = [
  { emoji: "🛒", label: "Retail & winkel" },
  { emoji: "📦", label: "Logistiek & magazijn" },
  { emoji: "☕", label: "Horeca & bediening" },
  { emoji: "🎪", label: "Events & promotie" },
  { emoji: "🧹", label: "Schoonmaak & facilitair" },
  { emoji: "📞", label: "Klantcontact & office" },
];

const CARDS = [
  {
    title: "Schrijf je in",
    body: "Wil je op de hoogte blijven van nieuwe uitzendklussen en binnen één tik kunnen reageren? Maak een profiel als uitzendkracht.",
    cta: "Direct inschrijven",
    href: REG,
    primary: true,
  },
  {
    title: "Alle klussen op een rij",
    body: "Op zoek naar werk maar weet je nog niet precies wát? Bekijk alle openstaande klussen in de app.",
    cta: "Bekijk alle klussen",
    href: "/dashboard/klussen",
    primary: false,
  },
  {
    title: "Liever als zzp'er?",
    body: "Heb je een KVK en wil je je eigen tarief bepalen? Dan werk je als freelancer — zonder loonstrook, met facturatie.",
    cta: "Naar freelance werken",
    href: "/voor-freelancers",
    primary: false,
  },
];

function Pill({ label }: { label: string }) {
  return (
    <Link
      href={REG}
      className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600"
    >
      {label}
    </Link>
  );
}

export function UitzendJobBoard({ openCount }: { openCount: number }) {
  const count = openCount > 0 ? openCount.toLocaleString("nl-NL") : "Honderden";

  return (
    <>
      {/* Hero + zoekbalk */}
      <div className="hero-ink text-white">
        <div className="shell pt-16 md:pt-20">
          <p className="eyebrow text-brand-mint">Via ons uitzendbureau</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-bold uppercase leading-[1.05] md:text-5xl">
            <span className="text-[#ff7a1a]">{count}</span> uitzendklussen
            <br />
            werk met zekerheid
          </h1>
          <p className="mt-4 max-w-xl text-white/70">
            Geen KVK, geen facturen. ZekerFlex is je werkgever en verloont je elke week met
            een echte loonstrook — inclusief vakantiegeld en pensioen.
          </p>
        </div>

        <div className="shell pb-14 pt-8">
          <form
            action="/register"
            method="get"
            className="grid gap-3 rounded-2xl bg-white p-4 shadow-lift sm:grid-cols-[1fr_1fr_auto]"
          >
            <input type="hidden" name="type" value="uitzendkracht" />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutralx-500">Trefwoord</span>
              <input
                name="q"
                placeholder="Functie, werkvorm of bedrijfsnaam"
                className="w-full rounded-xl border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutralx-500">Locatie</span>
              <input
                name="loc"
                placeholder="Plaatsnaam of postcode"
                className="w-full rounded-xl border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl bg-[#ff7a1a] px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-[#231400] transition hover:brightness-105 sm:mt-[22px]"
            >
              Klussen zoeken
            </button>
          </form>
        </div>
      </div>

      {/* Browse */}
      <section className="bg-white">
        <div className="shell grid gap-12 py-14 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Uitzendklussen per plaats</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {PLAATSEN.map((p) => (
                <Pill key={p} label={p} />
              ))}
            </div>
            <Link href={REG} className="mt-4 inline-block text-sm font-semibold text-ink underline">
              Alle plaatsen bekijken
            </Link>
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Uitzendklussen per werkvorm</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {WERKVORMEN.map((w) => (
                <Pill key={w} label={w} />
              ))}
            </div>
            <Link href={REG} className="mt-4 inline-block text-sm font-semibold text-ink underline">
              Alle werkvormen bekijken
            </Link>
          </div>
        </div>
      </section>

      {/* Promo cards */}
      <section className="bg-paper-soft">
        <div className="shell grid gap-5 py-14 md:grid-cols-3">
          {CARDS.map((c) => (
            <div
              key={c.title}
              className="flex flex-col rounded-2xl border border-hair bg-white p-6 shadow-card"
            >
              <h3 className="font-display text-lg font-bold text-ink">{c.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{c.body}</p>
              <Link
                href={c.href}
                className={`mt-4 inline-block rounded-xl px-4 py-2.5 text-center text-sm font-bold ${
                  c.primary
                    ? "bg-[#ff7a1a] text-[#231400] hover:brightness-105"
                    : "border border-hairstrong text-ink hover:bg-paper-soft"
                }`}
              >
                {c.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Sectoren */}
      <section className="bg-white">
        <div className="shell py-14 text-center">
          <h2 className="font-display text-xl font-bold text-ink">In welke sector wil je werken?</h2>
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {SECTOREN.map((s) => (
              <Link key={s.label} href={REG} className="group flex flex-col items-center gap-2">
                <span className="text-3xl">{s.emoji}</span>
                <span className="text-sm font-medium text-neutralx-600 group-hover:text-brand-700">
                  {s.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
