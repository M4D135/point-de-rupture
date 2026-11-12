// Vérifie ce que le jeu dit de sa copie de FERRO (src/moteur/FERRO.md, PROVENANCE.md) contre les fichiers :
// - la version, le commit et les sha256 écrits sont les bons : celui de la copie se recalcule, celui de l'original est
//   celui du fichier de FERRO à l'étiquette (lu de son clone quand il est là) ; le tableau de FERRO.md nomme chaque
//   fichier du dossier du moteur ;
// - chaque retouche marquée « PDR (nom) » dans la copie est décrite sous ce nom dans PROVENANCE.md, et l'inverse ;
// - la copie est l'original plus ces retouches, et rien d'autre : chaque ligne qui diffère de l'original tient dans un
//   bloc qui commence par un commentaire « PDR (nom) », et aucune ligne de FERRO ne disparaît sans qu'un tel bloc la
//   remplace. Les comptes écrits dans PROVENANCE.md (blocs, lignes ajoutées, lignes remplacées) sont ceux du fichier.
// L'original se lit du clone de FERRO (originaux-ferro.mjs) ; sans lui, c'est dit, et seule la comparaison ligne à
// ligne est sautée.
//   node Jeu/verifications/ferro.test.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { FERRO, RENDERER, original, commitDe, ABSENT, ecart, sha256 } from './originaux-ferro.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
const moteur = path.join(ici, '..', 'src', 'moteur');
const lire = f => fs.readFileSync(path.join(moteur, f));
const COPIE = lire('renderer.js'), copie = COPIE.toString('utf8');
const ferroMd = lire('FERRO.md').toString('utf8'), provenance = lire('PROVENANCE.md').toString('utf8');
const milliers = n => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');     // 120863 → « 120 863 », comme dans les documents

let ok = 0, sautees = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };

const MARQUE = /PDR \(([^)]+)\)/g;
const nomsDe = texte => [...texte.matchAll(MARQUE)].flatMap(m => m[1].split(',').map(s => s.trim()));
// Les retouches, dans l'ordre où elles apparaissent dans la copie.
const RETOUCHES = [...new Set(nomsDe(copie))];

verifier('FERRO.md et PROVENANCE.md : version, commit et sha256 de l’original et de la copie', () => {
  const origine = RENDERER[FERRO.etiquette];
  const somme = sha256(COPIE);
  for (const [nom, texte] of [['FERRO.md', ferroMd], ['PROVENANCE.md', provenance]]) {
    assert.ok(texte.includes('`' + FERRO.etiquette + '`'), nom + ' : étiquette ' + FERRO.etiquette);
    assert.ok(texte.includes(FERRO.commit), nom + ' : commit entier ' + FERRO.commit);
    assert.ok(texte.includes(FERRO.depot), nom + ' : dépôt ' + FERRO.depot);
    assert.ok(texte.includes(origine.sha256), nom + ' : sha256 de l’original, ' + origine.sha256);
    assert.ok(texte.includes(somme), nom + ' : sha256 de la copie, ' + somme + ' (renderer.js a changé : mettre le document à jour)');
    assert.ok(texte.includes(milliers(origine.octets) + ' octets'), nom + ' : taille de l’original');
    assert.ok(texte.includes(milliers(COPIE.length) + ' octets'), nom + ' : taille de la copie, ' + milliers(COPIE.length) + ' octets');
  }
  // Pas d'autre empreinte dans FERRO.md ; PROVENANCE.md cite aussi celles d'avant le passage.
  assert.deepEqual([...new Set(ferroMd.match(/\b[0-9a-f]{64}\b/g))].sort(), [origine.sha256, somme].sort());
  const admises = new Set([origine.sha256, somme, RENDERER['metal-0.6'].sha256, RENDERER['v0.1'].sha256]);
  for (const s of provenance.match(/\b[0-9a-f]{64}\b/g)) assert.ok(admises.has(s), 'PROVENANCE.md : empreinte inconnue ' + s);
  // L'en-tête de la copie dit d'où elle vient.
  const tete = copie.slice(0, 700);
  assert.ok(tete.includes('PDR (origine)') && tete.includes(FERRO.etiquette) && tete.includes(FERRO.commit.slice(0, 7)) && tete.includes('PROVENANCE.md'));
  // Le clone, quand il est là : l'étiquette désigne bien ce commit.
  const commit = commitDe(FERRO.etiquette);
  if (commit) assert.equal(commit, FERRO.commit, 'l’étiquette ' + FERRO.etiquette + ' du clone');
  console.log('    copie : ' + milliers(COPIE.length) + ' octets, sha256 ' + somme.slice(0, 16) + '… ; étiquette ' + FERRO.etiquette
    + (commit ? ' vérifiée dans le clone' : ' non vérifiée (pas de clone)'));
});

verifier('FERRO.md : le tableau nomme chaque fichier du moteur, avec sa base', () => {
  const fichiers = fs.readdirSync(moteur).filter(f => f.endsWith('.js')).sort();
  assert.deepEqual(fichiers, ['audio.js', 'musique.js', 'renderer.js']);
  const lignes = ferroMd.split('\n').filter(l => l.startsWith('| `'));
  for (const f of fichiers) assert.equal(lignes.filter(l => l.startsWith('| `' + f + '`')).length, 1, 'une ligne pour ' + f);
  const de = f => lignes.find(l => l.startsWith('| `' + f + '`'));
  assert.ok(de('renderer.js').includes('`' + FERRO.etiquette + '`') && de('renderer.js').includes('copie'));
  for (const f of ['audio.js', 'musique.js']) assert.ok(de(f).includes('`metal-4ce2271`') && de(f).includes('portage'), f + ' : portage, base metal-4ce2271');
  assert.ok(ferroMd.includes('PROVENANCE-SON.md') && ferroMd.includes('PROVENANCE.md'));
  // Le nombre de retouches annoncé est celui de la copie.
  const annonce = /avec (\d+) retouches/.exec(de('renderer.js'));
  assert.ok(annonce && Number(annonce[1]) === RETOUCHES.length, 'FERRO.md annonce ' + (annonce && annonce[1]) + ' retouches, la copie en porte ' + RETOUCHES.length);
});

verifier('retouches : chaque « PDR (nom) » de la copie est décrite dans PROVENANCE.md, et l’inverse', () => {
  // Dans PROVENANCE.md, une retouche est une entrée numérotée dont le nom est en gras : « 2. **voile** ».
  const decrites = [...provenance.matchAll(/^(\d+)\. \*\*([^*]+)\*\*/gm)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(decrites.map(d => d[1]), RETOUCHES, 'mêmes retouches, dans l’ordre du fichier');
  assert.deepEqual(decrites.map(d => d[0]), RETOUCHES.map((_, i) => i + 1), 'numérotées de 1 à ' + RETOUCHES.length);
  assert.ok(RETOUCHES.length >= 4 && RETOUCHES.includes('voile') && RETOUCHES.includes('foule'));
  // Celles qui serviraient à d'autres jeux sont signalées à FERRO.
  const entree = nom => provenance.split(/^\d+\. \*\*/m).find(e => e.startsWith(nom + '**'));
  assert.ok(/générique, à récolter/.test(entree('msaa')), 'msaa : « générique, à récolter »');
  assert.ok(/à unifier/.test(entree('lots')) && entree('lots').includes('setLots'), 'lots : à unifier avec setLots');
  console.log('    ' + RETOUCHES.length + ' retouches : ' + RETOUCHES.join(', '));
});

const v02 = original(FERRO.etiquette);
if (!v02) { sautees++; console.log('--  la copie est FERRO ' + FERRO.etiquette + ' plus des blocs marqués « PDR (nom) » : SAUTÉ, ' + ABSENT); }
else verifier('la copie est FERRO ' + FERRO.etiquette + ' plus des blocs marqués « PDR (nom) », et rien d’autre', () => {
  const y = copie.split('\n'), { blocs } = ecart(v02.texte, copie);
  const marquee = l => /^\s*(\/\/|\/\*) PDR \([^)]+\)/.test(l);
  let ajoutees = 0, remplacees = 0, glisses = 0;
  for (const bloc of blocs) {
    const ou = 'ligne ' + (bloc.b + 1) + ' de la copie';
    assert.ok(bloc.nb > 0, ou + ' : ' + bloc.na + ' ligne(s) de FERRO retirée(s) sans rien à la place, à partir de sa ligne ' + (bloc.a + 1));
    // Tolérance : quand un bloc ajouté touche une ligne identique à l'une des siennes (accolade fermante, ligne vide),
    // la comparaison ne sait pas laquelle des deux est la nouvelle. On fait donc glisser le bloc, vers le bas puis vers
    // le haut, tant que la ligne qu'il lâche d'un côté est celle qu'il prend de l'autre ; il suffit qu'une de ces
    // positions commence par la marque. Un bloc qui remplace des lignes de FERRO ne glisse pas.
    let debut = bloc.b;
    if (!marquee(y[debut]) && !bloc.na) {
      for (let d = bloc.b; d + bloc.nb < y.length && y[d] === y[d + bloc.nb]; d++) if (marquee(y[d + 1])) { debut = d + 1; break; }
      for (let d = bloc.b; debut === bloc.b && d > 0 && y[d - 1] === y[d + bloc.nb - 1]; d--) if (marquee(y[d - 1])) { debut = d - 1; break; }
      if (debut !== bloc.b) glisses++;
    }
    assert.ok(marquee(y[debut]), ou + ' : ' + bloc.nb + ' ligne(s) hors de FERRO sans marque « PDR (nom) » en tête : ' + y[bloc.b].trim().slice(0, 100));
    ajoutees += bloc.nb; remplacees += bloc.na;
  }
  // Pas de marque du jeu sur une ligne de FERRO : toute ligne marquée est dans un bloc ajouté.
  const dansBloc = new Uint8Array(y.length);
  for (const bloc of blocs) dansBloc.fill(1, bloc.b, bloc.b + bloc.nb);
  y.forEach((l, i) => { if (/PDR \([^)]+\)/.test(l)) assert.ok(dansBloc[i], 'ligne ' + (i + 1) + ' : marque du jeu sur une ligne de FERRO'); });
  // Les comptes écrits dans PROVENANCE.md.
  const ecrit = /(\d+)\s+blocs,\s+(\d+)\s+lignes\s+ajoutées\s+et\s+(\d+)\s+lignes\s+de\s+FERRO\s+remplacées/.exec(provenance);   // la phrase peut passer à la ligne
  assert.ok(ecrit, 'PROVENANCE.md : « N blocs, N lignes ajoutées et N lignes de FERRO remplacées »');
  assert.deepEqual(ecrit.slice(1).map(Number), [blocs.length, ajoutees, remplacees], 'comptes de PROVENANCE.md');
  assert.equal(y.length, v02.texte.split('\n').length + ajoutees - remplacees);
  console.log('    ' + blocs.length + ' blocs, ' + ajoutees + ' lignes ajoutées, ' + remplacees + ' lignes de FERRO remplacées'
    + (glisses ? ' (' + glisses + ' bloc(s) recalé(s) sur leur marque)' : '') + ' ; original lu de ' + v02.source);
});

console.log(ok + ' vérifications de la copie de FERRO réussies' + (sautees ? ', ' + sautees + ' sautée(s)' : ''));
