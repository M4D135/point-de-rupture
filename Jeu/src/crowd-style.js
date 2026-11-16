/* Point de rupture — la foule sur le GPU (CONCEPTION.md §2) : jusqu'à 262 144 unités, interpolées entre deux états.

   Données : deux textures RGBA32F de 1 024 de large, l'état précédent et l'état courant, [x, z, cap, code] par unité
   (protocole ETAT.unites) ; seules les lignes servies partent au GPU. Le shader interpole position et cap. Deux petites
   textures disent le reste : « marques » (R8UI, une case par unité : bit 0 sélection, bit 1 dessinée en figurine) et le
   voile du brouillard (R8, ETAT.voile). Une troisième, la hauteur du sol (R8, en cm), pose les pieds sur les trottoirs.

   Deux dessins :
   - les unités lointaines sont des points, toutes en un seul appel sans attribut (gl_VertexID), un pion dessiné dans le
     fragment ; celles qui sont dessinées en figurines sautent leur point (bit 1 des marques) ;
   - les proches sont des figurines : un maillage par type et par niveau de détail, rangés dans un seul tampon, dessinés en
     instances à partir d'une liste d'indices que le CPU refait à chaque état reçu (plafond ~12 000, seuil selon la taille
     projetée). Le squelette s'anime dans le shader selon l'état de l'unité (marche, course du repli, bousculade, récolte,
     bâtir, lever, casser, tenir, porter, attente, assis hors jeu) et ses drapeaux (éclair « touché », bouclier, charge).
   L'éclairage est celui du monde de FERRO (renderer.pdr.glsl) ; les figurines portent leur ombre dans l'atlas du soleil.
   Brouillard : une unité non alliée hors de vue n'est dessinée ni en point ni en figurine. Cohésion basse : plus sombre.
   Personne ne saigne ni ne tombe pour de bon : hors jeu, on s'assied, sonné.

   API (fil principal, WebGL 2) :
     const foule = PDR.foule.creerFoule(renderer, { ville, plafond: 12000, seuil: 7 })
       ville : PDR.ville.creerVille(...) (etendue et sol), facultative ; plafond : figurines au plus ; seuil : taille
       projetée minimale d'une figurine, en pixels de l'image.
     foule.recevoir(f32, n)          à chaque état : Float32Array [x, z, cap, code] × n (ETAT.unites, ETAT.n). Copié
                                     aussitôt : le tampon peut être rendu au travailleur au retour.
     foule.regler({ joueur, allie, brouillard })   camp du joueur (-1 en démo), son allié (-1 : aucun), brouillard actif.
     foule.voile(u8, geometrie)      ETAT.voile et CARTE.voile { nx, nz, x0, z0, cellule } ; null efface le voile.
     foule.selectionner(ids, n)      emplacements sélectionnés (tableau, Int32Array…) ; n : combien (ids.length par défaut).
     foule.cadre(vue, temps, alpha)  à chaque image, avant renderer.draw : vue = camera.vue(dt), temps en s ; alpha
                                     d'interpolation 0..1 (facultatif : sinon tiré de l'heure de réception des états).
     foule.fx                        { ombre(gl, lumiere), couleur(gl, vue) } : à passer en fx.foule à renderer.draw.
     foule.fxVoile                   { texture, origine, taille, force } ou null : à passer en fx.voile.
     foule.etat                      { cour, prec, n, nPrec } : copies CPU des deux derniers états (sélection, minicarte…).
     foule.mesure                    compteurs : n, proches, seuil, listeMs, envoiMs, appels, triangles, pointsDessines.
     foule.liberer()
   Fonctions pures, pour les tests : PDR.foule.construireMaillages(), creerListeur(plafond), decoder(code), HAUTEURS. */
(function (PDR) {
  'use strict';

  const LARGEUR = 1024, CAPACITE = 262144, LIGNES = CAPACITE / LARGEUR;
  const ECHELLE = 1.3;                    // figurines grandies d'un tiers, pour rester lisibles vue de haut
  const TYPES = 13, NIVEAUX = 2, SEAUX = TYPES * NIVEAUX;
  const SEUIL_DETAIL = 26;                // pixels : au-delà, le maillage détaillé
  const DEFAUT_PLAFOND = 12000, DEFAUT_SEUIL = 7;
  // Hauteur d'une unité, en mètres, échelle comprise : taille projetée des points et seuil des figurines.
  const HAUTEURS = Object.freeze([2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 2.34, 4.3]);
  // Os du squelette. Le pivot de chaque os est dans le shader (PIV_*), en mètres avant l'échelle.
  const OS = Object.freeze({ CORPS: 0, TETE: 1, BRAS_G: 2, BRAS_D: 3, JAMBE_G: 4, JAMBE_D: 5, PORTE: 6, OUTIL: 7, BOUCLIER: 8,
    VEHICULE: 9, TOURELLE: 10, ANNEAU: 11, BANDEROLE: 12, POUTRE: 13, CUIVRE: 14, TAMBOUR: 15 });
  // Teintes : la couleur de chaque partie est tirée dans le shader, par unité.
  const TEINTE = Object.freeze({ PEAU: 0, HAUT: 1, BAS: 2, CAMP: 3, SOMBRE: 4, METAL: 5, SAC: 6, CLAIR: 7, VERRE: 8, BOIS: 9,
    BLANC: 10, LUMIERE: 11, CHEVEUX: 12, CASQUE: 13, DORE: 14 });
  const MATIERE = Object.freeze({ TISSU: 0, LAQUE: 1, METAL: 2, PEAU: 3, VERRE: 4, EMISSIF: 5 });
  const SOMMET = 36;                      // octets : position 3 × f32, normale 3 × f32, uv 2 × f32, infos 4 × u8

  /** Décode un code d'unité (regles.coder), comme le shader. */
  function decoder(code) {
    const c = code | 0;
    return { faction: c & 3, type: (c >>> 2) & 15, etat: (c >>> 6) & 15, niveau: (c >>> 10) & 63, drapeaux: (c >>> 16) & 255 };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Maillages : un par type et par niveau de détail, dans un seul tampon. Pur : testé sous Node.
  // ---------------------------------------------------------------------------------------------------------------

  function constructeur() {
    const f = [], b = [], idx = [];
    let os = 0, teinte = 0, matiere = 0, motif = 0;
    const regler = (o, t, m = MATIERE.TISSU, mo = 0) => { os = o; teinte = t; matiere = m; motif = mo; };
    function sommet(p, n, uv) {
      f.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]);
      b.push(os, teinte, matiere, motif);
      return b.length / 4 - 1;
    }
    const pos = i => [f[i * 8], f[i * 8 + 1], f[i * 8 + 2]];
    /** Triangle tourné vers la normale voulue (sens trigonométrique vu de dehors, comme FERRO). */
    function triangle(a, c, d, n) {
      const pa = pos(a), pc = pos(c), pd = pos(d);
      const u = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]], v = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]];
      const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (x[0] * n[0] + x[1] * n[1] + x[2] * n[2] < 0) idx.push(a, d, c); else idx.push(a, c, d);
    }
    // Rotation Rz · Ry · Rx du moteur, puis translation.
    function transformer(p, r, c) {
      let [x, y, z] = p;
      if (r) {
        const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
        [y, z] = [cx * y - sx * z, sx * y + cx * z];
        [x, z] = [cy * x + sy * z, -sy * x + cy * z];
        [x, y] = [cz * x - sz * y, sz * x + cz * y];
      }
      return c ? [x + c[0], y + c[1], z + c[2]] : [x, y, z];
    }
    const unite = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    /** Boîte centrée en c, tailles s, rotation r ; effile : [kx, kz] du dessus par rapport au dessous (torse). */
    function boite(c, s, r = null, effile = null) {
      const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2, kx = effile ? effile[0] : 1, kz = effile ? effile[1] : 1;
      const coin = (i, j, k) => transformer([i * hx * (j > 0 ? kx : 1), j * hy, k * hz * (j > 0 ? kz : 1)], r, c);
      const faces = [
        [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]],
        [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]],
        [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]], [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]],
      ];
      const centre = transformer([0, 0, 0], r, c);
      for (const q of faces) {
        const p = q.map(([i, j, k]) => coin(i, j, k));
        const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
        let n = unite([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
        const m = [(p[0][0] + p[2][0]) / 2 - centre[0], (p[0][1] + p[2][1]) / 2 - centre[1], (p[0][2] + p[2][2]) / 2 - centre[2]];
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) n = [-n[0], -n[1], -n[2]];
        const s0 = sommet(p[0], n, [0, 0]), s1 = sommet(p[1], n, [1, 0]), s2 = sommet(p[2], n, [1, 1]), s3 = sommet(p[3], n, [0, 1]);
        triangle(s0, s1, s2, n); triangle(s0, s2, s3, n);
      }
    }
    /** Cylindre d'axe y (rotation r pour le coucher), rayon rx et rz, hauteur h ; couvercles en teinte tc si donnée. */
    function cylindre(c, rx, rz, h, cotes, r = null, tc = null) {
      const haut = [], bas = [];
      for (let i = 0; i <= cotes; i++) {
        const a = (i / cotes) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const n = unite(transformer([ca / rx, 0, sa / rz], r, null));
        haut.push(sommet(transformer([ca * rx, h / 2, sa * rz], r, c), n, [i / cotes, 1]));
        bas.push(sommet(transformer([ca * rx, -h / 2, sa * rz], r, c), n, [i / cotes, 0]));
      }
      for (let i = 0; i < cotes; i++) {
        const n = unite(transformer([Math.cos((i + .5) / cotes * Math.PI * 2), 0, Math.sin((i + .5) / cotes * Math.PI * 2)], r, null));
        triangle(bas[i], bas[i + 1], haut[i + 1], n); triangle(bas[i], haut[i + 1], haut[i], n);
      }
      const t0 = teinte;
      if (tc !== null) teinte = tc;
      for (const y of [1, -1]) {
        const n = unite(transformer([0, y, 0], r, null)), centre = sommet(transformer([0, y * h / 2, 0], r, c), n, [.5, .5]), bord = [];
        for (let i = 0; i <= cotes; i++) {
          const a = (i / cotes) * Math.PI * 2;
          bord.push(sommet(transformer([Math.cos(a) * rx, y * h / 2, Math.sin(a) * rz], r, c), n, [.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5]));
        }
        for (let i = 0; i < cotes; i++) triangle(centre, bord[i], bord[i + 1], n);
      }
      teinte = t0;
    }
    /** Ellipsoïde de rayons r ; calotte : fraction de la hauteur gardée depuis le haut (1 : entière). */
    function sphere(c, r, lon, lat, calotte = 1) {
      const lignes = [];
      const vmax = Math.PI * calotte;
      for (let j = 0; j <= lat; j++) {
        const v = (j / lat) * vmax, ligne = [];
        for (let i = 0; i <= lon; i++) {
          const u = (i / lon) * Math.PI * 2;
          const e = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
          ligne.push(sommet([c[0] + e[0] * r[0], c[1] + e[1] * r[1], c[2] + e[2] * r[2]], unite([e[0] / r[0], e[1] / r[1], e[2] / r[2]]), [i / lon, j / lat]));
        }
        lignes.push(ligne);
      }
      for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
        const a = lignes[j][i], b2 = lignes[j][i + 1], c2 = lignes[j + 1][i + 1], d = lignes[j + 1][i];
        const pa = pos(a), pc = pos(c2), m = [(pa[0] + pc[0]) / 2 - c[0], (pa[1] + pc[1]) / 2 - c[1], (pa[2] + pc[2]) / 2 - c[2]];
        if (j > 0) triangle(a, b2, c2, m);
        if (j < lat - 1 || calotte < 1) triangle(a, c2, d, m);
      }
      if (calotte < 1) {   // fond plat de la calotte
        const y = c[1] + Math.cos(vmax) * r[1], n = [0, -1, 0], centre = sommet([c[0], y, c[2]], n, [.5, .5]), bord = lignes[lat];
        for (let i = 0; i < lon; i++) triangle(centre, bord[i + 1], bord[i], n);
      }
    }
    /** Anneau plat au sol, tourné vers le haut. */
    function anneau(y, r0, r1, segments) {
      const n = [0, 1, 0], dedans = [], dehors = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        dedans.push(sommet([ca * r0, y, sa * r0], n, [i / segments, 0]));
        dehors.push(sommet([ca * r1, y, sa * r1], n, [i / segments, 1]));
      }
      for (let i = 0; i < segments; i++) { triangle(dedans[i], dehors[i], dehors[i + 1], n); triangle(dedans[i], dehors[i + 1], dedans[i + 1], n); }
    }
    return { f, b, idx, regler, boite, cylindre, sphere, anneau, get sommets() { return b.length / 4; } };
  }

  // Les cotes d'une figurine debout de 1,8 m, pieds en y = 0, face vers +z ; +x est sa droite.
  function humain(m, t, detail) {
    const R = m.regler, T = TEINTE, M = MATIERE;
    const lon = detail ? 8 : 6, lat = detail ? 5 : 3;
    const capuche = t === 2, trapu = t === 6 || t === 10;
    const largeur = trapu ? 1.12 : capuche ? .92 : 1;
    // Jambes et chaussures.
    for (const [o, x] of [[OS.JAMBE_G, -.1], [OS.JAMBE_D, .1]]) {
      R(o, T.BAS); m.boite([x, .5, 0], [.15, .84, .18]);
      if (detail) { R(o, T.SOMBRE); m.boite([x, .05, .04], [.15, .1, .27]); }
    }
    // Bassin, torse effilé vers la taille, cou et tête.
    if (detail) {
      R(OS.CORPS, T.BAS); m.boite([0, .97, 0], [.36 * largeur, .2, .22]);
      R(OS.CORPS, T.HAUT); m.boite([0, 1.25, 0], [.37 * largeur, .52, .25], null, [1.2, 1.04]);
      R(OS.TETE, T.PEAU, M.PEAU); m.sphere([0, 1.67, .01], [.12, .14, .13], lon, lat);
    } else {
      R(OS.CORPS, T.HAUT); m.boite([0, 1.2, 0], [.42 * largeur, .64, .25]);
      R(OS.TETE, T.PEAU, M.PEAU); m.boite([0, 1.67, .01], [.22, .26, .24]);
    }
    // Bras (manche et main).
    for (const [o, x] of [[OS.BRAS_G, -.27 * largeur], [OS.BRAS_D, .27 * largeur]]) {
      R(o, T.HAUT); m.boite([x, 1.17, 0], [.11, .56, .12]);
      if (detail) { R(o, T.PEAU, M.PEAU); m.boite([x, .85, .01], [.09, .1, .09]); }
    }
    // Coiffes.
    const casque = (teinte, r = [.145, .1, .155]) => {
      R(OS.TETE, teinte, M.LAQUE); m.sphere([0, 1.73, 0], r, lon, lat, .5);
      if (detail) m.cylindre([0, 1.735, .01], .175, .185, .02, lon);
    };
    if (capuche) { R(OS.TETE, T.HAUT); m.sphere([0, 1.69, -.035], [.155, .155, .155], lon, lat); }
    else if (t === 4 || t === 6 || t === 7) casque(T.CASQUE);                                 // chantier
    else if (t === 10) {                                                                       // Compagnie
      R(OS.TETE, T.CASQUE, M.LAQUE); m.sphere([0, 1.72, 0], [.16, .15, .17], lon, lat, .62);
      R(OS.TETE, T.VERRE, M.VERRE); m.boite([0, 1.65, .155], [.24, .1, .03]);
    } else if (t === 8 || t === 9) {                                                           // casquettes
      R(OS.TETE, T.CAMP); m.cylindre([0, 1.775, 0], .13, .135, .07, lon);
      m.boite([0, 1.75, .14], [.2, .02, .12]);
    } else if (t === 3) { R(OS.TETE, T.CAMP); m.cylindre([0, 1.79, 0], .14, .14, .06, lon); }  // Fanfare
    else if (t === 0 || t === 5) { R(OS.TETE, T.CAMP); m.sphere([0, 1.74, 0], [.13, .085, .14], lon, lat, .5); }  // bonnets
    else if (detail) { R(OS.TETE, T.CHEVEUX); m.sphere([0, 1.72, -.01], [.125, .09, .135], lon, lat, .55); }
    // Accessoires du type.
    if (t === 0) { R(OS.CORPS, T.SAC); m.boite([0, 1.28, -.2], [.3, .38, .14]); }
    if (t === 0 || t === 4 || t === 8) {                                                       // ce que porte une Équipe
      if (t === 0) { R(OS.PORTE, T.SAC); m.sphere([0, 1.12, .33], [.2, .16, .16], lon, lat); }
      else { R(OS.PORTE, t === 4 ? T.BOIS : T.METAL, t === 4 ? M.TISSU : M.LAQUE); m.boite([0, 1.12, .33], [.42, .28, .3]); }
    }
    if (t === 1) {                                                                              // Cortège : banderole
      R(OS.BANDEROLE, T.BOIS); m.boite([.27, 2.5, .05], [.035, 1.3, .035]);
      R(OS.BANDEROLE, T.CAMP, M.TISSU, 1); m.boite([.69, 2.83, .05], [.8, .5, .025]);
      if (detail) { R(OS.CORPS, T.CAMP); m.boite([0, 1.5, .02], [.3, .08, .28]); }                 // écharpe
    }
    if (t === 5) {                                                                              // Piquets : pancarte
      R(OS.BANDEROLE, T.BOIS); m.boite([.27, 2.4, .06], [.035, 1.1, .035]);
      R(OS.BANDEROLE, T.BLANC, M.TISSU, 1); m.boite([.27, 2.95, .06], [.56, .42, .03]);
    }
    if (t === 3) {                                                                              // Fanfare
      R(OS.TAMBOUR, T.CAMP, M.LAQUE); m.cylindre([0, 1.02, .26], .2, .2, .18, lon, null, T.BLANC);
      R(OS.OUTIL, T.BOIS); m.boite([.27 * largeur, .82, .14], [.025, .025, .34]);
      R(OS.CUIVRE, T.DORE, M.METAL); m.boite([0, 1.63, .3], [.05, .05, .42]);
      m.cylindre([0, 1.63, .55], .085, .085, .07, lon, [Math.PI / 2, 0, 0]);
    }
    if (t === 6) {                                                                              // Pavois : panneau-porte
      R(OS.BOUCLIER, T.BOIS, M.TISSU, 1); m.boite([-.04, 1.08, .4], [.82, 1.62, .06]);
      if (detail) { R(OS.BOUCLIER, T.METAL, M.METAL); m.boite([-.04, 1.08, .44], [.08, .3, .03]); }
    }
    if (t === 7) { R(OS.POUTRE, T.BOIS); m.boite([.04, 1.0, .55], [.2, .2, 1.6]); }            // Béliers : poutre
    if (t === 10) {                                                                             // Compagnie : bouclier
      R(OS.BOUCLIER, T.BLANC, M.LAQUE, 1); m.boite([-.06, 1.12, .38], [.56, .96, .04]);
    }
    // Anneau de sélection (passe couleur seulement).
    R(OS.ANNEAU, T.CAMP, M.EMISSIF); m.anneau(.04, .55, .7, detail ? 24 : 12);
  }

  // Motards : la moto et son pilote assis d'un bloc.
  function motard(m, detail) {
    const R = m.regler, T = TEINTE, M = MATIERE, cotes = detail ? 10 : 6;
    R(OS.VEHICULE, T.SOMBRE);
    for (const z of [-.68, .72]) m.cylindre([0, .33, z], .33, .33, .13, cotes, [0, 0, Math.PI / 2], T.METAL);
    R(OS.VEHICULE, T.CAMP, M.LAQUE); m.boite([0, .68, .1], [.26, .3, .78]);
    R(OS.VEHICULE, T.SOMBRE); m.boite([0, .84, -.32], [.26, .09, .52]);
    R(OS.VEHICULE, T.METAL, M.METAL); m.boite([0, .72, .6], [.06, .62, .06], [-.35, 0, 0]);
    m.boite([0, 1.04, .52], [.62, .04, .04]);
    R(OS.VEHICULE, T.LUMIERE, M.EMISSIF); m.boite([0, .92, .74], [.13, .1, .05]);
    // Pilote, assis, bras vers le guidon.
    R(OS.CORPS, T.BAS);
    for (const x of [-.12, .12]) { m.boite([x, .92, -.05], [.15, .15, .5]); m.boite([x, .6, .18], [.14, .5, .15]); }
    R(OS.CORPS, T.HAUT); m.boite([0, 1.22, -.14], [.4, .52, .25], [.32, 0, 0], [1.15, 1.04]);
    for (const x of [-.26, .26]) m.boite([x, 1.16, .2], [.11, .11, .52], [-.25, 0, 0]);
    R(OS.CORPS, T.CAMP, M.LAQUE); m.sphere([0, 1.62, .02], [.16, .16, .17], cotes, detail ? 5 : 3);
    if (detail) { R(OS.CORPS, T.VERRE, M.VERRE); m.boite([0, 1.6, .16], [.22, .1, .03]); }
    R(OS.ANNEAU, T.CAMP, M.EMISSIF); m.anneau(.04, 1.0, 1.18, detail ? 24 : 12);
  }

  // Canon à eau : un camion sans insigne, une tourelle, une rampe lumineuse aux couleurs du camp.
  function camion(m, detail) {
    const R = m.regler, T = TEINTE, M = MATIERE, cotes = detail ? 10 : 6;
    R(OS.VEHICULE, T.SOMBRE); m.boite([0, .78, -.2], [2.3, .42, 5.8]);
    for (const z of detail ? [-2.0, -.75, 1.9] : [-1.4, 1.9]) for (const x of [-1.05, 1.05]) m.cylindre([x, .5, z], .5, .5, .36, cotes, [0, 0, Math.PI / 2], T.METAL);
    R(OS.VEHICULE, T.CAMP, M.LAQUE); m.boite([0, 1.78, 1.95], [2.36, 1.62, 1.7]);
    R(OS.VEHICULE, T.VERRE, M.VERRE); m.boite([0, 2.12, 2.81], [2.1, .68, .05]);
    if (detail) { m.boite([1.19, 2.1, 1.95], [.04, .6, 1.1]); m.boite([-1.19, 2.1, 1.95], [.04, .6, 1.1]); }
    R(OS.VEHICULE, T.BLANC, M.LAQUE); m.boite([0, 1.95, -1.0], [2.36, 1.95, 3.7]);
    if (detail) { R(OS.VEHICULE, T.CAMP, M.LAQUE); m.boite([0, 1.5, -1.0], [2.4, .22, 3.72]); }
    R(OS.VEHICULE, T.LUMIERE, M.EMISSIF); m.boite([0, 2.66, 2.1], [1.3, .12, .26]);
    R(OS.TOURELLE, T.METAL, M.METAL); m.cylindre([0, 3.12, .6], .36, .36, .36, cotes);
    m.boite([0, 3.24, 1.25], [.15, .15, 1.2]);
    R(OS.ANNEAU, T.CAMP, M.EMISSIF); m.anneau(.04, 3.55, 3.8, detail ? 32 : 16);
  }

  /** Tous les maillages : sommets entrelacés (SOMMET octets), indices 16 bits, plage de chaque seau type × 2 + niveau. */
  function construireMaillages() {
    const m = constructeur(), plages = [];
    for (let t = 0; t < TYPES; t++) for (let niveau = 0; niveau < NIVEAUX; niveau++) {
      const premier = m.idx.length, base = m.sommets, detail = niveau === 0;
      if (t === 11) motard(m, detail); else if (t === 12) camion(m, detail); else humain(m, t, detail);
      plages.push({ type: t, niveau, premier, compte: m.idx.length - premier, sommets: m.sommets - base });
    }
    if (m.sommets > 65535) throw new Error('foule : trop de sommets pour des indices 16 bits');
    const n = m.sommets, tampon = new ArrayBuffer(n * SOMMET), fl = new Float32Array(tampon), u8 = new Uint8Array(tampon);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) fl[i * 9 + k] = m.f[i * 8 + k];
      for (let k = 0; k < 4; k++) u8[i * SOMMET + 32 + k] = m.b[i * 4 + k];
    }
    return { sommets: tampon, nombre: n, indices: Uint16Array.from(m.idx), plages: Object.freeze(plages), SOMMET };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Liste des proches : faite par le CPU à chaque état, sans allocation. Pur : testé sous Node.

  const COMMUN = `
  uniform highp sampler2D uCour;
  uniform highp sampler2D uPrec;
  uniform highp usampler2D uMarques;
  uniform sampler2D uVoileF;
  uniform sampler2D uSol;
  uniform vec4 uVoileZoneF;
  uniform vec4 uSolZone;
  uniform vec4 uReglages;
  uniform ivec4 uCamps;
  uniform vec3 uFactions[3];
  struct Unite { vec2 xz; float cap; uint faction; uint type; uint etat; uint niveau; uint drapeaux; uint marques; float vitesse; bool cachee; uint h; };
  uint hache(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
  Unite lireUnite(int id){
    Unite u;ivec2 t=ivec2(id&1023,id>>10);
    vec4 c=texelFetch(uCour,t,0);
    uint code=uint(c.w+.5);
    u.faction=code&3u;u.type=(code>>2)&15u;u.etat=(code>>6)&15u;u.niveau=(code>>10)&63u;u.drapeaux=(code>>16)&255u;
    u.marques=texelFetch(uMarques,t,0).r;u.xz=c.xy;u.cap=c.z;u.vitesse=0.;u.cachee=u.faction==3u;u.h=hache(uint(id));
    if(id<uCamps.z){
      vec4 p=texelFetch(uPrec,t,0);
      uint pc=uint(p.w+.5);vec2 d=c.xy-p.xy;
      // Même camp, même type, pas de saut : l'emplacement n'a pas changé d'occupant.
      if((pc&63u)==(code&63u)&&dot(d,d)<64.){
        u.xz=p.xy+d*uReglages.x;
        float a=c.z-p.z;a-=6.2831853*floor((a+3.1415927)/6.2831853);
        u.cap=p.z+a*uReglages.x;u.vitesse=length(d)*uReglages.w;
      }
    }
    if(!u.cachee&&uReglages.z>.5&&int(u.faction)!=uCamps.x&&int(u.faction)!=uCamps.y)
      u.cachee=texture(uVoileF,(u.xz-uVoileZoneF.xy)*uVoileZoneF.zw).r<.35;
    return u;
  }
  float solSous(vec2 xz){return texture(uSol,(xz-uSolZone.xy)*uSolZone.zw).r*2.55;}
  const vec3 HAUTS[16]=vec3[16](vec3(.84,.22,.16),vec3(.20,.20,.22),vec3(.66,.17,.13),vec3(.34,.31,.33),
    vec3(.90,.58,.12),vec3(.30,.29,.27),vec3(.80,.50,.10),vec3(.42,.40,.36),
    vec3(.10,.15,.30),vec3(.12,.17,.33),vec3(.16,.20,.36),vec3(.09,.12,.24),
    vec3(.12,.12,.13),vec3(.18,.17,.18),vec3(.25,.10,.09),vec3(.14,.14,.16));
  vec3 haut(Unite u){uint k=(u.h>>4)&3u;return u.type==2u?HAUTS[12u+k]:HAUTS[u.faction*4u+k];}
  // Un Cortège sur huit porte la banderole, un Piquet sur huit la pancarte (David, 12/11/2026 : « trop de pancartes »).
  bool porteur(Unite u){return (u.type==1u||u.type==5u)&&((u.h>>20)&7u)==0u;}`;

  const FIGURINE_VS = `#version 300 es
  precision highp float;precision highp int;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormale;
  layout(location=2) in vec2 aUV;
  layout(location=3) in uvec4 aInfo;
  layout(location=4) in uint aUnite;
  uniform mat4 uVP;
  ${'/*COMMUN*/'}
  #ifndef OMBRE
  out vec3 vMonde;out vec3 vNormale;out vec2 vUV;
  flat out vec3 vBase;flat out vec4 vMatiere;flat out vec3 vMotif;flat out uint vFaction;
  #endif
  const vec3 PIV_HANCHES=vec3(0.,.95,0.),PIV_COU=vec3(0.,1.52,0.),PIV_JAMBE_G=vec3(-.1,.92,0.),PIV_JAMBE_D=vec3(.1,.92,0.);
  const vec3 PIV_BRAS_G=vec3(-.27,1.45,0.),PIV_BRAS_D=vec3(.27,1.45,0.),PIV_BANDEROLE=vec3(.27,1.85,.05),PIV_TOURELLE=vec3(0.,3.12,.6);
  struct Pose{float jg;float jd;float bg;float bd;float torse;float tete;float haut;float roulis;float tourelle;float bouclier;float banderole;float poutre;};
  vec3 tourneX(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,v.y*c+v.z*s,-v.y*s+v.z*c);}
  void tourner(inout vec3 p,inout vec3 n,vec3 pivot,float a){p=pivot+tourneX(p-pivot,a);n=tourneX(n,a);}
  Pose poser(Unite u,bool cuivre){
    Pose q=Pose(0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.);
    float t=uReglages.y,ph=float(u.h&1023u)*.0061419;
    uint e=u.etat;bool court=e==8u;bool marche=u.vitesse>.25||court;
    // La foulée suit la vitesse réelle, en cadence comme en amplitude : une figurine qui n'avance pas ne marche
    // plus sur place, et la foule n'est plus en cadence parfaite (la fréquence varie de ±12 % selon l'empreinte).
    float v=clamp(u.vitesse/3.4,0.,1.),amp=court?.95:.6*v,cadence=court?2.6:1.05+1.45*v;
    cadence*=.88+.24*float(u.h&255u)/255.;
    float w=t*cadence*6.2831853+ph,s=sin(w);
    if(marche){q.jg=amp*s;q.jd=-amp*s;q.bg=-amp*.8*s;q.bd=amp*.8*s;q.haut=abs(cos(w))*amp*.06;q.torse=.08*amp*s;if(court)q.torse=.3;}
    else{q.torse=.025*sin(t*1.3+ph);q.bg=.05*sin(t*1.1+ph);q.bd=-q.bg;q.tete=.06*sin(t*.7+ph*1.7);}
    if(e==2u){float k=.5+.5*sin(t*7.5+ph);q.bd=1.25+.45*k;q.bg=1.05+.4*(1.-k);q.torse=.1+.18*k;if(!marche){q.jg=.3;q.jd=-.22;}}
    else if(e==3u){float k=.5+.5*sin(t*5.+ph);q.torse=.78;q.bg=.55+.5*k;q.bd=.55+.5*(1.-k);q.jg=q.jd=.15;q.haut=-.06;q.tete=-.3;}
    else if(e==4u){q.bg=q.bd=.95;}
    else if(e==5u){float k=.5+.5*sin(t*4.2+ph);q.bg=q.bd=.4+1.5*k;q.torse=.35-.25*k;q.haut=-.05*(1.-k);}
    else if(e==6u){float k=.5+.5*sin(t*3.6+ph);q.bg=q.bd=1.25;q.torse=-.15-.2*k;q.jg=.35;q.jd=-.1;}
    else if(e==7u){float k=max(0.,sin(t*6.2+ph));q.jd=-.2+1.35*k*k;q.jg=0.;q.bg=-.4;q.bd=.5;q.torse=-.08*k;}
    else if(e==9u){q.jg=.28;q.jd=-.28;q.bg=q.bd=.55;q.haut=-.07;q.torse=.12;}
    else if(e==10u){q.jg=q.jd=1.5;q.haut=-.62;q.torse=-.22+.05*sin(t*2.+ph);q.bg=q.bd=.8+.08*sin(t*1.7+ph);q.tete=.3+.1*sin(t*2.6+ph);}
    else if(e==11u){float k=.5+.5*sin(t*3.+ph);q.bd=.6+2.1*k;q.bg=1.;}
    if((u.drapeaux&1u)!=0u&&(e<2u||e==4u||e==8u))q.bg=q.bd=.95;
    if(e!=10u){
      if(porteur(u)){q.bd=2.85+.08*sin(t*1.7+ph);q.banderole=.12*sin(t*2.3+ph);if(u.type==5u)q.bg=marche?q.bg:.3;}
      if(u.type==6u||u.type==10u){bool leve=(u.drapeaux&8u)!=0u||e==9u||e==2u;q.bouclier=leve?0.:-.35;q.bg=leve?1.05:.3;}
      if(u.type==7u){q.bg=q.bd=.95;q.poutre=(e==6u||e==2u||e==7u)?.38*max(0.,sin(t*5.+ph)):0.;}
      if(u.type==3u){if(cuivre){q.bg=q.bd=1.35;q.torse+=.05*sin(t*3.+ph);}else{q.bd=1.+.5*abs(sin(t*8.+ph));q.bg=1.+.5*abs(sin(t*8.+ph+1.57));}}
    }
    if(u.type==11u||u.type==12u){
      q.jg=q.jd=q.bg=q.bd=q.tete=0.;q.torse=u.type==11u?.06*clamp(u.vitesse/8.,0.,1.):0.;
      q.haut=marche?.015*sin(t*13.+ph):0.;
      if(u.type==12u&&e==11u)q.tourelle=.1+.12*sin(t*2.+ph);
      if(e==10u){q.roulis=u.type==11u?1.25:.05;q.haut=u.type==11u?-.05:-.08;}
    }
    if((u.drapeaux&2u)!=0u)q.torse-=.22;
    return q;
  }
  void main(){
    Unite u=lireUnite(int(aUnite));
    uint os=aInfo.x;bool cuivre=(u.h&1u)==1u;
    bool cache=u.cachee;
    if(os==6u&&(u.drapeaux&1u)==0u&&u.etat!=4u)cache=true;
    if(os==12u&&!porteur(u))cache=true;
    #ifdef OMBRE
    if(os==11u)cache=true;
    #else
    if(os==11u&&(u.marques&1u)==0u)cache=true;
    #endif
    if(u.type==3u&&(os==14u?!cuivre:(os==15u||os==7u)&&cuivre))cache=true;
    if(cache){gl_Position=vec4(0.,0.,3.,1.);
      #ifndef OMBRE
      vMonde=vNormale=vec3(0.);vUV=vec2(0.);vBase=vMotif=vec3(0.);vMatiere=vec4(0.);vFaction=0u;
      #endif
      return;}
    Pose q=poser(u,cuivre);
    vec3 p=aPosition,n=aNormale;
    if(os==4u)tourner(p,n,PIV_JAMBE_G,q.jg);
    else if(os==5u)tourner(p,n,PIV_JAMBE_D,q.jd);
    else if(os==2u)tourner(p,n,PIV_BRAS_G,q.bg);
    else if(os==3u||os==7u)tourner(p,n,PIV_BRAS_D,q.bd);
    else if(os==8u)tourner(p,n,PIV_BRAS_G,q.bouclier);
    else if(os==12u)tourner(p,n,PIV_BANDEROLE,-q.banderole);
    else if(os==13u)p.z+=q.poutre;
    else if(os==1u||os==14u)tourner(p,n,PIV_COU,-q.tete);
    else if(os==10u)tourner(p,n,PIV_TOURELLE,-q.tourelle);
    if(os!=4u&&os!=5u&&os!=9u&&os!=10u&&os!=11u)tourner(p,n,PIV_HANCHES,-q.torse);
    if(os!=11u){
      if(q.roulis!=0.){float c=cos(q.roulis),s=sin(q.roulis);p=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);n=vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);}
      p.y+=q.haut;
    }
    float c=cos(u.cap),s=sin(u.cap);p*=${ECHELLE.toFixed(2)};
    vec3 monde=vec3(u.xz.x+c*p.x+s*p.z,solSous(u.xz)+p.y,u.xz.y-s*p.x+c*p.z);
    gl_Position=uVP*vec4(monde,1.);
    #ifndef OMBRE
    vMonde=monde;vNormale=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);vUV=aUV;vFaction=u.faction;
    // Teinte de la partie, tirée pour l'unité.
    uint tt=aInfo.y,h=u.h;vec3 camp=uFactions[u.faction],b;
    if(tt==0u){const vec3 P[4]=vec3[4](vec3(.80,.60,.47),vec3(.62,.44,.32),vec3(.44,.30,.21),vec3(.88,.70,.58));b=P[(h>>8)&3u];}
    else if(tt==1u)b=haut(u);
    else if(tt==2u){const vec3 P[4]=vec3[4](vec3(.15,.17,.23),vec3(.22,.21,.22),vec3(.30,.27,.22),vec3(.11,.12,.16));b=P[(h>>10)&3u];if(u.faction==2u)b=vec3(.07,.10,.20);}
    else if(tt==3u)b=camp;
    else if(tt==4u)b=vec3(.06,.06,.065);
    else if(tt==5u)b=vec3(.55,.57,.6);
    else if(tt==6u){const vec3 P[4]=vec3[4](vec3(.14,.14,.15),vec3(.30,.24,.16),vec3(.20,.26,.22),vec3(.35,.12,.10));b=P[(h>>12)&3u];}
    else if(tt==7u)b=mix(camp,vec3(1.),.55);
    else if(tt==8u)b=vec3(.10,.13,.17);
    else if(tt==9u)b=vec3(.46,.33,.20);
    else if(tt==10u)b=vec3(.86,.86,.83);
    else if(tt==11u)b=mix(camp,vec3(1.),.35);
    else if(tt==12u){const vec3 P[4]=vec3[4](vec3(.10,.08,.07),vec3(.30,.20,.12),vec3(.55,.42,.25),vec3(.16,.15,.15));b=P[(h>>14)&3u];}
    else if(tt==13u)b=u.faction==1u?vec3(.95,.72,.18):u.faction==2u?vec3(.13,.22,.48):camp;
    else b=vec3(.80,.62,.25);
    uint mat=aInfo.z;
    vMatiere=mat==1u?vec4(.22,.35,0.,0.):mat==2u?vec4(.38,.75,0.,0.):mat==3u?vec4(.7,0.,0.,0.):mat==4u?vec4(.1,.5,0.,0.):mat==5u?vec4(.5,0.,1.6,0.):vec4(.92,0.,0.,0.);
    vMatiere.w=float(aInfo.w);vMotif=tt==10u||tt==9u?camp:mix(camp,vec3(1.),.6);
    // Cohésion basse : plus sombre. Sélection : plus clair. Touché : un éclair blanc. Colère du Bastion : le visage rougit.
    if(mat!=5u)b*=.5+.5*smoothstep(0.,34.,float(u.niveau));
    if((u.marques&1u)!=0u&&mat!=5u)b=mix(b,b*1.3+.05,.7);
    if((u.drapeaux&2u)!=0u){float k=.5+.5*sin(uReglages.y*38.);b=mix(b,vec3(1.,.97,.9),.5*k);vMatiere.z+=.45*k;}
    if((u.drapeaux&4u)!=0u&&tt==0u)b=mix(b,vec3(.9,.2,.12),.3+.15*sin(uReglages.y*6.));
    vBase=b;
    #endif
  }`;

  const FIGURINE_FS = `#version 300 es
  precision highp float;precision highp int;
  ${'/*PDR*/'}
  in vec3 vMonde;in vec3 vNormale;in vec2 vUV;
  flat in vec3 vBase;flat in vec4 vMatiere;flat in vec3 vMotif;flat in uint vFaction;
  out vec4 fragColor;
  float motif(vec2 uv,uint f){
    vec2 q=uv*2.-1.;float d;
    if(f==0u)d=length(q)-.55;
    else if(f==1u)d=max(abs(q.x),abs(q.y))-.48;
    else d=abs(q.y-.35+abs(q.x)*.9)-.2;
    float aa=max(fwidth(d),.02);
    return 1.-smoothstep(-aa,aa,d);
  }
  void main(){
    vec3 n=normalize(vNormale),base=vBase;
    if(vMatiere.w>.5)base=mix(base,vMotif,motif(vUV,vFaction));
    float ombre=pdrOmbreSoleil(vMonde,n);
    fragColor=vec4(pdrFinir(pdrEclairer(base,n,vMonde,vMatiere.x,vMatiere.y,vMatiere.z,ombre),vMonde),1.);
  }`;

  const OMBRE_FS = `#version 300 es
  precision highp float;
  void main(){}`;

  const POINT_VS = `#version 300 es
  precision highp float;precision highp int;
  uniform mat4 uVP;
  uniform vec4 uPoints;
  uniform vec3 uOeilF;
  ${'/*COMMUN*/'}
  out vec3 vMonde;flat out vec3 vBase;flat out float vTaille;flat out float vSelection;flat out float vEmission;flat out vec3 vVersOeil;
  const float HAUTEURS[13]=float[13](${HAUTEURS.map(h => h.toFixed(2)).join(',')});
  void main(){
    Unite u=lireUnite(gl_VertexID);
    if(u.cachee||(u.marques&2u)!=0u){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vMonde=vBase=vVersOeil=vec3(0.);vTaille=vSelection=vEmission=0.;return;}
    float h=HAUTEURS[u.type];if(u.etat==10u)h*=.55;
    vec3 monde=vec3(u.xz.x,solSous(u.xz)+h*.5,u.xz.y);
    vec4 clip=uVP*vec4(monde,1.);
    gl_Position=clip;
    float taille=clamp(h*uPoints.x/max(clip.w,.1)*1.08,uPoints.y,uPoints.z);
    gl_PointSize=taille;vTaille=taille;vMonde=monde;vVersOeil=normalize(uOeilF-monde);
    vec3 b=mix(uFactions[u.faction],haut(u),.28);
    b*=.5+.5*smoothstep(0.,34.,float(u.niveau));
    vSelection=float(u.marques&1u);vEmission=.12;
    if((u.drapeaux&2u)!=0u){float k=.5+.5*sin(uReglages.y*38.);b=mix(b,vec3(1.,.97,.9),.5*k);vEmission+=.4*k;}
    vBase=b;
  }`;

  const POINT_FS = `#version 300 es
  precision highp float;precision highp int;
  ${'/*PDR*/'}
  uniform vec3 uDroiteF;
  in vec3 vMonde;flat in vec3 vBase;flat in float vTaille;flat in float vSelection;flat in float vEmission;flat in vec3 vVersOeil;
  out vec4 fragColor;
  void main(){
    vec2 q=gl_PointCoord*2.-1.;
    vec3 base=vBase;float bord=0.;
    if(vTaille>3.5){
      // Un pion : la tête en haut, le corps évasé vers le bas.
      float tete=length(vec2(q.x,q.y+.5))-.36;
      float corps=max(abs(q.x)-(.3+.3*clamp((q.y+.1)*.9,0.,1.)),abs(q.y-.42)-.58);
      float d=min(tete,corps);
      if(d>0.)discard;
      bord=smoothstep(-.22,0.,d);
      base*=1.-bord*.35;
      if(vSelection>.5&&bord>.55)base=vec3(1.,.98,.9);
    }else if(vSelection>.5)base=mix(base,vec3(1.,.98,.9),.5);
    vec3 n=normalize(uDroiteF*q.x*.7+vec3(0.,.42-q.y*.35,0.)+vVersOeil*.8);
    float ombre=pdrOmbreSoleil(vMonde,vec3(0.,1.,0.));
    fragColor=vec4(pdrFinir(pdrEclairer(base,n,vMonde,.9,0.,vEmission+vSelection*.35,ombre),vMonde),1.);
  }`;

  // ---------------------------------------------------------------------------------------------------------------
  // La foule.
  // ---------------------------------------------------------------------------------------------------------------


 PDR.crowdStyle=Object.freeze({construireMaillages,HAUTEURS,ECHELLE,shaders:{COMMUN,FIGURINE_VS,FIGURINE_FS,OMBRE_FS,POINT_VS,POINT_FS}});
})(globalThis.PDR=globalThis.PDR||{});
