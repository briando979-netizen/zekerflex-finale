import { getPrincipal, hasRole } from "@/lib/auth";
import { Empty, PageHead, Panel, Pill } from "@/components/admin/kit";
import { CampagneFormulier } from "@/components/admin/CampagneFormulier";
import { campagneDoel, campagneFotoKeuzes } from "@/lib/campagne/pagina";
import { campagnePaginas } from "@/lib/campagne/pagina-server";

export const dynamic = "force-dynamic";

// Beheer → Sales & groei → Campagnepagina's (17 nov 2026): per advertentie een eigen landingspagina op /c/<adres>,
// met een foto, een korte kop en één knop (lib/campagne/pagina.ts).

export default async function CampagnesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De campagnepagina's zijn alleen voor platformbeheerders." />;
  }
  const [lijst, fotos] = [await campagnePaginas(), campagneFotoKeuzes()];

  return (
    <div className="space-y-4">
      <PageHead
        title="Campagnepagina's"
        subtitle="Maak voor elke advertentie een eigen pagina met een foto, een korte kop en één knop. Zet het adres van de pagina in je advertentie."
      />
      <Panel title="Nieuwe pagina" subtitle="De pagina staat daarna op zekerflex.com/c/ gevolgd door het adres. Zoekmachines nemen hem niet op.">
        <CampagneFormulier fotos={fotos} />
      </Panel>
      <Panel title="Bestaande pagina's" subtitle="Klik op een adres om de pagina te bekijken. Wijzigen kan hieronder.">
        {lijst.length === 0 ? (
          <Empty title="Nog geen campagnepagina's" body="Maak hierboven de eerste." />
        ) : (
          <ul className="space-y-6">
            {lijst.map((p) => (
              <li key={p.slug} className="border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: "var(--a-border)" }}>
                <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <a href={`/c/${p.slug}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: "var(--a-text)" }}>
                    /c/{p.slug}
                    <span className="sr-only"> (opent in een nieuw tabblad)</span>
                  </a>
                  <Pill tone={p.aan ? "ok" : "neutral"}>{p.aan ? "Staat aan" : "Staat uit"}</Pill>
                  <Pill tone="plan">{p.doelgroep === "werker" ? "Werkers" : "Bedrijven"}</Pill>
                  <span style={{ color: "var(--a-mute)" }}>knop: {campagneDoel(p.knopDoel)?.naam ?? "onbekend"}</span>
                </p>
                <CampagneFormulier fotos={fotos} begin={p} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
