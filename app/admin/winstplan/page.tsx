import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { euro } from "@/lib/admin/format";
import { accountStand } from "@/lib/billing/stripe-betalen";
import { operationeleKosten } from "@/lib/admin/kosten-opslag";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { WEBSITE_PLANS } from "@/lib/website/manage";
import { gebiedenVan, isTestbedrijf, nodigVoorKosten, stapVanNu, winstStappen, type WinstStand } from "@/lib/admin/winstplan";

export const dynamic = "force-dynamic";

// Beheer → Geld → Weg naar winst (lib/admin/winstplan.ts). Alleen lezen. Elk getal is geteld op het moment dat de pagina
// opent; wat niet te meten is staat er als een streepje, nooit als een schatting.

const BETAALD_SHOP = ["RECEIVED", "CONFIRMED", "SHIPPED"] as const;
const DAGEN_30 = 30 * 24 * 60 * 60 * 1000;

async function leesStand(nu: Date) {
  const sinds = new Date(nu.getTime() - DAGEN_30);
  const [stripe, kosten, facturen30, facturenOoit, shop30, shopOoit, werkers, geverifieerd, tenants, urenstaten, websiteKlanten, postcodes] = await Promise.all([
    accountStand().catch(() => null),
    operationeleKosten().catch(() => null),
    prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: sinds } }, _sum: { totalCents: true } }),
    prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { totalCents: true } }),
    prisma.shopOrder.aggregate({ where: { status: { in: [...BETAALD_SHOP] }, createdAt: { gte: sinds } }, _sum: { totalCents: true } }),
    prisma.shopOrder.aggregate({ where: { status: { in: [...BETAALD_SHOP] } }, _sum: { totalCents: true } }),
    prisma.membership.count({ where: { role: "FREELANCER" } }),
    prisma.user.count({ where: { kycStatus: "VERIFIED" } }),
    prisma.tenant.findMany({ where: { type: { not: "PLATFORM" } }, select: { id: true, name: true } }),
    prisma.timesheet.count({ where: { status: "APPROVED" } }),
    prisma.managedWebsite.count({ where: { status: "ACTIVE" } }),
    prisma.freelancerProfile.findMany({ select: { homePostalCode: true } }),
  ]);
  const echt = tenants.filter((t) => !isTestbedrijf(t.name)).map((t) => t.id);
  const echteKlussen = echt.length ? await prisma.shift.count({ where: { branch: { tenantId: { in: echt } } } }) : 0;
  const stand: WinstStand = {
    betalen: stripe ? stripe.betalen : null,
    omzet30Cents: (facturen30._sum.totalCents ?? 0) + (shop30._sum.totalCents ?? 0),
    omzetOoitCents: (facturenOoit._sum.totalCents ?? 0) + (shopOoit._sum.totalCents ?? 0),
    kostenMaandCents: kosten && kosten.bron === "kosten" ? kosten.maandCent : null,
    werkers,
    werkersGeverifieerd: geverifieerd,
    bedrijven: echt.length,
    echteKlussen,
    urenstaten,
    websiteKlanten,
  };
  return { stand, waar: gebiedenVan(postcodes.map((p) => p.homePostalCode)) };
}

export default async function WinstplanPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Weg naar winst is alleen voor platformbeheerders." />;
  }
  const { stand: s, waar } = await leesStand(new Date());
  const stappen = winstStappen(s);
  const nu = stapVanNu(stappen);
  const websitePrijs = WEBSITE_PLANS.basis.priceCentsPerMonth;
  const nodig = nodigVoorKosten(s.kostenMaandCents, BASE_FEE_PER_HOUR_CENTS, websitePrijs);
  const resultaat = s.kostenMaandCents === null ? null : s.omzet30Cents - s.kostenMaandCents;

  return (
    <div className="space-y-4">
      <PageHead title="Weg naar winst" subtitle="Waar ZekerFlex staat op de weg naar de eerste betalende klant, wat er nodig is om de kosten te dekken, en wat de volgende stap is." />

      {nu ? (
        <Notice tone={nu.id === "betalen" ? "crit" : "warn"} role="status">
          De stap van nu: <strong>{nu.titel}</strong>. {nu.uitleg}{" "}
          <Link href={nu.href} className="underline">
            {nu.knop}
          </Link>
          .
        </Notice>
      ) : (
        <Notice tone="ok">Alle stappen zijn gezet: de omzet van de laatste 30 dagen dekt de vaste kosten.</Notice>
      )}

      <KpiStrip
        items={[
          { label: "Omzet, 30 dagen", value: euro(s.omzet30Cents), tone: "money", hint: "betaalde facturen en bestellingen", href: "/admin/financien" },
          { label: "Vaste kosten per maand", value: s.kostenMaandCents === null ? "—" : euro(s.kostenMaandCents), hint: s.kostenMaandCents === null ? "nog niet ingevuld bij Kosten" : "excl. btw, uit Kosten", href: "/admin/kosten" },
          { label: "Resultaat, 30 dagen", value: resultaat === null ? "—" : euro(resultaat), tone: resultaat === null ? "neutral" : resultaat >= 0 ? "ok" : "crit", hint: "omzet min vaste kosten" },
          { label: "Betalen", value: s.betalen === null ? "—" : s.betalen ? "Aan" : "Dicht", tone: s.betalen === false ? "crit" : s.betalen ? "ok" : "neutral", href: "/admin/te-doen" },
        ]}
      />

      <Panel title="Wat er nodig is om de kosten te dekken" subtitle="Per inkomstenlijn apart uitgerekend met de eigen tarieven; een van de twee is genoeg.">
        {nodig ? (
          <ul className="space-y-2 text-sm" style={{ color: "var(--a-text)" }}>
            <li>
              <strong>{nodig.uren} gewerkte uren per maand</strong> tegen {euro(BASE_FEE_PER_HOUR_CENTS)} platformkosten per uur. Nu: {s.urenstaten} goedgekeurde urenstaten in totaal.
            </li>
            <li>
              <strong>{nodig.websites} bedrijven met een website-abonnement</strong> van {euro(websitePrijs)} per maand. Nu: {s.websiteKlanten}.
            </li>
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>
            Vul eerst de vaste kosten in bij{" "}
            <Link href="/admin/kosten" className="underline">
              Kosten
            </Link>
            ; dan rekent deze pagina uit hoeveel uren of abonnementen nodig zijn.
          </p>
        )}
      </Panel>

      <Panel title="De stappen" subtitle="In volgorde. De eerste die open staat is de stap van nu.">
        <ol className="space-y-2">
          {stappen.map((x, i) => (
            <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl p-3" style={{ border: "1px solid var(--a-border)" }}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                  <span aria-hidden>{i + 1}.</span>
                  {x.titel}
                  <Pill tone={x.klaar ? "ok" : x.id === nu?.id ? "warn" : "neutral"}>{x.klaar ? "Klaar" : x.id === nu?.id ? "Nu" : "Daarna"}</Pill>
                  <Pill tone="neutral" dot={false}>
                    {x.wie === "jij" ? "Jij" : "ZekerFlex"}
                  </Pill>
                </p>
                <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
                  {x.uitleg}
                </p>
              </div>
              <Link href={x.href} className="a-btn a-btn-ghost flex-shrink-0">
                {x.knop}
              </Link>
            </li>
          ))}
        </ol>
      </Panel>

      <KpiStrip
        items={[
          { label: "Werkers", value: String(s.werkers), hint: `${s.werkersGeverifieerd} met een geverifieerd ID`, href: "/admin/gebruikers" },
          { label: "Bedrijven", value: String(s.bedrijven), hint: "zonder het eigen testbedrijf" },
          { label: "Echte klussen", value: String(s.echteKlussen), hint: "ooit geplaatst door die bedrijven", tone: s.echteKlussen === 0 ? "warn" : "neutral" },
          { label: "Omzet ooit", value: euro(s.omzetOoitCents), tone: "money" },
        ]}
      />

      <Panel title="Waar je werkers wonen" subtitle="Per postcodegebied (de eerste twee cijfers). Begin met verkopen waar de meeste werkers zitten.">
        {waar.gebieden.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>
            Nog geen gebied met drie of meer werkers.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {waar.gebieden.map((g) => (
              <li key={g.gebied} className="rounded-xl p-3" style={{ border: "1px solid var(--a-border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                  Postcodes {g.gebied}00 tot {g.gebied}99
                </p>
                <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
                  {g.aantal} werkers
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          Verspreid over kleinere gebieden: {waar.verspreid}. Zonder postcode: {waar.zonder}. Gebieden met minder dan drie werkers staan niet apart, zodat niemand te herleiden is.
        </p>
      </Panel>
    </div>
  );
}
