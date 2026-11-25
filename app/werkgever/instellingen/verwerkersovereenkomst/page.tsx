import type { Metadata } from "next";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { getDpaStand } from "@/lib/dpa/dpa-store";
import { DpaOndertekenen } from "@/components/werkgever/DpaOndertekenen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verwerkersovereenkomst" };

export default async function VerwerkersovereenkomstPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const s = d.settings;
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const stand = tenantId ? await getDpaStand(tenantId) : { ondertekend: false };

  return (
    <>
      <InstellingenKop title={s.cDpaT} subtitle={s.cDpaS} />

      <DpaOndertekenen initieel={stand} />

      <div className="prose prose-sm max-w-2xl text-neutralx-700">
        <h3 className="font-display text-sm font-bold text-ink">Wat is een verwerkersovereenkomst?</h3>
        <p className="mt-2 text-sm leading-relaxed">
          Als ZekerFlex persoonsgegevens verwerkt namens jouw organisatie — zoals de gegevens van
          de flexwerkers die voor jou werken — zijn wij een verwerker in de zin van de AVG.
          De verwerkersovereenkomst legt vast wat we met die gegevens doen, hoe we ze beveiligen
          en hoe lang we ze bewaren.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Je kunt de volledige tekst lezen op{" "}
          <a href="/verwerkersovereenkomst" target="_blank" rel="noopener" className="text-brand-600 hover:underline">
            zekerflex.nl/verwerkersovereenkomst
          </a>
          . Een getekend pdf-exemplaar kun je opvragen via{" "}
          <a href="mailto:info@zekerflex.com?subject=Verwerkersovereenkomst%20getekend%20exemplaar" className="text-brand-600 hover:underline">
            info@zekerflex.com
          </a>
          .
        </p>
      </div>
    </>
  );
}
