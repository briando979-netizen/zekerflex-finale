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

Canonical domain: **`https://zekerflex.nl`** (no `www`). Set as the default in
`lib/seo.ts`, `deploy/.env.production.example`, `infra/helm/zekerflex/values.yaml`.
The runtime still reads `APP_BASE_URL` first — the box/cluster must set it.

## What you need to do (one-time, outside the code)

1. **Set `APP_BASE_URL=https://zekerflex.nl`** (and `AUTH_URL=…`) in the
   production env and restart the web container. Everything below depends on
   the live site serving correct canonicals.
   - Box: edit `.env.production`, then
     `docker compose -f docker-compose.prod.yml up -d --force-recreate web`
   - K8s: it's already in `values.yaml`; `helm upgrade` + `kubectl rollout restart deploy/zekerflex-web`
   - Verify: `curl -s https://zekerflex.nl/sitemap.xml | head` shows real URLs.
2. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console))
   → Add property → **URL prefix** → `https://zekerflex.nl`. Two ways to verify:
   - **HTML tag** — copy the `content="…"` value into `GOOGLE_SITE_VERIFICATION`
     in the prod env, restart, click Verify.
   - **HTML file** (no restart) — Google gives you `google<hash>.html`; drop it
     in `public/` and it's served at `/google<hash>.html` on the next deploy.
   Then: left menu → **Sitemaps** → add `sitemap.xml` → Submit.
3. **Bing Webmaster Tools** ([bing.com/webmasters](https://www.bing.com/webmasters))
   → Add site → it can **import straight from Search Console** (fastest).
   Otherwise same as above with `BING_SITE_VERIFICATION` or a `BingSiteAuth.xml`
   in `public/`. Submit the sitemap there too. (Also feeds DuckDuckGo / Copilot.)
4. After deploy, run `https://zekerflex.nl/` through the
   [Rich Results Test](https://search.google.com/test/rich-results) and
   [Schema validator](https://validator.schema.org/) — expect Organization,
   FAQ, Service and (on kennis pages) Article. Check the OG card at
   [opengraph.xyz](https://www.opengraph.xyz).
5. Add the LinkedIn company page to `SOCIALS` (`lib/seo.ts`) once it exists —
   it's the strongest `sameAs` signal for a B2B platform.

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
