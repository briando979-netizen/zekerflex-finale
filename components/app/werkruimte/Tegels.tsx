import Link from "next/link";

// Tegels op het startscherm van een werkruimte: elk onderdeel één klik weg.
// Server-veilig; kleuren volgens het systeem (amber = wacht op jou, rood = probleem).

export interface Tegel {
  href: string;
  titel: string;
  uitleg: string;
  /** klein getal of woord rechtsboven, bv. "3 nieuw" */
  teller?: string | undefined;
  toon?: "warn" | "crit" | "ok" | undefined;
}

const TELLER_KLASSE = {
  warn: "pill-warn",
  crit: "pill-crit",
  ok: "pill-ok",
} as const;

export function TegelRaster({ tegels, label }: { tegels: Tegel[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {tegels.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className="group flex h-full flex-col rounded-2xl border border-hair bg-white p-4 transition hover:border-brand-500 hover:shadow-e1 focus-visible:border-brand-500"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-semibold text-ink">{t.titel}</span>
              {t.teller ? <span className={`${TELLER_KLASSE[t.toon ?? "warn"]} flex-shrink-0 whitespace-nowrap`}>{t.teller}</span> : null}
            </span>
            <span className="mt-1 text-sm text-neutralx-600">{t.uitleg}</span>
            <span className="mt-auto pt-3 text-xs font-semibold text-brand-600 transition-transform group-hover:translate-x-0.5" aria-hidden>
              Openen →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
