import { prisma } from "@/lib/prisma";
import { generateImage } from "@/lib/ai/images";
import { storeUpload } from "@/lib/storage/local";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Genereert een productfoto via de eigen (self-hosted) beeld-generator en hangt
// 'm aan een shopproduct. Bedoeld voor de verzonnen concept-collectie-producten
// (Winter 2026 / Zakelijk) die zonder foto binnenkomen en active:false blijven
// tot de eigenaar ze controleert. Dit bestand zet NOOIT active op true — het
// vult alleen de foto, zodat de eigenaar het product met één klik kan nalopen
// en zelf activeren. Dormant zonder IMAGE_ENABLED (nette melding via AppError).
// ---------------------------------------------------------------------------

const COLLECTION_HINT: Record<string, string> = {
  "Winter 2026": "warm winter workwear, cosy insulated fabric",
  Zakelijk: "clean business / smart-casual workwear",
};

/** Bouwt een studio-productfoto-prompt uit de eigen productvelden. */
export function buildConceptPrompt(p: {
  name: string;
  description: string;
  category: string;
  collection: string | null;
  gender: string | null;
}): string {
  const who =
    p.gender === "heren"
      ? "men's"
      : p.gender === "vrouwen"
        ? "women's"
        : p.gender === "kinderen"
          ? "children's"
          : "";
  const hint = p.collection ? (COLLECTION_HINT[p.collection] ?? p.collection) : "";
  return [
    `Professional e-commerce product photo of a ${who} ${p.name}`.replace(/\s+/g, " ").trim() + ".",
    p.description,
    hint,
    "Single garment or item neatly presented, centered on a plain light-grey seamless studio background, soft even lighting, sharp focus, realistic fabric texture, catalogue style, no text, no logo, no watermark, no people.",
  ]
    .filter(Boolean)
    .join(" ");
}

const NEGATIVE =
  "text, letters, watermark, logo, brand name, people, face, hands, extra limbs, deformed, duplicate, low quality, blurry, jpeg artifacts, cropped";

export interface ConceptPhotoResult {
  imageUrl: string;
  uploadId: string;
}

/**
 * Rendert één foto voor het product en koppelt die (imageUploadId + imageUrl).
 * Laat `active` bewust ongemoeid. Gooit een nette AppError als de generator uit
 * staat of niet bereikbaar is.
 */
export async function generateAndAttachConceptPhoto(
  productId: string,
  actorUserId: string | null,
): Promise<ConceptPhotoResult> {
  const product = await prisma.shopProduct.findUnique({ where: { id: productId } });
  if (!product) throw AppError.notFound("Product niet gevonden");

  const img = await generateImage({
    prompt: buildConceptPrompt(product),
    negativePrompt: NEGATIVE,
    width: 768,
    height: 960, // 4:5 — past bij de aspect-[4/5] productkaart in de shop
    purpose: `shop:concept:${product.slug}`,
  });

  const bytes = Buffer.from(img.b64, "base64");
  const upload = await storeUpload({
    filename: `${product.slug}.png`,
    mimeType: "image/png",
    bytes,
    uploadedById: actorUserId,
  });

  const imageUrl = `/api/shop/media/${upload.id}`;
  await prisma.shopProduct.update({
    where: { id: product.id },
    data: { imageUploadId: upload.id, imageUrl },
  });
  return { imageUrl, uploadId: upload.id };
}
