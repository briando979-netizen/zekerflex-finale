import { kvGet, kvSet } from "@/lib/storage/kv";

// Instelbare links naar de self-hosted ontwikkelomgeving (deploy/code-server/).
// Runtime-bewerkbaar via KV, net als de huisstijl/hosting-config.
const KEY = "devenv:config";

export interface DevEnvConfig {
  codeServerUrl: string; // bv. https://code.jouwdomein.nl
  terminalUrl: string; // bv. https://term.jouwdomein.nl
}

export const DEFAULT_DEVENV: DevEnvConfig = { codeServerUrl: "", terminalUrl: "" };

export async function getDevEnvConfig(): Promise<DevEnvConfig> {
  try {
    const v = await kvGet<DevEnvConfig>(KEY);
    if (v && typeof v === "object") return { ...DEFAULT_DEVENV, ...v };
  } catch {
    /* KV onbereikbaar → defaults */
  }
  return DEFAULT_DEVENV;
}

export async function setDevEnvConfig(cfg: DevEnvConfig): Promise<void> {
  await kvSet(KEY, cfg);
}
