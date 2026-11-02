import Image from "next/image";
import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";

// De vaste delen van de shop-homepage. Serveronderdelen: geen JavaScript in de
// browser. Het interactieve raster staat in ShopStorefront, de kaarten in
// ShopProductCard. Teksten komen uit het woordenboek (taalkeuze in de kop).

type T = Dict["shop"];
const WRAP = "mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12";
export const LUX_PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-lux-ink px-7 py-3.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-black";
const LUX_GHOST =
  "inline-flex items-center justify-center rounded-full border border-lux-ink/25 px-7 py-3.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-lux-ink transition hover:border-lux-ink";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.24em] text-lux-gold";

export function ShopHero({ t }: { t: T }) {
  return (
    <section className="bg-lux-bg">
      <div className="mx-auto grid max-w-[1440px] lg:min-h-[min(78vh,760px)] lg:grid-cols-2">
        <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:order-2 lg:aspect-auto">
          {/* het grootste beeld van de pagina: meteen laden (LCP) */}
          <Image
            src="/marketing/freelancer-at-work.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1440px) 720px, (min-width: 1024px) 50vw, 100vw"
            className="object-cover object-[30%_center]"
          />
        </div>
        <div className="flex flex-col justify-center px-5 py-12 sm:px-8 sm:py-16 lg:order-1 lg:px-14 xl:px-20">
          <p className={EYEBROW}>ZekerFlex Shop</p>
          <h1 className="mt-5 font-serif text-[2.6rem] leading-[1.02] tracking-[-0.01em] text-lux-ink sm:text-6xl xl:text-7xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-lux-mute">{t.heroSub}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="#collectie" className={LUX_PRIMARY}>
              {t.heroCta}
            </Link>
            <Link href="/shop?cat=Cadeaus#collectie" className={LUX_GHOST}>
              {t.navTeams}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const USP_ICON: Record<"certified" | "nextDay" | "invoice" | "returns", string> = {
  certified: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4",
  nextDay: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  invoice: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4",
  returns: "M9 7H4V2M4 7a8 8 0 111.5 9",
};

export function ShopUsps({ t }: { t: T }) {
  const items = [
    { key: "certified" as const, label: t.uspCertified },
    { key: "nextDay" as const, label: t.uspNextDay },
    { key: "invoice" as const, label: t.uspInvoice },
    { key: "returns" as const, label: t.uspReturns },
  ];
  return (
    <div className="border-y border-lux-line bg-white">
      <ul className={`${WRAP} grid grid-cols-2 gap-x-6 gap-y-4 py-6 lg:grid-cols-4`}>
        {items.map((u) => (
          <li key={u.key} className="flex items-center gap-3 text-[12px] tracking-[0.02em] text-lux-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-lux-gold" aria-hidden>
              <path d={USP_ICON[u.key]} />
            </svg>
            {u.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type CategoryTile = { cat: string; label: string; image: string | null; count: number };

export function ShopCategoryTiles({ t, tiles }: { t: T; tiles: CategoryTile[] }) {
  return (
    <section className="bg-white">
      <div className={`${WRAP} py-16 lg:py-24`}>
        <h2 className="font-serif text-4xl text-lux-ink sm:text-5xl">{t.shopByCategory}</h2>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {tiles.map((c) => (
            <Link key={c.cat} href={`/shop?cat=${encodeURIComponent(c.cat)}#collectie`} className="group relative block aspect-[3/4] overflow-hidden bg-lux-stone">
              {c.image && (
                <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition duration-700 ease-out-quint group-hover:scale-[1.04]" />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <span className="absolute inset-x-4 bottom-4 text-white sm:inset-x-5 sm:bottom-5">
                <span className="block font-serif text-2xl leading-tight sm:text-3xl">{c.label}</span>
                <span className="mt-1.5 inline-block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                  {t.discover} <span aria-hidden>→</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ShopTeams({ t }: { t: T }) {
  return (
    <section className="bg-lux-bg">
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-2">
        <div className="relative aspect-[16/10] lg:aspect-auto lg:min-h-[560px]">
          <Image src="/marketing/team-shift.jpg" alt="" fill sizes="(min-width: 1440px) 720px, (min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:px-14 xl:px-20">
          <p className={EYEBROW}>{t.navTeams}</p>
          <h2 className="mt-5 font-serif text-4xl leading-[1.05] text-lux-ink sm:text-5xl">{t.teamsTitle}</h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-lux-mute">{t.teamsBody}</p>
          <div className="mt-9">
            <Link href="/contact" className={LUX_PRIMARY}>
              {t.teamsCta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const CATEGORY_LINKS = [
  "Veiligheidsschoenen", "Veiligheidssneakers", "Antislip werkschoenen", "Werkhandschoenen",
  "Snijbestendige handschoenen", "Veiligheidshesjes", "Gehoorbescherming", "Veiligheidsbrillen",
  "Kniebeschermers", "Werkbroeken", "Softshell werkjassen", "Veiligheidshelmen",
  "VCA-lesboek", "Werk-T-shirts", "Drinkflessen", "Werktassen",
];
const KITS = [
  { title: "Magazijnmedewerker", items: "Veiligheidsschoenen S3 · hesje · handschoenen", q: "veiligheid" },
  { title: "Bouwvakker", items: "Helm · werkbroek · veiligheidsbril", q: "helm" },
  { title: "Horeca / keuken", items: "Antislip schoenen · werk-T-shirt", q: "antislip" },
  { title: "Evenementen", items: "Hesje · gehoorbescherming · comfortabele schoenen", q: "hesje" },
  { title: "Schoonmaak", items: "Handschoenen · antislip schoenen", q: "handschoen" },
  { title: "Nieuwe collega", items: "Welcome Work Kit · hoodie · fles", q: "welcome" },
];
const search = (q: string) => `/shop?q=${encodeURIComponent(q)}#collectie`;

/** Echte links (ook voor Google): het raster opent met die zoekterm. */
export function ShopMoreCategories({ t }: { t: T }) {
  return (
    <section className="border-t border-lux-line bg-white">
      <div className={`${WRAP} grid gap-14 py-16 lg:grid-cols-2 lg:py-24`}>
        <div>
          <h2 className="font-serif text-3xl text-lux-ink sm:text-4xl">{t.kitsTitle}</h2>
          <p className="mt-2 text-[13px] text-lux-mute">{t.kitsSub}</p>
          <ul className="mt-8 divide-y divide-lux-line border-y border-lux-line">
            {KITS.map((k) => (
              <li key={k.title}>
                <Link href={search(k.q)} className="group flex items-baseline justify-between gap-4 py-4">
                  <span>
                    <span className="block text-[15px] text-lux-ink">{k.title}</span>
                    <span className="mt-0.5 block text-[12px] text-lux-mute">{k.items}</span>
                  </span>
                  <span aria-hidden className="text-lux-mute transition group-hover:translate-x-1 group-hover:text-lux-ink">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-serif text-3xl text-lux-ink sm:text-4xl">{t.moreCategories}</h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] text-lux-mute">
            {CATEGORY_LINKS.map((c) => (
              <li key={c}>
                <Link href={search(c.split(" ")[0] ?? c)} className="transition hover:text-lux-ink">
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function ShopNewsletter({ t }: { t: T }) {
  const [before, after] = t.newsletterBody.split("{code}");
  return (
    <section className="bg-lux-ink text-white">
      <div className={`${WRAP} grid gap-10 py-16 md:grid-cols-2 md:items-center lg:py-20`}>
        <div>
          <h2 className="font-serif text-4xl leading-tight sm:text-5xl">{t.newsletterTitle}</h2>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/65">
            {before}
            <span className="font-mono font-semibold tracking-wide text-[#D9B97E]">WELKOM10</span>
            {after}
          </p>
        </div>
        <NewsletterSignup source="shop" />
      </div>
    </section>
  );
}
