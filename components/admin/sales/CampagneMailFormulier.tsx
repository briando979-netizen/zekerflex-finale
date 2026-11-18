"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AButton } from "@/components/admin/ui";
import {
  ONDERWERP_MAX,
  PARTNERDEAL_STANDAARD,
  PROEF_INVULLING,
  TEKST_MAX,
  beoordeelCampagneTekst,
  maakCampagneMail,
  type CampagneTekst,
} from "@/lib/sales/campagne-tekst";

// Beheer → Sales → campagne → paneel "De mail": de vaste tekst van de campagne schrijven, bewaren en als voorbeeld naar
// jezelf sturen. De regels (lengte, plaatshouders, woorden, bedragen) komen uit lib/sales/campagne-tekst.ts; de server
// controleert ze opnieuw (app/api/admin/sales/campaigns/[id]/tekst).

interface Vorm {
  onderwerp: string;
  tekst: string;
  knopTekst: string;
  knopUrl: string;
  zonderVacature: boolean;
}

const LEEG: Vorm = { onderwerp: "", tekst: "", knopTekst: "", knopUrl: "", zonderVacature: false };

const vormVan = (t: Pick<CampagneTekst, "onderwerp" | "tekst" | "knopTekst" | "knopUrl" | "zonderVacature"> | null): Vorm =>
  t ? { onderwerp: t.onderwerp, tekst: t.tekst, knopTekst: t.knopTekst ?? "", knopUrl: t.knopUrl ?? "", zonderVacature: t.zonderVacature } : LEEG;

const gelijk = (a: Vorm, b: Vorm): boolean =>
  a.onderwerp === b.onderwerp && a.tekst === b.tekst && a.knopTekst === b.knopTekst && a.knopUrl === b.knopUrl && a.zonderVacature === b.zonderVacature;

const veld = { background: "var(--a-panel-2)", color: "var(--a-text)", border: "1px solid var(--a-border)" } as const;

export function CampagneMailFormulier({ campaignId, begin, beheerderEmail }: { campaignId: string; begin: CampagneTekst | null; beheerderEmail: string }) {
  const router = useRouter();
  const id = useId();
  const [bewaard, setBewaard] = useState<Vorm>(vormVan(begin));
  const [heeftTekst, setHeeftTekst] = useState(begin !== null);
  const [vorm, setVorm] = useState<Vorm>(vormVan(begin));
  const [redenen, setRedenen] = useState<string[]>([]);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState<"bewaren" | "voorbeeld" | "wissen" | null>(null);

  const gewijzigd = !gelijk(vorm, bewaard);
  const zet = <K extends keyof Vorm>(k: K, v: Vorm[K]) => {
    setVorm((f) => ({ ...f, [k]: v }));
    setRedenen([]);
    setMelding(null);
  };
  const voorbeeld = maakCampagneMail(vorm, PROEF_INVULLING);

  async function bewaren() {
    const oordeel = beoordeelCampagneTekst(vorm);
    if (!oordeel.goed) {
      setRedenen(oordeel.redenen);
      return;
    }
    setBezig("bewaren");
    setRedenen([]);
    setMelding(null);
    try {
      const r = await fetch(`/api/admin/sales/campaigns/${campaignId}/tekst`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vorm),
      });
      const d = (await r.json().catch(() => null)) as { tekst?: CampagneTekst; error?: { message?: string; redenen?: string[] } } | null;
      if (!r.ok || !d?.tekst) {
        setRedenen(d?.error?.redenen?.length ? d.error.redenen : [d?.error?.message ?? "Bewaren is niet gelukt. Probeer het opnieuw."]);
        return;
      }
      // de versie van de server overnemen (die haalt spaties aan de randen weg)
      setBewaard(vormVan(d.tekst));
      setVorm(vormVan(d.tekst));
      setHeeftTekst(true);
      setMelding("Bewaard. Nieuwe concepten van deze campagne gebruiken vanaf nu deze tekst.");
      router.refresh();
    } catch {
      setRedenen(["Bewaren is niet gelukt: geen verbinding. Probeer het opnieuw."]);
    } finally {
      setBezig(null);
    }
  }

  async function stuurVoorbeeld() {
    setBezig("voorbeeld");
    setRedenen([]);
    setMelding(null);
    try {
      const r = await fetch(`/api/admin/sales/campaigns/${campaignId}/testmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; aan?: string; inPostbus?: boolean; melding?: string; error?: { message?: string } } | null;
      if (!r.ok || !d?.ok) {
        setRedenen([d?.melding ?? d?.error?.message ?? "Het voorbeeld is niet verstuurd. Probeer het opnieuw."]);
        return;
      }
      setMelding(
        d.inPostbus
          ? `Het voorbeeld staat in Beheer → Mail (er is geen mailserver voor ${d.aan ?? beheerderEmail}).`
          : `Het voorbeeld is verstuurd naar ${d.aan ?? beheerderEmail}. Kijk ook in je map met ongewenste mail.`,
      );
    } catch {
      setRedenen(["Het voorbeeld is niet verstuurd: geen verbinding. Probeer het opnieuw."]);
    } finally {
      setBezig(null);
    }
  }

  async function wissen() {
    if (!window.confirm("De vaste tekst weghalen? De campagne schrijft daarna weer per bedrijf een eigen mail en benadert alleen bedrijven met een vacature.")) return;
    setBezig("wissen");
    setRedenen([]);
    setMelding(null);
    try {
      const r = await fetch(`/api/admin/sales/campaigns/${campaignId}/tekst`, { method: "DELETE" });
      if (!r.ok) {
        setRedenen(["Weghalen is niet gelukt. Probeer het opnieuw."]);
        return;
      }
      setBewaard(LEEG);
      setVorm(LEEG);
      setHeeftTekst(false);
      setMelding("De vaste tekst is weggehaald.");
      router.refresh();
    } catch {
      setRedenen(["Weghalen is niet gelukt: geen verbinding. Probeer het opnieuw."]);
    } finally {
      setBezig(null);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaren();
      }}
    >
      {!heeftTekst && (
        <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
          Deze campagne heeft nog geen vaste tekst: de computer schrijft nu per bedrijf een eigen mail. Bewaar hier een tekst, dan krijgt elk bedrijf precies deze mail.
        </p>
      )}

      <div>
        <label htmlFor={`${id}-onderwerp`} className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
          Onderwerp
        </label>
        <input
          id={`${id}-onderwerp`}
          value={vorm.onderwerp}
          onChange={(e) => zet("onderwerp", e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
          style={veld}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>{vorm.onderwerp.trim().length} van {ONDERWERP_MAX} tekens</p>
      </div>

      <div>
        <label htmlFor={`${id}-tekst`} className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
          Tekst van de mail
        </label>
        <p id={`${id}-uitleg`} className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
          Drie woorden tussen accolades vult het systeem per bedrijf in: {"{bedrijf}"} wordt de naam van het bedrijf, {"{aanhef}"} de naam van de contactpersoon (of &quot;heer/mevrouw&quot; als we die niet kennen) en {"{plaats}"} de plaats van het bedrijf. Een lege regel begint een nieuwe alinea.
        </p>
        <textarea
          id={`${id}-tekst`}
          aria-describedby={`${id}-uitleg`}
          value={vorm.tekst}
          onChange={(e) => zet("tekst", e.target.value)}
          rows={18}
          className="mt-2 w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
          style={veld}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>{vorm.tekst.trim().length} van {TEKST_MAX} tekens</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-knoptekst`} className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
            Tekst op de knop
          </label>
          <input id={`${id}-knoptekst`} value={vorm.knopTekst} onChange={(e) => zet("knopTekst", e.target.value)} maxLength={120} placeholder="Maak gratis een account" className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={veld} />
        </div>
        <div>
          <label htmlFor={`${id}-knopurl`} className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
            Waar de knop naartoe gaat
          </label>
          <input id={`${id}-knopurl`} value={vorm.knopUrl} onChange={(e) => zet("knopUrl", e.target.value)} maxLength={300} placeholder="/register?type=bedrijf" className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={veld} />
        </div>
        <p className="text-xs sm:col-span-2" style={{ color: "var(--a-mute)" }}>
          Alleen een pagina op onze eigen site, bijvoorbeeld /register?type=bedrijf. Laat je beide velden leeg, dan staat er de gewone knop &quot;Bekijk ZekerFlex voor bedrijven&quot;.
        </p>
      </div>

      <label className="flex items-start gap-2 text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" className="mt-0.5" checked={vorm.zonderVacature} onChange={(e) => zet("zonderVacature", e.target.checked)} />
        <span>
          Ook bedrijven zonder vacature benaderen
          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
            Uit: alleen bedrijven waarvan we een vacature zagen. Aan: elk bedrijf in deze campagne met een mailadres en een score boven de grens.
          </span>
        </span>
      </label>

      {redenen.length > 0 && (
        <div role="alert" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-crit-soft)", color: "var(--a-text)", boxShadow: "inset 3px 0 0 var(--a-crit)" }}>
          <p className="font-medium">Dit moet nog anders:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {redenen.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {melding && (
        <p role="status" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          {melding}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AButton type="submit" disabled={bezig !== null || !gewijzigd}>
          {bezig === "bewaren" ? "Bezig…" : "Bewaren"}
        </AButton>
        <AButton
          variant="ghost"
          disabled={bezig !== null}
          onClick={() => {
            setVorm(vormVan(PARTNERDEAL_STANDAARD));
            setRedenen([]);
            setMelding("Het Partnerdeal-voorbeeld staat in het formulier. Lees het na en klik op Bewaren.");
          }}
        >
          Vul het Partnerdeal-voorbeeld in
        </AButton>
        <AButton variant="ghost" disabled={bezig !== null || !heeftTekst || gewijzigd} onClick={() => void stuurVoorbeeld()}>
          {bezig === "voorbeeld" ? "Bezig…" : "Stuur een voorbeeld naar mij"}
        </AButton>
        {heeftTekst && (
          <AButton variant="ghost" disabled={bezig !== null} onClick={() => void wissen()}>
            {bezig === "wissen" ? "Bezig…" : "Vaste tekst weghalen"}
          </AButton>
        )}
      </div>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        {gewijzigd || !heeftTekst
          ? "Het voorbeeld gebruikt de bewaarde tekst: bewaar eerst, dan kun je het naar jezelf sturen."
          : `Het voorbeeld gaat naar ${beheerderEmail}, ingevuld als "${PROEF_INVULLING.bedrijf}" in ${PROEF_INVULLING.plaats}. Er gaat niets naar een bedrijf.`}
      </p>

      <details>
        <summary className="cursor-pointer text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>Zo ziet de mail eruit voor {PROEF_INVULLING.bedrijf}</summary>
        <div className="mt-2 rounded-lg p-4" style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{voorbeeld.subject || "(nog geen onderwerp)"}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--a-dim)" }}>{voorbeeld.body || "(nog geen tekst)"}</p>
        </div>
      </details>
    </form>
  );
}
