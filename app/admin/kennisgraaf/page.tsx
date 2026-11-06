import { getPrincipal, hasRole } from "@/lib/auth";
import { kennisgraaf } from "@/lib/rag/graph";
import { count } from "@/lib/admin/format";
import { BarList, Empty, KpiStrip, PageHead, Panel, StackBar } from "@/components/admin/kit";
import { KnowledgeGraph } from "@/components/admin/KnowledgeGraph";

export const dynamic = "force-dynamic";

const GROEP: Record<string, string> = {
  intern: "interne docs",
  kennisbank: "gidsen",
  blog: "blog",
  whitepaper: "whitepapers",
  faq: "FAQ",
  "wet-dba": "Wet DBA",
  help: "helpcentrum",
  howto: "hulp in de app",
  overig: "overig",
};
const PUBLIEK: Record<string, string> = { public: "Openbaar (website)", werknemer: "Werknemers (app)", opdrachtgever: "Opdrachtgevers (portaal)", admin: "Alleen beheer (intern)" };
const BRON: Record<string, string> = { CODE: "code", AUDIT: "auditspoor", DATABASE: "platformstand", LEGAL: "wetgeving", SALES: "sales", INTERACTION: "gesprekken" };

/** Admin → Kennisgraaf: het brein van ZekerFlex als netwerk, met begrippen, clusters, centrale documenten, hiaten en het denkpad van een vraag. */
export default async function KennisGraafPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De kennisgraaf is alleen beschikbaar voor platformbeheerders." />;
  }
  const g = await kennisgraaf();
  const docs = g.nodes.filter((n) => n.group !== "begrip");
  const docLijnen = g.edges.filter((e) => e.soort !== "begrip");
  const semantisch = docLijnen.filter((e) => e.soort === "semantisch").length;
  const geheugenTotaal = Object.values(g.geheugen).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <PageHead
        title="Kennisgraaf"
        subtitle="Het brein van ZekerFlex als netwerk: elke stip is een kennisdocument, elke ruit een begrip, elke lijn een verband. Zoek, filter, stel een vraag en zie welk pad het brein neemt; klik op een knoop voor de inhoud."
      />
      <KpiStrip
        items={[
          { label: "Documenten", value: count(docs.length), hint: `${count(docs.reduce((s, n) => s + n.size, 0))} passages` },
          { label: "Begrippen", value: count(g.begrippen.length), hint: "de termen die het corpus dragen" },
          { label: "Verbanden", value: count(docLijnen.length), hint: semantisch ? `${count(semantisch)} semantisch, de rest op woorden` : "op woordoverlap (geen embeddings gevonden)", ...(semantisch ? { tone: "ok" as const } : {}) },
          { label: "Clusters", value: count(g.clusters.length), hint: `grootste ${count(g.clusters[0]?.grootte ?? 0)} documenten` },
          { label: "Los", value: count(g.hiaten.los.length), hint: "zonder enig verband", ...(g.hiaten.los.length > 0 ? { tone: "warn" as const } : {}) },
          { label: "Geheugen", value: count(geheugenTotaal), hint: geheugenTotaal ? Object.entries(g.geheugen).map(([k, v]) => `${BRON[k] ?? k} ${count(v)}`).join(" · ") : "geen index op deze omgeving" },
        ]}
      />

      {g.nodes.length === 0 ? (
        <Panel>
          <Empty title="Nog geen kennisdocumenten" body="Er zijn geen kennisdocumenten gevonden in deze versie." />
        </Panel>
      ) : (
        <KnowledgeGraph nodes={g.nodes} edges={g.edges} begrippen={g.begrippen} centraal={g.centraal.slice(0, 8).map((c) => c.id)} />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Meest centrale documenten" subtitle="PageRank over de verbanden: waar de kennis samenkomt (× 1000)">
          <BarList rows={g.centraal.map((c) => ({ key: c.id, label: `${c.label} · ${GROEP[c.group] ?? c.group}`, value: c.score }))} emptyText="Nog geen verbanden." />
        </Panel>
        <Panel title="Clusters" subtitle="Samenhangende delen van de kennis, met hun kern">
          <ol className="space-y-2.5 text-[0.8125rem]">
            {g.clusters.slice(0, 8).map((c) => (
              <li key={c.id} className="rounded-lg px-3 py-2" style={{ background: "var(--a-elev)" }}>
                <p className="font-medium" style={{ color: "var(--a-text)" }}>
                  Cluster {c.id} · {count(c.grootte)} {c.grootte === 1 ? "document" : "documenten"}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--a-dim)" }}>
                  {c.kern.map((k) => k.label).join(" · ")}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--a-mute)" }}>
                  {Object.entries(c.groepen)
                    .sort((a, b) => b[1] - a[1])
                    .map(([gr, n]) => `${GROEP[gr] ?? gr} ${n}`)
                    .join(", ")}
                </p>
              </li>
            ))}
            {g.clusters.length > 8 && (
              <li className="text-xs" style={{ color: "var(--a-mute)" }}>
                en nog {count(g.clusters.length - 8)} kleinere
              </li>
            )}
          </ol>
        </Panel>
        <div className="space-y-4">
          <Panel title="Voor wie" subtitle="Passages per publiek; alleen openbaar en eigen rol bereiken ooit een prompt">
            <StackBar segments={Object.entries(g.publiek).map(([k, v], i) => ({ label: PUBLIEK[k] ?? k, value: v, slot: i + 1 }))} />
          </Panel>
          <Panel title="Hiaten en suggesties" subtitle="Waar het brein dun is">
            <ul className="space-y-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              {g.hiaten.los.length > 0 && (
                <li>
                  <span className="font-medium" style={{ color: "var(--a-text)" }}>
                    {count(g.hiaten.los.length)} {g.hiaten.los.length === 1 ? "document staat" : "documenten staan"} los
                  </span>
                  : {g.hiaten.los.map((id) => g.nodes.find((n) => n.id === id)?.label ?? id).slice(0, 6).join(", ")}
                  {g.hiaten.los.length > 6 ? "…" : ""}. Koppel ze met een verwijzing in een gids of neem de begrippen over.
                </li>
              )}
              {g.hiaten.eilandjes.length > 0 && (
                <li>
                  <span className="font-medium" style={{ color: "var(--a-text)" }}>
                    {count(g.hiaten.eilandjes.length)} {g.hiaten.eilandjes.length === 1 ? "eilandje" : "eilandjes"} van twee
                  </span>
                  : {g.hiaten.eilandjes.slice(0, 3).map((e) => e.map((id) => g.nodes.find((n) => n.id === id)?.label ?? id).join(" + ")).join("; ")}.
                </li>
              )}
              {g.hiaten.dunneBegrippen.length > 0 && (
                <li>
                  <span className="font-medium" style={{ color: "var(--a-text)" }}>
                    Dun gedekte begrippen
                  </span>
                  : {g.hiaten.dunneBegrippen.slice(0, 10).join(", ")}
                  {g.hiaten.dunneBegrippen.length > 10 ? "…" : ""}. Een gids of FAQ hierover maakt het brein zekerder.
                </li>
              )}
              {g.semantisch === 0 && (
                <li>
                  <span className="font-medium" style={{ color: "var(--a-text)" }}>
                    Geen semantische laag
                  </span>
                  : de embeddings van het corpus staan niet in de index. Na de dagelijkse RAG-herindexering (Systeem → RAG-lab) komen de paarse verbanden erbij.
                </li>
              )}
              {g.hiaten.los.length === 0 && g.hiaten.eilandjes.length === 0 && g.hiaten.dunneBegrippen.length === 0 && g.semantisch > 0 && <li>Geen hiaten gevonden: alles hangt aan elkaar.</li>}
            </ul>
          </Panel>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Berekend op {new Date(g.op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}; de graaf wordt elke tien minuten opnieuw berekend. Begrippen komen uit TF-IDF over het corpus; verbanden uit woordoverlap (Jaccard) en, waar de index ze heeft, de echte embeddings (cosinus ≥ 0,5).
      </p>
    </div>
  );
}
