import Link from "next/link";
import { PageHeader, KpiCard, Panel, EmptyState, StatusPill, dateTime, moneyExact } from "@/components/app/ui";
import { BureauTabs, BureauMeldingen, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { AanvraagKnoppen } from "@/components/werkgever/uitzend/AanvraagKnoppen";
import { aanvragenVan, bureauContext, leesBureauStand, type AanvraagRij } from "@/lib/uitzend/bureau";
import { STAP_LABEL, bureauMeldingen, isOpen } from "@/lib/uitzend/bureau-kern";
import { TERMIJN } from "@/lib/uitzend/voorwaarden";

export const dynamic = "force-dynamic";

// /werkgever/uitzend — Aanvragen (21 nov 2026): elke werker die zich aanmeldde voor een dienst van de uitzendpartner. Het
// bureau belt, neemt aan op zijn eigen uitzendcontract en plant in ("Contract rond"), of wijst af. De reactietermijn komt uit
// de partnervoorwaarden (TERMIJN.reactieWerkdagen).

const TOON: Record<AanvraagRij["stap"], "ok" | "warn" | "crit" | "neutral"> = {
  nieuw: "warn",
  gebeld: "neutral",
  ingepland: "ok",
  afgewezen: "neutral",
  ingetrokken: "neutral",
  verlopen: "neutral",
};

function Rij({ a }: { a: AanvraagRij }) {
  const open = isOpen(a.stap);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{a.werker.naam}</p>
          {a.werker.idGecontroleerd && <StatusPill tone="ok">ID gecontroleerd</StatusPill>}
          <StatusPill tone={a.teLaat ? "crit" : TOON[a.stap]}>{a.teLaat ? `Wacht al ${a.werkdagen} werkdagen` : STAP_LABEL[a.stap]}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-neutralx-700">
          <Link href={`/werkgever/diensten/${a.klus.id}`} className="font-medium text-brand-600 underline">
            {a.klus.titel}
          </Link>{" "}
          · {dateTime(a.klus.startsAt)} · {a.klus.locatie} · {moneyExact(a.klus.uurloonCents)} per uur
        </p>
        <p className="mt-1 text-xs text-neutralx-500">Aangemeld op {dateTime(a.at)}</p>
        {(a.werker.telefoon || a.werker.email) && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {a.werker.telefoon && (
              <a href={`tel:${a.werker.telefoon.replace(/\s+/g, "")}`} className="font-medium text-brand-600 underline">
                Bel {a.werker.telefoon}
              </a>
            )}
            {a.werker.email && (
              <a href={`mailto:${a.werker.email}`} className="font-medium text-brand-600 underline">
                {a.werker.email}
              </a>
            )}
          </p>
        )}
      </div>
      {open && <AanvraagKnoppen offerId={a.offerId} gebeld={a.stap === "gebeld"} naam={a.werker.naam} />}
    </li>
  );
}

export default async function UitzendAanvragenPage() {
  const ctx = await bureauContext();
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow="Uitzendbureau" title="Aanvragen" />
        <GeenUitzendPartner />
      </>
    );
  }
  const nu = new Date();
  const [aanvragen, stand] = await Promise.all([aanvragenVan(ctx, nu), leesBureauStand(ctx.tenantId)]);
  const open = aanvragen.filter((a) => isOpen(a.stap));
  const eerder = aanvragen.filter((a) => !isOpen(a.stap)).slice(0, 100);
  const teLaat = open.filter((a) => a.teLaat).length;
  const dertigDagen = nu.getTime() - 30 * 864e5;
  const ingepland = aanvragen.filter((a) => a.stap === "ingepland" && new Date(a.at).getTime() >= dertigDagen).length;

  return (
    <>
      <BureauTabs actief="aanvragen" />
      <PageHeader
        eyebrow="Uitzendbureau"
        title="Aanvragen"
        subtitle={`Werkers die zich aanmeldden voor je diensten. Bel ze, neem ze aan op je eigen uitzendcontract en plan ze in. Reageer binnen ${TERMIJN.reactieWerkdagen} werkdagen.`}
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            Dienst plaatsen
          </Link>
        }
      />
      <BureauMeldingen meldingen={bureauMeldingen(stand.gegevens, nu)} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Open aanvragen" value={String(open.length)} tone={open.length > 0 ? "brand" : "default"} />
        <KpiCard label={`Langer dan ${TERMIJN.reactieWerkdagen} werkdagen`} value={String(teLaat)} tone={teLaat > 0 ? "crit" : "default"} hint="nog niet gebeld" />
        <KpiCard label="Ingepland (30 dagen)" value={String(ingepland)} />
      </div>
      <div className="space-y-6">
        <Panel title="Open" subtitle="De oudste aanvraag staat bovenaan">
          {open.length === 0 ? (
            <EmptyState title="Geen open aanvragen" body="Zodra een werker zich aanmeldt voor een van je diensten, staat hij hier. Je krijgt ook een mail." />
          ) : (
            <ul className="divide-y divide-hair">
              {open.map((a) => (
                <Rij key={a.offerId} a={a} />
              ))}
            </ul>
          )}
        </Panel>
        {eerder.length > 0 && (
          <Panel title="Eerder" subtitle="Ingepland, afgewezen, ingetrokken of verlopen">
            <ul className="divide-y divide-hair">
              {eerder.map((a) => (
                <Rij key={a.offerId} a={a} />
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
