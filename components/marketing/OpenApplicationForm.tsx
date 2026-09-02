"use client";

import { useRef, useState } from "react";
import { JOB_SKILLS } from "@/lib/jobs/skills";

const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt";

function FileField({
  label,
  hint,
  inputRef,
  onPick,
  picked,
}: {
  label: string;
  hint: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (name: string | null) => void;
  picked: string | null;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-full border border-hairstrong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper-soft"
        >
          {picked ? "Ander bestand" : "Kies bestand"}
        </button>
        <span className="text-sm text-neutralx-500">{picked ?? "geen bestand gekozen"}</span>
      </div>
      <p className="mt-1 text-xs text-neutralx-500">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0]?.name ?? null)}
      />
    </div>
  );
}

export function OpenApplicationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const motRef = useRef<HTMLInputElement>(null);
  const cvRef = useRef<HTMLInputElement>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [motName, setMotName] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string | null>(null);
  const [motText, setMotText] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  function toggleSkill(s: string) {
    setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!consent) {
      setState("error");
      setMsg("Zet het vinkje voor akkoord om te kunnen verzenden.");
      return;
    }
    if (!motText.trim() && !motName) {
      setState("error");
      setMsg("Schrijf een motivatie of upload een motivatiebrief.");
      return;
    }
    setState("sending");
    setMsg("");

    const fd = new FormData(formRef.current!);
    fd.delete("skills");
    skills.forEach((s) => fd.append("skills", s));
    if (motRef.current?.files?.[0]) fd.set("motivatiebrief", motRef.current.files[0]);
    if (cvRef.current?.files?.[0]) fd.set("cv", cvRef.current.files[0]);
    fd.set("consent", consent ? "true" : "false");

    try {
      const res = await fetch("/api/werken-bij", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMsg(data?.error?.message ?? "Verzenden mislukt. Probeer het later opnieuw.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMsg("Geen verbinding. Probeer het later opnieuw.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-brand-mint/40 bg-mintwash p-6">
        <h3 className="font-display text-lg font-bold text-ink">Bedankt voor je sollicitatie</h3>
        <p className="mt-2 text-sm text-neutralx-700">
          We hebben je bericht ontvangen en sturen een bevestiging naar je e-mail. Je hoort binnen twee weken van ons.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="rounded-2xl border border-hair bg-paper p-6 shadow-e1 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Naam *</span>
          <input
            name="name"
            required
            maxLength={120}
            className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink">E-mailadres *</span>
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-semibold text-ink">Telefoon (optioneel)</span>
        <input
          name="phone"
          maxLength={40}
          className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm sm:w-1/2"
        />
      </label>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-ink">Waar ligt je interesse?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {JOB_SKILLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSkill(s)}
              aria-pressed={skills.includes(s)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                skills.includes(s)
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-hairstrong bg-white text-neutralx-600 hover:border-brand-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Motivatie</span>
          <textarea
            name="motivationText"
            rows={6}
            maxLength={8000}
            value={motText}
            onChange={(e) => setMotText(e.target.value)}
            placeholder="Vertel kort waarom je bij ZekerFlex wilt werken en wat je meebrengt. Of laat dit leeg en upload je motivatiebrief hieronder."
            className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <FileField
          label="Motivatiebrief (optioneel)"
          hint="pdf, Word, jpg, png of txt · max 8 MB"
          inputRef={motRef}
          onPick={setMotName}
          picked={motName}
        />
        <FileField
          label="CV (optioneel)"
          hint="pdf, Word, jpg, png of txt · max 8 MB"
          inputRef={cvRef}
          onPick={setCvName}
          picked={cvName}
        />
      </div>

      <label className="mt-6 flex items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-500"
        />
        <span className="text-xs leading-relaxed text-neutralx-600">
          Ik ga ermee akkoord dat ZekerFlex mijn gegevens en documenten verwerkt voor deze sollicitatie. Ze worden
          maximaal 6 maanden bewaard en daarna verwijderd, tenzij ik eerder om verwijdering vraag via
          werkenbij@zekerflex.com. Zie de{" "}
          <a href="/privacy" className="underline hover:text-ink">
            privacyverklaring
          </a>
          .
        </span>
      </label>

      {msg && state === "error" && <p className="mt-3 text-sm text-red-600">{msg}</p>}

      <button
        type="submit"
        disabled={state === "sending"}
        className="btn-primary mt-6 disabled:opacity-60"
      >
        {state === "sending" ? "Versturen…" : "Sollicitatie versturen"}
      </button>
    </form>
  );
}
