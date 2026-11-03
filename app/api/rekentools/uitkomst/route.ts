import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { recordServerEvent } from "@/lib/analytics/track";
import { buildUitkomst, escapeHtml, isBot, leadCompany, uitkomstSchema } from "@/lib/rekentools/uitkomst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/rekentools/uitkomst — "Stuur mij de uitkomst" on the employer
// rekentools. Mails the result (computed again here) to the visitor and lands
// the company as a warm lead in the sales pipeline (/admin/sales), with consent.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "rekentool-uitkomst",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanvragen. Probeer het over een paar minuten opnieuw.",
    });

    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    if (isBot(json)) return NextResponse.json({ ok: true });
    const parsed = uitkomstSchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer je e-mailadres en zet het vinkje voor akkoord.", parsed.error.flatten());
    }
    const d = parsed.data;
    const result = buildUitkomst(d);
    if (!result) throw AppError.validation("Vul de rekentool eerst helemaal in.");

    const base = env.APP_BASE_URL.replace(/\/+$/, "");
    const company = leadCompany(d.email, d.company);

    // One lead per address: a second calculation adds nothing for sales.
    try {
      const existing = await prisma.salesLead.findFirst({ where: { contactEmail: d.email, source: "rekentool" }, select: { id: true } });
      if (!existing) {
        await createLead({
          companyName: company,
          contactEmail: d.email,
          source: "rekentool",
          sourceUrl: result.path,
          notes: `${result.leadNote} Toestemming gegeven om contact op te nemen.`,
          createdById: null,
        });
      }
    } catch (e) {
      logger.warn("rekentool -> sales lead failed", { error: (e as Error).message });
    }

    void recordServerEvent({ path: result.path, label: "rekentool-uitkomst", meta: { tool: d.tool } });

    await sendMail({
      to: CONTACTS.sales,
      replyTo: d.email,
      kind: "rekentool-lead",
      subject: `Rekentool-lead: ${company}`,
      text: `Via ${base}${result.path}\n\nBedrijf: ${company}\nE-mail: ${d.email}\n\n${result.leadNote}\n\nToestemming gegeven om contact op te nemen.`,
      html: mailShell(
        "Nieuwe lead uit een rekentool",
        `<p style="margin:0 0 4px"><strong>${escapeHtml(company)}</strong></p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${escapeHtml(d.email)}</p>
         <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#17211C">${escapeHtml(result.leadNote)}</p>
         <p style="margin:0;font-size:12px;color:#667469">Toestemming gegeven om contact op te nemen. Staat in Admin → Sales.</p>`,
      ),
    }).catch((e) => logger.warn("rekentool lead notify failed", { error: (e as Error).message }));

    await sendMail({
      to: d.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: "rekentool-uitkomst",
      subject: result.subject,
      text: `${result.text}\n\nOpnieuw rekenen: ${base}${result.path}\nGratis een klus plaatsen: ${base}/register?type=bedrijf\n\nVragen? Beantwoord deze mail.`,
      html: mailShell(
        result.subject,
        `${result.html}
         <p style="margin:16px 0 8px">${mailButton(`${base}/register?type=bedrijf`, "Gratis een klus plaatsen")}</p>
         <p style="margin:0;font-size:13px;color:#667469"><a href="${base}${result.path}" style="color:#0E5C4A">Opnieuw rekenen</a> · Vragen? Beantwoord deze mail.</p>`,
      ),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("rekentool uitkomst failed", { error: (err as Error).message });
    return res;
  }
}
