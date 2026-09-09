// Read APP_BASE_URL directly from process.env (not lib/env) so this module stays
// free of the full env-schema validation — it's imported by statically collected
// pages (layout, sitemap, robots, marketing) that run at build time without
// secrets present.
function resolveAppBaseUrl(): string {
  const raw = (process.env.APP_BASE_URL?.trim() || "").replace(/\/+$/, "");
  if (!raw) return "http://localhost:3000";
  try {
    // eslint-disable-next-line no-new
    new URL(raw);
    return raw;
  } catch {
    // Malformed value (e.g. a bare "/") would otherwise crash every
    // statically collected page (layout metadataBase, sitemap, robots) at
    // build time. Fall back rather than take the whole build down.
    return "http://localhost:3000";
  }
}

const APP_BASE_URL = resolveAppBaseUrl();

/**
 * Central SEO / site-identity constants. Everything that needs the canonical
 * public URL (metadata, sitemap, robots, OG images, JSON-LD) reads it from here
 * so a domain switch is a single env change (APP_BASE_URL).
 */
export const SITE = {
  name: "ZekerFlex",
  tagline: "zeker van je werk",
  url: APP_BASE_URL,
  locale: "nl_NL",
  description:
    "Het Nederlandse platform waar werknemers, flexwerkers en werkgevers elkaar vinden. Slim gematcht op reistijd en vakmatch, met de optie om dezelfde werkdag uitbetaald te worden, volledig Wet DBA-proof — en 100% zelf gehost.",
  shortDescription: "Slim gematcht, zelf je uitbetaling kiezen, volledig Wet DBA-proof.",
  keywords: [
    // wat we zijn
    "zzp platform",
    "flexwerk platform",
    "uitzendbureau alternatief",
    "freelance opdrachten vinden",
    "klussen platform",
    "shifts app",
    "flexpool software",
    // zoekintentie — freelancers
    "zzp klus vinden",
    "freelance werk zonder tussenpersoon",
    "bijbaan direct uitbetaald",
    "zelfde dag uitbetaald werken",
    "werken zonder KVK",
    "uitzendkracht worden",
    "flexwerk in de buurt",
    // zoekintentie — werkgevers
    "zzp'er inhuren",
    "flexkrachten inhuren",
    "personeel inhuren horeca",
    "personeel inhuren retail",
    "uitzendkrachten inhuren",
    "tijdelijk personeel vinden",
    // compliance
    "Wet DBA proof",
    "modelovereenkomst zzp",
    "schijnzelfstandigheid voorkomen",
    "handhaving Wet DBA 2026",
    // verloning
    "sneller uitbetaald zzp",
    "wekelijkse verloning",
    "StiPP pensioen uitzendkracht",
    "ABU fasensysteem",
  ],
  twitter: "@zekerflex",
  email: "info@zekerflex.com",
  foundingYear: "2025",
} as const;

/**
 * Social profiles. Swap in the real handles/URLs when the accounts exist —
 * the footer and schema.org `sameAs` read straight from here.
 */
export const SOCIALS: { name: string; href: string }[] = [
  { name: "Instagram", href: "https://www.instagram.com/zekerflex" },
  { name: "TikTok", href: "https://www.tiktok.com/@zekerflex" },
  { name: "YouTube", href: "https://www.youtube.com/@Zekerflex" },
];

/** App store links. Swap in the real listing URLs once the apps are published. */
export const APP_LINKS = {
  appStore: "https://apps.apple.com/nl/search?term=zekerflex",
  playStore: "https://play.google.com/store/search?q=zekerflex&c=apps",
} as const;

/**
 * Purpose-specific contact addresses. All of these are aliases on the
 * zekerflex.com domain that forward to info@zekerflex.com; using the right one
 * keeps inbound mail sortable and lets us route later without touching code.
 * `uitzendbureau@` and `noreply@` are real mailboxes (see lib/env MAIL_*).
 */
export const CONTACTS = {
  general: "info@zekerflex.com",
  support: "support@zekerflex.com",
  privacy: "privacy@zekerflex.com",
  security: "security@zekerflex.com",
  facturen: "facturen@zekerflex.com",
  klachten: "klachten@zekerflex.com",
  sales: "sales@zekerflex.com",
  partners: "partners@zekerflex.com",
  pers: "media@zekerflex.com",
  werkenbij: "werkenbij@zekerflex.com",
  feedback: "feedback@zekerflex.com",
  uitzendbureau: "uitzendbureau@zekerflex.com",
  nieuwsbrief: "nieuwsbrief@zekerflex.com",
  bounces: "bounced@zekerflex.com",
} as const;

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;

/** schema.org Organization block for the homepage <head>. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    legalName: "ZekerFlex B.V.",
    url: SITE.url,
    logo: `${SITE.url}/icon.svg`,
    image: `${SITE.url}/opengraph-image`,
    slogan: SITE.tagline,
    description: SITE.description,
    email: SITE.email,
    foundingDate: SITE.foundingYear,
    areaServed: { "@type": "Country", name: "Netherlands" },
    knowsLanguage: "nl-NL",
    address: { "@type": "PostalAddress", addressCountry: "NL" },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACTS.support,
        areaServed: "NL",
        availableLanguage: ["nl"],
      },
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: CONTACTS.sales,
        areaServed: "NL",
        availableLanguage: ["nl"],
      },
    ],
    sameAs: SOCIALS.map((s) => s.href),
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    url: SITE.url,
    inLanguage: "nl-NL",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * schema.org Service — what ZekerFlex actually offers, with the price points
 * spelled out so they're eligible for offer rich-results on brand + category
 * queries ("zzp platform kosten", "sneller uitbetaald zzp").
 */
export function serviceJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "ZekerFlex — matching, verloning en uitbetaling voor flexwerk",
    serviceType: "Arbeidsbemiddeling en flexpool-software",
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "Country", name: "Netherlands" },
    audience: [
      { "@type": "Audience", audienceType: "zzp'ers en freelancers" },
      { "@type": "Audience", audienceType: "flexwerkers en uitzendkrachten" },
      { "@type": "Audience", audienceType: "werkgevers en opdrachtgevers" },
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Meedoen als freelancer of flexwerker",
        price: "0",
        priceCurrency: "EUR",
        description: "Gratis account, gratis matching. Je kiest zelf per dienst hoe snel je wordt uitbetaald.",
      },
      {
        "@type": "Offer",
        name: "Personeel inhuren als bedrijf",
        priceCurrency: "EUR",
        price: "3.50",
        unitText: "gewerkt uur",
        description: "€ 3,50 platformkosten per gewerkt uur, alleen als er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten.",
      },
    ],
  };
}

/** schema.org BreadcrumbList — pass an ordered [name, path] trail. */
export function breadcrumbJsonLd(trail: [name: string, path: string][]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${SITE.url}${path}`,
    })),
  };
}

/**
 * Per-page canonical + OG url. Next merges metadata per segment, so the root
 * layout must NOT set a canonical (it would make every page canonical to "/").
 * Each indexable page calls this with its own path.
 */
export function canonical(path: string): { alternates: { canonical: string }; openGraph: { url: string } } {
  return { alternates: { canonical: path }, openGraph: { url: `${SITE.url}${path}` } };
}

/** schema.org FAQPage — mirrors the public assistant's canned answers. */
export function faqJsonLd(): Record<string, unknown> {
  const qa: [string, string][] = [
    [
      "Hoe snel word ik uitbetaald via ZekerFlex?",
      "Dat kies je zelf per dienst nadat je uren zijn goedgekeurd: direct bij goedkeuring (4% van de factuur), binnen 3 werkdagen (2%) of gratis wachten tot de opdrachtgever afrekent (binnen 30 dagen). Uitbetalen gaat via een directe SEPA-overboeking; je hoeft zelf geen factuur te sturen.",
    ],
    [
      "Wat kost ZekerFlex voor bedrijven?",
      "Bedrijven betalen € 3,50 platformkosten per gewerkt uur en alleen als er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten. Voor freelancers is meedoen gratis.",
    ],
    [
      "Hoe zit het met de Wet DBA?",
      "Elke opdracht loopt via een goedgekeurde modelovereenkomst. ZekerFlex bewaakt automatisch de Wet DBA-signalen zoals urenconcentratie, opeenvolgende weken en omzetafhankelijkheid.",
    ],
    [
      "Wie kan zich aanmelden?",
      "Zzp'ers met een KVK-inschrijving, flexwerkers en uitzendkrachten. Je doorloopt een korte identiteitsverificatie; bedrijven registreren hun organisatie en zetten daarna diensten uit.",
    ],
    [
      "Kan ik werken zonder KVK?",
      "Ja. Via het ZekerFlex-uitzendbureau werk je als uitzendkracht: ZekerFlex is je werkgever en verloont je wekelijks met loonstrook, vakantiegeld, pensioen (StiPP) en het ABU-fasensysteem. Alles is terug te lezen in je dashboard.",
    ],
  ];
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
