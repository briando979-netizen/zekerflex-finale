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
import { createLead } from "@/lib/sales/leads";
import { recordServerEvent } from "@/lib/analytics/track";
import { cijfer } from "@/lib/review-scan/model";
import { getReviewScan, markScanLead } from "@/lib/review-scan/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  scanId: z.string().regex(/^[a-f0-9]{16}$/),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  consent: z.literal(true),
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// POST /api/review-scan/lead — het bedrijf wil hulp bij zijn reviews. Wordt een
// warme lead in de sales-pijplijn, met het rapport erbij.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "review-scan-lead", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanvragen. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    const d = parsed.data;
    const scan = await getReviewScan(d.scanId);
    if (!scan) throw AppError.validation("Dit rapport bestaat niet meer. Doe de scan opnieuw.");

    const base = env.APP_BASE_URL.replace(/\/+$/, "");
    const rapportUrl = `${base}/review-check?r=${scan.id}`;
    const score = scan.rating === null ? "nog geen Google-score" : `${cijfer(scan.rating)} uit ${scan.aantal} reviews`;
    const samenvatting = `Review-scan ${scan.bedrijf.naam}: ${scan.score}/100 (${scan.oordeel}), ${score}${scan.positie ? `, plek ${scan.positie.plek} van ${scan.positie.van} in de buurt` : ""}.`;
    const lead = await createLead({
      companyName: scan.bedrijf.naam,
      contactName: d.name,
      contactEmail: d.email,
      contactPhone: d.phone || undefined,
      source: "review-scan",
      sourceUrl: scan.bedrijf.website ?? scan.bedrijf.mapsUrl ?? undefined,
      notes: `${samenvatting} Voorstellen: ${scan.voorstellen.slice(0, 4).map((v) => v.titel).join("; ") || "geen"}. Rapport: ${rapportUrl}`.slice(0, 900),
      createdById: null,
    });
    await markScanLead(scan.id, lead.id).catch(() => undefined);
    void recordServerEvent({ path: "/review-check", label: "review-scan-lead", meta: { score: scan.score } });

    await sendMail({
      to: CONTACTS.sales,
      replyTo: d.email,
      kind: "review-scan-lead",
      subject: `Review-scan: ${scan.bedrijf.naam} wil hulp met reviews`,
      text: `${samenvatting}\n\nNaam: ${d.name}\nE-mail: ${d.email}\n${d.phone ? `Telefoon: ${d.phone}\n` : ""}\nVoorstellen:\n${scan.voorstellen.map((v) => `- ${v.titel}`).join("\n") || "- geen"}\n\nRapport: ${rapportUrl}`,
      html: mailShell(
        "Review-scan: aanvraag voor hulp",
        `<p style="margin:0 0 4px"><strong>${esc(scan.bedrijf.naam)}</strong> · ${scan.score}/100 · ${esc(score)}</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${esc(d.name)} · ${esc(d.email)}${d.phone ? ` · ${esc(d.phone)}` : ""}</p>
         <ul style="margin:8px 0 12px;padding-left:18px;font-size:14px;color:#3C4A42">${scan.voorstellen.slice(0, 6).map((v) => `<li style="margin:0 0 4px">${esc(v.titel)}</li>`).join("")}</ul>
         <p style="margin:0">${mailButton(rapportUrl, "Bekijk het rapport")}</p>`,
      ),
    }).catch((e) => logger.warn("review-scan lead melding mislukt", { error: (e as Error).message }));

    await sendMail({
      to: d.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: "review-scan-bevestiging",
      subject: `Je review-scan van ${scan.bedrijf.naam}`,
      text: `Hoi ${d.name},\n\nBedankt! We nemen binnen één werkdag contact met je op over je reviews.\n\nJe rapport (${scan.score}/100) vind je hier altijd terug: ${rapportUrl}\n\nGroet,\nZekerFlex`,
      html: mailShell(
        "We helpen je aan betere reviews",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(d.name)}, bedankt! We nemen binnen één werkdag contact met je op over de reviews van <strong>${esc(scan.bedrijf.naam)}</strong> (score ${scan.score}/100).</p>
         <p style="margin:0 0 4px">${mailButton(rapportUrl, "Bekijk je rapport")}</p>`,
      ),
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("review-scan lead mislukt", { error: (err as Error).message });
    return res;
  }
}
