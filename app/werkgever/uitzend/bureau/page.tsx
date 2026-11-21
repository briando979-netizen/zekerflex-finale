import Link from "next/link";
import { hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel } from "@/components/app/ui";
import { BureauTabs, BureauMeldingen, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { BureauGegevensForm } from "@/components/werkgever/uitzend/BureauGegevensForm";
import { bureauContext, leesBureauStand } from "@/lib/uitzend/bureau";
import { bureauMeldingen } from "@/lib/uitzend/bureau-kern";
import { PARTNER_VOORWAARDEN_PAD, PARTNER_VOORWAARDEN_VERSIE } from "@/lib/uitzend/voorwaarden";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/bureau — Bureaugegevens (21 nov 2026): wat artikel 3 van de partnervoorwaarden vraagt (registratie als
// uitlener, SNA-keurmerk of Wtta-toelating, cao, verzekering, loonheffingennummer) en het akkoord op de voorwaarden. Het
// dashboard waarschuwt 30 dagen voordat het keurmerk of de verzekering verloopt (bureauMeldingen).

export default async function UitzendBureauPage() {
  const ctx = await bureauContext();
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow="Uitzendbureau" title="Bureaugegevens" />
        <GeenUitzendPartner />
      </>
    );
  }
  const [stand, tenant] = await Promise.all([
    leesBureauStand(ctx.tenantId),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, kvkNumber: true } }),
  ]);
  const meldingen = bureauMeldingen(stand.gegevens, new Date());
  const magWijzigen = hasRole(ctx.principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const sinds = new Date(ctx.partnerSinds).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

  return (
    <>
      <BureauTabs actief="bureau" />
      <PageHeader
        eyebrow="Uitzendbureau"
        title="Bureaugegevens"
        subtitle={`${tenant?.name ?? "Je bureau"} is uitzendpartner sinds ${sinds}${tenant?.kvkNumber ? ` · KVK ${tenant.kvkNumber}` : ""}. Houd deze gegevens actueel: we waarschuwen je 30 dagen voordat iets verloopt.`}
      />
      <BureauMeldingen meldingen={meldingen} metLink={false} />
      <Panel title="Toelating en verzekering" subtitle={`Zoals artikel 3 van de partnervoorwaarden (versie ${PARTNER_VOORWAARDEN_VERSIE}) vraagt`}>
        <div className="p-5">
          {magWijzigen ? (
            <BureauGegevensForm begin={stand.gegevens} versie={PARTNER_VOORWAARDEN_VERSIE} voorwaardenPad={PARTNER_VOORWAARDEN_PAD} />
          ) : (
            <p className="text-sm text-neutralx-600">Alleen de hoofdbeheerder van je bureau kan deze gegevens wijzigen.</p>
          )}
        </div>
      </Panel>
      <p className="mt-4 text-sm text-neutralx-500">
        Lees de{" "}
        <Link href={PARTNER_VOORWAARDEN_PAD} className="text-brand-600 underline" target="_blank">
          partnervoorwaarden voor uitzendbureaus
        </Link>
        . De factuur voor de platformvergoeding staat bij{" "}
        <Link href="/werkgever/facturen" className="text-brand-600 underline">
          Facturen
        </Link>
        .
      </p>
    </>
  );
}
