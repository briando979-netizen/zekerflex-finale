// ---------------------------------------------------------------------------
// De vaste fotoplekken van de marketingsite (puur en browser-veilig: de
// Site-ontwerper toont ze ook). Het bestand op schijf en de Studio staan in
// lib/marketing/photos.ts; een blijvende vervanging uit de mediabibliotheek in
// lib/ontwerp/fotos.ts.
// ---------------------------------------------------------------------------

export interface PhotoSpec {
  file: string;
  alt: string;
  aspect: "portrait" | "landscape" | "wide";
  /** waar de foto staat, voor de beheerder */
  plek: string;
}

export const MARKETING_PHOTOS = {
  hero: {
    file: "hero-freelancer.jpg",
    alt: "Een zzp'er onderweg naar een dienst, telefoon in de hand",
    aspect: "portrait",
    plek: "Homepage, grote foto bovenaan",
  },
  freelancer: {
    file: "freelancer-at-work.jpg",
    alt: "Een zelfstandige aan het werk op locatie",
    aspect: "landscape",
    plek: "Homepage-blok Voor freelancers en de pagina Voor freelancers",
  },
  employer: {
    file: "employer-branch.jpg",
    alt: "Een vestigingsmanager bekijkt de bezetting op een tablet",
    aspect: "landscape",
    plek: "Homepage-blok Voor bedrijven",
  },
  employerHero: {
    file: "employer-hero.jpg",
    alt: "Flexkracht aan het werk in een wasserij",
    aspect: "portrait",
    plek: "Pagina Voor bedrijven, bovenaan",
  },
  team: {
    file: "team-shift.jpg",
    alt: "Een team flexwerkers tijdens een drukke dienst",
    aspect: "wide",
    plek: "Over ons",
  },
} satisfies Record<string, PhotoSpec>;

export type PhotoKey = keyof typeof MARKETING_PHOTOS;

export const PHOTO_KEYS = Object.keys(MARKETING_PHOTOS) as PhotoKey[];
export const isPhotoKey = (v: unknown): v is PhotoKey => typeof v === "string" && (PHOTO_KEYS as string[]).includes(v);
