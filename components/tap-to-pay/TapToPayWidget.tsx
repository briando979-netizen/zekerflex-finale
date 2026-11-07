"use client";

import { useEffect, useState } from "react";

interface TapToPayWidgetProps {
  branchId: string;
  amountCents: number;
  description: string;
  onSuccess?: (intentId: string) => void;
  onError?: (error: string) => void;
}

export function TapToPayWidget({
  branchId,
  amountCents,
  description,
  onSuccess,
  onError,
}: TapToPayWidgetProps) {
  const [status, setStatus] = useState<"ready" | "processing" | "completed" | "failed">("ready");
  const [intentId, setIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartPayment = async () => {
    setError(null);
    setStatus("processing");

    try {
      const res = await fetch("/api/tap-to-pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          amountCents,
          description,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Fout bij betaling initialiseren");
      }

      const session = await res.json();
      setIntentId(session.id);

      // Poll for status
      pollPaymentStatus(session.id);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setStatus("failed");
      onError?.(msg);
    }
  };

  const pollPaymentStatus = async (id: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes

    const poll = async () => {
      try {
        const res = await fetch(`/api/tap-to-pay/status?intentId=${id}&branchId=${branchId}`);
        if (!res.ok) throw new Error("Status ophalen mislukt");

        const data = await res.json();

        if (data.status === "completed") {
          setStatus("completed");
          onSuccess?.(id);
        } else if (data.status === "failed" || data.status === "cancelled") {
          setStatus("failed");
          setError("Betaling mislukt");
          onError?.("Betaling mislukt");
        } else if (data.status === "processing") {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000);
          }
        }
      } catch (err) {
        setError((err as Error).message);
        setStatus("failed");
      }
    };

    poll();
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-lg border border-gray-200 bg-white p-8 max-w-md mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Contactloos betalen</h2>
        <p className="mt-2 text-sm text-gray-600">{description}</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="text-4xl font-bold text-gray-900">{formatAmount(amountCents)}</div>
        <div className="text-sm text-gray-500">Houd kaart tegen telefoon</div>
      </div>

      {error && (
        <div className="w-full rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {status === "ready" && (
        <button
          onClick={handleStartPayment}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-semibold hover:bg-blue-700 transition"
        >
          Betaling starten
        </button>
      )}

      {status === "processing" && (
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 animate-pulse">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18" />
            </svg>
          </div>
          <p className="text-center text-sm text-gray-600">Betaling wordt verwerkt...</p>
        </div>
      )}

      {status === "completed" && (
        <div className="flex flex-col items-center gap-3 w-full">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-center text-sm font-semibold text-green-800">Betaling voltooid!</p>
        </div>
      )}

      {status === "failed" && (
        <button
          onClick={handleStartPayment}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-semibold hover:bg-blue-700 transition"
        >
          Opnieuw proberen
        </button>
      )}
    </div>
  );
}
