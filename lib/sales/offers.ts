import { randomUUID } from "node:crypto";
import { kvGet, kvSet, kvListValues } from "@/lib/storage/kv";
import { chat, fastModel, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { imapConfig, sendMail, mailShell } from "@/lib/mail";
import { fetchInboxList, fetchMessageContent } from "@/lib/mail/imap";
import { createLead } from "@/lib/sales/leads";
import { CONTACTS } from "@/lib/seo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Offerte-AI: leest de ZekerFlex-mailbox (sales@/info@ via imapConfig), herkent
// offerte-/personeelsaanvragen van bedrijven, haalt de details eruit, zet er een
// warme inbound-lead van in de sales-pijplijn en schrijft een concept-antwoord
// (met de echte ZekerFlex-feiten: €3,50/uur, geen abonnement). De mens verstuurt
// het antwoord (of past het aan) — de AI stuurt niet zelf.
//
// Opslag in KeyValueStore:
//   offer:<id>            — een verwerkte aanvraag + extractie + concept-antwoord
//   offer:seen:<uid>      — dedup-marker per IMAP-bericht
// ---------------------------------------------------------------------------

export interface OfferAnalysis {
  isOffer: boolean;
  /** 0..1 — hoe zeker dat dit een offerte-/personeelsaanvraag is. */
  confidence: number;
  company: string | null;
  contactName: string | null;
  /** Wat ze nodig hebben (functie, werk). */
  behoefte: string | null;
  aantal: string | null;
  locatie: string | null;
  periode: string | null;
  functietype: string | null;
  samenvatting: string;
  draftReply: string;
}

export type OfferStatus = "nieuw" | "beantwoord" | "afgewezen";

export interface OfferRecord extends OfferAnalysis {
  id: string;
  at: string;
  fromName: string | null;
  fromAddress: string | null;
  subject: string | null;
  leadId: string | null;
  status: OfferStatus;
}

const SYSTEM = `Je bent de sales-assistent van ZekerFlex, een Nederlands platform voor flexibel werk.
Je krijgt een binnengekomen e-mail. Bepaal of het een OFFERTE- of PERSONEELSAANVRAAG is van een bedrijf
dat (flexibel) personeel wil inhuren of een prijsopgave vraagt. Nieuwsbrieven, facturen, sollicitaties van
werkzoekenden, spam of automatische meldingen zijn GEEN offerteaanvraag.

Als het er wél een is, haal de gegevens eruit en schrijf een kort, professioneel concept-antwoord in het Nederlands.
Gebruik alleen deze feiten voor het antwoord: werkgevers betalen €3,50 platformkosten per gewerkt uur, geen abonnement
en geen opstartkosten; ZekerFlex matcht werknemers aan losse diensten; facturen worden automatisch gemaakt. Verzin geen
andere prijzen of beloftes. Nodig uit voor een korte kennismaking/demo en verwijs naar zekerflex.com.

Antwoord ALLEEN met JSON in exact deze vorm:
{"isOffer": true|false, "confidence": 0.0-1.0, "company": string|null, "contactName": string|null,
 "behoefte": string|null, "aantal": string|null, "locatie": string|null, "periode": string|null,
 "functietype": string|null, "samenvatting": string, "draftReply": string}
Als isOffer false is: laat draftReply leeg ("").`;

function coerce(raw: unknown): OfferAnalysis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const conf = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0;
  return {
    isOffer: o.isOffer === true,
    confidence: conf,
    company: str(o.company),
    contactName: str(o.contactName),
    behoefte: str(o.behoefte),
    aantal: str(o.aantal),
    locatie: str(o.locatie),
    periode: str(o.periode),
    functietype: str(o.functietype),
    samenvatting: str(o.samenvatting) ?? "",
    draftReply: typeof o.draftReply === "string" ? o.draftReply : "",
  };
}

export interface OfferInput {
  fromName?: string | null | undefined;
  fromAddress?: string | null | undefined;
  subject?: string | null | undefined;
  body: string;
}

export async function analyzeOffer(input: OfferInput): Promise<OfferAnalysis> {
  await ensureAiNode();
  if (llmConfigProblem()) {
    return coerce({ isOffer: false, samenvatting: "AI niet beschikbaar." });
  }
  const userMsg = `Afzender: ${input.fromName ?? ""} <${input.fromAddress ?? ""}>
Onderwerp: ${input.subject ?? ""}

${input.body.slice(0, 6000)}`;
  try {
    const out = await chat({
      purpose: "sales-offer",
      model: fastModel(),
      temperature: 0.2,
      maxTokens: 900,
      json: true,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
    });
    return coerce(JSON.parse(out.text));
  } catch (err) {
    logger.warn("offer analyze failed", { error: (err as Error).message });
    return coerce({ isOffer: false, samenvatting: "Kon niet analyseren." });
  }
}

const offerKey = (id: string) => `offer:${id}`;
const seenKey = (uid: number) => `offer:seen:${uid}`;

export async function listOffers(limit = 100): Promise<OfferRecord[]> {
  const rows = await kvListValues<OfferRecord>("offer:", limit * 3);
  return rows
    .filter((r) => r && typeof (r as OfferRecord).id === "string")
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export async function getOffer(id: string): Promise<OfferRecord | null> {
  if (!/^[a-f0-9-]{6,20}$/.test(id)) return null;
  return kvGet<OfferRecord>(offerKey(id));
}

export async function setOfferStatus(id: string, status: OfferStatus): Promise<OfferRecord | null> {
  const rec = await getOffer(id);
  if (!rec) return null;
  rec.status = status;
  await kvSet(offerKey(id), rec);
  return rec;
}

/** Legt een geanalyseerde aanvraag vast: warme lead + opslag + teammelding. */
export async function recordOffer(input: OfferInput, analysis: OfferAnalysis): Promise<OfferRecord> {
  let leadId: string | null = null;
  try {
    const lead = await createLead({
      companyName: analysis.company ?? input.fromName ?? input.fromAddress ?? "Onbekend bedrijf",
      contactName: analysis.contactName ?? input.fromName ?? "",
      contactEmail: input.fromAddress ?? "",
      source: "offerte-inbound",
      sourceUrl: "sales@zekerflex.com",
      notes: `Offerteaanvraag via mail. ${analysis.samenvatting}`.slice(0, 500),
      createdById: null,
    });
    leadId = lead.id;
  } catch (e) {
    logger.warn("offer -> lead failed", { error: (e as Error).message });
  }

  const rec: OfferRecord = {
    ...analysis,
    id: randomUUID().slice(0, 12),
    at: new Date().toISOString(),
    fromName: input.fromName ?? null,
    fromAddress: input.fromAddress ?? null,
    subject: input.subject ?? null,
    leadId,
    status: "nieuw",
  };
  await kvSet(offerKey(rec.id), rec);

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  await sendMail({
    to: CONTACTS.sales,
    ...(input.fromAddress ? { replyTo: input.fromAddress } : {}),
    kind: "offerte-signaal",
    subject: `Offerteaanvraag: ${analysis.company ?? input.fromName ?? input.fromAddress ?? "onbekend"}`,
    text: `Nieuwe offerteaanvraag herkend door de AI.\n\nBedrijf: ${analysis.company ?? "-"}\nContact: ${analysis.contactName ?? "-"} <${input.fromAddress ?? "-"}>\nBehoefte: ${analysis.behoefte ?? "-"}\nAantal: ${analysis.aantal ?? "-"}\nLocatie: ${analysis.locatie ?? "-"}\nPeriode: ${analysis.periode ?? "-"}\n\nSamenvatting: ${analysis.samenvatting}\n\n--- Concept-antwoord ---\n${analysis.draftReply}\n\nBekijk + verstuur: ${base}/admin/offertes`,
    html: mailShell(
      "Offerteaanvraag herkend",
      `<p style="margin:0 0 4px"><strong>${(analysis.company ?? input.fromName ?? input.fromAddress ?? "onbekend").replace(/</g, "&lt;")}</strong></p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${(analysis.contactName ?? "").replace(/</g, "&lt;")} ${input.fromAddress ? `· ${input.fromAddress}` : ""}</p>
       <p style="margin:0 0 10px;font-size:14px;color:#17211C">${analysis.samenvatting.replace(/</g, "&lt;")}</p>
       <p style="margin:12px 0 4px;font-size:13px;color:#667469">Concept-antwoord staat klaar in het dashboard.</p>`,
    ),
  }).catch((e) => logger.warn("offer notify failed", { error: (e as Error).message }));

  return rec;
}

export interface OfferSweepResult {
  ok: boolean;
  reason?: string;
  scanned: number;
  offers: number;
  errors: string[];
}

const SKIP_SENDERS = /no-?reply|noreply|mailer-daemon|postmaster|notifications?@|newsletter|nieuwsbrief@/i;

/** Leest de mailbox, verwerkt nieuwe offerteaanvragen (bounded per run). */
export async function sweepSalesOffers(limit = 15): Promise<OfferSweepResult> {
  const base: OfferSweepResult = { ok: true, scanned: 0, offers: 0, errors: [] };
  const cfg = imapConfig();
  if (!cfg) return { ...base, ok: false, reason: "geen mailbox geconfigureerd (IMAP)" };
  await ensureAiNode();
  if (llmConfigProblem()) return { ...base, ok: false, reason: "geen LLM beschikbaar" };

  let envelopes;
  try {
    envelopes = await fetchInboxList(cfg, limit);
  } catch (err) {
    return { ...base, ok: false, reason: `inbox lezen mislukte: ${(err as Error).message}` };
  }

  let processed = 0;
  for (const env0 of envelopes) {
    if (processed >= 10) break; // cap LLM-calls per run
    if (await kvGet(seenKey(env0.uid))) continue;
    await kvSet(seenKey(env0.uid), { at: new Date().toISOString() }).catch(() => undefined);
    if (env0.fromAddress && SKIP_SENDERS.test(env0.fromAddress)) continue;
    base.scanned += 1;
    processed += 1;
    try {
      const content = await fetchMessageContent(cfg, env0.uid);
      const analysis = await analyzeOffer({
        fromName: env0.fromName,
        fromAddress: env0.replyToAddress ?? env0.fromAddress,
        subject: env0.subject,
        body: content.text,
      });
      if (analysis.isOffer && analysis.confidence >= 0.6) {
        await recordOffer(
          {
            fromName: env0.fromName,
            fromAddress: env0.replyToAddress ?? env0.fromAddress,
            subject: env0.subject,
            body: content.text,
          },
          analysis,
        );
        base.offers += 1;
      }
    } catch (err) {
      base.errors.push(`uid ${env0.uid}: ${(err as Error).message}`);
    }
  }
  logger.info("sales offers sweep done", { ...base, errors: base.errors.length });
  return base;
}
