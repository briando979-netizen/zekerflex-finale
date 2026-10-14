import { randomUUID } from "node:crypto";
import { kvGet, kvSet, kvListValues, kvDelete } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Tenant-owned klus-templates — distinct from the fixed, platform-wide
// SHIFT_TEMPLATES in lib/shifts/create.ts (generic function presets shown to
// every employer). These are what the "Templates" settings card promises:
// an employer's own, reusable presets (e.g. "Ochtenddienst filiaal
// Rotterdam"), KV-backed like lib/ads/store.ts.
// ---------------------------------------------------------------------------

export interface EmployerShiftTemplate {
  id: string;
  tenantId: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string | null;
  dresscode: string | null;
  defaultBranchId: string | null;
  createdById: string;
  createdAt: string;
}

const key = (tenantId: string, id: string) => `template:${tenantId}:${id}`;

export async function saveTemplate(
  input: Omit<EmployerShiftTemplate, "id" | "createdAt">,
): Promise<EmployerShiftTemplate> {
  const template: EmployerShiftTemplate = {
    ...input,
    id: randomUUID().slice(0, 12),
    createdAt: new Date().toISOString(),
  };
  await kvSet(key(template.tenantId, template.id), template);
  return template;
}

export async function listTemplates(tenantId: string): Promise<EmployerShiftTemplate[]> {
  const rows = await kvListValues<EmployerShiftTemplate>(`template:${tenantId}:`, 200);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getTemplate(tenantId: string, id: string): Promise<EmployerShiftTemplate | null> {
  return kvGet<EmployerShiftTemplate>(key(tenantId, id));
}

export async function deleteTemplate(tenantId: string, id: string): Promise<void> {
  await kvDelete(key(tenantId, id));
}

export async function updateTemplate(
  tenantId: string,
  id: string,
  patch: Partial<Omit<EmployerShiftTemplate, "id" | "tenantId" | "createdById" | "createdAt">>,
): Promise<EmployerShiftTemplate | null> {
  const current = await getTemplate(tenantId, id);
  if (!current) return null;
  const next: EmployerShiftTemplate = { ...current, ...patch };
  await kvSet(key(tenantId, id), next);
  return next;
}
