"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandBar } from "@/components/ui/CommandBar";

/** Global client providers: toasts + the ⌘K command bar. Presentational only. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <CommandBar />
    </ToastProvider>
  );
}
