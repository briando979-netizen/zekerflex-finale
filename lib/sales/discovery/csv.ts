import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createLead } from "@/lib/sales/leads";

// ---------------------------------------------------------------------------
// CSV import for sales leads. Header row required; recognised columns
// (case-insensitive, order-independent):
//   companyName | bedrijf | naam
//   email | contactEmail | e-mail
//   contactName | contactpersoon
//   kvk | kvkNumber
//   city | plaats
//   sector | branche
//   phone | telefoon
//   vacancy | vacature | vacancySignal
// Separator: comma or semicolon (auto-detected).
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string> = {
  company: "companyName", companyname: "companyName", bedrijf: "companyName",
  bedrijfsnaam: "companyName", naam: "companyName", name: "companyName",
  email: "email", "e-mail": "email", contactemail: "email", mail: "email",
  contactname: "contactName", contactpersoon: "contactName", contact: "contactName",
  kvk: "kvkNumber", kvknummer: "kvkNumber", kvknumber: "kvkNumber",
  city: "city", plaats: "city", stad: "city", woonplaats: "city",
  sector: "sector", branche: "sector", branch: "sector",
  phone: "phone", telefoon: "phone", tel: "phone",
  vacancy: "vacancy", vacature: "vacancy", vacaturesignaal: "vacancy", vacancysignal: "vacancy",
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === sep && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface CsvImportResult {
  created: number;
  skipped: number;
  rows: number;
  errors: string[];
}

export async function importLeadsFromCsv(
  campaignId: string | null,
  fileText: string,
  byUserId: string,
): Promise<CsvImportResult> {
  const res: CsvImportResult = { created: 0, skipped: 0, rows: 0, errors: [] };
  const lines = fileText.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    res.errors.push("Bestand heeft geen datarijen.");
    return res;
  }
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0]!, sep).map((h) => HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, "")] ?? "");
  if (!header.includes("companyName") && !header.includes("email")) {
    res.errors.push("Kolom 'companyName' of 'email' ontbreekt in de header.");
    return res;
  }

  for (let i = 1; i < lines.length && res.rows < 2000; i++) {
    res.rows += 1;
    const cells = splitLine(lines[i]!, sep);
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      if (key && cells[idx]) row[key] = cells[idx]!.trim();
    });
    const companyName = row.companyName || (row.email ? row.email.split("@")[1] ?? "" : "");
    if (!companyName) {
      res.skipped += 1;
      continue;
    }
    const email = row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) ? row.email.toLowerCase() : undefined;
    const kvk = row.kvkNumber ? row.kvkNumber.replace(/\D/g, "") : undefined;

    // Dedupe on email or KVK.
    const existing = await prisma.salesLead.findFirst({
      where: {
        OR: [
          ...(email ? [{ contactEmail: email }] : []),
          ...(kvk && kvk.length === 8 ? [{ kvkNumber: kvk }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing || (!email && !kvk)) {
      res.skipped += 1;
      continue;
    }

    try {
      await createLead({
        companyName,
        source: "import",
        createdById: byUserId,
        ...(campaignId ? { campaignId } : {}),
        ...(email ? { contactEmail: email } : {}),
        ...(row.contactName ? { contactName: row.contactName } : {}),
        ...(kvk && kvk.length === 8 ? { kvkNumber: kvk } : {}),
        ...(row.city ? { city: row.city } : {}),
        ...(row.sector ? { sector: row.sector } : {}),
        ...(row.phone ? { contactPhone: row.phone } : {}),
        ...(row.vacancy ? { vacancySignal: row.vacancy } : {}),
      });
      res.created += 1;
    } catch (err) {
      res.errors.push(`Rij ${i + 1}: ${(err as Error).message}`);
    }
  }

  logger.info("csv lead import", { campaignId, ...res, errors: res.errors.length });
  return res;
}
