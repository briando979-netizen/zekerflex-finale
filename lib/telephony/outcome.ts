import { prisma } from "@/lib/prisma";
import { getCall, patchCall, type CallOutcome } from "@/lib/telephony/store";
import { createLead } from "@/lib/sales/leads";
import { chat, fastModel, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Na afloop van een gesprek: haal de uitkomst uit het transcript (interesse,
// naam, bedrijf, terugbelwens, korte samenvatting) en leg die vast — op het
// gespreksrecord én in de sales-pijplijn. Zo wordt een warm gesprek echt
// opgevolgd i.p.v. te verdampen. Idempotent en best-effort.
// ---------------------------------------------------------------------------

const OUTCOME_SYSTEM = `Je krijgt het transcript van een telefoongesprek van ZekerFlex (een platform voor flexibel werk).
Vat de UITKOMST samen als puur JSON, zonder uitleg eromheen, met exact deze velden:
{"interested": boolean, "kind": "werkgever"|"werknemer"|"melding"|"support"|"anders", "contactName": string, "company": string, "callbackNote": string, "summary": string}
- interested: true als de beller echt interesse of een concrete vraag had (personeel zoeken, werk zoeken, teruggebeld worden), false bij voicemail, verkeerd verbonden, of geen interesse.
- kind: wat de beller wilde.
- contactName/company/callbackNote: alleen invullen als het duidelijk genoemd is, anders "".
- summary: één korte Nederlandse zin over wat er besproken is.
Let op: het transcript kan ruis uit spraakherkenning bevatten; wees voorzichtig en verzin niets.`;

function parseOutcome(text: string): CallOutcome | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const raw = JSON.parse(m[0]) as Record<string, unknown>;
    const kinds = ["werkgever", "werknemer", "melding", "support", "anders"] as const;
    const kind = typeof raw.kind === "string" && (kinds as readonly string[]).includes(raw.kind) ? (raw.kind as CallOutcome["kind"]) : "anders";
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return {
      interested: raw.interested === true,
      kind,
      summary: str(raw.summary) ?? "Gesprek gevoerd.",
      ...(str(raw.contactName) ? { contactName: str(raw.contactName)! } : {}),
      ...(str(raw.company) ? { company: str(raw.company)! } : {}),
      ...(str(raw.callbackNote) ? { callbackNote: str(raw.callbackNote)! } : {}),
    };
  } catch {
    return null;
  }
}

export async function captureCallOutcome(callId: string): Promise<void> {
  const rec = await getCall(callId);
  if (!rec || rec.outcome) return; // onbekend of al verwerkt
  const bellerTurns = rec.transcript.filter((t) => t.who === "beller" && t.text.trim().length > 0);
  if (bellerTurns.length < 2) return; // geen echt gesprek (voicemail/snel opgehangen)

  let outcome: CallOutcome | null = null;
  try {
    await ensureAiNode();
    if (llmConfigProblem()) return;
    const convo = rec.transcript.map((t) => `${t.who === "ai" ? "AI" : "Beller"}: ${t.text}`).join("\n");
    const out = await chat({
      purpose: "phone-outcome",
      model: fastModel(),
      temperature: 0,
      maxTokens: 260,
      messages: [
        { role: "system", content: OUTCOME_SYSTEM },
        { role: "user", content: convo.slice(0, 4000) },
      ],
    });
    outcome = parseOutcome(out.text);
  } catch (err) {
    logger.warn("call outcome extraction failed", { callId, error: (err as Error).message });
    return;
  }
  if (!outcome) return;

  await patchCall(callId, { outcome }).catch(() => undefined);

  // In de pijplijn vastleggen zodat sales het oppakt.
  try {
    const when = new Date(rec.at).toLocaleString("nl-NL");
    const note = `📞 AI-belgesprek (${when}): ${outcome.summary}${outcome.callbackNote ? ` — terugbellen: ${outcome.callbackNote}` : ""}`;
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (rec.leadId) {
      const lead = await prisma.salesLead.findUnique({ where: { id: rec.leadId }, select: { id: true, notes: true } });
      if (lead) {
        await prisma.salesLead.update({
          where: { id: lead.id },
          data: {
            notes: [lead.notes, note].filter(Boolean).join("\n").slice(0, 4000),
            ...(outcome.contactName ? { contactName: outcome.contactName } : {}),
            ...(outcome.interested || outcome.callbackNote ? { nextActionAt: soon } : {}),
          },
        });
      }
    } else if (outcome.interested && (outcome.kind === "werkgever" || outcome.kind === "werknemer")) {
      // Inkomende geïnteresseerde beller zonder bestaande lead → maak er een lead van.
      await createLead({
        companyName: outcome.company || (outcome.contactName ? outcome.contactName : `Inkomende beller ${rec.fromNumber}`),
        source: "ai-beller",
        notes: note,
        createdById: null,
        ...(outcome.contactName ? { contactName: outcome.contactName } : {}),
        ...(rec.fromNumber && rec.fromNumber !== "onbekend" ? { contactPhone: rec.fromNumber } : {}),
      });
    }
  } catch (err) {
    logger.warn("call outcome persist failed", { callId, error: (err as Error).message });
  }
}
