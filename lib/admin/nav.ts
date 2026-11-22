// ---------------------------------------------------------------------------
// De indeling van de beheeromgeving. Sinds 21 nov 2026 (eigenaar: "geef admin een
// betere gebruiksinterface, haal al die extra dingen weg") gaat het beheer alleen
// nog over het flexwerk-platform: zeven onderdelen, elk met eigen pagina's die als
// tabbladen boven de pagina staan. Alles wat publiek verborgen is (telefonie,
// verbinding, op locatie, AI-trader, bank …) staat onderaan
// in één dichtgeklapt onderdeel "Overig (verborgen)": de pagina's blijven bestaan
// en bereikbaar, maar liggen niet meer in de weg. Alleen data, dus ook bruikbaar
// in de zoekbalk en in tests (die controleren dat elke pagina hier in staat).
// ---------------------------------------------------------------------------

export type HubIcon = "overview" | "people" | "jobs" | "money" | "chat" | "ai" | "shield" | "more";

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
  /** Alleen opengeklapt zichtbaar, onderaan het menu: pagina's buiten het flexwerk-platform. */
  verborgen?: boolean;
}

export const ADMIN_HUBS: AdminHub[] = [
  {
    id: "overzicht",
    label: "Overzicht",
    blurb: "Het platform in één oogopslag",
    icon: "overview",
    pages: [
      { href: "/admin", label: "Controlecentrum" },
      { href: "/admin/te-doen", label: "Te doen" },
      { href: "/admin/cockpit", label: "Cockpit" },
      { href: "/admin/bi", label: "Rapportages (BI)" },
      { href: "/admin/analytics", label: "Verkeer" },
      { href: "/admin/agenda", label: "Agenda" },
    ],
  },
  {
    id: "mensen",
    label: "Mensen & bedrijven",
    blurb: "Werkers, bedrijven, verificatie en instroom",
    icon: "people",
    pages: [
      { href: "/admin/gebruikers", label: "Gebruikers" },
      { href: "/admin/onboarding", label: "Onboarding" },
      { href: "/admin/bedrijven", label: "Bedrijven" },
      // KVK-nummers zelf controleren op kvk.nl en met de hand goedkeuren, voor werkers en bedrijven (22 nov 2026)
      { href: "/admin/kvk-controle", label: "KVK-controle" },
      { href: "/admin/uitzendbureau", label: "Uitzendbureau" },
      { href: "/admin/werker-trechter", label: "Werkerstrechter" },
      { href: "/admin/werkgever-trechter", label: "Werkgeverstrechter" },
      { href: "/admin/meetkamer", label: "Meetkamer" },
      { href: "/admin/sales", label: "Sales-pijplijn" },
    ],
  },
  {
    id: "klussen",
    label: "Klussen & uren",
    blurb: "Klussen, bezetting, uren en disputen",
    icon: "jobs",
    pages: [
      { href: "/admin/vooruitblik", label: "Klussen & bezetting" },
      { href: "/admin/disputes", label: "Disputen" },
      { href: "/admin/fraude", label: "Fraude & signalen" },
    ],
  },
  {
    id: "geld",
    label: "Geld",
    blurb: "Facturen, verloning, betalingen en aangiftes",
    icon: "money",
    pages: [
      { href: "/admin/facturen", label: "Facturen" },
      { href: "/admin/verloning", label: "Verloning" },
      { href: "/admin/financien", label: "Financiën & winst" },
      { href: "/admin/winstplan", label: "Weg naar winst" },
      { href: "/admin/stripe", label: "Stripe" },
      { href: "/admin/stripe/klanten", label: "Stripe-klanten" },
      { href: "/admin/boekhouding", label: "Boekhouding" },
      { href: "/admin/accountant", label: "Accountant" },
      { href: "/admin/pensioen", label: "Pensioen" },
      { href: "/admin/fiscaal", label: "Werkvormen & btw" },
      { href: "/admin/kosten", label: "Kosten" },
    ],
  },
  {
    id: "communicatie",
    label: "Communicatie",
    blurb: "Alle gesprekken met bedrijven en flexwerkers",
    icon: "chat",
    pages: [
      { href: "/admin/berichten", label: "Berichten" },
      { href: "/admin/webchat", label: "Website-chat" },
      { href: "/admin/mail", label: "Mailbox" },
      { href: "/admin/mijn-mail", label: "Mijn mailbox" },
      { href: "/admin/zekerflex-mail", label: "ZekerFlex Mail" },
      { href: "/admin/whatsapp", label: "WhatsApp" },
      // het openbare forum op /community (22 nov 2026): meldingen nakijken, verbergen, uitsluiten
      { href: "/admin/community", label: "Community" },
    ],
  },
  {
    id: "ai",
    label: "ZekerFlex AI",
    blurb: "Sleutel, modelkeuze, alles gratis en wat vanzelf loopt",
    icon: "ai",
    pages: [
      { href: "/admin/zekerflex-ai", label: "ZekerFlex AI" },
      { href: "/admin/zekerflex-ai/mijn-ai", label: "Mijn AI" },
      { href: "/admin/zekerflex-ai/medewerkers", label: "AI-medewerkers" },
      { href: "/admin/gratis", label: "Alles gratis" },
      { href: "/admin/automatisch", label: "Automatisch gedaan" },
      { href: "/admin/autopilot", label: "Autopilot" },
      { href: "/admin/kennisbank", label: "Kennisbank" },
      { href: "/admin/bronnen", label: "Bronnen" },
    ],
  },
  {
    id: "systeem",
    label: "Systeem",
    blurb: "Foutmeldingen, taken, beveiliging, live zetten en de site zelf",
    icon: "shield",
    pages: [
      { href: "/admin/systeem", label: "Systeem" },
      { href: "/admin/beveiliging", label: "Beveiliging" },
      { href: "/admin/prestaties", label: "Prestaties" },
      { href: "/admin/audit", label: "Auditspoor" },
      { href: "/admin/hosting", label: "Hosting & domein" },
      { href: "/admin/integraties", label: "API & integraties" },
      { href: "/admin/stripe-account", label: "Stripe-account" },
      { href: "/admin/google-play", label: "Google Play" },
      { href: "/admin/ontwerper", label: "Site-ontwerper" },
      { href: "/admin/huisstijl", label: "Huisstijl" },
      { href: "/admin/beheer", label: "Instellingen" },
    ],
  },
  {
    id: "overig",
    label: "Overig (verborgen)",
    blurb: "Buiten het flexwerk-platform: telefonie, verbinding, op locatie, oude winkelonderdelen en proeven",
    icon: "more",
    verborgen: true,
    pages: [
      // overzicht en mensen
      { href: "/admin/kantoor", label: "Live kantoor" },
      { href: "/admin/sim", label: "De Sim" },
      { href: "/admin/tenants", label: "Klanten & white-label" },
      { href: "/admin/sollicitaties", label: "Sollicitaties" },
      // geld
      { href: "/admin/efacturen", label: "E-facturen" },
      { href: "/admin/stripe/werkbank", label: "Stripe-werkbank" },
      { href: "/admin/bank", label: "Bank (gestopt)" },
      { href: "/admin/betalingen", label: "AI-betalingen" },
      { href: "/admin/icp", label: "ICP-opgave" },
      { href: "/admin/kosteloos", label: "Kosteloze accounts" },
      // sales en marketing
      { href: "/admin/sales/partners", label: "Partnercampagnes" },
      { href: "/admin/aanbestedingen", label: "Aanbestedingen (TenderNed)" },
      { href: "/admin/offertes", label: "Offerte-AI" },
      { href: "/admin/beller", label: "AI-beller" },
      { href: "/admin/telefonie", label: "Telefonie" },
      { href: "/admin/netwerk", label: "Verbinding (wifi, VPN, 5G)" },
      { href: "/admin/op-locatie", label: "Op locatie (portofoon, toegang, kluis, printen)" },
      { href: "/admin/kaart", label: "Kaart (bedrijven op de kaart)" },
      { href: "/admin/recruiter", label: "AI-recruiter" },
      { href: "/admin/social", label: "Sociale media" },
      { href: "/admin/nieuws", label: "Nieuwsroom" },
      { href: "/admin/ads", label: "Advertenties" },
      { href: "/admin/campagnes", label: "Campagnepagina's" },
      { href: "/admin/nieuwsbrief", label: "Nieuwsbrief" },
      // de partners, verkopers en de rest van de oude winkel
      { href: "/admin/markten", label: "Agenten & markten" },
      { href: "/admin/partners", label: "Partnerprogramma" },
      { href: "/admin/verkopers", label: "Verkopers" },
      { href: "/admin/studio", label: "Studio" },
      { href: "/admin/video", label: "Video-editor" },
      { href: "/admin/domeinen", label: "Domeinen" },
      // AI-proeven
      { href: "/admin/ai-trader", label: "AI-trader" },
      { href: "/admin/specialisten", label: "Specialisten" },
      { href: "/admin/ai-teams", label: "AI-teams" },
      { href: "/admin/kennisgraaf", label: "Kennisgraaf" },
      { href: "/admin/laptop-jarvis", label: "Laptop-Jarvis" },
      { href: "/admin/audio", label: "Audio naar tekst" },
      // techniek
      { href: "/admin/dev", label: "Terminal" },
    ],
  },
];

/** Wat een bedrijfsbeheerder of dispuutmanager hier mag zien: de eigen disputen, verder niets van het platform. */
const LIMITED_PAGES = new Set(["/admin/disputes"]);

export function visibleHubs(limited: boolean): AdminHub[] {
  if (!limited) return ADMIN_HUBS;
  return ADMIN_HUBS.map((hub) => ({ ...hub, pages: hub.pages.filter((page) => LIMITED_PAGES.has(page.href)) })).filter((hub) => hub.pages.length > 0);
}

const ALL_PAGES = ADMIN_HUBS.flatMap((hub) => hub.pages.map((page) => ({ hub, page })));

/** Het onderdeel en de pagina bij een adres. Ook voor detailpagina's zoals /admin/gebruikers/123. */
export function locateAdminPage(pathname: string): { hub: AdminHub; page: AdminPageLink } | null {
  const exact = ALL_PAGES.find(({ page }) => page.href === pathname);
  if (exact) return exact;
  const nested = ALL_PAGES.filter(({ page }) => page.href !== "/admin" && pathname.startsWith(`${page.href}/`));
  return nested.sort((a, b) => b.page.href.length - a.page.href.length)[0] ?? null;
}
