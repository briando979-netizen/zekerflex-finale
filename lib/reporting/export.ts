import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export type ExportFormat = "pdf" | "xlsx" | "csv" | "html";

// Generate PDF report
export async function generateReportPdf(reportId: string): Promise<string> {
  try {
    const report = await prisma.customReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    // Generate PDF content (requires external PDF library like puppeteer)
    // For now, we'll create a placeholder implementation
    const pdfContent = await generatePdfContent(report);

    // Save to storage
    const filename = `report-${Date.now()}.pdf`;
    const filepath = path.join(process.cwd(), "storage", "reports", filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filepath, pdfContent);
    return filepath;
  } catch (err) {
    console.error("Failed to generate PDF:", err);
    throw err;
  }
}

// Generate Excel report
export async function generateReportExcel(reportId: string): Promise<string> {
  try {
    const report = await prisma.customReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    // Use xlsx library to generate Excel
    const data = await extractReportData(report);
    const excelContent = generateExcelContent(data);

    // Save to storage
    const filename = `report-${Date.now()}.xlsx`;
    const filepath = path.join(process.cwd(), "storage", "reports", filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filepath, excelContent);
    return filepath;
  } catch (err) {
    console.error("Failed to generate Excel:", err);
    throw err;
  }
}

// Generate CSV report
export async function generateReportCsv(reportId: string): Promise<string> {
  try {
    const report = await prisma.customReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    const data = await extractReportData(report);
    const csvContent = generateCsvContent(data);

    // Save to storage
    const filename = `report-${Date.now()}.csv`;
    const filepath = path.join(process.cwd(), "storage", "reports", filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filepath, csvContent);
    return filepath;
  } catch (err) {
    console.error("Failed to generate CSV:", err);
    throw err;
  }
}

// Generate HTML report
export async function generateReportHtml(reportId: string): Promise<string> {
  try {
    const report = await prisma.customReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    const data = await extractReportData(report);
    const htmlContent = generateHtmlContent(report.title, data);

    return htmlContent;
  } catch (err) {
    console.error("Failed to generate HTML:", err);
    throw err;
  }
}

// Export report in multiple formats
export async function exportReport(
  reportId: string,
  formats: ExportFormat[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const format of formats) {
    try {
      switch (format) {
        case "pdf":
          results.pdf = await generateReportPdf(reportId);
          break;
        case "xlsx":
          results.xlsx = await generateReportExcel(reportId);
          break;
        case "csv":
          results.csv = await generateReportCsv(reportId);
          break;
        case "html":
          results.html = await generateReportHtml(reportId);
          break;
      }
    } catch (err) {
      console.error(`Failed to export ${format}:`, err);
    }
  }

  return results;
}

// Helper: Extract data from report
async function extractReportData(report: any) {
  const query = report.query || {};
  return {
    title: report.title,
    description: report.description,
    generatedAt: new Date(),
    data: query.data || [],
    summary: query.summary || {},
  };
}

// Helper: Generate PDF content
async function generatePdfContent(report: any): Promise<Buffer> {
  // Placeholder: In production, use puppeteer or similar
  const htmlContent = await generateReportHtml(report.id);
  // Would use puppeteer.launch().newPage().setContent(htmlContent).pdf()
  return Buffer.from(htmlContent);
}

// Helper: Generate Excel content
function generateExcelContent(data: any): Buffer {
  // Placeholder: In production, use xlsx library
  // For now, return a simple buffer
  const csv = generateCsvContent(data);
  return Buffer.from(csv);
}

// Helper: Generate CSV content
function generateCsvContent(data: any): string {
  let csv = `"${data.title}"\n`;
  csv += `"Generated at: ${data.generatedAt.toISOString()}"\n\n`;

  if (data.summary && Object.keys(data.summary).length > 0) {
    csv += "Summary\n";
    for (const [key, value] of Object.entries(data.summary)) {
      csv += `"${key}","${value}"\n`;
    }
    csv += "\n";
  }

  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    const headers = Object.keys(data.data[0]);
    csv += headers.map((h) => `"${h}"`).join(",") + "\n";

    for (const row of data.data) {
      const values = headers.map((h) => `"${row[h] ?? ""}"`);
      csv += values.join(",") + "\n";
    }
  }

  return csv;
}

// Helper: Generate HTML content
function generateHtmlContent(title: string, data: any): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          table { border-collapse: collapse; width: 100%; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .summary { background-color: #f9f9f9; padding: 10px; margin-top: 20px; }
          .summary-item { margin: 5px 0; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated at: ${data.generatedAt.toISOString()}</p>

        ${
          data.summary && Object.keys(data.summary).length > 0
            ? `
          <div class="summary">
            <h2>Summary</h2>
            ${Object.entries(data.summary)
              .map(([key, value]) => `<div class="summary-item"><strong>${key}:</strong> ${value}</div>`)
              .join("")}
          </div>
        `
            : ""
        }

        ${
          data.data && Array.isArray(data.data) && data.data.length > 0
            ? `
          <h2>Details</h2>
          <table>
            <thead>
              <tr>
                ${Object.keys(data.data[0])
                  .map((h) => `<th>${h}</th>`)
                  .join("")}
              </tr>
            </thead>
            <tbody>
              ${data.data
                .map(
                  (row: any) => `
                <tr>
                  ${Object.values(row)
                    .map((v) => `<td>${v ?? ""}</td>`)
                    .join("")}
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        `
            : ""
        }
      </body>
    </html>
  `;
}

// Clean up old exports
export async function cleanupOldExports(daysOld: number = 7) {
  try {
    const reportsDir = path.join(process.cwd(), "storage", "reports");

    if (!fs.existsSync(reportsDir)) {
      return { deleted: 0 };
    }

    const files = fs.readdirSync(reportsDir);
    const now = Date.now();
    const cutoff = now - daysOld * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const file of files) {
      const filepath = path.join(reportsDir, file);
      const stats = fs.statSync(filepath);

      if (stats.mtime.getTime() < cutoff) {
        fs.unlinkSync(filepath);
        deleted++;
      }
    }

    return { deleted };
  } catch (err) {
    console.error("Failed to cleanup old exports:", err);
    throw err;
  }
}
