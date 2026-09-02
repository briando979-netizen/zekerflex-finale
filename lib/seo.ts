// Read APP_BASE_URL directly from process.env (not lib/env) so this module stays
// free of the full env-schema validation — it's imported by statically collected
// pages (layout, sitemap, robots, marketing) that run at build time without
// secrets present.
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

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
    "zzp platform",
    "flexwerk",
    "uitzendwerk",
    "freelance opdrachten",
    "shifts",
    "Wet DBA",
    "sneller uitbetaald",
    "modelovereenkomst",
    "zzp'er inhuren",
    "flexpool",
  ],
  twitter: "@zekerflex",
  email: "info@zekerflex.com",
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

/** schema.org Organization block for the homepage <head>. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/icon.svg`,
    description: SITE.description,
    email: SITE.email,
    areaServed: "NL",
    knowsLanguage: "nl-NL",
    sameAs: SOCIALS.map((s) => s.href),
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    inLanguage: "nl-NL",
  };
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
