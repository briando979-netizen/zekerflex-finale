import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { APageHeader } from "@/components/admin/ui";
import { IssuingRulesPanel } from "@/components/admin/IssuingRulesPanel";

export const dynamic = "force-dynamic";

// Eén centrale plek om alle instelbare knoppen van ZekerFlex te beheren zonder
// code: verwijzingen naar elk control-paneel + de Issuing-regels inline.
const CARDS: { title: string; desc: string; href: string }[] = [
  { title: "Financiën & tarieven", desc: "Je marge, btw-positie, reserveringen + instelbare tarieven (Stripe %, btw, belasting, maandlasten, uitzendopslag).", href: "/admin/financien" },
  { title: "Functies aan/uit (feature-flags)", desc: "Zet functies live of uit zonder redeploy, met gefaseerde uitrol.", href: "/admin/systeem" },
  { title: "Systeem & geplande taken", desc: "Status van de crons (heartbeat), achtergrondtaken en systeemchecks.", href: "/admin/systeem" },
  { title: "AI-functies & brein", desc: "AI-features, taalmodel/node-status en RAG.", href: "/admin/systeem" },
  { title: "Autopilot", desc: "Laat de AI zelf reminders, rematch en rapportage doen — binnen harde grenzen.", href: "/admin/autopilot" },
  { title: "ZekerFlex Bank — maandkosten", desc: "Maandelijkse bankkosten voor personen en organisaties.", href: "/admin/bank" },
  { title: "Werkvormen & btw", desc: "ZZP / flexwerker / uitzendkracht en btw-afhandeling per gebruiker.", href: "/admin/fiscaal" },
  { title: "Pensioenaangifte (StiPP)", desc: "Maandelijkse UPA voor uitzendkrachten.", href: "/admin/pensioen" },
  { title: "ICP-opgave (btw)", desc: "Grensoverschrijdende btw/ICP-aangifte.", href: "/admin/icp" },
  { title: "Beveiliging & 2FA", desc: "Beveiligingsinstellingen en tweestapsverificatie-overzicht.", href: "/admin/beveiliging" },
  { title: "Stripe live", desc: "Live betaal- en uitbetaalstatus via Stripe.", href: "/admin/stripe" },
  { title: "Verkeer & analytics", desc: "Bezoek, funnels en aandacht.", href: "/admin/analytics" },
];

export default async function AdminBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <APageHeader title="Geen toegang" subtitle="Beheer is alleen voor platformbeheer." />;
  }
  return (
    <>
      <APageHeader
        title="Beheer"
        subtitle="Eén plek om alles van ZekerFlex te regelen zonder code — tarieven, regels, functies, kaarten en systeem."
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href + c.title}
            href={c.href}
            className="block rounded-xl p-4 transition hover:brightness-110"
            style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              {c.title} <span aria-hidden>→</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
              {c.desc}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold" style={{ color: "var(--a-text)" }}>
          Kaarten (Stripe Issuing)
        </h2>
        <IssuingRulesPanel />
      </div>

      <p className="mt-8 text-xs" style={{ color: "var(--a-mute)" }}>
        Let op: enkele kernwaarden (platformkosten €/uur, standaard uitzendopslag, VAPID-/Stripe-sleutels) staan nog in de
        omgeving (env). Wil je die óók hier runtime-aanpasbaar? Dat kan als aparte, zorgvuldige stap — zeg het maar.
      </p>
    </>
  );
}
