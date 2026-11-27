"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Beheer → Sales partners (app/admin/sales-partners): een partner toevoegen of weghalen (POST /api/admin/sales-partners)
 * en een registratie koppelen aan een bedrijfsaccount, afwijzen of terugzetten (POST /api/admin/sales-partners/bedrijf).
 * Na elke actie vernieuwt de pagina, zodat alles de stand van de server toont.
 */

async function stuur(url: string, body: unknown): Promise<string | null> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (r?.ok) return null;
  const d = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.";
}

function Fout({ tekst }: { tekst: string | null }) {
  if (!tekst) return null;
  return (
    <p role="alert" className="mt-1 text-xs" style={{ color: "var(--a-crit, #b42318)" }}>
      {tekst}
    </p>
  );
}

export function SalesPartnerToevoegen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function voegToe() {
    if (!email.trim()) {
      setFout("Vul het e-mailadres van het account van de partner in.");
      return;
    }
    setBezig(true);
    const f = await stuur("/api/admin/sales-partners", { email, aan: true });
    setFout(f);
    if (!f) {
      setEmail("");
      router.refresh();
    }
    setBezig(false);
  }

  return (
    <div>
      <label htmlFor="sp-email" className="block text-xs font-medium" style={{ color: "var(--a-mute)" }}>
        E-mailadres van het account (werker of bedrijf)
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input id="sp-email" type="email" className="a-input w-auto min-w-[16rem]" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className="a-btn a-btn-primary" disabled={bezig} onClick={() => void voegToe()}>
          Maak sales partner
        </button>
      </div>
      <Fout tekst={fout} />
    </div>
  );
}

export function SalesPartnerWeg({ email, naam }: { email: string; naam: string }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function weg() {
    if (!window.confirm(`${naam} is dan geen sales partner meer en ziet het partnerdashboard niet meer. Zijn registraties blijven bewaard. Doorgaan?`)) return;
    setBezig(true);
    const f = await stuur("/api/admin/sales-partners", { email, aan: false });
    setFout(f);
    if (!f) router.refresh();
    setBezig(false);
  }

  return (
    <div>
      <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig || !email} onClick={() => void weg()}>
        Geen partner meer
      </button>
      <Fout tekst={fout} />
    </div>
  );
}

export function RegistratieActies({ partnerId, bedrijfId, status, kvk }: { partnerId: string; bedrijfId: string; status: string; kvk: string | null }) {
  const router = useRouter();
  const [tenant, setTenant] = useState(kvk ?? "");
  const [reden, setReden] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function doe(actie: "koppel" | "ontkoppel" | "afwijzen" | "herstel") {
    if (actie === "koppel" && !tenant.trim()) {
      setFout("Vul het KvK-nummer of de bedrijfs-id van het bedrijfsaccount in.");
      return;
    }
    setBezig(true);
    const f = await stuur("/api/admin/sales-partners/bedrijf", {
      partnerId,
      bedrijfId,
      actie,
      ...(actie === "koppel" ? { tenant: tenant.trim() } : {}),
      ...(actie === "afwijzen" ? { reden: reden.trim() } : {}),
    });
    setFout(f);
    if (!f) router.refresh();
    setBezig(false);
  }

  if (status === "afgewezen") {
    return (
      <div>
        <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => void doe("herstel")}>
          Terugzetten
        </button>
        <Fout tekst={fout} />
      </div>
    );
  }
  if (status === "aangemeld" || status === "actief") {
    return (
      <div>
        <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => void doe("ontkoppel")}>
          Ontkoppelen
        </button>
        <Fout tekst={fout} />
      </div>
    );
  }
  // relative: de sr-only-labels blijven binnen de tabel die opzij veegt (anders wordt de pagina breder dan het scherm)
  return (
    <div className="relative space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <label htmlFor={`koppel-${bedrijfId}`} className="sr-only">
          KvK-nummer of bedrijfs-id
        </label>
        <input
          id={`koppel-${bedrijfId}`}
          className="a-input text-xs w-auto min-w-[9rem]"
          placeholder="KvK of bedrijfs-id"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
        />
        <button type="button" className="a-btn a-btn-primary text-xs" disabled={bezig} onClick={() => void doe("koppel")}>
          Goedkeuren en koppelen
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <label htmlFor={`reden-${bedrijfId}`} className="sr-only">
          Reden van afwijzen
        </label>
        <input
          id={`reden-${bedrijfId}`}
          className="a-input text-xs w-auto min-w-[9rem]"
          placeholder="Reden (optioneel)"
          value={reden}
          onChange={(e) => setReden(e.target.value)}
        />
        <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => void doe("afwijzen")}>
          Afwijzen
        </button>
      </div>
      <Fout tekst={fout} />
    </div>
  );
}
