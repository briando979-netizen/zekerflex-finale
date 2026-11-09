"use client";

import { useEffect, useState } from "react";
import { cookieStringIsApp, cookieStringIsIos } from "@/lib/app-mode";

/**
 * Client components: in de iPhone-app? `null` tot na het laden, zodat iets wat Apple
 * in de app niet wil (digitale abonnementen kopen, inloggen met Google) nooit even
 * zichtbaar is. Zie lib/app-mode.ts APP_IOS_COOKIE.
 */
export function useInIosApp(): boolean | null {
  const [ios, setIos] = useState<boolean | null>(null);
  useEffect(() => {
    setIos(cookieStringIsApp(document.cookie) && cookieStringIsIos(document.cookie));
  }, []);
  return ios;
}
