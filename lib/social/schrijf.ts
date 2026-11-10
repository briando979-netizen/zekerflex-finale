import { z } from "zod";
import { chatJson, llmConfigProblem } from "@/lib/ai/client";
import { FACTS } from "@/lib/ads/generate";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { tekst } from "@/lib/orchestration/antwoord";
import { CONTACTS, SITE } from "@/lib/seo";
import type { Doelgroep } from "@/lib/social/model";
import { beoordeelTekst } from "@/lib/social/veilig";

// ---------------------------------------------------------------------------
// Berichten schrijven voor sociale media. Het model krijgt dezelfde vaste FEITEN als de
// advertentiegenerator (lib/ads/generate.ts) en mag geen cijfers of claims verzinnen. Is het model
// er niet, of antwoordt het onbruikbaar, dan komen er vaste, gecontroleerde teksten uit: de
// generator levert altijd. Een bericht gaat nooit vanzelf weg: een mens keurt goed (zie model.ts).
// ---------------------------------------------------------------------------

export interface GeschrevenPost {
  tekst: string;
  hashtags: string[];
  beeldIdee: string;
}

export interface SchrijfUitslag {
  posts: GeschrevenPost[];
  bron: "model" | "sjabloon";
}

const DOELGROEP_BRIEF: Record<Doelgroep, string> = {
  freelancer: "Flexwerkers en zzp'ers die werk zoeken dat past bij hun vak, reistijd en agenda.",
  werkgever: "Werkgevers in horeca, retail en logistiek die snel betrouwbaar personeel willen inhuren.",
  algemeen: "Zowel flexwerkers die werk zoeken als werkgevers die personeel nodig hebben; wissel de doelgroep per bericht af.",
};

// --- feiten van deze week (echt, uit de database) ------------------------------------

/** Wat er deze week echt openstaat; leeg als er niets is. Nooit een verzonnen aantal. */
export async function weekFeiten(nu: Date = new Date()): Promise<string> {
  try {
    const tot = new Date(nu.getTime() + 7 * 24 * 3600 * 1000);
    const klussen = await prisma.shift.findMany({
      where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, visibility: "PUBLIC", startsAt: { gte: nu, lte: tot } },
      select: { branch: { select: { city: true } } },
      take: 500,
    });
    if (klussen.length === 0) return "";
    const perStad = new Map<string, number>();
    for (const k of klussen) perStad.set(k.branch.city, (perStad.get(k.branch.city) ?? 0) + 1);
    const top = [...perStad.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([stad, n]) => `${stad} (${n})`);
    return `Deze week staan er ${klussen.length} open klussen op ${SITE.name}, onder andere in ${top.join(", ")}.`;
  } catch (e) {
    logger.warn("social: weekfeiten niet te lezen", { error: (e as Error).message });
    return "";
  }
}

// --- vaste, gecontroleerde teksten (alleen claims uit FACTS) ---------------------------

interface Sjabloon {
  doelgroep: Exclude<Doelgroep, "algemeen">;
  tekst: string;
  hashtags: string[];
  beeldIdee: string;
}

export const SJABLONEN: readonly Sjabloon[] = [
  {
    doelgroep: "freelancer",
    tekst: "Werk dat past bij jou. Kies zelf je klussen, dichtbij huis en op jouw tijden. Meedoen is gratis en jij bepaalt hoe snel je betaald wordt.",
    hashtags: ["flexwerk", "zzp", "klussen", "ZekerFlex"],
    beeldIdee: "Een flexwerker die op straat een klus bekijkt op zijn telefoon.",
  },
  {
    doelgroep: "freelancer",
    tekst: "Geen KVK? Dan werk je als uitzendkracht via het ZekerFlex-uitzendbureau: wekelijkse verloning, pensioen via StiPP en het ABU-fasensysteem geregeld.",
    hashtags: ["uitzendwerk", "flexwerk", "bijbaan", "ZekerFlex"],
    beeldIdee: "Twee collega's in werkkleding die lachen bij de ingang van een magazijn.",
  },
  {
    doelgroep: "freelancer",
    tekst: "Zelf kiezen wanneer je uren worden uitbetaald: direct na goedkeuring, binnen 3 werkdagen, of gratis wachten tot de opdrachtgever betaalt. Jij houdt de regie.",
    hashtags: ["zzp", "uitbetaling", "flexibel", "ZekerFlex"],
    beeldIdee: "Een telefoon met een bevestiging 'uren goedgekeurd'.",
  },
  {
    doelgroep: "werkgever",
    tekst: "Personeel nodig? Plaats een dienst en betrouwbare krachten reageren direct. Je betaalt € 3,50 platformkosten per gewerkt uur, alleen als er echt iemand werkt. Geen abonnement, geen opstartkosten.",
    hashtags: ["horeca", "personeel", "flexwerk", "ZekerFlex"],
    beeldIdee: "Een horecaleidinggevende met een tablet in een drukke zaak.",
  },
  {
    doelgroep: "werkgever",
    tekst: "Hoe meer uren, hoe goedkoper. Bij veel uren per maand daalt je tarief automatisch van € 3,50 naar € 2,50 per uur. ZekerFlex legt de afspraken vast en signaleert Wet DBA-risico's.",
    hashtags: ["ondernemen", "personeel", "WetDBA", "ZekerFlex"],
    beeldIdee: "Een eenvoudige grafiek met een dalend uurtarief, in de huisstijl.",
  },
  {
    doelgroep: "werkgever",
    tekst: "Sneller je klussen gevuld? Werkgevers die snelle uitbetaling aanbieden krijgen sneller reacties van flexwerkers. Je betaalt alleen platformkosten als er daadwerkelijk iemand werkt.",
    hashtags: ["retail", "logistiek", "personeel", "ZekerFlex"],
    beeldIdee: "Een winkelmanager die een dienst bevestigt op haar telefoon.",
  },
];

function sjabloonPosts(doelgroep: Doelgroep, aantal: number): GeschrevenPost[] {
  const lijst = SJABLONEN.filter((s) => doelgroep === "algemeen" || s.doelgroep === doelgroep);
  const uit: GeschrevenPost[] = [];
  for (let i = 0; i < aantal; i += 1) {
    const s = lijst[i % lijst.length];
    if (s) uit.push({ tekst: s.tekst, hashtags: s.hashtags, beeldIdee: s.beeldIdee });
  }
  return uit;
}

// --- het model ---------------------------------------------------------------------------

const postSchema = z.object({
  tekst: tekst(1200),
  hashtags: z.preprocess((v) => (Array.isArray(v) ? v.map((x) => String(x)) : []), z.array(z.string())).catch([]),
  beeldIdee: tekst(300).catch(""),
});

/** Het antwoord soepel lezen: één onbruikbaar bericht overslaan, de rest houden. */
export function leesPosts(antwoord: unknown): GeschrevenPost[] {
  const lijst = Array.isArray(antwoord)
    ? antwoord
    : antwoord && typeof antwoord === "object" && Array.isArray((antwoord as { posts?: unknown }).posts)
      ? (antwoord as { posts: unknown[] }).posts
      : [];
  const uit: GeschrevenPost[] = [];
  for (const item of lijst) {
    const r = postSchema.safeParse(item);
    if (r.success && r.data.tekst.trim().length >= 20) uit.push({ tekst: r.data.tekst.trim(), hashtags: r.data.hashtags.slice(0, 10), beeldIdee: r.data.beeldIdee.trim() });
  }
  return uit;
}

// --- een antwoord op een reactie ------------------------------------------------------------------

export interface AntwoordVoorstel {
  antwoord: string;
  /** waarom een mens dit moet lezen, of null als het een gewone vraag of een compliment is */
  mensNodig: string | null;
  bron: "model" | "sjabloon";
}

const siteNaam = () => SITE.url.replace(/^https?:\/\//, "");

/** Een veilige standaardzin als het model er niet is; die gaat nooit vanzelf weg (bron "sjabloon"). */
export function standaardAntwoord(): string {
  return `Bedankt voor je reactie! Meer weten? Kijk op ${siteNaam()} of mail naar ${CONTACTS.general}.`;
}

const antwoordSchema = z.object({
  antwoord: tekst(400),
  mensNodig: z.preprocess((v) => v === true || v === "true", z.boolean()).catch(false),
});

export async function schrijfAntwoord(input: { kanaal: "facebook" | "instagram"; van: string; tekst: string; bericht: string }): Promise<AntwoordVoorstel> {
  if (llmConfigProblem()) return { antwoord: standaardAntwoord(), mensNodig: "Het AI-model is niet bereikbaar: lees en verstuur zelf.", bron: "sjabloon" };
  try {
    const system =
      `Je beheert het account van ${SITE.name} op ${input.kanaal === "facebook" ? "Facebook" : "Instagram"} en antwoordt op reacties in gewoon, warm, kort Nederlands (1 tot 2 zinnen, hooguit 1 emoji).\n\n` +
      `FEITEN (gebruik ALLEEN deze, verzin niets, geen prijzen, kortingen of beloftes die er niet staan):\n${FACTS}\n\n` +
      `Regels: noem geen persoonlijke gegevens; heb je het antwoord niet in de feiten, verwijs dan naar ${CONTACTS.general} of ${siteNaam()}. ` +
      `Zet "mensNodig" op true bij een klacht, een juridische of privacyvraag, een vraag waarvan je het antwoord niet zeker weet, of een reactie die boos of ironisch is.\n\n` +
      `Antwoord UITSLUITEND met JSON: {"antwoord": string, "mensNodig": boolean}.`;
    const user = `Bericht van ons (begin): ${input.bericht || "(onbekend)"}\nReactie van ${input.van}: ${input.tekst.slice(0, 500)}`;
    const raw = await chatJson<unknown>({
      purpose: "social-reactie",
      temperature: 0.4,
      maxTokens: 300,
      retry: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const r = antwoordSchema.parse(raw);
    if (r.antwoord.trim().length < 5) throw new Error("leeg antwoord");
    return { antwoord: r.antwoord.trim(), mensNodig: r.mensNodig ? "Het model wil dat een mens dit leest." : null, bron: "model" };
  } catch (e) {
    logger.warn("social: antwoord schrijven mislukt", { error: (e as Error).message });
    return { antwoord: standaardAntwoord(), mensNodig: "Het AI-model gaf geen bruikbaar antwoord: lees en verstuur zelf.", bron: "sjabloon" };
  }
}

/**
 * Houdt alleen de berichten over die door het vangnet komen (lib/social/veilig.ts) en vult aan met
 * vaste, gecontroleerde teksten tot er `aantal` zijn. Geeft ook terug hoeveel er zijn afgekeurd.
 */
export function alleenVeilig(posts: GeschrevenPost[], doelgroep: Doelgroep, aantal: number): { posts: GeschrevenPost[]; afgekeurd: number } {
  const goed = posts.filter((p) => beoordeelTekst(p.tekst).veilig);
  const afgekeurd = posts.length - goed.length;
  if (goed.length >= aantal) return { posts: goed.slice(0, aantal), afgekeurd };
  const gebruikt = new Set(goed.map((p) => p.tekst));
  const vast = sjabloonPosts(doelgroep, SJABLONEN.length).filter((p) => !gebruikt.has(p.tekst));
  return { posts: [...goed, ...vast].slice(0, aantal), afgekeurd };
}

export async function schrijfPosts(input: { doelgroep: Doelgroep; invalshoek?: string; aantal: number }): Promise<SchrijfUitslag> {
  const aantal = Math.max(1, Math.min(7, Math.round(input.aantal)));
  if (llmConfigProblem()) return { posts: sjabloonPosts(input.doelgroep, aantal), bron: "sjabloon" };
  try {
    const live = await weekFeiten();
    const system =
      `Je bent de social-mediaschrijver van ${SITE.name}. Schrijf Nederlandstalige berichten voor Instagram, Facebook en LinkedIn in gewoon, warm Nederlands.\n\n` +
      `FEITEN (gebruik ALLEEN deze, verzin geen cijfers, kortingen, klantnamen of claims die er niet staan):\n${FACTS}\n${live ? `\nDEZE WEEK (echt): ${live}\n` : ""}\n` +
      `Doelgroep: ${DOELGROEP_BRIEF[input.doelgroep]}\n\n` +
      `Regels: elk bericht heeft een andere insteek; maximaal 2 emoji; geen link in de tekst (die voegen wij toe); ` +
      `geen beloftes over een eigen rekening, betaalpas of voorschot.\n\n` +
      `Antwoord UITSLUITEND met JSON: {"posts": [{"tekst": string (40-90 woorden), "hashtags": string[] (3-6, zonder #), "beeldIdee": string (één zin: wat staat er op het beeld)}]}.`;
    const user =
      `${aantal === 1 ? "Schrijf 1 bericht" : `Schrijf ${aantal} verschillende berichten`}` +
      (input.invalshoek?.trim() ? ` met als invalshoek: ${input.invalshoek.trim().slice(0, 300)}` : ". Kies zelf sterke invalshoeken.");
    const antwoord = await chatJson<unknown>({
      purpose: "social-post",
      temperature: 0.8,
      maxTokens: 1500,
      retry: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const posts = leesPosts(antwoord).slice(0, aantal);
    if (posts.length === 0) throw new Error("geen bruikbare berichten in het antwoord");
    return { posts, bron: "model" };
  } catch (e) {
    logger.warn("social: berichten vielen terug op vaste teksten", { error: (e as Error).message });
    return { posts: sjabloonPosts(input.doelgroep, aantal), bron: "sjabloon" };
  }
}
