import { featureEnabled } from "@/lib/flags";
import { imapConfig, sendMail } from "@/lib/mail";
import { openWerkSessie, type ImapWerkSessie } from "@/lib/mail/imap";
import { leesBerichtMerk } from "@/lib/mail/bounce-opslag";
import { alertOwner } from "@/lib/ops/alert";
import { antwoordenDitUur, bewaarInfoStand, kreegAlAntwoord, leesInfoMerk, leesInfoStand, onthoudAntwoord, ruimInfoOp, telAntwoord, zetInfoMerk } from "@/lib/mail/info-opslag";
import { INFO_MAIL_VLAG, MAX_NIEUW_PER_RONDE, type InfoAfhankelijkheden } from "@/lib/mail/info-ronde";

// De echte afhankelijkheden van de info-ronde (lib/mail/info-ronde.ts): de vlag, de postbus via IMAP (één sessie per
// ronde), het eerste antwoord via sendMail, de melding aan de eigenaar en de stand in KV.

export function echteInfoAfhankelijkheden(): InfoAfhankelijkheden {
  let sessie: Promise<ImapWerkSessie> | null = null;
  const cfg = imapConfig();
  const postbus = (): Promise<ImapWerkSessie> => {
    if (!sessie) {
      if (!cfg) return Promise.reject(Object.assign(new Error("geen postbus ingesteld"), { name: "GeenPostbus" }));
      sessie = openWerkSessie(cfg, MAX_NIEUW_PER_RONDE);
    }
    return sessie;
  };
  return {
    aan: () => featureEnabled(INFO_MAIL_VLAG),
    lijst: async () =>
      (await (await postbus()).lijst(100)).map((e) => ({
        uid: e.uid,
        date: e.date,
        fromAddress: e.fromAddress,
        fromName: e.fromName,
        replyToAddress: e.replyToAddress,
        subject: e.subject,
        messageId: e.messageId,
        ...(e.answered ? { answered: true } : {}),
      })),
    kop: async (uid) => (await postbus()).kop(uid),
    tekst: async (uid) => (await postbus()).tekst(uid),
    verplaats: async (uid, map) => (await postbus()).verplaats(uid, map),
    markeerBeantwoord: async (uid) => (await postbus()).markeerBeantwoord(uid),
    sluit: async () => {
      if (!sessie) return;
      const s = await sessie.catch(() => null);
      sessie = null;
      await s?.sluit();
    },
    merk: (uid) => leesInfoMerk(uid),
    zetMerk: (uid, merk) => zetInfoMerk(uid, merk),
    bounceVerwerkt: async (uid) => (await leesBerichtMerk(uid))?.verwerkt === true,
    alGeantwoord: (adres, nu) => kreegAlAntwoord(adres, nu),
    onthoudAntwoord: (adres, nu) => onthoudAntwoord(adres, nu),
    antwoordenDitUur: (nu) => antwoordenDitUur(nu),
    telAntwoord: (nu) => telAntwoord(nu),
    stuur: async (a) => {
      // het antwoord komt van de postbus zelf (info@), zodat een antwoord daarop weer daar binnenkomt
      const van = cfg && /@([a-z0-9-]+\.)*zekerflex\.(com|nl)$/i.test(cfg.user) ? cfg.user : undefined;
      const uit = await sendMail({
        to: a.aan,
        subject: a.onderwerp,
        text: a.tekst,
        kind: "info-antwoord",
        autoAntwoord: true,
        ...(van ? { from: van, replyTo: van } : {}),
        ...(a.inReplyTo ? { inReplyTo: a.inReplyTo } : {}),
      });
      return uit.delivered;
    },
    meld: async (afzender, onderwerp, uid) => {
      const uitslag = await alertOwner({
        key: `info-mail-bedrijf:${uid}`,
        title: "Een bedrijf mailde naar info@",
        detail: `Van ${afzender}: "${onderwerp}". Deze mail is niet automatisch beantwoord; hij staat in het postvak.`,
        severity: "warning",
        url: "/admin/mail",
      });
      return uitslag === "sent";
    },
    vorigeStand: () => leesInfoStand(),
    bewaar: (stand) => bewaarInfoStand(stand),
    ruimOp: (nu) => ruimInfoOp(nu),
  };
}
