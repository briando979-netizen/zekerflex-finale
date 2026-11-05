"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { useShopCart } from "@/components/marketing/useShopCart";
import { CART_OPEN_EVENT } from "@/components/marketing/ShopChrome";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { bySize, shopMoney } from "@/components/marketing/shop-product";
import { Paspop } from "@/components/marketing/paskamer/Paspop";
import { FotoBijsnijden } from "@/components/marketing/paskamer/FotoBijsnijden";
import { HUIDKLEUREN, usePaskamer, type Aan, type PaskamerStand } from "@/components/marketing/paskamer/usePaskamer";
import {
  LENGTE_GRENZEN, STANDAARD_LICHAAM, kiesVariant, kleurHex, maatAdvies, maten, matenVan, pastBijSilhouet,
  type Advies, type Bouw, type Lichaam, type Look, type Oordeel, type PaskamerProduct, type PaskamerVariant, type Silhouet, type Slot, type Voorkeur,
} from "@/lib/shop/paskamer";
import type { Gedragen } from "@/lib/shop/paspop-figuur";

// De paskamer: links (op de telefoon bovenaan) de paspop, rechts wat je aan
// hebt en de tabbladen Jij (foto en maten), Kleding en Looks. Alles rekent in
// de browser; de foto en de maten blijven op het toestel (usePaskamer).

type PT = Dict["paskamer"];
type Tab = "kleding" | "looks" | "jij";
type Groep = "alles" | "boven" | "onder" | "voeten" | "hoofd";
const GROEPEN: Record<Groep, Slot[] | null> = {
  alles: null,
  boven: ["top", "midden", "jas", "hesje"],
  onder: ["onder", "riem", "knie"],
  voeten: ["voeten", "sokken"],
  hoofd: ["hoofd", "gezicht", "handen", "tas"],
};

/** Een gedragen product met alles wat het scherm en de tekening nodig hebben. */
type Item = {
  prod: PaskamerProduct;
  maatOpties: string[];
  kleurOpties: string[];
  advies: Advies;
  maat: string | null;
  kleur: string | null;
  variant: PaskamerVariant | null;
  prijs: number;
  leverbaar: boolean;
};

const slotsVan = (p: PaskamerProduct) => p.pasvorm.stukken.map((s) => s.slot);
const botst = (a: PaskamerProduct, b: PaskamerProduct) => slotsVan(a).some((s) => slotsVan(b).includes(s));
const kleurenVan = (p: PaskamerProduct) => [...new Set(p.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))];

function maakItem(prod: PaskamerProduct, a: Pick<Aan, "maat" | "kleur">, l: Lichaam): Item {
  const maatOpties = matenVan(prod, bySize);
  const kleurOpties = kleurenVan(prod);
  const gekozen = a.maat && maatOpties.includes(a.maat) ? a.maat : null;
  const advies = maatAdvies(prod.pasvorm.systeem, maatOpties, l, gekozen);
  const maat = gekozen ?? advies.maat;
  const kleur = a.kleur && kleurOpties.includes(a.kleur) ? a.kleur : (kleurOpties[0] ?? null);
  const variant = kiesVariant(prod, maat, kleur);
  return { prod, maatOpties, kleurOpties, advies, maat, kleur, variant, prijs: variant?.priceCents ?? prod.priceCents, leverbaar: Boolean(variant && variant.stock > 0) };
}

function teken(items: Item[]): Gedragen[] {
  return items.flatMap((it) =>
    it.prod.pasvorm.stukken.map((s) => ({
      slot: s.slot,
      soort: s.soort,
      kleur: s.kleur ?? kleurHex(it.kleur) ?? it.prod.pasvorm.kleur,
      accent: it.prod.pasvorm.accent,
      ruimte: it.advies.ruimte,
    })),
  );
}

const centen = (c: number) => shopMoney(c / 100);

export function Paskamer({ producten, looks, start, startLook = null }: { producten: PaskamerProduct[]; looks: Look[]; start: string | null; startLook?: string | null }) {
  const t = useT();
  const p = t.paskamer;
  const { stand, zet, geladen, fotoNietBewaard } = usePaskamer();
  const { add } = useShopCart();
  const [tab, setTab] = useState<Tab>("kleding");
  const [groep, setGroep] = useState<Groep>("alles");
  const [bestand, setBestand] = useState<File | null>(null);
  const [melding, setMelding] = useState("");
  const [kanDelen, setKanDelen] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const startGedaan = useRef(false);

  const perId = useMemo(() => new Map(producten.map((x) => [x.id, x])), [producten]);
  const l = stand.lichaam;
  const passend = useMemo(() => producten.filter((x) => pastBijSilhouet({ gender: x.gender, systeem: x.pasvorm.systeem }, l.silhouet)), [producten, l.silhouet]);

  const items = useMemo(
    () =>
      stand.aan
        .map((a) => {
          const prod = perId.get(a.productId);
          return prod && pastBijSilhouet({ gender: prod.gender, systeem: prod.pasvorm.systeem }, l.silhouet) ? maakItem(prod, a, l) : null;
        })
        .filter((x): x is Item => x !== null),
    [stand.aan, perId, l],
  );
  const totaal = items.reduce((s, it) => s + it.prijs, 0);

  useEffect(() => {
    setKanDelen(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const trekAan = (prod: PaskamerProduct) =>
    zet((s) => ({ ...s, aan: [...s.aan.filter((a) => { const ander = perId.get(a.productId); return ander && !botst(ander, prod); }), { productId: prod.id, maat: null, kleur: null }] }));
  const trekUit = (id: string) => zet((s) => ({ ...s, aan: s.aan.filter((a) => a.productId !== id) }));
  const wijzigAan = (id: string, w: Partial<Aan>) => zet((s) => ({ ...s, aan: s.aan.map((a) => (a.productId === id ? { ...a, ...w } : a)) }));

  // /shop/paskamer?pas=<slug> (vanaf een productpagina): dat stuk meteen aan;
  // ?look=<id> (vanaf een pakket of de homepage): die hele look aan
  useEffect(() => {
    if (!geladen || startGedaan.current || (!start && !startLook)) return;
    startGedaan.current = true;
    const lk = startLook ? looks.find((x) => x.id === startLook) : null;
    if (lk) return lookAan(lk);
    const prod = producten.find((x) => x.slug === start);
    if (prod && !stand.aan.some((a) => a.productId === prod.id)) trekAan(prod);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het laden
  }, [geladen]);

  const lookAan = (look: Look) => {
    const stukken = look.slugs.map((slug) => producten.find((x) => x.slug === slug)).filter((x): x is PaskamerProduct => Boolean(x));
    const gekozen: PaskamerProduct[] = [];
    for (const prod of stukken) if (pastBijSilhouet({ gender: prod.gender, systeem: prod.pasvorm.systeem }, l.silhouet) && !gekozen.some((g) => botst(g, prod))) gekozen.push(prod);
    zet((s) => ({ ...s, aan: gekozen.map((x) => ({ productId: x.id, maat: null, kleur: null })) }));
    setTab("kleding");
    setMelding("");
  };

  const naarWinkelwagen = () => {
    const mee = items.filter((it) => it.leverbaar && it.variant);
    for (const it of mee) if (it.variant) add(it.variant.id);
    setMelding(fmt(p.toegevoegd, { n: mee.length }) + (mee.length < items.length ? ` ${p.alleenLeverbaar}` : ""));
    if (mee.length > 0) window.dispatchEvent(new Event(CART_OPEN_EVENT));
  };

  const bewaar = async (delen: boolean) => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const blob = await svgNaarPng(svg);
      const bestandsnaam = "mijn-zekerflex-look.png";
      const file = new File([blob], bestandsnaam, { type: "image/png" });
      if (delen && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: p.titel });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = bestandsnaam;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMelding(p.bewaarFout);
    }
  };

  const label = items.length > 0 ? fmt(p.paspopLabel, { items: items.map((it) => it.prod.name).join(", ") }) : p.paspopLeeg;

  return (
    <div className="bg-paper-soft">
      <section aria-labelledby="pk-titel" className="mx-auto max-w-[1440px] px-4 pb-4 pt-6 sm:px-6 lg:px-8 lg:pb-6 lg:pt-8">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-600">{p.eyebrow}</p>
        <h1 id="pk-titel" className="mt-1.5 font-display text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[36px]">
          {p.titel}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-neutralx-600">{p.intro}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-mintwash px-3 py-1 text-[12px] font-semibold text-brand-700">
          <IconSlot /> {p.privacy}
        </p>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8 lg:px-8">
        {/* de paspop: op de telefoon blijft hij bovenaan staan terwijl je kiest */}
        <div className="-mx-4 bg-paper-soft px-4 pb-3 max-lg:sticky max-lg:top-[110px] max-lg:z-20 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:pb-0">
          <div className="relative h-[44vh] min-h-[300px] overflow-hidden rounded-2xl border border-hair bg-[radial-gradient(ellipse_at_50%_34%,#ffffff_0%,#f1ede5_55%,#e4ded2_100%)] shadow-e1 lg:sticky lg:top-[92px] lg:h-[calc(100vh-112px)] lg:max-h-[900px]">
            {/* de achtergrond zit op het vak (over de volle breedte); bij opslaan als foto komt hij in de tekening */}
            <div className={`absolute inset-0 pt-2 ${items.length > 0 ? "pb-[72px]" : "pb-2"}`}>
              <Paspop svgRef={svgRef} lichaam={l} huid={stand.huid} gezicht={stand.gezicht} stukken={teken(items)} label={label} id="pk" achtergrond={false} className="h-full w-full" />
            </div>
            <button
              type="button"
              onClick={() => setTab("jij")}
              className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-bold text-ink shadow-e1 hover:bg-white"
            >
              <IconCamera /> {stand.gezicht ? p.andereFoto : p.selfieKort}
            </button>
            {items.length > 0 && (
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-white/95 p-2 pl-3.5 shadow-e2 backdrop-blur">
                <p className="min-w-0 text-[13px] leading-tight text-neutralx-600">
                  <span className="block font-semibold text-ink">{fmt(p.stuks, { n: items.length })}</span>
                  <span className="text-[15px] font-extrabold text-ink">{centen(totaal)}</span>
                </p>
                <button type="button" onClick={naarWinkelwagen} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 text-[13px] font-bold text-white hover:bg-brand-600">
                  <IconCart /> {p.allesKort}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 min-w-0 lg:mt-0">
          <AanLijst p={p} t={t} items={items} totaal={totaal} kanDelen={kanDelen} melding={melding} onUit={trekUit} onWijzig={wijzigAan} onWinkelwagen={naarWinkelwagen} onBewaar={bewaar} onWissen={() => zet((s) => ({ ...s, aan: [] }))} />

          <div role="tablist" aria-label={p.titel} className="mt-6 grid grid-cols-3 rounded-xl bg-white p-1 shadow-e1">
            {(["kleding", "looks", "jij"] as Tab[]).map((id) => (
              <button
                key={id}
                id={`pk-tab-${id}`}
                role="tab"
                type="button"
                aria-selected={tab === id}
                aria-controls={`pk-paneel-${id}`}
                onClick={() => setTab(id)}
                className={`h-10 rounded-lg text-[14px] font-bold transition ${tab === id ? "bg-brand-500 text-white" : "text-ink hover:bg-paper-soft"}`}
              >
                {id === "kleding" ? p.tabKleding : id === "looks" ? p.tabLooks : p.tabJij}
              </button>
            ))}
          </div>

          <div id={`pk-paneel-${tab}`} role="tabpanel" aria-labelledby={`pk-tab-${tab}`} className="mt-4">
            {tab === "kleding" && <KledingPaneel p={p} t={t} producten={passend} groep={groep} setGroep={setGroep} lichaam={l} aan={stand.aan} onAan={trekAan} onUit={trekUit} />}
            {tab === "looks" && <LooksPaneel p={p} looks={looks} producten={producten} stand={stand} onAan={lookAan} />}
            {tab === "jij" && <JijPaneel p={p} stand={stand} zet={zet} perId={perId} fotoNietBewaard={fotoNietBewaard} onBestand={setBestand} />}
          </div>
        </div>
      </div>

      {bestand && (
        <FotoBijsnijden
          bestand={bestand}
          t={p}
          onAnnuleer={() => setBestand(null)}
          onKlaar={(foto, huid) => {
            zet((s) => ({ ...s, gezicht: foto, ...(huid ? { huid } : {}) }));
            setBestand(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AanLijst({
  p, t, items, totaal, kanDelen, melding, onUit, onWijzig, onWinkelwagen, onBewaar, onWissen,
}: {
  p: PT; t: Dict; items: Item[]; totaal: number; kanDelen: boolean; melding: string;
  onUit: (id: string) => void; onWijzig: (id: string, w: Partial<Aan>) => void; onWinkelwagen: () => void; onBewaar: (delen: boolean) => void; onWissen: () => void;
}) {
  return (
    <section aria-labelledby="pk-aan" className="rounded-2xl border border-hair bg-white p-4 shadow-e1 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pk-aan" className="font-display text-[19px] font-bold text-ink">
          {p.aanTitel}
        </h2>
        {items.length > 0 && (
          <button type="button" onClick={onWissen} className="text-[13px] font-semibold text-neutralx-600 underline-offset-2 hover:text-ink hover:underline">
            {p.wissen}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px] text-neutralx-600">{p.nogNiets}</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-hair">
            {items.map((it) => (
              <li key={it.prod.id} className="flex gap-3 py-3 first:pt-0">
                <Duim prod={it.prod} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/shop/${it.prod.slug}`} className="min-w-0 truncate text-[14px] font-semibold text-ink hover:underline">
                      {it.prod.name}
                    </Link>
                    <span className="shrink-0 text-[14px] font-bold text-ink">{centen(it.prijs)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {it.maatOpties.length > 0 ? (
                      <label className="inline-flex items-center gap-1.5 text-[12px] text-neutralx-600">
                        <span className="sr-only">{fmt(p.maatVan, { naam: it.prod.name })}</span>
                        <select
                          value={it.maat ?? ""}
                          onChange={(e) => onWijzig(it.prod.id, { maat: e.target.value })}
                          className="h-8 rounded-md border border-hairstrong bg-white px-2 text-[13px] font-semibold text-ink"
                        >
                          {it.maatOpties.map((m) => {
                            const op = it.prod.variants.filter((v) => v.size === m).every((v) => v.stock <= 0);
                            return (
                              <option key={m} value={m}>
                                {`${t.shop.size} ${m}${m === it.advies.maat ? ` · ${p.advies}` : ""}${op ? ` · ${t.shop.soldOut}` : ""}`}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ) : (
                      <span className="text-[12px] text-neutralx-500">{p.eenMaat}</span>
                    )}
                    {it.kleurOpties.length > 1 && (
                      <span role="group" aria-label={fmt(p.kleurVan, { naam: it.prod.name })} className="inline-flex gap-1">
                        {it.kleurOpties.map((k) => (
                          <button
                            key={k}
                            type="button"
                            title={k}
                            aria-label={k}
                            aria-pressed={it.kleur === k}
                            onClick={() => onWijzig(it.prod.id, { kleur: k })}
                            className={`h-6 w-6 rounded-full border-2 ${it.kleur === k ? "border-brand-500" : "border-hairstrong"}`}
                            style={{ background: kleurHex(k) ?? "#999" }}
                          />
                        ))}
                      </span>
                    )}
                    {it.maatOpties.length > 0 && <Oordeelbadge p={p} oordeel={it.advies.oordeel} />}
                  </div>
                  {!it.leverbaar && <p className="mt-1 text-[12px] font-semibold text-crit">{p.nietLeverbaar}</p>}
                </div>
                <button type="button" onClick={() => onUit(it.prod.id)} aria-label={fmt(p.uittrekkenNaam, { naam: it.prod.name })} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] text-neutralx-500 hover:bg-paper-soft hover:text-ink">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-hair pt-3">
            <span className="text-[15px] font-bold text-ink">{p.totaal}</span>
            <span className="text-[20px] font-extrabold text-ink">{centen(totaal)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onWinkelwagen} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-[14px] font-bold text-white hover:bg-brand-600">
              <IconCart /> {p.alles}
            </button>
            <button type="button" onClick={() => onBewaar(false)} className="h-11 rounded-lg border border-hairstrong px-4 text-[14px] font-semibold text-ink hover:bg-paper-soft">
              {p.bewaar}
            </button>
            {kanDelen && (
              <button type="button" onClick={() => onBewaar(true)} className="h-11 rounded-lg border border-hairstrong px-4 text-[14px] font-semibold text-ink hover:bg-paper-soft">
                {p.delen}
              </button>
            )}
          </div>
          <p className="mt-2 text-[12px] text-neutralx-500">{p.maattabelUitleg}</p>
        </>
      )}
      {melding && (
        <p role="status" className="mt-3 rounded-lg bg-paper-soft px-3 py-2 text-[13px] font-semibold text-ink">
          {melding}
        </p>
      )}
    </section>
  );
}

const OORDEEL: Record<Oordeel, { cls: string; key: "pastGoed" | "zitNauw" | "valtRuim" | "teKlein" | "teGroot" }> = {
  goed: { cls: "bg-ok/10 text-ok", key: "pastGoed" },
  nauw: { cls: "bg-warn/10 text-warn", key: "zitNauw" },
  ruim: { cls: "bg-warn/10 text-warn", key: "valtRuim" },
  krap: { cls: "bg-crit/10 text-crit", key: "teKlein" },
  "te-ruim": { cls: "bg-crit/10 text-crit", key: "teGroot" },
};

function Oordeelbadge({ p, oordeel }: { p: PT; oordeel: Oordeel }) {
  const o = OORDEEL[oordeel];
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold ${o.cls}`}>{p[o.key]}</span>;
}

function Duim({ prod, groot = false }: { prod: PaskamerProduct; groot?: boolean }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-lg border border-hair bg-paper-soft ${groot ? "aspect-square w-full" : "h-14 w-14"}`}>
      {prod.imageUrl ? (
        <Image src={prod.imageUrl} alt="" fill sizes={groot ? "(min-width: 1024px) 200px, 45vw" : "56px"} className="object-cover" />
      ) : (
        <ProductPlaceholder name={prod.name} slug={prod.slug} category="Kleding" glyphSize={groot ? 48 : 22} className="text-neutralx-300" />
      )}
    </span>
  );
}

function KledingPaneel({
  p, t, producten, groep, setGroep, lichaam, aan, onAan, onUit,
}: {
  p: PT; t: Dict; producten: PaskamerProduct[]; groep: Groep; setGroep: (g: Groep) => void; lichaam: Lichaam; aan: Aan[];
  onAan: (x: PaskamerProduct) => void; onUit: (id: string) => void;
}) {
  const slots = GROEPEN[groep];
  const lijst = slots ? producten.filter((x) => slotsVan(x).some((s) => slots.includes(s))) : producten;
  const labels: Record<Groep, string> = { alles: p.groepAlles, boven: p.groepBoven, onder: p.groepOnder, voeten: p.groepVoeten, hoofd: p.groepHoofd };
  return (
    <div>
      <div role="group" aria-label={t.shop.category} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {(Object.keys(GROEPEN) as Groep[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={groep === g}
            onClick={() => setGroep(g)}
            className={`h-9 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition ${groep === g ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white text-ink hover:border-brand-500"}`}
          >
            {labels[g]}
          </button>
        ))}
      </div>
      {lijst.length === 0 ? (
        <p className="mt-6 text-[14px] text-neutralx-600">{p.geenKleding}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {lijst.map((x) => {
            const isAan = aan.some((a) => a.productId === x.id);
            const maat = maatAdvies(x.pasvorm.systeem, matenVan(x, bySize), lichaam).maat;
            return (
              <li key={x.id} className={`flex flex-col rounded-xl border bg-white p-2.5 transition ${isAan ? "border-brand-500 ring-1 ring-brand-500" : "border-hair"}`}>
                <Duim prod={x} groot />
                <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{x.name}</p>
                <p className="mt-0.5 text-[13px] font-bold text-ink">{centen(x.priceCents)}</p>
                <p className="mt-0.5 text-[12px] text-neutralx-500">{maat ? fmt(p.jouwMaat, { maat }) : p.eenMaat}</p>
                <button
                  type="button"
                  aria-pressed={isAan}
                  onClick={() => (isAan ? onUit(x.id) : onAan(x))}
                  className={`mt-2.5 h-9 rounded-lg text-[13px] font-bold transition ${isAan ? "border border-brand-500 bg-brand-50 text-brand-700" : "bg-ink text-white hover:bg-ink/85"}`}
                >
                  {isAan ? `✓ ${p.aan} · ${p.uittrekken}` : p.aantrekken}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LooksPaneel({ p, looks, producten, stand, onAan }: { p: PT; looks: Look[]; producten: PaskamerProduct[]; stand: PaskamerStand; onAan: (look: Look) => void }) {
  const l = stand.lichaam;
  const voorMij = looks.filter((lk) => lk.voor.includes(l.silhouet));
  return (
    <div>
      <p className="text-[14px] text-neutralx-600">{p.looksUitleg}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {voorMij.map((lk) => {
          const stukken = lk.slugs.map((s) => producten.find((x) => x.slug === s)).filter((x): x is PaskamerProduct => Boolean(x) && pastBijSilhouet({ gender: x?.gender ?? null, systeem: x?.pasvorm.systeem ?? "geen" }, l.silhouet));
          const items = stukken.map((x) => maakItem(x, { maat: null, kleur: null }, l));
          const totaal = items.reduce((s, it) => s + it.prijs, 0);
          return (
            <li key={lk.id} className="flex gap-3 rounded-xl border border-hair bg-white p-3">
              <div className="h-[190px] w-[84px] shrink-0 overflow-hidden rounded-lg bg-paper-soft">
                <Paspop lichaam={l} huid={stand.huid} gezicht={stand.gezicht} stukken={teken(items)} label={fmt(p.paspopLabel, { items: stukken.map((x) => x.name).join(", ") })} id={`lk-${lk.id}`} className="h-full w-full" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="text-[16px] font-bold text-ink">{p.lookTitels[lk.id as keyof PT["lookTitels"]] ?? lk.titel}</h3>
                <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-neutralx-600">{stukken.map((x) => x.name).join(" · ")}</p>
                <p className="mt-auto pt-2 text-[14px] font-extrabold text-ink">{centen(totaal)}</p>
                <button type="button" onClick={() => onAan(lk)} className="mt-2 h-9 rounded-lg bg-ink text-[13px] font-bold text-white hover:bg-ink/85">
                  {p.lookAantrekken}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JijPaneel({
  p, stand, zet, perId, fotoNietBewaard, onBestand,
}: {
  p: PT; stand: PaskamerStand; zet: (w: (s: PaskamerStand) => PaskamerStand) => void; perId: Map<string, PaskamerProduct>; fotoNietBewaard: boolean; onBestand: (f: File) => void;
}) {
  const l = stand.lichaam;
  const m = maten(l);
  const [min, max] = LENGTE_GRENZEN[l.silhouet];
  const zetL = (w: Partial<Lichaam>) => zet((s) => ({ ...s, lichaam: { ...s.lichaam, ...w } }));
  const zetSilhouet = (sil: Silhouet) =>
    zet((s) => ({
      ...s,
      lichaam: { ...STANDAARD_LICHAAM[sil], voorkeur: s.lichaam.voorkeur },
      // wat niet bij het nieuwe silhouet past (kindermaat op een volwassene) gaat uit
      aan: s.aan.filter((a) => {
        const prod = perId.get(a.productId);
        return prod ? pastBijSilhouet({ gender: prod.gender, systeem: prod.pasvorm.systeem }, sil) : false;
      }),
    }));
  const getal = (v: string, lo: number, hi: number): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
  };
  const kies = (selfie: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (selfie) input.setAttribute("capture", "user");
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) onBestand(f);
    };
    input.click();
  };

  return (
    <div className="space-y-5">
      <Blok titel={p.fotoTitel}>
        <div className="flex items-center gap-4">
          <span className="relative h-[88px] w-[70px] shrink-0 overflow-hidden rounded-[50%] border border-hair bg-paper-soft">
            {stand.gezicht ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL uit de browser zelf
              <img src={stand.gezicht} alt={p.fotoTitel} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-neutralx-400" aria-hidden>
                <IconCamera size={24} />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-neutralx-600">{p.fotoUitleg}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => kies(true)} className="h-9 rounded-lg bg-brand-500 px-3.5 text-[13px] font-bold text-white hover:bg-brand-600">
                {p.selfie}
              </button>
              <button type="button" onClick={() => kies(false)} className="h-9 rounded-lg border border-hairstrong px-3.5 text-[13px] font-semibold text-ink hover:bg-paper-soft">
                {stand.gezicht ? p.andereFoto : p.kiesFoto}
              </button>
              {stand.gezicht && (
                <button type="button" onClick={() => zet((s) => ({ ...s, gezicht: null }))} className="h-9 px-2 text-[13px] font-semibold text-crit hover:underline">
                  {p.fotoWeg}
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-neutralx-500">{p.privacy}</p>
        {fotoNietBewaard && (
          <p role="status" className="mt-2 text-[12px] font-semibold text-warn">
            {p.opslagVol}
          </p>
        )}
      </Blok>

      <Blok titel={p.silhouet}>
        <Segment<Silhouet> waarde={l.silhouet} opties={[["heren", p.heren], ["dames", p.dames], ["kind", p.kind]]} onKies={zetSilhouet} label={p.silhouet} />
        <div className="mt-4">
          <label htmlFor="pk-lengte" className="flex items-baseline justify-between text-[14px] font-semibold text-ink">
            {p.lengte} <span className="text-[14px] font-bold">{l.lengte} cm</span>
          </label>
          <input id="pk-lengte" type="range" min={min} max={max} step={1} value={l.lengte} onChange={(e) => zetL({ lengte: Number(e.target.value) })} className="mt-2 w-full accent-brand-500" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Veld id="pk-gewicht" label={p.gewicht} eenheid="kg" waarde={l.gewicht} placeholder={p.gewichtLeeg} onWaarde={(v) => zetL({ gewicht: getal(v, 15, 250) })} />
          <Veld id="pk-schoen" label={p.schoenmaat} waarde={l.schoenmaat} placeholder={String(m.schoenmaat)} onWaarde={(v) => zetL({ schoenmaat: getal(v, 20, 52) })} />
        </div>
        {l.gewicht === null && (
          <div className="mt-4">
            <p className="mb-2 text-[14px] font-semibold text-ink">{p.bouw}</p>
            <Segment<Bouw> waarde={l.bouw} opties={[["slank", p.slank], ["gemiddeld", p.gemiddeld], ["stevig", p.stevig]]} onKies={(bouw) => zetL({ bouw })} label={p.bouw} />
          </div>
        )}
        <details className="group mt-4 rounded-lg border border-hair px-3.5 py-2.5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-ink">
            {p.eigenMaten} <span aria-hidden className="text-[18px] transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 pb-1">
            <Veld id="pk-borst" label={p.borst} eenheid="cm" waarde={l.borst} placeholder={String(Math.round(m.borst))} onWaarde={(v) => zetL({ borst: getal(v, 50, 170) })} />
            <Veld id="pk-taille" label={p.taille} eenheid="cm" waarde={l.taille} placeholder={String(Math.round(m.taille))} onWaarde={(v) => zetL({ taille: getal(v, 40, 170) })} />
          </div>
        </details>
        <p className="mt-3 text-[13px] text-neutralx-600">
          <span className="font-semibold text-ink">{p.jouwMaten}</span>
          {m.geschat.borst || m.geschat.taille ? ` (${p.geschat})` : ""}: {fmt(p.matenRegel, { borst: Math.round(m.borst), taille: Math.round(m.taille), schoen: m.schoenmaat })}
        </p>
        <p className="mt-1 text-[12px] text-neutralx-500">{p.geschatUitleg}</p>
      </Blok>

      <Blok titel={p.voorkeur}>
        <Segment<Voorkeur> waarde={l.voorkeur} opties={[["nauw", p.nauw], ["normaal", p.normaal], ["ruim", p.ruim]]} onKies={(voorkeur) => zetL({ voorkeur })} label={p.voorkeur} />
      </Blok>

      <Blok titel={p.huid}>
        <div role="group" aria-label={p.huid} className="flex flex-wrap gap-2">
          {HUIDKLEUREN.map((k) => (
            <button key={k} type="button" aria-label={k} aria-pressed={stand.huid === k} onClick={() => zet((s) => ({ ...s, huid: k }))} className={`h-9 w-9 rounded-full border-2 ${stand.huid === k ? "border-brand-500 ring-2 ring-brand-500/30" : "border-white shadow-e1"}`} style={{ background: k }} />
          ))}
          {stand.gezicht && !(HUIDKLEUREN as readonly string[]).includes(stand.huid) && (
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-neutralx-600">
              <span className="h-9 w-9 rounded-full border-2 border-brand-500" style={{ background: stand.huid }} aria-hidden />
              {p.huidUitFoto}
            </span>
          )}
        </div>
      </Blok>
    </div>
  );
}

function Blok({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hair bg-white p-4 shadow-e1 sm:p-5">
      <h3 className="mb-3 text-[15px] font-bold text-ink">{titel}</h3>
      {children}
    </section>
  );
}

function Segment<T extends string>({ waarde, opties, onKies, label }: { waarde: T; opties: [T, string][]; onKies: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid rounded-lg bg-paper-soft p-1" style={{ gridTemplateColumns: `repeat(${opties.length}, minmax(0, 1fr))` }}>
      {opties.map(([v, naam]) => (
        <button key={v} type="button" aria-pressed={waarde === v} onClick={() => onKies(v)} className={`h-9 rounded-md text-[13px] font-semibold transition ${waarde === v ? "bg-white text-ink shadow-e1" : "text-neutralx-600 hover:text-ink"}`}>
          {naam}
        </button>
      ))}
    </div>
  );
}

function Veld({ id, label, eenheid, waarde, placeholder, onWaarde }: { id: string; label: string; eenheid?: string; waarde: number | null; placeholder: string; onWaarde: (v: string) => void }) {
  return (
    <label htmlFor={id} className="block text-[13px] font-semibold text-ink">
      {label}
      <span className="mt-1 flex h-10 items-center rounded-lg border border-hairstrong bg-white pr-3 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <input id={id} inputMode="decimal" value={waarde ?? ""} placeholder={placeholder} onChange={(e) => onWaarde(e.target.value)} className="h-full min-w-0 flex-1 rounded-lg bg-transparent px-3 text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-neutralx-400" />
        {eenheid && <span className="text-[13px] text-neutralx-500">{eenheid}</span>}
      </span>
    </label>
  );
}

/** De paspop als PNG (2× zo groot), met de eigen foto erin; alles in de browser. */
async function svgNaarPng(svg: SVGSVGElement): Promise<Blob> {
  const W = 800;
  const H = 2000;
  const kloon = svg.cloneNode(true) as SVGSVGElement;
  kloon.setAttribute("width", String(W));
  kloon.setAttribute("height", String(H));
  // op het scherm zit de achtergrond op het vak; in de foto tekenen we hem mee
  const vlak = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  vlak.setAttribute("width", "400");
  vlak.setAttribute("height", "1000");
  vlak.setAttribute("fill", `url(#${svg.querySelector("radialGradient[id$='-bg']")?.id ?? "pk-bg"})`);
  kloon.querySelector("defs")?.after(vlak);
  const xml = new XMLSerializer().serializeToString(kloon);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new window.Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("geen canvas");
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((ok, fout) => c.toBlob((b) => (b ? ok(b) : fout(new Error("leeg"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function IconCamera({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}
function IconSlot() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
