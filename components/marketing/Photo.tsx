import Image from "next/image";
import type { ReactNode } from "react";
import { MARKETING_PHOTOS, isPhotoReady, photoVersion, type PhotoKey } from "@/lib/marketing/photos";

const ASPECT: Record<string, string> = {
  portrait: "aspect-[4/5]",
  landscape: "aspect-[4/3]",
  wide: "aspect-[16/9]",
};

/**
 * A marketing image slot. Renders the real photo from /public/marketing once it
 * exists on disk (produced in /admin/studio, uploaded there, or dropped in by
 * hand), otherwise the on-brand illustration passed as `fallback`.
 * Server component — filesystem check, no DB.
 */
export function Photo({
  name,
  fallback,
  className = "",
  rounded = "rounded-xl2",
  priority = false,
  sizes = "(max-width: 1024px) 100vw, 560px",
}: {
  name: PhotoKey;
  fallback: ReactNode;
  className?: string;
  rounded?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const spec = MARKETING_PHOTOS[name];
  const frame = `${ASPECT[spec.aspect] ?? "aspect-[4/3]"} ${rounded} ${className} overflow-hidden`;

  if (isPhotoReady(name)) {
    return (
      <div className={`relative ${frame}`}>
        {/* next/image: served as AVIF/WebP at the rendered width (the raw hero
            JPEG was ~480 KB — the slowest thing on the homepage on mobile). */}
        <Image
          src={`/marketing/${spec.file}?v=${photoVersion(name)}`}
          alt={spec.alt}
          fill
          sizes={sizes}
          className="object-cover"
          priority={priority}
        />
      </div>
    );
  }

  return <div className={frame}>{fallback}</div>;
}
