"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { useShopCart } from "@/components/marketing/useShopCart";

// De shop-homepage: hero-carrousel, productraster, categorie-/inspiratielijsten
// en nieuwsbrief. Promo-balk, header en footer zitten in ShopChrome (layout).

type Category = "Alles" | "Werk & PBM" | "Kleding" | "Werkdag" | "Cadeaus";
type Product = {
  id: string;
  slug?: string | undefined;
  name: string;
  description: string;
  price: number;
  category: Exclude<Category, "Alles">;
  label?: string | null;
  imageUrl?: string | null;
};

const FALLBACK: Product[] = [
  { id: "shoes-s3", slug: "veiligheidsschoenen-s3", name: "Veiligheidsschoenen S3", description: "Stalen neus, doortreedbescherming en antislipzool.", price: 49.95, category: "Werk & PBM", label: "Verplicht PBM", imageUrl: "/shifts/logistiek.jpg" },
  { id: "gloves", slug: "werkhandschoenen-grip", name: "Werkhandschoenen met grip (3 paar)", description: "Ademende nitril-coating, sterke grip.", price: 12.95, category: "Werk & PBM", label: "3 paar", imageUrl: "/shifts/bouw.jpg" },
  { id: "vest", slug: "veiligheidshesje", name: "Reflecterend veiligheidshesje", description: "EN ISO 20471 klasse 2.", price: 6.95, category: "Werk & PBM", label: "Zichtbaarheid", imageUrl: "/shifts/evenement.jpg" },
  { id: "helmet", slug: "veiligheidshelm", name: "Veiligheidshelm wit", description: "EN 397, verstelbaar.", price: 12.95, category: "Werk & PBM", label: "Bouw", imageUrl: "/shifts/bouw.jpg" },
  { id: "tee", slug: "slim-fit-contrast-tshirt-heren", name: "Slim fit contrast-T-shirt heren", description: "95% biologisch katoen, 5% elastaan.", price: 27.95, category: "Kleding", label: "Bio-katoen", imageUrl: "/shop/ringer-tee-1.jpg" },
  { id: "meshbag", slug: "biologische-mesh-boodschappentas", name: "Biologische mesh boodschappentas", description: "100% biologisch katoen, tot 6 kg.", price: 12.95, category: "Werkdag", label: "Bio-katoen", imageUrl: "/shop/mesh-boodschappentas-1.jpg" },
  { id: "hoodie", name: "ZekerFlex Everyday Hoodie", description: "Zware organic katoenmix, relaxed fit.", price: 69, category: "Kleding", label: "Bestseller", imageUrl: null },
  { id: "bottle", name: "Shift Bottle", description: "Dubbelwandig staal, 600 ml.", price: 29, category: "Werkdag", label: "Elke dag", imageUrl: null },
];

const money = (v: number) => `€ ${v.toFixed(2).replace(".", ",")}`;
const SUB_NAV: Category[] = ["Alles", "Werk & PBM", "Kleding", "Werkdag", "Cadeaus"];

const CATEGORY_LINKS = [
  "Veiligheidsschoenen", "Veiligheidssneakers", "Antislip werkschoenen", "Werkhandschoenen",
  "Snijbestendige handschoenen", "Veiligheidshesjes", "Gehoorbescherming", "Veiligheidsbrillen",
  "Kniebeschermers", "Werkbroeken", "Softshell werkjassen", "Veiligheidshelmen",
  "VCA-lesboek", "Werk-T-shirts", "Drinkflessen", "Werktassen",
];
const INSPIRATION = [
  { title: "Magazijnmedewerker", items: "Veiligheidsschoenen S3 · hesje · handschoenen" },
  { title: "Bouwvakker", items: "Helm · werkbroek · veiligheidsbril" },
  { title: "Horeca / keuken", items: "Antislip schoenen · werk-T-shirt" },
  { title: "Evenementen", items: "Hesje · gehoorbescherming · comfortabele schoenen" },
  { title: "Schoonmaak", items: "Handschoenen · antislip schoenen" },
  { title: "Nieuwe collega", items: "Welcome Work Kit · hoodie · fles" },
];
const HERO_SLIDES = [
  { img: "/shifts/logistiek.jpg", kicker: "Werk & PBM", title: "Alles voor een veilige werkdag", sub: "Veiligheidsschoenen, handschoenen en zichtbaarheid — gecertificeerd en op voorraad." },
  { img: "/marketing/team-shift.jpg", kicker: "Voor teams", title: "Rust je hele ploeg in één keer uit", sub: "Bestel op rekening, lever per vestiging. Zakelijke prijzen vanaf 10 stuks." },
  { img: "/shifts/bouw.jpg", kicker: "Bouw", title: "Van helm tot werkbroek", sub: "De complete uitrusting voor op de bouwplaats — morgen in huis." },
];

export function ShopStorefront({ initialCat = "Alles" }: { initialCat?: Category }) {
  const [category, setCategory] = useState<Category>(initialCat);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Product[]>(FALLBACK);
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(true);
  const { add } = useShopCart();
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setCategory(initialCat), [initialCat]);

  useEffect(() => {
    fetch("/api/shop/products", { cache: "no-store" })
      .then(async (r) => (r.ok ? (await r.json()).products : []))
      .then((items: Array<Record<string, unknown>>) => {
        if (!items.length) return;
        setCatalog(
          items.map((it) => ({
            id: String(it.id),
            slug: typeof it.slug === "string" ? it.slug : undefined,
            name: String(it.name),
            description: String(it.description ?? ""),
            price: Number(it.priceCents) / 100,
            category: (it.category as Product["category"]) ?? "Werkdag",
            label: typeof it.badge === "string" ? it.badge : null,
            imageUrl: typeof it.imageUrl === "string" ? it.imageUrl : null,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 6000);
    return () => clearInterval(t);
  }, [playing]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (p) =>
        (category === "Alles" || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
  }, [catalog, category, query]);

  const pick = (c: Category) => {
    setCategory(c);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* hero-carrousel */}
      <section className="relative">
        <div className="relative h-[340px] overflow-hidden md:h-[440px]">
          {HERO_SLIDES.map((s, i) => (
            <div key={s.title} className={`absolute inset-0 transition-opacity duration-700 ${i === slide ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.img} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/45 to-transparent" />
              <div className="shell absolute inset-0 flex flex-col justify-center text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-mint">{s.kicker}</p>
                <h1 className="mt-3 max-w-xl font-display text-3xl font-bold leading-tight md:text-5xl">{s.title}</h1>
                <p className="mt-3 max-w-md text-sm text-white/75 md:text-base">{s.sub}</p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  {([
                    { label: "Werk & PBM", cat: "Werk & PBM" as Category },
                    { label: "Kleding", cat: "Kleding" as Category },
                    { label: "Voor teams", cat: "Cadeaus" as Category },
                  ]).map((b) => (
                    <button key={b.label} type="button" onClick={() => pick(b.cat)} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-mint">{b.label}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button type="button" aria-label="Vorige" onClick={() => setSlide((s) => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)} className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg text-ink hover:bg-white">‹</button>
          <button type="button" aria-label="Volgende" onClick={() => setSlide((s) => (s + 1) % HERO_SLIDES.length)} className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg text-ink hover:bg-white">›</button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
            {HERO_SLIDES.map((s, i) => (
              <button key={s.title} type="button" aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-white" : "w-1.5 bg-white/50"}`} />
            ))}
            <button type="button" aria-label={playing ? "Pauzeer" : "Afspelen"} onClick={() => setPlaying((p) => !p)} className="ml-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-[11px] text-ink">{playing ? "❚❚" : "▶"}</button>
          </div>
        </div>
      </section>

      <div className="border-b border-hair bg-paper-soft">
        <div className="shell flex flex-wrap justify-center gap-x-8 gap-y-2 py-3 text-xs font-semibold text-neutralx-600">
          <span>✓ Gecertificeerde PBM (EN-normen)</span>
          <span>✓ Voor 22:00 besteld, morgen in huis</span>
          <span>✓ Zakelijk bestellen op rekening</span>
          <span>✓ 30 dagen retour</span>
        </div>
      </div>

      {/* productraster */}
      <section ref={gridRef} className="shell scroll-mt-24 py-12 md:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">{category === "Alles" ? "Alle producten" : category}</h2>
            <p className="mt-1 text-sm text-neutralx-500">{shown.length} artikelen</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-hairstrong px-4 py-1.5">
              <IconSearch />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken" className="w-28 bg-transparent text-sm outline-none placeholder:text-neutralx-400 focus:w-40" />
            </label>
            {SUB_NAV.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${category === c ? "border-ink bg-ink text-white" : "border-hairstrong hover:border-ink"}`}>{c}</button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutralx-500">Geen artikelen gevonden.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => {
              const inner = (
                <>
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-paper-soft">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="grid h-full w-full place-items-center"><LogoGlyph size={64} tone="dark" /></div>
                    )}
                    {p.label && <span className="absolute left-3 top-3 rounded bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">{p.label}</span>}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); add(p.id); }}
                      className="absolute inset-x-3 bottom-3 rounded-lg bg-ink py-2 text-sm font-bold text-white opacity-0 transition group-hover:opacity-100"
                    >
                      In winkelwagen
                    </button>
                  </div>
                  <div className="mt-3">
                    <h3 className="text-sm font-semibold leading-snug">{p.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutralx-500">{p.description}</p>
                    <p className="mt-1.5 text-sm font-bold">{money(p.price)}</p>
                  </div>
                </>
              );
              return p.slug ? (
                <Link key={p.id} href={`/shop/${p.slug}`} id={p.slug} className="group scroll-mt-28">{inner}</Link>
              ) : (
                <article key={p.id} id={p.id} className="group scroll-mt-28">{inner}</article>
              );
            })}
          </div>
        )}
      </section>

      <section className="border-t border-hair bg-paper-soft py-12 md:py-16">
        <div className="shell">
          <h2 className="font-display text-2xl font-bold">Meer categorieën</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-neutralx-600 sm:grid-cols-3 lg:grid-cols-4">
            {CATEGORY_LINKS.map((c) => (
              <button key={c} type="button" onClick={() => { setCategory("Alles"); setQuery(c.split(" ")[0] ?? c); gridRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="text-left transition hover:text-brand-600 hover:underline">{c}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-12 md:py-16">
        <h2 className="font-display text-2xl font-bold">Dit heb je nodig voor…</h2>
        <p className="mt-1 text-sm text-neutralx-500">Kant-en-klare pakketten per soort werk.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INSPIRATION.map((b) => (
            <button key={b.title} type="button" onClick={() => pick("Werk & PBM")} className="rounded-2xl border border-hair p-5 text-left transition hover:border-ink hover:shadow-card">
              <p className="font-display text-lg font-bold">{b.title}</p>
              <p className="mt-1.5 text-sm text-neutralx-500">{b.items}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-brand-600">Bekijk →</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-t border-hair bg-ink text-white">
        <div className="shell grid gap-8 py-12 md:grid-cols-2 md:py-16">
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">Deals, nieuwe PBM en tips<br />rechtstreeks in je e-mail</h2>
            <p className="mt-3 max-w-md text-sm text-white/60">Ontvang kortingen, nieuwe producten en werkveiligheidstips in onze nieuwsbrief.</p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector("input[type=email]") as HTMLInputElement).value = ""; alert("Bedankt! Bevestig je inschrijving via de e-mail die we sturen."); }}
            className="space-y-4"
          >
            <label className="block text-xs font-semibold text-white/60">
              Je e-mailadres
              <input type="email" required className="mt-1.5 w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/60" placeholder="naam@voorbeeld.nl" />
            </label>
            <fieldset className="flex flex-wrap gap-5 text-sm">
              <span className="font-semibold text-white/70">Interesse:</span>
              <label className="flex items-center gap-2"><input type="radio" name="pref" defaultChecked className="accent-brand-mint" /> Werkkleding & PBM</label>
              <label className="flex items-center gap-2"><input type="radio" name="pref" className="accent-brand-mint" /> Zakelijk bestellen</label>
            </fieldset>
            <button type="submit" className="w-full rounded-lg bg-brand-mint py-3 text-sm font-bold text-ink transition hover:brightness-95">Mijn inschrijving bevestigen</button>
            <p className="text-[11px] text-white/60">Bekijk ons privacybeleid voor meer informatie. Je kunt je op elk moment kosteloos uitschrijven.</p>
          </form>
        </div>
      </section>
    </>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-neutralx-400">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}
