// Shop product management

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  discountedPriceCents?: number;
  category: "tools" | "software" | "training" | "support" | "hardware";
  image?: string;
  sku: string;
  stock?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  active: boolean;
  featured: boolean;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    id: "tools",
    name: "Gereedschap",
    description: "Tools en apparatuur",
    icon: "🔧",
    color: "#FF6B35",
  },
  {
    id: "software",
    name: "Software",
    description: "Apps en diensten",
    icon: "💻",
    color: "#004E89",
  },
  {
    id: "training",
    name: "Training",
    description: "Cursussen en lessen",
    icon: "📚",
    color: "#7209B7",
  },
  {
    id: "support",
    name: "Ondersteuning",
    description: "Help en consultatie",
    icon: "🤝",
    color: "#F72585",
  },
  {
    id: "hardware",
    name: "Hardware",
    description: "Apparaten en sensoren",
    icon: "⚙️",
    color: "#FB5607",
  },
];

export async function createProduct(data: Partial<Product>): Promise<Product> {
  // TODO: Store in database
  return {
    id: `prod_${Date.now()}`,
    name: data.name || "Product",
    description: data.description || "",
    priceCents: data.priceCents || 0,
    category: data.category || "tools",
    sku: data.sku || "",
    active: true,
    featured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  // TODO: Update in database
  return {
    id,
    name: data.name || "",
    description: data.description || "",
    priceCents: data.priceCents || 0,
    category: data.category || "tools",
    sku: data.sku || "",
    active: data.active ?? true,
    featured: data.featured ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

export async function deleteProduct(id: string): Promise<void> {
  // TODO: Delete from database
}

export async function getProducts(active?: boolean): Promise<Product[]> {
  // TODO: Fetch from database
  return [];
}

export async function getFeaturedProducts(): Promise<Product[]> {
  // TODO: Fetch featured products
  return [];
}

export function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}
