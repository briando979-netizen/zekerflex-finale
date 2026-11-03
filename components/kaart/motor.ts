// De kaartmotor (MapLibre + PMTiles) laden, alleen in de browser en pas als er
// een kaart nodig is. De worker krijgt een eigen adres op onze site (CSP:
// worker-src 'self'; anders valt MapLibre terug op een blob:-worker), en het
// pmtiles://-protocol wordt één keer per pagina geregistreerd.

export async function laadKaartMotor(): Promise<typeof import("maplibre-gl")> {
  const [mod, { Protocol }] = await Promise.all([import("maplibre-gl"), import("pmtiles")]);
  mod.setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
  const g = globalThis as typeof globalThis & { __zfPmtiles?: boolean };
  if (!g.__zfPmtiles) {
    mod.addProtocol("pmtiles", new Protocol().tile);
    g.__zfPmtiles = true;
  }
  return mod;
}
