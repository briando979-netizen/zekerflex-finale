import { PaskamerLink } from "@/components/marketing/PaskamerLink";
import Image from "next/image";
import Link from "next/link";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { shopMoney } from "@/components/marketing/shop-product";

// De vaste delen van /shop/zakelijk (servercomponenten, geen JavaScript):
// de kop, de voordelen en de pakketten per branche. De teambestelling en het
// offerteformulier staan in ZakelijkBestellen.

type ZT = Dict["shopZakelijk"];
const WRAP = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8";

export function ZakelijkHero({ z }: { z: ZT }) {
  return (
    <section aria-labelledby="zk-kop" className="bg-paper-soft">
      <div className={`${WRAP} py-4 sm:py-6`}>
        <div className="relative isolate overflow-hidden rounded-2xl bg-brand-700 text-white">
          <Image src="/shifts/bouw.jpg" alt="" fill priority sizes="(min-width: 1440px) 1376px, 100vw" className="-z-10 object-cover object-[70%_center]" />
          <span aria-hidden className="absolute inset-0 -z-10 bg-brand-700/85 sm:bg-transparent sm:bg-gradient-to-r sm:from-brand-700 sm:via-brand-700/92 sm:to-brand-700/20" />
          <div className="max-w-2xl p-6 sm:p-10 lg:p-14">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-mint">{z.eyebrow}</p>
            <h1 id="zk-kop" className="mt-3 font-display text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              {z.titel}
            </h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/90 sm:text-[16px]">{z.sub}</p>
            <ul className="mt-5 grid gap-2 text-[14px] text-white/95 sm:grid-cols-2">
              {z.heroPunten.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Vink /> {p}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="#team" className="inline-flex h-12 items-center rounded-lg bg-brand-mint px-6 text-[15px] font-bold text-ink transition hover:brightness-95">
                {z.ctaTeam}
              </Link>
              <Link href="#offerte" className="inline-flex h-12 items-center rounded-lg border border-white/50 px-6 text-[15px] font-bold text-white transition hover:bg-white/10">
                {z.ctaOfferte}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const VOORDEEL_ICOON = [
  "M4 7h16M4 12h10M4 17h7M17 15l2 2 4-4", // prijzen zonder btw
  "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4", // op rekening
  "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z", // per vestiging
  "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4", // gecertificeerd
];

export function ZakelijkVoordelen({ z }: { z: ZT }) {
  return (
    <section aria-labelledby="zk-voordelen" className="bg-white">
      <div className={`${WRAP} py-10`}>
        <h2 id="zk-voordelen" className="font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
          {z.voordelenTitel}
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {z.voordelen.map((v, i) => (
            <li key={v.titel} className="flex items-start gap-3.5 rounded-xl border border-hair bg-white p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={VOORDEEL_ICOON[i] ?? VOORDEEL_ICOON[0]} />
                </svg>
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">{v.titel}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-neutralx-600">{v.tekst}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type PakketKaart = {
  id: string;
  look: string | null;
  items: { id: string; slug: string; name: string; imageUrl: string | null; category: string }[];
  /** prijs per persoon (van elk artikel één), zonder btw */
  perPersoonExcl: number;
};

export function ZakelijkPakketten({ z, pakketten }: { z: ZT; pakketten: PakketKaart[] }) {
  if (pakketten.length === 0) return null;
  return (
    <section id="pakketten" aria-labelledby="zk-pakketten" className="scroll-mt-32 border-t border-hair bg-white lg:scroll-mt-24">
      <div className={`${WRAP} py-10 lg:py-14`}>
        <h2 id="zk-pakketten" className="font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
          {z.pakkettenTitel}
        </h2>
        <p className="mt-1 text-[14px] text-neutralx-600">{z.pakkettenSub}</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pakketten.map((pk) => (
            <li key={pk.id} className="flex flex-col rounded-2xl border border-hair bg-white p-4 transition hover:border-hairstrong hover:shadow-e2 sm:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[18px] font-bold text-ink">{z.pakketTitels[pk.id as keyof ZT["pakketTitels"]] ?? pk.id}</h3>
                <span className="shrink-0 text-[12px] font-semibold text-neutralx-500">{fmt(z.pakketStuks, { n: pk.items.length })}</span>
              </div>
              <ul className="mt-3 flex gap-1.5" aria-hidden>
                {pk.items.slice(0, 6).map((it) => (
                  <li key={it.id} className="relative aspect-square w-1/6 overflow-hidden rounded-lg border border-hair bg-paper-soft">
                    {it.imageUrl ? <Image src={it.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : <ProductPlaceholder name={it.name} slug={it.slug} category={it.category} glyphSize={20} className="text-neutralx-300" />}
                  </li>
                ))}
              </ul>
              <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-neutralx-600">{pk.items.map((it) => it.name).join(" · ")}</p>
              <p className="mt-auto pt-4 text-ink">
                <span className="text-[22px] font-extrabold tracking-tight">{shopMoney(pk.perPersoonExcl / 100)}</span>{" "}
                <span className="text-[12px] font-semibold text-neutralx-500">{z.pakketPerPersoon}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/shop/zakelijk?pakket=${pk.id}#team`} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-[13px] font-bold text-white hover:bg-brand-600">
                  {z.pakketBestel}
                </Link>
                {pk.look && (
                  <PaskamerLink href={`/shop/paskamer?look=${pk.look}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-hairstrong px-4 text-[13px] font-semibold text-ink hover:bg-paper-soft">
                    {z.pakketPaspop}
                  </PaskamerLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Vink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-mint" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
