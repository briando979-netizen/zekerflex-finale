"use client";

import { useEffect } from "react";
import type { Deal } from "@/lib/marketing/deals";

export function DealCard({ deal }: { deal: Deal }) {
  useEffect(() => {
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deal",
        id: deal.id,
        action: "view",
      }),
    }).catch(() => undefined);
  }, [deal.id]);

  const handleClick = () => {
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deal",
        id: deal.id,
        action: "click",
      }),
    }).catch(() => undefined);
  };

  return (
    <a
      href={`/deals/${deal.id}`}
      onClick={handleClick}
      className="group block bg-white rounded-lg shadow-sm hover:shadow-md transition overflow-hidden border-2 border-amber-100"
    >
      {deal.thumbnailUrl && (
        <div className="relative overflow-hidden bg-slate-200 h-40">
          <img
            src={deal.thumbnailUrl}
            alt={deal.title}
            className="w-full h-full object-cover group-hover:scale-105 transition"
          />
          <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
            {deal.discountValue}% korting
          </div>
        </div>
      )}
      <div className="p-3">
        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-600 transition">
          {deal.title}
        </h3>
        {deal.code && (
          <div className="mt-2 px-2 py-1 bg-slate-100 rounded text-xs font-mono font-bold text-center">
            {deal.code}
          </div>
        )}
      </div>
    </a>
  );
}
