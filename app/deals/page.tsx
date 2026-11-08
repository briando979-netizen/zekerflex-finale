"use client";

import { useEffect, useState } from "react";
import { listActiveDeals } from "@/lib/marketing/deals";
import type { Deal } from "@/lib/marketing/deals";

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const active = await listActiveDeals();
        setDeals(active);
      } catch (err) {
        console.error("Failed to load deals:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-ink mb-4">Aanbiedingen</h1>
        <p className="text-lg text-neutralx-600 mb-12">
          Profiteer van onze speciale kortingen en exclusive deals
        </p>

        {deals.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutralx-500 text-lg">
              Momenteel geen actieve aanbiedingen
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deals.map((deal) => (
              <a
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="group bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border-2 border-amber-100"
              >
                {deal.thumbnailUrl && (
                  <div className="relative overflow-hidden bg-slate-200 h-48">
                    <img
                      src={deal.thumbnailUrl}
                      alt={deal.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                    <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full font-bold">
                      {deal.discountValue}% korting
                    </div>
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-brand-600 transition">
                    {deal.title}
                  </h3>
                  {deal.description && (
                    <p className="text-sm text-neutralx-600 line-clamp-2">
                      {deal.description}
                    </p>
                  )}
                  {deal.code && (
                    <div className="mt-3 p-2 bg-slate-100 rounded font-mono text-sm font-semibold text-center">
                      {deal.code}
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2 text-xs text-neutralx-500">
                    <span>👁️ {deal.viewCount} bekeken</span>
                    <span>•</span>
                    <span>🔗 {deal.clickCount} clicks</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
