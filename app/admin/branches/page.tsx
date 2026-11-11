import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { BRANCHES, bouwvolgorde, dekkingVan, gemiddeldeDekking, koppelingenVan, modulesVan } from "@/lib/branches/branches";
import { KOPPELINGEN, MODULES, GROEP_NAAM, koppelingWerkt, moduleVan } from "@/lib/branches/modules";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Branches: het bewijs en de bouwlijst van de branchemotor. Elke branche is een lijst modules
// (lib/branches); de dekking, de matrix en de bouwvolgorde volgen uit die lijsten, dus een nieuwe module of branche is
// één regel configuratie. Alleen "klaar" telt als er echt een pagina voor is (tests/branches.test.ts controleert dat).
export default async function BranchesBeheer() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De branchemotor is alleen voor platformbeheerders." />;
  }
  const klaar = MODULES.filter((m) => m.status === "klaar").length;
  const gepland = MODULES.length - klaar;
  const volgorde = bouwvolgorde();
  const werkend = KOPPELINGEN.filter(koppelingWerkt).length;
  const cel = { padding: "8px 10px", borderBottom: "1px solid var(--a-border)", verticalAlign: "top" as const, fontSize: "0.8125rem" };
  const kop = { ...cel, textAlign: "left" as const, fontWeight: 600, color: "var(--a-mute)", whiteSpace: "nowrap" as const };

  return (
    <div className="space-y-4">
      <PageHead title="Branches" subtitle="Eén kern, per soort bedrijf een eigen set modules en een eigen dashboard." />
      <KpiStrip
        items={[
          { label: "Branches", value: String(BRANCHES.length), hint: "elk met eigen dashboard", tone: "plan" },
          { label: "Modules klaar", value: String(klaar), hint: `van ${MODULES.length}`, tone: "ok" },
          { label: "Nog te bouwen", value: String(gepland), hint: "zie de bouwvolgorde", tone: gepland > 0 ? "warn" : "ok" },
          { label: "Gemiddelde dekking", value: `${gemiddeldeDekking()}%`, hint: "van onze eigen lijst" },
          { label: "Koppelingen die werken", value: `${werkend} van ${KOPPELINGEN.length}`, hint: "beide kanten klaar" },
        ]}
      />
      <Notice tone="plan">
        Dekking is hoeveel van de lijst die wij per branche opstelden er al staat. De lijst zelf is onze inschatting uit algemene kennis: toets hem bij vijf bedrijven per branche voordat je een module bouwt. Een module telt alleen als klaar als er een echte pagina voor is.
      </Notice>

      <Panel title="Per branche">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={kop}>Branche</th>
                <th style={kop}>Dekking</th>
                <th style={kop}>Ontbreekt nog</th>
                <th style={kop}>Dashboard</th>
              </tr>
            </thead>
            <tbody>
              {BRANCHES.map((b) => {
                const d = dekkingVan(b);
                const ontbreekt = modulesVan(b).filter((m) => m.status === "gepland");
                return (
                  <tr key={b.sleutel}>
                    <td style={cel}>
                      <span style={{ color: "var(--a-text)", fontWeight: 600 }}>{b.naam}</span>
                      <br />
                      <span style={{ color: "var(--a-mute)" }}>{b.voorWie}</span>
                    </td>
                    <td style={cel}>
                      <span style={{ color: "var(--a-text)", fontVariantNumeric: "tabular-nums" }}>{d.procent}%</span>{" "}
                      <span style={{ color: "var(--a-mute)" }}>
                        ({d.klaar} van {d.totaal})
                      </span>
                    </td>
                    <td style={cel}>
                      {ontbreekt.length === 0 ? <Pill tone="ok">niets</Pill> : <span style={{ color: "var(--a-dim)" }}>{ontbreekt.map((m) => m.naam).join(", ")}</span>}
                    </td>
                    <td style={cel}>
                      <Link href={`/werkgever/branche/${b.sleutel}`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>
                        Bekijk ›
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Wat bouwen we hierna">
        <p className="mb-2 text-xs" style={{ color: "var(--a-mute)" }}>
          Gesorteerd op hoeveel branches een module verder helpt; bij gelijk aantal op de dekking die erbij komt. Zo beslist de lijst, niet de smaak.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={kop}>#</th>
                <th style={kop}>Module</th>
                <th style={kop}>Helpt deze branches</th>
                <th style={kop}>Dekking erbij (samen)</th>
              </tr>
            </thead>
            <tbody>
              {volgorde.map((s, i) => (
                <tr key={s.module.sleutel}>
                  <td style={{ ...cel, color: "var(--a-mute)" }}>{i + 1}</td>
                  <td style={cel}>
                    <span style={{ color: "var(--a-text)", fontWeight: 600 }}>{s.module.naam}</span>
                    <br />
                    <span style={{ color: "var(--a-mute)" }}>{s.module.wat}</span>
                  </td>
                  <td style={{ ...cel, color: "var(--a-dim)" }}>
                    {s.branches.length}: {s.branches.map((b) => b.naam).join(", ")}
                  </td>
                  <td style={{ ...cel, fontVariantNumeric: "tabular-nums" }}>+{s.winst} procentpunten</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Matrix: welke modules hoort bij welke branche">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={kop}>Module</th>
                {BRANCHES.map((b) => (
                  <th key={b.sleutel} style={{ ...kop, fontSize: "0.7rem", maxWidth: 76, whiteSpace: "normal" }}>
                    {b.naam}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(GROEP_NAAM) as (keyof typeof GROEP_NAAM)[]).map((groep) => {
                const lijst = MODULES.filter((m) => m.groep === groep);
                if (lijst.length === 0) return null;
                return [
                  <tr key={`g-${groep}`}>
                    <td colSpan={BRANCHES.length + 1} style={{ ...cel, background: "var(--a-surface-2, transparent)", fontWeight: 700, color: "var(--a-text)", fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {GROEP_NAAM[groep]}
                    </td>
                  </tr>,
                  ...lijst.map((m) => (
                    <tr key={m.sleutel}>
                      <td style={cel}>
                        <span style={{ color: "var(--a-text)" }}>{m.naam}</span>{" "}
                        {m.status === "gepland" && <Pill tone="warn">gepland</Pill>}
                      </td>
                      {BRANCHES.map((b) => (
                        <td key={b.sleutel} style={{ ...cel, textAlign: "center", color: b.modules.includes(m.sleutel) ? (m.status === "klaar" ? "var(--a-ok, var(--a-text))" : "var(--a-warn, var(--a-text))") : "var(--a-mute)" }}>
                          {b.modules.includes(m.sleutel) ? (m.status === "klaar" ? "●" : "○") : "·"}
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
          ● staat klaar · ○ gepland, de branche heeft het nodig · · de branche heeft het niet nodig
        </p>
      </Panel>

      <Panel title="Koppelingen">
        <ul className="space-y-1.5">
          {KOPPELINGEN.map((k) => (
            <li key={k.id} className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              <Pill tone={koppelingWerkt(k) ? "ok" : "warn"}>{koppelingWerkt(k) ? "werkt" : "ontwerp"}</Pill>{" "}
              <span style={{ color: "var(--a-text)" }}>
                {moduleVan(k.van)?.naam} → {moduleVan(k.naar)?.naam}
              </span>
              : {k.wat}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
          {BRANCHES.reduce((n, b) => n + koppelingenVan(b).length, 0)} koppelingen in totaal over alle branches (dezelfde koppeling telt per branche mee).
        </p>
      </Panel>
    </div>
  );
}
