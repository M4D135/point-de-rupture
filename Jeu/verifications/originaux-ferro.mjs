// Les fichiers d'origine de FERRO, pour rendu.test.mjs et ferro.test.mjs. Ce n'est pas une suite : rien ne s'exécute ici.
//
// Un original se lit du clone de FERRO (git show <étiquette>:src/renderer.js), cherché dans FERRO_DEPOT puis dans
// ~/Projects/ferro ; à défaut, d'un fichier extrait à la main dans le dossier FERRO_FICHIERS, nommé
// <étiquette>-renderer.js (git -C <clone> show v0.2:src/renderer.js > v0.2-renderer.js). D'où qu'il vienne, son sha256
// doit être celui noté ici : c'est lui qui fait foi, pas l'endroit. Introuvable : null, et la suite qui le demandait
// le dit et saute ses comparaisons avec lui, elles seules.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sha256 = octets => createHash('sha256').update(octets).digest('hex');

/** La version de FERRO sur laquelle le jeu repose : étiquette, commit, et le renderer d'origine. */
export const FERRO = Object.freeze({
  depot: 'github.com/M4D135/FERRO',
  etiquette: 'v0.2',
  commit: '248043a674e5353724731a7322ae932487c236b7',
});

/** src/renderer.js de FERRO à chaque étiquette utile : la base de la copie du jeu, et les deux bornes de ce que METAL a changé. */
export const RENDERER = Object.freeze({
  'v0.2': { sha256: 'd57dae38eed729f6ba72b6673a2174e82869c8ab85670dd7c6a71628504a85a1', octets: 120863, quoi: 'FERRO 0.2, base de la copie du jeu' },
  'v0.1': { sha256: '11460253bae6487d6623bd8224204ebe5fa546ca2bdd565e8a09938240944874', octets: 106801, quoi: 'FERRO 0.1, le moteur de METAL 0.8' },
  'metal-0.6': { sha256: '45c1b17014fb5310f89ea6ca982d91a9a9158f71472eaf82c5eadeae817df0a4', octets: 104386, quoi: 'METAL 0.6, base de la copie d’avant' },
});

/** La copie du jeu d'avant le passage à cette version, dans l'historique du jeu : rendu.test.mjs compare les deux copies. */
export const COPIE_AVANT = Object.freeze({ commit: '5ac0066', sha256: '4207b9df5373ef7585229ff3aa717ad5c115c7da75eddeaa951b1d19699917a7',
  quoi: 'le renderer de METAL 0.6 et 17 retouches' });

const git = (depot, ...args) => execFileSync('git', ['-C', depot, ...args], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });

/** Le clone de FERRO, s'il est là : FERRO_DEPOT, sinon ~/Projects/ferro. Rend son chemin, ou null. */
export function clone() {
  for (const chemin of [process.env.FERRO_DEPOT, path.join(os.homedir(), 'Projects', 'ferro')]) {
    if (!chemin) continue;
    try { git(chemin, 'rev-parse', '--git-dir'); return chemin; } catch (e) { /* pas un dépôt : on cherche plus loin */ }
  }
  return null;
}

/** Le commit que désigne une étiquette dans le clone, ou null (pas de clone, pas d'étiquette). */
export function commitDe(etiquette) {
  const depot = clone();
  if (!depot) return null;
  try { return git(depot, 'rev-parse', etiquette + '^{commit}').toString('utf8').trim(); } catch (e) { return null; }
}

/**
 * src/renderer.js de FERRO à une étiquette : { texte, source } ou null s'il est introuvable. Un fichier trouvé dont le
 * sha256 n'est pas celui attendu est une erreur, pas une absence : l'étiquette a bougé, ou ce n'est pas le bon fichier.
 */
export function original(etiquette) {
  const attendu = RENDERER[etiquette];
  if (!attendu) throw new Error('originaux-ferro : étiquette inconnue, ' + etiquette);
  const essais = [];
  const depot = clone();
  if (depot) essais.push(['le clone ' + depot, () => git(depot, 'show', etiquette + ':src/renderer.js')]);
  if (process.env.FERRO_FICHIERS) {
    const fichier = path.join(process.env.FERRO_FICHIERS, etiquette + '-renderer.js');
    essais.push([fichier, () => fs.readFileSync(fichier)]);
  }
  for (const [source, lire] of essais) {
    let octets;
    try { octets = lire(); } catch (e) { continue; }
    const somme = sha256(octets);
    if (somme !== attendu.sha256) {
      throw new Error('renderer.js de FERRO à ' + etiquette + ', lu de ' + source + ' : sha256 ' + somme + ' au lieu de ' + attendu.sha256);
    }
    return { texte: octets.toString('utf8'), source };
  }
  return null;
}

/** La phrase à écrire quand un original manque. */
export const ABSENT = 'clone de FERRO introuvable (FERRO_DEPOT, ~/Projects/ferro) et pas de fichier extrait (FERRO_FICHIERS)';

/**
 * Écart ligne à ligne de a vers b (plus longue sous-suite commune) : les lignes de a absentes de b, celles de b absentes
 * de a, et les blocs { a, na, b, nb } : na lignes de a à partir de la ligne a (à partir de 0) remplacées par nb lignes de
 * b à partir de la ligne b. Deux fichiers de 2 000 lignes : quelques dizaines de millisecondes.
 */
export function ecart(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  let debut = 0, finX = x.length, finY = y.length;
  while (debut < finX && debut < finY && x[debut] === y[debut]) debut++;
  while (finX > debut && finY > debut && x[finX - 1] === y[finY - 1]) { finX--; finY--; }
  const n = finX - debut, m = finY - debut, L = new Uint32Array((n + 1) * (m + 1)), w = m + 1;
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i * w + j] = x[debut + i] === y[debut + j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  }
  const moins = [], plus = [], blocs = [];
  let i = 0, j = 0, bloc = null;
  const ouvrir = () => { if (!bloc) { bloc = { a: debut + i, na: 0, b: debut + j, nb: 0 }; blocs.push(bloc); } };
  while (i < n || j < m) {
    if (i < n && j < m && x[debut + i] === y[debut + j]) { i++; j++; bloc = null; continue; }
    ouvrir();
    if (j >= m || (i < n && L[(i + 1) * w + j] >= L[i * w + j + 1])) { moins.push(x[debut + i]); bloc.na++; i++; }
    else { plus.push(y[debut + j]); bloc.nb++; j++; }
  }
  return { moins, plus, blocs };
}
