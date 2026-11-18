import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { sendMail } from "@/lib/mail";
import { kvGet } from "@/lib/storage/kv";
import { zonderAdressen } from "@/lib/mail/log-domein";
import { getCampaign } from "@/lib/sales/campaign";
import { PROEF_INVULLING, beoordeelCampagneTekst, knopVan, maakCampagneMail } from "@/lib/sales/campagne-tekst";
import { leesCampagneTekst } from "@/lib/sales/campagne-tekst-opslag";
import { bouwOutreachMail } from "@/lib/sales/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Sales → campagne → "Stuur een voorbeeld naar mij". Stuurt de bewaarde campagnemail zoals een bedrijf hem
// krijgt (zelfde opbouw en knop, lib/sales/send.ts), ingevuld met voorbeeldwaarden, naar de beheerder zelf.
// Het is geen benadering van een bedrijf: er komt geen lead en geen concept bij, de onderdrukkingslijst van de
// verkoop wordt niet geraadpleegd (die houdt bestaande klanten tegen, en de beheerder is er zelf een) en de soort is
// "sales-test", zodat de mail in geen enkele telling of dagcap meeloopt.

const paramsSchema = z.object({ id: z.string().min(1).max(128) });
const Invoer = z.object({ aan: z.string().trim().max(254).optional() });

/**
 * Naast het eigen adres van de beheerder: adressen van de eigenaar zelf waar het voorbeeld ook heen mag (zijn privéadres).
 * Ze staan in de opslag en niet in de code, zodat een privéadres nooit in git komt. Hooguit drie.
 */
const KV_EIGEN_ADRESSEN = "sales:voorbeeld-adressen";
async function eigenAdressen(): Promise<string[]> {
  const lijst = await kvGet<unknown>(KV_EIGEN_ADRESSEN).catch(() => null);
  if (!Array.isArray(lijst)) return [];
  return lijst.filter((a): a is string => typeof a === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)).map((a) => a.toLowerCase()).slice(0, 3);
}

const VOORVOEGSEL = "[Voorbeeld] ";

export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const invoer = Invoer.safeParse(await request.json().catch(() => ({})));
  if (!invoer.success) throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");

  const eigen = principal.email.trim().toLowerCase();
  const extra = await eigenAdressen();
  // zonder opgegeven adres: het eerste adres dat de eigenaar zelf heeft vastgelegd, anders dat van zijn account
  const aan = (invoer.data.aan ?? "").toLowerCase() || extra[0] || eigen;
  if (aan !== eigen && !extra.includes(aan)) {
    throw AppError.validation("Een voorbeeld kan alleen naar je eigen adres.");
  }

  const campaign = await getCampaign(id);
  const tekst = await leesCampagneTekst(id);
  if (!tekst) throw AppError.validation("Deze campagne heeft nog geen vaste tekst. Bewaar eerst de mail.");
  // de tekst is bij het bewaren gecontroleerd; een rij die daarna is aangepast, sturen we niet
  const oordeel = beoordeelCampagneTekst(tekst);
  if (!oordeel.goed) throw AppError.validation(`De bewaarde tekst klopt niet meer: ${oordeel.redenen[0] ?? "bewaar hem opnieuw"}`);

  const mail = maakCampagneMail(tekst, PROEF_INVULLING);
  const onderwerp = `${VOORVOEGSEL}${mail.subject}`;
  const { text, html } = bouwOutreachMail({
    companyName: PROEF_INVULLING.bedrijf,
    subject: onderwerp,
    body: mail.body,
    knop: knopVan(tekst, env.APP_BASE_URL),
    naschrift: "Dit is een voorbeeld voor jezelf. In de echte mail staat hier ook de regel waarmee een bedrijf zich kan afmelden.",
  });

  const uitslag = await sendMail({
    to: aan,
    subject: onderwerp,
    text,
    html,
    kind: "sales-test",
    from: campaign.fromAddress?.trim() || env.MAIL_SALES_FROM,
    replyTo: env.MAIL_SALES_FROM,
  });

  await recordAudit({
    category: "SALES",
    action: "sales.campaign.voorbeeldmail",
    actorUserId: principal.userId,
    summary: `Voorbeeldmail van campagne "${campaign.name}" naar de beheerder gestuurd`,
    targetType: "salesCampaign",
    targetId: id,
    metadata: { bezorgd: uitslag.delivered, transport: uitslag.transport, eigenAdres: aan === eigen },
  });

  // een echte fout van de mailserver: eerlijk melden (transport "mailbox" = testadres of geen mailserver: de mail staat in Beheer → Mail)
  if (!uitslag.delivered && uitslag.transport === "smtp") {
    return NextResponse.json({
      ok: false,
      aan,
      melding: `De mailserver nam de mail niet aan: ${zonderAdressen(uitslag.error).slice(0, 200) || "onbekende fout"}`,
    });
  }
  return NextResponse.json({ ok: true, aan, bezorgd: uitslag.delivered, inPostbus: uitslag.transport === "mailbox" });
});
