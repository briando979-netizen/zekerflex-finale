import { getPrincipal, hasRole } from "@/lib/auth";
import { knowledgeGraph } from "@/lib/rag/graph";
import { KnowledgeGraph } from "@/components/admin/KnowledgeGraph";

export const dynamic = "force-dynamic";

export default async function KennisGraafPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">De kennisgraaf is alleen beschikbaar voor platformbeheerders.</p>
      </main>
    );
  }

  const data = knowledgeGraph();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Kennisgraaf</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Het brein van ZekerFlex als netwerk — elke node is een kennisdocument, elke lijn een inhoudelijk verband
          (op basis van term-overlap). Sleep nodes, zoom met scrollen, klik om de bron te openen.
        </p>
      </div>
      {data.nodes.length === 0 ? (
        <p className="rounded-xl border border-hair bg-white p-6 text-sm text-neutralx-600">
          Nog geen kennisdocumenten gevonden in deze deploy.
        </p>
      ) : (
        <KnowledgeGraph nodes={data.nodes} edges={data.edges} />
      )}
    </div>
  );
}
