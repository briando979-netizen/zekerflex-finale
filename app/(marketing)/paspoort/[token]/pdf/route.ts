import { NextResponse } from "next/server";
import { SITE } from "@/lib/seo";
import { SimplePdf } from "@/lib/pdf/simple";
import { qrEncode } from "@/lib/qr/encode";
import { userIdFromToken } from "@/lib/passport/token";
import { isPassportPublic } from "@/lib/passport/share";
import { buildPassport } from "@/lib/passport/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtMonth(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL", { year: "numeric", month: "long" });
}

export async function GET(_req: Request, props: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await props.params;
  const userId = userIdFromToken(token);
  if (!userId || !(await isPassportPublic(userId))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Paspoort niet gevonden" } }, { status: 404 });
  }
  const p = await buildPassport(userId);
  if (!p) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Paspoort niet gevonden" } }, { status: 404 });

  const url = `${SITE.url}/paspoort/${token}`;
  const pdf = new SimplePdf();
  pdf.heading("Werkpaspoort — ZekerFlex", 20);
  pdf.line(p.fullName, 14, { bold: true });
  pdf.line(`Flexprofessional bij ZekerFlex sinds ${fmtMonth(p.memberSince)}`, 10, { color: [90, 90, 90] });
  pdf.gap(4);
  if (p.kvkVerified) pdf.row("KVK (geverifieerd)", p.kvkNumber);
  pdf.row("Niveau", p.badgeLevel);
  pdf.row("Diensten afgerond", String(p.shiftsCompleted));
  pdf.row("Betrouwbaarheid", `${Math.round(p.reliabilityScore * 100)}%`);
  if (p.rating.count > 0) pdf.row("Beoordeling", `${p.rating.average} / 5 (${p.rating.count} reviews)`);
  pdf.rule();

  if (p.skills.length > 0) {
    pdf.section("Vaardigheden");
    for (const s of p.skills) {
      pdf.row(s.name, `${s.rating > 0 ? `★ ${s.rating}` : "—"} · ${s.shiftsWorked}×`);
    }
  }

  if (p.certificates.length > 0) {
    pdf.section("Certificaten");
    for (const c of p.certificates) {
      const extra = [c.number ? `nr. ${c.number}` : null, c.expiresOn ? `geldig t/m ${fmtMonth(c.expiresOn)}` : null]
        .filter(Boolean)
        .join(" · ");
      pdf.item("✓", extra ? `${c.label} (${extra})` : c.label);
    }
  }

  pdf.section("Echtheid");
  pdf.line(`Referentie: ${p.seal.reference}`, 9, { color: [90, 90, 90] });
  pdf.line(`Inhoudshash: ${p.seal.contentHash}`, 8, { color: [120, 120, 120] });
  pdf.line(`Verzegeld: ${new Date(p.seal.sealedAt).toLocaleString("nl-NL")}`, 9, { color: [90, 90, 90] });
  pdf.gap(6);
  pdf.line("Scan om dit paspoort online te openen en te verifiëren:", 9);
  pdf.qr(qrEncode(url), 110);
  pdf.line(url, 8, { color: [120, 120, 120] });

  const bytes = pdf.toBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="werkpaspoort-${p.seal.reference}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
