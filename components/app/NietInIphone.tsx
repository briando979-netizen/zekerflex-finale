"use client";

import type { ReactNode } from "react";
import { useInIosApp } from "@/components/app/useInIosApp";

/**
 * Niet in de iPhone-app (lib/app-mode.ts APP_IOS_COOKIE): digitale abonnementen en
 * aankopen mogen daar alleen via Apple's eigen betaling (App Store-richtlijn 3.1.1).
 * Op de website en in de Android-app verandert niets. Toont niets tot na het laden,
 * zodat het in de iPhone-app nooit even zichtbaar is. Geen verwijzing naar een andere
 * manier van betalen (dat staat Apple ook niet toe): hooguit een neutrale melding.
 */
export function NietInIphone({ children, melding = false }: { children: ReactNode; melding?: boolean }) {
  const ios = useInIosApp();
  if (ios === null) return null;
  if (ios) return melding ? <p className="text-sm text-neutralx-500">Dit kan niet in de iPhone-app.</p> : null;
  return <>{children}</>;
}
