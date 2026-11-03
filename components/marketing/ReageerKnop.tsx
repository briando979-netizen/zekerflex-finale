"use client";

import Link from "next/link";
import { WIL_REAGEREN_KEY, wilReagerenValue } from "@/lib/worker/wil-reageren";

// "Reageer op deze klus" on a public klus page: remember the klus in this
// browser, so the worker's Ontdekken page offers it again after sign-up.
export function ReageerKnop({ shiftId, title }: { shiftId: string; title: string }) {
  return (
    <Link
      href="/register?type=freelancer"
      onClick={() => {
        try {
          localStorage.setItem(WIL_REAGEREN_KEY, wilReagerenValue(shiftId, title));
        } catch {
          /* private mode: sign-up still works, only the reminder is missing */
        }
      }}
      className="btn-primary"
    >
      Reageer op deze klus
    </Link>
  );
}
