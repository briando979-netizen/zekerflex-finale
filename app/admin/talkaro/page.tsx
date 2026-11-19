import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHead, Panel, InfoList, Notice } from "@/components/admin/kit";
import { TalkaroWachtwoord } from "@/components/admin/TalkaroBeheer";

export const dynamic = "force-dynamic";

const TALKARO_URL = "https://talkaro.zekerflex.com";

export default async function TalkaroBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Talkaro is alleen beschikbaar voor platformbeheerders." />;
  }

  const token = env.TALKARO_ADMIN_TOKEN ?? "";

  return (
    <>
      <PageHead
        title="Talkaro"
        subtitle="De praat-met-vreemden-app op talkaro.zekerflex.com. Hier staan de link naar de meldingen en het beheerwachtwoord."
      />

      <Panel title="Links">
        <InfoList
          rows={[
            {
              label: "De website",
              value: (
                <a href={TALKARO_URL} target="_blank" rel="noreferrer" style={{ color: "var(--a-text)" }}>
                  talkaro.zekerflex.com
                </a>
              ),
            },
            {
              label: "Meldingen bekijken",
              value: (
                <a href={`${TALKARO_URL}/beheer`} target="_blank" rel="noreferrer" style={{ color: "var(--a-text)" }}>
                  talkaro.zekerflex.com/beheer
                </a>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Beheerwachtwoord" subtitle="Vul dit in op de inlogpagina van de meldingen. Deel het met niemand.">
        <TalkaroWachtwoord token={token} />
      </Panel>

      <Panel title="Hoe werkt het?">
        <div className="flex flex-col gap-2 text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
          <p>
            Open &ldquo;Meldingen bekijken&rdquo;, vul het wachtwoord in, en je ziet wie online is, hoeveel gesprekken er zijn
            en alle meldingen van misbruik. Daar kun je mensen blokkeren of weer deblokkeren.
          </p>
          <p>Talkaro draait los van ZekerFlex, op een eigen afgeschermd deel van de server.</p>
        </div>
      </Panel>

      <Notice tone="warn" role="status">
        Let op: Talkaro controleert geen leeftijd — alleen een 18+-vinkje. Houd de meldingen in de gaten.
      </Notice>
    </>
  );
}
