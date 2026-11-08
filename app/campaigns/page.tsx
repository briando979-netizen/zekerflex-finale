"use client";

import { useEffect, useState } from "react";
import { listActiveCampaigns } from "@/lib/marketing/campaigns";
import type { Campaign } from "@/lib/marketing/campaigns";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const active = await listActiveCampaigns();
        setCampaigns(active);
      } catch (err) {
        console.error("Failed to load campaigns:", err);
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
        <h1 className="text-4xl font-bold text-ink mb-4">Campagnes</h1>
        <p className="text-lg text-neutralx-600 mb-12">
          Ontdek onze huidige campagnes en speciale aanbiedingen
        </p>

        {campaigns.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutralx-500 text-lg">
              Momenteel geen actieve campagnes
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <a
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="group bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden"
              >
                {campaign.thumbnailUrl && (
                  <div className="relative overflow-hidden bg-slate-200 h-48">
                    <img
                      src={campaign.thumbnailUrl}
                      alt={campaign.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-brand-600 transition">
                    {campaign.title}
                  </h3>
                  {campaign.description && (
                    <p className="text-sm text-neutralx-600 line-clamp-2">
                      {campaign.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2 text-xs text-neutralx-500">
                    <span>👁️ {campaign.viewCount} bekeken</span>
                    <span>•</span>
                    <span>🔗 {campaign.clickCount} clicks</span>
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
