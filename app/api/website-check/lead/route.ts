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
import { getWebsiteCheck, markCheckLead } from "@/lib/website-check/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  checkId: z.string().regex(/^[a-f0-9]{16}$/),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  plan: z.enum(["basis", "pro", "advies"]),
  consent: z.literal(true),
});

const PLAN_LABEL = { basis: "Website-beheer Basis", pro: "Website-beheer Pro", advies: "eerst advies" } as const;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// POST /api/website-check/lead — de bezoeker wil dat ZekerFlex de gevonden
// punten oplost. Wordt een warme lead in de sales-pijplijn, met het rapport erbij.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "website-check-lead",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanvragen. Probeer het later opnieuw.",
    });
    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    const d = parsed.data;

    const check = await getWebsiteCheck(d.checkId);
    if (!check) throw AppError.validation("Dit rapport bestaat niet meer. Doe de check opnieuw.");

    const problems = check.findings.filter((f) => f.status === "probleem");
    const attention = check.findings.filter((f) => f.status === "let-op");
    const base = env.APP_BASE_URL.replace(/\/+$/, "");
    const reportUrl = `${base}/website-check?r=${check.id}`;
    // de nieuwe website die ze zelf lieten maken (lib/website-check/nieuwe-site.ts), zodat sales hem meteen ziet
    const nieuw = check.nieuweSite ? ` Liet een nieuwe website maken: ${base}/site/${check.nieuweSite.slug}${check.nieuweSite.score !== null ? ` (${check.nieuweSite.score}/100)` : ""}.` : "";
    const summary = `Website-check ${check.host}: score ${check.score}/100, ${problems.length} problemen, ${attention.length} aandachtspunten${check.platform ? `, gemaakt met ${check.platform}` : ""}. Interesse: ${PLAN_LABEL[d.plan]}.${nieuw}`;

    const lead = await createLead({
      companyName: d.company || check.host,
      contactName: d.name,
      contactEmail: d.email,
      contactPhone: d.phone || undefined,
      source: "website-check",
      sourceUrl: check.finalUrl,
      notes: `${summary} Belangrijkste: ${problems.slice(0, 4).map((f) => f.title).join("; ") || "geen grote problemen"}. Rapport: ${reportUrl}`.slice(0, 900),
      createdById: null,
    });
    await markCheckLead(check.id, lead.id).catch(() => undefined);
    void recordServerEvent({ path: "/website-check", label: "website-check-lead", meta: { host: check.host, plan: d.plan } });

    const list = (items: typeof problems) => items.slice(0, 6).map((f) => `<li style="margin:0 0 4px">${esc(f.title)}</li>`).join("");
    await sendMail({
      to: CONTACTS.sales,
      replyTo: d.email,
      kind: "website-check-lead",
      subject: `Website-check: ${check.host} wil hulp (${PLAN_LABEL[d.plan]})`,
      text: `${summary}\n\nNaam: ${d.name}\nE-mail: ${d.email}\n${d.phone ? `Telefoon: ${d.phone}\n` : ""}${d.company ? `Bedrijf: ${d.company}\n` : ""}\nProblemen:\n${problems.map((f) => `- ${f.title}`).join("\n") || "- geen"}\n\nRapport: ${reportUrl}`,
      html: mailShell(
        "Website-check: aanvraag voor hulp",
        `<p style="margin:0 0 4px"><strong>${esc(check.host)}</strong> · score ${check.score}/100</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${esc(d.name)} · ${esc(d.email)}${d.phone ? ` · ${esc(d.phone)}` : ""}${d.company ? ` · ${esc(d.company)}` : ""}</p>
         <p style="margin:0 0 6px;font-size:14px;color:#17211C"><strong>Interesse:</strong> ${PLAN_LABEL[d.plan]}</p>
         ${problems.length ? `<ul style="margin:8px 0 12px;padding-left:18px;font-size:14px;color:#3C4A42">${list(problems)}</ul>` : ""}
         <p style="margin:0">${mailButton(reportUrl, "Bekijk het rapport")}</p>`,
      ),
    }).catch((e) => logger.warn("website-check lead notify failed", { error: (e as Error).message }));

    await sendMail({
      to: d.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: "website-check-bevestiging",
      subject: `Je website-check van ${check.host}`,
      text: `Hoi ${d.name},\n\nBedankt! We hebben je aanvraag ontvangen en nemen binnen één werkdag contact met je op over de punten uit je website-check.\n\nJe rapport (score ${check.score}/100) kun je hier altijd terugvinden: ${reportUrl}\n\nGroet,\nZekerFlex`,
      html: mailShell(
        "We gaan je website verbeteren",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(d.name)}, bedankt! We hebben je aanvraag ontvangen en nemen binnen één werkdag contact met je op over de punten uit je website-check van <strong>${esc(check.host)}</strong> (score ${check.score}/100).</p>
         <p style="margin:0 0 4px">${mailButton(reportUrl, "Bekijk je rapport")}</p>`,
      ),
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("website check lead failed", { error: (err as Error).message });
    return res;
  }
}
