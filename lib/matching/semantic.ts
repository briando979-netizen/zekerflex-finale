import { embedOne, isRagEnabled } from "@/lib/rag/embed";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Semantic (embedding-based) matching layer.
//
// Computes cosine similarity between a freelancer's semantic profile vector
// and a shift's requirement vector. Used as a bonus signal in the main
// scoring engine — never replaces the existing weighted score, adds to it.
//
// Works only when RAG_ENABLED + LLM_EMBED_MODEL are set. Falls back to 0
// silently so the matching engine degrades gracefully.
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Build a text representation of a freelancer for embedding. */
export function freelancerProfileText(p: {
  bio?: string | null;
  skills?: string[];
  certifications?: string[];
  preferredRoles?: string[];
  regio?: string | null;
}): string {
  const parts: string[] = [];
  if (p.bio) parts.push(p.bio);
  if (p.skills?.length) parts.push(`Skills: ${p.skills.join(", ")}`);
  if (p.certifications?.length) parts.push(`Certificaten: ${p.certifications.join(", ")}`);
  if (p.preferredRoles?.length) parts.push(`Voorkeursrollen: ${p.preferredRoles.join(", ")}`);
  if (p.regio) parts.push(`Regio: ${p.regio}`);
  return parts.join(". ") || "Flexwerker beschikbaar voor klussen.";
}

/** Build a text representation of a shift for embedding. */
export function shiftRequirementText(s: {
  title: string;
  description?: string | null;
  requiredSkills?: string[];
  requiredCertifications?: string[];
  location?: string | null;
  category?: string | null;
}): string {
  const parts: string[] = [s.title];
  if (s.description) parts.push(s.description);
  if (s.requiredSkills?.length) parts.push(`Vereiste skills: ${s.requiredSkills.join(", ")}`);
  if (s.requiredCertifications?.length) parts.push(`Vereiste certificaten: ${s.requiredCertifications.join(", ")}`);
  if (s.location) parts.push(`Locatie: ${s.location}`);
  if (s.category) parts.push(`Categorie: ${s.category}`);
  return parts.join(". ");
}

/**
 * Returns a semantic similarity score [0, 1] between a freelancer profile and
 * a shift. Returns 0 when embeddings are unavailable.
 */
export async function semanticMatchScore(
  freelancerProfile: Parameters<typeof freelancerProfileText>[0],
  shiftRequirement: Parameters<typeof shiftRequirementText>[0],
): Promise<number> {
  if (!isRagEnabled()) return 0;
  try {
    const [profileVec, shiftVec] = await Promise.all([
      embedOne(freelancerProfileText(freelancerProfile)),
      embedOne(shiftRequirementText(shiftRequirement)),
    ]);
    return cosineSimilarity(profileVec, shiftVec);
  } catch (err) {
    logger.warn("semantic-match: embedding failed, returning 0", { err: String(err) });
    return 0;
  }
}

/** Batch version — embed N freelancers against one shift vector. */
export async function batchSemanticMatchScores(
  freelancers: Array<{ id: string; profile: Parameters<typeof freelancerProfileText>[0] }>,
  shiftRequirement: Parameters<typeof shiftRequirementText>[0],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isRagEnabled() || freelancers.length === 0) {
    for (const f of freelancers) result.set(f.id, 0);
    return result;
  }
  try {
    const shiftVec = await embedOne(shiftRequirementText(shiftRequirement));
    await Promise.all(
      freelancers.map(async ({ id, profile }) => {
        try {
          const profileVec = await embedOne(freelancerProfileText(profile));
          result.set(id, cosineSimilarity(profileVec, shiftVec));
        } catch {
          result.set(id, 0);
        }
      }),
    );
  } catch (err) {
    logger.warn("batch-semantic-match: shift embed failed", { err: String(err) });
    for (const f of freelancers) result.set(f.id, 0);
  }
  return result;
}
