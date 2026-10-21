"use client";

import type { ReactNode } from "react";
import { useInAndroidApp } from "@/components/app/useInAndroidApp";

/**
 * Renders its children on the website only — hidden inside the Android app
 * (lib/app-mode.ts), e.g. the fast-payout badge, a financial feature the Play
 * listing doesn't declare. Renders nothing until mounted, so it never flashes
 * inside the app.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  return useInAndroidApp() === false ? <>{children}</> : null;
}
