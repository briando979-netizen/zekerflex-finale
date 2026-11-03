import { z } from "zod";
import { compareFlexCost } from "@/lib/rekentools/kosten";
import { DBA_GROUP_LABELS, DBA_LEVEL_TEXT, DBA_MAX_SCORE, DBA_QUESTIONS, scoreDba, type DbaAnswer } from "@/lib/rekentools/dba-check";
import { euroCents, euroWhole, hoursNl } from "@/lib/rekentools/invoer";

// ---------------------------------------------------------------------------
// "Stuur mij de uitkomst" for the employer rekentools. The browser only sends
// what was filled in; the result is computed again here with the same pure
// logic, so the mail and the sales lead never carry numbers we didn't compute.
// Pure (no db/mail): app/api/rekentools/uitkomst/route.ts sends and stores.
// ---------------------------------------------------------------------------

const ANSWER = z.enum(["ja", "deels", "nee"]);

const contact = {
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  consent: z.literal(true),
  /** honeypot: hidden field, a person leaves it empty (see isBot) */
  website: z.string().max(200).optional(),
};

export const uitkomstSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("kosten-uitzendkracht"),
    input: z.object({
      workers: z.number().min(0).max(500),
      hoursPerWeek: z.number().min(0).max(60),
      weeks: z.number().min(0).max(104),
      wageCents: z.number().int().min(0).max(50_000),
      factor: z.number().min(1).max(4),
      rateCents: z.number().int().min(0).max(50_000),
    }),
    ...contact,
  }),
  z.object({
    tool: z.literal("wet-dba-check"),
    answers: z.record(z.string(), ANSWER),
    ...contact,
  }),
]);

export type UitkomstRequest = z.infer<typeof uitkomstSchema>;

export interface Uitkomst {
  /** where the tool lives, for the lead and the mail */
  path: string;
  subject: string;
  /** one paragraph for the sales lead */
  leadNote: string;
  text: string;
  /** body for mailShell(); every user value is escaped */
  html: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const P = 'style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42"';
const TD = 'style="padding:6px 0;font-size:15px;color:#3C4A42"';
const TDR = 'style="padding:6px 0;font-size:15px;color:#17211C;text-align:right;font-weight:600"';

/** Null when the request can't produce a result (no hours, or the check isn't finished). */
export function buildUitkomst(req: UitkomstRequest): Uitkomst | null {
  return req.tool === "kosten-uitzendkracht" ? kosten(req.input) : dba(req.answers);
}

function kosten(input: Extract<UitkomstRequest, { tool: "kosten-uitzendkracht" }>["input"]): Uitkomst | null {
  const r = compareFlexCost(input);
  if (r.totalHours <= 0) return null;
  const factor = input.factor.toLocaleString("nl-NL");
  const verdict =
    r.savingCents > 0
      ? `Via ZekerFlex bespaar je ${euroWhole(r.savingCents)} (${euroCents(r.savingPerHourCents)} per uur).`
      : r.savingCents < 0
        ? `Bij deze aannames is het uitzendbureau ${euroWhole(-r.savingCents)} goedkoper.`
        : "Bij deze aannames is het even duur.";
  const scope = `${input.workers} ${input.workers === 1 ? "kracht" : "krachten"}, ${hoursNl(input.hoursPerWeek)} uur per week, ${hoursNl(input.weeks)} weken (${hoursNl(r.totalHours)} uur)`;
  const rows: [string, string][] = [
    [`Uitzendbureau (${euroCents(input.wageCents)} × ${factor})`, `${euroCents(r.bureau.perHourCents)} per uur`],
    [`Via ZekerFlex (${euroCents(r.zekerflex.rateCents)} + ${euroCents(r.zekerflex.feePerHourCents)} platformkosten)`, `${euroCents(r.zekerflex.perHourCents)} per uur`],
    ["Totaal uitzendbureau", euroWhole(r.bureau.totalCents)],
    ["Totaal via ZekerFlex", euroWhole(r.zekerflex.totalCents)],
  ];
  return {
    path: "/rekentools/kosten-uitzendkracht-berekenen",
    subject: "Je vergelijking: uitzendbureau en ZekerFlex",
    leadNote: `Rekentool kosten flexkracht: ${scope}. Bureau ${euroCents(r.bureau.perHourCents)}/u, ZekerFlex ${euroCents(r.zekerflex.perHourCents)}/u. ${verdict}`,
    text: [`Je vergelijking voor ${scope}:`, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", verdict, "", "Bedragen zonder btw. Toeslagen en reiskosten zijn aan geen van beide kanten meegerekend."].join("\n"),
    html: `<p ${P}>Je vergelijking voor ${escapeHtml(scope)}:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px">
        ${rows.map(([k, v]) => `<tr><td ${TD}>${escapeHtml(k)}</td><td ${TDR}>${escapeHtml(v)}</td></tr>`).join("")}
      </table>
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#0E5C4A">${escapeHtml(verdict)}</p>
      <p style="margin:0 0 12px;font-size:13px;color:#667469">Bedragen zonder btw. Toeslagen en reiskosten zijn aan geen van beide kanten meegerekend.</p>`,
  };
}

function dba(raw: Record<string, string>): Uitkomst | null {
  const known = new Set(DBA_QUESTIONS.map((q) => q.id));
  const answers: Partial<Record<string, DbaAnswer>> = {};
  for (const [id, a] of Object.entries(raw)) if (known.has(id)) answers[id] = a as DbaAnswer;
  const r = scoreDba(answers);
  if (!r.level) return null;
  const level = DBA_LEVEL_TEXT[r.level];
  const tips = r.attention.map(({ question, partly }) => `${DBA_GROUP_LABELS[question.group]}${partly ? " (deels)" : ""}: ${question.tip}`);
  const good = r.strengths.map((q) => q.good);
  const disclaimer = "Een indicatie op basis van je antwoorden, geen juridisch advies. Uiteindelijk telt het totaalbeeld van hoe jullie samenwerken.";
  return {
    path: "/rekentools/wet-dba-check",
    subject: "Je uitkomst van de Wet DBA-check",
    leadNote: `Wet DBA-check: ${level.title} (${r.score.toLocaleString("nl-NL")} van ${DBA_MAX_SCORE} risicopunten).${
      r.attention.length ? ` Aandachtspunten: ${[...new Set(r.attention.map((a) => DBA_GROUP_LABELS[a.question.group]))].join(", ")}.` : ""
    }`,
    text: [level.title, level.body, "", ...(tips.length ? ["Aandachtspunten:", ...tips.map((t) => `- ${t}`), ""] : []), ...(good.length ? ["Wat al goed zit:", ...good.map((g) => `- ${g}`), ""] : []), disclaimer].join("\n"),
    html: `<p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#17211C">${escapeHtml(level.title)}</p>
      <p ${P}>${escapeHtml(level.body)}</p>
      ${tips.length ? `<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#17211C">Aandachtspunten</p><ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#3C4A42">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
      ${good.length ? `<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#17211C">Wat al goed zit</p><ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#3C4A42">${good.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>` : ""}
      <p style="margin:0 0 12px;font-size:13px;color:#667469">${escapeHtml(disclaimer)}</p>`,
  };
}

/** The hidden website field was filled in: answer "sent" but do nothing. */
export function isBot(body: unknown): boolean {
  const w = (body as { website?: unknown } | null)?.website;
  return typeof w === "string" && w.trim() !== "";
}

/** Lead company: what was typed, else the mail domain (better than nothing for sales). */
export function leadCompany(email: string, company?: string): string {
  const typed = company?.trim();
  if (typed) return typed;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain ? `Onbekend bedrijf (${domain})` : "Onbekend bedrijf";
}
