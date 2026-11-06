"use client";

import { useState } from "react";
import type { PurchaseMode } from "@/lib/shop/purchase-mode";
import { PurchaseModeSelector } from "./PurchaseModeSelector";

interface CartItem {
  variantId: string;
  quantity: number;
  name: string;
  priceCents: number;
}

interface Props {
  items: CartItem[];
  onCheckout: (mode: PurchaseMode) => void;
}

export function ShopCartWidget({ items, onCheckout }: Props) {
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>("onetime");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const totalEuro = totalCents / 100;

  async function handleCheckout() {
    setIsCheckingOut(true);
    try {
      const response = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          purchaseMode,
          successUrl: `${window.location.origin}/shop/bestelling/success`,
          cancelUrl: `${window.location.origin}/shop`,
        }),
      });

      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Checkout kon niet worden gestart");
    } finally {
      setIsCheckingOut(false);
    }
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ borderColor: "var(--a-border)" }}>
        <p style={{ color: "var(--a-mute)" }}>Je winkelwagen is leeg</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-6" style={{ borderColor: "var(--a-border)" }}>
      <div className="space-y-2">
        <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
          Winkelwagen
        </h3>
        <div className="space-y-1 text-sm" style={{ color: "var(--a-mute)" }}>
          {items.map((item) => (
            <div key={item.variantId} className="flex justify-between">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>€ {((item.priceCents * item.quantity) / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="border-t pt-3"
        style={{ borderColor: "var(--a-border)", color: "var(--a-text)" }}
      >
        <div className="flex justify-between font-semibold">
          <span>Totaal:</span>
          <span>€ {totalEuro.toFixed(2)}</span>
        </div>
      </div>

      <PurchaseModeSelector
        basePriceCents={totalCents}
        selected={purchaseMode}
        onChange={setPurchaseMode}
      />

      <button
        onClick={handleCheckout}
        disabled={isCheckingOut}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        style={{ background: isCheckingOut ? "var(--a-mute)" : "var(--a-act)" }}
      >
        {isCheckingOut ? "Bezig..." : "Betalen"}
      </button>
    </div>
  );
}
