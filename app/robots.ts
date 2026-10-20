import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Search engines AND AI assistants (ChatGPT, Claude, Perplexity, Gemini,
// Copilot, Apple) may read every public page — being quoted by them is how
// people who ask an AI "where do I find freelance work" end up here.
const PRIVATE = ["/admin", "/dashboard", "/werkgever", "/api", "/kyc", "/verifieer-email", "/start"];
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
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
