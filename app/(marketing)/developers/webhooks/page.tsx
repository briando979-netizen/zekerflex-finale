import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { CodeBlock } from "@/components/marketing/CodeBlock";
import { canonical } from "@/lib/seo";

const TITLE = "Webhooks — de ZekerFlex-API";
const DESCRIPTION =
  "Ontvang meldingen van ZekerFlex op je eigen URL: de gebeurtenissen, de payload, de headers, en hoe je de handtekening controleert (HMAC-SHA256), met voorbeeldcode.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers/webhooks", { title: TITLE, description: DESCRIPTION }),
};

const EVENTS = [
  { e: "shift.matched", d: "Een werker is aan een dienst gekoppeld." },
  { e: "freelancer.checked_in", d: "Een werker heeft ingecheckt op locatie." },
  { e: "timesheet.approved", d: "Een urenbriefje is goedgekeurd." },
  { e: "dispute.opened", d: "Er is een geschil geopend." },
  { e: "invoice.issued", d: "Er is een factuur uitgegeven." },
];

export default function WebhooksGidsPage() {
  return (
    <>
      <div className="border-b border-hair bg-paper-soft">
        <div className="shell py-12 md:py-14">
          <p className="eyebrow text-brand-600">Ontwikkelaars</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-[2.4rem]">Webhooks</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">
            In plaats van zelf te blijven vragen, laat je ZekerFlex een melding sturen naar jouw URL zodra er iets gebeurt.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Beheren" title="Aanmaken, lezen, verwijderen" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Je beheert abonnementen via de API (scope <code className="font-mono">webhooks:manage</code>):{" "}
          <code className="font-mono">POST /webhooks</code> om er een te maken, <code className="font-mono">GET /webhooks</code> om
          ze te zien en <code className="font-mono">DELETE /webhooks/&#123;id&#125;</code> om er een te verwijderen. De precieze
          velden staan in de <Link href="/developers/api#webhooks" className="font-semibold text-brand-700 hover:underline">API-naslag</Link>.
          Bij het aanmaken krijg je het <strong>ondertekeningsgeheim</strong> (<code className="font-mono">whsec_...</code>) één keer
          terug; bewaar het meteen, het komt daarna nergens meer terug.
        </p>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Gebeurtenissen" title="Waarop je kunt abonneren" />
        <div className="mt-6 overflow-x-auto rounded-xl border border-hair">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-paper-soft text-xs uppercase tracking-wide text-neutralx-500">
                <th className="px-3 py-2 font-semibold">type</th>
                <th className="px-3 py-2 font-semibold">Wanneer</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((ev) => (
                <tr key={ev.e} className="border-t border-hair align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-ink">{ev.e}</td>
                  <td className="px-3 py-2 text-neutralx-600">{ev.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="De melding" title="Payload en headers" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          We sturen een <code className="font-mono">POST</code> met JSON. De gebeurtenis zelf zit in <code className="font-mono">data</code>:
        </p>
        <CodeBlock label="Body">{`{
  "id": "a1b2c3d4e5f6...",
  "type": "shift.matched",
  "createdAt": "2026-11-01T16:05:00.000Z",
  "data": { }
}`}</CodeBlock>
        <CodeBlock label="Headers">{`content-type: application/json
user-agent: ZekerFlex-Webhooks/1.0
x-zekerflex-event: shift.matched
x-zekerflex-timestamp: 1793000000
x-zekerflex-signature: v1=<hex>`}</CodeBlock>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutralx-600">
          Antwoord binnen 8 seconden met een <code className="font-mono">2xx</code>. Lukt dat niet, dan proberen we het opnieuw,
          tot 5 keer, met oplopende pauzes (2, 4, 8 en 16 seconden).
        </p>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veiligheid" title="De handtekening controleren" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Controleer altijd dat een melding echt van ons komt. De handtekening is een <strong>HMAC-SHA256</strong> met jouw geheim
          over de tekst <code className="font-mono">&lt;timestamp&gt;.&lt;ruwe body&gt;</code>, hex, met <code className="font-mono">v1=</code> ervoor.
          Reken met de <strong>ruwe</strong> body (de bytes zoals ontvangen), niet met een opnieuw samengestelde JSON.
        </p>
        <CodeBlock label="Node.js">{`const crypto = require("crypto");

function geldig(secret, headers, ruweBody) {
  const timestamp = headers["x-zekerflex-timestamp"];
  const ontvangen = headers["x-zekerflex-signature"]; // "v1=<hex>"
  const verwacht =
    "v1=" + crypto.createHmac("sha256", secret).update(timestamp + "." + ruweBody).digest("hex");
  const a = Buffer.from(ontvangen);
  const b = Buffer.from(verwacht);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`}</CodeBlock>
        <CodeBlock label="Python">{`import hmac, hashlib

def geldig(secret, headers, ruwe_body):
    timestamp = headers["x-zekerflex-timestamp"]
    ontvangen = headers["x-zekerflex-signature"]  # "v1=<hex>"
    verwacht = "v1=" + hmac.new(
        secret.encode(), f"{timestamp}.{ruwe_body}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(ontvangen, verwacht)`}</CodeBlock>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutralx-600">
          Tip tegen replay: weiger een melding waarvan de <code className="font-mono">x-zekerflex-timestamp</code> meer dan een paar
          minuten oud is. Je kunt vanuit{" "}
          <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">Werkgever → Koppelingen</Link>{" "}
          een test-ping sturen om je controle uit te proberen, en een mislukte melding opnieuw laten sturen.
        </p>
      </Section>
    </>
  );
}
