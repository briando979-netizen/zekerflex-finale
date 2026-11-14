import { prisma } from "@/lib/prisma";
import { featureEnabled } from "@/lib/flags";
import { imapConfig } from "@/lib/mail";
import { fetchInboxList, fetchRuwOngelezen } from "@/lib/mail/imap";
import { readSentMessage, saveSentMessage } from "@/lib/mail/store";
import { kvSet } from "@/lib/storage/kv";
import { alertOwner } from "@/lib/ops/alert";
import { addSuppression } from "@/lib/sales/suppression";
import { markLeadBounced } from "@/lib/sales/reply";
import { berichtMerken, leesBerichtMerk, markeerHard, ruimBouncesOp, telZacht, zetBerichtMerk } from "@/lib/mail/bounce-opslag";
import { BOUNCE_VLAG, KV_BOUNCE_METING, type BounceAfhankelijkheden } from "@/lib/mail/bounce-ronde";

// De echte afhankelijkheden van de bounce-ronde (lib/mail/bounce-ronde.ts): de vlag, de postbus via IMAP (alleen
// lezen, niets op gelezen), de onderdrukkingslijst, de leads, het mail-log en de stand in KV.

const AANBIEDER_NAAM: Record<string, string> = { microsoft: "Microsoft (Outlook, Hotmail)", google: "Google (Gmail)", apple: "Apple (iCloud)", yahoo: "Yahoo", anders: "Een mailprovider" };

export function echteBounceAfhankelijkheden(): BounceAfhankelijkheden {
  return {
    aan: () => featureEnabled(BOUNCE_VLAG),
    lijst: async () => {
      const cfg = imapConfig();
      if (!cfg) throw Object.assign(new Error("geen postbus ingesteld"), { name: "GeenPostbus" });
      return (await fetchInboxList(cfg, 200)).map((e) => ({ berichtUid: e.uid, date: e.date, fromAddress: e.fromAddress, subject: e.subject }));
    },
    ruw: async (berichtUid) => {
      const cfg = imapConfig();
      return cfg ? fetchRuwOngelezen(cfg, berichtUid) : null;
    },
    merk: (berichtUid) => leesBerichtMerk(berichtUid),
    zetMerk: (berichtUid, merk) => zetBerichtMerk(berichtUid, merk),
    merken: () => berichtMerken(),
    hard: async (r) => {
      await markeerHard(r.ontvanger, r.code);
      await addSuppression(r.ontvanger, "bounce", null);
      const leads = await prisma.salesLead.findMany({
        where: {
          status: { not: "BOUNCED" },
          OR: [{ contactEmail: { equals: r.ontvanger, mode: "insensitive" } }, { discoveredEmail: { equals: r.ontvanger, mode: "insensitive" } }],
        },
        select: { id: true },
        take: 20,
      });
      for (const l of leads) await markLeadBounced(l.id, null);
      return { onderdrukt: true, leads: leads.length };
    },
    zacht: (r) => telZacht(r.ontvanger, r.code),
    beleid: async (aanbieder, regels) => {
      const codes = [...new Set(regels.map((r) => r.code))].join(", ");
      const uitleg = regels.find((r) => r.diagnose)?.diagnose ?? "";
      const uitslag = await alertOwner({
        key: `mail-beleid:${aanbieder}`,
        title: `${AANBIEDER_NAAM[aanbieder] ?? "Een mailprovider"} weigert mail van ZekerFlex`,
        detail: `${regels.length} mail${regels.length === 1 ? "" : "s"} geweigerd (${codes})${uitleg ? `: "${uitleg}"` : ""}. Dit ligt niet aan het adres maar aan ons: controleer SPF, DKIM en DMARC van zekerflex.com en stuur een testmail naar een eigen adres bij deze provider.`,
        severity: "warning",
        url: "/admin/mail",
      });
      return uitslag === "sent";
    },
    mailLog: async (recordId, bounce) => {
      const rec = await readSentMessage(recordId);
      if (!rec) return false;
      await saveSentMessage({ ...rec, bounce });
      return true;
    },
    bewaar: (meting) => kvSet(KV_BOUNCE_METING, meting),
    ruimOp: async () => {
      await ruimBouncesOp();
    },
  };
}
