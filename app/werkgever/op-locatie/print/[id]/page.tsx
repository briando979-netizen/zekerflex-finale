import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requirePrincipal } from "@/lib/auth";
import { LABEL_FORMAAT } from "@/lib/locatie/modules";
import { opdracht } from "@/lib/locatie/printen";
import { locatieScope } from "@/lib/locatie/store";
import { AfdrukKnoppen } from "@/components/locatie/AfdrukKnoppen";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De afdrukpagina van één label (lib/locatie/printen.ts): precies het
// labelformaat in millimeters, zodat Ctrl+P op een labelprinter (Brother QL,
// Dymo, Zebra) het goed uitlijnt. Bij het printen verdwijnt alles behalve het
// label (visibility), ook de menubalk van de werkgeversomgeving.
// ---------------------------------------------------------------------------

export default async function PrintLabelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const principal = await requirePrincipal();
  const scope = await locatieScope(principal);
  const { id } = await params;
  const o = await opdracht(scope.tenantId, id);
  if (!o || (scope.branchIds && o.branchId && !scope.branchIds.includes(o.branchId))) notFound();
  const { auto } = await searchParams;
  const f = LABEL_FORMAAT[o.inhoud.soort];
  const bon = f.hoogte === 0;
  const breedte = `${f.breedte}mm`;
  const hoogte = bon ? "auto" : `${f.hoogte}mm`;
  const liggend = !bon && f.breedte > f.hoogte;
  // de QR-code als SVG uit onze eigen tekst (de qrcode-bibliotheek maakt alleen paden)
  const qr = o.inhoud.qr ? await QRCode.toString(o.inhoud.qr, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;
  const css = `
    @media print {
      body * { visibility: hidden !important; }
      #zf-label, #zf-label * { visibility: visible !important; }
      #zf-label { position: fixed !important; left: 0 !important; top: 0 !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; }
      @page { size: ${breedte} ${bon ? "auto" : hoogte}; margin: 0; }
    }
  `;

  return (
    <div className="mx-auto max-w-2xl">
      <AfdrukKnoppen auto={auto === "1"} terug="/werkgever/op-locatie?tab=printen" />
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <p className="mb-2 text-xs text-neutralx-500 print:hidden">
        {f.naam} · {f.breedte} mm{bon ? " rol" : ` × ${f.hoogte} mm`} · {f.uitleg}
      </p>
      <div
        id="zf-label"
        className="bg-white text-black shadow-card"
        style={{
          width: breedte,
          height: hoogte,
          minHeight: bon ? "40mm" : undefined,
          padding: "3mm",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: liggend ? "row" : "column",
          gap: "2mm",
          border: "1px dashed #bbb",
          fontFamily: "inherit",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: o.inhoud.soort === "verzendlabel" ? "flex-start" : "center", textAlign: o.inhoud.soort === "verzendlabel" ? "left" : "center" }}>
          {o.inhoud.soort === "incheckbon" && <p style={{ fontSize: "4mm", fontWeight: 700, margin: 0 }}>Ingecheckt</p>}
          <p
            style={{
              margin: 0,
              fontWeight: 800,
              lineHeight: 1.05,
              fontSize: o.inhoud.soort === "naamsticker" ? "7mm" : o.inhoud.soort === "verzendlabel" ? "6mm" : "7.5mm",
              overflowWrap: "anywhere",
            }}
          >
            {o.inhoud.kop}
          </p>
          {o.inhoud.regels.map((r, i) => (
            <p key={i} style={{ margin: "1mm 0 0", fontSize: o.inhoud.soort === "naamsticker" ? "3.5mm" : "4mm", lineHeight: 1.15, overflowWrap: "anywhere" }}>
              {r}
            </p>
          ))}
          {o.inhoud.tijd && <p style={{ margin: "1.5mm 0 0", fontSize: "3mm", color: "#444" }}>{o.inhoud.tijd}</p>}
          {o.inhoud.voet && <p style={{ margin: "auto 0 0", paddingTop: "1.5mm", fontSize: "3mm", fontWeight: 600 }}>{o.inhoud.voet}</p>}
        </div>
        {qr && (
          <div
            aria-label="QR-code"
            style={{ width: liggend ? "22mm" : "100%", display: "flex", justifyContent: "center", alignItems: "flex-end" }}
            dangerouslySetInnerHTML={{ __html: qr.replace("<svg", `<svg style="width:${liggend ? "22mm" : o.inhoud.soort === "incheckbon" ? "30mm" : "26mm"};height:auto"`) }}
          />
        )}
      </div>
    </div>
  );
}
