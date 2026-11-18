import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { CodeBlock } from "@/components/marketing/CodeBlock";
import { canonical, SITE } from "@/lib/seo";

const TITLE = "Afspraken — de ZekerFlex-API";
const DESCRIPTION =
  "De vaste afspraken van de ZekerFlex-API: basis-adres en versie, JSON-vorm, datums en bedragen, lijstlimieten, het foutformaat, de rate limit en het versiebeleid.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers/afspraken", { title: TITLE, description: DESCRIPTION }),
};

const BASE = `${SITE.url}/api/public/v1`;

function Rij({ naam, type, uitleg }: { naam: string; type: string; uitleg: string }) {
  return (
    <tr className="border-t border-hair align-top">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-ink">{naam}</td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-neutralx-500">{type}</td>
      <td className="px-3 py-2 text-neutralx-600">{uitleg}</td>
    </tr>
  );
}

export default function AfsprakenPage() {
  return (
    <>
      <div className="border-b border-hair bg-paper-soft">
        <div className="shell py-12 md:py-14">
          <p className="eyebrow text-brand-600">Ontwikkelaars</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-[2.4rem]">Afspraken</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">
            Vaste regels die voor de hele API gelden, zodat je koppeling voorspelbaar blijft.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Adres en versie" title="Basis-adres" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Alle paden staan onder één basis-adres, met het versienummer erin. Zolang een versie bestaat, blijft hij werken; een
          nieuwe versie krijgt een eigen pad (<code className="font-mono">/v2</code>).
        </p>
        <CodeBlock>{BASE}</CodeBlock>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Vorm" title="JSON, met een data-omhulsel" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Alles is JSON. Een lijst staat altijd onder <code className="font-mono">data</code>, een enkel object ook. Zo kun je er
          later velden naast zetten zonder je koppeling te breken.
        </p>
        <CodeBlock>{`{
  "data": [ { "id": "sh_123", "title": "Weekend bediening" } ]
}`}</CodeBlock>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Waarden" title="Datums en bedragen" />
        <ul className="mt-6 max-w-2xl list-disc space-y-2 pl-5 text-[1.05rem] leading-relaxed text-neutralx-600">
          <li>Datums en tijden in antwoorden zijn <strong>UTC</strong> in ISO 8601 (bijv. <code className="font-mono">2026-11-01T16:00:00Z</code>).</li>
          <li>
            Let op bij <code className="font-mono">POST /shifts</code>: een tijd die je <em>zonder</em> zone stuurt
            (<code className="font-mono">2026-11-01T16:00</code>) lezen we als <strong>Nederlandse</strong> tijd, net als in het
            dashboard. Wil je geen twijfel? Zet er een <code className="font-mono">Z</code> of een offset achter.
          </li>
          <li>Bedragen zijn hele <strong>eurocenten</strong> (<code className="font-mono">1650</code> = € 16,50), nooit kommagetallen.</li>
        </ul>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Lijsten" title="Grenzen en filters" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Lijsten geven een vast maximum terug, gesorteerd. Er is (nog) geen cursor-paginering; voor facturen kun je filteren met{" "}
          <code className="font-mono">?since=JJJJ-MM-DD</code>.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-hair">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-paper-soft text-xs uppercase tracking-wide text-neutralx-500">
                <th className="px-3 py-2 font-semibold">Lijst</th>
                <th className="px-3 py-2 font-semibold">Max</th>
                <th className="px-3 py-2 font-semibold">Volgorde</th>
              </tr>
            </thead>
            <tbody>
              <Rij naam="GET /shifts" type="100" uitleg="Eerst de dienst die het eerst begint." />
              <Rij naam="GET /branches" type="200" uitleg="Op naam." />
              <Rij naam="GET /timesheets/approved" type="200" uitleg="Nieuwste goedkeuring eerst." />
              <Rij naam="GET /invoices" type="200" uitleg="Nieuwste eerst; filter met ?since." />
              <Rij naam="GET /webhooks" type="100" uitleg="Nieuwste eerst." />
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Fouten" title="Eén vast foutformaat" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Elke fout is een <code className="font-mono">error</code> met een <code className="font-mono">code</code> en een{" "}
          <code className="font-mono">message</code>. De statuscode zegt wat er mis is: <code className="font-mono">401</code>{" "}
          (sleutel), <code className="font-mono">403</code> (recht), <code className="font-mono">404</code> (niet gevonden),{" "}
          <code className="font-mono">412</code> (sleutel niet aan een organisatie), <code className="font-mono">422</code>{" "}
          (invoer) en <code className="font-mono">429</code> (limiet).
        </p>
        <CodeBlock>{`{
  "error": { "code": "FORBIDDEN", "message": "De sleutel mist het vereiste recht." }
}`}</CodeBlock>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Snelheid" title="Rate limit" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Elk antwoord heeft <code className="font-mono">RateLimit-Limit</code>, <code className="font-mono">RateLimit-Remaining</code>{" "}
          en <code className="font-mono">RateLimit-Reset</code>, zodat je zelf kunt afremmen vóór een <code className="font-mono">429</code>.
          Bij een 429 staat er ook <code className="font-mono">Retry-After</code> (seconden). De aantallen per minuut en per maand
          horen bij je abonnement; zie{" "}
          <Link href="/developers#pricing" className="font-semibold text-brand-700 hover:underline">de prijzen</Link>.
        </p>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Versies" title="Wat je van ons mag verwachten" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          We voegen velden toe zonder de versie te verhogen, dus negeer velden die je niet kent. Ingrijpende wijzigingen krijgen
          een nieuwe versie en kondigen we minstens 14 dagen vooraf aan op{" "}
          <Link href="/developers/wijzigingen" className="font-semibold text-brand-700 hover:underline">Wijzigingen</Link>.
        </p>
      </Section>
    </>
  );
}
