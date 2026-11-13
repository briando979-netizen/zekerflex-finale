import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { euro } from "@/lib/admin/format";
import { accountStand } from "@/lib/billing/stripe-betalen";
import { CONSOLE_GROEPEN, consoleTaken, type ConsoleStand } from "@/lib/shop/console";

export const dynamic = "force-dynamic";

// Beheer → Webshop & merk → Webshop-console: één startpagina voor de hele webshop (lib/shop/console.ts). Alleen lezen en
// doorverwijzen; elk onderdeel houdt zijn eigen scherm. Alle cijfers zijn echt: niets geschat, en wat niet te meten is staat
// er als een streepje.

const BETAALD = ["RECEIVED", "CONFIRMED", "SHIPPED"] as const;
const DAGEN_30 = 30 * 24 * 60 * 60 * 1000;

async function leesStand(nu: Date): Promise<ConsoleStand & { gemeten: string | null; uitSinds: string | null }> {
  const sinds = new Date(nu.getTime() - DAGEN_30);
  const [stripe, zichtbaar, uit, zonderFoto, lageVoorraad, pogingen30, betaald] = await Promise.all([
    accountStand().catch(() => null),
    prisma.shopProduct.count({ where: { active: true } }),
    prisma.shopProduct.count({ where: { active: false } }),
    prisma.shopProduct.count({ where: { active: true, OR: [{ imageUrl: null }, { imageUrl: "" }] } }),
    prisma.shopProductVariant.count({ where: { stock: { lte: 5 }, product: { active: true } } }),
    prisma.shopOrder.count({ where: { createdAt: { gte: sinds } } }),
    prisma.shopOrder.aggregate({ where: { createdAt: { gte: sinds }, status: { in: [...BETAALD] } }, _count: { _all: true }, _sum: { totalCents: true } }),
  ]);
  return {
    betalen: stripe ? stripe.betalen : null,
    gemeten: stripe?.gemeten ?? null,
    uitSinds: stripe?.uitSinds ?? null,
    zichtbaar,
    uit,
    zonderFoto,
    lageVoorraad,
    pogingen30,
    betaald30: betaald._count._all,
    omzet30Cents: betaald._sum.totalCents ?? 0,
  };
}

const datum = (iso: string | null) => (iso ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null);

export default async function WebshopConsolePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Webshop-console is alleen voor platformbeheerders." />;
  }
  const s = await leesStand(new Date());
  const taken = consoleTaken(s);
  const betalenTekst = s.betalen === null ? "—" : s.betalen ? "Aan" : "Dicht";

  return (
    <div className="space-y-4">
      <PageHead
        title="Webshop-console"
        subtitle="Alles van je eigen webshop op één plek: hoe hij ervoor staat, wat er nu moet gebeuren en een knop naar elk onderdeel."
        actions={
          <a href="/shop" target="_blank" rel="noopener" className="a-btn a-btn-ghost">
            Bekijk je webshop
          </a>
        }
      />

      {s.betalen === false ? (
        <Notice tone="crit" role="alert">
          Klanten kunnen nu niet betalen: het betaalaccount bij Stripe staat dicht{s.uitSinds ? ` sinds ${datum(s.uitSinds)}` : ""}. Er komt geen bestelling binnen tot dat is opgelost.{" "}
          <Link href="/admin/te-doen" className="underline">
            Wat je moet doen staat in Te doen
          </Link>
          .
        </Notice>
      ) : null}

      <KpiStrip
        items={[
          { label: "Betalen", value: betalenTekst, tone: s.betalen === false ? "crit" : s.betalen ? "ok" : "neutral", hint: s.gemeten ? `gemeten ${datum(s.gemeten)}` : "nog niet gemeten", href: "/admin/te-doen" },
          { label: "Producten zichtbaar", value: String(s.zichtbaar), hint: `${s.uit} staan uit`, href: "/admin/shop" },
          { label: "Betaalde bestellingen, 30 dagen", value: String(s.betaald30), hint: `${s.pogingen30} bestelpogingen in totaal`, tone: s.pogingen30 > 0 && s.betaald30 === 0 ? "warn" : "neutral", href: "/admin/shop" },
          { label: "Omzet, 30 dagen", value: euro(s.omzet30Cents), tone: "money", hint: "alleen betaalde bestellingen", href: "/admin/shop" },
        ]}
      />

      <Panel title="Wat nu te doen" subtitle="Het belangrijkste staat bovenaan.">
        {taken.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>
            Er wacht nu niets op jou.
          </p>
        ) : (
          <ul className="space-y-2">
            {taken.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl p-3" style={{ border: "1px solid var(--a-border)" }}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    <Pill tone={t.toon}>{t.toon === "crit" ? "Eerst" : t.toon === "warn" ? "Let op" : "Kan"}</Pill>
                    {t.titel}
                  </p>
                  <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
                    {t.uitleg}
                  </p>
                </div>
                <Link href={t.href} className="a-btn a-btn-ghost flex-shrink-0">
                  {t.knop}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {CONSOLE_GROEPEN.map((g) => (
        <Panel key={g.naam} title={g.naam} subtitle={g.uitleg}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {g.tegels.map((t) => {
              const inhoud = (
                <>
                  <span className="block text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {t.titel}
                    {t.buiten ? <span className="sr-only"> (opent in een nieuw tabblad)</span> : null}
                  </span>
                  <span className="mt-1 block text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
                    {t.uitleg}
                  </span>
                </>
              );
              const stijl = { border: "1px solid var(--a-border)", background: "var(--a-panel)" };
              const klasse = "relative block h-full rounded-xl p-4 transition-colors hover:bg-[var(--a-panel-2)]";
              return (
                <li key={t.titel}>
                  {t.buiten ? (
                    <a href={t.href} target="_blank" rel="noopener" className={klasse} style={stijl}>
                      {inhoud}
                    </a>
                  ) : (
                    <Link href={t.href} className={klasse} style={stijl}>
                      {inhoud}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
