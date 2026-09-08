import { requirePrincipal } from "@/lib/auth";
import { activeUitzendContract, listUitzendContracts } from "@/lib/agreements/uitzend-contract";
import { uitzendContractPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/uitzend/contract/pdf[?id=...] — the signed uitzendovereenkomst.
export async function GET(req: Request): Promise<Response> {
  const p = await requirePrincipal();
  const id = new URL(req.url).searchParams.get("id");

  const contract = id
    ? (await listUitzendContracts(p.userId)).find((c) => c.id === id) ?? null
    : await activeUitzendContract(p.userId);
  if (!contract) return new Response("Geen ondertekende uitzendovereenkomst gevonden", { status: 404 });

  const { bytes, filename } = uitzendContractPdf(contract);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
