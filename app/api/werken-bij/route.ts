import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail, mailShell } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { saveApplication, type StoredFile } from "@/lib/jobs/store";
import { JOB_SKILLS } from "@/lib/jobs/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "text/plain",
]);
const ALLOWED_EXT = /\.(pdf|docx?|jpe?g|png|txt)$/i;

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  motivationText: z.string().trim().max(8000).optional(),
  skills: z.array(z.string()).max(30).optional(),
  consent: z.literal("true"),
});

async function readFile(form: FormData, field: string, kind: StoredFile["kind"]): Promise<StoredFile | null> {
  const f = form.get(field);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > env.UPLOAD_MAX_BYTES) {
    throw AppError.validation(`Bestand te groot (max ${(env.UPLOAD_MAX_BYTES / 1_000_000).toFixed(0)} MB)`);
  }
  if (!ALLOWED.has(f.type) && !ALLOWED_EXT.test(f.name)) {
    throw AppError.validation("Alleen pdf, Word, jpg, png of txt toegestaan");
  }
  return {
    kind,
    filename: f.name || `${kind}.bin`,
    mimeType: f.type || "application/octet-stream",
    bytes: Buffer.from(await f.arrayBuffer()),
  };
}

// POST /api/werken-bij — public open application. Filesystem only, no DB/Redis.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });

    const parsed = schema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone") || undefined,
      motivationText: form.get("motivationText") || undefined,
      skills: form.getAll("skills").map(String),
      consent: form.get("consent"),
    });
    if (!parsed.success) {
      throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    }
    const data = parsed.data;

    const motivationFile = await readFile(form, "motivatiebrief", "motivatiebrief");
    const cvFile = await readFile(form, "cv", "cv");

    if (!data.motivationText && !motivationFile) {
      throw AppError.validation("Schrijf een motivatie of upload een motivatiebrief.");
    }

    const skills = (data.skills ?? []).filter((s) => JOB_SKILLS.includes(s)).slice(0, 30);
    const files = [motivationFile, cvFile].filter((f): f is StoredFile => f !== null);

    const app = await saveApplication(
      {
        name: data.name,
        email: data.email,
        ...(data.phone ? { phone: data.phone } : {}),
        skills,
        ...(data.motivationText ? { motivationText: data.motivationText } : {}),
      },
      files,
    );

    // notify the recruitment inbox
    const summary = [
      `Naam: ${app.name}`,
      `E-mail: ${app.email}`,
      app.phone ? `Telefoon: ${app.phone}` : null,
      skills.length ? `Interesse: ${skills.join(", ")}` : null,
      `Bijlagen: ${files.length ? files.map((f) => f.kind).join(", ") : "geen"}`,
      "",
      app.motivationText ? `Motivatie:\n${app.motivationText}` : "Motivatie: als bijlage",
    ]
      .filter(Boolean)
      .join("\n");

    await sendMail({
      to: CONTACTS.werkenbij,
      replyTo: app.email,
      kind: "open-sollicitatie",
      subject: `Open sollicitatie — ${app.name}`,
      text: `Nieuwe open sollicitatie via zekerflex.com/over-ons#werken-bij\n\n${summary}\n\nReferentie: ${app.id}`,
      html: mailShell(
        "Nieuwe open sollicitatie",
        `<pre style="white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#3C4A42">${summary
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre>
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${app.id} · bijlagen staan in storage/jobs.</p>`,
      ),
    }).catch((e) => logger.warn("open application notify failed", { error: (e as Error).message }));

    // confirmation to the applicant
    await sendMail({
      to: app.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.werkenbij,
      kind: "open-sollicitatie-bevestiging",
      subject: "We hebben je sollicitatie ontvangen",
      text: `Hoi ${app.name.split(" ")[0] || app.name},\n\nBedankt voor je open sollicitatie bij ZekerFlex. We nemen hem door en laten binnen twee weken van ons horen.\n\nJe gegevens en documenten bewaren we maximaal 6 maanden voor deze sollicitatie, tenzij je eerder vraagt ze te verwijderen (werkenbij@zekerflex.com).`,
      html: mailShell(
        "Sollicitatie ontvangen",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${
          app.name.split(" ")[0] || app.name
        }, bedankt voor je open sollicitatie bij ZekerFlex. We nemen hem door en laten binnen twee weken van ons horen.</p>
         <p style="margin:0;font-size:12px;color:#667469">Je gegevens en documenten bewaren we maximaal 6 maanden voor deze sollicitatie, tenzij je eerder vraagt ze te verwijderen (werkenbij@zekerflex.com).</p>`,
      ),
    }).catch(() => undefined);

    logger.info("open application received", { id: app.id, skills: skills.length, files: files.length });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("open application failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
