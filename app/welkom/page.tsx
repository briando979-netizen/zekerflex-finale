import type { Metadata } from "next";
import { WelkomCarousel } from "@/components/welkom/WelkomCarousel";
import { getLocale } from "@/lib/i18n/server";
import { WELKOM_DICTS } from "@/lib/i18n/welkom";
import { registerHref } from "@/lib/welkom/slides";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Welkom",
  robots: { index: false, follow: false },
};

/** Welkomstcarrousel van de app voor een eerste, niet-ingelogde bezoeker (mobiel eerst). */
export default async function WelkomPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const locale = await getLocale();
  return <WelkomCarousel locale={locale} texts={WELKOM_DICTS[locale]} registerHref={registerHref(searchParams)} />;
}
