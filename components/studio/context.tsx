"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LEGE_WINKEL, type Company, type Media, type SiteDoc, type SiteSoort, type Theme, type Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Websitestudio: één bron voor de site van het bedrijf (GET /api/werkgever/sites)
// en de manieren om hem te wijzigen. De winkel gaat apart en staat meteen live
// (PUT …/sites/winkel); pagina's, stijl en bedrijfsgegevens gaan via het gewone
// opslaan (PUT …/sites) en worden zichtbaar na Publiceren.
// ---------------------------------------------------------------------------

export const API = "/api/werkgever/sites";

/** Het adres van een site-API voor deze soort: `?soort=` zodat website en webshop elk hun eigen site raken. */
export const apiUrl = (soort: SiteSoort, pad = "", query = ""): string => `${API}${pad}?soort=${soort}${query ? `&${query}` : ""}`;

/** De voorvoegsels van de twee werkruimtes. */
export const STUDIO_BASE: Record<SiteSoort, string> = { website: "/studio/website", webshop: "/studio/webshop" };

export interface StudioData {
  site: SiteDoc | null;
  address: string | null;
  templates: { id: string; naam: string; omschrijving: string; theme: { kleur: string; accent: string } }[];
  presets: { naam: string; kleur: string; accent: string }[];
  defaults: Company;
  canPublish: boolean;
}

interface Studio {
  /** website of webshop: elke werkruimte heeft een eigen site */
  soort: SiteSoort;
  /** het voorvoegsel van deze werkruimte, bv. /studio/webshop */
  base: string;
  /** site-API van deze soort, met `?soort=` erbij */
  api: (pad?: string, query?: string) => string;
  data: StudioData | null;
  error: string | null;
  reload: () => Promise<void>;
  /** de winkel opslaan (meteen live); geeft een foutzin of null */
  saveWinkel: (w: Winkel) => Promise<string | null>;
  /** stijl en/of bedrijfsgegevens opslaan (zichtbaar na Publiceren) */
  saveSite: (patch: { theme?: Theme; bedrijf?: Company }) => Promise<string | null>;
  publish: () => Promise<string | null>;
  addMedia: (m: Media) => void;
  /** pagina's gewijzigd na de laatste keer publiceren */
  unpublished: boolean;
  winkel: Winkel;
}

const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const s = useContext(StudioContext);
  if (!s) throw new Error("useStudio buiten de Websitestudio");
  return s;
}

export async function foutVan(res: Response | null, fallback: string): Promise<string> {
  const d = res ? await res.json().catch(() => ({})) : {};
  return d?.error?.message ?? fallback;
}

export function StudioProvider({ soort, children }: { soort: SiteSoort; children: ReactNode }) {
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(apiUrl(soort), { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError(await foutVan(res, soort === "webshop" ? "De webshop kon niet laden." : "De website kon niet laden."));
    setError(null);
    setData((await res.json()) as StudioData);
  }, [soort]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const setSite = useCallback((site: SiteDoc) => setData((d) => (d ? { ...d, site } : d)), []);

  const saveWinkel = useCallback(
    async (winkel: Winkel) => {
      // de winkel hoort altijd bij de webshop van het bedrijf (lib/sites/store.ts winkelSiteOf), dus geen ?soort=
      const res = await fetch(`${API}/winkel`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ winkel }) }).catch(() => null);
      if (!res?.ok) return foutVan(res, "Opslaan lukte niet.");
      setSite(((await res.json()) as { site: SiteDoc }).site);
      return null;
    },
    [setSite],
  );

  const saveSite = useCallback(
    async (patch: { theme?: Theme; bedrijf?: Company }) => {
      const site = data?.site;
      if (!site) return "Maak eerst een website.";
      const body = { theme: patch.theme ?? site.theme, bedrijf: patch.bedrijf ?? site.bedrijf, pages: site.pages };
      const res = await fetch(apiUrl(soort), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      if (!res?.ok) return foutVan(res, "Opslaan lukte niet.");
      setSite(((await res.json()) as { site: SiteDoc }).site);
      return null;
    },
    [data?.site, setSite, soort],
  );

  const publish = useCallback(async () => {
    const res = await fetch(apiUrl(soort, "/publish"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publiceer" }) }).catch(() => null);
    if (!res?.ok) return foutVan(res, "Publiceren lukte niet.");
    setSite(((await res.json()) as { site: SiteDoc }).site);
    return null;
  }, [setSite, soort]);

  const addMedia = useCallback((m: Media) => setData((d) => (d?.site ? { ...d, site: { ...d.site, media: [...d.site.media, m] } } : d)), []);

  const api = useCallback((pad = "", query = "") => apiUrl(soort, pad, query), [soort]);

  const value = useMemo<Studio>(() => {
    const site = data?.site ?? null;
    const laatste = site?.builds[0]?.at;
    return {
      soort,
      base: STUDIO_BASE[soort],
      api,
      data,
      error,
      reload,
      saveWinkel,
      saveSite,
      publish,
      addMedia,
      unpublished: Boolean(site && (!site.liveBuild || (laatste && site.updatedAt > laatste))),
      winkel: site?.winkel ?? LEGE_WINKEL,
    };
  }, [soort, api, data, error, reload, saveWinkel, saveSite, publish, addMedia]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
