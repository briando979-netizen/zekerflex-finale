"use client";

import { useEffect, useState } from "react";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";
import { IdScan, type ScanAfronden } from "@/components/app/IdScan";

// ---------------------------------------------------------------------------
// De telefoonkant van "verder op je telefoon" (/id-scan#<code>): niet ingelogd.
// De code komt uit het deel na de # (gaat nooit naar een server of log), wordt
// daarna uit de adresbalk gehaald en alleen voor dit tabblad onthouden (zodat
// herladen werkt). De scan levert de foto's in bij /api/id-overdracht/klaar; de
// laptop rondt de verificatie af (lib/kyc/overdracht.ts).
// ---------------------------------------------------------------------------

const ONTHOUD = "zf-id-overdracht";

type Stand = "laden" | "ongeldig" | { code: string; voornaam: string };

export function IdScanTelefoon({ locale }: { locale: Locale }) {
  const t = AUTH_DICTS[locale].onb;
  const [stand, setStand] = useState<Stand>("laden");

  useEffect(() => {
    let code = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    try {
      if (code) sessionStorage.setItem(ONTHOUD, code);
      else code = sessionStorage.getItem(ONTHOUD) ?? "";
    } catch {
      // geen opslag (privévenster): dan alleen zonder herladen
    }
    if (!code) {
      setStand("ongeldig");
      return;
    }
    // uit de adresbalk: wie meekijkt of een schermafbeelding maakt, ziet de code niet
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      const res = await fetch("/api/id-overdracht/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }).catch(() => null);
      if (!res?.ok) {
        setStand("ongeldig");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { voornaam?: string };
      setStand({ code, voornaam: data.voornaam ?? "" });
    })();
  }, []);

  const afronden: ScanAfronden = async (g) => {
    if (typeof stand !== "object") return { ok: false, fout: t.scan.telOngeldig };
    const body = new FormData();
    body.set("code", stand.code);
    body.set("soort", g.documentType);
    body.set("nummer", g.documentNumber);
    body.set("datum", g.documentExpiry);
    body.set("naam", g.nameOnDocument);
    body.set("voor", g.front);
    body.set("achter", g.back);
    body.set("selfie", g.selfie);
    try {
      const res = await fetch("/api/id-overdracht/klaar", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) return { ok: false, fout: data.error?.message ?? t.scan.mislukt };
      try {
        sessionStorage.removeItem(ONTHOUD);
      } catch {
        // niets te wissen
      }
      return { ok: true, overgedragen: true };
    } catch {
      return { ok: false, fout: t.scan.mislukt };
    }
  };

  if (stand === "laden") {
    return (
      <main className="grid min-h-screen place-items-center bg-white" aria-busy="true">
        <span aria-hidden className="h-10 w-10 animate-spin rounded-full border-4 border-hair border-t-brand-600" />
      </main>
    );
  }
  if (stand === "ongeldig") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white p-6 text-center">
        <p className="font-display text-lg font-bold text-ink">ZekerFlex</p>
        <p role="alert" className="mt-3 text-sm leading-relaxed text-ink-soft">
          {t.scan.telOngeldig}
        </p>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-white">
      <IdScan
        t={t}
        naam=""
        modus="telefoon"
        overdracht={stand.code}
        groet={stand.voornaam}
        onAfronden={afronden}
        onSluiten={() => {
          window.location.href = "/";
        }}
      />
    </main>
  );
}
