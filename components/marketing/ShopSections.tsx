import Image from "next/image";
import Link from "next/link";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";
import { Paspop } from "@/components/marketing/paskamer/Paspop";
import { STANDAARD_LICHAAM, pasvormVoor, type Lichaam } from "@/lib/shop/paskamer";
import type { Gedragen } from "@/lib/shop/paspop-figuur";

// De vaste delen van de shop-homepage, opgebouwd als een marktplaats.
// Serveronderdelen: geen JavaScript in de browser. Het interactieve assortiment
// staat in ShopStorefront, de kaarten in ShopProductCard. Teksten komen uit het
// woordenboek (taalkeuze in de kop).

type T = Dict["shop"];
const WRAP = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8";
const H2 = "font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]";

/** Grote banner met twee zakelijke tegels ernaast. */
export function ShopMarketHero({ t }: { t: T }) {
  return (
    <section aria-labelledby="shop-kop" className="bg-paper-soft">
      <div className={`${WRAP} grid gap-4 py-4 sm:py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`}>
        <div className="relative isolate flex min-h-[300px] overflow-hidden rounded-2xl bg-brand-700 text-white sm:min-h-[360px] lg:min-h-[400px]">
          {/* het grootste beeld van de pagina: meteen laden (LCP) */}
          <Image src="/marketing/freelancer-at-work.jpg" alt="" fill priority sizes="(min-width: 1440px) 940px, (min-width: 1024px) 66vw, 100vw" className="-z-10 object-cover object-[75%_center]" />
          <span aria-hidden className="absolute inset-0 -z-10 bg-brand-700/80 sm:bg-transparent sm:bg-gradient-to-r sm:from-brand-700 sm:via-brand-700/90 sm:to-brand-700/0" />
          <div className="flex max-w-xl flex-col justify-center p-6 sm:p-10 lg:p-12">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-mint">ZekerFlex Shop</p>
            <h1 id="shop-kop" className="mt-3 font-display text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/90 sm:text-[16px]">{t.heroSub}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="#collectie" className="inline-flex h-12 items-center rounded-lg bg-brand-mint px-6 text-[15px] font-bold text-ink transition hover:brightness-95">
                {t.heroCta}
              </Link>
              <Link href={`/shop?cat=${encodeURIComponent("Werk & PBM")}#collectie`} className="inline-flex h-12 items-center rounded-lg border border-white/50 px-6 text-[15px] font-bold text-white transition hover:bg-white/10">
                {t.navPbm}
              </Link>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <PromoTile tone="ink" title={t.businessTileTitle} body={t.businessTileBody} cta={t.teamsCta} href="/contact" />
          <PromoTile tone="money" title={t.kitsTileTitle} body={t.kitsTileBody} cta={t.discover} href="#pakketten" />
        </div>
      </div>
    </section>
  );
}

function PromoTile({ tone, title, body, cta, href }: { tone: "ink" | "money"; title: string; body: string; cta: string; href: string }) {
  const dark = tone === "ink";
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-2xl p-6 transition hover:shadow-e2 ${dark ? "bg-ink text-white" : "border border-money/25 bg-money-soft text-ink"}`}
    >
      <span>
        <span className="block text-[18px] font-bold leading-snug">{title}</span>
        <span className={`mt-2 block text-[14px] leading-relaxed ${dark ? "text-white/80" : "text-neutralx-700"}`}>{body}</span>
      </span>
      <span className={`mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold ${dark ? "text-brand-mint" : "text-money-ink"}`}>
        {cta} <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}

export type CategoryTile = { cat: string; label: string; image: string | null; count: number };

export function ShopCategoryTiles({ t, tiles }: { t: T; tiles: CategoryTile[] }) {
  return (
    <section aria-labelledby="shop-categorieen" className="bg-white">
      <div className={`${WRAP} py-8 lg:py-10`}>
        <h2 id="shop-categorieen" className={H2}>
          {t.shopByCategory}
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {tiles.map((c) => (
            <li key={c.cat}>
              <Link
                href={`/shop?cat=${encodeURIComponent(c.cat)}#collectie`}
                className="group flex items-center gap-3.5 rounded-xl border border-hair bg-white p-3 transition hover:border-brand-500 hover:shadow-e1"
              >
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-paper-soft sm:h-[72px] sm:w-[72px]">
                  {c.image && <Image src={c.image} alt="" fill sizes="72px" className="object-cover transition duration-500 group-hover:scale-105" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-ink group-hover:underline">{c.label}</span>
                  <span className="mt-0.5 block text-[12px] text-neutralx-500">{fmt(t.articles, { n: c.count })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const SERVICE_ICON: Record<"certified" | "nextDay" | "invoice" | "returns", string> = {
  certified: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4",
  nextDay: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  invoice: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4",
  returns: "M9 7H4V2M4 7a8 8 0 111.5 9",
};

/** Vier beloftes in blokken (levering, retour, op rekening, gecertificeerd). */
export function ShopService({ t }: { t: T }) {
  const items = [
    { key: "nextDay" as const, label: t.uspNextDay, sub: t.freeShipping },
    { key: "returns" as const, label: t.uspReturns, sub: t.shippingReturns },
    { key: "invoice" as const, label: t.uspInvoice, sub: t.businessQuote },
    { key: "certified" as const, label: t.uspCertified, sub: t.navPbm },
  ];
  return (
    <section aria-labelledby="shop-service" className="border-t border-hair bg-paper-soft">
      <div className={`${WRAP} py-10`}>
        <h2 id="shop-service" className={H2}>
          {t.serviceTitle}
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((u) => (
            <li key={u.key} className="flex items-start gap-3.5 rounded-xl border border-hair bg-white p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={SERVICE_ICON[u.key]} />
                </svg>
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">{u.label}</span>
                <span className="mt-0.5 block text-[13px] text-neutralx-500">{u.sub}</span>
              </span>
            </li>
          ))}
        </ul>
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

/** Pakketten per soort werk en een lijst zoekwoorden: echte links (ook voor Google), het assortiment opent met die zoekterm. */
export function ShopMoreCategories({ t }: { t: T }) {
  return (
    <section id="pakketten" aria-labelledby="shop-pakketten" className="scroll-mt-32 border-t border-hair bg-white lg:scroll-mt-20">
      <div className={`${WRAP} grid gap-10 py-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:py-12`}>
        <div>
          <h2 id="shop-pakketten" className={H2}>
            {t.kitsTitle}
          </h2>
          <p className="mt-1 text-[14px] text-neutralx-500">{t.kitsSub}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {KITS.map((k) => (
              <li key={k.title}>
                <Link href={search(k.q)} className="group flex h-full items-center justify-between gap-4 rounded-xl border border-hair p-4 transition hover:border-brand-500 hover:shadow-e1">
                  <span>
                    <span className="block text-[15px] font-bold text-ink group-hover:underline">{k.title}</span>
                    <span className="mt-0.5 block text-[13px] text-neutralx-500">{k.items}</span>
                  </span>
                  <span aria-hidden className="text-brand-600 transition group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={H2}>{t.moreCategories}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[14px]">
            {CATEGORY_LINKS.map((c) => (
              <li key={c}>
                <Link href={search(c.split(" ")[0] ?? c)} className="text-brand-600 hover:underline">
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
    <section aria-labelledby="shop-nieuwsbrief" className="bg-brand-700 text-white">
      <div className={`${WRAP} grid gap-8 py-12 md:grid-cols-2 md:items-center`}>
        <div>
          <h2 id="shop-nieuwsbrief" className="font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">
            {t.newsletterTitle}
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85">
            {before}
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono font-bold tracking-wide text-brand-mint">WELKOM10</span>
            {after}
          </p>
        </div>
        {/* de toestemmingsregel (text-white/50) haalt op dit groen geen 4,5:1: hier lichter */}
        <div className="[&_label]:text-white/80">
          <NewsletterSignup source="shop" />
        </div>
      </div>
    </section>
  );
}

// twee vaste looks voor het paskamerblok (zelfde tekening als in de paskamer)
const PROMO_LOOKS: { lichaam: Lichaam; huid: string; slugs: string[]; kleur?: Record<string, string> }[] = [
  { lichaam: STANDAARD_LICHAAM.heren, huid: "#d9a989", slugs: ["veiligheidshelm", "veiligheidshesje", "werk-tshirt-2pack", "werkbroek-kniezakken", "werkhandschoenen-grip", "veiligheidsschoenen-s3"] },
  { lichaam: STANDAARD_LICHAAM.dames, huid: "#a86f4c", slugs: ["business-blouse-dames", "chino-broek-zakelijk", "veiligheidssneakers-s1p"], kleur: { "business-blouse-dames": "#cfe0ef", "chino-broek-zakelijk": "#1f2f4f" } },
];

function promoStukken(slugs: string[], kleur: Record<string, string> = {}): Gedragen[] {
  return slugs.flatMap((slug) => {
    const p = pasvormVoor({ slug, name: slug });
    return p ? p.stukken.map((s) => ({ slot: s.slot, soort: s.soort, kleur: s.kleur ?? kleur[slug] ?? p.kleur, accent: p.accent, ruimte: 0 })) : [];
  });
}

/** Blok op de shop-homepage: de paskamer met twee aangeklede paspoppen (server, geen JavaScript). */
export function ShopPaskamerPromo({ pk }: { pk: Dict["paskamer"] }) {
  return (
    <section aria-labelledby="shop-paskamer" className="bg-white">
      <div className={`${WRAP} py-6 lg:py-8`}>
        <div className="grid items-center gap-6 overflow-hidden rounded-2xl bg-ink text-white md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="p-6 sm:p-10">
            <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-brand-mint">
              <span className="rounded-full bg-brand-mint px-2 py-0.5 text-[10px] text-ink">{pk.nieuw}</span> {pk.eyebrow}
            </p>
            <h2 id="shop-paskamer" className="mt-3 font-display text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
              {pk.titel}
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85">{pk.promoTekst}</p>
            <ul className="mt-5 space-y-2 text-[14px] text-white/90">
              {pk.promoPunten.map((punt) => (
                <li key={punt} className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-mint" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  {punt}
                </li>
              ))}
            </ul>
            <Link href="/shop/paskamer" className="mt-7 inline-flex h-12 items-center rounded-lg bg-brand-mint px-6 text-[15px] font-bold text-ink transition hover:brightness-95">
              {pk.promoKnop} →
            </Link>
          </div>
          <Link href="/shop/paskamer" aria-label={pk.promoKnop} className="relative flex h-[340px] items-end justify-center gap-2 bg-gradient-to-b from-[#f4f1ea] to-[#e5dfd3] px-4 pb-2 pt-6 sm:h-[420px] md:h-[460px]">
            {PROMO_LOOKS.map((l, i) => (
              <Paspop key={i} id={`promo${i}`} lichaam={l.lichaam} huid={l.huid} stukken={promoStukken(l.slugs, l.kleur)} label={pk.titel} achtergrond={false} className="h-full w-auto" />
            ))}
          </Link>
        </div>
      </div>
    </section>
  );
}
