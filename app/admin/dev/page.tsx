import { ConsoleTerminal } from "@/components/admin/ConsoleTerminal";
import { DevEnvLauncher } from "@/components/admin/DevEnvLauncher";

export const dynamic = "force-dynamic";

export default function AdminDevPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Terminal &amp; VS Code</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Een veilige in-app console voor snelle checks, plus knoppen naar je eigen web-VS-Code en web-terminal op je VPS.
          Een echte shell draait bewust niet in de app (serverless + veiligheid) — zie <code>deploy/code-server/</code>.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Veilige console (read-only)</h2>
        <ConsoleTerminal />
      </section>

      <DevEnvLauncher />
    </div>
  );
}
