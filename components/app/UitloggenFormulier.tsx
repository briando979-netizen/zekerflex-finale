"use client";

import type { ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { wisTikken } from "@/lib/checkin/wachtrij";

/**
 * Uitloggen in de werker-app: wist eerst wat er op dit toestel aan in- en uitchecks zonder
 * bereik wacht (lib/checkin/wachtrij.ts, plek en tijdstip), zodat het niet blijft staan voor
 * wie hierna inlogt. De knop zelf komt van de pagina (children).
 */
export function UitloggenFormulier({
  className,
  children,
  demoUitgang,
}: {
  className?: string;
  children: ReactNode;
  /** In een voorbeeld (demo) is uitloggen een POST en loopt het op de alleen-lezen 423 vast;
   *  dan wordt dit een gewone GET-link die de demo verlaat (app/voorbeeld/sluiten). */
  demoUitgang?: string;
}) {
  if (demoUitgang) {
    return (
      <form action={demoUitgang} method="get" className={className}>
        {children}
      </form>
    );
  }
  return (
    <form action={logoutAction} onSubmit={() => wisTikken()} className={className}>
      {children}
    </form>
  );
}
