import { requirePrincipal } from "@/lib/auth";
import { activeUitzendContract, listUitzendContracts, voorbeeldUitzendContract, type UitzendContract } from "@/lib/agreements/uitzend-contract";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { uitzendContractPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/uitzend/contract/pdf[?id=...|voorbeeld=1][&download=1]
//   zonder parameters: de ondertekende, geldende overeenkomst; ?id=: een eerdere eigen overeenkomst;
//   ?voorbeeld=1: de overeenkomst zoals hij nu zou worden getekend, om te lezen VÓÓR het tekenen (niets wordt bewaard);
//   &download=1: als download in plaats van in de browser te openen.
export async function GET(req: Request): Promise<Response> {
  const p = await requirePrincipal();
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const bijlage = params.get("download") === "1" ? "attachment" : "inline";

  let contract: UitzendContract | null;
  const voorbeeld = params.get("voorbeeld") === "1";
  if (voorbeeld) {
    if (invoiceModeFor(await getFiscal(p.userId)) !== "payroll") {
      return new Response("Alleen uitzendkrachten ondertekenen een uitzendovereenkomst.", { status: 412 });
    }
    contract = await voorbeeldUitzendContract(p.userId, p.fullName);
  } else {
    contract = id
      ? (await listUitzendContracts(p.userId)).find((c) => c.id === id) ?? null
      : await activeUitzendContract(p.userId);
  }
  if (!contract) return new Response("Geen ondertekende uitzendovereenkomst gevonden", { status: 404 });

  const { bytes, filename } = uitzendContractPdf(contract, { voorbeeld });
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${bijlage}; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
