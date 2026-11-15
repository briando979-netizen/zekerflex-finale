"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { vulIn } from "@/lib/i18n/vul-in";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";
import { koppelBestaandAction, maakAccountAction, type PersoneelAcceptState } from "@/app/personeel/uitnodiging/actions";

// De pagina waarop een medewerker zijn uitnodiging gebruikt (app/personeel/uitnodiging): een nieuw account maken, of, als het
// e-mailadres al een account heeft, inloggen en koppelen. Alle tekst komt van de server (lib/horeca-personeel/teksten.ts).

const veld = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

export function UitnodigingForm(props: {
  t: PersoneelTeksten["uitnodiging"];
  token: string;
  zaak: string;
  email: string;
  naam: string;
  bestaatAl: boolean;
  ingelogdMetZelfdeAdres: boolean;
}) {
  const { t } = props;
  const [state, actie, bezig] = useActionState<PersoneelAcceptState, FormData>(maakAccountAction, { error: null });
  const [koppelFout, setKoppelFout] = useState<string | null>(null);
  const [koppelBezig, start] = useTransition();
  const fout = koppelFout ?? state.error;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-ink">{vulIn(t.titel, { zaak: props.zaak })}</h1>
      <p className="mt-2 text-sm text-neutralx-600">{vulIn(t.intro, { zaak: props.zaak, email: props.email })}</p>

      {props.bestaatAl ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-ink">{t.bestaatAl}</p>
          {props.ingelogdMetZelfdeAdres ? (
            <button
              type="button"
              className="btn-primary min-h-[44px]"
              disabled={koppelBezig}
              onClick={() =>
                start(async () => {
                  const r = await koppelBestaandAction(props.token);
                  if (r.error) setKoppelFout(r.error);
                })
              }
            >
              {koppelBezig ? t.bezig : vulIn(t.gekoppeld, { zaak: props.zaak })}
            </button>
          ) : (
            <Link href={`/login?callbackUrl=${encodeURIComponent(`/personeel/uitnodiging?token=${props.token}`)}`} className="btn-primary inline-flex min-h-[44px] items-center">
              {t.naarInloggen}
            </Link>
          )}
        </div>
      ) : (
        <form action={actie} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={props.token} />
          <div>
            <label htmlFor="pers-naam" className="block text-sm font-medium text-ink">
              {t.naam}
            </label>
            <input id="pers-naam" name="fullName" type="text" required minLength={2} defaultValue={props.naam} autoComplete="name" className={veld} />
          </div>
          <div>
            <label htmlFor="pers-ww" className="block text-sm font-medium text-ink">
              {t.wachtwoord}
            </label>
            <input id="pers-ww" name="password" type="password" required minLength={8} autoComplete="new-password" className={veld} />
          </div>
          <div>
            <label htmlFor="pers-ww2" className="block text-sm font-medium text-ink">
              {t.herhaal}
            </label>
            <input id="pers-ww2" name="passwordConfirm" type="password" required minLength={8} autoComplete="new-password" className={veld} />
          </div>
          <button type="submit" className="btn-primary min-h-[44px] w-full" disabled={bezig}>
            {bezig ? t.bezig : t.maak}
          </button>
        </form>
      )}

      {fout && (
        <p role="alert" className="mt-4 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}
