import { env } from "@/lib/env";
import Website from "@/components/studio/Website";

export const dynamic = "force-dynamic";

// Webshop → Pagina's: dezelfde paginabouwer als de website, op de webshop van het bedrijf
// (een eigen site). `?pagina=voorwaarden` opent meteen die pagina (Overzicht, Slim).
export default async function StudioWebshopPaginasPage({ searchParams }: { searchParams: Promise<{ pagina?: string | string[] }> }) {
  const { pagina } = await searchParams;
  const slug = typeof pagina === "string" && /^[a-z0-9-]{1,40}$/.test(pagina) ? pagina : undefined;
  return <Website origin={new URL(env.APP_BASE_URL).origin} pagina={slug} />;
}
