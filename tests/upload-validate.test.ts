import { describe, expect, it } from "vitest";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";

const PDF = Buffer.from("%PDF-1.4\n%rest of a real pdf...");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP"),
]);
const HTML_WITH_SCRIPT = Buffer.from("<html><body><script>alert(document.cookie)</script></body></html>");
const EXECUTABLE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — Windows PE header

describe("sniffAndVerifyUploadType", () => {
  it("recognises a real PDF from its magic bytes", () => {
    expect(sniffAndVerifyUploadType(PDF)).toBe("application/pdf");
  });
  it("recognises a real JPEG", () => {
    expect(sniffAndVerifyUploadType(JPEG)).toBe("image/jpeg");
  });
  it("recognises a real PNG", () => {
    expect(sniffAndVerifyUploadType(PNG)).toBe("image/png");
  });
  it("recognises a real WebP", () => {
    expect(sniffAndVerifyUploadType(WEBP)).toBe("image/webp");
  });

  it("rejects an HTML/script payload even if it were labelled as an image", () => {
    expect(() => sniffAndVerifyUploadType(HTML_WITH_SCRIPT)).toThrow();
  });
  it("rejects a Windows executable disguised with a PDF Content-Type", () => {
    expect(() => sniffAndVerifyUploadType(EXECUTABLE)).toThrow();
  });
  it("rejects a type not present in the caller's allowlist even if otherwise valid", () => {
    expect(() => sniffAndVerifyUploadType(PDF, ["jpeg", "png", "webp"])).toThrow();
  });
});
