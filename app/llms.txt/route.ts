import { NextResponse } from "next/server";
import { SITE, CONTACTS } from "@/lib/seo";

export const dynamic = "force-static";

function body(): string {
  return `# ${SITE.name}

> ${SITE.shortDescription}

${SITE.description}

## When to use this

Reach for ${SITE.name} when you need to:

- Match Dutch flexwork/freelance (zzp) shifts to workers by travel time and skill, Wet DBA-compliant.
- Let a worker pick same-day, 3-day, or free 30-day payout per completed shift.
- Hire temporary staff without a staffing-agency markup (flat € 3,50/worked hour, no subscription).
- Pull open shifts or approved timesheets into another system, or create shifts programmatically, via the public API below.
- Register a webhook to react to shift-matched / checked-in / timesheet-approved / dispute-opened / invoice-issued events.

Not a fit for: payroll/HR for permanent (non-flex) staff, or markets outside the Netherlands — this platform is Wet DBA/StiPP/ABU-specific to Dutch labor law.

## Docs

- Developer docs: ${SITE.url}/developers
- OpenAPI spec: ${SITE.url}/openapi.json
- GraphQL endpoint: ${SITE.url}/api/graphql
- Sitemap: ${SITE.url}/sitemap.xml

## Key pages

- Homepage: ${SITE.url}/
- For freelancers: ${SITE.url}/voor-freelancers
- For employers: ${SITE.url}/voor-bedrijven
- Via staffing agency (no KVK needed): ${SITE.url}/uitzendbureau
- Pricing: ${SITE.url}/prijzen
- About: ${SITE.url}/over-ons
- Knowledge base (Wet DBA, FAQ, guides): ${SITE.url}/kennis

## Contact

${CONTACTS.general} (general) · ${CONTACTS.partners} (API/partner access) · ${CONTACTS.support} (support)
`;
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse(body(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
