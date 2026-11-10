"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import { useI18n } from "@/components/i18n/I18nProvider";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { KOR_BELASTINGDIENST_URL, KOR_BEVESTIGING, korIngang, type KorAanvraag } from "@/lib/fiscal/kor";

// ---------------------------------------------------------------------------
// KOR-hulp: een werker zonder kleineondernemersregeling bereidt de aanvraag hier
// voor. Indienen doet hij zelf met DigiD bij de Belastingdienst; daarna meldt hij
// het hier, uploadt hij de bevestiging, en zet een medewerker de KOR aan
// (lib/fiscal/kor.ts, /api/me/fiscal/kor, setDocStatus in lib/compliance/documents.ts).
// ---------------------------------------------------------------------------

type DocStand = "uploaded" | "approved" | "rejected" | null;

/** yyyy-mm-dd → "1 april 2027" in de taal van de werker (een dag, geen tijdstip). */
function datum(dag: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dag}T00:00:00Z`));
  } catch {
    return dag;
  }
}

export function KorHulp({ initial }: { initial: KorAanvraag | null }) {
  const t = useFT().kor;
  const { locale } = useI18n();
  const router = useRouter();
  const ditId = useId();
  const vorigId = useId();
  const bestandId = useId();
  const bestand = useRef<HTMLInputElement>(null);
  const [aanvraag, setAanvraag] = useState<KorAanvraag | null>(initial);
  const [omzetDit, setOmzetDit] = useState("");
  const [omzetVorig, setOmzetVorig] = useState("");
  const [termijn, setTermijn] = useState<{ ingang: string; uiterlijk: string } | null>(null);
  const [docStand, setDocStand] = useState<DocStand>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // de datums uit de Nederlandse dag van nu: pas in de browser, zodat server en browser hetzelfde tonen
  useEffect(() => {
    setTermijn(korIngang(amsterdamDayKey(new Date())));
  }, []);

  // de stand van een geüploade bevestiging (bij de documenten van de werker)
  useEffect(() => {
    if (aanvraag?.stand !== "ingediend") return;
    void (async () => {
      const res = await fetch("/api/me/documents", { cache: "no-store" }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => ({}))) as { docs?: { note?: string; status: DocStand }[] }) : {};
      const doc = (data.docs ?? []).find((d) => d.note === KOR_BEVESTIGING);
      setDocStand(doc?.status ?? null);
    })();
  }, [aanvraag?.stand]);

  async function verzoek(werk: () => Promise<Response>, klaar: (data: Record<string, unknown>) => void) {
    setBezig(true);
    setFout(null);
    try {
      const res = await werk();
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
      if (!res.ok) {
        setFout(data.error?.message ?? t.fout);
        return;
      }
      klaar(data);
      // de poort van de app en de fiscale stap lezen dit op de server
      router.refresh();
    } catch {
      setFout(t.fout);
    } finally {
      setBezig(false);
    }
  }

  const indienen = () =>
    verzoek(
      () => fetch("/api/me/fiscal/kor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ omzetDitJaar: omzetDit, omzetVorigJaar: omzetVorig || "0" }) }),
      (d) => setAanvraag((d.korAanvraag as KorAanvraag | null) ?? null),
    );

  const intrekken = () => verzoek(() => fetch("/api/me/fiscal/kor", { method: "DELETE" }), () => setAanvraag(null));

  const upload = () => {
    const file = bestand.current?.files?.[0];
    if (!file) {
      setFout(t.upload);
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    void verzoek(() => fetch("/api/me/fiscal/kor/bevestiging", { method: "POST", body: fd }), () => setDocStand("uploaded"));
  };

  return (
    <div className="mt-3 rounded-xl border border-hairstrong p-4 text-sm">
      <p className="font-semibold text-ink">{t.titel}</p>

      {aanvraag?.stand === "bevestigd" ? (
        <p className="mt-2 text-ok">{t.bevestigd}</p>
      ) : aanvraag?.stand === "ingediend" ? (
        <div className="mt-2 grid gap-3">
          <p className="leading-relaxed text-neutralx-600">
            {t.ingediend.replace("{datum}", datum(amsterdamDayKey(aanvraag.ingediendOp), locale)).replace("{ingang}", datum(aanvraag.ingang, locale))}
          </p>
          <p className="leading-relaxed text-neutralx-600">{t.uploadUitleg}</p>
          {docStand === "uploaded" && <p className="text-neutralx-500">{t.wacht}</p>}
          {docStand === "rejected" && <p className="text-crit">{t.afgekeurd}</p>}
          {docStand !== "uploaded" && (
            <div className="grid gap-2">
              <label htmlFor={bestandId} className="field-label">
                {t.upload}
              </label>
              <input id={bestandId} ref={bestand} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
              <button type="button" disabled={bezig} onClick={upload} className="btn-primary w-fit disabled:opacity-50">
                {bezig ? t.uploaden : t.upload}
              </button>
            </div>
          )}
          <button type="button" disabled={bezig} onClick={() => void intrekken()} className="btn-ghost w-fit text-xs disabled:opacity-50">
            {t.intrekken}
          </button>
        </div>
      ) : (
        <div className="mt-2 grid gap-3">
          <p className="leading-relaxed text-neutralx-600">{t.uitleg}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor={ditId} className="field-label">
                {t.omzetDit}
              </label>
              <input id={ditId} inputMode="decimal" value={omzetDit} onChange={(e) => setOmzetDit(e.target.value)} placeholder="12000" className="field-input" />
            </div>
            <div className="grid gap-1">
              <label htmlFor={vorigId} className="field-label">
                {t.omzetVorig}
              </label>
              <input id={vorigId} inputMode="decimal" value={omzetVorig} onChange={(e) => setOmzetVorig(e.target.value)} placeholder="0" className="field-input" />
            </div>
          </div>
          {termijn && (
            <p className="rounded-lg bg-paper-soft p-3 leading-relaxed text-ink">
              {t.ingang.replace("{ingang}", datum(termijn.ingang, locale)).replace("{uiterlijk}", datum(termijn.uiterlijk, locale))}
            </p>
          )}
          <div>
            <p className="font-semibold text-ink">{t.stappenTitel}</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-neutralx-600">
              <li>{t.stap1}</li>
              <li>{t.stap2}</li>
              <li>{t.stap3}</li>
              <li>{t.stap4.replace("{ingang}", termijn ? datum(termijn.ingang, locale) : "…")}</li>
            </ol>
          </div>
          <a href={KOR_BELASTINGDIENST_URL} target="_blank" rel="noreferrer" className="btn-ghost w-fit">
            {t.naarBelastingdienst} ↗
          </a>
          <p className="text-xs text-neutralx-500">{t.waarom}</p>
          <button type="button" disabled={bezig || !omzetDit.trim()} onClick={() => void indienen()} className="btn-primary w-fit disabled:opacity-50">
            {t.ikHebIngediend}
          </button>
        </div>
      )}

      {fout && (
        <p role="alert" className="mt-2 text-xs text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}
