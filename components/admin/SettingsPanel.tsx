"use client";

import { Panel } from "@/components/admin/kit";

export function SettingsPanel() {
  return (
    <div className="space-y-6">
      <Panel title="Platform Configuration">
        <div className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">AI & Modellen</h3>
            <p className="text-sm text-neutralx-600">
              Configureer welke AI-modellen beschikbaar zijn en hun priorities.
            </p>
            <a href="/admin/zekerflex-ai" className="text-xs text-brand-600 hover:text-brand-700 mt-2 inline-block">
              Ga naar ZekerFlex AI →
            </a>
          </div>

          <hr className="my-4" />

          <div>
            <h3 className="font-semibold mb-2">Schakelaars & Features</h3>
            <p className="text-sm text-neutralx-600">
              Zet features aan/uit zonder uitrol nodig.
            </p>
            <a href="/admin/systeem" className="text-xs text-brand-600 hover:text-brand-700 mt-2 inline-block">
              Ga naar Systeem Schakelaars →
            </a>
          </div>

          <hr className="my-4" />

          <div>
            <h3 className="font-semibold mb-2">Financiële Instellingen</h3>
            <p className="text-sm text-neutralx-600">
              Bekijk kostprijs, commissies en alle financiële configuratie.
            </p>
            <a href="/admin/financien" className="text-xs text-brand-600 hover:text-brand-700 mt-2 inline-block">
              Ga naar Financiën →
            </a>
          </div>

          <hr className="my-4" />

          <div>
            <h3 className="font-semibold mb-2">Beveiliging</h3>
            <p className="text-sm text-neutralx-600">
              CSP, CORS, CrowdSec en andere beveiliging.
            </p>
            <a href="/admin/beveiliging" className="text-xs text-brand-600 hover:text-brand-700 mt-2 inline-block">
              Ga naar Beveiliging →
            </a>
          </div>
        </div>
      </Panel>

      <Panel title="Systeem Status">
        <div className="p-5 space-y-3">
          <p className="text-sm text-neutralx-600">
            Check systeemstatus en heartbeat op het Systeem-paneel.
          </p>
          <a href="/admin/systeem" className="text-xs text-brand-600 hover:text-brand-700 inline-block">
            Ga naar Systeem Status →
          </a>
        </div>
      </Panel>
    </div>
  );
}
