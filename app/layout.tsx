import type { Metadata, Viewport } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import { Suspense } from "react";
import { headers } from "next/headers";
import "./fonts.css";
import "./globals.css";
import { FONT_PRELOADS, fontVariables } from "@/lib/fonts";
import { FontPreloads } from "@/components/ui/FontPreloads";
import { getLocale } from "@/lib/i18n/server";
import { taalRichting } from "@/lib/i18n/config";
import { AnalyticsBeacon } from "@/components/analytics/AnalyticsBeacon";
import { ServiceWorkerRegister } from "@/components/app/ServiceWorkerRegister";
import { KonamiEasterEgg } from "@/components/ui/KonamiEasterEgg";
import { Providers } from "@/components/ui/Providers";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { SITE, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { liveOntwerpCss } from "@/lib/ontwerp/store";
import { activeSeason } from "@/lib/seasons/settings";
import { SeasonalLoader } from "@/components/seasons/SeasonalLoader";

const TITLE = `${SITE.name} — ${SITE.tagline}`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0E12" },
  ],
  colorScheme: "light dark",
  // Lets fixed bars reach into the rounded-corner / home-indicator safe area
  // on iPad Pro and iPhone when installed as a standalone app.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: TITLE,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  publisher: SITE.name,
  // No canonical here on purpose: Next merges metadata per route segment, so a
  // canonical set on the root layout would make every page declare itself a
  // duplicate of "/". Each indexable page sets its own via seo.ts `canonical()`.
  category: "business",
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    title: TITLE,
    description: SITE.shortDescription,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE.shortDescription,
    site: SITE.twitter,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  // Drop the Search Console / Bing tokens in via env (no rebuild-time secret) to
  // claim the property and get indexing coverage + query reports.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : {},
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: "black-translucent",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the per-request nonce the middleware set (lib/security/csp.ts). This
  // also opts every route into dynamic rendering — required, because a
  // statically prerendered page can't carry a fresh nonce on its inline
  // bootstrap scripts and the strict CSP would then block them.
  const kop = await headers();
  const nonce = kop.get("x-nonce") ?? undefined;
  // De bedrijfsgegevens van ZekerFlex (JSON-LD) horen niet op de website van een
  // rijschool, ook niet op haar eigen domein: die heeft haar eigen DrivingSchool-gegevens.
  const rijschoolSite = (kop.get("x-pathname") ?? "").startsWith("/rijschool/");
  // Runtime huisstijl: overschrijf de merkkleur-variabelen als de eigenaar ze
  // heeft aangepast (Admin → Huisstijl). Staat alles op standaard → null → geen
  // injectie, dus identieke look.
  // Sinds 4 nov komt die uit de Site-ontwerper (lib/ontwerp): kleuren, lettertypes en vormen.
  const brandingCss = await liveOntwerpCss().catch(() => null);
  // Feestversiering rond Nederlandse feestdagen (lib/seasons); op gewone dagen laadt er niets.
  const season = await activeSeason().catch(() => null);
  const taal = await getLocale();
  return (
    <html lang={taal} dir={taalRichting(taal)} className={fontVariables}>
      <body>
        <FontPreloads hrefs={FONT_PRELOADS} />
        {brandingCss && (
          // eslint-disable-next-line react/no-danger
          <style nonce={nonce} dangerouslySetInnerHTML={{ __html: brandingCss }} />
        )}
        {!rijschoolSite && (
          <script
            type="application/ld+json"
            nonce={nonce}
            // browsers blank the nonce attribute after load, so the client always sees ""
            suppressHydrationWarning
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: ldJson([organizationJsonLd(), websiteJsonLd()]),
            }}
          />
        )}
        <Providers>{children}</Providers>
        <CookieConsent />
        <Suspense fallback={null}>
          <AnalyticsBeacon />
        </Suspense>
        <ServiceWorkerRegister />
        <KonamiEasterEgg />
        <SeasonalLoader theme={season?.id ?? null} countdownTo={season?.countdownTo ?? null} preview />
      </body>
    </html>
  );
}
