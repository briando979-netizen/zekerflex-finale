"use client";

import { useEffect, useState } from "react";
import { getPopupPromos, getDashboardPromos } from "@/lib/marketing/distribution";
import type { MarketingContent } from "@/lib/marketing/distribution";

export default function PromotionsPage() {
  const [promos, setPromos] = useState<MarketingContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const popup = await getPopupPromos();
        const dashboard = await getDashboardPromos("ALL");
        setPromos([...popup, ...dashboard]);
      } catch (err) {
        console.error("Failed to load promotions:", err);
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
        <h1 className="text-4xl font-bold text-ink mb-4">Speciale aanbiedingen</h1>
        <p className="text-lg text-neutralx-600 mb-12">
          Ontdek onze voordeligste deals en promoties
        </p>

        {promos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutralx-500 text-lg">
              Momenteel geen promoties beschikbaar
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {promos.map((promo) => (
              <a
                key={`${promo.type}-${promo.id}`}
                href={promo.href}
                className="block bg-white rounded-xl shadow-md hover:shadow-lg transition overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                  {promo.videoUrl && (
                    <div className="md:col-span-1 overflow-hidden bg-slate-200 h-48 md:h-auto">
                      <video
                        src={promo.videoUrl}
                        className="w-full h-full object-cover"
                        controls
                      />
                    </div>
                  )}
                  <div className="md:col-span-2 p-6 flex flex-col justify-center">
                    <h3 className="text-2xl font-bold text-ink mb-2">
                      {promo.title}
                    </h3>
                    {promo.description && (
                      <p className="text-neutralx-600 mb-4">
                        {promo.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4">
                      <button className="bg-brand-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-brand-700 transition">
                        {promo.cta}
                      </button>
                      <span className="text-sm text-neutralx-500">
                        {promo.type === "deal" ? "Limited time" : "Exclusive"}
                      </span>
                    </div>
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
