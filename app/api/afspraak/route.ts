import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { saveDemoRequest } from "@/lib/demo/store";
import { formatDemoDate, isSelectableDemoDate, isValidDemoTime } from "@/lib/demo/slots";
import { createLead } from "@/lib/sales/leads";
import { appendMessage, isConversationId } from "@/lib/chat/webchat";
import { recordServerEvent } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/afspraak — door de ZekerFlex AI-assistent op de website ingeplande
// afspraak: een belafspraak ("call", we bellen de bezoeker) of een demo. Legt
// een echte afspraak vast (lib/demo/store), zet hem als warme lead in de
// sales-pijplijn, mailt het team + de bezoeker (met een agenda-knop/.ics) en
// plaatst een bevestiging in de chatdraad als die meekomt.
const schema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(160).optional(),
    kind: z.enum(["demo", "call"]).default("call"),
    date: z.string(),
    time: z.string(),
    topic: z.string().trim().max(2000).optional(),
    conversationId: z.string().optional(),
    consent: z.literal(true),
  })
  .refine((d) => d.kind !== "call" || (d.phone && d.phone.length >= 6), {
    message: "Voor een belafspraak hebben we je telefoonnummer nodig.",
    path: ["phone"],
  });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "afspraak",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanvragen — probeer het later opnieuw.",
    });

    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    }
    const d = parsed.data;
    if (!isSelectableDemoDate(d.date)) throw AppError.validation("Kies een geldige datum (werkdag).");
    if (!isValidDemoTime(d.time)) throw AppError.validation("Kies een geldig tijdstip.");

    const [firstName, ...rest] = d.name.split(/\s+/);
    const lastName = rest.join(" ") || "—";
    const company = d.company?.trim() || `${d.name} (particulier)`;
    const isCall = d.kind === "call";

    const rec = await saveDemoRequest({
      firstName: firstName ?? d.name,
      lastName,
      email: d.email,
      company,
      ...(d.phone ? { phone: d.phone } : {}),
      date: d.date,
      time: d.time,
      ...(d.topic ? { note: d.topic } : {}),
      kind: d.kind,
      ...(d.topic ? { topic: d.topic } : {}),
    });

    const when = `${formatDemoDate(rec.date)} om ${rec.time}`;
    const base = env.APP_BASE_URL.replace(/\/+$/, "");
    const icsUrl = `${base}/api/demo/${rec.id}/ics`;
    const label = isCall ? "Belafspraak" : "Demo";

    // Warme lead → sales-pijplijn (/admin/sales), naast de koude prospects.
    try {
      await createLead({
        companyName: company,
        contactName: d.name,
        contactEmail: d.email,
        contactPhone: d.phone,
        source: isCall ? "ai-belafspraak" : "ai-demo",
        sourceUrl: "/ (AI-assistent)",
        notes: `${label} ingepland door de AI-assistent voor ${when}.${d.topic ? ` Onderwerp: ${d.topic}` : ""} (ref ${rec.id})`,
        createdById: null,
      });
    } catch (e) {
      logger.warn("afspraak -> sales lead failed", { error: (e as Error).message });
    }

    void recordServerEvent({ path: "/afspraak", label: isCall ? "ai-belafspraak" : "ai-demo", meta: { ref: rec.id } });

    // Team: komt bij sales@ terecht (die handelt afspraken + offertes af).
    await sendMail({
      to: CONTACTS.sales,
      replyTo: rec.email,
      kind: "ai-afspraak",
      subject: `${label} via AI-assistent — ${d.name}`,
      text: `Nieuwe ${label.toLowerCase()} ingepland door de ZekerFlex AI-assistent.\n\nNaam: ${d.name}\nE-mail: ${rec.email}\n${rec.phone ? `Telefoon: ${rec.phone}\n` : ""}${d.company ? `Bedrijf: ${d.company}\n` : ""}Voorkeur: ${when}\n${d.topic ? `\nOnderwerp:\n${d.topic}\n` : ""}\nReferentie: ${rec.id}`,
      html: mailShell(
        `Nieuwe ${label.toLowerCase()}`,
        `<p style="margin:0 0 4px"><strong>${d.name}</strong></p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${rec.email}${rec.phone ? ` · ${rec.phone}` : ""}${d.company ? ` · ${d.company}` : ""}</p>
         <p style="margin:0 0 6px;font-size:15px;color:#17211C"><strong>Voorkeur:</strong> ${when}</p>
         ${d.topic ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${d.topic.replace(/</g, "&lt;")}</p>` : ""}
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Type: ${label} · Referentie: ${rec.id}</p>`,
      ),
    }).catch((e) => logger.warn("afspraak notify failed", { error: (e as Error).message }));

    // Bezoeker: bevestiging + agenda-knop.
    const intro = isCall
      ? `we bellen je op <strong>${when}</strong>${rec.phone ? ` op ${rec.phone}` : ""}. Zet de afspraak alvast in je agenda — dan krijg je er vanzelf een herinnering van.`
      : `je voorkeur staat genoteerd voor <strong>${when}</strong>. We bevestigen binnen één werkdag per e-mail, met een videolink.`;
    await sendMail({
      to: rec.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: "ai-afspraak-bevestiging",
      subject: isCall ? "Je belafspraak met ZekerFlex staat genoteerd" : "Je demo-aanvraag bij ZekerFlex",
      text: `Hoi ${firstName ?? d.name},\n\n${isCall ? `We bellen je op ${when}${rec.phone ? ` op ${rec.phone}` : ""}.` : `Je demo-voorkeur staat genoteerd voor ${when}.`}\n\nZet de afspraak in je agenda: ${icsUrl}\n\nTot snel!\nZekerFlex`,
      html: mailShell(
        isCall ? "Belafspraak genoteerd" : "Demo-aanvraag ontvangen",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${firstName ?? d.name}, ${intro}</p>
         <p style="margin:0 0 4px">${mailButton(icsUrl, "Zet in je agenda")}</p>`,
      ),
    }).catch(() => undefined);

    // Bevestiging in de chatdraad (ticket), als die meekomt.
    const convId = isConversationId(parsed.data.conversationId) ? parsed.data.conversationId : null;
    if (convId) {
      await appendMessage(convId, {
        role: "assistant",
        content: `✅ ${label} genoteerd voor ${when}. Je krijgt een bevestiging per e-mail met een agenda-knop.`,
      }).catch(() => undefined);
    }

    logger.info("ai afspraak received", { id: rec.id, kind: d.kind, date: rec.date, time: rec.time });
    return NextResponse.json({ ok: true, id: rec.id, when, kind: d.kind, icsUrl });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("ai afspraak failed", { error: (err as Error).message });
    return res;
  }
}
