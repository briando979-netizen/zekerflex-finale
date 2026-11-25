import { kvGet, kvSet } from "@/lib/storage/kv";

interface DpaStand {
  ondertekend: boolean;
  ondertekendOp?: string;
  naam?: string;
}

function sleutel(tenantId: string) {
  return `dpa:${tenantId}`;
}

export async function getDpaStand(tenantId: string): Promise<DpaStand> {
  const raw = await kvGet<unknown>(sleutel(tenantId));
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return {
      ondertekend: o.ondertekend === true,
      ondertekendOp: typeof o.ondertekendOp === "string" ? o.ondertekendOp : undefined,
      naam: typeof o.naam === "string" ? o.naam : undefined,
    };
  }
  return { ondertekend: false };
}

export async function zetDpaOndertekend(tenantId: string, naam: string): Promise<DpaStand> {
  const stand: DpaStand = {
    ondertekend: true,
    ondertekendOp: new Date().toISOString(),
    naam,
  };
  await kvSet(sleutel(tenantId), stand);
  return stand;
}
