import { prisma } from "@/lib/prisma";
import { shiftCategory, SHIFT_CATEGORIES } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// ZekerFlex AI specialists. Each one has a fixed role and system prompt for
// the language model, and — where possible — an "offline" part computed from
// rules or real platform data, so it gives a useful answer even without a
// model and grounds the model's answer when there is one.
// Advice is always a draft for a human: the jurist is no lawyer, the tax
// specialist no accountant.
// ---------------------------------------------------------------------------

export interface Specialist {
  id: string;
  name: string;
  emoji: string;
  role: string;
  placeholder: string;
  system: string;
  /** Rule/data-based part — works without a language model. */
  offline?: (input: string) => Promise<string>;
}

const BASE = `Je werkt voor ZekerFlex, een Nederlands platform voor flexwerk (zzp'ers en uitzendkrachten, opdrachtgevers betalen € 3,50 per gewerkt uur met staffelkorting). Antwoord in het Nederlands, concreet en gestructureerd met kopjes en opsommingen. Verzin geen feiten; zeg wat je niet weet. Sluit af met wat een mens nog moet controleren.`;

// ---- Jurist: contract clause check -------------------------------------
const CLAUSES: { key: string; label: string; re: RegExp; why: string }[] = [
  { key: "partijen", label: "Partijen en KVK-nummers", re: /partij|opdrachtgever|opdrachtnemer|kvk/i, why: "Zonder duidelijke partijen is onduidelijk wie aansprakelijk is." },
  { key: "opdracht", label: "Omschrijving van de opdracht", re: /opdracht(omschrijving)?|werkzaamheden|diensten/i, why: "Nodig om resultaat en reikwijdte vast te leggen." },
  { key: "vergoeding", label: "Tarief en betaaltermijn", re: /tarief|vergoeding|uurloon|betaal(termijn)?|factu/i, why: "Zonder betaaltermijn geldt de wettelijke termijn; leg het vast." },
  { key: "vervanging", label: "Vrije vervanging (Wet DBA)", re: /vervang/i, why: "Vrije vervanging is een belangrijk signaal tegen schijnzelfstandigheid." },
  { key: "gezag", label: "Geen gezagsverhouding / eigen werkwijze", re: /gezag|instructie|eigen (werkwijze|inzicht)|zelfstandig/i, why: "Bij gezag kan het als dienstbetrekking worden gezien (Wet DBA)." },
  { key: "aansprakelijkheid", label: "Aansprakelijkheid en verzekering", re: /aansprakelijk|schade|verzeker/i, why: "Beperk en verdeel het risico op schade." },
  { key: "duur", label: "Duur en opzegging", re: /looptijd|duur|opzeg|beëindig|ontbind/i, why: "Zonder opzegregeling ontstaan discussies bij stoppen." },
  { key: "geheimhouding", label: "Geheimhouding", re: /geheim|vertrouwelijk/i, why: "Bescherm bedrijfs- en persoonsgegevens." },
  { key: "avg", label: "Privacy (AVG)", re: /avg|persoonsgegevens|privacy|gdpr/i, why: "Verwerking van persoonsgegevens vraagt afspraken." },
  { key: "ie", label: "Intellectueel eigendom", re: /intellectueel|eigendom|auteursrecht/i, why: "Leg vast wie eigenaar is van wat er gemaakt wordt." },
  { key: "recht", label: "Toepasselijk recht en geschillen", re: /nederlands recht|toepasselijk recht|geschil|rechter/i, why: "Bepaalt waar en volgens welk recht een geschil loopt." },
];
const RISKY: { re: RegExp; warn: string }[] = [
  { re: /concurrentiebeding|non-?concurrentie/i, warn: "Concurrentiebeding: bij zzp'ers vaak onredelijk of een signaal van loondienst — check de redelijkheid." },
  { re: /boete|boeteclausule/i, warn: "Boeteclausule: controleer hoogte en of hij redelijk is." },
  { re: /onbeperkt aansprakelijk|volledige aansprakelijkheid/i, warn: "Onbeperkte aansprakelijkheid: begrens tot het opdrachtbedrag of de verzekerde som." },
  { re: /\b(rooster|vaste werktijden|werkt onder leiding)\b/i, warn: "Vaste werktijden / onder leiding: wijst op gezag (Wet DBA-risico)." },
  { re: /stilzwijgend verlengd/i, warn: "Stilzwijgende verlenging: zorg voor een opzegmogelijkheid." },
];

async function jurist(input: string): Promise<string> {
  const text = input.trim();
  if (text.length < 80) return "Plak de (concept)tekst van het contract of de voorwaarden, dan controleer ik welke onderdelen ontbreken en wat riskant is.";
  const present = CLAUSES.filter((c) => c.re.test(text));
  const missing = CLAUSES.filter((c) => !c.re.test(text));
  const risks = RISKY.filter((r) => r.re.test(text)).map((r) => r.warn);
  const score = Math.round((present.length / CLAUSES.length) * 100);
  return [
    `## Contractcheck — ${score}% van de standaardonderdelen aanwezig`,
    present.length ? `**Aanwezig:** ${present.map((c) => c.label).join(", ")}.` : "",
    missing.length ? `**Ontbreekt of niet gevonden:**\n${missing.map((c) => `- ${c.label} — ${c.why}`).join("\n")}` : "**Alle standaardonderdelen gevonden.**",
    risks.length ? `**Let op:**\n${risks.map((r) => `- ${r}`).join("\n")}` : "",
    "_Automatische controle op onderdelen en signaalwoorden — geen juridisch advies. Laat belangrijke contracten nakijken door een jurist._",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---- Taxateur: market value of a klus / hourly rate from real data -------
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  return Math.round(s[Math.floor(i)]! + (s[Math.ceil(i)]! - s[Math.floor(i)]!) * (i - Math.floor(i)));
};
const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

async function taxateur(input: string): Promise<string> {
  const text = input.trim();
  const cat = shiftCategory(text, null);
  const since = new Date(Date.now() - 180 * 86_400_000);
  const rows = await prisma.shift.findMany({ where: { startsAt: { gte: since } }, select: { title: true, hourlyRateCents: true, branch: { select: { city: true } } }, take: 20_000 });
  const inCat = rows.filter((r) => shiftCategory(r.title, null).key === cat.key);
  const city = [...new Set(rows.map((r) => r.branch.city))].find((c) => c && new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  const local = city ? inCat.filter((r) => r.branch.city === city) : [];
  const sample = local.length >= 5 ? local : inCat;
  if (sample.length < 5) {
    return `## Taxatie — ${cat.label}\n\nTe weinig vergelijkbare klussen op ZekerFlex in de afgelopen 6 maanden (${sample.length}) voor een betrouwbare waardering. Noem branche, functie en plaats, of probeer het later opnieuw als er meer data is.`;
  }
  const rates = sample.map((r) => r.hourlyRateCents);
  const p25 = quantile(rates, 0.25);
  const med = quantile(rates, 0.5);
  const p75 = quantile(rates, 0.75);
  const hours = Number(text.match(/(\d+(?:[.,]\d+)?)\s*(uur|u\b)/i)?.[1]?.replace(",", ".")) || 0;
  return [
    `## Taxatie — ${cat.label}${local.length >= 5 ? ` in ${city}` : ""}`,
    `Gebaseerd op **${sample.length} vergelijkbare klussen** op ZekerFlex in de afgelopen 6 maanden.`,
    `- Marktconform uurtarief: **${euro(med)}** (mediaan)\n- Bandbreedte: ${euro(p25)} – ${euro(p75)} (middelste 50%)\n- Boven ${euro(p75)} trek je sneller reacties; onder ${euro(p25)} blijft een klus vaker liggen.`,
    hours ? `Voor **${hours} uur**: ${euro(Math.round(med * hours))} bruto voor de kracht (+ platformkosten € 3,50/uur, met staffelkorting).` : "",
    `_Andere branches ter vergelijking:_ ${SHIFT_CATEGORIES.filter((c) => c.key !== cat.key)
      .map((c) => ({ c, rs: rows.filter((r) => shiftCategory(r.title, null).key === c.key).map((r) => r.hourlyRateCents) }))
      .filter((x) => x.rs.length >= 5)
      .map((x) => `${x.c.label} ${euro(quantile(x.rs, 0.5))}`)
      .join(" · ") || "nog te weinig data"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const SPECIALISTS: Specialist[] = [
  {
    id: "jurist",
    name: "AI-jurist",
    emoji: "⚖️",
    role: "Contracten, voorwaarden, Wet DBA, arbeidsrecht en AVG",
    placeholder: "Plak een contract, voorwaarden of stel een juridische vraag…",
    system: `${BASE}\nJe bent de AI-jurist: kennis van Nederlands contractenrecht, de Wet DBA (modelovereenkomsten, gezag, vrije vervanging), arbeidsrecht, uitzendrecht (ABU/NBBU-cao, fasensysteem) en de AVG. Benoem risico's met artikelnummers waar je zeker bent. Je geeft geen bindend juridisch advies.`,
    offline: jurist,
  },
  {
    id: "taxateur",
    name: "AI-taxateur",
    emoji: "🏷️",
    role: "Wat is een klus, uurtarief of dienst waard",
    placeholder: "Bijv. 'orderpicker magazijn Tilburg, 8 uur' of 'barista Amsterdam'…",
    system: `${BASE}\nJe bent de AI-taxateur: je waardeert klussen, uurtarieven en diensten op basis van de marktdata die je krijgt. Leg uit welke factoren de waarde verhogen of verlagen (tijdstip, spoed, ervaring, certificaten, regio).`,
    offline: taxateur,
  },
  { id: "belasting", name: "AI-belastingadviseur", emoji: "🧾", role: "Btw, inkomstenbelasting zzp, loonheffing", placeholder: "Bijv. 'moet ik btw rekenen als ik onder de KOR zit?'", system: `${BASE}\nJe bent de AI-belastingadviseur voor Nederlandse zzp'ers, uitzendkrachten en opdrachtgevers: btw, KOR, inkomstenbelasting, zelfstandigenaftrek, MKB-winstvrijstelling, loonheffing. Geen bindend fiscaal advies.` },
  { id: "boekhouder", name: "AI-boekhouder", emoji: "📒", role: "Facturen, kosten, cashflow, afwijkingen", placeholder: "Plak cijfers of een factuuroverzicht…", system: `${BASE}\nJe bent de AI-boekhouder: je controleert facturen en cijfers op fouten en afwijkingen, en adviseert over cashflow.` },
  { id: "marketeer", name: "AI-marketeer", emoji: "📣", role: "Teksten, campagnes, social, SEO", placeholder: "Bijv. 'schrijf 3 LinkedIn-posts om horecabedrijven in Utrecht te werven'", system: `${BASE}\nJe bent de AI-marketeer: je schrijft wervende, eerlijke teksten in de toon van ZekerFlex (helder, menselijk, zonder overdrijving) en bedenkt campagnes.` },
  { id: "recruiter", name: "AI-recruiter", emoji: "🧲", role: "Vacatureteksten, werving, sourcing", placeholder: "Bijv. 'vacaturetekst voor heftruckchauffeur nachtdienst Venlo'", system: `${BASE}\nJe bent de AI-recruiter: je schrijft vacature- en klusteksten die werken en adviseert over werving van flexkrachten.` },
  { id: "analist", name: "AI-data-analist", emoji: "📊", role: "Cijfers duiden, trends, voorspellingen", placeholder: "Plak cijfers of stel een vraag over groei…", system: `${BASE}\nJe bent de AI-data-analist: je duidt cijfers, vindt trends en geeft onderbouwde voorspellingen met aannames.` },
  { id: "compliance", name: "AI-compliance", emoji: "🛡️", role: "Wet DBA, Waadi, identiteit, witwassen", placeholder: "Bijv. 'welke risico's heeft een zzp'er die 30 weken bij één klant werkt?'", system: `${BASE}\nJe bent de AI-compliance-officer: Wet DBA, Waadi (registratie uitzendbureaus), identificatieplicht, Wwft-signalen en AVG.` },
];

export function getSpecialist(id: string): Specialist | undefined {
  return SPECIALISTS.find((s) => s.id === id);
}
