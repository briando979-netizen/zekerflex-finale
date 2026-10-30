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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sales-partner — iemand die als ZZP op commissie klanten wil
// aanbrengen voor ZekerFlex. Landt als lead (source: sales-partner-application)
// in de sales-pijplijn en stuurt een mail naar sales.
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  region: z.string().trim().max(120).optional(),
  experience: z.string().trim().max(400).optional(),
  motivation: z.string().trim().max(2000).optional(),
  consent: z.literal(true),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "sales-partner",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanmeldingen — probeer het later opnieuw.",
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
    const notes = [
      "Aanmelding als sales-partner (ZZP, commissie).",
      d.region ? `Regio: ${d.region}.` : "",
      d.experience ? `Ervaring: ${d.experience}.` : "",
      d.motivation ? `Motivatie: ${d.motivation}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      await createLead({
        companyName: d.region ? `Sales-partner (${d.region})` : "Sales-partner aanmelding",
        contactName: d.name,
        contactEmail: d.email,
        contactPhone: d.phone,
        source: "sales-partner-application",
        sourceUrl: "/sales-partner",
        notes,
        createdById: null,
      });
    } catch (e) {
      logger.warn("sales-partner lead -> sales failed", { error: (e as Error).message });
    }

    void recordServerEvent({ path: "/sales-partner", label: "sales-partner-application", meta: { name: d.name, region: d.region ?? "" } });

    await sendMail({
      to: CONTACTS.sales,
      replyTo: d.email,
      kind: "partner-aanvraag",
      subject: `Sales-partner aanmelding — ${d.name}${d.region ? ` (${d.region})` : ""}`,
      text: `Nieuwe sales-partner aanmelding via /sales-partner\n\nNaam: ${d.name}\nE-mail: ${d.email}\n${d.phone ? `Telefoon: ${d.phone}\n` : ""}${d.region ? `Regio: ${d.region}\n` : ""}${d.experience ? `\nErvaring:\n${d.experience}\n` : ""}${d.motivation ? `\nMotivatie:\n${d.motivation}\n` : ""}`,
      html: mailShell(
        "Nieuwe sales-partner aanmelding",
        `<p style="margin:0 0 4px"><strong>${d.name}</strong>${d.region ? ` — ${d.region}` : ""}</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${d.email}${d.phone ? ` · ${d.phone}` : ""}</p>
         ${d.experience ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap"><strong>Ervaring:</strong> ${d.experience.replace(/</g, "&lt;")}</p>` : ""}
         ${d.motivation ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap"><strong>Motivatie:</strong> ${d.motivation.replace(/</g, "&lt;")}</p>` : ""}`,
      ),
    }).catch((e) => logger.warn("sales-partner notify failed", { error: (e as Error).message }));

    logger.info("sales-partner application received", { name: d.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("sales-partner application failed", { error: (err as Error).message });
    return res;
  }
}
