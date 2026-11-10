import { llmConfigProblem } from "@/lib/ai/client";
import { prisma } from "@/lib/prisma";
import { KANALEN, kanaalVanReferrer, type KanaalDef, type KanaalId } from "@/lib/social/kanalen";
import { postStatus, type AutopilotInstelling, type KanaalConfig, type PostStatus, type Reactie, type SocialPost } from "@/lib/social/model";
import { getAutopilot, getKanaalConfigs, getMetaStatus, listPosts, listReacties, type MetaStatus } from "@/lib/social/store";

// ---------------------------------------------------------------------------
// Alles wat het scherm van Sociale media nodig heeft, in één keer. Alleen echte cijfers: berichten
// uit onze eigen opslag en bezoeken aan de site waarvan de herkomst een sociaal netwerk is. Volgers,
// likes en bereik komen er niet in: die kennen alleen de platforms zelf.
// ---------------------------------------------------------------------------

export type KanaalToestand = "verbonden" | "profiel" | "leeg";

export interface KanaalKaart extends Pick<KanaalDef, "id" | "naam" | "waarom" | "publiek" | "wijze" | "koppelen" | "beperking" | "beeld" | "maxTekens"> {
  config: KanaalConfig;
  toestand: KanaalToestand;
  gepland: number;
  geplaatst: number;
  laatste: string | null;
  /** paginaweergaven op onze site met dit kanaal als herkomst, laatste 30 dagen */
  bezoeken30d: number;
}

export interface PostRegel extends SocialPost {
  status: PostStatus;
}

export interface SocialOverzicht {
  nu: string;
  kanalen: KanaalKaart[];
  posts: PostRegel[];
  reacties: Reactie[];
  meta: MetaStatus;
  autopilot: AutopilotInstelling;
  modelBeschikbaar: boolean;
  kpi: { concepten: number; gepland: number; tePlaatsen: number; geplaatst30d: number; mislukt: number; bezoeken30d: number; reactiesOpen: number };
}

async function bezoekenPerKanaal(nu: Date): Promise<Map<KanaalId, number>> {
  const uit = new Map<KanaalId, number>();
  try {
    const sinds = new Date(nu.getTime() - 30 * 24 * 3600 * 1000);
    const rijen = await prisma.analyticsEvent.groupBy({
      by: ["referrerHost"],
      where: { type: "PAGEVIEW", createdAt: { gte: sinds }, referrerHost: { not: null } },
      _count: { _all: true },
    });
    for (const r of rijen) {
      const k = r.referrerHost ? kanaalVanReferrer(r.referrerHost) : null;
      if (k) uit.set(k, (uit.get(k) ?? 0) + r._count._all);
    }
  } catch {
    /* geen cijfers is beter dan een kapot scherm */
  }
  return uit;
}

export async function socialOverzicht(nu: Date = new Date()): Promise<SocialOverzicht> {
  const [configs, posts, reacties, meta, autopilot, bezoeken] = await Promise.all([
    getKanaalConfigs(),
    listPosts(),
    listReacties(100).catch(() => []),
    getMetaStatus(),
    getAutopilot(),
    bezoekenPerKanaal(nu),
  ]);
  const regels: PostRegel[] = posts.map((p) => ({ ...p, status: postStatus(p) }));
  const grens30 = nu.getTime() - 30 * 24 * 3600 * 1000;

  const kanalen: KanaalKaart[] = KANALEN.map((def) => {
    const config = configs[def.id];
    const api = (def.id === "facebook" && meta.verbonden) || (def.id === "instagram" && meta.verbonden && meta.igUserId !== null);
    const toestand: KanaalToestand = api ? "verbonden" : config.profielUrl.trim() ? "profiel" : "leeg";
    const eigen = regels.filter((p) => p.kanalen.includes(def.id));
    const geplaatstOp = eigen
      .map((p) => p.uitslag[def.id])
      .filter((u): u is NonNullable<typeof u> => Boolean(u) && u?.status === "gepost");
    const laatste = geplaatstOp.map((u) => u.at ?? "").sort().pop() || null;
    return {
      id: def.id,
      naam: def.naam,
      waarom: def.waarom,
      publiek: def.publiek,
      wijze: def.wijze,
      koppelen: def.koppelen,
      beperking: def.beperking,
      beeld: def.beeld,
      maxTekens: def.maxTekens,
      config,
      toestand,
      gepland: eigen.filter((p) => p.status === "gepland").length,
      geplaatst: geplaatstOp.length,
      laatste,
      bezoeken30d: bezoeken.get(def.id) ?? 0,
    };
  });

  const geplaatst30d = regels.filter((p) => p.kanalen.some((k) => p.uitslag[k]?.status === "gepost" && new Date(p.uitslag[k]?.at ?? 0).getTime() >= grens30)).length;
  return {
    nu: nu.toISOString(),
    kanalen,
    posts: regels.slice(0, 200),
    reacties,
    meta,
    autopilot,
    modelBeschikbaar: !llmConfigProblem(),
    kpi: {
      concepten: regels.filter((p) => p.status === "concept").length,
      gepland: regels.filter((p) => p.status === "gepland").length,
      tePlaatsen: regels.filter((p) => p.status === "handmatig" || p.status === "deels").length,
      geplaatst30d,
      mislukt: regels.filter((p) => p.status === "mislukt").length,
      bezoeken30d: [...bezoeken.values()].reduce((a, b) => a + b, 0),
      reactiesOpen: reacties.filter((r) => r.status === "nieuw").length,
    },
  };
}
