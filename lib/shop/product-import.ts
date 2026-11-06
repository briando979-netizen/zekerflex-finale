// Product import/export utilities

import { Product } from "@/lib/shop/products";

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export function parseCSVProducts(csv: string): Product[] {
  const lines = csv.split("\n");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const products: Product[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};

    header.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });

    if (!row["name"] || !row["price"]) continue;

    const product: Product = {
      id: `prod_${Date.now()}_${i}`,
      name: row["name"],
      description: row["description"] || "",
      priceCents: Math.round(parseFloat(row["price"]) * 100),
      category: (row["category"] as any) || "tools",
      sku: row["sku"] || `SKU-${Date.now()}`,
      active: row["active"] !== "false",
      featured: row["featured"] === "true",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    products.push(product);
  }

  return products;
}

export function exportProductsCSV(products: Product[]): string {
  const header = ["id", "name", "description", "price", "category", "sku", "stock", "active", "featured"].join(",");
  const rows = products.map(
    (p) =>
      [p.id, p.name, p.description, (p.priceCents / 100).toFixed(2), p.category, p.sku || "", p.stock || "", p.active, p.featured].join(",")
  );
  return [header, ...rows].join("\n");
}

export async function importProductsFromFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const products = parseCSVProducts(text);

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
  };

  for (const product of products) {
    // TODO: Validate and save to database
    result.imported++;
  }

  return result;
}
