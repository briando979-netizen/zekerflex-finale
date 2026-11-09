"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { cookieStringIsApp, cookieStringIsIos } from "@/lib/app-mode";

// In de iPhone-app (lib/app-mode.ts APP_IOS_COOKIE) verbergen we wat Apple daar niet wil
// (components/app/NietInIphone.tsx). De lay-outs van /werkgever, /dashboard en /studio
// weten het al op de server (inIosApp()) en geven het door: dan staat elke knop vanaf de
// eerste weergave goed, zonder verspringen op de website (review 6d). Daarbuiten valt het
// terug op de cookie in de browser: tot die gelezen is `null`.

const IosAppContext = createContext<boolean | null>(null);

/** Van een server-lay-out: is dit de iPhone-app? (inIosApp() uit lib/app-mode-server.ts) */
export function IosAppProvider({ ios, children }: { ios: boolean; children?: ReactNode }) {
  return createElement(IosAppContext.Provider, { value: ios }, children);
}

/**
 * Client components: in de iPhone-app? Onder een IosAppProvider meteen bekend; anders
 * `null` tot na het laden, zodat iets wat Apple in de app niet wil nooit even zichtbaar is.
 */
export function useInIosApp(): boolean | null {
  const vanServer = useContext(IosAppContext);
  const [vanCookie, setVanCookie] = useState<boolean | null>(null);
  useEffect(() => {
    if (vanServer === null) setVanCookie(cookieStringIsApp(document.cookie) && cookieStringIsIos(document.cookie));
  }, [vanServer]);
  return vanServer ?? vanCookie;
}
