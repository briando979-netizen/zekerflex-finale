import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { readUpload } from "@/lib/storage/local";
import { eisBeheer } from "@/lib/rijschool/toegang";
import { appVan } from "@/lib/rijschool/app/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — de laatst gebouwde .aab, om de eerste versie zelf in Play Console te uploaden.
export async function GET(): Promise<Response> {
  try {
    const { rijschool } = await eisBeheer();
    const a = await appVan(rijschool);
    if (!a?.aabUploadId) throw AppError.notFound("Er is nog geen app gebouwd.");
    const f = await readUpload(a.aabUploadId);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${f.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
