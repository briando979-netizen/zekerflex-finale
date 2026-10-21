"use client";

import { useEffect, useState } from "react";
import { cookieStringIsApp } from "@/lib/app-mode";

/**
 * Client components: inside the Android app? `null` until mounted, so callers
 * can hide web-only features until they know (no flash inside the app).
 */
export function useInAndroidApp(): boolean | null {
  const [inApp, setInApp] = useState<boolean | null>(null);
  useEffect(() => {
    setInApp(cookieStringIsApp(document.cookie));
  }, []);
  return inApp;
}
