"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { AUTH_DICTS, type AuthDict } from "@/lib/i18n/auth";
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


function DocSlot({
  kind,
  label,
  hint,
  doc,
  onUploaded,
  t,
}: {
  t: AuthDict["page"];
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
        throw new Error(j?.error?.message ?? t.uploadFailed);
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
            {doc!.status === "approved" ? t.approved : t.uploaded}
          </span>
        ) : doc?.status === "rejected" ? (
          <span className="text-xs font-medium text-crit">{t.rejectedUpload}</span>
        ) : (
          <span className="text-xs text-neutralx-400">{t.notUploaded}</span>
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
        {busy ? t.uploading : doc ? t.replace : t.upload}
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

export function ComplianceDocsPanel({ idInForm = false }: { idInForm?: boolean } = {}) {
  const t = AUTH_DICTS[useI18n().locale].page;
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
  // The ID slot is a fallback only: a normal onboarding submission already
  // fills this automatically (lib/onboarding/verify.ts), so showing it as a
  // second "mandatory" upload here reads as a duplicate ask. Only surface it
  // again if it's actually still missing or got rejected — e.g. an older
  // account from before that auto-fill existed.
  const showId = !d.status.idOk && !idInForm;

  return (
    <div className="space-y-4">
      {d.status.complete ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-neutralx-700">
          {t.allDone}
        </p>
      ) : (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-neutralx-700">
          {showId ? t.needBoth : idInForm && !d.status.idOk ? t.needBankHere : t.needBank}
        </p>
      )}
      <div className="space-y-3">
        {showId && (
          <DocSlot
            t={t}
            kind="id"
            label={t.idLabel}
            hint={t.idHint}
            doc={idDoc}
            onUploaded={load}
          />
        )}
        <DocSlot
          t={t}
          kind="bank"
          label={t.bankLabel}
          hint={t.bankHint}
          doc={bankDoc}
          onUploaded={load}
        />
      </div>
      <p className="text-xs text-neutralx-400">
        {t.other}
      </p>
    </div>
  );
}
