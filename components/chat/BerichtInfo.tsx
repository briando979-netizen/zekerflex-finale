"use client";

import { useEffect, useState } from "react";
import { Shell } from "./modals";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";

// Berichtinfo van je eigen bericht (zoals WhatsApp, 13 nov 2026): wie het gelezen heeft en wie nog niet
// (GET /api/inbox/:id/info, lib/messaging/bericht-info.ts). Geen tijden: die weten we niet per bericht.

interface Info {
  uit: boolean;
  gelezen: string[];
  nogNiet: string[];
  verborgen: number;
  namen: Record<string, string>;
}

export function BerichtInfo({ threadId, messageId, onClose }: { threadId: string; messageId: string; onClose: () => void }) {
  const t = useChatTeksten().modals;
  const [info, setInfo] = useState<Info | null>(null);
  const [fout, setFout] = useState(false);
  useEffect(() => {
    let weg = false;
    void fetch(`/api/inbox/${threadId}/info?messageId=${encodeURIComponent(messageId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Info;
        if (!weg) setInfo(d);
      })
      .catch(() => {
        if (!weg) setFout(true);
      });
    return () => {
      weg = true;
    };
  }, [threadId, messageId]);

  const lijst = (titel: string, ids: string[], vink: string) => (
    <>
      <p className="field-label mt-3">{titel}</p>
      {ids.length === 0 ? (
        <p className="mt-1 text-sm text-neutralx-500">{t.infoNiemand}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-2 text-sm text-ink">
              <span className="w-5 text-center text-[#53BDEB]" aria-hidden>
                {vink}
              </span>
              {info?.namen[id] ?? t.onbekend}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <Shell title={t.infoTitel} onClose={onClose}>
      {fout ? (
        <p role="alert" className="text-sm text-crit">
          {t.datLukteNiet}
        </p>
      ) : !info ? (
        <p className="text-sm text-neutralx-500">{t.laden}</p>
      ) : info.uit ? (
        <p className="text-sm text-neutralx-600">{t.infoUit}</p>
      ) : (
        <>
          {lijst(t.gelezenDoor, info.gelezen, "✓✓")}
          {lijst(t.nogNietGelezen, info.nogNiet, "✓")}
          {info.verborgen > 0 && <p className="mt-3 text-xs text-neutralx-500">{vulIn(t.infoVerborgen, { aantal: info.verborgen })}</p>}
        </>
      )}
    </Shell>
  );
}
