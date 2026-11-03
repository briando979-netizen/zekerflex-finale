import { cache } from "react";
import { rijschoolVanSlug } from "@/lib/rijschool/store";

// Eén databasevraag per verzoek voor de rijschool achter /rijschool/<slug>,
// gedeeld door layouts, pagina's en metadata.
export const laadRijschool = cache((slug: string) => rijschoolVanSlug(slug));
