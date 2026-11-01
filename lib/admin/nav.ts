// ---------------------------------------------------------------------------
// De indeling van de beheeromgeving: acht onderdelen, elk met eigen pagina's die
// als tabbladen boven de pagina staan. Alleen data, dus ook bruikbaar in de
// zoekbalk en in tests (die controleren dat elke pagina hier in staat).
// ---------------------------------------------------------------------------

export type HubIcon = "overview" | "people" | "money" | "growth" | "chat" | "shop" | "ai" | "shield";

export interface AdminPageLink {
  href: string;
  label: string;
}

export interface AdminHub {
  id: string;
  label: string;
  blurb: string;
  icon: HubIcon;
  pages: AdminPageLink[];
}

export const ADMIN_HUBS: AdminHub[] = [
  {
    id: "overzicht",
    label: "Overzicht",
    blurb: "Het hele bedrijf in één oogopslag",
    icon: "overview",
    pages: [
      { href: "/admin", label: "Controlecentrum" },
      { href: "/admin/te-doen", label: "Te doen" },
      { href: "/admin/cockpit", label: "Cockpit" },
      { href: "/admin/vooruitblik", label: "Vooruitblik" },
      { href: "/admin/agenda", label: "Agenda" },
      { href: "/admin/kantoor", label: "Live kantoor" },
      { href: "/admin/sim", label: "De Sim" },
    ],
  },
  {
    id: "mensen",
    label: "Mensen & bedrijven",
    blurb: "Accounts, opdrachtgevers en kandidaten",
    icon: "people",
    pages: [
      { href: "/admin/gebruikers", label: "Gebruikers" },
      { href: "/admin/bedrijven", label: "Bedrijven" },
      { href: "/admin/tenants", label: "Klanten & white-label" },
      { href: "/admin/uitzendbureau", label: "Uitzendbureau" },
      { href: "/admin/sollicitaties", label: "Sollicitaties" },
    ],
  },
  {
    id: "geld",
    label: "Financiën",
    blurb: "Omzet, facturen, betalingen en aangiftes",
    icon: "money",
    pages: [
      { href: "/admin/financien", label: "Financiën & winst" },
      { href: "/admin/facturen", label: "Facturen" },
      { href: "/admin/stripe", label: "Stripe" },
      { href: "/admin/bank", label: "Bank" },
      { href: "/admin/betalingen", label: "AI-betalingen" },
      { href: "/admin/verloning", label: "Verloning" },
      { href: "/admin/pensioen", label: "Pensioen" },
      { href: "/admin/fiscaal", label: "Werkvormen & btw" },
      { href: "/admin/icp", label: "ICP-opgave" },
    ],
  },
  {
    id: "groei",
    label: "Sales & groei",
    blurb: "Leads, gesprekken, campagnes en verkeer",
    icon: "growth",
    pages: [
      { href: "/admin/sales", label: "Pijplijn" },
      { href: "/admin/offertes", label: "Offerte-AI" },
      { href: "/admin/beller", label: "AI-beller" },
      { href: "/admin/recruiter", label: "AI-recruiter" },
      { href: "/admin/ads", label: "Advertenties" },
      { href: "/admin/nieuwsbrief", label: "Nieuwsbrief" },
      { href: "/admin/analytics", label: "Verkeer" },
    ],
  },
  {
    id: "communicatie",
    label: "Communicatie",
    blurb: "Alle gesprekken met klanten en flexwerkers",
    icon: "chat",
    pages: [
      { href: "/admin/berichten", label: "Berichten" },
      { href: "/admin/webchat", label: "Website-chat" },
      { href: "/admin/mail", label: "Mailbox" },
      { href: "/admin/mijn-mail", label: "Mijn mailbox" },
      { href: "/admin/whatsapp", label: "WhatsApp" },
    ],
  },
  {
    id: "merk",
    label: "Webshop & merk",
    blurb: "Producten, bestellingen, beeld en huisstijl",
    icon: "shop",
    pages: [
      { href: "/admin/shop", label: "Webshop" },
      { href: "/admin/studio", label: "Studio" },
      { href: "/admin/huisstijl", label: "Huisstijl" },
      { href: "/admin/website-beheer", label: "Website-beheer" },
    ],
  },
  {
    id: "ai",
    label: "AI & automatisering",
    blurb: "Modellen, specialisten en wat vanzelf loopt",
    icon: "ai",
    pages: [
      { href: "/admin/zekerflex-ai", label: "ZekerFlex AI" },
      { href: "/admin/specialisten", label: "Specialisten" },
      { href: "/admin/ai-teams", label: "AI-teams" },
      { href: "/admin/autopilot", label: "Autopilot" },
      { href: "/admin/kennisgraaf", label: "Kennisgraaf" },
      { href: "/admin/laptop-jarvis", label: "Laptop-Jarvis" },
    ],
  },
  {
    id: "veiligheid",
    label: "Risico & systeem",
    blurb: "Geschillen, fraude, beveiliging en techniek",
    icon: "shield",
    pages: [
      { href: "/admin/systeem", label: "Systeem" },
      { href: "/admin/disputes", label: "Disputen" },
      { href: "/admin/fraude", label: "Fraude" },
      { href: "/admin/audit", label: "Auditspoor" },
      { href: "/admin/beveiliging", label: "Beveiliging" },
      { href: "/admin/hosting", label: "Hosting & domein" },
      { href: "/admin/integraties", label: "API & integraties" },
      { href: "/admin/dev", label: "Terminal" },
      { href: "/admin/beheer", label: "Instellingen" },
    ],
  },
];

const ALL_PAGES = ADMIN_HUBS.flatMap((hub) => hub.pages.map((page) => ({ hub, page })));

/** Het onderdeel en de pagina bij een adres. Ook voor detailpagina's zoals /admin/gebruikers/123. */
export function locateAdminPage(pathname: string): { hub: AdminHub; page: AdminPageLink } | null {
  const exact = ALL_PAGES.find(({ page }) => page.href === pathname);
  if (exact) return exact;
  const nested = ALL_PAGES.filter(({ page }) => page.href !== "/admin" && pathname.startsWith(`${page.href}/`));
  return nested.sort((a, b) => b.page.href.length - a.page.href.length)[0] ?? null;
}
