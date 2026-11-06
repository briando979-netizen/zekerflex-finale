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

// ---------------------------------------------------------------------------
// Vrije uploads (Admin → "+" in de chatbalk, productfoto's, 3D-modellen): daar
// mag elk bestand in, dus weigeren kan niet. Wel bepalen we het type zelf:
// herkende bytes krijgen hun echte MIME-type, alles anders wordt
// `application/octet-stream`. Zo kan een bestand dat de browser als
// `text/html` of `image/svg+xml` aanmeldt nooit als pagina met scripts vanaf
// ons eigen domein worden geserveerd.
// ---------------------------------------------------------------------------

const EXTRA_SNIFFERS: Array<{ mimeType: string; test: (b: Buffer) => boolean }> = [
  { mimeType: "image/gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { mimeType: "model/gltf-binary", test: (b) => b.subarray(0, 4).toString("latin1") === "glTF" },
  {
    mimeType: "application/zip",
    test: (b) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05),
  },
  { mimeType: "audio/mpeg", test: (b) => b.subarray(0, 3).toString("latin1") === "ID3" },
  { mimeType: "video/mp4", test: (b) => b.length > 8 && b.subarray(4, 8).toString("latin1") === "ftyp" },
  {
    mimeType: "audio/wav",
    test: (b) =>
      b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE",
  },
];

/** Tekstsoorten die leesbaar blijven voor de assistent (.txt, .csv, .md, .json). */
const TEKST_TYPES = new Set(["text/plain", "text/csv", "text/markdown", "application/json"]);

function lijktTekst(b: Buffer): boolean {
  const kop = b.subarray(0, 512);
  for (const c of kop) {
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue;
    if (c < 0x20) return false;
  }
  return true;
}

/**
 * Bepaalt het MIME-type van een vrije upload op de inhoud, niet op wat de
 * browser beweert. Herkende bytes winnen altijd; een tekstbestand houdt een
 * opgegeven tekst-type als de inhoud echt tekst is (HTML en SVG staan niet in
 * de lijst en worden dus octet-stream); de rest wordt `application/octet-stream`.
 * Gooit nooit.
 */
export function veiligUploadType(bytes: Buffer, opgegeven: string | undefined): string {
  for (const kind of Object.keys(SNIFFERS) as AllowedUploadKind[]) {
    if (SNIFFERS[kind].test(bytes)) return SNIFFERS[kind].mimeType;
  }
  for (const s of EXTRA_SNIFFERS) {
    if (s.test(bytes)) return s.mimeType;
  }
  const basis = (opgegeven ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (TEKST_TYPES.has(basis) && bytes.length > 0 && lijktTekst(bytes)) return basis;
  return "application/octet-stream";
}
