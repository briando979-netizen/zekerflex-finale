import sharp from "sharp";
import type { Rijschool } from "@prisma/client";
import { heldfoto, leesHeldfoto } from "@/lib/rijschool/heldfoto";
import { functieafbeeldingSvg } from "@/lib/rijschool/app/twa";

// ---------------------------------------------------------------------------
// Het deelbeeld (og:image) van een rijschoolsite: wat WhatsApp, Facebook en
// LinkedIn laten zien als iemand de site deelt. De foto bovenaan de site als de
// rijschool die heeft, anders de weg met het stuur in haar eigen kleuren (de
// functieafbeelding van de app; alleen vormen, sharp heeft in de container
// geen lettertypes). 1200×630 JPEG: dat tonen alle apps.
// ---------------------------------------------------------------------------

export const DEELBEELD = { breed: 1200, hoog: 630 } as const;

/** Het adres van het deelbeeld; ?v verandert met de kleuren en de foto, zodat apps het nieuwe beeld ophalen. */
export function deelbeeldPad(r: Pick<Rijschool, "slug" | "updatedAt">, fotoTijd: string | null): string {
  const foto = fotoTijd ? Date.parse(fotoTijd) : NaN;
  const v = Number.isFinite(foto) ? `${r.updatedAt.getTime()}-${foto}` : String(r.updatedAt.getTime());
  return `/rijschool/${r.slug}/deelbeeld.jpg?v=${v}`;
}

export async function deelbeeldUrl(r: Pick<Rijschool, "id" | "slug" | "updatedAt">): Promise<string> {
  const f = await heldfoto(r.id).catch(() => null);
  return deelbeeldPad(r, f?.at ?? null);
}

export async function deelbeeldJpg(r: Pick<Rijschool, "id" | "kleur" | "accent">): Promise<Buffer> {
  const foto = await leesHeldfoto(r).catch(() => null);
  // de SVG iets groter tekenen dan 1024×500, zodat hij na het bijsnijden scherp blijft
  const bron = foto ? sharp(foto) : sharp(Buffer.from(functieafbeeldingSvg(r.kleur, r.accent)), { density: 96 });
  return bron
    .resize(DEELBEELD.breed, DEELBEELD.hoog, { fit: "cover", position: foto ? sharp.strategy.attention : "centre" })
    .flatten({ background: "#FFFFFF" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
