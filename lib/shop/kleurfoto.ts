import fs from "node:fs";
import path from "node:path";
import { kleurFotoKandidaten } from "@/lib/shop/kleurfoto-naam";

// Welke kleurfoto's er echt zijn (lib/shop/kleurfoto-naam.ts): de bestanden in public/shop. Ze veranderen alleen bij een
// uitrol, dus het antwoord blijft in het geheugen (via globalThis: Next bundelt routes apart, AGENTS.md).

const g = globalThis as unknown as { __zfKleurFotoBestaat?: Map<string, boolean> };
const bestaat = (g.__zfKleurFotoBestaat ??= new Map<string, boolean>());

function isEr(url: string): boolean {
  const eerder = bestaat.get(url);
  if (eerder !== undefined) return eerder;
  let ja = false;
  try {
    ja = fs.statSync(path.join(process.cwd(), "public", ...url.split("/").filter(Boolean))).isFile();
  } catch {
    ja = false;
  }
  bestaat.set(url, ja);
  return ja;
}

/** Per kleur van het product de foto, als die er is: { Lichtblauw: "/shop/business-overhemd-lichtblauw.jpg", … }. */
export function kleurFotos(p: { slug: string; imageUrl: string | null; variants: { color: string | null }[] }): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const kleur of new Set(p.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))) {
    const foto = kleurFotoKandidaten(p.slug, p.imageUrl, kleur).find(isEr);
    if (foto) uit[kleur] = foto;
  }
  return uit;
}
