import { getPrincipal, hasRole } from "@/lib/auth";
import { alleAanmeldingen } from "@/lib/kaart/aanmelden-store";
import { KpiStrip, Notice, PageHead, Panel } from "@/components/admin/kit";
import { KaartBeheer } from "@/components/admin/KaartBeheer";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Kaart: bedrijven die zichzelf op ZekerFlex Kaart willen zetten. Niets komt op de kaart
// zonder jouw goedkeuring; alleen wat het bedrijf zelf invulde.
export default async function KaartBeheerPagina() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De aanmeldingen voor de kaart zijn alleen voor platformbeheerders." />;
  }
  const lijst = await alleAanmeldingen();
  const wacht = lijst.filter((a) => a.status === "wacht").length;
  return (
    <div className="space-y-4">
      <PageHead title="Kaart" subtitle="Bedrijven die zichzelf op ZekerFlex Kaart willen zetten." />
      <KpiStrip
        items={[
          { label: "Wachten op jou", value: String(wacht), hint: "nog nakijken", tone: wacht > 0 ? "warn" : "ok" },
          { label: "Op de kaart", value: String(lijst.filter((a) => a.status === "goedgekeurd").length), hint: "goedgekeurd", tone: "plan" },
          { label: "Alle aanmeldingen", value: String(lijst.length) },
        ]}
      />
      <Notice tone="plan">
        Controleer of het een echt bedrijf is op dit adres en of de tekst en het nummer netjes zijn. Een wijziging van het bedrijf komt weer bij jou terug. Reclame, persoonsgegevens en onzin wijs je af, met een korte reden die het bedrijf leest.
      </Notice>
      <Panel title="Aanmeldingen">
        <KaartBeheer aanmeldingen={lijst} />
      </Panel>
    </div>
  );
}
