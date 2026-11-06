import { getPrincipal, hasRole } from "@/lib/auth";
import { listConversations } from "@/lib/chat/webchat";
import { bucketCount, resolvePeriod, safe, timelineKeys } from "@/lib/admin/period";
import { count, percentOf } from "@/lib/admin/format";
import { KpiStrip, PageHead, Panel } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { WebchatInbox } from "@/components/admin/WebchatInbox";

export const dynamic = "force-dynamic";

export default async function WebchatPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  const period = resolvePeriod("30");
  const conversations = await safe(() => listConversations("all", 1000), []);
  const recent = conversations.filter((c) => new Date(c.startedAt) >= period.from);
  const human = conversations.filter((c) => c.status === "human");
  // oude gesprekken in de opslag kunnen velden missen: nooit NaN of een crash
  const unread = conversations.reduce((n, c) => n + (c.unread ?? 0), 0);
  const takenOver = recent.filter((c) => (c.messages ?? []).some((m) => m.role === "agent")).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Website-chat"
        subtitle="Gesprekken van de chatassistent op de website. De AI antwoordt eerst. Neem over wanneer je wilt: je antwoord verschijnt live bij de bezoeker."
      />

      <KpiStrip
        items={[
          { label: "Gesprekken", value: count(recent.length), hint: "laatste 30 dagen", spark: bucketCount(conversations, (c) => new Date(c.startedAt), period) },
          { label: "Bij een medewerker", value: count(human.length), hint: "de AI zwijgt hier", ...(human.length > 0 ? { tone: "warn" as const } : {}) },
          { label: "Ongelezen", value: count(unread), hint: "berichten van bezoekers", ...(unread > 0 ? { tone: "warn" as const } : {}) },
          { label: "Door AI afgehandeld", value: `${percentOf(recent.length - takenOver, recent.length)}%`, hint: `${count(takenOver)} keer overgenomen` },
        ]}
      />

      <Panel title="Gesprekken per dag" subtitle="De laatste 30 dagen">
        <Chart title="Nieuwe gesprekken op de website per dag" kind="bars" unit="count" labels={timelineKeys(period)} series={[{ label: "Gesprekken", values: bucketCount(conversations, (c) => new Date(c.startedAt), period) }]} height={150} emptyText="Nog geen gesprekken in de laatste 30 dagen." />
      </Panel>

      <WebchatInbox />
    </div>
  );
}
