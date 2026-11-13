import { PaskamerLink } from "@/components/marketing/PaskamerLink";
import Image from "next/image";
import Link from "next/link";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { ShopPrijs } from "@/components/marketing/ShopPrijs";
import { Paspop } from "@/components/marketing/paskamer/Paspop";
import { STANDAARD_LICHAAM, pasvormVoor, type Look } from "@/lib/shop/paskamer";
import type { Gedragen } from "@/lib/shop/paspop-figuur";

// De startpagina van de shop voor gewone klanten (5 nov 2026): een warme kop
// met een grote foto (13 nov: de teamfoto van de eigenaar), grote categorietegels en "Shop de look" met paspoppen.
// Servercomponenten; alleen de prijs (particulier/zakelijk) is een klein
// clientonderdeel.

const WRAP = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8";
const H2 = "font-display text-[24px] font-extrabold tracking-tight text-ink sm:text-[30px]";

/** De foto van de kop als de beheerder er geen koos (Beheer → Webshop → Foto's en video's). Eigen foto van de eigenaar. */
export const SHOP_KOP_FOTO = { src: "/shop/kop-team.jpg", alt: "Vier mensen in ZekerFlex-kleding lachen samen voor een bakstenen muur met het ZF-logo" } as const;

export function ShopThuisHero({ t, foto = SHOP_KOP_FOTO }: { t: Dict; foto?: { src: string; alt: string } }) {
  const h = t.shopThuis;
  return (
    <section aria-labelledby="shop-kop" className="overflow-hidden bg-[#f4efe6]">
      <div className={`${WRAP} grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 lg:py-12`}>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand-600">{h.heroEyebrow}</p>
          <h1 id="shop-kop" className="mt-3 font-display text-[2.4rem] font-extrabold leading-[1.02] tracking-tight text-ink sm:text-6xl">
            {h.heroTitel}
          </h1>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-neutralx-700 sm:text-[17px]">{h.heroSub}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#collectie" className="inline-flex h-12 items-center rounded-full bg-ink px-7 text-[15px] font-bold text-white transition hover:bg-ink/85">
              {h.heroKnop}
            </Link>
            <PaskamerLink href="/shop/paskamer" className="inline-flex h-12 items-center gap-2 rounded-full border border-ink/20 bg-white px-6 text-[15px] font-bold text-ink transition hover:border-ink/40">
              {h.heroPaskamer}
              <span className="rounded-full bg-brand-mint px-1.5 py-px text-[10px] font-bold uppercase tracking-wide">{t.paskamer.nieuw}</span>
            </PaskamerLink>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-neutralx-700">
            {[t.shop.uspNextDay, t.shop.freeShipping, t.shop.uspReturns].map((u) => (
              <li key={u} className="flex items-center gap-1.5">
                <Vink /> {u}
              </li>
            ))}
          </ul>
        </div>
        {/* de foto van de kop: rechts in een afgerond kader, op de telefoon onder de tekst. Een vaste verhouding, dus niets verspringt. */}
        <div className="relative mx-auto w-full max-w-[560px] lg:ml-auto lg:mr-0">
          <span aria-hidden className="absolute -bottom-3 -right-3 hidden h-2/3 w-2/3 rounded-[1.75rem] bg-brand-mint/40 sm:block" />
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-ink shadow-e2 ring-1 ring-ink/10 lg:aspect-square">
            <Image src={foto.src} alt={foto.alt} fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover object-[50%_18%]" />
          </div>
        </div>
      </div>
    </section>
  );
}

export type GroteTegel = { cat: string; label: string; sub: string; image: string | null; count: number };

export function ShopCategorieGroot({ t, tegels }: { t: Dict; tegels: GroteTegel[] }) {
  if (tegels.length < 2) return null;
  return (
    <section aria-labelledby="shop-categorieen" className="bg-white">
      <div className={`${WRAP} py-10 lg:py-14`}>
        <h2 id="shop-categorieen" className={H2}>
          {t.shopThuis.categorieTitel}
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tegels.map((c) => (
            <li key={c.cat}>
              <Link href={`/shop?cat=${encodeURIComponent(c.cat)}#collectie`} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-ink">
                {c.image && <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover opacity-90 transition duration-700 group-hover:scale-[1.05] group-hover:opacity-100" />}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[17px] font-extrabold sm:text-[20px]">{c.label}</span>
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 transition group-hover:bg-brand-mint group-hover:text-ink">
                      →
                    </span>
                  </span>
                  <span className="mt-1 block text-[12px] text-white/85 sm:text-[13px]">{c.sub}</span>
                  <span className="mt-1 block text-[11px] font-semibold text-white/70">{fmt(t.shop.articles, { n: c.count })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type LookKaart = { look: Look; stukken: { slug: string; name: string; priceCents: number; kleur: string | null }[] };

const kleurVoor = (slug: string, gekozen: string | null) => {
  const p = pasvormVoor({ slug, name: slug });
  if (!p) return [];
  return p.stukken.map((s): Gedragen => ({ slot: s.slot, soort: s.soort, kleur: s.kleur ?? gekozen ?? p.kleur, accent: p.accent, ruimte: 0 }));
};

export function ShopLooks({ t, looks }: { t: Dict; looks: LookKaart[] }) {
  if (looks.length === 0) return null;
  const pk = t.paskamer;
  return (
    <section aria-labelledby="shop-looks" className="bg-[#f4efe6]">
      <div className={`${WRAP} py-10 lg:py-14`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="shop-looks" className={H2}>
              {t.shopThuis.looksTitel}
            </h2>
            <p className="mt-1 text-[14px] text-neutralx-600">{t.shopThuis.looksSub}</p>
          </div>
          <PaskamerLink href="/shop/paskamer" className="text-[14px] font-bold text-brand-700 underline underline-offset-4">
            {pk.promoKnop} →
          </PaskamerLink>
        </div>
        <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0">
          {looks.map(({ look, stukken }) => {
            const lichaam = STANDAARD_LICHAAM[look.voor.includes("heren") ? "heren" : look.voor[0] ?? "heren"];
            const totaal = stukken.reduce((s, x) => s + x.priceCents, 0);
            return (
              <li key={look.id} className="w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-auto">
                <PaskamerLink href={`/shop/paskamer?look=${look.id}`} className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-e1 transition hover:shadow-e2">
                  <span className="relative block h-[300px] bg-[radial-gradient(ellipse_at_50%_35%,#ffffff_0%,#efe9de_100%)] pt-3">
                    <Paspop
                      id={`look-${look.id}`}
                      lichaam={lichaam}
                      huid={look.id === "kantoor-dames" ? "#a86f4c" : "#d9a989"}
                      stukken={stukken.flatMap((s) => kleurVoor(s.slug, s.kleur))}
                      label={fmt(pk.paspopLabel, { items: stukken.map((s) => s.name).join(", ") })}
                      achtergrond={false}
                      className="mx-auto h-full w-auto transition duration-500 group-hover:scale-[1.03]"
                    />
                  </span>
                  <span className="flex flex-1 flex-col p-4">
                    <span className="text-[17px] font-extrabold text-ink">{pk.lookTitels[look.id as keyof typeof pk.lookTitels] ?? look.titel}</span>
                    <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-neutralx-600">{stukken.map((s) => s.name).join(" · ")}</span>
                    <span className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <ShopPrijs centen={totaal} product={{ slug: look.id }} />
                      <span className="shrink-0 text-[13px] font-bold text-brand-700 group-hover:underline">{t.shopThuis.lookBekijk} →</span>
                    </span>
                  </span>
                </PaskamerLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Vink() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ok" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
