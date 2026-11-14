// La jauge d'hostilité par paire, mesurée là où elle doit tenir : les dégâts par couple agresseur/victime.
// bilan[f].infliges compte tous les coups d'un camp sans dire à qui ; seules les paires prouvent que la
// Préfecture ne frappe jamais la première. Lancer : node Jeu/verifications/police4.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const exiger = createRequire(import.meta.url);
const src = f => fileURLToPath(new URL('../src/' + f, import.meta.url));
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/immeubles.js', 'sim/monde.js', 'sim/ia.js', 'sim/travailleur.js']) exiger(src(f));
const { ville: V, regles: R, monde: M, ia: IA } = globalThis.PDR;
const { CONVERGENCE: C, BASTION: B, PREFECTURE: F } = R;
const IT_S = R.CONSTANTES.IT_PAR_S;
const NOM = { [C]: 'convergence', [B]: 'bastion', [F]: 'préfecture' };

function deuxCamps(a, b, secondes = 120) {
  const v = V.creerVille(3, { ilots: R.ilots(20000) });
  const m = M.creer(v, { graine: 3, effectifs: 20000, vide: true, joueur: -1, brouillard: false });
  const r = m.ville.accrocher(m.ville.etendue.x0 + 400, m.ville.etendue.z0 + 400);
  const g = (f, t, n, dz) => { const ids = [], fines = new Int32Array(n); const k = m.nav.remplir(Math.round(r[0] * 1000), Math.round((r[1] + dz) * 1000), n, fines); for (let q = 0; q < n; q++) ids.push(m.ajouter(f, t, m.nav.fineX(fines[q % k]) / 1000, m.nav.fineZ(fines[q % k]) / 1000)); return ids; };
  g(a, 1, 25, 0); g(b, 1, 25, 5);
  const ia = IA.creer(m);
  let tA = -1, tB = -1;
  for (let s = 0; s < secondes; s++) {
    for (let k = 0; k < IT_S; k++) { m.iterer(); ia.penser(); }
    const cp = m.coupsParPaire;
    if (tA < 0 && cp[a * 4 + b] > 0) tA = s;
    if (tB < 0 && cp[b * 4 + a] > 0) tB = s;
  }
  const cp = m.coupsParPaire;
  return `${NOM2[a]} vs ${NOM2[b]} : ${NOM2[a]}->${NOM2[b]} = ${Math.round(cp[a*4+b]/1000)} (dès ${tA}s) | ${NOM2[b]}->${NOM2[a]} = ${Math.round(cp[b*4+a]/1000)} (dès ${tB}s) | jauge ${a}->${b}=${m.hostilite[a*4+b]} ${b}->${a}=${m.hostilite[b*4+a]}`;
}
const NOM2 = { [C]: 'convergence', [B]: 'bastion', [F]: 'préfecture' };
console.log(deuxCamps(B, F));
console.log(deuxCamps(F, B));
console.log(deuxCamps(C, F));
console.log(deuxCamps(C, B));
