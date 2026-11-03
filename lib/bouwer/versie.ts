import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Welke commit draait er live? `lib/bouwer/VERSIE.txt` bevat een $Format$-regel die
// `git archive` invult (export-subst in .gitattributes), en de Dockerfile kopieert
// hem naar /app/VERSIE. Zo weet de app zijn eigen versie, wie er ook uitrolt
// (de Admin-knop of een sessie met git archive). Lokaal (geen archive) staat er
// nog de ruwe $Format$-tekst: dan is de versie onbekend.
// ---------------------------------------------------------------------------

export interface Versie {
  sha: string;
  datum: string;
  onderwerp: string;
}

let cache: Versie | null | undefined;

export function parseVersie(raw: string): Versie | null {
  const [sha = "", datum = "", ...rest] = raw.split("\n").map((l) => l.trim());
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  return { sha, datum, onderwerp: rest.join(" ").trim() };
}

export function liveVersie(): Versie | null {
  if (cache !== undefined) return cache;
  for (const p of [path.join(process.cwd(), "VERSIE"), path.join(process.cwd(), "lib", "bouwer", "VERSIE.txt")]) {
    try {
      cache = parseVersie(readFileSync(p, "utf8"));
      if (cache) return cache;
    } catch {
      /* volgende plek proberen */
    }
  }
  cache = null;
  return cache;
}
