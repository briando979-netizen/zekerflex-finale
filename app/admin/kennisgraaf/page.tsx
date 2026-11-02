import { getPrincipal, hasRole } from "@/lib/auth";
import { knowledgeGraph } from "@/lib/rag/graph";
import { count } from "@/lib/admin/format";
import { Empty, KpiStrip, PageHead, Panel } from "@/components/admin/kit";
import { KnowledgeGraph } from "@/components/admin/KnowledgeGraph";

export const dynamic = "force-dynamic";

export default async function KennisGraafPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De kennisgraaf is alleen beschikbaar voor platformbeheerders." />;
  }
  const data = knowledgeGraph();
  const connected = new Set(data.edges.flatMap((e) => [e.source, e.target]));
  return (
    <div className="space-y-4">
      <PageHead
        title="Kennisgraaf"
        subtitle="Het brein van ZekerFlex als netwerk: elke stip is een kennisdocument, elke lijn een inhoudelijk verband. Sleep stippen, zoom met scrollen, klik om de bron te openen."
      />
      <KpiStrip
        items={[
          { label: "Documenten", value: count(data.nodes.length), hint: "in het brein" },
          { label: "Verbanden", value: count(data.edges.length), hint: "op basis van overlap in begrippen" },
          { label: "Zonder verband", value: count(data.nodes.length - data.nodes.filter((n) => connected.has(n.id)).length), hint: "staan nog los" },
        ]}
      />
      {data.nodes.length === 0 ? (
        <Panel><Empty title="Nog geen kennisdocumenten" body="Er zijn geen kennisdocumenten gevonden in deze versie." /></Panel>
      ) : (
        <KnowledgeGraph nodes={data.nodes} edges={data.edges} />
      )}
    </div>
  );
}
