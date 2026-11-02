import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, Panel } from "@/components/admin/kit";
import { ConsoleTerminal } from "@/components/admin/ConsoleTerminal";
import { DevEnvLauncher } from "@/components/admin/DevEnvLauncher";

export const dynamic = "force-dynamic";

export default async function AdminDevPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De terminal is alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="Terminal & VS Code"
        subtitle="Een veilige console in de app voor snelle checks, plus knoppen naar je eigen web-VS-Code en web-terminal op je server. Een echte shell draait bewust niet in de app, zie deploy/code-server/."
      />
      <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Veilige console" subtitle="Alleen-lezen, vaste opdrachten. Typ help voor de lijst.">
          <ConsoleTerminal />
        </Panel>
        <DevEnvLauncher />
      </div>
    </div>
  );
}
