import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { WEBSITE_PLANS } from "@/lib/website/manage";
import { acceptSchema, acceptWebsiteProposal, isProposalId } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/websitevoorstel/<id>/akkoord — public: the company says yes to its
// website proposal (the id in the link is the secret). Claims a launch place if
// there is one left and tells our own team; the person who filled it in gets a
// confirmation. Nothing is bought or paid here: a person from ZekerFlex calls.
// ---------------------------------------------------------------------------

const DOMAIN_LABEL = { houden: "domein houden bij de huidige provider en naar ZekerFlex laten wijzen", verhuizen: "domein naar ZekerFlex verhuizen", geen: "nog geen domein", "weet-niet": "weet het nog niet" } as const;
const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const isReservedTestEmail = (email: string) => /\.(test|example|invalid|localhost)$/i.test(email.trim());

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!isProposalId(id)) throw AppError.notFound("Dit voorstel bestaat niet.");
    await enforceRateLimit({ name: "websitevoorstel-akkoord", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel pogingen. Probeer het later opnieuw." });
    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    // the hidden field people never fill in
    if (typeof json?.website === "string" && json.website) return NextResponse.json({ ok: true });
    const parsed = acceptSchema.safeParse(json);
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer je gegevens.", parsed.error.flatten());
    const d = parsed.data;
    const { proposal: p, nieuw } = await acceptWebsiteProposal(id, d);
    const a = p.akkoord;
    // a repeat of an earlier "ja" (double click, back button) sends nothing again
    if (a && nieuw && !isReservedTestEmail(d.email)) {
      const base = env.APP_BASE_URL.replace(/\/+$/, "");
      const plan = WEBSITE_PLANS[a.pakket];
      const prijs = a.prijs.kortingPct ? `${euro(a.prijs.teBetalenCents)} in plaats van ${euro(a.prijs.websiteCents)} (introductieplek ${a.plek})` : euro(a.prijs.websiteCents);
      await sendMail({
        to: CONTACTS.sales,
        replyTo: d.email,
        kind: "websitevoorstel-akkoord",
        subject: `Ja op het websitevoorstel: ${p.bedrijf} (${plan.label})`,
        text: `${p.bedrijf} wil de nieuwe website.\n\nNaam: ${a.naam}\nE-mail: ${a.email}\n${a.telefoon ? `Telefoon: ${a.telefoon}\n` : ""}Pakket: Website-beheer ${plan.label} (${euro(a.prijs.maandCents)} per maand)\nWebsite: ${prijs}\nDomein: ${DOMAIN_LABEL[a.domein]}\n${a.opmerking ? `Opmerking: ${a.opmerking}\n` : ""}\nHuidige site: ${p.host} (score ${p.check.score}/100)\nNieuwe site: ${base}/site/${p.slug}\nVoorstel: ${base}/admin/websitevoorstellen`,
      }).catch((e) => logger.warn("proposal accept notify failed", { error: (e as Error).message }));
      await sendMail({
        to: d.email,
        from: env.MAIL_FROM,
        replyTo: CONTACTS.sales,
        kind: "websitevoorstel-bevestiging",
        subject: `Je nieuwe website voor ${p.bedrijf}`,
        text: `Hoi ${a.naam},\n\nBedankt voor je ja op het websitevoorstel voor ${p.bedrijf}. We nemen binnen één werkdag contact met je op om alles door te nemen. Er is nog niets betaald of afgesloten.\n\nJe keuze: Website-beheer ${plan.label} (${euro(a.prijs.maandCents)} per maand, exclusief btw) en de website voor ${prijs}, exclusief btw.\n\nGroet,\nZekerFlex`,
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, plek: a?.plek ?? null, kortingPct: a?.prijs.kortingPct ?? 0 });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("website proposal accept failed", { error: (err as Error).message });
    return res;
  }
}
