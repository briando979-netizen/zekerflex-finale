"use client";

import type { ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { wisTikken } from "@/lib/checkin/wachtrij";

/**
 * Uitloggen in de werker-app: wist eerst wat er op dit toestel aan in- en uitchecks zonder
 * bereik wacht (lib/checkin/wachtrij.ts, plek en tijdstip), zodat het niet blijft staan voor
 * wie hierna inlogt. De knop zelf komt van de pagina (children).
 */
export function UitloggenFormulier({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form action={logoutAction} onSubmit={() => wisTikken()} className={className}>
      {children}
    </form>
  );
}
