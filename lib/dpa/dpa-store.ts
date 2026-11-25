import { kvGet, kvSet } from "@/lib/storage/kv";

export interface DpaOndertekening {
  versie: string;
  ondertekendOp: string;
  naam: string;
}

export interface DpaStand {
  ondertekend: boolean;
  ondertekendOp?: string;
  naam?: string;
  versies?: DpaOndertekening[];
}

function sleutel(tenantId: string) {
  return `dpa:${tenantId}`;
}

export async function getDpaStand(tenantId: string): Promise<DpaStand> {
  const raw = await kvGet<unknown>(sleutel(tenantId));
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const versies: DpaOndertekening[] = Array.isArray(o.versies)
      ? (o.versies as unknown[]).flatMap((v) => {
          if (v && typeof v === "object") {
            const vo = v as Record<string, unknown>;
            if (typeof vo.versie === "string" && typeof vo.ondertekendOp === "string" && typeof vo.naam === "string") {
              return [{ versie: vo.versie, ondertekendOp: vo.ondertekendOp, naam: vo.naam }];
            }
          }
          return [];
        })
      : [];
    // legacy: enkelvoudige stand zonder versies-array
    if (versies.length === 0 && o.ondertekend === true && typeof o.ondertekendOp === "string" && typeof o.naam === "string") {
      versies.push({ versie: "1.0", ondertekendOp: o.ondertekendOp, naam: o.naam });
    }
    return {
      ondertekend: o.ondertekend === true || versies.length > 0,
      ondertekendOp: typeof o.ondertekendOp === "string" ? o.ondertekendOp : versies[versies.length - 1]?.ondertekendOp,
      naam: typeof o.naam === "string" ? o.naam : versies[versies.length - 1]?.naam,
      versies,
    };
  }
  return { ondertekend: false, versies: [] };
}

export async function zetDpaOndertekend(tenantId: string, naam: string): Promise<DpaStand> {
  const huidig = await getDpaStand(tenantId);
  const versienummer = `${(huidig.versies?.length ?? 0) + 1}.0`;
  const nieuw: DpaOndertekening = {
    versie: versienummer,
    ondertekendOp: new Date().toISOString(),
    naam,
  };
  const versies = [...(huidig.versies ?? []), nieuw];
  const stand: DpaStand = {
    ondertekend: true,
    ondertekendOp: nieuw.ondertekendOp,
    naam,
    versies,
  };
  await kvSet(sleutel(tenantId), stand);
  return stand;
}
