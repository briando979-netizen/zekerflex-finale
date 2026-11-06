import { describe, expect, it } from "vitest";
import { veiligUploadType } from "@/lib/storage/validate";

describe("veiligUploadType", () => {
  it("herkent een PNG op de bytes, ook als de browser iets anders zegt", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(veiligUploadType(png, "text/html")).toBe("image/png");
  });

  it("maakt van HTML en SVG nooit een pagina", () => {
    expect(veiligUploadType(Buffer.from("<html><script>alert(1)</script>"), "text/html")).toBe("application/octet-stream");
    expect(veiligUploadType(Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")).toBe("application/octet-stream");
  });

  it("laat gewone tekst leesbaar", () => {
    expect(veiligUploadType(Buffer.from("a,b\n1,2\n"), "text/csv; charset=utf-8")).toBe("text/csv");
  });

  it("weigert tekst-type bij binaire inhoud", () => {
    expect(veiligUploadType(Buffer.from([0, 1, 2, 3]), "text/plain")).toBe("application/octet-stream");
  });

  it("herkent een glb-model", () => {
    expect(veiligUploadType(Buffer.from("glTF\x02\x00\x00\x00"), undefined)).toBe("model/gltf-binary");
  });
});
