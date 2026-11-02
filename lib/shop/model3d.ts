import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { readUpload } from "@/lib/storage/local";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// 3D-model per webshopproduct (draaien, zoomen, AR op de telefoon). De beheerder
// uploadt een .glb (de gewone upload); hier controleren we het bestand en
// koppelen we het aan het product. Geen databasewijziging: de koppeling staat in
// de KeyValueStore. Let op: "model" in ShopProduct (modelUploadId/modelPhotoUrl)
// is een foto van iemand die het product draagt; dit is het 3D-model.
//
// Alleen gewone glb's: Draco-, meshopt- en Basis-compressie hebben decoders van
// een externe CDN nodig, en die laat onze CSP (terecht) niet toe.
// ---------------------------------------------------------------------------

export const MAX_MODEL_BYTES = 25_000_000;
const UNSUPPORTED_EXT: Record<string, string> = {
  KHR_draco_mesh_compression: "Draco-compressie",
  EXT_meshopt_compression: "meshopt-compressie",
  KHR_texture_basisu: "Basis/KTX2-texturen",
};

export interface Model3D {
  uploadId: string;
  filename: string;
  bytes: number;
  meshes: number;
  at: string;
  by: string;
}

export type GlbInspect = { ok: true; meshes: number; nodes: number } | { ok: false; reason: string };

/** Controleert een binaire glTF (glb): kop, lengte, JSON-deel en gebruikte extensies. */
export function inspectGlb(bytes: Buffer): GlbInspect {
  if (bytes.length < 20) return { ok: false, reason: "Het bestand is te klein voor een 3D-model." };
  if (bytes.length > MAX_MODEL_BYTES) return { ok: false, reason: `Het model is groter dan ${MAX_MODEL_BYTES / 1_000_000} MB. Verklein de texturen.` };
  if (bytes.toString("latin1", 0, 4) !== "glTF") return { ok: false, reason: "Dit is geen .glb-bestand (binaire glTF). Exporteer het model als glb." };
  if (bytes.readUInt32LE(4) !== 2) return { ok: false, reason: "Alleen glTF versie 2 wordt ondersteund." };
  if (bytes.readUInt32LE(8) !== bytes.length) return { ok: false, reason: "Het bestand is beschadigd of niet compleet geüpload." };
  const chunkLength = bytes.readUInt32LE(12);
  if (bytes.toString("latin1", 16, 20) !== "JSON" || 20 + chunkLength > bytes.length) return { ok: false, reason: "Het model mist zijn beschrijving (JSON-deel)." };
  let json: { meshes?: unknown[]; nodes?: unknown[]; extensionsUsed?: string[]; extensionsRequired?: string[] };
  try {
    json = JSON.parse(bytes.toString("utf8", 20, 20 + chunkLength));
  } catch {
    return { ok: false, reason: "De beschrijving in het model is onleesbaar." };
  }
  const used = [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])];
  const bad = used.filter((e) => UNSUPPORTED_EXT[e]).map((e) => UNSUPPORTED_EXT[e]);
  if (bad.length > 0) return { ok: false, reason: `Het model gebruikt ${[...new Set(bad)].join(" en ")}. Exporteer het opnieuw zonder compressie.` };
  const meshes = Array.isArray(json.meshes) ? json.meshes.length : 0;
  if (meshes === 0) return { ok: false, reason: "Er zit geen 3D-vorm in het model." };
  return { ok: true, meshes, nodes: Array.isArray(json.nodes) ? json.nodes.length : 0 };
}

const KEY = (productId: string) => `shop-3d:${productId}`;

export async function getModel3D(productId: string): Promise<Model3D | null> {
  return kvGet<Model3D>(KEY(productId)).catch(() => null);
}

/** Alle producten met een 3D-model (voor badges in de winkel en het overzicht in beheer). */
export async function listModels3D(): Promise<Map<string, Model3D>> {
  const rows = await kvListEntries<Model3D>("shop-3d:", 2000).catch(() => []);
  return new Map(rows.map((r) => [r.key.slice("shop-3d:".length), r.value]));
}

export const model3dUrl = (productId: string) => `/api/shop/model3d/${productId}`;

export async function attachModel3D(productId: string, uploadId: string, actor: string): Promise<Model3D> {
  let file: { bytes: Buffer; filename?: string };
  try {
    file = await readUpload(uploadId);
  } catch {
    throw new Error("Upload niet gevonden. Upload het bestand opnieuw.");
  }
  const check = inspectGlb(file.bytes);
  if (!check.ok) throw new Error(check.reason);
  const model: Model3D = { uploadId, filename: file.filename ?? "model.glb", bytes: file.bytes.length, meshes: check.meshes, at: new Date().toISOString(), by: actor };
  await kvSet(KEY(productId), model);
  await recordAudit({ category: "ADMIN", action: "shop.model3d.attached", actorUserId: actor, summary: `3D-model gekoppeld (${model.filename}, ${Math.round(model.bytes / 1024)} kB)`, targetType: "shopProduct", targetId: productId });
  return model;
}

export async function detachModel3D(productId: string, actor: string): Promise<void> {
  await kvDelete(KEY(productId));
  await recordAudit({ category: "ADMIN", action: "shop.model3d.removed", actorUserId: actor, summary: "3D-model ontkoppeld", targetType: "shopProduct", targetId: productId });
}
