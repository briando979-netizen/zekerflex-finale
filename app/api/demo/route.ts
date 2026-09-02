import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { saveDemoRequest } from "@/lib/demo/store";
import { formatDemoDate, isSelectableDemoDate, isValidDemoTime } from "@/lib/demo/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  company: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  date: z.string(),
  time: z.string(),
  note: z.string().trim().max(2000).optional(),
  consent: z.literal(true),
});

// POST /api/demo — public demo request from an opdrachtgever. Filesystem only.
export async function POST(request: Request): Promise<NextResponse> {
  try {
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

    const rec = await saveDemoRequest({
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      company: d.company,
      ...(d.phone ? { phone: d.phone } : {}),
      date: d.date,
      time: d.time,
      ...(d.note ? { note: d.note } : {}),
    });

    const when = `${formatDemoDate(rec.date)} om ${rec.time}`;
    const base = env.APP_BASE_URL.replace(/\/+$/, "");

    await sendMail({
      to: CONTACTS.sales,
      replyTo: rec.email,
      kind: "demo-aanvraag",
      subject: `Demo-aanvraag — ${rec.company}`,
      text: `Nieuwe demo-aanvraag via zekerflex.com/demo\n\nBedrijf: ${rec.company}\nNaam: ${rec.firstName} ${rec.lastName}\nE-mail: ${rec.email}\n${rec.phone ? `Telefoon: ${rec.phone}\n` : ""}Voorkeur: ${when}\n${rec.note ? `\nOpmerking:\n${rec.note}\n` : ""}\nReferentie: ${rec.id}`,
      html: mailShell(
        "Nieuwe demo-aanvraag",
        `<p style="margin:0 0 4px"><strong>${rec.company}</strong></p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${rec.firstName} ${rec.lastName} · ${rec.email}${
           rec.phone ? ` · ${rec.phone}` : ""
         }</p>
         <p style="margin:0 0 6px;font-size:15px;color:#17211C"><strong>Voorkeur:</strong> ${when}</p>
         ${rec.note ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${rec.note.replace(/</g, "&lt;")}</p>` : ""}
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${rec.id}</p>`,
      ),
    }).catch((e) => logger.warn("demo notify failed", { error: (e as Error).message }));

    await sendMail({
      to: rec.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: "demo-aanvraag-bevestiging",
      subject: "Je demo-aanvraag bij ZekerFlex",
      text: `Hoi ${rec.firstName},\n\nBedankt voor je demo-aanvraag. Je voorkeur staat genoteerd voor ${when}. We bevestigen de afspraak binnen één werkdag per e-mail, met een videolink.\n\nZet de afspraak alvast in je agenda: ${base}/api/demo/${rec.id}/ics\n\nTot snel!`,
      html: mailShell(
        "Demo-aanvraag ontvangen",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${rec.firstName}, bedankt voor je demo-aanvraag. Je voorkeur staat genoteerd voor <strong>${when}</strong>. We bevestigen de afspraak binnen één werkdag per e-mail, met een videolink.</p>
         <p style="margin:0 0 4px">${mailButton(`${base}/api/demo/${rec.id}/ics`, "Zet in je agenda")}</p>`,
      ),
    }).catch(() => undefined);

    logger.info("demo request received", { id: rec.id, date: rec.date, time: rec.time });
    return NextResponse.json({ ok: true, id: rec.id, when });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("demo request failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
