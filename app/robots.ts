import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Search engines AND AI assistants (ChatGPT, Claude, Perplexity, Gemini,
// Copilot, Apple) may read every public page — being quoted by them is how
// people who ask an AI "where do I find freelance work" end up here.
//
// Let op: een Disallow is een voorvoegsel, geen map. "/start" sloot ook /starten-als-uitzendkracht en /starters uit, en
// "/sales" ook /sales-partner (22 nov 2026: Search Console meldde 58 adressen "geblokkeerd door robots.txt"). Botst een
// privépad met een openbare pagina, schrijf het dan als "/pad$" (precies dat adres) plus "/pad/" (alles eronder).
const PRIVATE = [
  "/admin",
  "/dashboard",
  "/werkgever",
  "/sales$",
  "/sales/",
  "/berichten",
  "/api",
  "/kyc",
  "/verifieer-email",
  "/start$",
  "/start/",
  // 22 nov 2026: de inloglink /start?voor=werker staat op ±515 pagina's en stuurt door naar het al geblokkeerde /welkom:
  // kruipverspilling. Een "?" is voor Google een gewoon teken; /starten-als-uitzendkracht valt er dus niet onder.
  "/start?",
  "/welkom",
  "/voorbeeld/", // alleen een voorbeeldpad, niet /voorbeeldsites
  // personal links: referral codes and payment links
  "/r/",
  "/betaal/",
  "/betaalverzoek/",
];
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_AGENTS, allow: ["/", "/llms.txt"], disallow: PRIVATE },
    ],
    // 21 nov 2026: plus de pagina's die uit Google moeten (app/sitemap-verwijderd.xml), zodat Google ze snel opnieuw ophaalt
    sitemap: [`${SITE.url}/sitemap.xml`, `${SITE.url}/sitemap-verwijderd.xml`],
    host: SITE.url,
  };
}
