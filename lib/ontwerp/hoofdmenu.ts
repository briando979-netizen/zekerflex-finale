import { veiligeLink } from "@/lib/ontwerp/paginas";
import { CTA_BV, CTA_WN, NAV, type MenuItem, type NavEntry } from "@/lib/marketing/site-nav";

// ---------------------------------------------------------------------------
// Het hoofdmenu (bovenbalk) van de eigen site, bewerkbaar in de Site-ontwerper
// (tabblad Menu): knoppen hernoemen, verbergen en verplaatsen, eigen links in
// een submenu en hooguit twee eigen knoppen. Zonder eigen versie (null) toont
// de site exact het standaardmenu uit lib/marketing/site-nav.ts. Puur en
// browser-veilig: de editor, de server en SiteHeader delen deze code.
// ---------------------------------------------------------------------------

export interface HoofdmenuKnop {
  /** een standaardknop (aanbod, hoe, prijzen, …) of een eigen knop (eigen-…) */
  key: string;
  label: string;
  /** alleen bij een eigen knop; een standaardknop houdt zijn eigen adres */
  href: string;
  verborgen: boolean;
  /** eigen links onder in het submenu (na de standaardlinks) */
  extra: MenuItem[];
}

export interface Hoofdmenu {
  knoppen: HoofdmenuKnop[];
}

/** De balk is op een laptop al vol: meer dan twee eigen knoppen past niet. */
export const MAX_EIGEN_KNOPPEN = 2;
export const MAX_SUBMENU_LINKS = 6;

export const isEigenKnop = (key: string) => /^eigen-[a-z0-9]{1,12}$/.test(key);

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const tekst = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Het standaardmenu als bewerkbare lijst (zo begint de editor). */
export function standaardHoofdmenu(): Hoofdmenu {
  return { knoppen: NAV.map((n) => ({ key: n.key, label: n.label, href: n.href, verborgen: false, extra: [] })) };
}

/**
 * Onbekende of dubbele knoppen vallen weg, een standaardknop zonder tekst
 * krijgt zijn standaardnaam terug, een eigen knop zonder tekst of geldig adres
 * verdwijnt. Standaardknoppen die (nog) niet in de lijst staan, bijvoorbeeld
 * een knop die later in de code is bijgekomen, komen achteraan.
 */
export function normalizeHoofdmenu(raw: unknown): Hoofdmenu {
  const r = obj(raw);
  const gezien = new Set<string>();
  const knoppen: HoofdmenuKnop[] = [];
  let eigen = 0;
  for (const k of (Array.isArray(r.knoppen) ? r.knoppen : []).slice(0, 20)) {
    const o = obj(k);
    const key = typeof o.key === "string" ? o.key : "";
    if (gezien.has(key)) continue;
    const standaard = NAV.find((n) => n.key === key);
    const extra = (Array.isArray(o.extra) ? o.extra : [])
      .slice(0, MAX_SUBMENU_LINKS)
      .map((l) => ({ title: tekst(obj(l).title, 50), desc: tekst(obj(l).desc, 100), href: veiligeLink(obj(l).href) }))
      .filter((l) => l.title && l.href);
    if (standaard) {
      knoppen.push({ key, label: tekst(o.label, 30) || standaard.label, href: standaard.href, verborgen: o.verborgen === true, extra });
    } else if (isEigenKnop(key) && eigen < MAX_EIGEN_KNOPPEN) {
      const label = tekst(o.label, 30);
      const href = veiligeLink(o.href);
      if (!label || !href) continue;
      knoppen.push({ key, label, href, verborgen: o.verborgen === true, extra });
      eigen++;
    } else continue;
    gezien.add(key);
  }
  for (const n of NAV) if (!gezien.has(n.key)) knoppen.push({ key: n.key, label: n.label, href: n.href, verborgen: false, extra: [] });
  return { knoppen };
}

/** Is dit menu gelijk aan de standaard? (dan hoeft er niets bewaard te worden) */
export function isStandaardHoofdmenu(m: Hoofdmenu): boolean {
  return JSON.stringify(normalizeHoofdmenu(m)) === JSON.stringify(standaardHoofdmenu());
}

/**
 * De knoppen die SiteHeader toont. Zonder eigen versie precies NAV (zelfde
 * objecten), anders in de eigen volgorde, zonder verborgen knoppen en met de
 * eigen links achteraan in het submenu.
 */
export function bouwNav(menu: Hoofdmenu | null | undefined): NavEntry[] {
  if (!menu) return NAV;
  const uit: NavEntry[] = [];
  for (const k of normalizeHoofdmenu(menu).knoppen) {
    if (k.verborgen) continue;
    const standaard = NAV.find((n) => n.key === k.key);
    if (standaard) {
      const menuMetExtra = standaard.menu
        ? {
            werknemers: { ...standaard.menu.werknemers, items: [...standaard.menu.werknemers.items, ...k.extra] },
            bedrijven: { ...standaard.menu.bedrijven, items: [...standaard.menu.bedrijven.items, ...k.extra] },
          }
        : k.extra.length
          ? { werknemers: { eyebrow: k.label, cta: CTA_WN, items: k.extra }, bedrijven: { eyebrow: k.label, cta: CTA_BV, items: k.extra } }
          : undefined;
      uit.push({ ...standaard, label: k.label, ...(menuMetExtra ? { menu: menuMetExtra } : {}) });
    } else {
      uit.push({
        key: k.key,
        href: k.href,
        label: k.label,
        // een eigen pagina licht op als je erop staat; een link naar buiten nooit
        match: k.href.startsWith("/") ? k.href.split("#")[0] || k.href : "#",
        ...(k.extra.length
          ? { menu: { werknemers: { eyebrow: k.label, cta: CTA_WN, items: k.extra }, bedrijven: { eyebrow: k.label, cta: CTA_BV, items: k.extra } } }
          : {}),
      });
    }
  }
  return uit;
}
