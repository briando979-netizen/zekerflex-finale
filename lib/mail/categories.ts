// ---------------------------------------------------------------------------
// Mail categories. Every outbound mail has a `kind`; this maps it to either
// "essential" (always delivered, no unsubscribe) or an optional category the
// recipient can switch off. Anything not explicitly listed is essential — we
// never suppress a mail we haven't deliberately marked as optional.
// ---------------------------------------------------------------------------

export interface MailCategory {
  slug: string;
  label: string;
  desc: string;
}

export const OPTIONAL_CATEGORIES: MailCategory[] = [
  {
    slug: "klus-alerts",
    label: "Nieuwe klussen die bij je passen",
    desc: "Een seintje als er werk voorbijkomt dat matcht met je vak, reistijd en beschikbaarheid.",
  },
  {
    slug: "herinneringen",
    label: "Herinneringen",
    desc: "Zachte reminders: je dienst begint morgen, vergeet je uren niet in te dienen, je verificatie is nog niet af.",
  },
  {
    slug: "reviews",
    label: "Review-verzoeken",
    desc: "Een vraag om een beoordeling achter te laten: na een afgeronde dienst, of namens een bedrijf waar je klant bent.",
  },
  {
    slug: "updates",
    label: "Productupdates",
    desc: "Nieuwe functies en belangrijke wijzigingen aan het platform.",
  },
  {
    slug: "tips",
    label: "Tips & uitleg",
    desc: "Af en toe een tip om meer uit ZekerFlex te halen, en uitleg bij nieuwe onderdelen.",
  },
  {
    slug: "nieuwsbrief",
    label: "Nieuwsbrief",
    desc: "De algemene ZekerFlex-nieuwsbrief. Afmelden kan ook via de link onderaan elke nieuwsbrief.",
  },
  {
    slug: "sales-outreach",
    label: "Zakelijke introductie van ZekerFlex",
    desc: "Een eenmalige zakelijke kennismaking omdat je bedrijf mogelijk baat heeft bij flexibele bezetting. Je kunt je meteen afmelden.",
  },
];

/**
 * In welke app de voorkeuren staan (15 nov 2026). De eigenaar wil alles apart voor werkers en bedrijven: een bedrijf zag
 * "Nieuwe klussen die bij je passen" en "vergeet je uren niet in te dienen", een werker "Zakelijke introductie … je bedrijf".
 */
export type MailKant = "werker" | "bedrijf";

/** Categorieën die maar bij één kant horen; de zakelijke introductie is voor wie (nog) geen account heeft, niet voor een app. */
const ALLEEN_VOOR: Record<string, MailKant | "niet-in-app"> = {
  "klus-alerts": "werker",
  "sales-outreach": "niet-in-app",
};

/** Een omschrijving die past bij wie hem leest; de rest blijft zoals hij is. */
const OMSCHRIJVING: Record<string, Record<MailKant, string>> = {
  herinneringen: {
    werker: "Zachte reminders: je dienst begint morgen, vergeet je uren niet in te dienen, je verificatie is nog niet af.",
    bedrijf: "Zachte reminders over je account, je diensten en de uren van je krachten.",
  },
  reviews: {
    werker: "Een vraag om een beoordeling achter te laten na een afgeronde dienst.",
    bedrijf: "Een vraag om een kracht te beoordelen na een afgeronde dienst.",
  },
};

/** De categorieën voor de voorkeuren in één app; zonder kant (de openbare afmeldpagina) alle categorieën, zoals altijd. */
export function categorieenVoor(kant?: MailKant): MailCategory[] {
  if (!kant) return OPTIONAL_CATEGORIES;
  return OPTIONAL_CATEGORIES.filter((c) => {
    const alleen = ALLEEN_VOOR[c.slug];
    return alleen === undefined || alleen === kant;
  }).map((c) => {
    const desc = OMSCHRIJVING[c.slug]?.[kant];
    return desc ? { ...c, desc } : c;
  });
}

const KIND_TO_CATEGORY: Record<string, string> = {
  // optional
  "klus-alert": "klus-alerts",
  "klus-alerts": "klus-alerts",
  reminder: "herinneringen",
  herinnering: "herinneringen",
  "review-verzoek": "reviews",
  "review-request": "reviews",
  "google-review-verzoek": "reviews",
  "product-update": "updates",
  update: "updates",
  tip: "tips",
  tips: "tips",
  onboarding: "tips",
  nieuwsbrief: "nieuwsbrief",
  digest: "klus-alerts",
  "sales-outreach": "sales-outreach",
  // everything below is essential
  verification: "essential",
  welcome: "essential",
  "wachtwoord-reset": "essential",
  "account-verwijdering-bevestiging": "essential",
  "uren-correctie-voorstel": "essential",
  "nieuwsbrief-bevestiging": "essential",
  invoice: "essential",
  payroll: "essential",
  replacement: "essential",
  support: "essential",
  test: "essential",
  "demo-aanvraag": "essential",
  "demo-aanvraag-bevestiging": "essential",
  "rekentool-uitkomst": "essential",
  "rekentool-lead": "essential",
  "uitzendbureau-aanvraag": "essential",
  "uitzendbureau-aanvraag-bevestiging": "essential",
  "shop-order": "essential",
  "shop-order-bevestiging": "essential",
  "open-sollicitatie": "essential",
  "open-sollicitatie-bevestiging": "essential",
  security: "essential",
  dispute: "essential",
  payout: "essential",
  "abu-fase-overgang": "essential",
  "annuleringsclaim-factuur": "essential",
  "admin-bericht": "essential",
  // de voorbeeldmail van een campagne aan de beheerder zelf (Beheer → Sales → campagne): geen outreach, telt nergens mee
  "sales-test": "essential",
  generic: "essential",
};

export function mailCategoryForKind(kind?: string): string {
  if (!kind) return "essential";
  return KIND_TO_CATEGORY[kind] ?? "essential";
}

// Kinds where a person on our side reads and answers replies. Everything else
// is an automated message: replies are not read, and we say so in the mail.
const REPLIABLE_KINDS = new Set([
  "support",
  "invoice-reminder", // clients reply with questions about an invoice
  "onboarding-reminder", // new users reply when they're stuck finishing their account
  "replacement",
  "demo-aanvraag",
  "demo-aanvraag-bevestiging",
  // Rekentool-uitkomst: replyTo is sales@, en de lead-melding aan sales heeft de bezoeker als replyTo.
  "rekentool-uitkomst",
  "rekentool-lead",
  "uitzendbureau-aanvraag",
  "uitzendbureau-aanvraag-bevestiging",
  "open-sollicitatie",
  "open-sollicitatie-bevestiging",
  "shop-order",
  "shop-order-bevestiging",
  // zakelijk offerteverzoek uit de webshop: replyTo is het bedrijf, sales antwoordt
  "shop-offerte",
  "uren-correctie-voorstel",
  // Sales outreach: a human on the sales side reads and answers replies.
  "sales-outreach",
  // De voorbeeldmail van een campagne: moet eruitzien als de echte, dus zonder de regel "automatisch bericht".
  "sales-test",
  // Admin-composed ad-hoc mail — replyTo is the sending admin's own address.
  "admin-bericht",
  // Mail namens een rijschool aan haar leerlingen: antwoorden gaan naar de rijschool (lib/rijschool/mail.ts).
  "rijschool",
  // Google-reviews verzamelen (lib/review-requests/store.ts): een antwoord op het verzoek gaat naar het
  // bedrijf, een antwoord op de feedbackmail naar de klant die de feedback gaf.
  "google-review-verzoek",
  "review-feedback",
  // het eerste antwoord op een mail aan info@ van iemand die werk zoekt (lib/mail/info-ronde.ts): een antwoord
  // daarop komt weer in info@ en wordt door een mens gelezen
  "info-antwoord",
]);

export function isAutomatedKind(kind?: string): boolean {
  return !kind || !REPLIABLE_KINDS.has(kind);
}

export function isOptionalCategory(slug: string): boolean {
  return OPTIONAL_CATEGORIES.some((c) => c.slug === slug);
}

export function categoryBySlug(slug: string): MailCategory | undefined {
  return OPTIONAL_CATEGORIES.find((c) => c.slug === slug);
}
