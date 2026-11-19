// Startpunt: leest de instellingen uit de omgeving en start de server. De rest staat in src/.
import { leesConfig } from './src/config.js';
import { maakApp } from './src/app.js';

const cfg = leesConfig();
const app = maakApp(cfg);

app.start().then((poort) => {
  console.log(`${cfg.naam} draait op ${app.metHttps ? 'https' : 'http'}://localhost:${poort}`);
  console.log(`  beheerpagina: ${cfg.beheerToken ? 'aan (/beheer)' : cfg.beheerTokenTeKort ? 'UIT: BEHEER_TOKEN is te kort (minstens 16 tekens)' : 'uit (geen BEHEER_TOKEN)'}`);
  console.log(`  video buiten het eigen netwerk: ${cfg.turnHost && cfg.turnGeheim ? 'aan (eigen TURN-server)' : 'uit (geen TURN_HOST/TURN_SECRET)'}`);
  console.log(`  herkomstcontrole: ${cfg.siteHost ? 'alleen ' + cfg.siteHost : 'het adres waarop de pagina geopend is'}; proxy vertrouwen: ${cfg.vertrouwProxy ? 'ja' : 'nee'}`);
}).catch((e) => { console.error(`Starten mislukt: ${e.code === 'EADDRINUSE' ? `poort ${cfg.poort} is al in gebruik` : e.message}`); process.exit(1); });

let bezig = false;
async function stop(signaal) {
  if (bezig) return; bezig = true;
  console.log(`${signaal} ontvangen: netjes afsluiten...`);
  const nood = setTimeout(() => process.exit(1), 8000); nood.unref();
  await app.stop();
  process.exit(0);
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
// Een onverwachte fout mag de server niet stil laten omvallen zonder regel in het logboek.
process.on('uncaughtException', (e) => { console.error('onverwachte fout:', e.stack || e.message); });
process.on('unhandledRejection', (e) => { console.error('onverwachte fout (belofte):', e?.stack || e); });
