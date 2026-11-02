import { describe, expect, it, vi } from "vitest";

// 3D-modellen in de webshop: alleen nette glb-bestanden worden gekoppeld; een
// model dat decoders van een externe CDN nodig heeft wordt geweigerd (CSP).

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvDelete: async () => undefined, kvListEntries: async () => [] }));
vi.mock("@/lib/storage/local", () => ({ readUpload: async () => ({ bytes: Buffer.alloc(0), filename: "x", mimeType: "x" }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));

const { inspectGlb } = await import("@/lib/shop/model3d");

/** Bouwt een minimale glb: kop + JSON-deel (+ optioneel een leeg BIN-deel). */
function glb(json: object, opts: { version?: number; lengthDelta?: number } = {}): Buffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const jsonBuf = Buffer.from(text, "utf8");
  const total = 12 + 8 + jsonBuf.length;
  const out = Buffer.alloc(total);
  out.write("glTF", 0, "latin1");
  out.writeUInt32LE(opts.version ?? 2, 4);
  out.writeUInt32LE(total + (opts.lengthDelta ?? 0), 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.write("JSON", 16, "latin1");
  jsonBuf.copy(out, 20);
  return out;
}

const cube = { asset: { version: "2.0" }, meshes: [{ primitives: [] }], nodes: [{ mesh: 0 }] };

describe("3D-model controleren", () => {
  it("accepteert een gewone glb", () => {
    expect(inspectGlb(glb(cube))).toEqual({ ok: true, meshes: 1, nodes: 1 });
  });

  it("weigert wat geen glb is of beschadigd is", () => {
    expect(inspectGlb(Buffer.from("<html>niet een model</html>"))).toMatchObject({ ok: false });
    expect(inspectGlb(glb(cube, { version: 1 }))).toMatchObject({ ok: false, reason: "Alleen glTF versie 2 wordt ondersteund." });
    expect(inspectGlb(glb(cube, { lengthDelta: 8 }))).toMatchObject({ ok: false, reason: "Het bestand is beschadigd of niet compleet geüpload." });
    expect(inspectGlb(glb({ asset: { version: "2.0" } }))).toMatchObject({ ok: false, reason: "Er zit geen 3D-vorm in het model." });
  });

  it("weigert compressie die een externe decoder nodig heeft", () => {
    const draco = inspectGlb(glb({ ...cube, extensionsUsed: ["KHR_draco_mesh_compression"] }));
    expect(draco.ok).toBe(false);
    if (!draco.ok) expect(draco.reason).toContain("Draco");
    expect(inspectGlb(glb({ ...cube, extensionsRequired: ["KHR_texture_basisu"] })).ok).toBe(false);
    // gewone extensies (bijv. textuur-transformaties) zijn prima
    expect(inspectGlb(glb({ ...cube, extensionsUsed: ["KHR_texture_transform"] })).ok).toBe(true);
  });
});
