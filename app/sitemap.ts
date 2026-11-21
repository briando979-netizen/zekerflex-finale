import type { MetadataRoute } from "next";
import { RUBRIEK_SLUGS, VERKOPEN_PAD, VERKOPEN_START_PAD, rubriekPad } from "@/lib/shop/partnerplatform";
import { LEREN_PAD } from "@/lib/leren/klussen-krijgen";
import { LEREN_BEDRIJF_PAD } from "@/lib/leren/personeel-krijgen";
import { SITE } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { GUIDES, POSTS } from "@/lib/kennis/content";
import { geplaatsteBerichten } from "@/lib/nieuws/store";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { publicOpenShifts } from "@/lib/public-shifts";
import { SPINOFF_PRODUCTS } from "@/lib/products";
import { eigenPaginas } from "@/lib/marketing/aanbod";
import { aanbodBeelden } from "@/lib/marketing/aanbod-beeld";
import { paginaLijst } from "@/lib/ontwerp/paginas-store";
import { rijschoolPadenVoorSitemap } from "@/lib/rijschool/vindbaar";
import { isNietFlexwerkPad } from "@/lib/marketing/flexwerk-only";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";

type Freq = "never" | "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";

// Next maakte de sitemap één keer tijdens de build, zonder database: dan ontbraken open klussen (Google for Jobs),
// shopproducten en eigen pagina's (gemeten 4 nov: x-nextjs-cache HIT, lastmod = buildtijd). Met `revalidate = 600` kwam
// dat terug bij elke (her)start van de container: tien minuten lang de bouwversie (gemeten 13 nov: 343 regels, 0
// producten, pas na de herberekening 375), en op een dag met achttien uitrollen is dat uren. Daarom geen prerender meer
// (force-dynamic) en een eigen geheugencache van tien minuten: de eerste aanvraag na een start leest de database al.
export const dynamic = "force-dynamic";
export const CACHE_MS = 600_000;

interface SitemapGeheugen {
  sitemap?: { op: number; regels: MetadataRoute.Sitemap };
}
const g = globalThis as typeof globalThis & { __zfSitemap?: SitemapGeheugen };
const geheugen: SitemapGeheugen = (g.__zfSitemap ??= {});

// lastmod alleen waar we de echte datum kennen (artikel, product, klus, eigen pagina). Zonder datum laten we hem weg:
// "nu" gaf elke vaste pagina na elke uitrol en elke 10 minuten een nieuwe datum (gemeten 12 nov: 320 van 337 regels
// op het tijdstip van de uitrol), en een lastmod die altijd verandert negeert Google voor de hele site.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const c = geheugen.sitemap;
  if (c && Date.now() - c.op < CACHE_MS) return c.regels;
  const regels = await bouwSitemap();
  geheugen.sitemap = { op: Date.now(), regels };
  return regels;
}

async function bouwSitemap(): Promise<MetadataRoute.Sitemap> {
  const entry = (
    path: string,
    priority: number,
    changeFrequency: Freq,
    lastModified?: Date | string | null,
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE.url}${path}`,
    ...(lastModified ? { lastModified: typeof lastModified === "string" ? new Date(lastModified) : lastModified } : {}),
    changeFrequency,
    priority,
  });

  const regels: MetadataRoute.Sitemap = [
    // Pillars
    entry("/", 1, "weekly"),
    entry("/bedrijven", 0.9, "weekly"),
    entry("/voor-freelancers", 0.9, "monthly"),
    // voor uitzendbureaus die hun klussen op ZekerFlex zetten (21 nov 2026, lib/uitzend/partners-kern.ts)
    entry("/uitzendpartner", 0.7, "monthly"),
    entry("/uitzendpartner/voorwaarden", 0.4, "monthly"),
    entry("/partners/uitzend", 0.6, "monthly"),
    entry("/starten-als-uitzendkracht", 0.8, "monthly"),
    entry("/nog-geen-18", 0.4, "monthly"),
    entry("/voor-bedrijven", 0.9, "monthly"),
    // de eigen apps (spelletjes, Talkaro, FlikFlak, webshop) als aparte categorie (lib/marketing/apps.ts)
    entry("/apps-en-spelletjes", 0.7, "monthly"),
    // alle losse online tools op één pagina (lib/marketing/online-tools.ts)
    entry("/online", 0.8, "monthly"),

    // Open klussen (Google for Jobs) + per-city landing pages
    entry("/klussen", 0.9, "hourly"),
    entry("/open-diensten", 0.8, "hourly"),
    entry("/freelance-werk", 0.9, "daily"),
    entry("/personeel-inhuren", 0.8, "weekly"),
    ...CITIES.map((c) => entry(`/freelance-werk/${c.slug}`, 0.8, "daily")),
    ...CITIES.map((c) => entry(`/personeel-inhuren/${c.slug}`, 0.7, "weekly")),
    // Sector-landingspagina's (horeca, logistiek, schoonmaak, evenementen, retail) × steden
    ...SECTORS.flatMap((s) => [
      entry(`/${s.slug}`, 0.8, "weekly"),
      ...CITIES.map((c) => entry(`/${s.slug}/${c.slug}`, 0.7, "weekly")),
      entry(`/${s.workerSlug}`, 0.8, "weekly"),
      ...CITIES.map((c) => entry(`/${s.workerSlug}/${c.slug}`, 0.7, "weekly")),
    ]),
    ...(await publicOpenShifts({ take: 500 }).catch(() => [])).map((s) => entry(`/klussen/${s.id}`, 0.6, "daily", s.createdAt)),
    entry("/prijzen", 0.8, "monthly"),
    entry("/tarieven-overzicht", 0.7, "monthly"),
    entry("/abonnementen", 0.7, "monthly"),

    // Het hele aanbod (lib/marketing/aanbod.ts) + de producten zonder eigen pagina elders
    entry("/aanbod", 0.9, "weekly"),
    // met de beelden van het product (echte schermen, foto) voor Google Afbeeldingen (16 nov)
    ...eigenPaginas().map((a) => {
      const beelden = aanbodBeelden(a).map((b) => `${SITE.url}${b.pad}`);
      return { ...entry(`/aanbod/${a.slug}`, 0.7, "monthly"), ...(beelden.length ? { images: beelden } : {}) };
    }),
    // De nieuwsroom: de lijst en elk geplaatst bericht (lib/nieuws)
    entry("/nieuws", 0.7, "daily"),
    ...(await geplaatsteBerichten()).map((b) => entry(`/nieuws/${b.slug}`, 0.5, "monthly", b.geplaatst ?? b.gemaakt)),
    // Eigen pagina's uit de Site-ontwerper (/p/<slug>): alleen live en niet op "niet in Google"
    ...(await paginaLijst().catch(() => []))
      .filter((p) => p.live && !p.live.noindex)
      .flatMap((p) => [
        entry(`/p/${p.slug}`, 0.6, "weekly", p.gepubliceerd),
        // en de vertalingen (/p/<slug>/<taal>)
        ...Object.keys(p.liveVertalingen ?? {}).map((t) => entry(`/p/${p.slug}/${t}`, 0.5, "weekly", p.gepubliceerd)),
      ]),

    // Producten (ontbundeld) + los aanbod voor bureaus
    entry("/producten", 0.8, "weekly"),
    ...SPINOFF_PRODUCTS.map((p) => entry(`/producten/${p.slug}`, 0.7, "weekly")),
    entry("/voor-bureaus", 0.7, "monthly"),
    entry("/intercedenten", 0.7, "monthly"),
    entry("/sales-partner", 0.6, "monthly"),
    // het Partnerplatform: verkopen in de ZekerFlex-shop (lib/shop/partnerplatform.ts), 18 nov 2026
    entry(VERKOPEN_PAD, 0.7, "monthly"),
    // de gids "Zo krijg je klussen via een platform" (lib/leren/klussen-krijgen.ts), 18 nov 2026
    entry(LEREN_PAD, 0.7, "monthly"),
    entry(LEREN_BEDRIJF_PAD, 0.7, "monthly"),
    entry(VERKOPEN_START_PAD, 0.7, "monthly"),
    ...RUBRIEK_SLUGS.map((s) => entry(rubriekPad(s), 0.5, "monthly")),

    entry("/app", 0.6, "monthly"),
    // de apps per doelgroep (lib/apps/catalogus.ts), 15 nov 2026
    entry("/apps", 0.6, "monthly"),
    entry("/demo", 0.6, "monthly"),
    entry("/website-check", 0.7, "monthly"),
    entry("/advertentie-op-maat", 0.7, "monthly"),
    entry("/logo-maker", 0.7, "monthly"),
    entry("/starters", 0.8, "monthly"),
    entry("/website-maken", 0.8, "monthly"),
    entry("/rijschool-software", 0.8, "monthly"),
    entry("/domeinnaam", 0.8, "monthly"),
    entry("/review-check", 0.7, "monthly"),
    entry("/rekentools", 0.7, "monthly"),
    entry("/rekentools/zzp-uurtarief-berekenen", 0.8, "monthly"),
    entry("/rekentools/kosten-uitzendkracht-berekenen", 0.8, "monthly"),
    entry("/rekentools/wet-dba-check", 0.8, "monthly"),
    entry("/rekentools/btw-nummer-check", 0.8, "monthly"),
    entry("/klus-plaatsen", 0.8, "monthly"),
    entry("/over-ons", 0.6, "monthly"),
    entry("/beveiliging", 0.5, "monthly"),
    entry("/contact", 0.5, "yearly"),
    entry("/developers", 0.6, "monthly"),
    entry("/developers/authenticatie", 0.5, "monthly"),
    entry("/developers/api", 0.6, "monthly"),
    entry("/developers/webhooks", 0.5, "monthly"),
    entry("/developers/afspraken", 0.5, "monthly"),
    entry("/developers/voorbeelden", 0.5, "monthly"),
    entry("/developers/wijzigingen", 0.4, "monthly"),

    // Knowledge hub — the long-tail keyword surface
    entry("/kennis", 0.7, "weekly"),
    entry("/kennis/wet-dba", 0.8, "monthly"),
    entry("/kennis/werkgevers", 0.7, "monthly"),
    entry("/kennis/faq", 0.6, "monthly"),
    entry("/kennis/blog", 0.6, "weekly"),
    entry("/kennis/whitepapers", 0.6, "monthly"),
    entry("/uitleg", 0.5, "monthly"),
    entry("/nieuwsbrief", 0.4, "monthly"),
    ...GUIDES.map((g) => entry(`/kennis/${g.slug}`, 0.6, "monthly", g.updated)),
    ...POSTS.map((p) => entry(`/kennis/blog/${p.slug}`, 0.5, "yearly", p.date)),
    ...WHITEPAPERS.map((w) => entry(`/kennis/whitepapers/${w.slug}`, 0.5, "monthly", w.updated)),

    // Status + legal
    entry("/status", 0.4, "daily"),
    entry("/dsa", 0.3, "yearly"),
    entry("/privacy", 0.3, "yearly"),
    entry("/voorwaarden", 0.3, "yearly"),
    entry("/voorwaarden/snelle-uitbetaling", 0.3, "yearly"),
    entry("/cookiebeleid", 0.3, "yearly"),
    entry("/copyright", 0.3, "yearly"),
    entry("/toegankelijkheid", 0.3, "yearly"),
    entry("/verwerkersovereenkomst", 0.3, "yearly"),

    // Shop — the storefront and every active product's own page
    entry("/shop", 0.7, "daily"),
    entry("/shop/paskamer", 0.6, "weekly"),
    entry("/shop/zakelijk", 0.7, "weekly"),
    ...(await prisma.shopProduct.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true },
    }).catch(() => [] as { slug: string; updatedAt: Date }[])).map((p) => entry(`/shop/${p.slug}`, 0.6, "weekly", p.updatedAt)),

    // Websites van rijscholen op zekerflex.com (met een actief eigen domein: daar een eigen sitemap)
    ...(await rijschoolPadenVoorSitemap().catch(() => [])).map((p) => entry(p.pad, 0.5, "weekly", p.bijgewerkt)),
  ];

  // Vlag `publiek-alleen-flexwerk`: de niet-flexwerk-pagina's (shop, apps, online-tools, website/webshop maken,
  // branche-software, developers, …) vallen uit de sitemap. Ze blijven bestaan en bereikbaar via een directe link.
  if (await alleenFlexwerkAan().catch(() => false)) {
    return regels.filter((r) => !isNietFlexwerkPad(r.url.slice(SITE.url.length)));
  }
  return regels;
}
