/**
 * Infinite horizontal marquee. Content is duplicated so the -50% translate loop
 * is seamless. Pure CSS animation (pauses on hover, respects reduced-motion).
 */
export function Marquee({ items }: { items: string[] }) {
  const row = (
    <div className="marquee">
      {[...items, ...items].map((t, i) => (
        <span
          key={i}
          className="flex items-center gap-4 whitespace-nowrap px-8 font-display text-lg font-medium text-white/40"
        >
          {t}
          <span className="text-brand-mint/50">◆</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden py-6"
      style={{
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      {row}
    </div>
  );
}
