import { laadRijschool } from "@/lib/rijschool/pagina";
import { icoonPng } from "@/lib/rijschool/app/store";

export const runtime = "nodejs";

// Het app-icoon van een rijschool (stuur in haar kleuren): voor het beginscherm,
// het beheer en de Android-app. ?maat=192 voor een kleinere versie.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await laadRijschool((await params).slug);
  if (!r) return new Response("Niet gevonden", { status: 404 });
  const maat = new URL(request.url).searchParams.get("maat") === "192" ? 192 : 512;
  const png = await icoonPng(r, maat);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
