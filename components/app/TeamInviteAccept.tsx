"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { acceptExistingUserAction, registerAndAcceptAction, type TeamAcceptState } from "@/app/(marketing)/uitnodiging/team/actions";

const initial: TeamAcceptState = { error: null };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
      {pending ? "Bezig…" : label}
    </button>
  );
}

function AcceptButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await acceptExistingUserAction(token);
    if (res.error) {
      setError(res.error);
      setBusy(false);
    }
    // on success the action itself redirects
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{error}</p>}
      <button type="button" onClick={accept} disabled={busy} className="btn-primary w-full disabled:opacity-50">
        {busy ? "Bezig…" : "Uitnodiging accepteren"}
      </button>
    </>
  );
}

function RegisterForm({ token, email }: { token: string; email: string }) {
  const [state, formAction] = useFormState(registerAndAcceptAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}
      <label className="block">
        <span className="field-label">E-mailadres</span>
        <input value={email} disabled className="field-input opacity-60" />
      </label>
      <label className="block">
        <span className="field-label">Volledige naam</span>
        <input name="fullName" required className="field-input" />
      </label>
      <label className="block">
        <span className="field-label">Wachtwoord</span>
        <input name="password" type="password" required minLength={8} className="field-input" />
      </label>
      <label className="block">
        <span className="field-label">Wachtwoord (herhaal)</span>
        <input name="passwordConfirm" type="password" required minLength={8} className="field-input" />
      </label>
      <Submit label="Account aanmaken & accepteren" />
    </form>
  );
}

export function TeamInviteAccept(props: {
  valid: boolean;
  token: string;
  tenantName?: string;
  roleLabel?: string;
  invitedByName?: string;
  email?: string;
  userExists?: boolean;
  loggedInAsMatchingEmail?: boolean;
  loggedInAsOtherEmail?: string | null;
}) {
  const { valid, token } = props;

  if (!valid) {
    return (
      <div className="shell py-24">
        <div className="mx-auto max-w-md rounded-2xl border border-hair bg-white p-8 text-center shadow-card">
          <h1 className="font-display text-xl font-bold text-ink">Link niet meer geldig</h1>
          <p className="mt-2 text-sm text-neutralx-600">
            Deze teamuitnodiging is verlopen, al gebruikt, of ingetrokken. Vraag de beheerder van de
            organisatie om een nieuwe uitnodiging.
          </p>
          <Link href="/login" className="btn-primary mt-5 inline-block">
            Naar inloggen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell py-20 md:py-28">
      <div className="mx-auto max-w-lg">
        <p className="eyebrow text-brand-600">Teamuitnodiging</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl">
          Welkom bij {props.tenantName}
        </h1>
        <p className="mt-4 text-neutralx-600">
          {props.invitedByName} nodigt je uit om mee te werken als <strong>{props.roleLabel}</strong>.
        </p>

        <div className="mt-6 rounded-2xl border border-hair bg-white p-6 shadow-card">
          {props.loggedInAsOtherEmail ? (
            <p className="text-sm text-neutralx-600">
              Deze uitnodiging is voor <strong>{props.email}</strong>, maar je bent ingelogd als{" "}
              <strong>{props.loggedInAsOtherEmail}</strong>. Log uit en log in met het juiste e-mailadres om
              de uitnodiging te accepteren.
            </p>
          ) : props.loggedInAsMatchingEmail ? (
            <AcceptButton token={token} />
          ) : props.userExists ? (
            <div className="text-sm text-neutralx-600">
              <p className="mb-4">
                Er bestaat al een account voor <strong>{props.email}</strong>. Log in om de uitnodiging te
                accepteren.
              </p>
              <Link
                href={`/login?next=${encodeURIComponent(`/uitnodiging/team?token=${token}`)}`}
                className="btn-primary inline-block"
              >
                Inloggen
              </Link>
            </div>
          ) : (
            <RegisterForm token={token} email={props.email ?? ""} />
          )}
        </div>
      </div>
    </div>
  );
}
