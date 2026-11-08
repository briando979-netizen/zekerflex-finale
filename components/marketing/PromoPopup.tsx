"use client";

import { useEffect, useState } from "react";
import { getPopupPromos } from "@/lib/marketing/distribution";
import type { MarketingContent } from "@/lib/marketing/distribution";

const POPUP_DISMISSED_KEY = "zf-popup-dismissed";

export function PromoPopup() {
  const [content, setContent] = useState<MarketingContent | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const dismissed = localStorage.getItem(POPUP_DISMISSED_KEY);
        if (dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000) {
          return;
        }

        const promos = await getPopupPromos();
        if (promos.length > 0) {
          setContent(promos[0]);
          setTimeout(() => setShown(true), 2000);
        }
      } catch (err) {
        console.error("Failed to load popup:", err);
      }
    };
    void load();
  }, []);

  if (!content || !shown) return null;

  const handleClose = () => {
    setShown(false);
    try {
      localStorage.setItem(POPUP_DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const handleClick = () => {
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: content.type,
        id: content.id,
        action: "click",
      }),
    }).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md overflow-hidden">
        {content.thumbnailUrl && (
          <div className="w-full h-48 bg-slate-200 relative overflow-hidden">
            <img
              src={content.thumbnailUrl}
              alt={content.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-6">
          <h2 className="text-2xl font-bold text-ink mb-2">{content.title}</h2>
          {content.description && (
            <p className="text-neutralx-600 mb-4">{content.description}</p>
          )}
          <div className="flex gap-3">
            <a
              href={content.href}
              onClick={handleClick}
              className="flex-1 bg-brand-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-brand-700 transition text-center"
            >
              {content.cta}
            </a>
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-neutralx-200 rounded-lg hover:bg-slate-50 transition"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
