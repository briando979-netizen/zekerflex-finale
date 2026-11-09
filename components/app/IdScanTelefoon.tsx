"use client";

import { useEffect, useState } from "react";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";
import { IdScan, type ScanAfronden } from "@/components/app/IdScan";

// ---------------------------------------------------------------------------
// De telefoonkant van "verder op je telefoon" (/id-scan#<code>): niet ingelogd.
// De code komt uit het deel na de # (gaat nooit naar een server of log), wordt
// daarna uit de adresbalk gehaald en alleen voor dit tabblad onthouden (zodat
// herladen werkt), samen met het toesteltoken dat de server bij het openen gaf:
// alleen dít toestel kan verder (lib/kyc/overdracht.ts).
// Vóór de camera eerst: voor wélk account is dit? (voornaam + gemaskeerd
// e-mailadres). Heeft iemand anders de link gestuurd, dan "dit is niet mijn
// account": de code vervalt en er wordt niets verstuurd (review H1).
// ---------------------------------------------------------------------------

const ONTHOUD = "zf-id-overdracht";
const ONTHOUD_TOESTEL = "zf-id-overdracht-toestel";

type Account = { code: string; toestel: string; voornaam: string; email: string };
type Stand = "laden" | "ongeldig" | "anderToestel" | "geweigerd" | (Account & { bevestigd: boolean });

function vergeet() {
  try {
    sessionStorage.removeItem(ONTHOUD);
    sessionStorage.removeItem(ONTHOUD_TOESTEL);
  } catch {
    // niets te wissen
  }
}

export function IdScanTelefoon({ locale }: { locale: Locale }) {
  const t = AUTH_DICTS[locale].onb;
  const [stand, setStand] = useState<Stand>("laden");
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let code = "";
    let toestel = "";
    try {
      // een kapotte link ("#%E0") mag de pagina niet laten vallen: dan geen code
      code = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    } catch {
      code = "";
    }
    try {
      if (code) {
        // een nieuwe link: een eventueel oud toesteltoken hoort bij een andere code
        if (sessionStorage.getItem(ONTHOUD) !== code) sessionStorage.removeItem(ONTHOUD_TOESTEL);
        sessionStorage.setItem(ONTHOUD, code);
      } else {
        code = sessionStorage.getItem(ONTHOUD) ?? "";
      }
      toestel = sessionStorage.getItem(ONTHOUD_TOESTEL) ?? "";
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
        body: JSON.stringify({ code, ...(toestel ? { toestel } : {}) }),
      }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as { voornaam?: string; email?: string; toestel?: string; error?: { code?: string } }) : {};
      if (res?.status === 409 && data.error?.code === "ANDER_TOESTEL") {
        setStand("anderToestel");
        return;
      }
      if (!res?.ok || typeof data.toestel !== "string") {
        setStand("ongeldig");
        return;
      }
      try {
        sessionStorage.setItem(ONTHOUD_TOESTEL, data.toestel);
      } catch {
        // niet te onthouden: herladen werkt dan niet, verder wel
      }
      setStand({ code, toestel: data.toestel, voornaam: data.voornaam ?? "", email: data.email ?? "", bevestigd: false });
    })();
  }, []);

  async function nietMijn() {
    if (typeof stand !== "object") return;
    setBezig(true);
    await fetch("/api/id-overdracht/weiger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: stand.code, toestel: stand.toestel }),
    }).catch(() => null);
    vergeet();
    setBezig(false);
    setStand("geweigerd");
  }

  const afronden: ScanAfronden = async (g) => {
    if (typeof stand !== "object") return { ok: false, fout: t.scan.telOngeldig };
    const body = new FormData();
    body.set("code", stand.code);
    body.set("toestel", stand.toestel);
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
      vergeet();
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
  if (stand === "ongeldig" || stand === "anderToestel" || stand === "geweigerd") {
    const tekst = stand === "anderToestel" ? t.scan.telAnderToestel : stand === "geweigerd" ? t.scan.telGeweigerd : t.scan.telOngeldig;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white p-6 text-center">
        <p className="font-display text-lg font-bold text-ink">ZekerFlex</p>
        <p role={stand === "geweigerd" ? "status" : "alert"} className="mt-3 text-sm leading-relaxed text-ink-soft">
          {tekst}
        </p>
      </main>
    );
  }
  if (!stand.bevestigd) {
    const vraag = t.scan.telAccountVraag.replace("{naam}", stand.voornaam || "?").replace("{email}", stand.email || "?");
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white p-6">
        <p className="font-display text-lg font-bold text-ink">ZekerFlex</p>
        <p className="mt-4 text-base leading-relaxed text-ink">{vraag}</p>
        <p role="alert" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-ink">
          {t.scan.telWaarschuwing}
        </p>
        <div className="mt-6 grid gap-2">
          <button type="button" disabled={bezig} onClick={() => setStand({ ...stand, bevestigd: true })} className="btn-primary w-full disabled:opacity-50">
            {t.scan.telJaMijn}
          </button>
          <button type="button" disabled={bezig} onClick={() => void nietMijn()} className="btn-ghost w-full disabled:opacity-50">
            {t.scan.telNietMijn}
          </button>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-white">
      <IdScan
        t={t}
        naam=""
        modus="telefoon"
        overdracht={{ code: stand.code, toestel: stand.toestel }}
        groet={stand.voornaam}
        onAfronden={afronden}
        onSluiten={() => {
          window.location.href = "/";
        }}
      />
    </main>
  );
}
