import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { CodeBlock } from "@/components/marketing/CodeBlock";
import { canonical, SITE, CONTACTS } from "@/lib/seo";

const TITLE = "Authenticatie — de ZekerFlex-API";
const DESCRIPTION =
  "Hoe je je met een API-sleutel aanmeldt bij de ZekerFlex-API: de header, de rechten (scopes), soorten sleutels en hoe we ze veilig bewaren.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers/authenticatie", { title: TITLE, description: DESCRIPTION }),
};

const SCOPES = [
  { k: "shifts:read", d: "Open diensten en je vestigingen lezen (GET /shifts, GET /shifts/{id}, GET /branches)." },
  { k: "shifts:write", d: "Diensten aanmaken (POST /shifts)." },
  { k: "timesheets:read", d: "Goedgekeurde en betaalde urenbriefjes lezen (GET /timesheets/approved)." },
  { k: "invoices:read", d: "Facturen aan je organisatie lezen (GET /invoices)." },
  { k: "webhooks:manage", d: "Webhooks aanmaken, lezen en verwijderen (POST/GET/DELETE /webhooks)." },
  { k: "brain:ask", d: "Het ZekerFlex-brein vragen stellen (POST /brain)." },
  { k: "users:read", d: "Gereserveerd voor gebruikers lezen; hier zit nog geen endpoint achter." },
];

export default function AuthenticatiePage() {
  return (
    <>
      <div className="border-b border-hair bg-paper-soft">
        <div className="shell py-12 md:py-14">
          <p className="eyebrow text-brand-600">Ontwikkelaars</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-[2.4rem]">Authenticatie</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">
            Elk verzoek aan de API heeft een sleutel nodig. Geen sleutel of een ongeldige sleutel geeft{" "}
            <code className="font-mono">401</code>; een sleutel zonder het juiste recht geeft <code className="font-mono">403</code>.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="De sleutel meesturen" title="Bearer-token of x-api-key" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Stuur je sleutel mee als <code className="font-mono">Authorization: Bearer</code>-token, of in de header{" "}
          <code className="font-mono">x-api-key</code>. Een sleutel begint altijd met <code className="font-mono">zf_live_</code>.
        </p>
        <CodeBlock>{`Authorization: Bearer zf_live_...
# of
x-api-key: zf_live_...`}</CodeBlock>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Een sleutel krijgen" title="Zelf aanmaken, gratis" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Ingelogde werkgevers maken hun sleutels zelf aan en beheren ze op{" "}
          <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">/werkgever/integraties</Link>.
          Je ziet de sleutel maar één keer, direct na het aanmaken, dus bewaar hem meteen veilig. Voor Scale-volume mail je{" "}
          <a href={`mailto:${CONTACTS.partners}`} className="font-semibold text-brand-700 hover:underline">{CONTACTS.partners}</a>.
        </p>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Rechten" title="Scopes" intro="Elke sleutel heeft vaste rechten. Een verzoek naar een endpoint zonder het bijbehorende recht geeft 403." />
        <div className="mt-6 overflow-x-auto rounded-xl border border-hair">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-paper-soft text-xs uppercase tracking-wide text-neutralx-500">
                <th className="px-3 py-2 font-semibold">Scope</th>
                <th className="px-3 py-2 font-semibold">Wat het opent</th>
              </tr>
            </thead>
            <tbody>
              {SCOPES.map((s) => (
                <tr key={s.k} className="border-t border-hair align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-ink">{s.k}</td>
                  <td className="px-3 py-2 text-neutralx-600">{s.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Soorten sleutels" title="Organisatie of platformbreed" />
        <div className="mt-4 max-w-2xl space-y-3 text-[1.05rem] leading-relaxed text-neutralx-600">
          <p>
            Een <strong>organisatie-sleutel</strong> hoort bij één bedrijf en ziet alleen de gegevens van dat bedrijf. Dit is wat
            je als werkgever zelf aanmaakt. Endpoints die aan een organisatie moeten hangen (zoals{" "}
            <code className="font-mono">POST /shifts</code>, <code className="font-mono">GET /branches</code> en de webhooks)
            geven <code className="font-mono">412</code> als de sleutel niet aan een organisatie hangt.
          </p>
          <p>
            Een <strong>platformbrede sleutel</strong> (alleen door ZekerFlex-beheer uitgegeven) hangt aan geen enkel bedrijf en
            kan over organisaties heen lezen. Die krijg je niet via het zelfbedieningsscherm.
          </p>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Veiligheid" title="Hoe we je sleutel bewaren" />
        <ul className="mt-6 max-w-2xl list-disc space-y-2 pl-5 text-[1.05rem] leading-relaxed text-neutralx-600">
          <li>We bewaren alleen een SHA-256-hash van je sleutel, nooit de sleutel zelf. Een datalek levert dus geen bruikbare sleutel op.</li>
          <li>Je kunt een sleutel intrekken, of <strong>roteren</strong>: dan krijg je een nieuwe en blijft de oude nog 24 uur werken, zodat je koppeling zonder downtime overstapt.</li>
          <li>Deel een sleutel nooit in een openbare plek (code op een publieke repo, een client-app, een logregel). Lekt er een? Trek hem in en maak een nieuwe.</li>
        </ul>
        <p className="mt-6 text-sm text-neutralx-600">
          Verder lezen: <Link href="/developers/afspraken" className="font-semibold text-brand-700 hover:underline">Afspraken</Link> (fouten, limieten, datums) en de{" "}
          <Link href="/developers/api" className="font-semibold text-brand-700 hover:underline">API-naslag</Link>.
        </p>
      </Section>
    </>
  );
}
