"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { Card, Empty, IImage, IPin, IPlus, ISearch, IX, PageHead, btn, input } from "@/components/studio/ui";
import { BluetoothPrint } from "@/components/locatie/BluetoothPrint";
import { categorieen, euro, isUitverkocht, leesBedrag } from "@/lib/sites/winkel";
import {
  KASSA_METHODEN,
  aantalStuks,
  bonOpmaak,
  losBedrag,
  mandjeTotaal,
  snelBedragen,
  variantVan,
  voegToe,
  wisselgeld,
  zetAantal,
  type KassaBon,
  type KassaDag,
  type KassaMethode,
  type KassaUitslag,
  type Mandje,
} from "@/lib/sites/kassa";
import { bonNaarEscPos } from "@/lib/sites/kassa-escpos";
import type { Media, SiteProduct } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Webshop → Op locatie: verkopen in je eigen winkel, met dezelfde producten en voorraad als de
// webshop. Tik producten aan (met maat/kleur als het product opties heeft), voeg een los bedrag
// toe, reken af met contant (wisselgeld) of op je eigen pinapparaat, en print de bon via
// Bluetooth of de printer van de computer. De verkoop komt bij Bestellingen (kanaal "winkel") en
// de voorraad gaat omlaag; dat rekent de server opnieuw uit (nooit de prijzen van de browser).
// ---------------------------------------------------------------------------

type Stap = "kiezen" | "afrekenen" | "bon";

function Tegel({ product, foto, onKies }: { product: SiteProduct; foto: Media | undefined; onKies: () => void }) {
  const op = isUitverkocht(product);
  return (
    <button
      type="button"
      onClick={onKies}
      disabled={op}
      className="flex flex-col overflow-hidden rounded-xl border border-[#e3e3e3] bg-white text-left transition hover:border-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="relative block aspect-square w-full bg-[#f3f3f3]">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/werkgever/sites/media/${foto.file}`} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[#b5b5b5]">
            <IImage width={22} height={22} />
          </span>
        )}
        {op && <span className="absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-[#8e0b21]">Uitverkocht</span>}
      </span>
      <span className="block px-2.5 py-2">
        <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-[#1a1a1a]">{product.naam}</span>
        <span className="mt-0.5 flex items-center justify-between gap-1 text-xs text-[#616161]">
          <span className="font-semibold text-[#1a1a1a]">{euro(product.prijsCents)}</span>
          {product.voorraad != null && !op && <span>nog {product.voorraad}</span>}
        </span>
      </span>
    </button>
  );
}

function VariantKiezer({ product, onKlaar, onSluit }: { product: SiteProduct; onKlaar: (variant: string) => void; onSluit: () => void }) {
  const [keuzes, setKeuzes] = useState<Record<string, string>>({});
  const variant = variantVan(product, keuzes);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Kies voor ${product.naam}`} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onSluit}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-semibold text-[#1a1a1a]">{product.naam}</p>
          <button type="button" onClick={onSluit} aria-label="Sluiten" className={btn.quiet}>
            <IX width={16} height={16} />
          </button>
        </div>
        {(product.opties ?? []).map((o) => (
          <fieldset key={o.naam} className="mt-3">
            <legend className="text-xs font-semibold text-[#616161]">{o.naam}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {o.waarden.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={keuzes[o.naam] === w}
                  onClick={() => setKeuzes((k) => ({ ...k, [o.naam]: w }))}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${keuzes[o.naam] === w ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-[#d4d4d4] bg-white text-[#303030]"}`}
                >
                  {w}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <button type="button" disabled={variant === null} onClick={() => variant !== null && onKlaar(variant)} className={`${btn.primary} mt-5 w-full`}>
          Toevoegen
        </button>
      </div>
    </div>
  );
}

/** De bon in een eigen venster afdrukken: werkt met elke printer van de computer of de iPhone (AirPrint). */
function drukAf(bon: KassaBon): void {
  const { kop, regels, voet } = bonOpmaak(bon, 32);
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const pre = w.document.createElement("pre");
  pre.textContent = [...kop, "", ...regels, "", ...voet].join("\n");
  pre.setAttribute("style", "font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;margin:16px;white-space:pre");
  w.document.title = `Bon ${bon.nr}`;
  w.document.body.appendChild(pre);
  w.focus();
  w.print();
}

export default function Kassa() {
  const { data, winkel, api, reload } = useStudio();
  const site = data?.site ?? null;
  const [mandje, setMandje] = useState<Mandje>([]);
  const [zoek, setZoek] = useState("");
  const [cat, setCat] = useState("");
  const [kiesVariant, setKiesVariant] = useState<SiteProduct | null>(null);
  const [los, setLos] = useState({ naam: "", bedrag: "" });
  const [stap, setStap] = useState<Stap>("kiezen");
  const [methode, setMethode] = useState<KassaMethode>("contant");
  const [ontvangen, setOntvangen] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bon, setBon] = useState<KassaBon | null>(null);
  const [vandaag, setVandaag] = useState<KassaDag | null>(null);
  const mandjeRef = useRef<HTMLDivElement>(null);

  // het dagtotaal per betaalwijze (voor het tellen van de kas aan het eind van de dag)
  const laadVandaag = useCallback(async () => {
    const res = await fetch(api("/kassa"), { cache: "no-store" }).catch(() => null);
    if (res?.ok) setVandaag(((await res.json()) as { vandaag: KassaDag }).vandaag);
  }, [api]);
  useEffect(() => {
    void laadVandaag();
  }, [laadVandaag]);

  const media = useMemo(() => new Map((site?.media ?? []).map((m) => [m.id, m])), [site?.media]);
  const producten = winkel.producten;
  const cats = categorieen(producten);
  const lijst = producten.filter((p) => {
    if (cat && p.categorie !== cat) return false;
    const q = zoek.trim().toLowerCase();
    return !q || p.naam.toLowerCase().includes(q) || p.categorie.toLowerCase().includes(q);
  });
  const totaal = mandjeTotaal(mandje);
  const ontvangenCents = methode === "contant" ? (ontvangen.trim() ? leesBedrag(ontvangen) : totaal) : totaal;
  const terug = ontvangenCents == null ? null : wisselgeld(totaal, ontvangenCents);

  const pas = (u: KassaUitslag) => {
    if ("fout" in u) return setFout(u.fout);
    setFout(null);
    setMandje(u.mandje);
  };
  const kies = (p: SiteProduct) => ((p.opties ?? []).length > 0 ? setKiesVariant(p) : pas(voegToe(mandje, p)));

  const voegLosToe = (e: FormEvent) => {
    e.preventDefault();
    const cents = leesBedrag(los.bedrag);
    pas(losBedrag(mandje, los.naam, cents ?? 0));
    if (cents) setLos({ naam: "", bedrag: "" });
  };

  const afronden = async () => {
    if (methode === "contant" && (ontvangenCents == null || terug == null)) return setFout("De klant gaf minder dan het totaal.");
    setBezig(true);
    setFout(null);
    const res = await fetch(api("/kassa"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regels: mandje.map((r) => (r.productId ? { productId: r.productId, variant: r.variant ?? "", aantal: r.aantal } : { los: r.naam, prijsCents: r.prijsCents, aantal: r.aantal })),
        methode,
        ...(methode === "contant" ? { ontvangenCents } : {}),
      }),
    }).catch(() => null);
    setBezig(false);
    if (!res?.ok) return setFout(await foutVan(res, "Afronden lukte niet. Er is niets afgeboekt; probeer het opnieuw."));
    const d = (await res.json()) as { bon: KassaBon; vandaag?: KassaDag | null };
    setBon(d.bon);
    if (d.vandaag) setVandaag(d.vandaag);
    setStap("bon");
    setMandje([]);
    setOntvangen("");
    void reload();
  };

  const nieuweVerkoop = () => {
    setBon(null);
    setStap("kiezen");
    setMethode("contant");
    setFout(null);
  };

  if (!site) return null;
  if (producten.length === 0) {
    return (
      <>
        <PageHead title="Op locatie" />
        <Card>
          <Empty icon={<IPin />} title="Eerst producten" text="De kassa verkoopt dezelfde producten als je webshop. Voeg eerst een product toe; je kunt ook altijd een los bedrag afrekenen zodra er producten zijn." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHead title="Op locatie" sub="Verkopen in je eigen winkel, met dezelfde producten en voorraad als je webshop. Elke verkoop staat ook bij Bestellingen." />
      {vandaag && vandaag.aantal > 0 && (
        <p className="mb-3 rounded-xl border border-[#e3e3e3] bg-white px-4 py-2.5 text-sm text-[#303030]">
          <span className="font-semibold">Vandaag in de winkel:</span> {vandaag.aantal} {vandaag.aantal === 1 ? "verkoop" : "verkopen"} · {euro(vandaag.totaalCents)}
          <span className="text-[#616161]">
            {" "}
            (contant {euro(vandaag.contantCents)} · pin {euro(vandaag.pinCents)})
          </span>
        </p>
      )}
      {fout && (
        <p role="alert" className="mb-3 rounded-xl bg-[#fed1d7] px-4 py-2.5 text-sm text-[#8e0b21]">
          {fout}
        </p>
      )}

      {stap === "bon" && bon ? (
        <Card title="Verkoop afgerond">
          <pre
            className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-[#e3e3e3] bg-[#fafafa] p-4 text-[12px] leading-snug text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-mono, ui-monospace), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
          >
            {(() => {
              const o = bonOpmaak(bon, 32);
              return [...o.kop, "", ...o.regels, "", ...o.voet].join("\n");
            })()}
          </pre>
          <div className="mt-4 flex flex-wrap items-start justify-center gap-2">
            <button type="button" onClick={() => drukAf(bon)} className={btn.secondary}>
              Afdrukken
            </button>
            <BluetoothPrint maakBytes={(rol) => bonNaarEscPos(bon, { rol, snijden: true })} />
            <button type="button" onClick={nieuweVerkoop} className={btn.primary}>
              Nieuwe verkoop
            </button>
          </div>
        </Card>
      ) : (
        <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] ${stap === "kiezen" && mandje.length ? "pb-20 lg:pb-0" : ""}`}>
          {/* producten */}
          <div className="min-w-0">
            <div className="relative mb-3">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]">
                <ISearch width={16} height={16} />
              </span>
              <label htmlFor="kassa-zoek" className="sr-only">
                Zoek een product
              </label>
              <input id="kassa-zoek" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een product" className={`${input} pl-9`} />
            </div>
            {cats.length > 0 && (
              <div className="relative -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {["", ...cats].map((c) => (
                  <button
                    key={c || "alle"}
                    type="button"
                    aria-pressed={cat === c}
                    onClick={() => setCat(c)}
                    className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${cat === c ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-[#d4d4d4] bg-white text-[#303030]"}`}
                  >
                    {c || "Alles"}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {lijst.map((p) => (
                <Tegel key={p.id} product={p} foto={p.fotos[0] ? media.get(p.fotos[0]) : undefined} onKies={() => kies(p)} />
              ))}
            </div>
            {lijst.length === 0 && <p className="mt-6 text-center text-sm text-[#616161]">Geen product gevonden.</p>}
          </div>

          {/* mandje en afrekenen */}
          <div ref={mandjeRef} className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
            <Card title={stap === "afrekenen" ? "Afrekenen" : `Mandje${mandje.length ? ` · ${aantalStuks(mandje)}` : ""}`}>
              {stap === "kiezen" ? (
                <>
                  {mandje.length === 0 ? (
                    <p className="text-sm text-[#616161]">Tik op een product om het toe te voegen.</p>
                  ) : (
                    <ul className="divide-y divide-[#ececec]">
                      {mandje.map((r) => (
                        <li key={r.sleutel} className="flex items-center gap-2 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[#1a1a1a]">{r.naam}</span>
                            <span className="block text-xs text-[#616161]">
                              {r.variant ? `${r.variant} · ` : ""}
                              {euro(r.prijsCents)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <button type="button" aria-label={`Eén ${r.naam} minder`} onClick={() => pas(zetAantal(mandje, r.sleutel, r.aantal - 1, producten))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4d4d4] text-base font-semibold">
                              −
                            </button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">{r.aantal}</span>
                            <button type="button" aria-label={`Eén ${r.naam} meer`} onClick={() => pas(zetAantal(mandje, r.sleutel, r.aantal + 1, producten))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4d4d4] text-base font-semibold">
                              +
                            </button>
                          </span>
                          <span className="w-20 text-right text-sm font-semibold tabular-nums">{euro(r.prijsCents * r.aantal)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={voegLosToe} className="mt-3 flex gap-1.5 border-t border-[#ececec] pt-3">
                    <label className="sr-only" htmlFor="kassa-los-naam">
                      Omschrijving los bedrag
                    </label>
                    {/* de breedte op een wikkel: de veldstijl zet zelf w-full */}
                    <span className="min-w-0 flex-1">
                      <input id="kassa-los-naam" value={los.naam} onChange={(e) => setLos((l) => ({ ...l, naam: e.target.value }))} placeholder="Los bedrag" maxLength={80} className={input} />
                    </span>
                    <label className="sr-only" htmlFor="kassa-los-bedrag">
                      Bedrag
                    </label>
                    <span className="w-24 flex-shrink-0">
                      <input id="kassa-los-bedrag" value={los.bedrag} onChange={(e) => setLos((l) => ({ ...l, bedrag: e.target.value }))} placeholder="€ 0,00" inputMode="decimal" className={input} />
                    </span>
                    <button type="submit" aria-label="Los bedrag toevoegen" className={btn.secondary}>
                      <IPlus width={16} height={16} />
                    </button>
                  </form>
                  <div className="mt-4 flex items-baseline justify-between border-t border-[#ececec] pt-3">
                    <span className="text-sm font-semibold text-[#616161]">Totaal</span>
                    <span className="text-2xl font-bold tabular-nums text-[#1a1a1a]">{euro(totaal)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {mandje.length > 0 && (
                      <button type="button" onClick={() => setMandje([])} className={btn.secondary}>
                        Leegmaken
                      </button>
                    )}
                    <button type="button" disabled={mandje.length === 0} onClick={() => setStap("afrekenen")} className={`${btn.primary} flex-1 py-3 text-base`}>
                      Afrekenen {totaal > 0 ? euro(totaal) : ""}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-[#616161]">Te betalen</span>
                    <span className="text-2xl font-bold tabular-nums text-[#1a1a1a]">{euro(totaal)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Betaalwijze">
                    {KASSA_METHODEN.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={methode === m.id}
                        onClick={() => setMethode(m.id)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${methode === m.id ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-[#d4d4d4] bg-white text-[#303030]"}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[#616161]">{KASSA_METHODEN.find((m) => m.id === methode)?.uitleg}</p>
                  {methode === "contant" && (
                    <div className="mt-3">
                      <label htmlFor="kassa-ontvangen" className="text-xs font-semibold text-[#616161]">
                        Ontvangen
                      </label>
                      <input id="kassa-ontvangen" value={ontvangen} onChange={(e) => setOntvangen(e.target.value)} placeholder={euro(totaal)} inputMode="decimal" className={`${input} mt-1`} />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {snelBedragen(totaal).map((b) => (
                          <button key={b} type="button" onClick={() => setOntvangen((b / 100).toFixed(2).replace(".", ","))} className="rounded-lg border border-[#d4d4d4] px-2.5 py-1 text-xs font-semibold text-[#303030]">
                            {b === totaal ? "Gepast" : euro(b)}
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 flex items-baseline justify-between text-sm">
                        <span className="font-semibold text-[#616161]">Wisselgeld</span>
                        <span className="text-xl font-bold tabular-nums text-[#1a1a1a]">{terug == null ? "—" : euro(terug)}</span>
                      </p>
                    </div>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setStap("kiezen")} className={btn.secondary}>
                      Terug
                    </button>
                    <button type="button" disabled={bezig || (methode === "contant" && terug == null)} onClick={() => void afronden()} className={`${btn.primary} flex-1 py-3 text-base`}>
                      {bezig ? "Bezig…" : methode === "pin" ? "Pin gelukt, afronden" : "Afronden"}
                    </button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* op een telefoon staat het mandje onder alle producten: een balk onderin brengt je erheen */}
      {stap === "kiezen" && mandje.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e3e3e3] bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => {
              mandjeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`${btn.primary} w-full py-3 text-base`}
          >
            Mandje · {aantalStuks(mandje)} · {euro(totaal)}
          </button>
        </div>
      )}

      {kiesVariant && (
        <VariantKiezer
          product={kiesVariant}
          onSluit={() => setKiesVariant(null)}
          onKlaar={(variant) => {
            pas(voegToe(mandje, kiesVariant, variant));
            setKiesVariant(null);
          }}
        />
      )}
    </>
  );
}
