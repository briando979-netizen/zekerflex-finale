import { chatJson, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";

// ---------------------------------------------------------------------------
// ✨ Writing help in forms that used to be a blank textarea:
//   - employers: the klus-omschrijving + kledingvoorschriften on "Nieuwe klus";
//   - workers:   the motivation when reacting to a klus.
// Both always return something useful: a model-written draft when the
// language model is connected, otherwise a template built from the same
// facts. The user always edits the text before it is saved or sent.
// ---------------------------------------------------------------------------

export type WriterMode = "model" | "rules";

export interface ShiftTextInput {
  title: string;
  /** what the employer already typed — kept and improved, never thrown away */
  description?: string | undefined;
  dresscode?: string | undefined;
  branchName?: string | undefined;
  city?: string | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
  breakMinutes?: number | undefined;
  viaUitzendbureau?: boolean | undefined;
  company?: string | undefined;
}

export interface ShiftText {
  description: string;
  dresscode: string;
  mode: WriterMode;
}

interface Profile {
  re: RegExp;
  tasks: string[];
  dresscode: string;
  bring?: string;
}

// Job families seen on ZekerFlex. First match on the title wins.
const PROFILES: Profile[] = [
  { re: /vakken|schap|supermarkt|winkel/i, tasks: ["vakken vullen en schappen aanvullen", "producten naar voren zetten (facing)", "lege dozen en folie opruimen"], dresscode: "Nette, donkere kleding en dichte schoenen. Een bedrijfsshirt krijg je op locatie." },
  { re: /kassa|caissi|verkoop/i, tasks: ["klanten vriendelijk afrekenen", "vragen van klanten beantwoorden", "de kassa en de omgeving netjes houden"], dresscode: "Verzorgd uiterlijk, nette donkere kleding. Bedrijfskleding wordt verstrekt." },
  { re: /magazijn|order ?pick|logistiek|heftruck|reachtruck|expeditie|inpak/i, tasks: ["goederen ontvangen en controleren", "orders picken en klaarzetten", "het magazijn veilig en opgeruimd houden"], dresscode: "Veiligheidsschoenen (S3) verplicht, werkkleding met lange broek.", bring: "veiligheidsschoenen en eventueel je heftruckcertificaat" },
  { re: /schoonma|cleaner|huishoud|interieur/i, tasks: ["schoonmaakronde volgens checklist", "sanitair, kantines en algemene ruimtes reinigen", "afval scheiden en afvoeren"], dresscode: "Gemakkelijke werkkleding en dichte schoenen. Handschoenen en middelen zijn aanwezig." },
  { re: /horeca|bedien|bar|ober|serveer|catering|afwas|keuken|kok/i, tasks: ["gasten gastvrij ontvangen en bedienen", "bestellingen opnemen en uitserveren", "tafels en bar opruimen"], dresscode: "Zwarte broek, zwarte dichte schoenen en een wit of zwart shirt.", bring: "een geldig ID; voor bediening is je HACCP-kennis een plus" },
  { re: /recept|balie|front ?office|host/i, tasks: ["bezoekers ontvangen en aanmelden", "telefoon en post afhandelen", "vragen doorzetten naar de juiste collega"], dresscode: "Zakelijk-verzorgde kleding." },
  { re: /bouw|sloop|grondwerk|steiger|timmer|klus|monteur|installat/i, tasks: ["meewerken op de bouwplaats onder leiding van een voorman", "materiaal aan- en afvoeren", "de werkplek veilig en opgeruimd houden"], dresscode: "Veiligheidsschoenen, helm en hesje verplicht (PBM). Werkkleding met lange broek.", bring: "je VCA-certificaat en eigen PBM" },
  { re: /zorg|verpleeg|begeleid|thuiszorg/i, tasks: ["cliënten ondersteunen bij dagelijkse zorg", "rapporteren volgens het zorgplan", "samenwerken met het vaste team"], dresscode: "Uniform wordt verstrekt; nagels kort, geen sieraden aan handen en polsen.", bring: "je relevante diploma en VOG" },
  { re: /event|festival|beveilig|crowd|opbouw|afbouw/i, tasks: ["helpen bij de op- of afbouw", "bezoekers de weg wijzen", "samenwerken met de crew volgens draaiboek"], dresscode: "Zwarte kleding en stevige schoenen. Een crewshirt krijg je op locatie." },
  { re: /chauffeur|bezorg|koerier|rijder/i, tasks: ["ritten volgens planning rijden", "pakketten veilig afleveren", "afleverbewijzen in de app afhandelen"], dresscode: "Verzorgde werkkleding en dichte schoenen.", bring: "je rijbewijs" },
  { re: /productie|operator|fabriek|lopende band/i, tasks: ["meewerken aan de productielijn", "producten controleren op kwaliteit", "de werkplek schoon en veilig houden"], dresscode: "Veiligheidsschoenen verplicht; haar vast en geen sieraden.", bring: "veiligheidsschoenen" },
];

const GENERIC: Profile = {
  re: /./,
  tasks: ["de werkzaamheden uitvoeren zoals ter plekke uitgelegd", "samenwerken met het vaste team", "de werkplek netjes achterlaten"],
  dresscode: "Verzorgde kleding en dichte schoenen.",
};

export function profileFor(title: string): Profile {
  return PROFILES.find((p) => p.re.test(title)) ?? GENERIC;
}

const pad = (n: number) => String(n).padStart(2, "0");
function hhmm(iso?: string): string | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The template draft — also what the model gets as its starting point. */
export function ruleShiftText(input: ShiftTextInput): Omit<ShiftText, "mode"> {
  const p = profileFor(`${input.title} ${input.description ?? ""}`);
  const where = [input.branchName, input.city].filter(Boolean).join(", ");
  const from = hhmm(input.startsAt);
  const to = hhmm(input.endsAt);
  const lines: string[] = [];
  const own = input.description?.trim();
  lines.push(own ? own : `Voor deze dienst als ${input.title.trim().toLowerCase()}${where ? ` bij ${where}` : ""} zoeken we iemand die aanpakt.`);
  lines.push("", "Wat ga je doen:");
  for (const t of p.tasks) lines.push(`• ${t[0]!.toUpperCase()}${t.slice(1)}`);
  if (from && to) lines.push("", `Werktijd: ${from}–${to}${input.breakMinutes ? `, inclusief ${input.breakMinutes} minuten pauze` : ""}.`);
  if (p.bring) lines.push(`Neem mee: ${p.bring}.`);
  lines.push("Meld je bij aankomst bij de leidinggevende en check in via de ZekerFlex-app.");
  if (input.viaUitzendbureau) lines.push("Je werkt via het ZekerFlex-uitzendbureau en krijgt een loonstrook.");
  return {
    description: lines.join("\n").slice(0, 1000),
    dresscode: (input.dresscode?.trim() || p.dresscode).slice(0, 500),
  };
}

export async function draftShiftText(input: ShiftTextInput): Promise<ShiftText> {
  await ensureAiNode();
  const base = ruleShiftText(input);
  if (llmConfigProblem()) return { ...base, mode: "rules" };
  try {
    const out = await chatJson<{ description?: string; dresscode?: string }>({
      purpose: "shift-writer",
      temperature: 0.4,
      maxTokens: 500,
      retry: false,
      timeoutMs: 20_000,
      messages: [
        {
          role: "system",
          content:
            "Je schrijft vacatureteksten voor losse diensten op ZekerFlex, een Nederlands flexwerkplatform. " +
            "Schrijf in helder, vriendelijk Nederlands (B1-niveau), max 120 woorden voor de omschrijving: één openingszin, " +
            "dan een korte lijst taken met '• ', dan praktische info. Verzin GEEN loon, adres, bonussen of eisen die niet gegeven zijn. " +
            "Neem alles over wat de werkgever zelf al schreef. Antwoord als JSON: {\"description\": string, \"dresscode\": string}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            titel: input.title,
            bedrijf: input.company,
            locatie: [input.branchName, input.city].filter(Boolean).join(", ") || undefined,
            werktijd: hhmm(input.startsAt) && hhmm(input.endsAt) ? `${hhmm(input.startsAt)}-${hhmm(input.endsAt)}` : undefined,
            pauzeMinuten: input.breakMinutes || undefined,
            viaUitzendbureau: input.viaUitzendbureau || undefined,
            eigenTekst: input.description?.trim() || undefined,
            eigenKleding: input.dresscode?.trim() || undefined,
            concept: base,
          }),
        },
      ],
    });
    const description = out.description?.trim();
    if (!description) return { ...base, mode: "rules" };
    return {
      description: description.slice(0, 1000),
      dresscode: (out.dresscode?.trim() || base.dresscode).slice(0, 500),
      mode: "model",
    };
  } catch {
    return { ...base, mode: "rules" };
  }
}

/* ─────────────────────────── worker motivation ─────────────────────────── */

export interface MotivationInput {
  firstName: string;
  shiftTitle: string;
  clientName: string;
  completedShifts: number;
  /** shifts done earlier for this same client */
  completedForClient: number;
  skills: string[];
  /** what the worker already typed */
  draft?: string | undefined;
}

export function ruleMotivation(i: MotivationInput): string {
  const job = i.shiftTitle.trim().toLowerCase();
  const parts: string[] = [];
  if (i.completedForClient > 0) {
    parts.push(`Ik heb al ${i.completedForClient === 1 ? "eerder" : `${i.completedForClient} keer`} bij ${i.clientName} gewerkt en ken de werkwijze.`);
  } else if (i.completedShifts >= 5) {
    parts.push(`Ik heb via ZekerFlex al ${i.completedShifts} diensten gedraaid en weet wat er van me verwacht wordt.`);
  } else {
    parts.push(`Ik wil graag als ${job} aan de slag bij ${i.clientName}.`);
  }
  const rel = i.skills.filter((s) => job.includes(s.toLowerCase()) || s.toLowerCase().includes(job.split(" ")[0] ?? "")).slice(0, 2);
  if (rel.length) parts.push(`Ervaring met ${rel.join(" en ")} heb ik al.`);
  parts.push("Ik ben op tijd, werk netjes en pak aan waar nodig.");
  const own = i.draft?.trim();
  return (own ? `${own} ${parts.slice(1).join(" ")}` : parts.join(" ")).slice(0, 500);
}

export async function draftMotivation(i: MotivationInput): Promise<{ text: string; mode: WriterMode }> {
  await ensureAiNode();
  const base = ruleMotivation(i);
  if (llmConfigProblem()) return { text: base, mode: "rules" };
  try {
    const out = await chatJson<{ text?: string }>({
      purpose: "motivation-writer",
      temperature: 0.6,
      maxTokens: 220,
      retry: false,
      timeoutMs: 15_000,
      messages: [
        {
          role: "system",
          content:
            "Je helpt een flexwerker op ZekerFlex een korte motivatie te schrijven (2-3 zinnen, max 60 woorden, ik-vorm, Nederlands, " +
            "vriendelijk en zelfverzekerd, niet overdreven). Gebruik alleen de gegeven feiten; verzin geen diploma's, jaren ervaring of eerdere werkgevers. " +
            "Neem over wat de werker zelf al schreef. Antwoord als JSON: {\"text\": string}.",
        },
        { role: "user", content: JSON.stringify({ ...i, voorbeeld: base }) },
      ],
    });
    const text = out.text?.trim();
    return text ? { text: text.slice(0, 500), mode: "model" } : { text: base, mode: "rules" };
  } catch {
    return { text: base, mode: "rules" };
  }
}
