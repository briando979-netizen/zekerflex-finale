import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Server-side upload validation shared by every storage entry point. The
// client-supplied filename/MIME type is never trusted on its own — a browser
// (or a hand-crafted request) can set `Content-Type: application/pdf` on a
// file that is actually anything at all. The real type is sniffed from the
// file's magic bytes; only the resulting, verified MIME type is ever stored
// or served back with a Content-Type header.
// ---------------------------------------------------------------------------

export type AllowedUploadKind = "pdf" | "jpeg" | "png" | "webp";

const SNIFFERS: Record<AllowedUploadKind, { mimeType: string; test: (b: Buffer) => boolean }> = {
  pdf: { mimeType: "application/pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  jpeg: { mimeType: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: {
    mimeType: "image/png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  webp: {
    mimeType: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
};

/**
 * Sniffs the file's real type from its magic bytes and returns the verified
 * MIME type. Throws when the bytes don't match any of `allowed` — regardless
 * of what the caller claimed the type was. `allowed` defaults to every kind
 * this app accepts anywhere (PDF + the three image formats used by upload
 * forms across onboarding, certificates and compliance documents).
 */
export function sniffAndVerifyUploadType(
  bytes: Buffer,
  allowed: AllowedUploadKind[] = ["pdf", "jpeg", "png", "webp"],
): string {
  for (const kind of allowed) {
    const sniffer = SNIFFERS[kind];
    if (sniffer.test(bytes)) return sniffer.mimeType;
  }
  throw AppError.validation(
    "Bestandstype niet herkend of niet toegestaan. Toegestaan: PDF, JPEG, PNG, WebP.",
  );
}
