import { getVerification, hostOf, verificationRecord } from "@/lib/website/verify";
import { latestMirror } from "@/lib/website/mirror";

// Wat de opdrachtgever in /werkgever/website ziet van de website-verhuizer:
// de DNS-code om eigendom te bewijzen, en zodra wij een kopie hebben gemaakt
// het voorbeeld met de score voor en na. Zonder interne details (wie, paden).

export interface RenewalView {
  host: string | null;
  record: string;
  verified: boolean;
  mirror: {
    id: string;
    status: "bezig" | "klaar" | "mislukt";
    finishedAt: string | null;
    pages: number;
    scoreBefore: number | null;
    scoreAfter: number | null;
    fixed: string[];
  } | null;
}

export async function renewalView(site: { id: string; domain: string | null }): Promise<RenewalView> {
  const [verification, m] = await Promise.all([getVerification(site.id, site.domain), latestMirror(site.id)]);
  const afterOpen = m?.after?.findings.filter((f) => f.status !== "goed") ?? [];
  return {
    host: hostOf(site.domain),
    record: verificationRecord(site.id),
    verified: Boolean(verification),
    mirror: m
      ? {
          id: m.id,
          status: m.status,
          finishedAt: m.finishedAt,
          pages: m.pages.length,
          scoreBefore: m.before?.score ?? null,
          scoreAfter: m.after?.score ?? null,
          fixed: (m.before?.findings ?? []).filter((f) => f.status !== "goed" && !afterOpen.some((a) => a.id === f.id)).map((f) => f.title).slice(0, 8),
        }
      : null,
  };
}
