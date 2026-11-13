// Resolve-hook voor scripts/talen-motor.mjs: leest "@/…" uit tsconfig (paths) en TypeScript-bestanden zonder extensie.
// Node (>= 22.6) haalt de types er zelf uit (type stripping); dit hook zorgt alleen dat de imports van de app vindbaar zijn.
import { existsSync } from "node:fs";
import { dirname, join, resolve as padResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = padResolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROBEER = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function zoek(basis) {
  for (const ext of PROBEER) {
    const p = basis + ext;
    if (existsSync(p) && /\.(ts|tsx)$/.test(p)) return p;
  }
  return null;
}

export async function resolve(specifier, context, volgende) {
  if (specifier.startsWith("@/")) {
    const p = zoek(join(root, specifier.slice(2)));
    if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
  } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && /\.(ts|tsx)$/.test(context.parentURL)) {
    const p = zoek(padResolve(dirname(fileURLToPath(context.parentURL)), specifier));
    if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
  }
  return volgende(specifier, context);
}