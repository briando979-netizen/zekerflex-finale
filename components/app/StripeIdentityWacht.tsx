"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { STRIPE_WACHT } from "@/lib/kyc/stripe-status";

/**
 * Back from Stripe while it still checks the ID: reload the page every few
 * seconds — the page asks Stripe for the result on every render — until the
 * outcome is in (then the page stops rendering this) or 3 minutes have passed.
 */
export function StripeIdentityWacht({ text }: { text: string }) {
  const router = useRouter();

  useEffect(() => {
    let times = 0;
    const id = window.setInterval(() => {
      times += 1;
      if (times > STRIPE_WACHT.maxTimes) {
        window.clearInterval(id);
        return;
      }
      router.refresh();
    }, STRIPE_WACHT.everyMs);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <p role="status" className="mt-2 flex items-center gap-2 text-neutralx-600">
      <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-trust" aria-hidden />
      {text}
    </p>
  );
}
