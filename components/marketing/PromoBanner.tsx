"use client";

import { useEffect } from "react";
import type { MarketingContent } from "@/lib/marketing/distribution";

export function PromoBanner({
  content,
  onClose,
}: {
  content: MarketingContent;
  onClose?: () => void;
}) {
  useEffect(() => {
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: content.type,
        id: content.id,
        action: "view",
      }),
    }).catch(() => undefined);
  }, [content.id, content.type]);

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
    <div className="bg-gradient-to-r from-amber-50 to-amber-100 border-l-4 border-amber-500 p-4 rounded-lg shadow-sm">
      <div className="flex items-start gap-4">
        {content.thumbnailUrl && (
          <div className="flex-shrink-0 w-24 h-24 bg-slate-200 rounded overflow-hidden">
            <img
              src={content.thumbnailUrl}
              alt={content.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900">{content.title}</h3>
          {content.description && (
            <p className="text-sm text-amber-800 mt-1 line-clamp-2">
              {content.description}
            </p>
          )}
          <a
            href={content.href}
            onClick={handleClick}
            className="inline-block mt-2 text-sm font-semibold text-amber-700 hover:text-amber-900 underline"
          >
            {content.cta} →
          </a>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-amber-600 hover:text-amber-900"
            aria-label="Close banner"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
