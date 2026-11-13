// ---------------------------------------------------------------------------
// Berichtinfo, zoals WhatsApp (13 nov 2026): wie je eigen bericht al gelezen heeft en wie nog niet. Puur. We weten per
// deelnemer alleen wanneer hij het gesprek voor het laatst las (thread.reads), niet wanneer hij dit ene bericht las;
// daarom geen tijden, alleen gelezen of niet (een verkeerde tijd zou misleiden). Leesbevestigingen gelden net als bij de
// vinkjes: wie ze uit heeft, telt niet mee; heb je ze zelf uit, dan zie je niets.
// ---------------------------------------------------------------------------

export interface BerichtInfo {
  /** je eigen leesbevestigingen staan uit: dan zie je ook niet wie jouw berichten las */
  uit: boolean;
  gelezen: string[];
  nogNiet: string[];
  /** zoveel ontvangers met leesbevestigingen uit */
  verborgen: number;
}

export function berichtInfo(
  thread: { participants: readonly string[]; reads: Readonly<Record<string, string>> },
  m: { from: string; at: string },
  ik: string,
  geenBevestiging: ReadonlySet<string>,
): BerichtInfo {
  if (geenBevestiging.has(ik)) return { uit: true, gelezen: [], nogNiet: [], verborgen: 0 };
  const gelezen: string[] = [];
  const nogNiet: string[] = [];
  let verborgen = 0;
  const verstuurd = new Date(m.at).getTime();
  for (const uid of thread.participants) {
    if (uid === m.from) continue;
    if (geenBevestiging.has(uid)) {
      verborgen++;
      continue;
    }
    const las = thread.reads[uid];
    if (las && new Date(las).getTime() >= verstuurd) gelezen.push(uid);
    else nogNiet.push(uid);
  }
  return { uit: false, gelezen, nogNiet, verborgen };
}
