import { SITE, CONTACTS } from "@/lib/seo";

// ---------------------------------------------------------------------------
// Hand-authored Markdown renderings for the pages that must satisfy Markdown
// content negotiation (served from middleware.ts when Accept: text/markdown
// outranks text/html — see lib/http/accept.ts). Content mirrors the real
// copy in app/(marketing)/page.tsx and lib/seo.ts rather than being
// independently invented, so the two can't silently drift into contradicting
// each other about what ZekerFlex actually is or costs.
// ---------------------------------------------------------------------------

function homepage(): string {
  return `# ${SITE.name} — ${SITE.tagline}

${SITE.description}

## Voor freelancers en flexwerkers

- Gratis account, gratis matching op vak en reistijd.
- Kies per dienst hoe snel je wordt uitbetaald: direct na goedkeuring, binnen 3 werkdagen, of gratis binnen 30 dagen.
- ZekerFlex legt afspraken per relatie vast en signaleert Wet DBA-risico's. Dit geeft geen garantie over de arbeidsrelatie; de feitelijke werkwijze blijft bepalend. Zonder KVK kun je als uitzendkracht via het ZekerFlex-uitzendbureau werken (wekelijkse verloning, StiPP-pensioen, ABU-fasensysteem).
- Meer: ${SITE.url}/voor-freelancers

## Voor werkgevers

- € 3,50 platformkosten per gewerkt uur, alleen als er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten.
- Reverse billing: ZekerFlex stelt de facturen op namens je, geen gedoe met zzp-facturen.
- Automatische Wet DBA-signalen (urenconcentratie, opeenvolgende weken, omzetafhankelijkheid).
- Meer: ${SITE.url}/voor-bedrijven

## Veelgestelde vragen

- **Hoe snel word ik uitbetaald?** Zelf te kiezen per dienst nadat je uren zijn goedgekeurd: direct (4% van de factuur), binnen 3 werkdagen (2%), of gratis binnen 30 dagen. Via directe SEPA-overboeking.
- **Wat kost ZekerFlex voor bedrijven?** € 3,50 per gewerkt uur, alleen als er iemand werkt. Freelancers: gratis.
- **Hoe zit het met de Wet DBA?** ZekerFlex legt afspraken vast en bewaakt risicosignalen. De feitelijke werkwijze blijft bepalend voor de beoordeling van de arbeidsrelatie.
- **Kan ik werken zonder KVK?** Ja, als uitzendkracht via het ZekerFlex-uitzendbureau.

## Voor ontwikkelaars en agents

ZekerFlex publiceert een publieke REST-API (OpenAPI-spec: ${SITE.url}/openapi.json) en een GraphQL-endpoint. Documentatie en voorbeelden: ${SITE.url}/developers. Agent-richtlijnen: ${SITE.url}/llms.txt. Sitemap: ${SITE.url}/sitemap.xml.

## Contact

Algemeen: ${CONTACTS.general} · Sales: ${CONTACTS.sales} · Support: ${CONTACTS.support}
`;
}

const PAGES: Record<string, () => string> = {
  "/": homepage,
};

/** Markdown rendering for `pathname`, or null if this path isn't one we negotiate on. */
export function markdownFor(pathname: string): string | null {
  const render = PAGES[pathname];
  return render ? render() : null;
}
