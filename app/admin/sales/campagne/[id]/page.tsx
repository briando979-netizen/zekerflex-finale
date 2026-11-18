import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { count, dateNl, dateTimeNl } from "@/lib/admin/format";
import { Empty, KpiStrip, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { CampagneMailFormulier } from "@/components/admin/sales/CampagneMailFormulier";
import { CampagneConcepten, type ConceptDto } from "@/components/admin/sales/CampagneConcepten";
import { CAMPAGNE_TEKST_MODEL } from "@/lib/sales/campagne-tekst";
import { leesCampagneTekst } from "@/lib/sales/campagne-tekst-opslag";
import { GRATIS_DAGEN } from "@/lib/introducties/regels";
import { binnenVrijePeriode, laatsteGratisDag } from "@/lib/introducties/periode";
import { PARTNERDEAL_DAGEN, lijstPartnerdeal } from "@/lib/billing/partnerdeal-vrij";
import { PartnerdealGratis, type GratisRij } from "@/components/admin/sales/PartnerdealGratis";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";

export const dynamic = "force-dynamic";

// De eigen ruimte van één campagne (18 nov 2026): de vaste mail schrijven en als voorbeeld naar jezelf sturen, de
// concepten die op jou wachten versturen of weggooien, en in gewone woorden hoe de gratis periode werkt.
// Bereikbaar via "Open de ruimte" op elke campagnekaart in Beheer → Sales → Campagnes.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Concept", tone: "neutral" },
  ACTIVE: { label: "Actief", tone: "ok" },
  PAUSED: { label: "Gepauzeerd", tone: "warn" },
  DONE: { label: "Afgerond", tone: "neutral" },
};

export default async function CampagneRuimtePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De campagnes zijn alleen voor platformbeheerders." />;
  }

  const campaign = await prisma.salesCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) {
    return (
      <div className="space-y-4">
        <PageHead title="Campagne niet gevonden" subtitle="Deze campagne bestaat niet (meer)." />
        <Panel>
          <Empty title="Niets te zien" body="Ga terug naar de campagnes en kies er een uit de lijst." action={<Link href="/admin/sales?weergave=campagnes" className="a-button">Naar de campagnes</Link>} />
        </Panel>
      </div>
    );
  }

  const [tekst, leads, metAdres, geantwoord, perStatus, wachtend] = await Promise.all([
    leesCampagneTekst(campaign.id),
    prisma.salesLead.count({ where: { campaignId: campaign.id } }),
    prisma.salesLead.count({ where: { campaignId: campaign.id, OR: [{ contactEmail: { not: null } }, { discoveredEmail: { not: null } }] } }),
    prisma.salesLead.count({ where: { campaignId: campaign.id, repliedAt: { not: null } } }),
    prisma.salesOutreach.groupBy({ by: ["status"], where: { lead: { campaignId: campaign.id } }, _count: { _all: true } }),
    prisma.salesOutreach.findMany({
      where: { status: { in: ["DRAFT", "APPROVED"] }, lead: { campaignId: campaign.id } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        status: true,
        subject: true,
        body: true,
        generatedByModel: true,
        editedByHuman: true,
        lead: { select: { companyName: true, contactEmail: true, discoveredEmail: true } },
      },
    }),
  ]);

  const aantal = (status: string): number => perStatus.find((r) => r.status === status)?._count._all ?? 0;
  const wacht = aantal("DRAFT") + aantal("APPROVED");
  const verstuurd = aantal("SENT");
  const mislukt = aantal("FAILED");

  const concepten: ConceptDto[] = wachtend.map((o) => ({
    id: o.id,
    status: o.status,
    bedrijf: o.lead.companyName,
    aan: o.lead.contactEmail || o.lead.discoveredEmail || null,
    onderwerp: o.subject,
    tekst: o.body,
    vasteTekst: o.generatedByModel === CAMPAGNE_TEKST_MODEL,
    bewerkt: o.editedByHuman,
  }));

  const status = STATUS[campaign.status] ?? { label: campaign.status, tone: "neutral" as Tone };
  // "Automatisch" is alleen waar als de campagne zo staat, de eigenaar het bevestigde én de hoofdschakelaar aan staat
  const automatisch = campaign.mode === "AUTOPILOT" && env.SALES_AUTOPILOT_ENABLED && Boolean(campaign.autopilotConfirmedAt);
  const fee = (BASE_FEE_PER_HOUR_CENTS / 100).toFixed(2).replace(".", ",");
  const belooftMaand = tekst ? /maand/i.test(`${tekst.onderwerp} ${tekst.tekst}`) : false;
  // de bedrijven met de gratis maand; de dag is een Amsterdamse dag ("JJJJ-MM-DD"), 12:00 UTC valt altijd op die dag
  const nu = new Date();
  const gratisRijen: GratisRij[] = (await lijstPartnerdeal()).map((d) => ({
    tenantId: d.tenantId,
    bedrijf: d.bedrijf,
    tot: `t/m ${dateNl(`${laatsteGratisDag(d)}T12:00:00Z`)}`,
    loopt: binnenVrijePeriode(d, nu),
  }));

  return (
    <div className="space-y-4">
      <PageHead
        title={campaign.name}
        subtitle={
          automatisch
            ? "Deze campagne verstuurt zelf mails, binnen de grens per dag en de verzendtijden."
            : "Jij keurt goed: de motor zet concepten klaar en er gaat pas een mail weg als jij op Verstuur nu klikt."
        }
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone={automatisch ? "warn" : "neutral"}>{automatisch ? "Verstuurt zelf" : "Jij keurt goed"}</Pill>
            <Pill tone={tekst ? "ok" : "neutral"}>{tekst ? "Vaste tekst" : "Computer schrijft per bedrijf"}</Pill>
          </span>
        }
        actions={<Link href="/admin/sales?weergave=campagnes" className="a-button">Alle campagnes</Link>}
      />

      <KpiStrip
        items={[
          { label: "Bedrijven", value: count(leads), hint: "leads in deze campagne" },
          { label: "Met mailadres", value: count(metAdres), hint: leads > 0 ? `${Math.round((metAdres / leads) * 100)}% van de bedrijven` : "nog geen bedrijven" },
          { label: "Wacht op jou", value: count(wacht), hint: "concepten om te versturen of weg te gooien", ...(wacht > 0 ? { tone: "warn" as const } : {}) },
          { label: "Verstuurd", value: count(verstuurd), hint: mislukt > 0 ? `${count(mislukt)} niet aangekomen` : "mails die echt weg zijn", ...(mislukt > 0 ? { tone: "crit" as const } : {}) },
          { label: "Geantwoord", value: count(geantwoord), hint: "bedrijven die terugmailden", ...(geantwoord > 0 ? { tone: "ok" as const } : {}) },
        ]}
      />

      <Panel
        title="De mail"
        subtitle={tekst ? `Laatst bewaard ${dateTimeNl(tekst.bijgewerkt)}${tekst.door ? ` door ${tekst.door}` : ""}` : "Eén vaste tekst voor elk bedrijf in deze campagne"}
      >
        <CampagneMailFormulier campaignId={campaign.id} begin={tekst} beheerderEmail={principal.email} />
      </Panel>

      <Panel
        title="Wacht op jou"
        subtitle={wacht > concepten.length ? `De oudste ${concepten.length} van ${count(wacht)} concepten` : "Concepten van deze campagne die nog niet verstuurd zijn"}
      >
        <CampagneConcepten concepten={concepten} />
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          Gooi je een eerste mail weg, dan zet de motor bij de volgende ronde een nieuw concept voor dat bedrijf klaar. Wil je een bedrijf helemaal niet mailen, zet het dan op het bord van Sales in de kolom Verloren.
        </p>
      </Panel>

      <Panel title="Zo werkt de gratis maand" subtitle="Wat er gebeurt als een bedrijf ja zegt">
        <div className="space-y-3 text-[0.8125rem] leading-relaxed" style={{ color: "var(--a-dim)" }}>
          <p>
            Platformkosten zijn het bedrag dat een bedrijf per gewerkt uur aan ZekerFlex betaalt: normaal € {fee}. In de gratis periode rekent het platform dat bedrag niet. Het bedrijf betaalt dan alleen het uurtarief van de kracht.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Het bedrijf maakt een account aan (de knop in de mail) of antwoordt op de mail.</li>
            <li>
              Vul hieronder het e-mailadres in waarmee het bedrijf zich heeft aangemeld en druk op de knop. Vanaf vandaag rekent het platform <strong>{PARTNERDEAL_DAGEN} dagen</strong> geen platformkosten. Dat stopt vanzelf; je hoeft niets terug te zetten. Een bedrijf krijgt de gratis maand één keer.
            </li>
            <li>Zet het bedrijf daarna als partner op de site. Dat doe je nu nog met de hand; vraag het bedrijf eerst of zijn naam genoemd mag worden.</li>
          </ol>
          <p>
            Is een bedrijf door een werker of een ander bedrijf voorgesteld, dan gebruik je <Link href="/admin/sales?weergave=introducties" className="underline">Beheer → Sales → Introducties</Link>: dat geeft {GRATIS_DAGEN} dagen. De twee tellen niet bij elkaar op.
          </p>
          {belooftMaand ? null : (
            <p className="rounded-lg px-4 py-2.5" style={{ background: "var(--a-warn-soft)", color: "var(--a-text)", boxShadow: "inset 3px 0 0 var(--a-warn)" }}>
              Je mail noemt geen maand. Het platform geeft {PARTNERDEAL_DAGEN} dagen; zeg dat erbij als je het aanbod noemt.
            </p>
          )}
          <PartnerdealGratis rijen={gratisRijen} dagen={PARTNERDEAL_DAGEN} />
        </div>
      </Panel>
    </div>
  );
}
