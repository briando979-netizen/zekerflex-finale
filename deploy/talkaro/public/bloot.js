// Automatische bloot-herkenning, helemaal in de browser van de kijker. Niets wordt opgenomen en niets gaat naar de
// server of naar wie dan ook: dit kijkt alleen mee op dit toestel en waarschuwt jou. Bewust geen bewaking.
//
// Hoe: TensorFlow.js (WebGL-backend, dus geen 'unsafe-eval' in de CSP nodig) draait het MobileNetV2-model van NSFWJS.
// Alle bestanden komen van de site zelf (/vendor/), nooit van een CDN. Het rekenwerk (voorbewerking + indeling) is
// precies hoe NSFWJS het doet; we laden het model rechtstreeks met tfjs, zodat we de grote NSFWJS-browserbundel
// (met daarin alle modellen, ~2,7 MB extra) niet hoeven mee te sturen. De indeling is: Drawing, Hentai, Neutral,
// Porn, Sexy.
//
// Het oordeel zelf staat in bloot-logica.js (puur, los te testen). Dit bestand doet het laden, het meekijken en het
// opruimen. Werkt het model niet (oud toestel, WebGL uit), dan blijft de videochat gewoon doorgaan (fail-open).
import { naarKansen, isVerdacht, volg, STANDAARD } from './bloot-logica.js';

const KLASSEN = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy']; // vaste volgorde van de uitvoer van het model
const GROOTTE = 224; // het model verwacht 224×224
const TUSSENPOOS = 1500; // zo vaak kijken we naar een beeld (ms); klein genoeg om snel te zijn, groot genoeg voor een telefoon

let tf = null, model = null, status = 'leeg'; // leeg | laadt | klaar | uit
let laadBelofte = null;

// Een script van de eigen site erbij laden (tfjs is een gewone <script> die window.tf zet). 'self' in de CSP dekt dit.
function laadScript(src) {
  return new Promise((ok, mis) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => ok();
    s.onerror = () => mis(new Error('kon ' + src + ' niet laden'));
    document.head.appendChild(s);
  });
}

// Laadt tfjs + het model, één keer. Geeft 'klaar' of 'uit' (bij een oud toestel / geen WebGL / een fout).
async function laad() {
  if (status === 'klaar' || status === 'uit') return status;
  if (laadBelofte) return laadBelofte;
  status = 'laadt';
  laadBelofte = (async () => {
    try {
      if (!window.tf) await laadScript('/vendor/tf.min.js');
      tf = window.tf;
      if (!tf) throw new Error('geen tf');
      // WebGL eerst; lukt dat niet, dan valt tfjs zelf terug op de (tragere) cpu-backend. Zonder allebei: controle uit.
      try { await tf.setBackend('webgl'); } catch (e) { /* dan probeert tf.ready de volgende */ }
      await tf.ready();
      if (tf.getBackend() !== 'webgl' && tf.getBackend() !== 'cpu') throw new Error('geen backend');
      model = await tf.loadLayersModel('/vendor/model.json');
      // Eén keer warmdraaien, zodat de eerste echte meting niet hapert (compileert de WebGL-shaders).
      const warm = tf.tidy(() => model.predict(tf.zeros([1, GROOTTE, GROOTTE, 3])));
      await warm.data(); warm.dispose();
      status = 'klaar';
    } catch (e) {
      status = 'uit';
      if (model) { try { model.dispose(); } catch (x) { /* */ } model = null; }
    }
    return status;
  })();
  return laadBelofte;
}

// Deelt het beeld in. Geeft een object met kansen { drawing, hentai, neutral, porn, sexy } (0..1), of null bij een fout.
let doek = null, ctx = null;
function deelIn(video) {
  if (!model || !tf) return null;
  if (!doek) { doek = document.createElement('canvas'); doek.width = doek.height = GROOTTE; ctx = doek.getContext('2d', { willReadFrequently: true }); }
  try {
    // Het beeld naar een klein 224×224-doek tekenen (uitgerekt tot vierkant, net als NSFWJS het beeld vierkant maakt).
    ctx.drawImage(video, 0, 0, GROOTTE, GROOTTE);
  } catch (e) { return null; } // beeld nog niet bruikbaar
  let logits = null;
  try {
    logits = tf.tidy(() => {
      const beeld = tf.browser.fromPixels(doek).toFloat().div(255); // zelfde voorbewerking als NSFWJS
      return model.predict(beeld.reshape([1, GROOTTE, GROOTTE, 3]));
    });
    const data = logits.dataSync();
    const kansen = {};
    for (let i = 0; i < KLASSEN.length; i++) kansen[KLASSEN[i]] = data[i];
    return naarKansen(kansen);
  } catch (e) {
    return null;
  } finally {
    if (logits) logits.dispose();
  }
}

// Kijk mee op één video-element. Roept de meegegeven functies aan; verbreekt nooit zelf (dat beslist de aanroeper).
//   onWaarschuwing(kansen)  eerste verdachte meting (nog geen zekerheid)
//   onBloot(kansen)         genoeg verdachte metingen achter elkaar: nu iets doen
//   onSchoon()              weer een schoon beeld
// Geeft { stop } terug. 'eigen' maakt de drempel wat strenger (je eigen camera, alleen waarschuwen).
function volgVideo(video, { onWaarschuwing, onBloot, onSchoon, eigen = false } = {}) {
  let gestopt = false, bezig = false, timer = null;
  let staat = { achtereen: 0 };
  const opties = eigen ? { drempel: 0.70, nodigAchtereen: 2 } : { drempel: STANDAARD.drempel, nodigAchtereen: STANDAARD.nodigAchtereen };

  const tik = async () => {
    if (gestopt) return;
    // Niet meten als het tabblad weg is of er nog geen beeld is: scheelt werk op een telefoon.
    if (!document.hidden && video && video.readyState >= 2 && video.videoWidth > 0) {
      bezig = true;
      const kansen = deelIn(video);
      bezig = false;
      if (gestopt) return;
      if (kansen) {
        const verdacht = isVerdacht(kansen, opties);
        const r = volg(staat, verdacht, opties);
        staat = { achtereen: r.achtereen };
        if (r.actie === 'verbreek') { if (onBloot) onBloot(kansen); return; } // stoppen: geen nieuwe meting meer
        if (r.actie === 'waarschuw' && onWaarschuwing) onWaarschuwing(kansen);
        if (!verdacht && onSchoon) onSchoon();
      }
    }
    timer = setTimeout(tik, TUSSENPOOS);
  };
  timer = setTimeout(tik, eigen ? TUSSENPOOS + 400 : 300); // de vreemde als eerste bekijken
  return { stop() { gestopt = true; clearTimeout(timer); } };
}

window.TKBloot = {
  laad,
  status: () => status,
  klaar: () => status === 'klaar',
  volg: volgVideo,
  // Alleen-lezen: deel één beeld in en geef de kansen terug. Handig om in een test te zien dat een nette
  // afbeelding als veilig gelezen wordt. Verandert niets en stuurt niets.
  meet: (el) => deelIn(el),
};
