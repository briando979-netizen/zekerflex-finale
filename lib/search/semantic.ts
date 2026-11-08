import { prisma } from "@/lib/prisma";

export interface SemanticResult {
  id: string;
  title: string;
  similarity: number;
}

// Mock embedding generation (in production, use real embeddings model)
function generateEmbedding(text: string): number[] {
  const hash = text
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Array.from({ length: 384 }, (_, i) =>
    Math.sin(hash + i) * 0.5 + 0.5
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0));
  const normB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0));
  return dotProduct / (normA * normB + 1e-8);
}

export async function semanticSearch(
  query: string,
  limit = 20
): Promise<SemanticResult[]> {
  const queryEmbedding = generateEmbedding(query);

  const shifts = await prisma.shift.findMany({
    take: 100,
  });

  const results = shifts
    .map((shift) => ({
      id: shift.id,
      title: shift.title,
      similarity: cosineSimilarity(
        queryEmbedding,
        generateEmbedding(shift.title + " " + (shift.description || ""))
      ),
    }))
    .filter((r) => r.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}
