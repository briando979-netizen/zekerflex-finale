import { getPrincipal, hasRole } from "@/lib/auth";
import { groei, kennisgraaf } from "@/lib/rag/graph";
import { count } from "@/lib/admin/format";
import { BarList, Empty, InfoList, KpiStrip, PageHead, Panel, Spark, StackBar } from "@/components/admin/kit";
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

const structuurTekst = (m: number) => (m >= 0.3 ? "duidelijke structuur" : m >= 0.15 ? "lichte structuur" : "weinig structuur");

/** Admin → Kennisgraaf: het brein van ZekerFlex als netwerk, met thema's, bruggen, centrale documenten, cijfers, hiaten, groei en het denkpad van een vraag. */
export default async function KennisGraafPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De kennisgraaf is alleen beschikbaar voor platformbeheerders." />;
  }
  const [g, gr] = await Promise.all([kennisgraaf(), groei()]);
  const docs = g.nodes.filter((n) => n.group !== "begrip");
  const docLijnen = g.edges.filter((e) => e.soort !== "begrip");
  const semantisch = docLijnen.filter((e) => e.soort === "semantisch").length;
  const geheugenTotaal = Object.values(g.geheugen).reduce((s, v) => s + v, 0);
  const labelVan = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;
  const reeksDocs = gr.reeks.map((r) => r.documenten);
  const reeksLijnen = gr.reeks.map((r) => r.lijnen);
  const eerste = gr.reeks[0];
  const laatste = gr.reeks[gr.reeks.length - 1];
  const delta = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && a > 0 ? Math.round(((b - a) / a) * 100) : null);

  return (
    <div className="space-y-4">
      <PageHead
        title="Kennisgraaf"
        subtitle="Het brein van ZekerFlex als netwerk: elke stip is een kennisdocument, elke ruit een begrip, elke lijn een verband. Kleur op soort of thema, zoek, filter, zoom in op een buurt, trek het kortste pad tussen twee knopen, stel een vraag en zie welk pad het brein neemt; klik op een knoop voor de inhoud."
      />
      <KpiStrip
        items={[
          { label: "Documenten", value: count(docs.length), hint: `${count(docs.reduce((s, n) => s + n.size, 0))} passages · ${count(g.begrippen.length)} begrippen`, ...(reeksDocs.length >= 2 ? { spark: reeksDocs } : {}) },
          { label: "Verbanden", value: count(docLijnen.length), hint: semantisch ? `${count(semantisch)} semantisch, de rest op woorden` : "op woordoverlap (geen embeddings gevonden)", ...(semantisch ? { tone: "ok" as const } : {}), ...(reeksLijnen.length >= 2 ? { spark: reeksLijnen } : {}) },
          { label: "Thema's", value: count(g.themas.length), hint: `modulariteit ${g.modulariteit.toFixed(2)}: ${structuurTekst(g.modulariteit)}` },
          { label: "Bruggen", value: count(g.bruggen.length), hint: g.bruggen[0] ? `sterkste: ${g.bruggen[0].label}` : "geen document ligt op een kortste pad" },
          { label: "Los", value: count(g.hiaten.los.length), hint: "zonder enig verband", ...(g.hiaten.los.length > 0 ? { tone: "warn" as const } : {}) },
          { label: "Geheugen", value: count(geheugenTotaal), hint: geheugenTotaal ? Object.entries(g.geheugen).map(([k, v]) => `${BRON[k] ?? k} ${count(v)}`).join(" · ") : "geen index op deze omgeving" },
        ]}
      />

      {g.nodes.length === 0 ? (
        <Panel>
          <Empty title="Nog geen kennisdocumenten" body="Er zijn geen kennisdocumenten gevonden in deze versie." />
        </Panel>
      ) : (
        <KnowledgeGraph
          nodes={g.nodes}
          edges={g.edges}
          begrippen={g.begrippen}
          centraal={g.centraal.slice(0, 8).map((c) => c.id)}
          bruggen={g.bruggen.slice(0, 5).map((c) => c.id)}
          themas={g.themas.map((t) => ({ id: t.id, naam: t.naam, grootte: t.grootte }))}
          maten={g.maten}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Thema's" subtitle="Gemeenschappen in het netwerk, genoemd naar de begrippen die ze dragen">
          <ol className="space-y-2.5 text-[0.8125rem]">
            {g.themas.slice(0, 8).map((t) => (
              <li key={t.id} className="rounded-lg px-3 py-2" style={{ background: "var(--a-elev)" }}>
                <p className="font-medium" style={{ color: "var(--a-text)" }}>
                  {t.id}. {t.naam} · {count(t.grootte)} {t.grootte === 1 ? "document" : "documenten"}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--a-dim)" }}>
                  kern: {t.kern.map((k) => k.label).join(" · ")}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--a-mute)" }}>
                  {Object.entries(t.groepen)
                    .sort((a, b) => b[1] - a[1])
                    .map(([gr2, n]) => `${GROEP[gr2] ?? gr2} ${n}`)
                    .join(", ")}
                </p>
              </li>
            ))}
            {g.themas.length > 8 && (
              <li className="text-xs" style={{ color: "var(--a-mute)" }}>
                en nog {count(g.themas.length - 8)} kleinere
              </li>
            )}
          </ol>
        </Panel>
        <Panel title="Meest centrale documenten" subtitle="PageRank over de verbanden: waar de kennis samenkomt (× 1000)">
          <BarList rows={g.centraal.map((c) => ({ key: c.id, label: `${c.label} · ${GROEP[c.group] ?? c.group}`, value: c.score }))} emptyText="Nog geen verbanden." />
        </Panel>
        <Panel title="Bruggen" subtitle="Tussenligging: documenten die thema's aan elkaar knopen (× 1000); valt er een weg, dan raken delen elkaar niet meer">
          <BarList rows={g.bruggen.map((c) => ({ key: c.id, label: `${c.label} · ${GROEP[c.group] ?? c.group}`, value: c.score }))} emptyText="Geen document ligt op een kortste pad tussen andere." />
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Het netwerk in cijfers" subtitle="Hoe dicht, hoe verbonden en hoe ver uit elkaar">
          <InfoList
            rows={[
              { label: "Dichtheid", value: `${(g.cijfers.dichtheid * 100).toFixed(1)}% van alle mogelijke verbanden` },
              { label: "Verbanden per document", value: `gemiddeld ${g.cijfers.gemiddeldeGraad}, hoogstens ${g.cijfers.maxGraad}` },
              { label: "Samenhangende delen", value: `${count(g.cijfers.delen)}, het grootste ${count(g.cijfers.grootsteDeel)} documenten` },
              { label: "Diameter", value: `${g.cijfers.diameter} ${g.cijfers.diameter === 1 ? "stap" : "stappen"} tussen de verste twee documenten` },
              { label: "Modulariteit", value: `${g.modulariteit.toFixed(2)} (${structuurTekst(g.modulariteit)})` },
              { label: "Semantische laag", value: g.semantisch > 0 ? `${count(g.semantisch)} documenten met een vector` : "nog niet (na de RAG-herindexering)" },
            ]}
          />
        </Panel>
        <Panel title="Hiaten en ontbrekende schakels" subtitle="Waar het brein dun is en welke verwijzing het dichter maakt">
          <ul className="space-y-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            {g.hiaten.los.length > 0 && (
              <li>
                <span className="font-medium" style={{ color: "var(--a-text)" }}>
                  {count(g.hiaten.los.length)} {g.hiaten.los.length === 1 ? "document staat" : "documenten staan"} los
                </span>
                : {g.hiaten.los.map(labelVan).slice(0, 6).join(", ")}
                {g.hiaten.los.length > 6 ? "…" : ""}. Koppel ze met een verwijzing in een gids of neem de begrippen over.
              </li>
            )}
            {g.hiaten.eilandjes.length > 0 && (
              <li>
                <span className="font-medium" style={{ color: "var(--a-text)" }}>
                  {count(g.hiaten.eilandjes.length)} {g.hiaten.eilandjes.length === 1 ? "eilandje" : "eilandjes"} van twee
                </span>
                : {g.hiaten.eilandjes.slice(0, 3).map((e) => e.map(labelVan).join(" + ")).join("; ")}.
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
            {g.brugsuggesties.slice(0, 5).map((s) => (
              <li key={s.begrip}>
                <span className="font-medium" style={{ color: "var(--a-text)" }}>
                  Ontbrekende schakel „{s.begrip}”
                </span>
                : speelt in thema {s.themas.join(" en ")} ({s.docs.slice(0, 3).map((d) => d.label).join(", ")}), maar geen lijn verbindt die thema&apos;s. Een verwijzing of gids hierover knoopt ze aan elkaar.
              </li>
            ))}
            {g.semantisch === 0 && (
              <li>
                <span className="font-medium" style={{ color: "var(--a-text)" }}>
                  Geen semantische laag
                </span>
                : de embeddings van het corpus staan niet in de index. Na de dagelijkse RAG-herindexering (Systeem → RAG-lab) komen de paarse verbanden erbij.
              </li>
            )}
            {g.hiaten.los.length === 0 && g.hiaten.eilandjes.length === 0 && g.hiaten.dunneBegrippen.length === 0 && g.brugsuggesties.length === 0 && g.semantisch > 0 && <li>Geen hiaten gevonden: alles hangt aan elkaar.</li>}
          </ul>
        </Panel>
        <div className="space-y-4">
          <Panel title="Groei" subtitle={gr.laatste ? `Momentopnamen elke nacht; laatste ${gr.laatste}` : "Elke nacht een momentopname; de reeks begint na de eerste"}>
            {gr.reeks.length < 2 ? (
              <p className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                Nog geen reeks. De cron maakt om 01:10 UTC een momentopname; vanaf de tweede verschijnt hier de groei en wat er bijkwam.
              </p>
            ) : (
              <div className="space-y-3 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Spark data={reeksDocs} width={96} height={30} />
                    <span>
                      documenten {eerste?.documenten} → {laatste?.documenten}
                      {delta(eerste?.documenten, laatste?.documenten) !== null ? ` (${(delta(eerste?.documenten, laatste?.documenten) ?? 0) >= 0 ? "+" : ""}${delta(eerste?.documenten, laatste?.documenten)}%)` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Spark data={reeksLijnen} width={96} height={30} />
                    <span>
                      verbanden {eerste?.lijnen} → {laatste?.lijnen}
                    </span>
                  </div>
                </div>
                {gr.verschil && (
                  <ul className="space-y-1">
                    <li>
                      Sinds de vorige opname: {count(gr.verschil.nieuweKnopen.length)} nieuwe {gr.verschil.nieuweKnopen.length === 1 ? "knoop" : "knopen"}, {count(gr.verschil.wegKnopen.length)} weg; {count(gr.verschil.nieuweLijnen.length)} nieuwe {gr.verschil.nieuweLijnen.length === 1 ? "verband" : "verbanden"}, {count(gr.verschil.wegLijnen.length)} weg.
                    </li>
                    {gr.verschil.nieuweKnopen.length > 0 && <li>Nieuw: {gr.verschil.nieuweKnopen.slice(0, 6).map(labelVan).join(", ")}{gr.verschil.nieuweKnopen.length > 6 ? "…" : ""}.</li>}
                  </ul>
                )}
                <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>
                  {count(gr.reeks.length)} momentopnamen, van {eerste?.dag} tot {laatste?.dag}; semantische laag nu {laatste?.semantisch ?? 0} documenten, {laatste?.themas ?? 0} thema&apos;s.
                </p>
              </div>
            )}
          </Panel>
          <Panel title="Voor wie" subtitle="Passages per publiek; alleen openbaar en eigen rol bereiken ooit een prompt">
            <StackBar segments={Object.entries(g.publiek).map(([k, v], i) => ({ label: PUBLIEK[k] ?? k, value: v, slot: i + 1 }))} />
          </Panel>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Berekend op {new Date(g.op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}; de graaf wordt elke tien minuten opnieuw berekend. Begrippen komen uit TF-IDF over het corpus; verbanden uit woordoverlap (Jaccard) en, waar de index ze heeft, de echte embeddings (cosinus ≥ 0,5). Thema&apos;s via labelpropagatie, centraliteit via PageRank, bruggen via tussenligging (Brandes). Exporteren kan als JSON, GraphML, DOT, CSV of rapport, via de knop Exporteren in de grafiek.
      </p>
    </div>
  );
}
