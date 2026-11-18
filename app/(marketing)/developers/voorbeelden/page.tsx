import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { CodeBlock } from "@/components/marketing/CodeBlock";
import { canonical, SITE } from "@/lib/seo";

const TITLE = "Codevoorbeelden — de ZekerFlex-API";
const DESCRIPTION =
  "Kant-en-klare voorbeelden voor de ZekerFlex-API in curl, Node.js, Python en PHP: diensten lezen en aanmaken, en het ZekerFlex-brein vragen.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers/voorbeelden", { title: TITLE, description: DESCRIPTION }),
};

const BASE = `${SITE.url}/api/public/v1`;

export default function VoorbeeldenPage() {
  return (
    <>
      <div className="border-b border-hair bg-paper-soft">
        <div className="shell py-12 md:py-14">
          <p className="eyebrow text-brand-600">Ontwikkelaars</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-[2.4rem]">Codevoorbeelden</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">
            Kopieer en pas aan. Vervang <code className="font-mono">zf_live_...</code> door je eigen sleutel van{" "}
            <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">/werkgever/integraties</Link>.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Lezen" title="Open diensten ophalen" intro="GET /shifts geeft de open diensten van je organisatie." />
        <CodeBlock label="curl">{`curl ${BASE}/shifts \\
  -H "Authorization: Bearer zf_live_..."`}</CodeBlock>
        <CodeBlock label="Node.js (fetch)">{`const res = await fetch("${BASE}/shifts", {
  headers: { Authorization: "Bearer zf_live_..." },
});
const { data } = await res.json();
console.log(data);`}</CodeBlock>
        <CodeBlock label="Python (requests)">{`import requests

res = requests.get(
    "${BASE}/shifts",
    headers={"Authorization": "Bearer zf_live_..."},
)
print(res.json()["data"])`}</CodeBlock>
        <CodeBlock label="PHP (curl)">{`<?php
$ch = curl_init("${BASE}/shifts");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: Bearer zf_live_..."],
]);
$data = json_decode(curl_exec($ch), true)["data"];`}</CodeBlock>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Aanmaken" title="Een dienst plaatsen" intro="POST /shifts heeft een branchId nodig; haal die op met GET /branches." />
        <CodeBlock label="curl">{`curl -X POST ${BASE}/shifts \\
  -H "Authorization: Bearer zf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "branchId": "br_123",
    "title": "Weekend bediening",
    "startsAt": "2026-11-01T16:00:00Z",
    "endsAt": "2026-11-01T23:00:00Z",
    "hourlyRateCents": 1650,
    "positions": 2
  }'`}</CodeBlock>
        <CodeBlock label="Node.js (fetch)">{`const res = await fetch("${BASE}/shifts", {
  method: "POST",
  headers: {
    Authorization: "Bearer zf_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    branchId: "br_123",
    title: "Weekend bediening",
    startsAt: "2026-11-01T16:00:00Z",
    endsAt: "2026-11-01T23:00:00Z",
    hourlyRateCents: 1650,
    positions: 2,
  }),
});
const { data } = await res.json();`}</CodeBlock>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="AI" title="Het ZekerFlex-brein vragen" intro="POST /brain beantwoordt een vraag namens je organisatie — handig vanuit n8n, Make, Zapier of je eigen code." />
        <CodeBlock label="curl">{`curl -X POST ${BASE}/brain \\
  -H "Authorization: Bearer zf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "question": "Hoeveel open diensten heb ik deze week?" }'`}</CodeBlock>
        <CodeBlock label="Node.js (fetch)">{`const res = await fetch("${BASE}/brain", {
  method: "POST",
  headers: {
    Authorization: "Bearer zf_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ question: "Hoeveel open diensten heb ik deze week?" }),
});
const { answer } = await res.json();
console.log(answer);`}</CodeBlock>
        <p className="mt-6 text-sm text-neutralx-600">
          Alle endpoints, velden en foutcodes staan in de{" "}
          <Link href="/developers/api" className="font-semibold text-brand-700 hover:underline">API-naslag</Link>.
        </p>
      </Section>
    </>
  );
}
