// Het stuur van het app-icoon (lib/rijschool/app/twa.ts), als logo en decoratie op de site.
export function Stuur({ className = "", naaf = "var(--rs-accent)" }: { className?: string; naaf?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" focusable="false">
      <circle cx="256" cy="256" r="138" fill="none" stroke="currentColor" strokeWidth="34" />
      <rect x="124" y="236" width="264" height="40" rx="20" fill="currentColor" />
      <rect x="236" y="256" width="40" height="128" rx="20" fill="currentColor" />
      <circle cx="256" cy="256" r="46" fill="currentColor" />
      <circle cx="256" cy="256" r="26" fill={naaf} />
    </svg>
  );
}
