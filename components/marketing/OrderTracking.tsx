"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShopCart } from "@/components/marketing/useShopCart";
import type { ShopOverschrijving } from "@/lib/shop/overschrijving-kenmerk";
import { TEKST_MAX, TEKST_MIN, type TeBeoordelen } from "@/lib/shop/beoordeling";

type Status = "PENDING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "SHIPPED" | "CANCELLED" | "PAYMENT_FAILED";

interface OrderLine {
  name: string;
  priceCents: number;
  qty: number;
}

interface Order {
  id: string;
  status: Status;
  firstName: string;
  itemsJson: OrderLine[];
  totalCents: number;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

const STEPS: { key: Status; label: string }[] = [
  { key: "PENDING_PAYMENT", label: "Besteld" },
  { key: "RECEIVED", label: "Betaald" },
  { key: "CONFIRMED", label: "Bevestigd" },
  { key: "SHIPPED", label: "Verzonden" },
];

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

function trackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
  if (!carrier || !trackingNumber) return null;
  const c = carrier.toLowerCase();
  if (c.includes("postnl")) return `https://jouw.postnl.nl/track-and-trace/${encodeURIComponent(trackingNumber)}`;
  if (c.includes("dhl")) return `https://www.dhl.com/nl-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`;
  return null;
}

export function OrderTracking({
  orderId,
  bonUrl = null,
  overschrijving = null,
  beoordelen = null,
}: {
  orderId: string;
  bonUrl?: string | null;
  overschrijving?: ShopOverschrijving | null;
  /** na verzending: de producten die de koper kan beoordelen, met het token uit zijn link (lib/shop/beoordeling.ts) */
  beoordelen?: { token: string; producten: TeBeoordelen[] } | null;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { clear } = useShopCart();
  const clearedRef = useRef(false);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/shop/orders/${orderId}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!stop) setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!stop) setOrder(data.order);
      } catch {
        /* keep showing the last known state, try again next tick */
      }
    }
    void poll();
    const i = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, [orderId]);

  useEffect(() => {
    // betaald, of per overschrijving besteld (de bestelling staat vast, betalen gaat buiten de shop om): de winkelwagen is klaar
    if ((order?.status === "RECEIVED" || (order?.status === "PENDING_PAYMENT" && overschrijving)) && !clearedRef.current) {
      clearedRef.current = true;
      clear();
    }
  }, [order?.status, clear, overschrijving]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Bestelling niet gevonden</h1>
        <p className="mt-2 text-sm text-neutralx-600">Controleer de link, of neem contact op als je net hebt afgerekend.</p>
        <Link href="/shop" className="mt-6 inline-block rounded-lg bg-ink px-6 py-2.5 text-sm font-bold text-white">Terug naar de shop</Link>
      </div>
    );
  }

  if (!order) {
    return <div className="mx-auto max-w-lg py-20 text-center text-sm text-neutralx-500">Laden…</div>;
  }

  const failed = order.status === "CANCELLED" || order.status === "PAYMENT_FAILED";
  const stepIndex = STEPS.findIndex((s) => s.key === order.status);
  const link = trackingUrl(order.carrier, order.trackingNumber);

  return (
    <div className="mx-auto max-w-xl py-14">
      {order.status === "PENDING_PAYMENT" && overschrijving && <Overmaken o={overschrijving} />}
      {order.status === "PENDING_PAYMENT" && !overschrijving && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          We wachten nog op bevestiging van je bank — deze pagina ververst zichzelf zodra dat binnen is.
        </div>
      )}
      {failed && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {order.status === "PAYMENT_FAILED" ? "De betaling is niet gelukt." : "Deze bestelling is geannuleerd."}{" "}
          <Link href="/shop" className="font-semibold underline">Probeer opnieuw</Link>
        </div>
      )}

      <h1 className="font-display text-2xl font-bold">
        {order.status === "PENDING_PAYMENT" ? `Hoi ${order.firstName}, bijna klaar` : `Bedankt, ${order.firstName}!`}
      </h1>
      <p className="mt-1 text-sm text-neutralx-500">Referentie {order.id}</p>

      {!failed && (
        <div className="mt-8 flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : i <= stepIndex ? "bg-ink" : "bg-hair"}`} />
                <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${i <= stepIndex ? "bg-ink text-white" : "border border-hair bg-white text-neutralx-400"}`}>
                  {i <= stepIndex ? "✓" : i + 1}
                </div>
                <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "invisible" : i < stepIndex ? "bg-ink" : "bg-hair"}`} />
              </div>
              <span className={`mt-2 text-[11px] font-medium ${i <= stepIndex ? "text-ink" : "text-neutralx-400"}`}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-xl border border-hair p-5">
        {order.itemsJson.map((l, i) => (
          <div key={i} className="flex items-center justify-between py-1 text-sm">
            <span>{l.qty}x {l.name}</span>
            <span>{money(l.priceCents * l.qty)}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between border-t border-hair pt-2 font-bold">
          <span>Totaal</span>
          <span>{money(order.totalCents)}</span>
        </div>
      </div>

      {order.trackingNumber && (
        <div className="mt-6 rounded-xl border border-hair p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-400">Track & trace</p>
          <p className="mt-1 text-sm">
            {order.carrier ? `${order.carrier} — ` : ""}
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline">
                {order.trackingNumber}
              </a>
            ) : (
              order.trackingNumber
            )}
          </p>
        </div>
      )}

      {order.status === "RECEIVED" && bonUrl && (
        <a
          href={bonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block text-sm font-semibold text-brand-600 underline"
        >
          Download je factuur (PDF)
        </a>
      )}

      {order.status === "SHIPPED" && beoordelen && <Beoordelen orderId={orderId} token={beoordelen.token} begin={beoordelen.producten} />}
    </div>
  );
}

/** Beoordeel je aankoop: per product sterren en een paar zinnen. Komt pas op de site na een controle door ZekerFlex. */
function Beoordelen({ orderId, token, begin }: { orderId: string; token: string; begin: TeBeoordelen[] }) {
  const [producten, setProducten] = useState(begin);
  return (
    <section aria-labelledby="beoordelen-titel" className="mt-8 rounded-xl border border-hair p-5">
      <h2 id="beoordelen-titel" className="text-[17px] font-bold text-ink">
        Beoordeel je aankoop
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">
        Help andere kopers kiezen. Je beoordeling komt op de site na een korte controle, met je voornaam en de eerste letter van je achternaam.
      </p>
      <div className="mt-4 divide-y divide-hair">
        {producten.map((p) => (
          <BeoordeelProduct key={p.productId} orderId={orderId} token={token} product={p} onOpgeslagen={setProducten} />
        ))}
      </div>
    </section>
  );
}

const STATUS_TEKST = { wacht: "Ontvangen, we kijken hem even na", zichtbaar: "Staat op de site", afgewezen: "Niet geplaatst" } as const;

function BeoordeelProduct({ orderId, token, product, onOpgeslagen }: { orderId: string; token: string; product: TeBeoordelen; onOpgeslagen: (p: TeBeoordelen[]) => void }) {
  const eigen = product.beoordeling;
  const [open, setOpen] = useState(!eigen);
  const [sterren, setSterren] = useState(eigen?.sterren ?? 0);
  const [tekst, setTekst] = useState(eigen?.tekst ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const veld = `beoordeling-${product.productId}`;

  async function stuur() {
    if (sterren < 1) return setFout("Kies eerst hoeveel sterren je geeft.");
    if (tekst.trim().length < TEKST_MIN) return setFout(`Schrijf minstens ${TEKST_MIN} tekens over het product.`);
    setBezig(true);
    setFout(null);
    const r = await fetch(`/api/shop/orders/${orderId}/beoordeling`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, productId: product.productId, sterren, tekst: tekst.trim() }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBezig(false);
    if (r?.ok && Array.isArray(d.producten)) {
      onOpgeslagen(d.producten as TeBeoordelen[]);
      setOpen(false);
    } else setFout(d?.error?.message ?? "Versturen lukte niet. Probeer het zo nog eens.");
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-paper-soft">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/shop/${product.slug}`} className="block truncate text-[15px] font-semibold text-ink hover:underline">
            {product.naam}
          </Link>
          {eigen && !open && <p className="text-[12px] text-neutralx-600">{STATUS_TEKST[eigen.status]}</p>}
        </div>
        {eigen && !open && (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-hair px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-paper-soft">
            Aanpassen
          </button>
        )}
      </div>
      {eigen && !open && (
        <p className="mt-2 text-[14px] text-ink">
          <span aria-label={`${eigen.sterren} van de 5 sterren`} className="mr-2 tracking-wide">
            {"★".repeat(eigen.sterren)}
            <span className="text-neutralx-300">{"★".repeat(5 - eigen.sterren)}</span>
          </span>
          {eigen.tekst}
        </p>
      )}
      {open && (
        <div className="mt-3">
          <fieldset className="relative">
            <legend className="text-[13px] font-semibold text-ink">Hoeveel sterren geef je?</legend>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="relative cursor-pointer rounded text-[30px] leading-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink">
                  <input type="radio" name={`${veld}-sterren`} value={n} checked={sterren === n} onChange={() => setSterren(n)} className="sr-only" />
                  <span aria-hidden className={n <= sterren ? "text-ink" : "text-neutralx-300"}>
                    ★
                  </span>
                  <span className="sr-only">{n === 1 ? "1 ster" : `${n} sterren`}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor={veld} className="mt-3 block text-[13px] font-semibold text-ink">
            Wat vind je ervan?
          </label>
          <textarea
            id={veld}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            maxLength={TEKST_MAX}
            rows={3}
            placeholder="Bijvoorbeeld: hoe het past, de kwaliteit, of je het zou aanraden"
            className="mt-1 w-full rounded-lg border border-hair px-3 py-2 text-[14px] text-ink outline-none focus:border-ink"
          />
          {fout && (
            <p role="alert" className="mt-1 text-[13px] font-semibold text-crit">
              {fout}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={bezig} onClick={() => void stuur()} className="rounded-lg bg-ink px-4 py-2 text-[14px] font-bold text-white disabled:opacity-60">
              {bezig ? "Versturen…" : eigen ? "Opslaan" : "Versturen"}
            </button>
            {eigen && (
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-hair px-4 py-2 text-[14px] font-semibold text-ink">
                Annuleren
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** De gegevens om over te maken, met een kopieerknop voor het IBAN en het kenmerk (lib/shop/overschrijving.ts). */
function Overmaken({ o }: { o: ShopOverschrijving }) {
  const [gekopieerd, setGekopieerd] = useState("");
  const kopieer = (wat: string, tekst: string) => {
    void navigator.clipboard
      ?.writeText(tekst)
      .then(() => setGekopieerd(`${wat} gekopieerd`))
      .catch(() => setGekopieerd(""));
  };
  const rij = (label: string, waarde: string, kopie?: { wat: string; tekst: string }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-amber-800">{label}</dt>
      <dd className="flex items-center gap-2 text-right font-semibold text-ink">
        <span className={kopie ? "font-mono" : ""}>{waarde}</span>
        {kopie && (
          <button type="button" onClick={() => kopieer(kopie.wat, kopie.tekst)} aria-label={`${kopie.wat} kopiëren`} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100">
            Kopieer
          </button>
        )}
      </dd>
    </div>
  );
  return (
    <section aria-labelledby="overmaken-titel" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <h2 id="overmaken-titel" className="text-[15px] font-bold text-ink">
        Maak {money(o.bedragCents)} over
      </h2>
      <p className="mt-1">Je bestelling staat klaar. Zodra je betaling binnen is, pakken we hem in en krijg je een mail.</p>
      <dl className="mt-3 divide-y divide-amber-200">
        {rij("Rekeninghouder", o.naam)}
        {rij("IBAN", o.ibanLeesbaar, { wat: "IBAN", tekst: o.ibanLeesbaar.replace(/\s+/g, "") })}
        {rij("Bedrag", money(o.bedragCents))}
        {rij("Omschrijving", o.kenmerk, { wat: "Kenmerk", tekst: o.kenmerk })}
      </dl>
      <p className="mt-3 text-[12px]">
        Zet <strong>{o.kenmerk}</strong> in de omschrijving, dan herkennen we je betaling. Maak het bedrag binnen {o.termijnDagen} dagen over; deze gegevens staan ook in je mail.
      </p>
      <p aria-live="polite" className="mt-1 min-h-[1em] text-[12px] font-semibold text-amber-900">
        {gekopieerd}
      </p>
    </section>
  );
}
