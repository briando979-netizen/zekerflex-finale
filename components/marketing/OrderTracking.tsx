"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShopCart } from "@/components/marketing/useShopCart";
import type { ShopOverschrijving } from "@/lib/shop/overschrijving-kenmerk";

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

export function OrderTracking({ orderId, bonUrl = null, overschrijving = null }: { orderId: string; bonUrl?: string | null; overschrijving?: ShopOverschrijving | null }) {
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
