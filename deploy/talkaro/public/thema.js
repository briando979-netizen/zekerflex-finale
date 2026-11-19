// Licht of donker. Zonder eigen keuze volgt de pagina het apparaat. Staat in de <head>, zodat de pagina niet eerst
// in de verkeerde kleur verschijnt.
(() => {
  let keuze = null;
  try { keuze = localStorage.getItem('tk_thema'); } catch (e) { /* geen opslag: dan volgen we het apparaat */ }
  const zet = (t) => { if (t === 'licht' || t === 'donker') document.documentElement.dataset.thema = t; else delete document.documentElement.dataset.thema; };
  zet(keuze);
  const nuDonker = () => (document.documentElement.dataset.thema || (matchMedia('(prefers-color-scheme: dark)').matches ? 'donker' : 'licht')) === 'donker';
  document.addEventListener('DOMContentLoaded', () => {
    const knop = document.getElementById('btn-thema');
    if (!knop) return;
    const werkBij = () => { knop.setAttribute('aria-pressed', String(nuDonker())); knop.setAttribute('aria-label', nuDonker() ? 'Lichte weergave aanzetten' : 'Donkere weergave aanzetten'); };
    werkBij();
    knop.addEventListener('click', () => {
      const nieuw = nuDonker() ? 'licht' : 'donker';
      zet(nieuw); try { localStorage.setItem('tk_thema', nieuw); } catch (e) { /* dan geldt het alleen voor nu */ }
      werkBij();
    });
  });
})();
