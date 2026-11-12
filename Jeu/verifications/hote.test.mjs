// Hôte de la simulation : travailleur construit depuis les scripts data-travailleur, repli sur le fil principal.
//   node Jeu/verifications/hote.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(ICI, '../src/hote.js'), 'utf8');
const attendre = () => new Promise(r => setTimeout(r, 5));

/** Un document minimal : des scripts data-travailleur, et l'exécution des scripts ajoutés. */
function fauxDocument(contexte, scripts) {
  const ajoutes = [];
  return {
    ajoutes,
    querySelectorAll: sel => (sel === 'script[data-travailleur]' ? scripts : []),
    createElement: () => ({ type: '', textContent: '' }),
    head: { appendChild(el) { ajoutes.push(el); vm.runInContext(el.textContent, contexte); } },
  };
}

// Une « simulation » de quatre lignes, au format de sim/travailleur.js : creer(envoyer) → { recevoir }.
const SIMULATION = `(function (PDR) {
  PDR.travailleur = { creer(envoyer) { const recus = []; PDR.recus = recus;
    return { recevoir(m) { recus.push(m.type); if (m.type === 'demarrer') envoyer({ type: 'pret', carte: {}, options: m.options }); } }; } };
})(globalThis.PDR = globalThis.PDR || {});`;

function contexte({ avecWorker }) {
  const ctx = vm.createContext({ queueMicrotask, setTimeout, console });
  vm.runInContext('globalThis.PDR = {};', ctx);
  if (avecWorker) {
    const urls = [];
    ctx.Blob = class { constructor(parts, opts) { this.texte = parts.join(''); this.type = opts.type; } };
    ctx.URL = function URL() {};
    ctx.URL.createObjectURL = b => { urls.push(b); return 'blob:essai/' + urls.length; };
    ctx.URL.revokeObjectURL = () => {};
    ctx.urls = urls;
    ctx.Worker = class {
      constructor(url) { this.url = url; this.postes = []; this.termine = false; ctx.dernierWorker = this; }
      postMessage(m, transferts) { this.postes.push({ m, transferts }); }
      terminate() { this.termine = true; }
    };
  }
  vm.runInContext(code, ctx);
  return ctx;
}

const scripts = [
  { type: '', textContent: '/* partagé */ globalThis.PDR.partage = 1;' },
  { type: 'text/plain', textContent: SIMULATION },
];

{ // Travailleur : le texte des scripts, dans l'ordre ; messages et transferts.
  const ctx = contexte({ avecWorker: true });
  const doc = fauxDocument(ctx, scripts);
  const recus = [];
  const hote = ctx.PDR.hote.creer({ surMessage: m => recus.push(m), document: doc });
  assert.equal(hote.mode, 'travailleur');
  const texte = ctx.urls[0].texte;
  assert.ok(texte.indexOf('partagé') < texte.indexOf('PDR.travailleur'), 'ordre des scripts conservé');
  assert.equal(ctx.urls[0].type, 'text/javascript');
  hote.demarrer({ graine: 7 });
  hote.commandes([]);                                  // liste vide : rien n'est envoyé
  const tampon = new ArrayBuffer(16);
  hote.rendre(tampon);
  const w = ctx.dernierWorker;
  assert.deepEqual(w.postes.map(p => p.m.type), ['demarrer', 'rendre']);
  assert.equal(w.postes[1].transferts[0], tampon, 'le tampon rendu est transféré');
  w.onmessage({ data: { type: 'pret' } });
  assert.equal(recus[0].type, 'pret');
  hote.arreter();
  assert.ok(w.termine);
  w.onmessage && w.onmessage({ data: { type: 'etat' } });
  assert.equal(recus.length, 1, 'plus rien après arreter');
}

{ // Travailleur refusé au chargement : repli sur le fil, le démarrage est rejoué.
  const ctx = contexte({ avecWorker: true });
  const doc = fauxDocument(ctx, scripts);
  const recus = [];
  const hote = ctx.PDR.hote.creer({ surMessage: m => recus.push(m), document: doc });
  hote.demarrer({ graine: 3 });
  const w = ctx.dernierWorker;
  w.onerror({ message: 'refusé', preventDefault() {} });
  assert.equal(hote.mode, 'fil');
  assert.match(hote.raison, /refusé/);
  assert.ok(w.termine);
  assert.equal(doc.ajoutes.length, 1, 'seul le script de simulation est exécuté dans la page');
  await attendre();
  assert.equal(recus[0].type, 'pret');
  assert.equal(recus[0].options.graine, 3);
}

{ // Sans Worker : fil principal d'emblée ; livraison différée, jamais pendant l'appel.
  const ctx = contexte({ avecWorker: false });
  const doc = fauxDocument(ctx, scripts);
  const recus = [];
  const hote = ctx.PDR.hote.creer({ surMessage: m => recus.push(m), document: doc });
  assert.equal(hote.mode, 'fil');
  hote.demarrer({ graine: 1 });
  assert.equal(recus.length, 0, 'livraison différée');
  await attendre();
  assert.equal(recus[0].type, 'pret');
  hote.vitesse(2);
  hote.arreter();
  hote.vitesse(4);                                     // après arreter : ignoré
  await attendre();
  assert.deepEqual(Array.from(ctx.PDR.recus), ['demarrer', 'vitesse', 'arreter']);
}

console.log('hote : travailleur, repli sur le fil, arrêt — OK');
