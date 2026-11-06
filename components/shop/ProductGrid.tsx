"use client";

import { Product, formatPrice } from "@/lib/shop/products";

interface ProductGridProps {
  products: Product[];
  onSelectProduct?: (product: Product) => void;
}

export function ProductGrid({ products, onSelectProduct }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <div
          key={product.id}
          onClick={() => onSelectProduct?.(product)}
          className="group cursor-pointer rounded-lg border p-4 transition-all hover:shadow-lg"
          style={{
            borderColor: "var(--a-border)",
            backgroundColor: "var(--a-bg)",
          }}
        >
          {product.image && (
            <div className="mb-4 aspect-square overflow-hidden rounded-lg bg-gray-200">
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="flex-1 font-semibold" style={{ color: "var(--a-text)" }}>
                {product.name}
              </h3>
              {product.featured && <span className="text-lg">⭐</span>}
            </div>

            <p className="text-sm" style={{ color: "var(--a-mute)" }}>
              {product.description}
            </p>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xl font-bold text-green-600">{formatPrice(product.priceCents)}</span>
              {product.discountedPriceCents && (
                <span className="text-sm line-through" style={{ color: "var(--a-mute)" }}>
                  {formatPrice(product.discountedPriceCents)}
                </span>
              )}
            </div>

            <button
              className="mt-3 w-full rounded-lg px-4 py-2 font-medium text-white transition-colors"
              style={{ backgroundColor: "var(--a-ok)" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectProduct?.(product);
              }}
            >
              Toevoegen aan winkelwagen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
