import Image from "next/image";
import Link from "next/link";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { categorieNaam } from "@/lib/shop/categorieen";
import type { CadeauSleutel, OntdekTegel, OverzichtKolom, Seizoen, Thema } from "@/lib/shop/etalage";
import type { VoorWaarde } from "@/lib/shop/categoriemenu";
import type { ShopBanner } from "@/lib/shop/banners";

// De voorpagina van de shop zoals bol.com (stap 6, lib/shop/etalage.ts): Uitgelicht (seizoenskaart + tegels), thema's,
// cadeauhulp, "Ontdek alles bij ZekerFlex" en Snel regelen. Alles uit de echte catalogus; zonder producten geen blok.

const WRAP = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8";
const H2 = "font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]";

function catLabel(c: string, t: Dict): string {
  return c === "Werk & PBM" ? t.shop.navPbm : c === "Kleding" ? t.shop.navKleding : c === "Werkdag" ? t.shop.navWerkdag : c === "Cadeaus" ? t.shopZakelijk.navCadeaus : categorieNaam(c, t.shop.navKleding !== "Kleding");
}
function voorLabel(v: VoorWaarde, t: Dict): string {
  return v === "heren" ? t.shop.doelHeren : v === "vrouwen" ? t.shop.doelVrouwen : t.shop.doelKinderen;
}
/** "1 artikel", "7 artikelen" */
const artikelen = (n: number, t: Dict) => (n === 1 ? t.shop.artikelEen : fmt(t.shop.articles, { n }));

function tegelLabel(g: OntdekTegel, t: Dict): string {
  if (g.soort === "collectie") return g.collectie ?? "";
  if (g.soort === "catVoor" && g.cat && g.voor) return fmt(t.shop.groepVoor, { cat: catLabel(g.cat, t), voor: voorLabel(g.voor, t) });
  return catLabel(g.cat ?? "", t);
}

/**
 * De banners (lib/shop/banners.ts): donker met een grote kop en een regel in mint, zoals onze advertenties, met foto's van
 * onze eigen producten. De eerste is groot. Op de telefoon veeg je erdoor; de rij staat in een `relative` vak met
 * `overflow-x-auto`, zodat de pagina niet breder wordt dan het scherm.
 */
export function ShopBanners({ t, banners }: { t: Dict; banners: ShopBanner[] }) {
  const engels = t.shop.navKleding !== "Kleding";
  return (
    <ul className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-4 lg:overflow-visible lg:pb-0">
      {banners.map((b, i) => {
        const groot = i === 0;
        return (
          <li key={b.sleutel} className={`shrink-0 snap-start lg:w-auto ${banners.length === 1 ? "w-full lg:col-span-3" : "w-[86%] sm:w-[60%]"}`}>
            <Link href={b.href} className="group relative isolate flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl bg-[#0C0E12] p-5 text-white sm:p-7 lg:min-h-[340px]">
              <span aria-hidden className="absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-brand-mint/15 blur-2xl" />
              <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-mint">ZekerFlex shop</span>
              <span className={`mt-3 block font-display font-extrabold leading-[1.02] tracking-tight ${groot ? "text-[34px] sm:text-[44px] lg:text-[52px]" : "text-[30px] sm:text-[34px]"}`}>
                {engels ? b.kop.en : b.kop.nl}
                <span className="block text-brand-mint">{engels ? b.accent.en : b.accent.nl}</span>
              </span>
              <span className={`mt-auto flex items-end gap-2 pt-6 ${groot ? "lg:gap-3" : ""}`}>
                {b.fotos.slice(0, groot ? 3 : 2).map((f, k) => (
                  <span
                    key={f}
                    className={`relative block aspect-square flex-1 overflow-hidden rounded-xl bg-white ring-1 ring-white/10 transition duration-500 group-hover:-translate-y-1 ${k % 2 === 1 ? "-translate-y-3" : ""} ${groot ? "max-w-[190px]" : "max-w-[130px]"}`}
                  >
                    <Image src={f} alt="" fill sizes={groot ? "(min-width: 1024px) 14vw, 28vw" : "(min-width: 1024px) 9vw, 28vw"} className="object-cover" />
                  </span>
                ))}
                <span className="ml-auto flex shrink-0 flex-col items-end gap-2 pl-2">
                  <span className="text-[12px] text-white/70">{artikelen(b.aantal, t)}</span>
                  <span className="inline-flex h-10 items-center rounded-lg bg-brand-mint px-4 text-[14px] font-bold text-ink transition group-hover:brightness-95">{t.shop.etalageBekijk} →</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Uitgelicht. Met banners: de banners bovenaan en de tegels eronder over de hele breedte. Zonder banners (te weinig
 * producten met foto): links een grote kaart (seizoen, of klaar voor je werkdag), rechts de tegels.
 */
export function ShopOntdek({ t, seizoen, tegels, banners = [] }: { t: Dict; seizoen: Seizoen | null; tegels: OntdekTegel[]; banners?: ShopBanner[] }) {
  if (banners.length > 0) {
    return (
      <section aria-labelledby="shop-ontdek" className="bg-white">
        <div className={`${WRAP} py-6 lg:py-8`}>
          <h2 id="shop-ontdek" className="sr-only">
            {t.shop.uitgelicht}
          </h2>
          <ShopBanners t={t} banners={banners} />
          {tegels.length >= 4 && (
            <ul className="mt-4 grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
              {tegels.map((g) => (
                <li key={g.sleutel}>
                  <Link href={g.href} className="group block rounded-xl border border-hair bg-white p-1.5 transition hover:border-hairstrong hover:shadow-e1 sm:p-2">
                    <span className="relative block aspect-square overflow-hidden rounded-lg bg-paper-soft">
                      <Image src={g.foto} alt="" fill sizes="(min-width: 1024px) 11vw, 25vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-center text-[11px] font-semibold leading-tight text-ink sm:text-[13px]">{tegelLabel(g, t)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }
  if (tegels.length < 4) return null;
  const titel = seizoen === "sint" ? t.shop.etalageSint : seizoen === "kerst" ? t.shop.etalageKerst : t.shop.etalageWerkTitel;
  const sub = seizoen ? t.shop.etalageSeizoenSub : t.shop.etalageWerkSub;
  const href = seizoen ? "/shop?cat=Cadeaus#collectie" : "/shop?cat=Werk%20%26%20PBM#collectie";
  return (
    <section aria-labelledby="shop-ontdek" className="bg-white">
      <div className={`${WRAP} py-8 lg:py-10`}>
        <h2 id="shop-ontdek" className="sr-only">
          {t.shop.uitgelicht}
        </h2>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <Link href={href} className="group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-2xl bg-brand-700 p-6 text-white sm:p-8">
            <span aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-mint/25" />
            <span aria-hidden className="absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10" />
            <span className="relative font-display text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]">{titel}</span>
            <span className="relative mt-2 max-w-sm text-[15px] text-white/85">{sub}</span>
            <span className="relative mt-5 inline-flex h-10 w-fit items-center rounded-lg bg-brand-mint px-4 text-[14px] font-bold text-ink transition group-hover:brightness-95">
              {t.shop.etalageBekijk} →
            </span>
          </Link>
          <ul className="grid grid-cols-4 gap-2 sm:gap-3">
            {tegels.map((g) => (
              <li key={g.sleutel}>
                <Link href={g.href} className="group block rounded-xl border border-hair bg-white p-1.5 transition hover:border-hairstrong hover:shadow-e1 sm:p-2">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-paper-soft">
                    <Image src={g.foto} alt="" fill sizes="(min-width: 1024px) 12vw, 25vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-center text-[11px] font-semibold leading-tight text-ink sm:text-[13px]">{tegelLabel(g, t)}</span>
                </Link>
              </li>
            ))}
            {tegels.length % 4 !== 0 && (
              <li>
                <Link href="/shop#collectie" className="grid h-full place-items-center rounded-xl border border-hair bg-mintwash p-2 text-center text-[11px] font-bold text-ink transition hover:border-brand-300 sm:text-[13px]">
                  {t.shop.allesBekijken} →
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function themaTekst(th: Thema, t: Dict, seizoen: Seizoen | null): { titel: string; sub: string } {
  if (th.sleutel === "seizoen") return { titel: seizoen === "kerst" ? t.shop.etalageKerst : t.shop.etalageSint, sub: t.shop.etalageSeizoenSub };
  if (th.sleutel === "winter") return { titel: t.shop.themaWinter, sub: fmt(t.shop.themaWinterSub, { col: th.collectie ?? "" }) };
  if (th.sleutel === "werk") return { titel: t.shop.themaWerk, sub: t.shop.themaWerkSub };
  if (th.sleutel === "budget") return { titel: t.shop.themaBudget, sub: t.shop.themaBudgetSub };
  return { titel: t.shop.themaTeam, sub: t.shop.themaTeamSub };
}

/** Thema's: kaarten met een titel, een regel uitleg en foto's uit dat thema; op de telefoon om opzij te vegen. */
export function ShopThemas({ t, themas, seizoen }: { t: Dict; themas: Thema[]; seizoen: Seizoen | null }) {
  if (themas.length < 2) return null;
  return (
    <section aria-labelledby="shop-themas" className="bg-paper-soft">
      <div className={`${WRAP} py-10 lg:py-12`}>
        <h2 id="shop-themas" className={H2}>
          {t.shop.themaTitel}
        </h2>
        <ul className="relative -mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {themas.map((th) => {
            const tekst = themaTekst(th, t, seizoen);
            return (
              <li key={th.sleutel} className="w-[72%] shrink-0 snap-start sm:w-auto">
                <Link href={th.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-hair bg-white transition hover:border-hairstrong hover:shadow-e2">
                  <span className="p-4 pb-3">
                    <span className="block text-[17px] font-extrabold leading-tight text-ink">{tekst.titel}</span>
                    <span className="mt-1 block text-[13px] text-neutralx-600">{tekst.sub}</span>
                  </span>
                  <span className="mt-auto grid grid-cols-3 gap-1 px-2 pb-2">
                    {th.fotos.map((f) => (
                      <span key={f} className="relative aspect-square overflow-hidden rounded-lg bg-paper-soft">
                        <Image src={f} alt="" fill sizes="(min-width: 1024px) 7vw, 24vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                      </span>
                    ))}
                  </span>
                  <span className="border-t border-hair px-4 py-2.5 text-[12px] font-semibold text-brand-600">
                    {artikelen(th.aantal, t)} →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function cadeauLabel(k: CadeauSleutel, t: Dict): string {
  if (k === "heren") return t.shop.cadeauVoorHem;
  if (k === "vrouwen") return t.shop.cadeauVoorHaar;
  if (k === "kinderen") return t.shop.cadeauKinderen;
  if (k === "onder15") return t.shop.cadeauOnder15;
  if (k === "15-30") return t.shop.cadeau1530;
  return t.shop.cadeauWerk;
}

/** Cadeauhulp: kies voor wie of je budget, of typ wat je zoekt (de slimme zoekfunctie van de shop). */
export function ShopCadeauhulp({ t, keuzes }: { t: Dict; keuzes: { sleutel: CadeauSleutel; aantal: number; href: string }[] }) {
  if (keuzes.length < 2) return null;
  return (
    <section aria-labelledby="shop-cadeauhulp" className="bg-white">
      <div className={`${WRAP} py-10 lg:py-12`}>
        <div className="rounded-2xl border border-hair bg-mintwash p-5 sm:p-8">
          <h2 id="shop-cadeauhulp" className={H2}>
            {t.shop.cadeauTitel}
          </h2>
          <p className="mt-1.5 text-[15px] text-neutralx-700">{t.shop.cadeauSub}</p>
          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {keuzes.map((k) => (
              <li key={k.sleutel}>
                <Link href={k.href} className="flex h-full flex-col rounded-xl border border-hair bg-white px-4 py-3 transition hover:border-brand-300 hover:shadow-e1">
                  <span className="text-[15px] font-bold text-ink">{cadeauLabel(k.sleutel, t)}</span>
                  <span className="mt-0.5 text-[12px] text-neutralx-600">{artikelen(k.aantal, t)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <form action="/shop#collectie" method="get" role="search" className="relative mt-5 flex max-w-xl gap-2">
            <label htmlFor="cadeau-zoek" className="sr-only">
              {t.shop.cadeauZoek}
            </label>
            <input id="cadeau-zoek" name="q" type="search" maxLength={60} placeholder={t.shop.cadeauZoek} className="h-11 min-w-0 flex-1 rounded-lg border border-hairstrong bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink" />
            <button type="submit" className="h-11 shrink-0 rounded-lg bg-ink px-5 text-[14px] font-bold text-white">
              {t.shop.search}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/** "Ontdek alles bij ZekerFlex": het hele aanbod per categorie, met doelgroepen en collecties en de aantallen. */
export function ShopAlles({ t, kolommen }: { t: Dict; kolommen: OverzichtKolom[] }) {
  if (!kolommen.length) return null;
  return (
    <section aria-labelledby="shop-alles" className="border-t border-hair bg-white">
      <div className={`${WRAP} py-10 lg:py-12`}>
        <h2 id="shop-alles" className={H2}>
          {t.shop.allesTitel}
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {kolommen.map((k) => (
            <div key={k.cat}>
              <Link href={k.href} className="text-[15px] font-bold text-ink hover:underline">
                {catLabel(k.cat, t)} <span className="font-normal text-neutralx-500">({k.aantal})</span>
              </Link>
              <ul className="mt-2 space-y-1.5 text-[14px]">
                {k.links.map((l) => (
                  <li key={`${l.soort}-${l.waarde}`}>
                    <Link href={l.href} className="text-neutralx-700 hover:text-ink hover:underline">
                      {l.soort === "voor" ? voorLabel(l.waarde as VoorWaarde, t) : l.waarde} <span className="text-neutralx-500">({l.aantal})</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={k.href} className="font-semibold text-brand-600 hover:underline">
                    {fmt(t.shop.inCategorie, { cat: catLabel(k.cat, t) })}
                  </Link>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Snel regelen: je bestelling en account, en hulp als je ons nodig hebt. */
export function ShopRegelen({ t }: { t: Dict }) {
  const kaart = "flex gap-4 rounded-2xl border border-hair bg-white p-5 sm:p-6";
  const rond = "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600";
  return (
    <section aria-labelledby="shop-regelen" className="bg-paper-soft">
      <div className={`${WRAP} py-10`}>
        <h2 id="shop-regelen" className="sr-only">
          {t.shop.regelenTitel}
        </h2>
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          <div className={kaart}>
            <span className={rond} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
              </svg>
            </span>
            <div>
              <p className="text-[16px] font-bold text-ink">{t.shop.regelenTitel}</p>
              <p className="mt-1 text-[14px] text-neutralx-600">{t.shop.regelenSub}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] font-semibold">
                <Link href="/shop/account" className="text-brand-600 hover:underline">
                  {t.shop.regelenVolg}
                </Link>
                <Link href="/shop/account" className="text-brand-600 hover:underline">
                  {t.shop.favorites}
                </Link>
              </p>
            </div>
          </div>
          <div className={kaart}>
            <span className={rond} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H8l-4 4z" />
                <path d="M8 9h8M8 12h5" />
              </svg>
            </span>
            <div>
              <p className="text-[16px] font-bold text-ink">{t.shop.hulpTitel}</p>
              <p className="mt-1 text-[14px] text-neutralx-600">{t.shop.hulpSub}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] font-semibold">
                <Link href="/kennis/faq" className="text-brand-600 hover:underline">
                  {t.shop.faq}
                </Link>
                <Link href="/contact" className="text-brand-600 hover:underline">
                  {t.shop.contact}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
