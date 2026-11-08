"use client";

import { useEffect, useState } from "react";
import { getMarketingContent } from "@/lib/marketing/distribution";
import type { MarketingPosition, MarketingContent } from "@/lib/marketing/distribution";

export function ContentCarousel({
  position,
  audience = "ALL",
  title,
}: {
  position: MarketingPosition;
  audience?: string;
  title?: string;
}) {
  const [content, setContent] = useState<MarketingContent[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await getMarketingContent(position, audience);
        setContent(items);
      } catch (err) {
        console.error("Failed to load content:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [position, audience]);

  if (loading || content.length === 0) return null;

  const item = content[current];

  return (
    <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-lg overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
        {item.videoUrl && (
          <div className="flex items-center justify-center bg-black rounded h-64">
            <video
              src={item.videoUrl}
              className="w-full h-full object-cover"
              controls
            />
          </div>
        )}
        <div className="flex flex-col justify-center text-white">
          {title && <p className="text-sm font-semibold uppercase opacity-90">{title}</p>}
          <h3 className="text-2xl font-bold mt-2">{item.title}</h3>
          {item.description && (
            <p className="mt-3 text-white/90 line-clamp-3">{item.description}</p>
          )}
          <a
            href={item.href}
            className="mt-6 inline-flex w-max bg-white text-brand-600 font-semibold px-4 py-2 rounded-lg hover:bg-slate-100 transition"
          >
            {item.cta}
          </a>
        </div>
      </div>
      {content.length > 1 && (
        <div className="flex justify-center gap-2 pb-4">
          {content.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition ${
                i === current ? "w-8 bg-white" : "w-2 bg-white/50"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
