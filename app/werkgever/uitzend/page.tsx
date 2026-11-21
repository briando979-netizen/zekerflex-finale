import Link from "next/link";
import { PageHeader, KpiCard, Panel, EmptyState, StatusPill, dateTime, moneyExact } from "@/components/app/ui";
import { BureauTabs, BureauMeldingen, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { AanvraagKnoppen } from "@/components/werkgever/uitzend/AanvraagKnoppen";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { getDict } from "@/lib/i18n/server";
import { aanvragenVan, bureauContext, leesBureauStand, type AanvraagRij } from "@/lib/uitzend/bureau";
import { bureauMeldingen, isOpen } from "@/lib/uitzend/bureau-kern";
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

function Rij({ a, u }: { a: AanvraagRij; u: Dict["uitzendBureau"] }) {
  const open = isOpen(a.stap);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{a.werker.naam}</p>
          {a.werker.idGecontroleerd && <StatusPill tone="ok">{u.idGecontroleerd}</StatusPill>}
          <StatusPill tone={a.teLaat ? "crit" : TOON[a.stap]}>{a.teLaat ? fmt(u.aanvragen.wachtAl, { n: a.werkdagen }) : u.stap[a.stap]}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-neutralx-700">
          <Link href={`/werkgever/diensten/${a.klus.id}`} className="font-medium text-brand-600 underline">
            {a.klus.titel}
          </Link>{" "}
          · {dateTime(a.klus.startsAt)} · {a.klus.locatie} · {fmt(u.aanvragen.perUur, { bedrag: moneyExact(a.klus.uurloonCents) })}
        </p>
        <p className="mt-1 text-xs text-neutralx-500">{fmt(u.aanvragen.aangemeldOp, { datum: dateTime(a.at) })}</p>
        {(a.werker.telefoon || a.werker.email) && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {a.werker.telefoon && (
              <a href={`tel:${a.werker.telefoon.replace(/\s+/g, "")}`} className="font-medium text-brand-600 underline">
                {fmt(u.aanvragen.bel, { telefoon: a.werker.telefoon })}
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
  const [ctx, dict] = await Promise.all([bureauContext(), getDict()]);
  const u = dict.uitzendBureau;
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow={u.eyebrow} title={u.tabs.aanvragen} />
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
  const t = u.aanvragen;

  return (
    <>
      <BureauTabs actief="aanvragen" />
      <PageHeader
        eyebrow={u.eyebrow}
        title={u.tabs.aanvragen}
        subtitle={fmt(t.uitleg, { n: TERMIJN.reactieWerkdagen })}
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            {u.dienstPlaatsen}
          </Link>
        }
      />
      <BureauMeldingen meldingen={bureauMeldingen(stand.gegevens, nu)} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiOpen} value={String(open.length)} tone={open.length > 0 ? "brand" : "default"} />
        <KpiCard label={fmt(t.kpiTeLaat, { n: TERMIJN.reactieWerkdagen })} value={String(teLaat)} tone={teLaat > 0 ? "crit" : "default"} hint={t.kpiTeLaatHint} />
        <KpiCard label={t.kpiIngepland} value={String(ingepland)} />
      </div>
      <div className="space-y-6">
        <Panel title={t.openKop} subtitle={t.openUitleg}>
          {open.length === 0 ? (
            <EmptyState title={t.geenOpen} body={t.geenOpenUitleg} />
          ) : (
            <ul className="divide-y divide-hair">
              {open.map((a) => (
                <Rij key={a.offerId} a={a} u={u} />
              ))}
            </ul>
          )}
        </Panel>
        {eerder.length > 0 && (
          <Panel title={t.eerderKop} subtitle={t.eerderUitleg}>
            <ul className="divide-y divide-hair">
              {eerder.map((a) => (
                <Rij key={a.offerId} a={a} u={u} />
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
