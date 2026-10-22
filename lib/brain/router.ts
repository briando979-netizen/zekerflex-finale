import type { Audience } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// Rule router: which of the user's own data does a question need? Cheap,
// instant and model-free — the model only gets asked to route when these
// patterns find nothing.
// ---------------------------------------------------------------------------

const ROUTES: { re: RegExp; tool: string; roles: Audience[] }[] = [
  { re: /(volgende|komende|mijn|wanneer).{0,30}(klus|dienst|shift|werk)|planning|rooster|ingepland|morgen werken|wanneer moet ik/i, tool: "mijn_planning", roles: ["werknemer"] },
  { re: /reactie|gereageerd|uitgekozen|aangenomen|antwoord.{0,20}(opdrachtgever|werkgever)|tegenbod|in afwachting/i, tool: "mijn_reacties", roles: ["werknemer"] },
  { re: /\buren\b|urenbriefje|timesheet|inchecken|uitchecken|goedgekeurd|ingediend|correctie/i, tool: "mijn_uren", roles: ["werknemer"] },
  { re: /verdien|betaald|uitbetal|geld|salaris|loon|factuur|hoeveel krijg|saldo/i, tool: "mijn_geld", roles: ["werknemer"] },
  { re: /verifi|kyc|account.{0,15}(compleet|klaar|status)|wat moet ik nog|documenten|betrouwbaar|waarom kan ik (niet )?reageren/i, tool: "mijn_account_status", roles: ["werknemer"] },
  { re: /(open|nieuwe|beschikbare|passende|welke).{0,20}(klus|dienst|werk)|werk zoeken|iets te doen|klus vinden|vacature/i, tool: "klussen_voor_mij", roles: ["werknemer"] },

  { re: /overzicht|hoe staat|dashboard|samenvatting|status van (mijn|ons) bedrijf/i, tool: "bedrijf_overzicht", roles: ["opdrachtgever"] },
  { re: /onbezet|niet bezet|plek(ken)? (open|vrij)|niemand ingepland|reacties op mijn|wie (komt|werkt)|bezetting/i, tool: "onbezette_klussen", roles: ["opdrachtgever"] },
  { re: /\buren\b|goedkeur|timesheet|urenbriefje/i, tool: "uren_goedkeuren", roles: ["opdrachtgever"] },
  { re: /factu|betal|kosten|uitgegeven|rekening/i, tool: "facturen", roles: ["opdrachtgever"] },

  { re: /hoeveel (gebruikers|klussen|mensen)|cijfers|kpi|platform.{0,10}(status|stand)|verificaties/i, tool: "platform_cijfers", roles: ["admin"] },
];

// "How do I…" is a knowledge question, not a data question — don't fetch data
const HOWTO = /^\s*(hoe|waar|kan ik|mag ik|wat (is|zijn|betekent|kost)|waarom)\b/i;
const PERSONAL = /\b(mijn|ik|me|mij|ons|onze)\b/i;

export function routeQuestion(question: string, role: Audience): string[] {
  const q = question.trim();
  const hits = ROUTES.filter((r) => r.roles.includes(role) && r.re.test(q)).map((r) => r.tool);
  if (!hits.length) return [];
  // "hoe vul ik mijn uren in" → knowledge; "heb ik nog uren open staan" → data
  if (HOWTO.test(q) && !/nog|al |staan|openstaand|wanneer|hoeveel|welke/i.test(q)) return [];
  if (role !== "admin" && !PERSONAL.test(q) && !/^(volgende|planning|overzicht|uren|facturen|open)/i.test(q)) {
    // impersonal phrasing ("wanneer wordt er betaald") is also knowledge
    return hits.filter((t) => t === "klussen_voor_mij" || t === "onbezette_klussen" || t === "uren_goedkeuren");
  }
  return [...new Set(hits)].slice(0, 2);
}
