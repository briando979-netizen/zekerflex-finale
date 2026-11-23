import Link from "next/link";
import { hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Panel } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { BureauTabs, BureauMeldingen, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { BureauGegevensForm } from "@/components/werkgever/uitzend/BureauGegevensForm";
import { fmt } from "@/lib/i18n/dictionaries";
import { getDict } from "@/lib/i18n/server";
import { bureauContext, leesBureauStand } from "@/lib/uitzend/bureau";
import { WAARSCHUW_DAGEN, bureauMeldingen } from "@/lib/uitzend/bureau-kern";
import { PARTNER_VOORWAARDEN_PAD, PARTNER_VOORWAARDEN_VERSIE } from "@/lib/uitzend/voorwaarden";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/bureau — Bureaugegevens (21 nov 2026): wat artikel 3 van de partnervoorwaarden vraagt (registratie als
// uitlener, SNA-keurmerk of Wtta-toelating, cao, verzekering, loonheffingennummer) en het akkoord op de voorwaarden. Het
// dashboard waarschuwt 30 dagen voordat het keurmerk of de verzekering verloopt (bureauMeldingen). De partnervoorwaarden
// zelf zijn juridische tekst en blijven Nederlands; alleen de tekst eromheen komt uit het woordenboek.

export default async function UitzendBureauPage() {
  const [ctx, dict] = await Promise.all([bureauContext(), getDict()]);
  const u = dict.uitzendBureau;
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PaginaKop eyebrow={u.eyebrow} title={u.tabs.bureau} />
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
  const sinds = new Date(ctx.partnerSinds).toLocaleDateString(u.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  const b = u.bureau;

  return (
    <>
      <BureauTabs actief="bureau" />
      <PaginaKop
        eyebrow={u.eyebrow}
        title={u.tabs.bureau}
        subtitle={fmt(b.uitleg, {
          naam: tenant?.name ?? b.jeBureau,
          datum: sinds,
          kvk: tenant?.kvkNumber ? fmt(b.kvk, { nummer: tenant.kvkNumber }) : "",
          dagen: WAARSCHUW_DAGEN,
        })}
      />
      <BureauMeldingen meldingen={meldingen} metLink={false} />
      <Panel title={b.panelKop} subtitle={fmt(b.panelUitleg, { versie: PARTNER_VOORWAARDEN_VERSIE })}>
        <div className="p-5">
          {magWijzigen ? (
            <BureauGegevensForm begin={stand.gegevens} versie={PARTNER_VOORWAARDEN_VERSIE} voorwaardenPad={PARTNER_VOORWAARDEN_PAD} />
          ) : (
            <p className="text-sm text-neutralx-600">{b.alleenHoofdbeheerder}</p>
          )}
        </div>
      </Panel>
      <p className="mt-4 text-sm text-neutralx-500">
        {b.voetLees}{" "}
        <Link href={PARTNER_VOORWAARDEN_PAD} className="text-brand-600 underline" target="_blank">
          {b.voetVoorwaarden}
        </Link>
        {b.voetFactuur}{" "}
        <Link href="/werkgever/facturen" className="text-brand-600 underline">
          {b.voetFacturen}
        </Link>
        .
      </p>
    </>
  );
}
