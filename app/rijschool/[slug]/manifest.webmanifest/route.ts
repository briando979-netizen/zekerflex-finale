import { laadRijschool } from "@/lib/rijschool/pagina";
import { appStartPad } from "@/lib/rijschool/app/twa";

export const runtime = "nodejs";

// De web-app-manifest van een rijschool: op het beginscherm heet de app zoals de
// rijschool, met haar icoon en kleur, en hij opent op de leerling- of instructeur-app.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await laadRijschool((await params).slug);
  if (!r) return new Response("Niet gevonden", { status: 404 });
  const basis = `/rijschool/${r.slug}`;
  const icoon = `${basis}/app-icoon.png`;
  const manifest = {
    id: appStartPad(r.slug),
    name: r.naam,
    short_name: r.naam.slice(0, 20),
    description: `De app van ${r.naam}: je lessen, voortgang en theorie oefenen.`,
    lang: "nl",
    start_url: `${appStartPad(r.slug)}?bron=beginscherm`,
    scope: `${basis}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: r.kleur,
    icons: [
      { src: `${icoon}?maat=192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icoon, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icoon, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  });
}
