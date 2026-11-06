"use client";

import { Review, ProductRating, getRatingLabel, getRatingColor } from "@/lib/shop/reviews";

interface ProductReviewsProps {
  productId: string;
  rating: ProductRating;
  reviews: Review[];
  onReviewSubmit?: (review: Partial<Review>) => void;
}

export function ProductReviews({ productId, rating, reviews, onReviewSubmit }: ProductReviewsProps) {
  return (
    <div className="space-y-6">
      {/* Rating summary */}
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--a-border)" }}>
        <div className="flex items-start gap-6">
          <div className="text-center">
            <div
              className="text-5xl font-bold"
              style={{ color: getRatingColor(rating.averageRating) }}
            >
              {rating.averageRating.toFixed(1)}
            </div>
            <div style={{ color: "var(--a-mute)" }} className="mt-1 text-sm">
              {getRatingLabel(rating.averageRating)}
            </div>
            <div style={{ color: "var(--a-mute)" }} className="text-xs">
              {rating.totalReviews} reviews
            </div>
          </div>

          <div className="flex-1 space-y-2">
            {[5, 4, 3, 2, 1].map((stars) => (
              <div key={stars} className="flex items-center gap-2">
                <span className="w-12 text-sm" style={{ color: "var(--a-mute)" }}>
                  {stars} ⭐
                </span>
                <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: "var(--a-border)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: "var(--a-ok)",
                      width: `${(rating.distribution[stars as keyof typeof rating.distribution] / rating.totalReviews) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs" style={{ color: "var(--a-mute)" }}>
                  {rating.distribution[stars as keyof typeof rating.distribution]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="mt-4 w-full rounded-lg px-4 py-2 font-medium text-white"
          style={{ backgroundColor: "var(--a-ok)" }}
        >
          + Schrijf een review
        </button>
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
          Recente reviews
        </h3>

        {reviews.length === 0 ? (
          <p style={{ color: "var(--a-mute)" }}>Nog geen reviews</p>
        ) : (
          reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--a-border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: "var(--a-text)" }}>
                      {review.title}
                    </span>
                    <span style={{ color: "var(--a-ok)" }}>
                      {"⭐".repeat(review.rating)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                    {review.customerId} • {review.createdAt.toLocaleDateString("nl-NL")}
                  </p>
                </div>
                {review.verified && (
                  <span
                    className="rounded px-2 py-1 text-xs font-medium"
                    style={{ backgroundColor: "rgba(0, 200, 0, 0.1)", color: "var(--a-ok)" }}
                  >
                    ✓ Geverifieerd
                  </span>
                )}
              </div>

              <p className="mt-2" style={{ color: "var(--a-text)" }}>
                {review.content}
              </p>

              <div className="mt-3 flex gap-2 text-xs">
                <button
                  style={{ color: "var(--a-info)" }}
                  onClick={() => console.log("helpful", review.id)}
                >
                  👍 Nuttig ({review.helpful})
                </button>
                <button
                  style={{ color: "var(--a-mute)" }}
                  onClick={() => console.log("unhelpful", review.id)}
                >
                  👎 Niet nuttig ({review.unhelpful})
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
