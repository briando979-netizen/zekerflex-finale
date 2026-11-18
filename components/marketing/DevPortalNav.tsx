"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// De sub-navigatie van het ontwikkelaarsportaal (/developers): Overzicht, API-naslag,
// Wijzigingen. Een marketingpagina, dus gewoon Nederlands. De actieve pagina krijgt een
// donkere pil; usePathname bepaalt welke dat is.
const TABS = [
  { href: "/developers", label: "Overzicht" },
  { href: "/developers/authenticatie", label: "Authenticatie" },
  { href: "/developers/api", label: "API-naslag" },
  { href: "/developers/webhooks", label: "Webhooks" },
  { href: "/developers/afspraken", label: "Afspraken" },
  { href: "/developers/voorbeelden", label: "Voorbeelden" },
  { href: "/developers/wijzigingen", label: "Wijzigingen" },
] as const;

export function DevPortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Ontwikkelaars" className="border-b border-hair bg-paper">
      <div className="shell flex gap-1 overflow-x-auto py-2">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                active ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
