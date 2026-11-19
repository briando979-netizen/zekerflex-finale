import type { Keuze } from "@/lib/voorstel/smileyapp-samensteller";
import { taalBasis, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, keuzevragenTaal, vergelijkRijenTaal } from "@/lib/voorstel/smileyapp-talen";
import type { Rij } from "@/lib/voorstel/smileyapp-vergelijk-regels";
import { RekenBlok } from "@/components/voorstel/smileyapp/RekenBlok";
import { Samensteller } from "@/components/voorstel/smileyapp/Samensteller";
import { VergelijkSlot, VergelijkTabel } from "@/components/voorstel/smileyapp/VergelijkTabel";

// "Stel je eigen vragenlijst samen" en "Smileyapp of een papieren enquête?" in
// het Engels en het Duits (deel 6b): dezelfde onderdelen als de Nederlandse
// pagina's, met de teksten van de taal. De pagina zet lang op de omlijsting en
// levert de kop (h1). De voorbeeldvragen en de standaardrijen zijn vertaald;
// wat het team zelf schreef (een eigen rij, de bron van de rekenhulp) blijft in
// de ingevoerde taal en draagt lang="nl". Server-onderdelen.

/** De samensteller en (als een beheerder hem instelde) de rekenhulp. `begin`: de keuze uit de adresbalk, al opgeschoond. */
export function SamenstellenTaal({ taal, begin }: { taal: Vertaling; begin: Keuze }) {
  const t = TEKSTEN[taal].samenstel;
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
        <Samensteller vragen={keuzevragenTaal(taal).map(({ id, groep, soort, tekst }) => ({ id, groep, soort, tekst }))} demoPad={`${taalBasis(taal)}/demo`} begin={begin} teksten={t} />
      </section>
      <RekenBlok taal={taal} />
    </>
  );
}

/** De tabel en de afsluiter. `rijen`: zoals de site ze nu toont (vergelijkRijen). */
export function VergelijkenTaal({ taal, rijen }: { taal: Vertaling; rijen: readonly Rij[] }) {
  const t = TEKSTEN[taal].vergelijk;
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
        <VergelijkTabel rijen={vergelijkRijenTaal(rijen, taal).map(({ id, kenmerk, smileyapp, papier, vertaald }) => ({ id, kenmerk, smileyapp, papier, ...(vertaald ? {} : { lang: "nl" }) }))} teksten={t} />
      </section>
      <VergelijkSlot basis={taalBasis(taal)} teksten={t} />
    </>
  );
}
