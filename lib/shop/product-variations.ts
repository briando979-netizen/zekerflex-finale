// Product variants and variations

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, string>; // {color: "red", size: "L"}
  price?: number; // cents, override product price
  stock: number;
  images?: string[];
  weight?: number; // grams
  barcode?: string;
  status: "active" | "inactive";
}

export interface VariantAttribute {
  name: string; // "color", "size", "material"
  values: string[]; // ["red", "blue", "green"]
  type: "dropdown" | "checkbox" | "text" | "color" | "image";
}

export async function createVariant(data: Partial<ProductVariant>): Promise<ProductVariant> {
  return {
    id: `var_${Date.now()}`,
    productId: data.productId || "",
    sku: data.sku || `SKU-${Date.now()}`,
    attributes: data.attributes || {},
    stock: data.stock || 0,
    status: "active",
    ...data,
  };
}

export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  // TODO: Fetch from database
  return [];
}

export function generateVariantSKU(productId: string, attributes: Record<string, string>): string {
  const attrStr = Object.values(attributes)
    .join("-")
    .substring(0, 10)
    .toUpperCase();
  return `${productId.substring(0, 4)}-${attrStr}`;
}

export async function bulkCreateVariants(
  productId: string,
  attributes: VariantAttribute[]
): Promise<ProductVariant[]> {
  // TODO: Create all combinations
  return [];
}
