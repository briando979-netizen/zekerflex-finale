"use client";

import { useEffect, useRef, useState } from "react";

interface Doc {
  id: string;
  kind: "id" | "bank" | "other";
  filename: string;
  uploadedAt: string;
  status: "uploaded" | "approved" | "rejected";
}
interface Data {
  docs: Doc[];
  status: { idOk: boolean; bankOk: boolean; complete: boolean };
}

const KIND_LABEL: Record<string, string> = { id: "Identiteitsbewijs", bank: "Bankafschrift / tenaamstelling", other: "Overig" };

function DocSlot({
  kind,
  label,
  hint,
  doc,
  onUploaded,
}: {
  kind: "id" | "bank";
  label: string;
  hint: string;
  doc: Doc | undefined;
  onUploaded: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const r = await fetch("/api/me/documents", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Upload mislukt");
      }
      onUploaded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ok = doc && doc.status !== "rejected";

  return (
    <div className={`rounded-xl border p-4 ${ok ? "border-ok/40 bg-ok/5" : "border-hairstrong"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {label} <span className="text-crit">*</span>
        </p>
        {ok ? (
          <span className="text-xs font-medium text-ok">
            {doc!.status === "approved" ? "goedgekeurd ✓" : "geüpload ✓"}
          </span>
        ) : doc?.status === "rejected" ? (
          <span className="text-xs font-medium text-crit">afgewezen — upload opnieuw</span>
        ) : (
          <span className="text-xs text-neutralx-400">nog niet geüpload</span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutralx-500">{hint}</p>
      {doc && (
        <a
          href={`/api/me/documents/${doc.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block truncate text-xs text-brand-600 hover:underline"
        >
          {doc.filename}
        </a>
      )}
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="btn-ghost mt-3 text-sm">
        {busy ? "Uploaden…" : doc ? "Vervangen" : "Uploaden"}
      </button>
      {err && <p className="mt-1 text-xs text-crit">{err}</p>}
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </div>
  );
}

export function ComplianceDocsPanel() {
  const [d, setD] = useState<Data | null>(null);
  const load = () =>
    fetch("/api/me/documents", { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  if (!d) return null;
  const idDoc = d.docs.find((x) => x.kind === "id");
  const bankDoc = d.docs.find((x) => x.kind === "bank");

  return (
    <div className="space-y-4">
      {d.status.complete ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-neutralx-700">
          ✓ Je verplichte documenten staan klaar. Je IBAN wordt hiermee gecontroleerd.
        </p>
      ) : (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-neutralx-700">
          Upload je identiteitsbewijs en een bankafschrift. Beide zijn verplicht voordat je uitbetaald kunt worden.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <DocSlot
          kind="id"
          label="Identiteitsbewijs"
          hint="Paspoort of ID-kaart (geen rijbewijs). Voor- en achterkant of de fotopagina."
          doc={idDoc}
          onUploaded={load}
        />
        <DocSlot
          kind="bank"
          label="Bankafschrift"
          hint="Recent afschrift of schermafbeelding waarop je naam én IBAN staan. Bedragen mag je wegstrepen."
          doc={bankDoc}
          onUploaded={load}
        />
      </div>
      <p className="text-xs text-neutralx-400">
        {KIND_LABEL.other}: extra documenten kun je via ZekerFlex Support toevoegen.
      </p>
    </div>
  );
}
