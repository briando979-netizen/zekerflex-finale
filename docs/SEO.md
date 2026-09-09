# SEO

The goal: rank for the Dutch search terms people actually use when they want
to *find flex/zzp work* or *hire flex/zzp people*, and win the informational
queries around the Wet DBA.

## What's in the code

| Piece | Where |
|---|---|
| Site identity, keyword set, JSON-LD builders | [`lib/seo.ts`](../lib/seo.ts) |
| Global `<head>` metadata (title template, OG, Twitter, robots, verification) | [`app/layout.tsx`](../app/layout.tsx) |
| Per-page `title` / `description` / `keywords` / canonical | each `app/(marketing)/**/page.tsx` |
| `sitemap.xml` (pillars + every kennis guide/post/whitepaper) | [`app/sitemap.ts`](../app/sitemap.ts) |
| `robots.txt` (app areas disallowed, sitemap linked) | [`app/robots.ts`](../app/robots.ts) |
| Social share image (1200×630, generated) | [`app/opengraph-image.tsx`](../app/opengraph-image.tsx) |
| JSON-LD: Organization, WebSite, Service+Offer (home), FAQPage (home + /kennis/faq), Article/BlogPosting + BreadcrumbList (kennis detail pages) | `lib/seo.ts` + the page files |

**Canonical rule:** the root layout deliberately sets *no* canonical — Next
merges metadata per segment, so a root canonical makes every page a "duplicate
of /". Each indexable page spreads `...canonical("/path")` from `lib/seo.ts`.

## What you need to do (one-time, outside the code)

1. **Google Search Console** — add the property for the live domain, verify
   with the HTML-tag method, and set `GOOGLE_SITE_VERIFICATION=<token>` in the
   production env. Redeploy, confirm, then **submit `/sitemap.xml`**.
2. **Bing Webmaster Tools** — same, `BING_SITE_VERIFICATION=<token>` (optional
   but cheap; also feeds DuckDuckGo/ChatGPT search).
3. Set `APP_BASE_URL` to the real `https://` domain — every canonical, OG URL,
   sitemap entry and JSON-LD `@id` is built from it.
4. After deploy, run the live URL through the
   [Rich Results Test](https://search.google.com/test/rich-results) and
   [Schema validator](https://validator.schema.org/) — expect Organization,
   FAQ, Service and (on kennis pages) Article to be picked up.
5. Fill in the real social handles in `SOCIALS` (`lib/seo.ts`) — they become
   `sameAs` on the Organization schema and help entity resolution.

## Keyword map (primary intent per page)

| Page | Targets |
|---|---|
| `/` | flexwerk platform, zzp-opdrachten, sneller uitbetaald |
| `/voor-freelancers` | zzp klus vinden, flexwerk vinden, bijbaan direct uitbetaald |
| `/voor-bedrijven` | zzp'er inhuren, flexkrachten inhuren, personeel inhuren horeca/retail |
| `/uitzendbureau` | uitzendwerk zonder KVK, uitzendkracht worden, uitzendbureau alternatief |
| `/prijzen` | zekerflex kosten, zzp platform kosten, uitzendbureau tarief |
| `/kennis/wet-dba`, `/kennis/*` | Wet DBA uitgelegd, schijnzelfstandigheid, handhaving 2026, StiPP, ABU-fasen |

## Ongoing

- The kennis/blog content *is* the long-tail strategy — keep publishing there;
  every post auto-lands in the sitemap with `BlogPosting` schema.
- Watch Search Console "Queries" monthly; fold the phrases that show
  impressions-but-low-CTR into the matching page's `description`.
- No paid tooling wired in yet. When there's budget: Ahrefs/Semrush for gap
  analysis, and Lighthouse-CI already tracks the Core Web Vitals side
  (`docs/PERFORMANCE.md`).
