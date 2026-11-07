"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Auto-refresh page when returning from Stripe Identity verification.
 * Detects ?identity=terug param and triggers a refresh after a brief delay
 * to allow Stripe to process the verification result.
 */
export function VerificationAutoRefresh() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRefreshed = useRef(false);

  useEffect(() => {
    const identity = searchParams.get("identity");
    if (identity === "terug" && !hasRefreshed.current) {
      hasRefreshed.current = true;
      // Wait 1s for Stripe webhook/sync to complete, then refresh
      const timer = setTimeout(() => {
        router.refresh();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  return null;
}
