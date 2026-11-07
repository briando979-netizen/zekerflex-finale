"use client";

import { useEffect, useId, useState } from "react";

// De bon aan de gast geven zonder papier: een QR-code om te scannen (opent de
// bon op de telefoon, met downloaden), mailen met de pdf erbij, of de pdf hier
// downloaden. De link is ondertekend en opent alleen deze ene bon (lib/horeca/bon.ts).

export function BonDelen({ token, qr = false, donker = false }: { token: string; qr?: boolean; donker?: boolean }) {
  const veld = useId();
  const [beeld, setBeeld] = useState("");
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  useEffect(() => {
    if (!qr) return;
    let weg = false;
    void import("qrcode")
      .then((q) => q.toDataURL(`${window.location.origin}/bon/${token}`, { margin: 1, width: 220, errorCorrectionLevel: "M" }))
      .then((url) => {
        if (!weg) setBeeld(url);
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [qr, token]);

  async function mail() {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/horeca/bon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, email }) });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Mailen lukte niet. Download de bon of probeer het opnieuw.");
      setMelding({ tekst: `De bon is gemaild naar ${email}.`, fout: false });
      setEmail("");
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Mailen lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  const tekst = donker ? "text-white" : "text-[#0A120E]";
  const zacht = donker ? "text-[#B8C4BD]" : "text-[#4B5563]";
  const rand = donker ? "ring-white/25" : "ring-[#0A120E]/20";

  return (
    <div className={`space-y-3 ${tekst}`}>
      {qr && (
        <div className="flex items-center gap-4">
          <div className="grid h-[132px] w-[132px] flex-shrink-0 place-items-center rounded-xl bg-white p-1.5">
            {beeld ? (
              // eslint-disable-next-line @next/next/no-img-element -- lokale data-URL, geen optimalisatie nodig
              <img src={beeld} alt="QR-code: scan om de bon op je telefoon te openen" width={120} height={120} />
            ) : (
              <span className="text-xs text-[#4B5563]">QR laden…</span>
            )}
          </div>
          <p className={`text-sm ${zacht}`}>Laat de gast deze code scannen. De bon opent op de telefoon en is daar te downloaden of te mailen.</p>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void mail();
        }}
      >
        <label htmlFor={veld} className="min-w-0 flex-1 text-sm font-semibold">
          Bon mailen naar
          <input
            id={veld}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@voorbeeld.nl"
            className={`mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-[#0A120E] ring-1 ${rand}`}
          />
        </label>
        <button type="submit" disabled={bezig || !email} className={`min-h-11 rounded-xl px-4 font-bold ring-1 ${rand} disabled:opacity-50`}>
          {bezig ? "Mailen…" : "Mail de bon"}
        </button>
      </form>
      <a href={`/api/horeca/bon?t=${encodeURIComponent(token)}`} className={`inline-block text-sm font-semibold underline underline-offset-2 ${tekst}`}>
        Download de bon (pdf)
      </a>
      <p className={`text-xs ${zacht}`}>Het e-mailadres gebruiken we alleen om deze bon te sturen.</p>
      {melding && (
        <p role={melding.fout ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm font-semibold ${melding.fout ? "bg-[#FDE2E2] text-[#B91C1C]" : "bg-[#E7F5EC] text-[#14532D]"}`}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}
