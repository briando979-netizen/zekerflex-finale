"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AANBOD_KOLOMMEN,
  DOELGROEP_PAGINA,
  SNELLE_ACTIES,
  VOORBEELDSITES,
  eigenLinks,
  isExternal,
  startHref,
  type Audience,
  type MenuItem,
  type NavEntry,
  type SnelIcoon,
} from "@/lib/marketing/site-nav";

// Het mobiele menu (onder 1280 px). Eerst wat je het vaakst komt doen (snelle
// acties per doelgroep), dan de onderdelen als uitklapbare lijsten, en de knoppen
// Inloggen / Start vandaag altijd onderin in beeld. SiteHeader legt de balk met
// dit menu boven de bezoekerstip en de chatknop zolang het open is.
// nav: het menu zoals de bovenbalk het toont (bouwNav: standaard + de eigen
// aanpassingen uit de Site-ontwerper).
export function MobileMenu({
  id,
  nav,
  audience,
  onAudience,
  onClose,
}: {
  id: string;
  nav: NavEntry[];
  audience: Audience;
  onAudience: (a: Audience) => void;
  onClose: () => void;
}) {
  // eigen keuze in het menu; de URL bepaalt alleen de beginstand
  const [doel, setDoel] = useState<Audience>(audience);
  const [sectie, setSectie] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // waar de bovenbalk eindigt: met de aankondigingsbalk erboven staat hij lager dan 64 px
  const [boven, setBoven] = useState<number | null>(null);

  // Bij openen: focus in het menu, de pagina eronder niet laten meescrollen en
  // alles naast de bovenbalk (inhoud, voettekst, chat, tip) inert maken, zodat
  // toetsenbord en schermlezer in het menu blijven.
  useEffect(() => {
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    const html = document.documentElement;
    const vorige = html.style.overflow;
    html.style.overflow = "hidden";
    const header = panel?.closest("header");
    if (header) setBoven(Math.max(0, Math.round(header.getBoundingClientRect().bottom)));
    const buren = header?.parentElement
      ? Array.from(header.parentElement.children).filter((el): el is HTMLElement => el !== header && el instanceof HTMLElement && !el.inert)
      : [];
    for (const el of buren) el.inert = true;
    return () => {
      html.style.overflow = vorige;
      for (const el of buren) el.inert = false;
    };
  }, []);

  // Escape sluit (onClose is stabiel: useCallback in SiteHeader)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kies = (a: Audience) => {
    setDoel(a);
    onAudience(a);
  };

  return (
    <div
      id={id}
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      // een link naar dezelfde pagina (of een anker) verandert de route niet: dan zelf sluiten
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-16 flex lg:top-[68px] animate-slide-up-fade flex-col border-t border-white/10 text-white xl:hidden"
      style={{ background: "rgb(var(--zf-inkt-rgb, 12 14 18))", ...(boven !== null ? { top: boven } : {}) }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="shell py-4">
          <div role="group" aria-label="Ik ben op zoek als" className="flex rounded-full border border-white/15 bg-white/[0.06] p-1">
            {(["werknemers", "bedrijven"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={doel === a}
                onClick={() => kies(a)}
                className={`flex-1 rounded-full px-3 py-2 text-center text-sm font-semibold transition-colors ${
                  doel === a ? "bg-white/[0.14] text-white" : "text-white/60 hover:text-white/85"
                }`}
              >
                {a === "werknemers" ? "Ik zoek werk" : "Ik zoek mensen"}
              </button>
            ))}
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-2.5">
            {SNELLE_ACTIES[doel].map((s) => (
              <li key={s.href} className="min-w-0">
                <Link
                  href={s.href}
                  className="flex h-full flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[rgba(79,224,160,0.14)] text-brand-mint">
                    <SnelIcon icoon={s.icoon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug text-white">{s.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-white/55">{s.sub}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={DOELGROEP_PAGINA[doel].href} className="mt-3 inline-flex py-1 text-sm font-semibold text-brand-mint hover:underline">
            {DOELGROEP_PAGINA[doel].label} →
          </Link>

          <nav aria-label="Onderdelen" className="mt-4 border-t border-white/10">
            {nav.map((n) => {
              const variant = n.menu?.[doel];
              const open = sectie === n.key;
              const lijstId = `${id}-${n.key}`;
              // een knop zonder submenu (bijv. een eigen knop) is gewoon een link
              if (!n.mega && !variant?.items.length) {
                return (
                  <div key={n.key} className="border-b border-white/10">
                    <MenuLink href={n.href} className="flex w-full items-center justify-between gap-3 py-3.5 text-[15px] font-semibold text-white">
                      {n.label}
                      <span aria-hidden className="text-white/50">→</span>
                    </MenuLink>
                  </div>
                );
              }
              return (
                <div key={n.key} className="border-b border-white/10">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={lijstId}
                    onClick={() => setSectie(open ? null : n.key)}
                    className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-[15px] font-semibold text-white"
                  >
                    {n.label}
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`flex-shrink-0 text-white/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {open && (
                    <div id={lijstId} className="pb-4">
                      {n.mega ? (
                        <div className="space-y-4">
                          {AANBOD_KOLOMMEN.map((k) => (
                            <div key={k.sleutel}>
                              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-mint">{k.naam}</p>
                              <ul className="mt-1.5">
                                {k.items.map((it) => (
                                  <li key={it.href}>
                                    <Link href={it.href} className="flex items-center gap-2 rounded-lg py-1.5 text-sm text-white/80 hover:text-white">
                                      <span className="min-w-0">{it.naam}</span>
                                      {it.binnenkort && (
                                        <span className="ml-auto flex-shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">Binnenkort</span>
                                      )}
                                    </Link>
                                  </li>
                                ))}
                                {k.sleutel === "online" && (
                                  <li>
                                    <Link href={VOORBEELDSITES.href} className="block rounded-lg py-1.5 text-sm text-white/80 hover:text-white">
                                      {VOORBEELDSITES.label}
                                    </Link>
                                  </li>
                                )}
                              </ul>
                            </div>
                          ))}
                          {eigenLinks(n, doel).length > 0 && <SubLijst items={eigenLinks(n, doel)} />}
                          <div>
                            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-mint">Ik zoek werk</p>
                            <ul className="mt-1.5">
                              <li>
                                <Link href="/klussen" className="block rounded-lg py-1.5 text-sm text-white/80 hover:text-white">Open klussen</Link>
                              </li>
                              <li>
                                <Link href="/voor-freelancers" className="block rounded-lg py-1.5 text-sm text-white/80 hover:text-white">Starten als freelancer</Link>
                              </li>
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <SubLijst items={variant?.items ?? []} />
                      )}
                      <MenuLink href={n.href} className="mt-2 inline-flex py-1 text-sm font-semibold text-brand-mint hover:underline">
                        {n.overzicht ?? `Naar ${n.label}`} →
                      </MenuLink>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <p className="mt-5 text-sm leading-relaxed text-white/55">
            Vragen? Mail{" "}
            <a href="mailto:info@zekerflex.com" className="font-semibold text-white/85 underline-offset-2 hover:underline">
              info@zekerflex.com
            </a>{" "}
            of kijk bij{" "}
            <Link href="/contact" className="font-semibold text-white/85 underline-offset-2 hover:underline">
              contact
            </Link>
            .
          </p>
          <Link href="/app" className="mt-3 inline-flex py-1 text-sm font-semibold text-white/75 hover:text-white">
            Download de app →
          </Link>
        </div>
      </div>

      {/* altijd in beeld, ook met de duimen onderaan het scherm */}
      <div className="border-t border-white/10 bg-black/25 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="shell grid grid-cols-2 gap-2.5">
          <Link href="/login" className="rounded-full bg-white px-4 py-3 text-center text-sm font-bold text-ink transition hover:bg-white/90">
            Inloggen
          </Link>
          <Link href={startHref(doel)} className="rounded-full bg-brand-mint px-4 py-3 text-center text-sm font-bold text-ink transition hover:brightness-105">
            Start vandaag
          </Link>
        </div>
      </div>
    </div>
  );
}

// een eigen link uit de Site-ontwerper kan naar buiten of naar mailto: wijzen
function MenuLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return isExternal(href) ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function SubLijst({ items }: { items: MenuItem[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((m) => (
        <li key={m.href + m.title}>
          <MenuLink href={m.href} className="block rounded-lg py-2 hover:bg-white/[0.04]">
            <span className="block text-sm font-medium text-white/90">{m.title}</span>
            {m.desc ? <span className="block text-xs leading-snug text-white/50">{m.desc}</span> : null}
          </MenuLink>
        </li>
      ))}
    </ul>
  );
}

function SnelIcon({ icoon }: { icoon: SnelIcoon }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      {icoon === "zoek" && (
        <>
          <circle cx="11" cy="11" r="6.5" {...p} />
          <path d="M16 16l4.5 4.5" {...p} />
        </>
      )}
      {icoon === "kaart" && (
        <>
          <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" {...p} />
          <circle cx="12" cy="10" r="2.5" {...p} />
        </>
      )}
      {icoon === "loon" && (
        <>
          <path d="M6 3h8l4 4v14H6V3Z" {...p} />
          <path d="M9 12h6M9 16h4" {...p} />
        </>
      )}
      {icoon === "app" && (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" {...p} />
          <path d="M11 18h2" {...p} />
        </>
      )}
      {icoon === "plus" && (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" {...p} />
          <path d="M12 8v8M8 12h8" {...p} />
        </>
      )}
      {icoon === "team" && (
        <>
          <circle cx="9" cy="8" r="3" {...p} />
          <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" {...p} />
          <path d="M15.5 5.5a3 3 0 0 1 0 5.5M17 14.6c1.8.5 3 1.9 3.5 4.4" {...p} />
        </>
      )}
      {icoon === "web" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2.5" {...p} />
          <path d="M3 9h18M6.5 6.5h.01M9 6.5h.01" {...p} />
        </>
      )}
      {icoon === "demo" && (
        <>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...p} />
          <path d="M3.5 10h17M8 3v4M16 3v4" {...p} />
        </>
      )}
    </svg>
  );
}
