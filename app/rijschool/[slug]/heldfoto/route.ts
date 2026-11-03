import { laadRijschool } from "@/lib/rijschool/pagina";
import { leesHeldfoto } from "@/lib/rijschool/heldfoto";

export const runtime = "nodejs";

// De foto bovenaan de rijschoolsite (lib/rijschool/heldfoto.ts). Het adres krijgt
// ?v=<tijd> mee, dus hij mag lang bewaard worden.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await laadRijschool((await params).slug);
  if (!r) return new Response("Niet gevonden", { status: 404 });
  const foto = await leesHeldfoto(r);
  if (!foto) return new Response("Geen foto", { status: 404 });
  return new Response(new Uint8Array(foto), {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=86400" },
  });
}
