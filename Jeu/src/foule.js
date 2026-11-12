// Foule : chaque escouade du noyau devient six figurines procédurales, en deux rangs de trois. Les pièces sont écrites
// directement au format d'instances du moteur FERRO (seize flottants par pièce, groupés par primitive) : aucun objet
// n'est créé par pièce ni par image, et le moteur envoie le lot tel quel à l'ombre du soleil puis à la passe couleur.
//   [px, py, pz, matière, sx, sy, sz, émission, rx, ry, rz, drapeaux, r, v, b, a une couleur]
// Rotation du moteur : Rz · Ry · Rx. Une figurine regarde +z dans son repère ; ry = atan2(dx, dz) la tourne vers (dx, dz).
(function (PDR) {
  'use strict';

  const { MAT, FACTIONS } = PDR.ville;
  const FORMES = ['box', 'sphere', 'cylinder', 'octa', 'ring', 'bevel', 'foliage'];   // ordre des lots du moteur
  const BOITE = 0, SPHERE = 1, CYLINDRE = 2, BISEAU = 5;
  const DRAPEAUX = 6;                        // dehors (2) + objet (4) : motifs de matière attachés à la pièce
  const ECHELLE = 1.3;                       // figurines grandies d'un tiers pour rester lisibles vue de haut
  const PROCHE = 110, MOYEN = 260, LOINTAIN = 600;   // portées des niveaux de détail, en mètres depuis l'œil
  const PAS = 1.35;                          // écart entre figurines d'une escouade
  const FOULEE = 1.9;                        // mètres parcourus par cycle de marche
  const RANGS = [[-1, 0.5], [0, 0.5], [1, 0.5], [-1, -0.5], [0, -0.5], [1, -0.5]];

  const PEAUX = [[0.80, 0.60, 0.47], [0.62, 0.44, 0.32], [0.44, 0.30, 0.21], [0.88, 0.70, 0.58]];
  const STYLES = [
    { // La Convergence : vêtements de ville, capuches, sacs à dos.
      haut: [[0.84, 0.22, 0.16], [0.20, 0.20, 0.22], [0.66, 0.17, 0.13], [0.34, 0.31, 0.33]],
      bas: [[0.15, 0.17, 0.23], [0.22, 0.21, 0.22], [0.30, 0.27, 0.22]], sac: [0.14, 0.14, 0.15], casque: null, bouclier: null },
    { // Le Bastion : vestes de travail, casques de chantier sombres.
      haut: [[0.90, 0.58, 0.12], [0.30, 0.29, 0.27], [0.80, 0.50, 0.10]],
      bas: [[0.22, 0.21, 0.18], [0.17, 0.17, 0.18]], sac: null, casque: [0.18, 0.18, 0.19], bouclier: null },
    { // La Préfecture : tenue de maintien de l'ordre, casque bleu, bouclier.
      haut: [[0.10, 0.15, 0.30], [0.12, 0.17, 0.33]], bas: [[0.07, 0.10, 0.20]], sac: null,
      casque: [0.16, 0.30, 0.70], bouclier: [0.58, 0.63, 0.70] },
  ];

  /** Hachage entier vers [0, 1) : chaque figurine garde ses couleurs et son décalage d'une image à l'autre. */
  function hache(n) {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));

  /** Lot d'instances réutilisé d'une image à l'autre ; fermer() rend les groupes contigus attendus par le moteur. */
  class Lot {
    constructor() {
      this.parts = FORMES.map(() => ({ v: new Float32Array(16 * 2048), n: 0 }));
      this.values = new Float32Array(16 * 8192);
      this.groups = [];
    }
    vider() { for (const p of this.parts) p.n = 0; }
    pousser(forme, px, py, pz, mat, sx, sy, sz, em, rx, ry, cr, cg, cb) {
      const part = this.parts[forme];
      if ((part.n + 1) * 16 > part.v.length) { const plus = new Float32Array(part.v.length * 2); plus.set(part.v); part.v = plus; }
      const v = part.v, o = part.n * 16;
      v[o] = px; v[o + 1] = py; v[o + 2] = pz; v[o + 3] = mat;
      v[o + 4] = sx; v[o + 5] = sy; v[o + 6] = sz; v[o + 7] = em;
      v[o + 8] = rx; v[o + 9] = ry; v[o + 10] = 0; v[o + 11] = DRAPEAUX;
      v[o + 12] = cr; v[o + 13] = cg; v[o + 14] = cb; v[o + 15] = 1;
      part.n++;
    }
    fermer() {
      let total = 0;
      for (const p of this.parts) total += p.n;
      if (total * 16 > this.values.length) this.values = new Float32Array(Math.max(total * 16, this.values.length * 2));
      this.groups.length = 0;
      let n = 0;
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        if (!p.n) continue;
        this.values.set(p.v.subarray(0, p.n * 16), n * 16);
        this.groups.push({ name: FORMES[i], offset: n * 64, count: p.n });
        n += p.n;
      }
      return { values: this.values.subarray(0, n * 16), groups: this.groups };
    }
  }

  /**
   * creerFoule(ville).composer(escouades, oeil, filtre, temps, dt) rend { values, groups } pour fx.instances.
   * escouades : [{ id, f, x, z, mv, v, dx, dz }] en mètres ; mv vrai si l'escouade marche vers (x + dx, z + dz) à v m/s.
   * filtre : renderer.actorFilter(camera, fx), qui écarte une escouade hors du champ et hors de l'ombre du soleil.
   */
  function creerFoule(ville) {
    const lot = new Lot();
    const etats = new Map();
    let image = 0;
    const mesure = { escouades: 0, vues: 0, figurines: 0, proches: 0, moyennes: 0, lointaines: 0, jetons: 0 };

    // Repère de la figurine en cours : pied (bx, by, bz), lacet ry. Les cotes sont celles d'une figurine de 1,8 m.
    let bx = 0, by = 0, bz = 0, ry = 0, cs = 1, sn = 0;
    const piece = (forme, ox, oy, oz, sx, sy, sz, rx, mat, c, em = 0) => {
      lot.pousser(forme, bx + (ox * cs + oz * sn) * ECHELLE, by + oy * ECHELLE, bz + (oz * cs - ox * sn) * ECHELLE,
        mat, sx * ECHELLE, sy * ECHELLE, sz * ECHELLE, em, rx, ry, c[0], c[1], c[2]);
    };
    // Membre suspendu à son pivot (épaule, hanche) et balancé de theta autour de l'axe latéral.
    const membre = (ox, oy, oz, sx, longueur, sz, theta, c) => {
      piece(BOITE, ox, oy - longueur * 0.5 * Math.cos(theta), oz - longueur * 0.5 * Math.sin(theta), sx, longueur, sz, theta, MAT.TISSU, c);
    };

    function figurineComplete(style, haut, bas, peau, h, marche, phase) {
      const amplitude = 0.6 * marche, s = Math.sin(phase);
      const rebond = 0.035 * marche * (1 - Math.cos(2 * phase)) * 0.5, penche = 0.07 * marche;
      membre(-0.1, 0.9, 0, 0.15, 0.88, 0.19, amplitude * s, bas);
      membre(0.1, 0.9, 0, 0.15, 0.88, 0.19, -amplitude * s, bas);
      piece(BISEAU, 0, 1.22 + rebond, 0, 0.44, 0.62, 0.26, penche, MAT.TISSU, haut);
      if (style.bouclier) {
        membre(-0.29, 1.5 + rebond, 0, 0.11, 0.62, 0.13, -1.0, haut);
        piece(BISEAU, -0.16, 1.12 + rebond, 0.43, 0.56, 0.86, 0.05, 0, MAT.LAQUE, style.bouclier);
      } else {
        membre(-0.29, 1.5 + rebond, 0, 0.11, 0.62, 0.13, -amplitude * 0.8 * s, haut);
      }
      membre(0.29, 1.5 + rebond, 0, 0.11, 0.62, 0.13, amplitude * 0.8 * s, haut);
      piece(BISEAU, 0, 1.71 + rebond, 0.01, 0.22, 0.25, 0.23, 0, MAT.TISSU, peau);
      if (style.casque) piece(SPHERE, 0, 1.8 + rebond, 0, 0.3, 0.22, 0.32, 0, MAT.LAQUE, style.casque);
      else if (h < 0.5) piece(SPHERE, 0, 1.81 + rebond, -0.01, 0.26, 0.15, 0.27, 0, MAT.TISSU, haut);
      if (style.sac && h > 0.6) piece(BOITE, 0, 1.3 + rebond, -0.21, 0.3, 0.36, 0.15, penche, MAT.TISSU, style.sac);
    }

    /** Drapeau planté dans le dos du rang arrière : hampe de métal, toile qui flotte vers l'arrière. */
    function drapeau(x, y, z, e, couleur, temps, id) {
      const k = ECHELLE, c = Math.cos(e.ry), s = Math.sin(e.ry), ox = 0.36, oz = RANGS[4][1] * PAS * 1.3;
      const hx = x + (ox * c + oz * s) * k, hz = z + (oz * c - ox * s) * k;   // main droite de la figurine du centre arrière
      lot.pousser(CYLINDRE, hx, y + 2.5 * k, hz, MAT.METAL, 0.05 * k, 3.2 * k, 0.05 * k, 0, 0, 0, 0.62, 0.63, 0.64);
      const balance = 0.35 * Math.sin(temps * 2.1 + id * 1.7) + 0.15 * Math.sin(temps * 5.3 + id);
      const a = 0.6 * Math.sin(balance), b = -Math.cos(balance);            // vers l'arrière, dans le repère de l'escouade
      const n = Math.hypot(a, b), wx = (a * c + b * s) / n, wz = (b * c - a * s) / n;   // la même direction, dans le monde
      const lacet = Math.atan2(-wz, wx), demi = 0.6 * k;
      lot.pousser(BOITE, hx + wx * demi, y + 3.7 * k, hz + wz * demi, MAT.TISSU, 1.2 * k, 0.75 * k, 0.04 * k, 0.08,
        0, lacet, couleur[0], couleur[1], couleur[2]);
    }

    function composer(escouades, oeil, filtre, temps, dt) {
      image++;
      lot.vider();
      mesure.escouades = escouades.length;
      mesure.vues = mesure.figurines = mesure.proches = mesure.moyennes = mesure.lointaines = mesure.jetons = 0;
      for (const q of escouades) {
        let e = etats.get(q.id);
        const cible = q.mv && (q.dx || q.dz) ? Math.atan2(q.dx, q.dz) : null;
        if (!e) { e = { ry: cible === null ? hache(q.id) * Math.PI * 2 : cible, marche: 0, phase: hache(q.id + 7) * 6.28, vu: 0 }; etats.set(q.id, e); }
        e.vu = image;
        if (cible !== null) e.ry = angle(e.ry + angle(cible - e.ry) * (1 - Math.exp(-dt * 7)));
        e.marche += ((q.mv ? 1 : 0) - e.marche) * (1 - Math.exp(-dt * 6));
        e.phase += dt * (q.mv ? q.v : 0) * Math.PI * 2 / FOULEE;
        if (!filtre(q.x, 2.6, q.z, 5.5)) continue;
        mesure.vues++;
        const style = STYLES[q.f], couleur = FACTIONS[q.f].couleur;
        const d = Math.hypot(q.x - oeil[0], q.z - oeil[2], oeil[1]);
        const niveau = d < PROCHE ? 0 : d < MOYEN ? 1 : d < LOINTAIN ? 2 : 3;
        if (niveau === 3) {
          // Vue d'ensemble : l'escouade devient un jeton à sa couleur, grossi avec la distance pour rester visible.
          const k = Math.max(1, d / 900), y = ville.sol(q.x, q.z);
          lot.pousser(BOITE, q.x, y + 1.4 * k, q.z, MAT.TISSU, 5 * k, 2.8 * k, 4 * k, 0.35, 0, e.ry, couleur[0], couleur[1], couleur[2]);
          mesure.jetons++;
          continue;
        }
        ry = e.ry; cs = Math.cos(ry); sn = Math.sin(ry);
        for (let k = 0; k < 6; k++) {
          const g = q.id * 6 + k, h1 = hache(g), h2 = hache(g + 101), h3 = hache(g + 211);
          const lat = RANGS[k][0] * PAS + (h1 - 0.5) * 0.35, avant = RANGS[k][1] * PAS * 1.3 + (h2 - 0.5) * 0.3;
          const fx = q.x + (lat * cs + avant * sn) * ECHELLE, fz = q.z + (avant * cs - lat * sn) * ECHELLE;
          bx = fx; bz = fz; by = ville.sol(fx, fz);
          const haut = style.haut[(h1 * style.haut.length) | 0], bas = style.bas[(h2 * style.bas.length) | 0];
          if (niveau === 0) {
            figurineComplete(style, haut, bas, PEAUX[(h3 * PEAUX.length) | 0], h3, e.marche, e.phase + h1 * 1.3);
          } else if (niveau === 1) {
            piece(BOITE, 0, 0.45, 0, 0.36, 0.9, 0.22, 0, MAT.TISSU, bas);
            piece(BOITE, 0, 1.22, 0, 0.46, 0.62, 0.28, 0, MAT.TISSU, haut);
            piece(BOITE, 0, 1.73, 0, 0.25, 0.3, 0.26, 0, style.casque ? MAT.LAQUE : MAT.TISSU, style.casque || PEAUX[(h3 * PEAUX.length) | 0]);
          } else {
            piece(BOITE, 0, 0.9, 0, 0.5, 1.8, 0.32, 0, MAT.TISSU, haut);
          }
        }
        mesure.figurines += 6;
        if (niveau === 0) mesure.proches++; else if (niveau === 1) mesure.moyennes++; else mesure.lointaines++;
        drapeau(q.x, ville.sol(q.x, q.z), q.z, e, couleur, temps, q.id);
      }
      // Les escouades disparues (retirées du noyau) libèrent leur état.
      if (etats.size > escouades.length + 64) for (const [id, e] of etats) if (e.vu !== image) etats.delete(id);
      return lot.fermer();
    }

    return { composer, mesure, ECHELLE };
  }

  PDR.foule = { creerFoule, FORMES };
})(globalThis.PDR = globalThis.PDR || {});
