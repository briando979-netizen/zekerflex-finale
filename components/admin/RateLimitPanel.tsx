import { Panel, Pill } from "@/components/admin/kit";

export async function RateLimitPanel() {
  return (
    <Panel title="Rate Limits" subtitle="API quota status">
      <div className="space-y-3 px-4 py-3">
        <div className="flex justify-between">
          <span className="text-sm">Chat API</span>
          <Pill tone="ok">3250/5000</Pill>
        </div>
        <div className="flex justify-between">
          <span className="text-sm">Job Matching</span>
          <Pill tone="ok">890/1000</Pill>
        </div>
        <div className="flex justify-between">
          <span className="text-sm">KVK Lookups</span>
          <Pill tone="warn">450/500</Pill>
        </div>
      </div>
    </Panel>
  );
}
