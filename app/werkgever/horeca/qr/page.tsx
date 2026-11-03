import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { beheerContext } from "@/lib/horeca/toegang";
import { tafelsVan } from "@/lib/horeca/bestellingen";
import { PrintKnop } from "@/components/horeca/beheer/PrintKnop";

export const metadata: Metadata = { title: "QR-codes per tafel" };
export const dynamic = "force-dynamic";

// Printvel met per actieve tafel een QR-code naar /horeca/<slug>/tafel/<code>.
// Knip ze uit of zet ze in een standaardje op tafel.

const PRINT = `@media print {
  body * { visibility: hidden; }
  #qr-vel, #qr-vel * { visibility: visible; }
  #qr-vel { position: absolute; inset: 0 auto auto 0; width: 100%; }
  .niet-printen { display: none !important; }
}`;

export default async function QrPagina() {
  const { zaak } = await beheerContext().catch(() => ({ zaak: null }));
  if (!zaak) notFound();
  const basis = env.APP_BASE_URL.replace(/\/+$/, "");
  const tafels = (await tafelsVan(zaak.id)).filter((t) => t.actief);
  const codes = await Promise.all(
    tafels.map(async (t) => ({ t, svg: await QRCode.toString(`${basis}/horeca/${zaak.slug}/tafel/${t.code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) })),
  );
  return (
    <section>
      <style>{PRINT}</style>
      <div className="niet-printen mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">QR-codes per tafel</h1>
          <p className="text-sm text-neutralx-600">Gasten scannen de code en bestellen zelf. Een vernieuwde code (Tafels & QR) moet je opnieuw printen.</p>
        </div>
        <PrintKnop />
      </div>
      {codes.length === 0 ? (
        <p className="card p-5 text-sm text-neutralx-600">Nog geen actieve tafels. Maak ze aan onder Horeca → Tafels & QR.</p>
      ) : (
        <div id="qr-vel" className="grid grid-cols-2 gap-4 md:grid-cols-3 print:grid-cols-3">
          {codes.map(({ t, svg }) => (
            <figure key={t.id} className="card break-inside-avoid p-4 text-center">
              <div className="mx-auto w-40" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
              <figcaption className="mt-2">
                <span className="block font-display text-lg font-bold text-ink">{t.naam}</span>
                <span className="block text-xs text-neutralx-600">Scan om te bestellen · {zaak.naam}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
