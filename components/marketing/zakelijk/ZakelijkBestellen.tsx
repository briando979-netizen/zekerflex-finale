"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { useShopCart } from "@/components/marketing/useShopCart";
import { CART_OPEN_EVENT } from "@/components/marketing/ShopChrome";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { bySize, shopMoney } from "@/components/marketing/shop-product";
import { btwTarief, zonderBtw } from "@/lib/shop/modus";
import { OFFERTE_WENSEN, lijstAlsCsv, lijstSamenvatting, lijstTotaal, verdeelOverMaten, type LijstRegel, type OfferteWens } from "@/lib/shop/zakelijk";

// De teambestelling en het offerteverzoek op /shop/zakelijk. Teambestelling:
// kies een pakket of losse artikelen, vul per maat in hoeveel je nodig hebt (of
// laat een aantal medewerkers over de maten verdelen) en zet alles in één keer
// in de winkelwagen, download de lijst of stuur hem mee met een offerte.

export type TeamVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number };
export type TeamProduct = { id: string; slug: string; name: string; imageUrl: string | null; priceCents: number; category: string; variants: TeamVariant[] };
export type TeamPakket = { id: string; productIds: string[] };

type ZT = Dict["shopZakelijk"];
const MAX_PER_REGEL = 99; // zelfde grens als de bestel-API per regel
const centen = (c: number) => shopMoney(c / 100);

/** De maten (of één "maatloze" regel) van een product, met de variant per maat (eerste kleur). */
function regelsVan(p: TeamProduct, kleur: string | null): { maat: string | null; variant: TeamVariant }[] {
  const metKleur = p.variants.filter((v) => !kleur || v.color === kleur);
  const maten = [...new Set(metKleur.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(bySize);
  if (maten.length === 0) return metKleur[0] ? [{ maat: null, variant: metKleur[0] }] : [];
  return maten.map((m) => ({ maat: m, variant: metKleur.find((v) => v.size === m) as TeamVariant }));
}
const kleurenVan = (p: TeamProduct) => [...new Set(p.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))];

export function ZakelijkBestellen({ producten, pakketten, startPakket }: { producten: TeamProduct[]; pakketten: TeamPakket[]; startPakket: string | null }) {
  const t = useT();
  const z = t.shopZakelijk;
  const { add } = useShopCart();
  const perId = useMemo(() => new Map(producten.map((p) => [p.id, p])), [producten]);
  const [gekozen, setGekozen] = useState<string[]>([]);
  const [pakket, setPakket] = useState<string | null>(null);
  const [kleur, setKleur] = useState<Record<string, string | null>>({});
  const [aantal, setAantal] = useState<Record<string, number>>({});
  const [mensen, setMensen] = useState(10);
  const [melding, setMelding] = useState("");
  const [lijstVoorOfferte, setLijstVoorOfferte] = useState("");

  const kiesPakket = (id: string) => {
    const pk = pakketten.find((x) => x.id === id);
    if (!pk) return;
    setPakket(id);
    setGekozen(pk.productIds.filter((pid) => perId.has(pid)));
    setAantal({});
    setMelding("");
  };
  // /shop/zakelijk?pakket=bouw#team (vanaf een pakketkaart)
  useEffect(() => {
    if (startPakket) kiesPakket(startPakket);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen als de link een ander pakket meegeeft
  }, [startPakket]);

  const zetAantal = (variantId: string, n: number) => setAantal((a) => ({ ...a, [variantId]: Math.max(0, Math.min(MAX_PER_REGEL, Math.floor(n) || 0)) }));
  const verdeel = () => {
    const nieuw: Record<string, number> = {};
    for (const pid of gekozen) {
      const p = perId.get(pid);
      if (!p) continue;
      const regels = regelsVan(p, kleur[pid] ?? kleurenVan(p)[0] ?? null);
      const verdeling = verdeelOverMaten(regels.map((r) => r.maat ?? "één"), mensen);
      for (const r of regels) nieuw[r.variant.id] = Math.min(MAX_PER_REGEL, r.maat ? (verdeling[r.maat] ?? 0) : mensen);
    }
    setAantal(nieuw);
  };

  const lijst: (LijstRegel & { variantId: string })[] = useMemo(
    () =>
      gekozen.flatMap((pid) => {
        const p = perId.get(pid);
        if (!p) return [];
        const k = kleur[pid] ?? kleurenVan(p)[0] ?? null;
        return regelsVan(p, k).map((r) => ({ variantId: r.variant.id, naam: p.name, slug: p.slug, maat: r.maat, kleur: k, aantal: aantal[r.variant.id] ?? 0, centenIncl: r.variant.priceCents ?? p.priceCents }));
      }),
    [gekozen, perId, kleur, aantal],
  );
  const tot = lijstTotaal(lijst);

  const inWagen = () => {
    const mee = lijst.filter((r) => r.aantal > 0);
    for (const r of mee) add(r.variantId, r.aantal);
    setMelding(fmt(z.teamToegevoegd, { n: tot.stuks }));
    if (mee.length) window.dispatchEvent(new Event(CART_OPEN_EVENT));
  };
  const download = () => {
    const csv = lijstAlsCsv(lijst, { artikel: z.csvArtikel, maat: z.csvMaat, kleur: z.csvKleur, aantal: z.csvAantal, stukExcl: z.csvStukExcl, totaalExcl: z.csvTotaalExcl });
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "zekerflex-bestellijst.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const naarOfferte = () => {
    setLijstVoorOfferte(lijstSamenvatting(lijst));
    document.getElementById("offerte")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nogTeKiezen = producten.filter((p) => !gekozen.includes(p.id));

  return (
    <>
      <section id="team" aria-labelledby="zk-team" className="scroll-mt-32 border-t border-hair bg-paper-soft lg:scroll-mt-24">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-600">{z.teamEyebrow}</p>
          <h2 id="zk-team" className="mt-1.5 font-display text-[26px] font-extrabold tracking-tight text-ink sm:text-[32px]">
            {z.teamTitel}
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] text-neutralx-600">{z.teamSub}</p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-ink">{z.teamKiesPakket}</p>
              <div role="group" aria-label={z.teamKiesPakket} className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
                {pakketten.map((pk) => (
                  <button
                    key={pk.id}
                    type="button"
                    aria-pressed={pakket === pk.id}
                    onClick={() => kiesPakket(pk.id)}
                    className={`h-9 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition ${pakket === pk.id ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white text-ink hover:border-brand-500"}`}
                  >
                    {z.pakketTitels[pk.id as keyof ZT["pakketTitels"]] ?? pk.id}
                  </button>
                ))}
              </div>

              <label className="mt-4 flex max-w-md items-center gap-2 text-[13px] font-semibold text-ink">
                <span className="shrink-0">{z.teamLosToevoegen}</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setGekozen((g) => [...g, e.target.value]);
                    setPakket(null);
                  }}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-hairstrong bg-white px-2 text-[13px] font-semibold text-ink"
                >
                  <option value="">{z.teamKiesArtikel}</option>
                  {nogTeKiezen.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              {gekozen.length === 0 ? (
                <p className="mt-6 rounded-xl border border-dashed border-hairstrong bg-white px-4 py-8 text-center text-[14px] text-neutralx-600">{z.teamLeeg}</p>
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-hair bg-white p-4">
                    <label className="text-[13px] font-semibold text-ink">
                      {z.teamMensen}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        value={mensen}
                        onChange={(e) => setMensen(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                        className="mt-1 block h-10 w-24 rounded-lg border border-hairstrong px-3 text-[14px] font-semibold"
                      />
                    </label>
                    <button type="button" onClick={verdeel} className="h-10 rounded-lg bg-ink px-4 text-[13px] font-bold text-white hover:bg-ink/85">
                      {z.teamVerdeel}
                    </button>
                    <p className="basis-full text-[12px] text-neutralx-500">{z.teamVerdeelUitleg}</p>
                  </div>

                  <ul className="mt-4 space-y-3">
                    {gekozen.map((pid) => {
                      const p = perId.get(pid);
                      if (!p) return null;
                      const kleuren = kleurenVan(p);
                      const k = kleur[pid] ?? kleuren[0] ?? null;
                      const regels = regelsVan(p, k);
                      const tarief = btwTarief(p);
                      return (
                        <li key={pid} className="rounded-xl border border-hair bg-white p-4">
                          <div className="flex items-start gap-3">
                            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-hair bg-paper-soft">
                              {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : <ProductPlaceholder name={p.name} slug={p.slug} category={p.category} glyphSize={22} className="text-neutralx-300" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-ink">{p.name}</p>
                              <p className="text-[12px] text-neutralx-500">
                                {fmt(z.perStukExcl, { bedrag: centen(zonderBtw(p.priceCents, tarief)) })}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setGekozen((g) => g.filter((x) => x !== pid));
                                setPakket(null);
                              }}
                              aria-label={fmt(z.teamWeg, { naam: p.name })}
                              className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] text-neutralx-500 hover:bg-paper-soft hover:text-ink"
                            >
                              ×
                            </button>
                          </div>
                          {kleuren.length > 1 && (
                            <label className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
                              {t.shop.color}
                              <select value={k ?? ""} onChange={(e) => setKleur((c) => ({ ...c, [pid]: e.target.value }))} className="h-9 rounded-md border border-hairstrong bg-white px-2 text-[13px]">
                                {kleuren.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
                            {regels.map((r) => (
                              <label key={r.variant.id} className="block text-center text-[12px] font-semibold text-neutralx-600">
                                {r.maat ?? z.teamAantal}
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={MAX_PER_REGEL}
                                  value={aantal[r.variant.id] ?? 0}
                                  onChange={(e) => zetAantal(r.variant.id, Number(e.target.value))}
                                  aria-label={`${p.name} ${r.maat ? `${t.shop.size} ${r.maat}` : z.teamAantal}`}
                                  className={`mt-1 block h-10 w-full rounded-lg border px-1 text-center text-[14px] font-bold text-ink ${(aantal[r.variant.id] ?? 0) > 0 ? "border-brand-500 bg-brand-50" : "border-hairstrong bg-white"}`}
                                />
                                {r.variant.stock <= 0 && <span className="mt-0.5 block text-[10px] font-semibold text-crit">{t.shop.soldOut}</span>}
                              </label>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            <aside aria-label={z.teamOverzicht} className="h-fit rounded-2xl border border-hair bg-white p-5 shadow-e1 lg:sticky lg:top-24">
              <p className="text-[16px] font-bold text-ink">{z.teamOverzicht}</p>
              <dl className="mt-3 space-y-1.5 text-[14px]">
                <div className="flex justify-between text-neutralx-600">
                  <dt>{z.teamStuks}</dt>
                  <dd className="font-semibold text-ink">{tot.stuks}</dd>
                </div>
                <div className="flex justify-between text-neutralx-600">
                  <dt>{z.subtotaalExcl}</dt>
                  <dd className="font-semibold text-ink">{centen(tot.excl)}</dd>
                </div>
                <div className="flex justify-between text-neutralx-600">
                  <dt>{z.btw}</dt>
                  <dd className="font-semibold text-ink">{centen(tot.btw)}</dd>
                </div>
                <div className="flex justify-between border-t border-hair pt-2 text-[16px]">
                  <dt className="font-bold text-ink">{z.totaalIncl}</dt>
                  <dd className="font-extrabold text-ink">{centen(tot.incl)}</dd>
                </div>
              </dl>
              {tot.stuks >= 10 && <p className="mt-3 rounded-lg bg-money-soft px-3 py-2 text-[12px] font-semibold text-money-ink">{z.teamTienPlus}</p>}
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={inWagen} disabled={tot.stuks === 0} className="h-11 rounded-lg bg-brand-500 text-[14px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">
                  {z.teamInWagen}
                </button>
                <button type="button" onClick={naarOfferte} disabled={tot.stuks === 0} className="h-11 rounded-lg border border-brand-500 text-[14px] font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                  {z.teamNaarOfferte}
                </button>
                <button type="button" onClick={download} disabled={tot.stuks === 0} className="h-10 text-[13px] font-semibold text-neutralx-600 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50">
                  {z.teamCsv}
                </button>
              </div>
              {melding && (
                <p role="status" className="mt-3 text-[13px] font-semibold text-ok">
                  {melding}
                </p>
              )}
            </aside>
          </div>
        </div>
      </section>

      <OfferteFormulier z={z} lijst={lijstVoorOfferte} />
    </>
  );
}

function OfferteFormulier({ z, lijst }: { z: ZT; lijst: string }) {
  const [form, setForm] = useState({ bedrijf: "", naam: "", email: "", telefoon: "", medewerkers: "", bericht: "", akkoord: false });
  const [wensen, setWensen] = useState<OfferteWens[]>([]);
  const [status, setStatus] = useState<"rust" | "bezig" | "klaar">("rust");
  const [fout, setFout] = useState("");
  const zet = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const verstuur = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.akkoord) return setFout(z.offerteAkkoordNodig);
    setStatus("bezig");
    setFout("");
    try {
      const n = Number(form.medewerkers);
      const res = await fetch("/api/shop/offerte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bedrijf: form.bedrijf,
          naam: form.naam,
          email: form.email,
          ...(form.telefoon.trim() ? { telefoon: form.telefoon.trim() } : {}),
          ...(Number.isInteger(n) && n > 0 ? { medewerkers: n } : {}),
          wensen,
          ...(form.bericht.trim() ? { bericht: form.bericht.trim() } : {}),
          ...(lijst ? { lijst } : {}),
          akkoord: true,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus("rust");
        return setFout(d.error?.message ?? z.offerteFout);
      }
      setStatus("klaar");
    } catch {
      setStatus("rust");
      setFout(z.offerteFout);
    }
  };

  const wensNaam: Record<OfferteWens, string> = { logo: z.wensLogo, rekening: z.wensRekening, vestigingen: z.wensVestigingen };
  const veld = "mt-1 block h-11 w-full rounded-lg border border-hairstrong bg-white px-3 text-[14px] text-ink outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

  return (
    <section id="offerte" aria-labelledby="zk-offerte" className="scroll-mt-32 bg-ink text-white lg:scroll-mt-24">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:px-8 lg:py-16">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-mint">{z.offerteEyebrow}</p>
          <h2 id="zk-offerte" className="mt-1.5 font-display text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {z.offerteTitel}
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85">{z.offerteSub}</p>
          <ul className="mt-5 space-y-2 text-[14px] text-white/90">
            {z.offertePunten.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-mint" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-5 text-ink sm:p-7">
          {status === "klaar" ? (
            <div role="status" className="py-10 text-center">
              <p className="text-[20px] font-bold">{z.offerteKlaarTitel}</p>
              <p className="mt-2 text-[14px] text-neutralx-600">{z.offerteKlaar}</p>
            </div>
          ) : (
            <form onSubmit={verstuur} className="grid gap-4" noValidate={false}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-[13px] font-semibold">
                  {z.offerteBedrijf}
                  <input required minLength={2} autoComplete="organization" value={form.bedrijf} onChange={(e) => zet("bedrijf", e.target.value)} className={veld} />
                </label>
                <label className="text-[13px] font-semibold">
                  {z.offerteNaam}
                  <input required minLength={2} autoComplete="name" value={form.naam} onChange={(e) => zet("naam", e.target.value)} className={veld} />
                </label>
                <label className="text-[13px] font-semibold">
                  {z.offerteEmail}
                  <input required type="email" autoComplete="email" value={form.email} onChange={(e) => zet("email", e.target.value)} className={veld} />
                </label>
                <label className="text-[13px] font-semibold">
                  {z.offerteTelefoon}
                  <input type="tel" autoComplete="tel" value={form.telefoon} onChange={(e) => zet("telefoon", e.target.value)} className={veld} />
                </label>
              </div>
              <label className="text-[13px] font-semibold">
                {z.offerteMedewerkers}
                <input type="number" inputMode="numeric" min={1} value={form.medewerkers} onChange={(e) => zet("medewerkers", e.target.value)} className={`${veld} sm:w-40`} />
              </label>
              <fieldset>
                <legend className="text-[13px] font-semibold">{z.offerteWensen}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OFFERTE_WENSEN.map((w) => {
                    const aan = wensen.includes(w);
                    return (
                      <label key={w} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${aan ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong text-ink"}`}>
                        <input type="checkbox" checked={aan} onChange={() => setWensen((ws) => (aan ? ws.filter((x) => x !== w) : [...ws, w]))} className="h-4 w-4 accent-brand-500" />
                        {wensNaam[w]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {lijst && (
                <div className="rounded-lg bg-paper-soft p-3">
                  <p className="text-[13px] font-semibold">{z.offerteMetLijst}</p>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-sans text-[12px] text-neutralx-600">{lijst}</pre>
                </div>
              )}
              <label className="text-[13px] font-semibold">
                {z.offerteBericht}
                <textarea rows={3} value={form.bericht} onChange={(e) => zet("bericht", e.target.value)} placeholder={z.offerteBerichtHint} className={`${veld} h-auto py-2.5`} />
              </label>
              <label className="flex items-start gap-2.5 text-[13px] text-neutralx-700">
                <input type="checkbox" checked={form.akkoord} onChange={(e) => zet("akkoord", e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500" />
                {z.offerteAkkoord}
              </label>
              {fout && (
                <p role="alert" className="text-[13px] font-semibold text-crit">
                  {fout}
                </p>
              )}
              <button type="submit" disabled={status === "bezig"} className="h-12 rounded-lg bg-brand-500 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-60">
                {status === "bezig" ? z.offerteBezig : z.offerteVerstuur}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
