import { NextResponse } from "next/server";

// An attachment comes from whoever sent the mail. It is always a download,
// never rendered on our origin: only harmless types keep their Content-Type
// (HTML/SVG/JS become octet-stream), with nosniff and a sandbox CSP on top.
const SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "text/calendar",
  "application/zip",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function attachmentResponse(a: { filename: string; contentType: string; bytes: Buffer }): NextResponse {
  const type = (a.contentType.toLowerCase().split(";")[0] ?? "").trim();
  // eslint-disable-next-line no-control-regex
  const ascii = a.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim() || "bijlage";
  return new NextResponse(new Uint8Array(a.bytes), {
    headers: {
      "Content-Type": SAFE_TYPES.has(type) ? type : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "Content-Length": String(a.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
