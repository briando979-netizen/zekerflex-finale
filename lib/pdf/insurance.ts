import { prisma } from "@/lib/prisma";
import { SimplePdf } from "@/lib/pdf/simple";

const nlDate = (d: Date) => d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });

/** A "verzekeringsbewijs" for a worker — indicative cover while on a ZekerFlex shift. */
export async function insurancePdf(userId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  if (!user) return null;

  const pdf = new SimplePdf();
  pdf.heading("Verzekeringsbewijs", 20);
  pdf.line("ZekerFlex collectieve dekking tijdens diensten", 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(8);
  pdf.rule();

  pdf.row("Naam", user.fullName, { bold: true });
  pdf.row("Afgegeven op", nlDate(new Date()));
  pdf.row("Geldig", "zolang je actief bent op ZekerFlex");
  pdf.gap(8);
  pdf.rule();

  pdf.line("Gedekt tijdens een via ZekerFlex geaccepteerde dienst:", 10, { bold: true });
  pdf.gap(2);
  pdf.line("- Bedrijfsaansprakelijkheid (schade aan derden) tijdens de werkzaamheden", 9.5);
  pdf.line("- Ongevallen tijdens werk en woon-werkverkeer op de dienstdag", 9.5);
  pdf.line("- Rechtsbijstand bij een geschil dat voortkomt uit een ZekerFlex-dienst", 9.5);
  pdf.gap(8);
  pdf.line("Niet gedekt:", 10, { bold: true });
  pdf.gap(2);
  pdf.line("- Opzet, grove schuld of werken onder invloed", 9.5);
  pdf.line("- Schade buiten de geaccepteerde dienst of aan eigen materiaal", 9.5);
  pdf.line("- Werkzaamheden die niet in de dienstomschrijving stonden", 9.5);
  pdf.gap(12);
  pdf.rule();
  pdf.line(
    "Dit bewijs is indicatief. De volledige voorwaarden en het polisnummer vind je in je account onder Verzekering.",
    8.5,
    { color: [0.4, 0.45, 0.42] },
  );
  pdf.line("ZekerFlex Sovereign Box — 100% in Nederland gehost.", 8.5, { color: [0.4, 0.45, 0.42] });

  return { bytes: pdf.toBuffer(), filename: "zekerflex-verzekeringsbewijs.pdf" };
}
