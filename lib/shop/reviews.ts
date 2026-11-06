// Product reviews and ratings

export interface Review {
  id: string;
  productId: string;
  customerId: string;
  orderId: string;
  rating: number; // 1-5
  title: string;
  content: string;
  verified: boolean; // verified purchase
  helpful: number; // count
  unhelpful: number; // count
  images?: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRating {
  productId: string;
  averageRating: number; // 1-5
  totalReviews: number;
  distribution: {
    "5": number;
    "4": number;
    "3": number;
    "2": number;
    "1": number;
  };
}

export async function createReview(data: Partial<Review>): Promise<Review> {
  return {
    id: `review_${Date.now()}`,
    productId: data.productId || "",
    customerId: data.customerId || "",
    orderId: data.orderId || "",
    rating: data.rating || 5,
    title: data.title || "",
    content: data.content || "",
    verified: true,
    helpful: 0,
    unhelpful: 0,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

export async function approveReview(id: string): Promise<Review> {
  // TODO: Update in database
  return { id, productId: "", customerId: "", orderId: "", rating: 5, title: "", content: "", verified: true, helpful: 0, unhelpful: 0, status: "approved", createdAt: new Date(), updatedAt: new Date() };
}

export async function getProductRating(productId: string): Promise<ProductRating> {
  // TODO: Calculate from all approved reviews
  return {
    productId,
    averageRating: 4.5,
    totalReviews: 0,
    distribution: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
  };
}

export async function getProductReviews(productId: string, limit: number = 10): Promise<Review[]> {
  // TODO: Fetch from database
  return [];
}

export function getRatingColor(rating: number): string {
  if (rating >= 4.5) return "var(--a-ok)"; // green
  if (rating >= 3.5) return "var(--a-warn)"; // amber
  return "var(--a-crit)"; // red
}

export function getRatingLabel(rating: number): string {
  if (rating >= 4.5) return "Uitstekend";
  if (rating >= 4) return "Goed";
  if (rating >= 3) return "Gemiddeld";
  if (rating >= 2) return "Matig";
  return "Slecht";
}
