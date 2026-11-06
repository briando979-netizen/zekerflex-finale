// Shopping cart extended with purchase mode per item

import type { PurchaseMode } from "./purchase-mode";

export interface CartItem {
  variantId: string;
  quantity: number;
  purchaseMode?: PurchaseMode; // None = default to onetime
}

export interface Cart {
  items: CartItem[];
  purchaseMode: PurchaseMode; // Global choice for all items
}

export function createCart(): Cart {
  return {
    items: [],
    purchaseMode: "onetime",
  };
}

export function addToCart(cart: Cart, variantId: string, quantity: number): Cart {
  const existing = cart.items.find((i) => i.variantId === variantId);
  if (existing) {
    return {
      ...cart,
      items: cart.items.map((i) =>
        i.variantId === variantId ? { ...i, quantity: i.quantity + quantity } : i
      ),
    };
  }
  return {
    ...cart,
    items: [...cart.items, { variantId, quantity, purchaseMode: cart.purchaseMode }],
  };
}

export function setCartPurchaseMode(cart: Cart, mode: PurchaseMode): Cart {
  return {
    ...cart,
    purchaseMode: mode,
    items: cart.items.map((i) => ({ ...i, purchaseMode: mode })),
  };
}
