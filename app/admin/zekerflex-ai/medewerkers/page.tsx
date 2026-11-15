import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, KpiStrip, Panel } from "@/components/admin/kit";
import { kvGet } from "@/lib/storage/kv";
import { env } from "@/lib/env";
import { proposals } from "@/lib/ai-teams";
import { getSettings, readLog } from "@/lib/autopilot/store";
import { listConversations } from "@/lib/chat/webchat";
import { wachtendeVraag } from "@/lib/ai-teams/medewerkers";
import { AI_MEDEWERKERS, NAAR_BUITEN_LABEL, type AiMedewerker } from "@/lib/ai-medewerkers/register";

export const dynamic = "force-dynamic";

// AI-medewerkers (15 nov 2026): alle agenten van ZekerFlex op één plek (lib/ai-medewerkers/register.ts), met de live
// stand: wat er op jouw goedkeuring wacht, wanneer ze laatst draaiden en of ze aan staan.

const TZ = "Europe/Amsterdam";
const wanneer = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "nog niet";

const TOON: Record<AiMedewerker["naarBuiten"], string> = {
  nee: "var(--a-mute)",
  "na-goedkeuring": "var(--a-ok)",
  zelf: "var(--a-warn, #b45309)",
};

export default async function AiMedewerkersPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De AI-medewerkers zijn alleen zichtbaar voor platformbeheerders." />;
  }
  const nu = new Date();
  const [voorstellen, teamsLaatst, autopilot, autopilotLog, chats] = await Promise.all([
    proposals().catch(() => []),
    kvGet<string>("ai-teams-lastrun").catch(() => null),
    getSettings(),
    readLog(1).catch(() => []),
    Promise.all([listConversations("open", 300), listConversations("human", 300)]).then((x) => x.flat()).catch(() => []),
  ]);
  const open = voorstellen.filter((p) => p.status === "open");
  const perTeam = (team: string, type?: string) => open.filter((p) => p.team === team && (!type || p.action?.type === type)).length;
  const wacht = chats.filter((c) => wachtendeVraag(c, nu)).length;

  const stand: Record<string, string> = {
    welkomstcoach: `${perTeam("onboarding", "welkom-opvolging")} op jouw goedkeuring`,
    servicedesk: `${perTeam("klantenservice", "webchat-antwoord")} op jouw goedkeuring · ${wacht} vraag/vragen wachten > 4 uur`,
    "ai-teams": `${open.length} voorstel(len) open · laatst ${wanneer(teamsLaatst)}`,
    autopilot: `${autopilot.enabled ? "aan" : "uit"} · laatst ${wanneer(autopilotLog[0]?.at)}`,
    verkoop: `${env.SALES_ENGINE_ENABLED ? "aan" : "uit"} · zelf versturen ${env.SALES_AUTOPILOT_ENABLED ? "aan" : "uit"}`,
  };

  return (
    <div className="space-y-4">
      <PageHead
        title="AI-medewerkers"
        subtitle="Alle agenten die werk doen voor ZekerFlex: wat ze doen, wanneer, en wat er op jouw goedkeuring wacht."
        actions={
          <Link href="/admin/zekerflex-ai" className="text-xs underline" style={{ color: "var(--a-mute)" }}>
            Naar de AI-studio
          </Link>
        }
      />
      <KpiStrip
        items={[
          { label: "Op jouw goedkeuring", value: open.length, href: "/admin/ai-teams", hint: "voorstellen van de AI-teams" },
          { label: "Websitechat wacht", value: wacht, href: "/admin/webchat", hint: "langer dan 4 uur" },
          { label: "AI-teams laatst", value: wanneer(teamsLaatst) },
          { label: "Autopilot", value: autopilot.enabled ? "aan" : "uit", href: "/admin/autopilot" },
        ]}
      />
      <Panel title="De medewerkers" subtitle="Wat naar buiten gaat (mail, push, chat) staat erbij, en of jij het eerst goedkeurt." flush>
        <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
          {AI_MEDEWERKERS.map((m) => (
            <li key={m.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                  {m.naam}
                  {m.nieuw && (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "var(--a-ok-soft)", color: "var(--a-ok)" }}>
                      nieuw
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{m.wat}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>
                  <span className="font-semibold" style={{ color: TOON[m.naarBuiten] }}>{NAAR_BUITEN_LABEL[m.naarBuiten]}</span> · {m.buiten}
                </p>
              </div>
              <div className="text-xs sm:text-right" style={{ color: "var(--a-mute)" }}>
                <p>{m.wanneer}</p>
                {stand[m.id] && <p className="mt-0.5 font-semibold" style={{ color: "var(--a-text)" }}>{stand[m.id]}</p>}
                {m.pagina && (
                  <Link href={m.pagina} className="mt-1 inline-block underline">
                    Bekijken
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
