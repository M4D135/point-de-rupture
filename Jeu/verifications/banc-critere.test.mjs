// Exerce le véritable CLI du banc avec une horloge et une simulation déterministes.
// Ces valeurs fictives testent le verdict du banc, jamais les performances du jeu.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dossier = mkdtempSync(path.join(tmpdir(), 'pdr-critere-'));
const banc = fileURLToPath(new URL('./banc-sim.mjs', import.meta.url));
try {
  for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js',
    'ville-reelle.js', 'sim/nav.js', 'sim/immeubles.js', 'sim/monde.js', 'sim/ia.js']) {
    const cible = path.join(dossier, f);
    mkdirSync(path.dirname(cible), { recursive: true });
    writeFileSync(cible, '');
  }
  writeFileSync(path.join(dossier, 'sim/regles.js'), `
    let horloge = 0, numero = 0;
    const couts = JSON.parse(process.env.PDR_COUTS_TEST);
    Object.defineProperty(globalThis, 'performance', {value: {now: () => horloge}, configurable: true});
    globalThis.PDR = {
      regles: {ilots: () => 1}, protocole: {CAPACITE: 1, villeDe: () => ({})},
      monde: {creer: () => {
        const index = numero++, cout = couts[index % couts.length];
        return {it: 0, vivantes: [1, 1, 1], nav: {champs: []},
          iterer() {this.it++; horloge += cout;}, etat() {},
          empreinte: () => process.env.PDR_DIVERGENCE_TEST ? String(index) : 'identique'};
      }}, ia: {creer: () => ({penser() {}})}
    };
  `);
  function lancer(couts, repetee, divergence = false) {
    const r = spawnSync(process.execPath, [banc, '--src', dossier, '--effectifs', '100000',
      '--essais', '3', '--chauffe', '0', '--mesure', '1', ...(repetee ? ['--validation-repetee'] : [])],
    {encoding: 'utf8', env: {...process.env, PDR_COUTS_TEST: JSON.stringify(couts),
      PDR_DIVERGENCE_TEST: divergence ? '1' : ''}});
    assert.equal(r.signal, null, r.stderr);
    const ligne = r.stdout.split('\n').find(l => l.startsWith('JSON '));
    assert.ok(ligne, r.stderr || r.stdout);
    return {...r, bilan: JSON.parse(ligne.slice(5))};
  }
  const historique = lancer([24, 26, 24], false);
  assert.equal(historique.status, 0, historique.stderr);
  const mixte = lancer([24, 26, 24], true);
  assert.equal(mixte.status, 1, mixte.stdout);
  assert.match(mixte.stdout, /MANQUÉ.*tous les essais/);
  assert.equal(mixte.bilan.length, 2, 'avec et sans IA');
  for (const cas of mixte.bilan) {
    assert.deepEqual(cas.essais, [24, 26, 24]);
    assert.equal(cas.moyenne, 24, 'la statistique historique reste disponible');
    assert.equal(cas.moyenneValidation, 26);
    assert.equal(cas.validationRepetee, true);
  }
  const tous = lancer([24, 25, 24], true);
  assert.equal(tous.status, 0, tous.stdout);
  assert.match(tous.stdout, /tenu.*tous les essais/);
  const iaSeule = lancer([24, 24, 24, 24, 26, 24], true);
  assert.equal(iaSeule.status, 1, 'le cas avec IA ne doit pas être masqué par le cas au repos');
  assert.equal(iaSeule.bilan[0].moyenneValidation, 24);
  assert.equal(iaSeule.bilan[1].moyenneValidation, 26);
  const arrondi = lancer([24, 25.0001, 24], true);
  assert.equal(arrondi.status, 1, 'ne pas accepter un dépassement masqué par l’arrondi');
  const divergence = lancer([24, 24, 24], true, true);
  assert.equal(divergence.status, 1, 'les empreintes divergentes restent un échec');
  console.log('banc : 6 scénarios de verdict validés (horloge fictive, aucune mesure de performance)');
} finally {
  rmSync(dossier, {recursive: true, force: true});
}
