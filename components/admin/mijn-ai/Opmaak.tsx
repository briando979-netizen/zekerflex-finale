"use client";

import { useState, type ReactNode } from "react";

// Opmaak van een antwoord in Mijn AI (15 nov 2026): de Markdown die het model schrijft, als gewone React-elementen
// (nooit als losse HTML). Koppen, lijstjes, citaten, tabellen, codeblokken met een knop Kopiëren, en binnen een regel
// **vet**, *schuin*, `code` en links (alleen http/https). Geen lookbehind in de regex (oude Safari, AGENTS.md).

const INLINE = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|\*([^*\s][^*]*)\*)/g;

function regel(text: string, sleutel: string): ReactNode[] {
  const uit: ReactNode[] = [];
  let vanaf = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > vanaf) uit.push(text.slice(vanaf, i));
    const k = `${sleutel}-${n++}`;
    if (m[2] !== undefined) uit.push(<strong key={k}>{m[2]}</strong>);
    else if (m[3] !== undefined)
      uit.push(
        <code key={k} className="rounded px-1 py-0.5 text-[0.88em]" style={{ background: "var(--a-panel-2)" }}>
          {m[3]}
        </code>,
      );
    else if (m[4] !== undefined && m[5] !== undefined)
      uit.push(
        <a key={k} href={m[5]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--a-accent)" }}>
          {m[4]}
        </a>,
      );
    else if (m[6] !== undefined)
      uit.push(
        <a key={k} href={m[6]} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2" style={{ color: "var(--a-accent)" }}>
          {m[6]}
        </a>,
      );
    else if (m[7] !== undefined) uit.push(<em key={k}>{m[7]}</em>);
    vanaf = i + m[0].length;
  }
  if (vanaf < text.length) uit.push(text.slice(vanaf));
  return uit;
}

function CodeBlok({ taal, code }: { taal: string; code: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--a-border)" }}>
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px]" style={{ background: "var(--a-panel-2)", color: "var(--a-mute)" }}>
        <span>{taal || "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(
              () => {
                setGekopieerd(true);
                window.setTimeout(() => setGekopieerd(false), 1500);
              },
              () => undefined,
            );
          }}
          className="rounded px-1.5 py-0.5 hover:underline"
        >
          {gekopieerd ? "Gekopieerd" : "Kopiëren"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const cellen = (r: string) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Opmaak({ tekst }: { tekst: string }) {
  const regels = tekst.replace(/\r\n/g, "\n").split("\n");
  const blokken: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < regels.length) {
    const r = regels[i]!;
    // codeblok
    const hek = /^\s*```\s*([\w+-]*)\s*$/.exec(r);
    if (hek) {
      const code: string[] = [];
      i++;
      while (i < regels.length && !/^\s*```\s*$/.test(regels[i]!)) code.push(regels[i++]!);
      i++;
      blokken.push(<CodeBlok key={k++} taal={hek[1] ?? ""} code={code.join("\n")} />);
      continue;
    }
    // kop
    const kop = /^(#{1,4})\s+(.*)$/.exec(r);
    if (kop) {
      const niveau = kop[1]!.length;
      const cls = niveau === 1 ? "text-xl font-semibold" : niveau === 2 ? "text-lg font-semibold" : "text-base font-semibold";
      blokken.push(
        <p key={k++} role="heading" aria-level={Math.min(niveau + 1, 6)} className={`${cls} pt-1`}>
          {regel(kop[2]!, `k${k}`)}
        </p>,
      );
      i++;
      continue;
    }
    // lijn
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(r)) {
      blokken.push(<hr key={k++} style={{ borderColor: "var(--a-border)" }} />);
      i++;
      continue;
    }
    // tabel: een kopregel met |, daarna een scheidingsregel
    if (/^\s*\|.*\|\s*$/.test(r) && /^\s*\|?\s*:?-{2,}/.test(regels[i + 1] ?? "")) {
      const kopCellen = cellen(r);
      i += 2;
      const rijen: string[][] = [];
      while (i < regels.length && /^\s*\|.*\|\s*$/.test(regels[i]!)) rijen.push(cellen(regels[i++]!));
      blokken.push(
        <div key={k++} className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {kopCellen.map((c, n) => (
                  <th key={n} className="border-b px-2 py-1.5 text-left font-semibold" style={{ borderColor: "var(--a-border-strong)" }}>
                    {regel(c, `t${k}h${n}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rijen.map((rij, a) => (
                <tr key={a}>
                  {rij.map((c, n) => (
                    <td key={n} className="border-b px-2 py-1.5 align-top" style={{ borderColor: "var(--a-border)" }}>
                      {regel(c, `t${k}r${a}c${n}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // citaat
    if (/^\s*>\s?/.test(r)) {
      const deel: string[] = [];
      while (i < regels.length && /^\s*>\s?/.test(regels[i]!)) deel.push(regels[i++]!.replace(/^\s*>\s?/, ""));
      blokken.push(
        <blockquote key={k++} className="border-l-2 pl-3" style={{ borderColor: "var(--a-border-strong)", color: "var(--a-mute)" }}>
          {regel(deel.join(" "), `q${k}`)}
        </blockquote>,
      );
      continue;
    }
    // lijstjes (opsomming of genummerd)
    const isPunt = (x: string) => /^\s*[-*•]\s+/.test(x);
    const isNummer = (x: string) => /^\s*\d+[.)]\s+/.test(x);
    if (isPunt(r) || isNummer(r)) {
      const genummerd = isNummer(r);
      const items: string[] = [];
      while (i < regels.length && (genummerd ? isNummer(regels[i]!) : isPunt(regels[i]!))) {
        items.push(regels[i++]!.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
      }
      const Lijst = genummerd ? "ol" : "ul";
      blokken.push(
        <Lijst key={k++} className={`space-y-1 pl-5 ${genummerd ? "list-decimal" : "list-disc"}`}>
          {items.map((it, n) => (
            <li key={n}>{regel(it, `l${k}-${n}`)}</li>
          ))}
        </Lijst>,
      );
      continue;
    }
    // lege regel
    if (!r.trim()) {
      i++;
      continue;
    }
    // alinea: opeenvolgende gewone regels
    const alinea: string[] = [];
    while (i < regels.length && regels[i]!.trim() && !/^\s*(```|#{1,4}\s|>|[-*•]\s|\d+[.)]\s|\|)/.test(regels[i]!)) alinea.push(regels[i++]!);
    if (alinea.length === 0) {
      // een regel die op niets anders lijkt (bijv. een losse |): als tekst
      alinea.push(regels[i++]!);
    }
    blokken.push(
      <p key={k++} className="whitespace-pre-wrap">
        {regel(alinea.join("\n"), `p${k}`)}
      </p>,
    );
  }
  return <div className="space-y-3 text-[15px] leading-relaxed">{blokken}</div>;
}
