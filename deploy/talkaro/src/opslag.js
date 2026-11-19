// Kleine opslag: één JSON-bestand per soort in de map data/. Schrijven gaat via een tijdelijk bestand en hernoemen,
// zodat een crash halverwege nooit een half bestand achterlaat. Zonder map (tests) blijft alles in het geheugen.
import fs from 'node:fs';
import path from 'node:path';

export class Opslag {
  constructor(map) {
    this.map = map || null; this.wachtend = new Map(); this.timer = null;
    if (this.map) fs.mkdirSync(this.map, { recursive: true });
  }
  lees(naam, standaard) {
    if (!this.map) return standaard;
    try { return JSON.parse(fs.readFileSync(path.join(this.map, naam + '.json'), 'utf8')); }
    catch (e) {
      // Een kapot bestand bewaren we onder een andere naam in plaats van het stil te overschrijven.
      if (e.code !== 'ENOENT') { try { fs.renameSync(path.join(this.map, naam + '.json'), path.join(this.map, `${naam}.kapot-${Date.now()}.json`)); } catch (x) { /* niets */ } }
      return standaard;
    }
  }
  // Even wachten met schrijven: bij een reeks wijzigingen gaat er maar één keer iets naar de schijf.
  schrijf(naam, maker) {
    if (!this.map) return;
    this.wachtend.set(naam, maker);
    if (!this.timer) { this.timer = setTimeout(() => this.nu(), 400); this.timer.unref?.(); }
  }
  nu() {
    clearTimeout(this.timer); this.timer = null;
    for (const [naam, maker] of this.wachtend) {
      const doel = path.join(this.map, naam + '.json'), tijdelijk = doel + '.tmp';
      try { fs.writeFileSync(tijdelijk, JSON.stringify(maker()), { mode: 0o600 }); fs.renameSync(tijdelijk, doel); }
      catch (e) { console.error(`opslag: ${naam} schrijven mislukt (${e.code || e.message})`); }
    }
    this.wachtend.clear();
  }
  leesTekst(naam) { if (!this.map) return null; try { return fs.readFileSync(path.join(this.map, naam), 'utf8').trim(); } catch (e) { return null; } }
  schrijfTekst(naam, tekst) { if (this.map) fs.writeFileSync(path.join(this.map, naam), tekst, { mode: 0o600 }); }
}
