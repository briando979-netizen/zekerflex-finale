import { laadRijschool } from "@/lib/rijschool/pagina";
import { deelbeeldJpg } from "@/lib/rijschool/deelbeeld";

export const runtime = "nodejs";

// Het deelbeeld van de rijschoolsite (lib/rijschool/deelbeeld.ts) voor WhatsApp,
// Facebook en LinkedIn. Het adres krijgt ?v=<versie> mee, dus hij mag lang bewaard worden.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await laadRijschool((await params).slug);
  if (!r) return new Response("Niet gevonden", { status: 404 });
  const jpg = await deelbeeldJpg(r);
  return new Response(new Uint8Array(jpg), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" },
  });
}
