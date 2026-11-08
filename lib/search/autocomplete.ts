import { prisma } from "@/lib/prisma";

export interface AutocompleteResult {
  text: string;
  type: "location" | "skill" | "query";
  popularity: number;
}

const locations = [
  "Amsterdam",
  "Rotterdam",
  "Utrecht",
  "Leiden",
  "Haarlem",
  "Groningen",
  "Arnhem",
  "Eindhoven",
];
const skills = [
  "customer service",
  "logistics",
  "warehouse",
  "retail",
  "hospitality",
  "cleaning",
  "driving",
];

export async function autocomplete(prefix: string, limit = 10): Promise<AutocompleteResult[]> {
  const lower = prefix.toLowerCase();
  if (!lower) return [];

  const results: AutocompleteResult[] = [];

  // Locations
  locations
    .filter((l) => l.toLowerCase().startsWith(lower))
    .forEach((l) => {
      results.push({
        text: l,
        type: "location",
        popularity: 0.9,
      });
    });

  // Skills
  skills
    .filter((s) => s.toLowerCase().includes(lower))
    .forEach((s) => {
      results.push({
        text: s,
        type: "skill",
        popularity: 0.7,
      });
    });

  // Recent searches (mocked)
  results.push({
    text: `${prefix}*`,
    type: "query",
    popularity: 0.5,
  });

  return results.sort((a, b) => b.popularity - a.popularity).slice(0, limit);
}

export function correctTypo(query: string): string {
  const typos: Record<string, string> = {
    amstredam: "amsterdam",
    roterdam: "rotterdam",
    utreght: "utrecht",
  };
  return typos[query.toLowerCase()] || query;
}
