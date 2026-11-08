"use client";

import { useEffect } from "react";
import type { Campaign } from "@/lib/marketing/campaigns";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  useEffect(() => {
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "campaign",
        id: campaign.id,
        action: "view",
      }),
    }).catch(() => undefined);
  }, [campaign.id]);

  const handleClick = () => {
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "campaign",
        id: campaign.id,
        action: "click",
      }),
    }).catch(() => undefined);
  };

  return (
    <a
      href={`/campaigns/${campaign.id}`}
      onClick={handleClick}
      className="group block bg-white rounded-lg shadow-sm hover:shadow-md transition overflow-hidden"
    >
      {campaign.thumbnailUrl && (
        <div className="relative overflow-hidden bg-slate-200 h-40">
          <img
            src={campaign.thumbnailUrl}
            alt={campaign.title}
            className="w-full h-full object-cover group-hover:scale-105 transition"
          />
        </div>
      )}
      <div className="p-3">
        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-600 transition">
          {campaign.title}
        </h3>
        {campaign.description && (
          <p className="text-xs text-neutralx-600 line-clamp-1 mt-1">
            {campaign.description}
          </p>
        )}
      </div>
    </a>
  );
}
