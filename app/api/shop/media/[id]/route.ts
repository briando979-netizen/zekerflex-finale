import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only serves an upload that is actually referenced as a shop product's
// image/model — readUpload() itself has no ownership check, so without this
// guard any upload id (an ID document, a bank statement, ...) could be
// fetched through what is meant to be a public product-photo endpoint.
export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const linked = await prisma.shopProduct.findFirst({
      where: { OR: [{ imageUploadId: params.id }, { modelUploadId: params.id }] },
      select: { id: true },
    });
    if (!linked) return NextResponse.json({ error: "Media niet gevonden" }, { status: 404 });

    const file = await readUpload(params.id);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media niet gevonden" }, { status: 404 });
  }
}