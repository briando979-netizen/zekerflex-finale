import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { terminalVan } from "@/lib/incheck/store";

export const dynamic = "force-dynamic";

// De sticker bij de ingang, om te printen (A6) en op een NFC-tag te zetten. De
// QR en de tag wijzen allebei naar zekerflex.com/i/<code>: een tik of scan opent
// de incheckpagina van de kracht.
export default async function StickerPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const t = tenantId ? await terminalVan(tenantId, id) : null;
  if (!t) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: t.branchId }, select: { name: true, tenant: { select: { name: true } } } });
  const url = `${new URL(env.APP_BASE_URL).origin}/i/${t.code}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-neutralx-600">
          Print deze sticker (A6) en hang hem bij de ingang. Zet voor NFC dezelfde link op een sticker-tag (NTAG213 of NTAG215, een paar cent per stuk) met een gratis app zoals NFC Tools: kies <em>Schrijven → URL</em>.
        </p>
        <PrintKnop />
      </div>
      <div className="mx-auto w-[105mm] rounded-[18px] border-2 border-ink bg-white p-6 text-ink print:border-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">ZekerFlex · inchecken</p>
        <p className="mt-2 text-2xl font-black leading-tight">Houd je telefoon hier</p>
        <p className="text-sm text-neutralx-600">of scan de code. Daarna: tik op Inchecken.</p>
        <div className="mx-auto mt-4 w-48 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 text-center font-mono text-sm">{url.replace(/^https?:\/\//, "")}</p>
        <p className="mt-3 border-t border-hair pt-3 text-xs text-neutralx-500">
          {branch?.tenant.name} · {branch?.name} · {t.naam}
        </p>
      </div>
    </div>
  );
}

function PrintKnop() {
  // een gewone link naar window.print() mag niet zonder script; het menu van de browser (Ctrl+P) werkt altijd
  return <p className="text-sm font-semibold text-ink">Printen: Ctrl+P (of ⌘P)</p>;
}
