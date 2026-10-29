import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// In-app "console": GEEN shell. Alleen een vaste, veilige set read-only
// commando's die admins snel info geven. Geen schrijfacties, geen willekeurige
// uitvoering — zo is dit veilig op de live (Vercel-)app. Voor een echte terminal
// draait de self-hosted stack in deploy/code-server/ op de VPS.
// ---------------------------------------------------------------------------

export interface ConsoleContext {
  userId: string;
  email: string;
  fullName: string;
}

export interface ConsoleCommand {
  name: string;
  summary: string;
  usage?: string;
  run(args: string[], ctx: ConsoleContext): Promise<string> | string;
}

function renderTime(): string {
  const now = new Date();
  const ams = now.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
  return `UTC:  ${now.toISOString()}\nNL:   ${ams}`;
}

function renderVersion(): string {
  return [`Node:     ${process.version}`, `Env:      ${process.env.NODE_ENV ?? "?"}`, `Platform: ZekerFlex admin-console`].join("\n");
}

export const COMMANDS: ConsoleCommand[] = [
  { name: "help", summary: "Toon alle commando's", run: () => renderHelp() },
  { name: "whoami", summary: "Wie ben ik (ingelogde admin)", run: (_a, ctx) => `${ctx.fullName} <${ctx.email}>\nuserId: ${ctx.userId}` },
  { name: "echo", summary: "Herhaal de tekst", usage: "echo <tekst>", run: (a) => a.join(" ") },
  { name: "time", summary: "Servertijd (UTC + Europe/Amsterdam)", run: () => renderTime() },
  { name: "version", summary: "Runtime-info", run: () => renderVersion() },
  { name: "users", summary: "Aantal gebruikers (read-only)", run: async () => `Gebruikers: ${await prisma.user.count()}` },
  { name: "ping", summary: "Antwoordt pong", run: () => "pong" },
];

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c] as const));

export function renderHelp(): string {
  const lines = ["Beschikbare commando's (veilig, read-only):", ""];
  for (const c of COMMANDS) lines.push(`  ${(c.usage ?? c.name).padEnd(18)}— ${c.summary}`);
  lines.push("  clear             — maak het scherm leeg (lokaal)");
  lines.push("", "Dit is geen shell: alleen bovenstaande commando's werken.");
  return lines.join("\n");
}

export async function runConsoleCommand(line: string, ctx: ConsoleContext): Promise<{ output: string; ok: boolean }> {
  const trimmed = line.trim();
  if (!trimmed) return { output: "", ok: true };
  const parts = trimmed.split(/\s+/);
  const name = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);
  const cmd = BY_NAME.get(name);
  if (!cmd) return { output: `Onbekend commando: ${name}. Typ 'help'.`, ok: false };
  try {
    const out = await cmd.run(args, ctx);
    return { output: out, ok: true };
  } catch (e) {
    return { output: `Fout: ${e instanceof Error ? e.message : "onbekende fout"}`, ok: false };
  }
}
