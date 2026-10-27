# AGENTS.md — ZekerFlex (instructies voor coding-agents, bv. Codex)

ZekerFlex is een Nederlands flexwerk-/uitzend-/zzp-marktplaatsplatform.
**Stack:** Next.js (App Router) · TypeScript (strict) · Prisma · Tailwind · deploy op **Vercel**.

## Gouden regels (ALTIJD volgen)

1. **Verifieer vóór elke commit** en lees de output:
   - `npx tsc --noEmit -p .`  (moet 0 fouten geven)
   - `npx eslint <gewijzigde bestanden>`  (moet schoon zijn)
   Commit/push **alleen** als beide schoon zijn.
2. **Pushen naar `main` = live.** Vercel bouwt + deployt automatisch, en **draait Prisma-migraties op prod** (een migratie pushen = toepassen op productie). Push dus alleen gecontroleerde wijzigingen.
3. **Strikte TypeScript:** `noUncheckedIndexedAccess` (guard `arr[i]` met `?? …`) en `exactOptionalPropertyTypes` (nooit `prop: undefined` toekennen; laat de key weg of type `| undefined`).
4. **Volg de bestaande stijl** (naamgeving, comment-dichtheid, patronen van omringende code). Kijk eerst hoe iets elders is gedaan.
5. **Kleine, omkeerbare diffs.** Geen destructieve/riskante commando's. Bouw niet opnieuw wat al bestaat — het platform is zeer compleet; zoek echte gaten.

## Autonoom doel

Blijf waardevolle, begrensde verbeteringen bouwen (feature, fix, polish, SEO/content, admin-tool, performance, toegankelijkheid): bedenk zelf → bouw → verifieer (tsc+eslint) → commit + push → kort documenteren. Zit je vast op een mensbeslissing? Noteer het en pak een andere taak.

## Waar dingen staan

- `app/` — routes (App Router). Publieke marketing in `app/(marketing)/`, dashboards in `app/dashboard` (freelancer), `app/werkgever` (opdrachtgever), `app/admin` (beheer). API in `app/api/`.
- `lib/` — logica: `lib/ai/` (self-hosted LLM-adapter + model-fleet), `lib/jarvis/` (admin-assistent), `lib/rag/` (kennisbank/corpus), `lib/matching/`, `lib/billing/`, `lib/timesheets/approve.ts` (uren→facturen+fee), `lib/sales/` (outreach-motor), `lib/seo-sectors.ts` + `lib/seo-cities.ts` (programmatische landingspagina's).
- `components/` — UI (o.a. `components/marketing/`, `components/admin/`, `components/jarvis/`, `components/chat/`).
- `prisma/schema.prisma` — datamodel; migraties in `prisma/migrations/`.

## Context / recent

- **AI-node:** het model is self-hosted (Ollama) via `deploy/ai-node/`; de live site koppelt aan de laptop via een Cloudflare-tunnel (HTTP/2). Admin → Jarvis beheert sleutel + modelkeuze per taak.
- **Organische groei (GTM):** config-gestuurde sector-SEO (werkgever + werker, 5 sectoren × 21 steden) via `lib/seo-sectors.ts` + `components/marketing/SectorLanding.tsx`. Een sector toevoegen = config + dunne route-map.
- **Geldstroom werkt:** bij goedgekeurde uren wordt automatisch een PLATFORM_FEE-factuur (€3,50/uur) aan de werkgever gemaakt; auto-matching draait bij het plaatsen van een klus.
- Fallback-coders staan in `deploy/local-coder/` (Aider/Codex op lokaal model of OpenAI).

## Commit-stijl

Conventionele commits in het Nederlands, bv. `feat(seo): …`, `fix(ai): …`. Houd berichten kort en concreet.
