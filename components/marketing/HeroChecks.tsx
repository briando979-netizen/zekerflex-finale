/** Circle-outline check items for a dark hero — matches the homepage hero. */
export function HeroChecks({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5 text-sm font-medium text-white/80">
          <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border border-white/25 text-brand-mint">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}
