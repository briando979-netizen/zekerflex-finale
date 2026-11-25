import type { Metadata } from "next";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { getDpaStand } from "@/lib/dpa/dpa-store";
import { DpaOndertekenen } from "@/components/werkgever/DpaOndertekenen";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verwerkersovereenkomst" };

export default async function VerwerkersovereenkomstPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const s = d.settings;
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const stand = tenantId ? await getDpaStand(tenantId) : { ondertekend: false, versies: [] };
  const versies = stand.versies ?? [];

  return (
    <>
      <InstellingenKop title={s.cDpaT} subtitle={s.cDpaS} />

      <DpaOndertekenen initieel={stand} />

      {versies.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 font-display text-sm font-bold text-ink">Ondertekende versies</h3>
          <div className="overflow-x-auto rounded-xl border border-hair">
            <table className="w-full text-sm">
              <thead className="bg-neutralx-50 text-left text-xs uppercase tracking-wide text-neutralx-500">
                <tr>
                  <th className="px-4 py-3">Versie</th>
                  <th className="px-4 py-3">Ondertekend op</th>
                  <th className="px-4 py-3">Ondertekend door</th>
                  <th className="px-4 py-3 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair bg-white">
                {versies.map((v) => (
                  <tr key={v.versie + v.ondertekendOp}>
                    <td className="px-4 py-3 font-medium text-ink">v{v.versie}</td>
                    <td className="px-4 py-3 text-neutralx-600">
                      {new Date(v.ondertekendOp).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-neutralx-600">{v.naam}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`mailto:info@zekerflex.com?subject=Verwerkersovereenkomst%20v${v.versie}%20${amsterdamDayKey(new Date(v.ondertekendOp))}`}
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                        </svg>
                        Opvragen
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="prose prose-sm max-w-2xl text-neutralx-700">
        <h3 className="font-display text-sm font-bold text-ink">Wat is een verwerkersovereenkomst?</h3>
        <p className="mt-2 text-sm leading-relaxed">
          Als ZekerFlex persoonsgegevens verwerkt namens jouw organisatie — zoals de identiteitsgegevens
          van flexwerkers (ID-check, BSN voor de UBD-regeling) — zijn wij een verwerker in de zin van de AVG.
          De verwerkersovereenkomst legt vast wat we met die gegevens doen: beveiliging, bewaarperiode
          (2 jaar na de laatste klus), geen doorgifte buiten de EER, en het recht op audits.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Je kunt de volledige tekst lezen op{" "}
          <a href="/verwerkersovereenkomst" target="_blank" rel="noopener" className="text-brand-600 hover:underline">
            zekerflex.nl/verwerkersovereenkomst
          </a>
          . Een getekend exemplaar kun je opvragen via{" "}
          <a href="mailto:info@zekerflex.com?subject=Verwerkersovereenkomst%20getekend%20exemplaar" className="text-brand-600 hover:underline">
            info@zekerflex.com
          </a>
          .
        </p>
      </div>
    </>
  );
}
