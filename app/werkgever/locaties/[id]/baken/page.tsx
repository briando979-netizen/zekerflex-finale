import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel } from "@/components/app/ui";
import { BakenInstellingen } from "@/components/werkgever/BakenInstellingen";
import { bakenInstellingen, bakenUrl } from "@/lib/checkin/baken";
import { qrEncode, qrSvgPath } from "@/lib/qr/encode";

export const dynamic = "force-dynamic";

// Werkgever → Locaties → Locatiebaken: instellingen + de printbare QR-poster
// (A4, zonder scripts: gewoon Ctrl+P). Lees lib/checkin/baken.ts.
export default async function BakenPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const branch = await prisma.branch.findFirst({
    where: { AND: [{ id }, scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } }] },
    select: { id: true, name: true, addressLine: true, city: true, geofenceRadiusMeters: true, tenant: { select: { name: true } } },
  });
  if (!branch) notFound();
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const inst = await bakenInstellingen(branch.id);
  const url = inst.qr ? bakenUrl(branch.id, inst.qrVersie) : null;
  const matrix = url ? qrEncode(url) : null;

  return (
    <>
      <PageHeader
        title={`Locatiebaken: ${branch.name}`}
        eyebrow="Locaties"
        subtitle={`${branch.addressLine}, ${branch.city} · geofence ${branch.geofenceRadiusMeters} m. Krachten checken automatisch in op de geofence, of met de QR-code of het Bluetooth-baken op de werkplek.`}
      />
      <p className="mb-4 text-sm">
        <Link href="/werkgever/locaties" className="text-brand-600 hover:underline">
          ← Alle locaties
        </Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel title="Instellingen">
          <div className="p-5">
            <BakenInstellingen branchId={branch.id} canManage={canManage} />
          </div>
        </Panel>

        <Panel title="Poster om te printen" subtitle={inst.qr ? "Ctrl+P / Afdrukken: alleen de poster komt op papier" : "Zet eerst de QR-code aan"}>
          <div className="p-5">
            {matrix && url ? (
              <div className="zf-poster rounded-2xl border border-hair bg-white p-6 text-center">
                <p className="font-display text-2xl font-bold text-ink">Inchecken</p>
                <p className="mt-1 text-sm text-neutralx-600">
                  {branch.tenant.name} · {branch.name}
                </p>
                <svg viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} className="mx-auto mt-4 w-56" role="img" aria-label="QR-code om in te checken" shapeRendering="crispEdges">
                  <rect width="100%" height="100%" fill="#fff" />
                  <path d={qrSvgPath(matrix)} fill="#0b1f1a" />
                </svg>
                <p className="mt-4 text-sm font-semibold text-ink">Scan met je telefoon om in te checken</p>
                <p className="mt-1 text-xs text-neutralx-500">Werkt met de camera-app of in de ZekerFlex-app. Bij vertrek nog een keer scannen om uit te checken.</p>
                <p className="mt-3 break-all text-[10px] text-neutralx-400">{url.replace(/\?.*$/, "")}</p>
              </div>
            ) : (
              <p className="text-sm text-neutralx-500">Zodra de QR-code aanstaat verschijnt hier de poster.</p>
            )}
          </div>
        </Panel>
      </div>

      <style>{`@media print { body * { visibility: hidden !important; } .zf-poster, .zf-poster * { visibility: visible !important; } .zf-poster { position: fixed; inset: 0; margin: auto; width: 180mm; height: fit-content; border: none; } }`}</style>
    </>
  );
}
