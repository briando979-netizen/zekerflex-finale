import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { listUitzendContracts, voorbeeldUitzendContract } from "@/lib/agreements/uitzend-contract";
import { uitzendContractTekst } from "@/lib/agreements/uitzend-tekst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/uitzend/contract/tekst — de tekst van de uitzendovereenkomst om op het scherm te lezen.
//   zonder id: het voorbeeld zoals hij nu zou worden getekend (vóór het tekenen; er wordt niets bewaard);
//   ?id=…:     een eigen, al getekende overeenkomst (na het tekenen terug te lezen).
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const contract = (await listUitzendContracts(p.userId)).find((c) => c.id === id);
      if (!contract) throw AppError.notFound("Deze uitzendovereenkomst is niet gevonden.");
      return NextResponse.json(uitzendContractTekst(contract));
    }
    if (invoiceModeFor(await getFiscal(p.userId)) !== "payroll") {
      throw AppError.precondition("Alleen uitzendkrachten ondertekenen een uitzendovereenkomst.");
    }
    return NextResponse.json(uitzendContractTekst(await voorbeeldUitzendContract(p.userId, p.fullName), { voorbeeld: true }));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
