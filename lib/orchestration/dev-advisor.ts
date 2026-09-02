import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import { AppError } from "@/lib/errors";
import { chat } from "@/lib/ai/client";

// ---------------------------------------------------------------------------
// Code advisor.
//
// Given a described problem and a few file paths, the self-hosted LLM proposes
// a unified diff + rationale. THIS NEVER WRITES ANYTHING. The output is a
// proposal for a human to review and apply with normal tooling.
// ---------------------------------------------------------------------------

const ALLOWED_EXT = [".ts", ".tsx", ".prisma", ".json", ".md", ".mjs", ".css"];
const MAX_FILES = 6;
const MAX_BYTES_PER_FILE = 24_000;

const ROOT = process.cwd();

function resolveInsideRepo(rel: string): string {
  if (isAbsolute(rel) || rel.includes("\0")) {
    throw AppError.validation(`Ongeldig pad: ${rel}`);
  }
  const abs = normalize(join(ROOT, rel));
  const relBack = relative(ROOT, abs);
  if (relBack.startsWith("..") || relBack.startsWith(sep) || isAbsolute(relBack)) {
    throw AppError.validation(`Pad valt buiten de repo: ${rel}`);
  }
  if (!ALLOWED_EXT.some((e) => abs.endsWith(e))) {
    throw AppError.validation(`Bestandstype niet toegestaan: ${rel}`);
  }
  return abs;
}

export interface PatchProposalInput {
  description: string;
  files: string[];
}

export interface PatchProposal {
  description: string;
  files: string[];
  rationale: string;
  diff: string;
  model: string;
  disclaimer: string;
}

export async function proposePatch(
  input: PatchProposalInput,
): Promise<PatchProposal> {
  if (input.files.length === 0 || input.files.length > MAX_FILES) {
    throw AppError.validation(`Geef 1 tot ${MAX_FILES} bestanden op`);
  }

  const contents: string[] = [];
  for (const rel of input.files) {
    const abs = resolveInsideRepo(rel);
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      throw AppError.notFound(`Bestand niet gevonden: ${rel}`);
    }
    contents.push(
      `--- FILE: ${rel} ---\n${text.slice(0, MAX_BYTES_PER_FILE)}`,
    );
  }

  const result = await chat({
    messages: [
      {
        role: "system",
        content:
          "Je bent een senior TypeScript/Next.js/Prisma engineer. Je krijgt een probleem" +
          " en de inhoud van enkele bestanden. Stel een minimale wijziging voor.\n" +
          "Antwoord in dit formaat:\n" +
          "RATIONALE:\n<korte uitleg in het Nederlands>\n\nDIFF:\n<unified diff, git-apply-compatibel>\n" +
          "Verzin geen bestanden die niet zijn meegegeven. Als je het niet zeker weet, zeg dat in de rationale.",
      },
      {
        role: "user",
        content: `PROBLEEM:\n${input.description}\n\n${contents.join("\n\n")}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 1500,
  });

  const text = result.text;
  const diffMatch = text.match(/DIFF:\s*([\s\S]*)$/i);
  const rationaleMatch = text.match(/RATIONALE:\s*([\s\S]*?)(?:\n\s*DIFF:|$)/i);

  return {
    description: input.description,
    files: input.files,
    rationale: (rationaleMatch?.[1] ?? text).trim().slice(0, 4000),
    diff: (diffMatch?.[1] ?? "").trim().slice(0, 12_000),
    model: result.model,
    disclaimer:
      "VOORSTEL - niet toegepast. Beoordeel en pas handmatig toe via git; de orchestrator wijzigt nooit code.",
  };
}
