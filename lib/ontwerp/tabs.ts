// De tabbladen van de Site-ontwerper. Puur bestand: de ontwerper (client) en de pagina's die ernaar linken (server) lezen
// dezelfde lijst, zodat een link als /admin/ontwerper?tab=shop altijd bij een bestaand tabblad uitkomt.

export const ONTWERPER_TABS = [
  { id: "stijl", label: "Stijl" },
  { id: "teksten", label: "Teksten" },
  { id: "home", label: "Homepage" },
  { id: "shop", label: "Webshop" },
  { id: "paginas", label: "Pagina's" },
  { id: "menu", label: "Menu" },
  { id: "seo", label: "SEO" },
  { id: "media", label: "Media" },
  { id: "ai", label: "AI-hulp" },
  { id: "geschiedenis", label: "Geschiedenis" },
] as const;

export type OntwerperTab = (typeof ONTWERPER_TABS)[number]["id"];

export const isOntwerperTab = (v: unknown): v is OntwerperTab => typeof v === "string" && ONTWERPER_TABS.some((t) => t.id === v);
