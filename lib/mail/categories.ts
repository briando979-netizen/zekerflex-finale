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
    desc: "Een vraag om een beoordeling achter te laten na een afgeronde dienst.",
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
];

const KIND_TO_CATEGORY: Record<string, string> = {
  // optional
  "klus-alert": "klus-alerts",
  "klus-alerts": "klus-alerts",
  reminder: "herinneringen",
  herinnering: "herinneringen",
  "review-verzoek": "reviews",
  "review-request": "reviews",
  "product-update": "updates",
  update: "updates",
  tip: "tips",
  tips: "tips",
  onboarding: "tips",
  nieuwsbrief: "nieuwsbrief",
  digest: "klus-alerts",
  // everything below is essential
  verification: "essential",
  welcome: "essential",
  "wachtwoord-reset": "essential",
  "nieuwsbrief-bevestiging": "essential",
  invoice: "essential",
  payroll: "essential",
  replacement: "essential",
  support: "essential",
  test: "essential",
  "demo-aanvraag": "essential",
  "demo-aanvraag-bevestiging": "essential",
  "open-sollicitatie": "essential",
  "open-sollicitatie-bevestiging": "essential",
  security: "essential",
  dispute: "essential",
  payout: "essential",
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
  "replacement",
  "demo-aanvraag",
  "demo-aanvraag-bevestiging",
  "open-sollicitatie",
  "open-sollicitatie-bevestiging",
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
