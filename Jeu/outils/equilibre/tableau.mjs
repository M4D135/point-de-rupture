// Tableau d'équilibre : lit les JSON de equilibre.mjs (--json) et rend une ligne par partie.
import fs from 'node:fs';
import path from 'node:path';
const fichiers = process.argv.slice(2).flatMap(a => fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter(f => f.endsWith('.json')).map(f => path.join(a, f)) : [a]).sort();
const CAMPS = ['C', 'B', 'P'];
const nom = (r) => r.vainqueur < 0 ? 'en cours' : r.vainqueur === 3 ? 'alliance ' + (r.alliance || []).map(f => CAMPS[f]).join('+') : r.vainqueur === 4 ? 'nul' : CAMPS[r.vainqueur];
const lignes = [];
lignes.push(['ville', 'E', 'mode', 'graine', 'min', 'vainqueur', 'raison', 'en jeu 5 min (% départ)', 'en jeu 10 min', 'fin : en jeu', 'scores', 'cockt.', 'gren.', 'charges', 'pierres', 'à terre', 'feux', 'éteints', 'jets', 'salves', 'ms cpu'].join(' | '));
for (const f of fichiers) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of d.resultats) {
    const m5 = r.minutes[4], m10 = r.minutes[9];
    const pct = m => m ? m.vivantes.map((v, k) => Math.round(100 * v / r.depart[k])).join('/') : '-';
    const s = (k) => r.bilan.map(b => b[k] ?? '-').join('/');
    lignes.push([r.ville, r.effectifs, r.mode, r.graine, r.minutesSimulees, nom(r), r.raison || '-', pct(m5), pct(m10), r.vivantes.join('/'), r.scores.join('/'),
      s('molotovs'), s('grenades'), s('charges'), s('pierres'), s('aTerre'), s('feux'), s('eteints'), r.compte.JET || 0, r.compte.SALVE || 0, r.msCpu].join(' | '));
  }
}
console.log(lignes.join('\n'));
