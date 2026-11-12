// Vérifie les plans de villes réelles (src/villes/*.js, écrits par outils/plans/extraire.py). Chaque module se charge
// comme un script classique dans un contexte nu (vm : ni window, ni document, ni atob, ni Buffer, comme dans le
// travailleur), se décode, rend des valeurs finies au décimètre dans son étendue, des polygones fermés, orientés, non
// dégénérés, et toujours les mêmes données ; les comptes par sorte sont ceux qu'annonce le module, et les carrés de jeu
// suivent ceux du damier (src/ville.js) à 10 % près. Le mobilier (points sans nom) et le lointain (repères, bâtiments,
// boîtes, eau, espaces, voies hors du carré) sont contrôlés de même. Une donnée altérée est refusée au chargement.
//   node Jeu/verifications/plans.test.mjs
//   PLANS=dossier node Jeu/verifications/plans.test.mjs      vérifie les plans d'un autre dossier (avant de les livrer)
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const dossier = process.env.PLANS ? path.resolve(process.env.PLANS) : path.join(ici, '..', 'src', 'villes');
const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.js')).sort();
createRequire(import.meta.url)(path.join(ici, '..', 'src', 'ville.js'));
const { creerVille } = globalThis.PDR.ville;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };

// Ce que permet le contrat (en-tête des modules, tables de classement d'extraire.py). Une sorte ajoutée à l'outil doit
// l'être ici aussi : le constructeur de la ville doit savoir la poser.
const SORTES = Object.fromEntries(Object.entries({
  classes: ['autoroute', 'voie-express', 'primaire', 'secondaire', 'tertiaire', 'rue', 'desserte', 'piste', 'chemin',
    'voie-bus', 'circuit', 'rail', 'jetee'],
  sousClasses: ['', 'pietonne', 'pieton', 'escalier', 'cyclable', 'sentier', 'cavaliere', 'train', 'tram', 'funiculaire',
    'monorail', 'ruelle', 'acces', 'parking', 'bus'],
  eau: ['port', 'mer', 'riviere', 'bassin', 'piscine'],
  espaces: ['place', 'quai', 'pietonne', 'arret', 'jetee', 'pont', 'parc', 'jardin', 'pelouse', 'bois', 'roche', 'sable',
    'plage', 'marais', 'champ', 'terrain', 'piste', 'jeux', 'cimetiere', 'voies', 'gare-routiere', 'chantier', 'digue'],
  reperes: ['place', 'quartier', 'ville', 'eau', 'site', 'mairie', 'police', 'justice', 'culte', 'musee', 'monument',
    'curiosite', 'fontaine', 'marche', 'theatre', 'bibliotheque', 'embarcadere', 'port', 'gare', 'tram', 'metro', 'parc',
    'jardin', 'jeux', 'point-de-vue', 'stade'],
  mobilier: ['terrasse', 'potelet', 'corbeille', 'conteneur', 'velos', 'velos-partage', 'motos', 'arret-bus', 'abri',
    'boite-lettres', 'fontaine-a-boire', 'toilettes', 'kiosque', 'oeuvre', 'panneau'],
  espacesLoin: ['parc', 'jardin', 'pelouse', 'bois', 'cimetiere', 'terrain', 'roche', 'sable', 'plage'],
  voiesLoin: ['autoroute', 'voie-express', 'primaire', 'secondaire', 'tertiaire'],
}).map(([k, v]) => [k, new Set(v)]));
// m² : en dessous, l'outil retire un polygone (AIRE_MIN et AIRE_MIN_TROU d'extraire.py).
const AIRE_MIN = { batiments: 1.5, eau: 1.0, espaces: 2.0 }, AIRE_MIN_TROU = 0.5;

/** Exécute un module comme un script classique dans un contexte neuf : rien que les objets du langage, plus `globaux`. */
function charger(code, nom, globaux = {}) {
  const bac = vm.createContext(globaux);
  new vm.Script(code, { filename: nom }).runInContext(bac);
  return bac;
}
const estF32 = p => Object.prototype.toString.call(p) === '[object Float32Array]';
/** JSON aux clés triées : compare des objets venus d'un autre contexte sans dépendre de l'ordre des clés. */
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** SHA-256 de tout ce que contient un plan décodé : nombres, textes et octets des tableaux de points. */
function contenu(plan) {
  const h = createHash('sha256'), f64 = new Float64Array(1), o64 = new Uint8Array(f64.buffer);
  const nombre = v => { f64[0] = v; h.update(o64); };
  const texte = t => { h.update(String(t)); h.update('\0'); };
  const points = p => { nombre(p.length); h.update(new Uint8Array(p.buffer, p.byteOffset, p.byteLength)); };
  for (const r of plan.rues) {
    texte(r.classe); texte(r.sousClasse); texte(r.nom); nombre(+r.pont); nombre(r.niveau); nombre(r.sens); points(r.points);
  }
  for (const b of plan.batiments) {
    nombre(b.hauteur); nombre(b.base); nombre(+b.connue); nombre(+b.contour); texte(JSON.stringify(b.couleur));
    points(b.points); nombre(b.trous.length); b.trous.forEach(points);
  }
  for (const g of ['eau', 'espaces']) {
    for (const e of plan[g]) { texte(e.sorte); texte(e.nom); points(e.points); nombre(e.trous.length); e.trous.forEach(points); }
  }
  for (const d of plan.reperes) {
    texte(d.nom); texte(d.sorte); texte(d.classe); texte(d.sousClasse); nombre(d.rang); nombre(d.x); nombre(d.z);
  }
  for (const d of plan.mobilier) { texte(d.sorte); nombre(d.x); nombre(d.z); }
  const L = plan.lointain;
  nombre(L ? 1 : 0);
  if (L) {
    texte(JSON.stringify(L.zone)); texte(JSON.stringify(L.tuilesAbsentes)); texte(JSON.stringify(L.reperes)); texte(JSON.stringify(L.sommets));
    for (const b of L.batiments) {
      nombre(b.hauteur); nombre(b.base); nombre(+b.connue); nombre(+b.contour); texte(JSON.stringify(b.couleur)); nombre(b.repere);
      points(b.points); nombre(b.trous.length); b.trous.forEach(points);
    }
    points(L.boites);
    for (const e of [...L.eau, ...L.espaces]) { texte(e.sorte); points(e.points); nombre(e.trous.length); e.trous.forEach(points); }
    for (const v of L.voies) { texte(v.classe); points(v.points); }
  }
  return h.digest('hex');
}

/** Coordonnées → entiers en décimètres ; échoue sur une valeur non finie, hors de l'étendue ou pas au décimètre. */
function dm(p, demi, ou) {
  const q = new Array(p.length);
  for (let k = 0; k < p.length; k++) {
    const v = p[k];
    assert.ok(Number.isFinite(v) && Math.abs(v) <= demi + 1e-3, `${ou} : ${v} hors de l'étendue ±${demi}`);
    q[k] = Math.round(v * 10);
    assert.ok(Math.abs(v * 10 - q[k]) < 1e-3, `${ou} : ${v} n'est pas au décimètre`);
  }
  return q;
}
/** Double de l'aire signée d'un anneau en décimètres entiers (calcul exact) : positif pour un extérieur. */
function aire2(q) {
  let s = 0;
  for (let i = 0, n = q.length; i < n; i += 2) {
    const j = (i + 2) % n;
    s += q[i] * q[j + 1] - q[j] * q[i + 1];
  }
  return s;
}
const signe = (ax, az, bx, bz, cx, cz) => Math.sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
const entre = (a, b, c) => Math.min(a, b) <= c && c <= Math.max(a, b);
/** Les segments [a b] et [c d] se croisent-ils ou se touchent-ils ? Exact en entiers. */
function touche(ax, az, bx, bz, cx, cz, dx, dz) {
  if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx) ||
      Math.max(az, bz) < Math.min(cz, dz) || Math.max(cz, dz) < Math.min(az, bz)) return false;
  const o1 = signe(ax, az, bx, bz, cx, cz), o2 = signe(ax, az, bx, bz, dx, dz);
  const o3 = signe(cx, cz, dx, dz, ax, az), o4 = signe(cx, cz, dx, dz, bx, bz);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return (o1 === 0 && entre(ax, bx, cx) && entre(az, bz, cz)) || (o2 === 0 && entre(ax, bx, dx) && entre(az, bz, dz)) ||
    (o3 === 0 && entre(cx, dx, ax) && entre(cz, dz, az)) || (o4 === 0 && entre(cx, dx, bx) && entre(cz, dz, bz));
}
/** Défauts d'un anneau : deux arêtes non voisines qui se touchent, ou une arête qui revient sur la précédente. */
function defauts(q) {
  const n = q.length / 2;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const a = 2 * i, b = 2 * ((i + 1) % n), c = 2 * ((i + 2) % n);
    if (signe(q[a], q[a + 1], q[b], q[b + 1], q[c], q[c + 1]) === 0 &&
        (q[b] - q[a]) * (q[c] - q[b]) + (q[b + 1] - q[a + 1]) * (q[c + 1] - q[b + 1]) < 0) d++;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const e = 2 * j, f = 2 * ((j + 1) % n);
      if (touche(q[a], q[a + 1], q[b], q[b + 1], q[e], q[e + 1], q[f], q[f + 1])) d++;
    }
  }
  return d;
}
/** Position d'un point par rapport à un anneau : 1 dedans, 0 sur le bord, -1 dehors. */
function position(q, x, z) {
  let dedans = false;
  for (let i = 0, n = q.length; i < n; i += 2) {
    const j = (i + 2) % n, ax = q[i], az = q[i + 1], bx = q[j], bz = q[j + 1];
    if (signe(ax, az, bx, bz, x, z) === 0 && entre(ax, bx, x) && entre(az, bz, z)) return 0;
    if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) dedans = !dedans;
  }
  return dedans ? 1 : -1;
}

for (const fichier of fichiers) {
  const cle = path.basename(fichier, '.js'), chemin = path.join(dossier, fichier);
  const code = fs.readFileSync(chemin, 'utf8');
  let plan, demi;

  verifier(`${cle} : script classique chargé dans un contexte nu (ni window, ni document, ni atob, ni Buffer)`, () => {
    const bac = vm.createContext({});
    for (const g of ['window', 'document', 'self', 'atob', 'Buffer', 'require', 'TextDecoder']) {
      assert.equal(vm.runInContext(`typeof ${g}`, bac), 'undefined', g);
    }
    new vm.Script(code, { filename: chemin }).runInContext(bac);
    assert.deepEqual(Object.keys(bac), ['PDR'], 'une seule variable globale : PDR');
    assert.deepEqual(Object.keys(bac.PDR), ['plans']);
    assert.deepEqual(Object.keys(bac.PDR.plans), [cle]);
    plan = bac.PDR.plans[cle];
    assert.equal(plan.cle, cle);
    assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.etendue) && Object.isFrozen(plan.carres));
    demi = plan.etendue.x1;
  });

  verifier(`${cle} : s'ajoute à un PDR existant sans rien y remplacer`, () => {
    const PDR = { ville: 'damier', plans: { autre: 'plan' } };
    charger(code, chemin, { PDR });
    assert.equal(PDR.ville, 'damier');
    assert.equal(PDR.plans.autre, 'plan');
    assert.equal(PDR.plans[cle].cle, cle);
  });

  verifier(`${cle} : centre, étendue, carrés de jeu, mentions ODbL`, () => {
    const { lat, lon } = plan.centre;
    assert.ok(Number.isFinite(lat) && Math.abs(lat) < 85 && Number.isFinite(lon) && Math.abs(lon) <= 180);
    const cotes = Object.values(plan.carres);
    assert.equal(plan.cote, Math.max(...cotes));
    assert.ok(plan.marge > 0);
    assert.deepEqual({ ...plan.etendue }, { x0: -demi, z0: -demi, x1: demi, z1: demi });
    assert.equal(demi, plan.cote / 2 + plan.marge);
    for (const [ilots, cote] of Object.entries(plan.carres)) {
      assert.deepEqual({ ...plan.carre(+ilots) }, { cote, x0: -cote / 2, z0: -cote / 2, x1: cote / 2, z1: cote / 2 });
    }
    const c11 = plan.carre(11).cote;
    assert.ok(c11 > plan.carre(9).cote && c11 < plan.carre(13).cote, 'un nombre d\'îlots sans entrée : côté interpolé');
    for (const mot of ['OpenStreetMap', 'ODbL', 'https://www.openstreetmap.org/copyright', 'OpenFreeMap', 'OpenMapTiles']) {
      assert.ok(plan.attribution.includes(mot), mot);
    }
    assert.ok(plan.licence.startsWith('ODbL'));
    assert.ok(code.slice(0, 400).includes(plan.attribution), 'les mentions sont en tête du module');
    assert.equal(plan.source.donnees, 'OpenStreetMap');
    assert.ok(plan.source.fichiers.length > 0 && /^OpenFreeMap \S+$/.test(plan.source.tuiles), plan.source.tuiles);
  });

  verifier(`${cle} : chaque carré de jeu suit le damier à 10 % près (mêmes îlots)`, () => {
    for (const [ilots, cote] of Object.entries(plan.carres)) {
      for (const graine of [1, 2]) {
        const e = creerVille(graine, { ilots: +ilots }).etendue, d = (e.x1 - e.x0 + e.z1 - e.z0) / 2;
        assert.ok(Math.abs(cote - d) <= 0.1 * d, `${ilots} îlots : ${cote} m contre ${d} m pour le damier`);
      }
    }
  });

  verifier(`${cle} : rues d'une classe connue, au décimètre dans l'étendue, sans point doublé`, () => {
    for (const r of plan.rues) {
      assert.ok(SORTES.classes.has(r.classe), r.classe);
      assert.ok(SORTES.sousClasses.has(r.sousClasse), r.sousClasse);
      assert.equal(typeof r.nom, 'string');
      assert.equal(typeof r.pont, 'boolean');
      assert.ok(r.sens === 0 || r.sens === 1);
      assert.ok(Number.isInteger(r.niveau) && r.niveau >= 0 && r.niveau < 10, 'niveau ' + r.niveau);
      assert.ok(estF32(r.points) && r.points.length >= 4 && r.points.length % 2 === 0, 'au moins deux points');
      const q = dm(r.points, demi, 'rue ' + r.nom);
      let l = 0;
      for (let k = 2; k < q.length; k += 2) {
        assert.ok(q[k] !== q[k - 2] || q[k + 1] !== q[k - 1], 'point doublé dans la rue ' + r.nom);
        l += Math.hypot(q[k] - q[k - 2], q[k + 1] - q[k - 1]);
      }
      assert.ok(l >= 5, 'rue de moins de 0,5 m');
    }
  });

  const bilan = { anneaux: 0, defectueux: 0, defauts: 0, trousDebordants: 0 };
  verifier(`${cle} : polygones fermés, orientés (extérieur A > 0, trou A < 0), non dégénérés, dans l'étendue`, () => {
    const anneau = (p, exterieur, aireMin, ou) => {
      assert.ok(estF32(p) && p.length >= 6 && p.length % 2 === 0, ou + ' : au moins 3 points');
      const q = dm(p, demi, ou), n = q.length;
      for (let k = 0; k < n; k += 2) {
        const j = (k + 2) % n;
        assert.ok(q[k] !== q[j] || q[k + 1] !== q[j + 1], ou + ' : point doublé (le premier point n\'est pas répété)');
      }
      const a = aire2(q) / 200;
      assert.ok(exterieur ? a >= aireMin - 1e-9 : a <= -aireMin + 1e-9, `${ou} : aire ${a} m²`);
      bilan.anneaux++;
      const d = defauts(q);
      if (d) { bilan.defectueux++; bilan.defauts += d; }
      return q;
    };
    for (const genre of ['batiments', 'eau', 'espaces']) {
      for (const o of plan[genre]) {
        assert.ok(Array.isArray(o.trous));
        const ext = anneau(o.points, true, AIRE_MIN[genre], genre);
        for (const t of o.trous) {
          const q = anneau(t, false, AIRE_MIN_TROU, genre + ' (trou)');
          for (let k = 0; k < q.length; k += 2) {
            if (position(ext, q[k], q[k + 1]) < 0) { bilan.trousDebordants++; break; }
          }
        }
      }
    }
  });

  verifier(`${cle} : anneaux simples (aucune arête n'en touche une autre non voisine) ; aucun trou ne déborde`, () => {
    console.log(`    ${bilan.anneaux} anneaux ; ${bilan.defectueux} se touchent ou se recoupent (${bilan.defauts} contacts) ; `
      + `${bilan.trousDebordants} trous débordent de leur extérieur`);
    assert.equal(bilan.defectueux, 0, 'anneaux non simples : voir separer_au_bord et finir dans extraire.py');
    assert.equal(bilan.trousDebordants, 0);
  });

  verifier(`${cle} : bâtiments : 0 ≤ base < hauteur au décimètre, connue, contour, couleur`, () => {
    for (const b of plan.batiments) {
      assert.ok(Number.isFinite(b.base) && Number.isFinite(b.hauteur) && b.base >= 0 && b.hauteur > b.base && b.hauteur < 1000,
        `base ${b.base}, hauteur ${b.hauteur}`);
      for (const v of [b.base, b.hauteur]) assert.ok(Math.abs(v * 10 - Math.round(v * 10)) < 1e-6);
      assert.equal(typeof b.connue, 'boolean');
      assert.equal(typeof b.contour, 'boolean');
      if (!b.connue) assert.ok(b.hauteur === 5 && b.base === 0);
      assert.ok(b.couleur === null || (Array.isArray(b.couleur) && b.couleur.length === 3 &&
        b.couleur.every(c => c >= 0 && c <= 1)));
    }
  });

  verifier(`${cle} : eau, espaces et repères d'une sorte connue ; repères nommés dans l'étendue`, () => {
    for (const e of plan.eau) { assert.ok(SORTES.eau.has(e.sorte), e.sorte); assert.equal(typeof e.nom, 'string'); }
    for (const e of plan.espaces) { assert.ok(SORTES.espaces.has(e.sorte), e.sorte); assert.equal(typeof e.nom, 'string'); }
    for (const d of plan.reperes) {
      assert.ok(typeof d.nom === 'string' && d.nom.length > 0);
      assert.ok(SORTES.reperes.has(d.sorte), d.sorte);
      assert.ok(typeof d.classe === 'string' && typeof d.sousClasse === 'string');
      assert.ok(Number.isInteger(d.rang) && d.rang >= 0);
      dm([d.x, d.z], demi, 'repère ' + d.nom);
    }
  });

  verifier(`${cle} : mobilier : points sans nom d'une sorte connue, au décimètre dans l'étendue, sans doublon`, () => {
    assert.ok(Array.isArray(plan.mobilier));
    const vus = new Set();
    for (const d of plan.mobilier) {
      assert.deepEqual(Object.keys(d), ['sorte', 'x', 'z'], 'ni nom ni enseigne');
      assert.ok(SORTES.mobilier.has(d.sorte), d.sorte);
      const [x, z] = dm([d.x, d.z], demi, 'mobilier ' + d.sorte), c = d.sorte + ':' + x + ':' + z;
      assert.ok(!vus.has(c), 'mobilier en double : ' + c);
      vus.add(c);
    }
  });

  verifier(`${cle} : lointain : zone autour du carré, repères et bâtiments hors du carré, boîtes, eau, espaces, voies`, () => {
    const L = plan.lointain;
    if (L === null) { console.log('    pas de lointain'); return; }
    assert.ok(Object.isFrozen(L) && Object.isFrozen(L.zone));
    const Z = L.zone;
    assert.ok([Z.x0, Z.z0, Z.x1, Z.z1].every(Number.isInteger));
    assert.ok(Z.x0 <= -demi && Z.z0 <= -demi && Z.x1 >= demi && Z.z1 >= demi, 'la zone contient le carré du plan');
    assert.ok(Array.isArray(L.tuilesAbsentes) && L.tuilesAbsentes.every(s => /^\d+\/\d+\/\d+$/.test(s)));
    const dansZone = (x, z, m = 0.06) => x >= Z.x0 - m && x <= Z.x1 + m && z >= Z.z0 - m && z <= Z.z1 + m;
    const dansCarre = (x, z, m = 0) => Math.abs(x) <= demi - m && Math.abs(z) <= demi - m;
    const anneau = (p, exterieur, ou) => {
      assert.ok(estF32(p) && p.length >= 6 && p.length % 2 === 0, ou + ' : au moins 3 points');
      const q = new Array(p.length);
      for (let k = 0; k < p.length; k += 2) {
        assert.ok(Number.isFinite(p[k]) && Number.isFinite(p[k + 1]) && dansZone(p[k], p[k + 1]), `${ou} : (${p[k]}, ${p[k + 1]}) hors de la zone`);
        q[k] = Math.round(p[k] * 10); q[k + 1] = Math.round(p[k + 1] * 10);
        assert.ok(Math.abs(p[k] * 10 - q[k]) < 2e-3 && Math.abs(p[k + 1] * 10 - q[k + 1]) < 2e-3, ou + ' : pas au décimètre');
      }
      const a = aire2(q) / 200;
      assert.ok(exterieur ? a > 0 : a < 0, `${ou} : aire ${a} m²`);
    };
    assert.ok(L.reperes.length > 0, 'au moins un repère');
    for (const d of L.reperes) {
      assert.ok(d.nom && /^[a-z-]+$/.test(d.modele) && d.rayon > 0);
      assert.ok(dansZone(d.x, d.z) && !dansCarre(d.x, d.z), 'repère lointain ' + d.nom + ' dans le carré du plan');
    }
    for (const s of L.sommets) assert.ok(s.nom && dansZone(s.x, s.z) && s.altitude > 0 && s.altitude < 9000);
    const parModele = {};
    for (const b of L.batiments) {
      assert.ok(Number.isInteger(b.repere) && b.repere >= 0 && b.repere < L.reperes.length);
      assert.ok(b.base >= 0 && b.hauteur > b.base && b.hauteur < 1000);
      if (!b.connue) assert.ok(b.hauteur === 5 && b.base === 0);
      assert.ok(b.couleur === null || (b.couleur.length === 3 && b.couleur.every(c => c >= 0 && c <= 1)));
      anneau(b.points, true, 'bâtiment lointain');
      for (const t of b.trous) anneau(t, false, 'bâtiment lointain (trou)');
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < b.points.length; k += 2) { x0 = Math.min(x0, b.points[k]); x1 = Math.max(x1, b.points[k]); z0 = Math.min(z0, b.points[k + 1]); z1 = Math.max(z1, b.points[k + 1]); }
      assert.ok(x0 > demi - 0.11 || x1 < -demi + 0.11 || z0 > demi - 0.11 || z1 < -demi + 0.11, 'bâtiment lointain qui touche le carré du plan');
      const m = L.reperes[b.repere].modele;
      parModele[m] = (parModele[m] || 0) + 1;
    }
    for (const d of L.reperes) assert.ok(parModele[d.modele] > 0, 'repère sans bâtiment : ' + d.nom);
    assert.ok(estF32(L.boites) && L.boites.length % 6 === 0);
    let dedans = 0;
    for (let k = 0; k < L.boites.length; k += 6) {
      const [x, z, a, b, angle, h] = L.boites.subarray(k, k + 6);
      assert.ok(dansZone(x, z, 60) && a >= b && b > 0 && a <= 400 && angle >= 0 && angle < Math.PI, `boîte ${k / 6}`);
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 255, 'hauteur de boîte ' + h);
      if (dansCarre(x, z, 30)) dedans++;
    }
    assert.equal(dedans, 0, dedans + ' boîtes du lointain dans le carré du plan');
    for (const e of L.eau) { assert.ok(SORTES.eau.has(e.sorte) && e.nom === ''); anneau(e.points, true, 'eau lointaine'); for (const t of e.trous) anneau(t, false, 'eau lointaine (trou)'); }
    for (const e of L.espaces) { assert.ok(SORTES.espacesLoin.has(e.sorte), e.sorte); anneau(e.points, true, 'espace lointain'); for (const t of e.trous) anneau(t, false, 'espace lointain (trou)'); }
    for (const v of L.voies) {
      assert.ok(SORTES.voiesLoin.has(v.classe), v.classe);
      assert.ok(estF32(v.points) && v.points.length >= 4);
      let dans = 0;
      for (let k = 0; k < v.points.length; k += 2) { assert.ok(dansZone(v.points[k], v.points[k + 1])); if (dansCarre(v.points[k], v.points[k + 1], 3)) dans++; }
      assert.equal(dans, 0, 'voie lointaine dans le carré du plan');
    }
    console.log(`    zone ${Z.x0}..${Z.x1} × ${Z.z0}..${Z.z1} m` + (L.tuilesAbsentes.length ? ` (tuiles absentes : ${L.tuilesAbsentes.join(', ')})` : '')
      + ` ; repères ${L.reperes.map(d => d.modele).join(', ')} ; ${L.batiments.length} bâtiments, ${L.boites.length / 6} boîtes, `
      + `${L.eau.length} eaux, ${L.espaces.length} espaces, ${L.voies.length} voies, ${L.sommets.length} sommet(s)`);
  });

  verifier(`${cle} : comptes par genre et par sorte, ceux qu'annoncent le module et son en-tête`, () => {
    const par = (liste, champ) => {
      const o = {};
      for (const x of liste) o[x[champ]] = (o[x[champ]] || 0) + 1;
      return o;
    };
    const pts = liste => liste.reduce((s, o) => s + o.points.length / 2 + (o.trous || []).reduce((t, h) => t + h.length / 2, 0), 0);
    const recompte = {
      rues: plan.rues.length, batiments: plan.batiments.length, eau: plan.eau.length, espaces: plan.espaces.length,
      reperes: plan.reperes.length, mobilier: plan.mobilier.length,
      points: { rues: pts(plan.rues), batiments: pts(plan.batiments), eau: pts(plan.eau), espaces: pts(plan.espaces) },
      ruesParClasse: par(plan.rues, 'classe'), eauParSorte: par(plan.eau, 'sorte'),
      espacesParSorte: par(plan.espaces, 'sorte'), reperesParSorte: par(plan.reperes, 'sorte'),
      mobilierParSorte: par(plan.mobilier, 'sorte'),
      batimentsHauteurConnue: plan.batiments.filter(b => b.connue).length,
      batimentsContour: plan.batiments.filter(b => b.contour).length,
      ruesNommees: plan.rues.filter(r => r.nom).length,
    };
    const L = plan.lointain;
    if (L) recompte.lointain = { batiments: L.batiments.length, boites: L.boites.length / 6, eau: L.eau.length, espaces: L.espaces.length,
      voies: L.voies.length, reperes: L.reperes.length, sommets: L.sommets.length };
    assert.equal(canon(recompte), canon(plan.comptes));
    const entete = code.slice(0, code.indexOf('*/'));
    for (const g of ['rues', 'batiments', 'eau', 'espaces', 'reperes', 'mobilier']) {
      assert.match(entete, new RegExp(`\\n {5}${g}: +\\[.*\\] +× ${recompte[g]}\\n`), g);
    }
    const liste = o => Object.entries(o).map(([k, v]) => k + ' ' + v).join(', ');
    console.log(`    rues ${recompte.rues} (${liste(recompte.ruesParClasse)}), ${recompte.ruesNommees} nommées`);
    console.log(`    bâtiments ${recompte.batiments} (${recompte.points.batiments} points), hauteur connue `
      + `${recompte.batimentsHauteurConnue}, contours ${recompte.batimentsContour}`);
    console.log(`    eau ${recompte.eau} (${liste(recompte.eauParSorte)}) ; espaces ${recompte.espaces} (${liste(recompte.espacesParSorte)})`);
    console.log(`    repères ${recompte.reperes} (${liste(recompte.reperesParSorte)})`);
    console.log(`    mobilier ${recompte.mobilier} (${liste(recompte.mobilierParSorte)})`);
  });

  verifier(`${cle} : toujours les mêmes données (deux chargements, même contenu)`, () => {
    const a = contenu(plan), b = contenu(charger(code, chemin).PDR.plans[cle]);
    assert.equal(a, b);
    assert.ok(Number.isInteger(plan.empreinte) && plan.empreinte >= 0 && plan.empreinte < 2 ** 32);
    let meilleur = Infinity;
    for (let k = 0; k < 5; k++) {
      const t = performance.now();
      charger(code, chemin);
      meilleur = Math.min(meilleur, performance.now() - t);
    }
    console.log(`    contenu sha-256 ${a.slice(0, 16)}…, empreinte des flux ${plan.empreinte.toString(16).padStart(8, '0')} ; `
      + `module ${Buffer.byteLength(code)} octets, chargé et décodé en ${meilleur.toFixed(1)} ms (meilleur de 5)`);
  });

  verifier(`${cle} : une donnée altérée est refusée au chargement`, () => {
    let essais = 0;
    // Les flux du plan, puis ceux du lointain (après « "lointain":{ » dans le module).
    const loin = code.indexOf('"lointain":{');
    const flux = ['rues', 'batiments', 'eau', 'espaces', 'reperes', 'mobilier'].map(g => [g, 0]);
    if (plan.lointain) for (const g of ['batiments', 'boites', 'eau', 'espaces', 'voies']) flux.push([g, loin]);
    for (const [g, depuis] of flux) {
      const re = new RegExp(`"${g}":\\{"n":\\d+,"points":\\d+,"octets":"([^"]*)"`, 'g');
      re.lastIndex = depuis;
      const m = re.exec(code);
      assert.ok(m, 'flux ' + g + ' introuvable');
      if (!m[1].length) continue;
      const debut = m.index + m[0].length - m[1].length - 1;
      for (const f of [0.1, 0.5, 0.9]) {
        const i = debut + Math.floor(f * m[1].length);
        const altere = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
        assert.throws(() => charger(altere, chemin), /empreinte|mal formé/, `${g} altéré à ${f}`);
        essais++;
      }
    }
    assert.ok(essais >= 15, essais + ' altérations essayées');
  });
}

assert.ok(fichiers.length > 0, 'aucun plan dans src/villes');
console.log(`${ok} vérifications passées (${fichiers.length} plan${fichiers.length > 1 ? 's' : ''} : ${fichiers.join(', ')})`);
