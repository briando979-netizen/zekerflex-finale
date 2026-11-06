// Product wishlists

export interface Wishlist {
  id: string;
  customerId: string;
  name: string;
  isPublic: boolean;
  items: WishlistItem[];
  createdAt: Date;
  sharedWith?: string[]; // customer IDs
}

export interface WishlistItem {
  productId: string;
  addedAt: Date;
  priority?: "high" | "normal" | "low";
  notes?: string;
}

export async function createWishlist(customerId: string, name: string): Promise<Wishlist> {
  return {
    id: `wishlist_${Date.now()}`,
    customerId,
    name,
    isPublic: false,
    items: [],
    createdAt: new Date(),
  };
}

export async function addToWishlist(
  wishlistId: string,
  productId: string,
  priority?: "high" | "normal" | "low"
): Promise<void> {
  // TODO: Add to database
}

export async function removeFromWishlist(wishlistId: string, productId: string): Promise<void> {
  // TODO: Remove from database
}

export async function getCustomerWishlists(customerId: string): Promise<Wishlist[]> {
  // TODO: Fetch from database
  return [];
}

export async function shareWishlist(wishlistId: string, customerIds: string[]): Promise<void> {
  // TODO: Add share relationships
}
