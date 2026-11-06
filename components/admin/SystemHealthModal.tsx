import { Panel, Pill } from "@/components/admin/kit";

export async function SystemHealthModal() {
  const health = {
    rondgang_status: "healthy",
    error_trend: "monitoring",
    db_exports: "ready",
    alert_rules: "enabled",
  };

  return (
    <Panel title="Systeemstatus" subtitle="Operatie-hulpjes actief">
      <div className="space-y-2 px-4 py-3">
        <div className="flex justify-between items-center">
          <span className="text-sm">Rondgang (nachtcrawl)</span>
          <Pill tone="ok">Actief</Pill>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">Foutmeldingen trend</span>
          <Pill tone="ok">Monitoren</Pill>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">Database exports</span>
          <Pill tone="ok">Gereed</Pill>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">Alert-regels</span>
          <Pill tone="ok">Ingesteld</Pill>
        </div>
      </div>
    </Panel>
  );
}
