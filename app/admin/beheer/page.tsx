import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { IssuingRulesPanel } from "@/components/admin/IssuingRulesPanel";

export const dynamic = "force-dynamic";

// Eén centrale plek om alle instelbare knoppen van ZekerFlex te beheren zonder
// code: verwijzingen naar elk control-paneel + de Issuing-regels inline.
const CARDS: { title: string; desc: string; href: string }[] = [
  { title: "Huisstijl", desc: "Pas de merkkleuren live aan en beheer de foto's en het logo via de Studio, zonder code.", href: "/admin/huisstijl" },
  { title: "Financiën & tarieven", desc: "Je marge, btw-positie, reserveringen en instelbare tarieven: Stripe-kosten, btw, belasting, maandlasten en uitzendopslag.", href: "/admin/financien" },
  { title: "Systeem, functies & AI", desc: "Functies aan en uit zonder nieuwe versie, geplande taken, systeemchecks en de status van het AI-brein.", href: "/admin/systeem" },
  { title: "Autopilot", desc: "Laat de AI zelf herinneringen, nieuwe matches en rapportages doen, binnen harde grenzen.", href: "/admin/autopilot" },
  { title: "ZekerFlex Bank", desc: "Maandelijkse bankkosten voor personen en organisaties.", href: "/admin/bank" },
  { title: "Werkvormen & btw", desc: "Zzp, flexwerker of uitzendkracht en de btw-afhandeling per gebruiker.", href: "/admin/fiscaal" },
  { title: "Pensioenaangifte", desc: "De maandelijkse aangifte aan StiPP voor uitzendkrachten.", href: "/admin/pensioen" },
  { title: "ICP-opgave", desc: "Grensoverschrijdende prestaties met verlegde btw.", href: "/admin/icp" },
  { title: "Beveiliging & tweestaps", desc: "Beveiligingsinstellingen en wie tweestapsverificatie aan heeft.", href: "/admin/beveiliging" },
  { title: "Stripe", desc: "Live betaal- en uitbetaalstatus via Stripe.", href: "/admin/stripe" },
  { title: "Verkeer", desc: "Bezoek, aandacht en instroom uit de site.", href: "/admin/analytics" },
];

export default async function AdminBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Beheer is alleen voor platformbeheer." />;
  }
  return (
    <div className="space-y-4">
      <PageHead title="Instellingen" subtitle="Eén plek om alles van ZekerFlex te regelen zonder code: tarieven, regels, functies, kaarten en systeem." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.href + c.title} href={c.href} className="a-panel group block p-4 transition-colors hover:border-[var(--a-border-strong)] sm:p-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              {c.title}
              <span className="transition-transform group-hover:translate-x-0.5" style={{ color: "var(--a-mute)" }} aria-hidden>→</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>{c.desc}</p>
          </Link>
        ))}
      </div>
      <section className="space-y-2.5 pt-2">
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Kaarten (Stripe Issuing)</h2>
        <IssuingRulesPanel />
      </section>
    </div>
  );
}
