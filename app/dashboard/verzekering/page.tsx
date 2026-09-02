import { requirePrincipal } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/app/ui";

export const dynamic = "force-dynamic";

const COVERED = [
  ["Bedrijfsaansprakelijkheid", "Schade aan derden of hun eigendommen tijdens je werkzaamheden op een ZekerFlex-dienst."],
  ["Ongevallen", "Letsel tijdens werk én tijdens woon-werkverkeer op de dienstdag."],
  ["Rechtsbijstand", "Juridische hulp bij een geschil dat voortkomt uit een via ZekerFlex geaccepteerde dienst."],
];
const NOT_COVERED = [
  "Opzet, grove schuld of werken onder invloed",
  "Schade buiten de geaccepteerde dienst of aan je eigen materiaal",
  "Werkzaamheden die niet in de dienstomschrijving stonden",
];

export default async function VerzekeringPage() {
  await requirePrincipal();
  return (
    <>
      <PageHeader
        title="Verzekering"
        eyebrow="Automatisch geregeld"
        subtitle="Zodra je een dienst accepteert, ben je verzekerd via de collectieve dekking van ZekerFlex. Je hoeft zelf niets af te sluiten."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Wat is gedekt">
          <ul className="divide-y divide-hair">
            {COVERED.map(([title, body]) => (
              <li key={title} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-ok/10 text-ok">✓</span>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-sm text-neutralx-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-hair px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-ink">Niet gedekt</p>
            <ul className="space-y-1 text-sm text-neutralx-600">
              {NOT_COVERED.map((x) => (
                <li key={x} className="flex gap-2">
                  <span className="text-neutralx-400">–</span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Jouw verzekeringsbewijs">
            <div className="px-5 py-4">
              <p className="text-sm text-neutralx-600">
                Download een bewijs van dekking, bijvoorbeeld als een opdrachtgever daarom vraagt.
              </p>
              <a
                href="/api/me/insurance"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-3 inline-block"
              >
                Verzekeringsbewijs (pdf) ↓
              </a>
            </div>
          </Panel>
          <Panel title="Een schade melden">
            <div className="px-5 py-4 text-sm text-neutralx-600">
              <p>Meld schade of een ongeval binnen 48 uur via ZekerFlex Support in de chat. Vermeld:</p>
              <ul className="mt-2 space-y-1">
                <li>• de dienst en datum</li>
                <li>• wat er is gebeurd</li>
                <li>• foto&apos;s en (indien van toepassing) gegevens van betrokkenen</li>
              </ul>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
