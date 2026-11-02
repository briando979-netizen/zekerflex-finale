import { NextResponse } from "next/server";
import { readUpload } from "@/lib/storage/local";
import { getModel3D } from "@/lib/shop/model3d";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/shop/model3d/<productId> — het 3D-model van een webshopproduct.
// Serveert alleen een upload die de beheerder bewust als 3D-model heeft
// gekoppeld (lib/shop/model3d.ts); andere uploads zijn hier niet op te vragen.
export async function GET(_request: Request, props: { params: Promise<{ productId: string }> }): Promise<NextResponse> {
  const { productId } = await props.params;
  const model = await getModel3D(productId);
  if (!model) return NextResponse.json({ error: "Geen 3D-model" }, { status: 404 });
  try {
    const file = await readUpload(model.uploadId);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        // AR op Android haalt het model op via de Google-app (Scene Viewer).
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Geen 3D-model" }, { status: 404 });
  }
}
