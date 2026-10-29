import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail, mailShell } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { recordServerEvent } from "@/lib/analytics/track";
import { partnerPlan } from "@/lib/partner-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/partner-lead — een bureau dat ZekerFlex zelf wil aanbieden (plugin/
// white-label/self-hosted). Landt als warme lead in de sales-pijplijn (/admin/
// sales) naast de demo-aanvragen, en stuurt een mail naar sales.
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  planId: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "partner-lead",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanvragen — probeer het later opnieuw.",
    });

    const parsed = schema.safeParse(
      await request.json().catch(() => {
        throw AppError.validation("Body moet JSON zijn");
      }),
    );
    if (!parsed.success) {
      throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    }
    const d = parsed.data;
    const plan = d.planId ? partnerPlan(d.planId) : undefined;
    const planLabel = plan ? plan.name : "nog onbekend";

    try {
      await createLead({
        companyName: d.company,
        contactName: d.name,
        contactEmail: d.email,
        contactPhone: d.phone,
        source: "partner-interest",
        sourceUrl: "/voor-bureaus",
        notes: `Interesse om ZekerFlex aan te bieden als ${planLabel}.${d.message ? ` Bericht: ${d.message}` : ""}`,
        createdById: null,
      });
    } catch (e) {
      logger.warn("partner lead -> sales failed", { error: (e as Error).message });
    }

    void recordServerEvent({ path: "/voor-bureaus", label: "partner-lead", meta: { company: d.company, plan: planLabel } });

    await sendMail({
      to: CONTACTS.sales,
      replyTo: d.email,
      kind: "partner-aanvraag",
      subject: `Partner-aanvraag (${planLabel}) — ${d.company}`,
      text: `Nieuwe partner-aanvraag via /voor-bureaus\n\nPakket: ${planLabel}\nBedrijf: ${d.company}\nNaam: ${d.name}\nE-mail: ${d.email}\n${d.phone ? `Telefoon: ${d.phone}\n` : ""}${d.message ? `\nBericht:\n${d.message}\n` : ""}`,
      html: mailShell(
        "Nieuwe partner-aanvraag",
        `<p style="margin:0 0 4px"><strong>${d.company}</strong> — ${planLabel}</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${d.name} · ${d.email}${d.phone ? ` · ${d.phone}` : ""}</p>
         ${d.message ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${d.message.replace(/</g, "&lt;")}</p>` : ""}`,
      ),
    }).catch((e) => logger.warn("partner notify failed", { error: (e as Error).message }));

    logger.info("partner lead received", { company: d.company, plan: planLabel });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("partner lead failed", { error: (err as Error).message });
    return res;
  }
}
