// Pure data, no Node/Prisma dependencies — safe to import from client components
// (see components/app/WerkgeverApiKeysBoard.tsx). lib/integrations/api-keys.ts
// re-exports these for existing server-side importers.

export const AVAILABLE_SCOPES = [
  { key: "shifts:read", label: "Diensten lezen" },
  { key: "shifts:write", label: "Diensten aanmaken" },
  { key: "timesheets:read", label: "Goedgekeurde urenstaten lezen" },
  { key: "webhooks:manage", label: "Webhooks beheren" },
  { key: "invoices:read", label: "Facturen lezen" },
  { key: "users:read", label: "Gebruikers lezen (alleen eigen organisatie)" },
] as const;

export type ApiScope = (typeof AVAILABLE_SCOPES)[number]["key"];
