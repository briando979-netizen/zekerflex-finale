import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { escapeHtml, isReservedTestAddress, mailShell, sendMail } from "@/lib/mail";
import { meldGebeurtenis } from "@/lib/ops/melder";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordServerEvent } from "@/lib/analytics/track";
import { createLead } from "@/lib/sales/leads";
import { CONTACTS } from "@/lib/seo";
import { STARTERS_ONDERDELEN, valideerStarter } from "@/lib/starters/regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/starters: het formulier "Vertel wat je wilt starten" op /starters. Geen eigen opslag: de aanvraag wordt
// een lead in de bestaande sales-pijplijn (lib/sales/leads.ts, Admin → Sales), net als de website-check en de
// partneraanvraag, met een mail aan sales en een regel in de melder. Die twee gaan naar de eigenaar zelf en slaan we dus
// over bij een testadres (AGENTS.md). Begrensde body, grens per IP en per adres (429, nooit 403), verborgen lokveld.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gelezen = await jsonBegrensd(request, 8_000);
    if (!gelezen.ok) throw AppError.validation("Body moet JSON zijn");
    const lokveld = (gelezen.waarde as { website2?: unknown } | null)?.website2;
    // een robot vulde het lokveld: doen alsof het gelukt is, niets bewaren en niets melden
    if (typeof lokveld === "string" && lokveld.trim()) return NextResponse.json({ ok: true });
    const aanvraag = valideerStarter(gelezen.waarde);
    if (!aanvraag.ok) throw AppError.validation(aanvraag.fout, { veld: aanvraag.veld });
    const d = aanvraag.waarde;
    const teVaak = "Je hebt net al een paar aanvragen gestuurd. Probeer het later opnieuw.";
    await enforceRateLimit({ name: "starters-ip", identifier: clientIp(request), limit: 5, windowSeconds: 3600, message: teVaak });
    await enforceRateLimit({ name: "starters-adres", identifier: d.email.toLowerCase(), limit: 3, windowSeconds: 86_400, message: teVaak });

    const nodig = STARTERS_ONDERDELEN.filter((o) => d.nodig.includes(o.slug)).map((o) => o.naam.toLowerCase());
    const notities = `Starter via /starters. Wil: ${nodig.join(", ")}.${d.toelichting ? ` Toelichting: ${d.toelichting}` : ""}`.slice(0, 1400);
    await createLead({ companyName: d.idee, contactName: d.naam, contactEmail: d.email, contactPhone: d.telefoon, source: "starters", sourceUrl: "/starters", notes: notities, createdById: null });
    void recordServerEvent({ path: "/starters", label: "starters-aanvraag", meta: { aantal: d.nodig.length } });

    if (!isReservedTestAddress(d.email)) {
      void meldGebeurtenis({ soort: "marketing", titel: "Starter vroeg hulp aan", detail: `Wil: ${nodig.join(", ")}`, url: "/admin/sales" }).catch(() => undefined);
      await sendMail({
        to: CONTACTS.sales,
        replyTo: d.email,
        kind: "starters-aanvraag",
        subject: `Starter: ${d.idee}`,
        text: `Nieuwe aanvraag via /starters\n\nBedrijf of idee: ${d.idee}\nWil: ${nodig.join(", ")}\nNaam: ${d.naam}\nE-mail: ${d.email}\n${d.telefoon ? `Telefoon: ${d.telefoon}\n` : ""}${d.toelichting ? `\nToelichting:\n${d.toelichting}\n` : ""}`,
        html: mailShell(
          "Starter vroeg hulp aan",
          `<p style="margin:0 0 4px"><strong>${escapeHtml(d.idee)}</strong></p>
           <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${escapeHtml(d.naam)} · ${escapeHtml(d.email)}${d.telefoon ? ` · ${escapeHtml(d.telefoon)}` : ""}</p>
           <p style="margin:0 0 8px;font-size:14px;color:#17211C"><strong>Wil:</strong> ${escapeHtml(nodig.join(", "))}</p>
           ${d.toelichting ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${escapeHtml(d.toelichting)}</p>` : ""}`,
        ),
      }).catch((e) => logger.warn("starters: melding aan sales mislukt", { error: (e as Error).message }));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("starters: aanvraag mislukt", { error: (err as Error).message });
    return res;
  }
}
