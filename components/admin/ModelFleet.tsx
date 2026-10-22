import { servedModels } from "@/lib/ai/client";
import { modelFleet } from "@/lib/ai/models";

/** Admin → Systeem: which model does which job, and is it actually on the AI node. */
export async function ModelFleet() {
  const [fleet, served] = [modelFleet(), await servedModels()];
  // Ollama lists untagged pulls as "<name>:latest"
  const has = (m: string) => served.includes(m) || served.includes(`${m}:latest`);
  return (
    <section className="mt-8 rounded-2xl border border-hair bg-white">
      <div className="border-b border-hair px-5 py-4">
        <h2 className="font-display text-base font-bold text-ink">Modellen</h2>
        <p className="text-xs text-neutralx-500">
          Elk soort werk heeft zijn eigen model; zonder eigen model valt het terug op het hoofdmodel.{" "}
          {served.length ? `Op de AI-server: ${served.join(", ")}.` : "AI-server niet bereikbaar of nog niet gekoppeld."}
        </p>
      </div>
      <div className="overflow-x-auto px-5 py-4">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs text-neutralx-500">
            <tr>
              <th className="pb-2 font-medium">Taak</th>
              <th className="pb-2 font-medium">Model</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Aanrader</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {fleet.map((f) => {
              const state = !f.model ? "uit" : !served.length ? "onbekend" : has(f.model) ? "geïnstalleerd" : "niet gedownload";
              return (
                <tr key={f.role} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-ink">{f.label}</span>
                    <span className="block font-mono text-[11px] text-neutralx-400">{f.env}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {f.model || "—"}
                    {!f.ownModel && f.model && <span className="block font-sans text-[11px] text-neutralx-400">(= hoofdmodel)</span>}
                  </td>
                  <td className={`py-2 pr-3 text-xs ${state === "geïnstalleerd" ? "text-brand-700" : state === "niet gedownload" ? "text-crit" : "text-neutralx-500"}`}>{state}</td>
                  <td className="py-2 font-mono text-xs text-neutralx-500">{f.recommended}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
