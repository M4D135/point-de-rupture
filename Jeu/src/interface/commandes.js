/* Point de rupture — de la souris et du clavier aux sélections et aux ordres (CONCEPTION.md §1.10).
   La caméra garde ses gestes (camera.js, PDR.camera.brancher : glisser, zoom, rotation, cadre) ; ce module lui donne
   ses « actions » (choisir au point, au cadre, ordonner, toucher) et décide de ce qu'elles veulent dire. Les ordres sont
   construits par PDR.protocole.commande et suivent PDR.regles (hostile, peutLever, peutCasser…).

   const commandes = PDR.interface.creerCommandes({
     canvas, camera,                  canevas #scene et caméra de PDR.camera.creerCamera
     regles, protocole, reglages,     contrats et réglages (objet vivant : les touches changées s'appliquent aussitôt)
     projecteur,                      facultatif : { preparer() → vrai si prêt, projeter(x, y, z, sortie) → vrai si
                                      devant l'œil (sortie[0..2] : pixel CSS x, y et profondeur), sol(px, py) → [x, z]
                                      ou null, echelle(x, z) → mètres par pixel, largeur, hauteur } ; par défaut tiré de
                                      la caméra (creerProjecteur)
     rappels: { ordre(cmd), marque({ x, z, sorte }), message(texte, refus), selection(commandes), mode(id | null),
                alerte() → [x, z] de la dernière alerte ou null, pause() }
   });
   PDR.camera.brancher(canvas, camera, commandes.actions);   la caméra appelle ces actions ; rien d'autre à brancher

   commandes.partie({ options, carte, sites, ville })   une partie commence (options.joueur : -1 en démo)
   commandes.activer(oui)             vrai seulement en partie : ni en démo, ni dans un menu
   commandes.etat(etat, f32)          à chaque état : f32 (facultatif) est la vue Float32Array de etat.unites ; elle doit
                                      rester lisible jusqu'à l'état suivant (rendre au travailleur le tampon précédent,
                                      pas celui-ci)
   commandes.image(dt)                à chaque image : défilement (clavier, bords), survol, aperçu de visée
   commandes.clavier(e, bas) → vrai   touche consommée (l'interface arrête alors sa propagation)
   commandes.action(id, { maj })      un bouton de la carte de commandes : même effet que sa touche
   commandes.produire(type, n), annuler(rang), ralliement(x, z), diplomatie(action, avec), ordreEn(x, z), centrer(x, z)
   commandes.general(id)              'pause' | 'alerte' | 'oisifs' | 'armee' | 'qg' (mêmes effets que les touches)
   commandes.garderType(t, garder)    panneau de sélection : ne garder que le type t (vrai) ou le retirer (faux)
   commandes.versionContexte          change quand la carte de commandes doit être redessinée
   commandes.annulerVisee() → vrai si une visée était en cours
   commandes.contexte()               { version, sorte: 'vide' | 'unites' | 'structure', mode, structure, actions[12] }
   commandes.resume                   { n, parType, cohesion (0..1), repli, tient, ouvriers, oisifs } (mis à jour par état)
   commandes.selection                { masque: Uint8Array(CAPACITE) (1 : choisie, pour la texture de sélection du rendu),
                                        liste, n, version, structure (id ou -1) }
   commandes.apercu                   null ou { sorte: 'barricade' | 'point' | 'avant-poste' | 'zone' | 'cone', x, z, x2, z2,
                                        rayon, longueur, cout, valide } : la visée en cours, pour que le décor la dessine
   commandes.coinsVue()               les quatre points du sol aux coins de l'écran (haut gauche, haut droit, bas droit,
                                      bas gauche), pour la minicarte ; null si la caméra n'est pas prête

   PDR.interface.ordres : les mêmes décisions en fonctions pures (testées sans navigateur). */
(function (PDR) {
  'use strict';

  const I = PDR.interface = PDR.interface || {};

  const RAYON_CHOIX = 12;      // px : la plus proche à moins de 12 px de son centre à l'écran
  const RAYON_DOIGT = 30;      // px, au toucher
  const HAUTEUR = 0.9;         // m : centre d'une figurine au-dessus du sol
  const DOUBLE_MS = 350;       // double appui sur un groupe : centrer la vue
  const BORD_PX = 6;           // défilement au bord de l'écran
  const SURVOL_MS = 60;        // intervalle du calcul de survol
  const SEUIL_VISIBLE = 40;    // voile (0..255) sous lequel une unité ou une structure ennemie est cachée
  const RAYON_CASSABLE = 2.5, RAYON_AVANT_POSTE = 6, RAYON_QG = 14;   // m
  // Touches codées en dur par camera.js (e.code) : consommées ici pour que seules les touches des réglages agissent.
  const CODES_CAMERA = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft',
    'ArrowRight', 'Equal', 'NumpadAdd', 'PageUp', 'Minus', 'NumpadSubtract', 'PageDown']);

  /** Projecteur pixel ↔ monde tiré de la dernière vue de la caméra, sans allocation par unité. Même calcul que
   *  camera.projeter : px = w/2 + k (d·droite) / profondeur, py = h/2 − k (d·haut) / profondeur, k = h / (2 tan(fov/2)). */
  function creerProjecteur(camera, canvas) {
    const p = { ex: 0, ey: 0, ez: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: -1, near: 0.5, k: 1, w: 800, h: 600 };
    return {
      get largeur() { return p.w; },
      get hauteur() { return p.h; },
      preparer() {
        const v = camera.derniere;
        if (!v || !v.axes) return false;
        p.w = canvas.clientWidth || 800; p.h = canvas.clientHeight || 600;
        const a = v.axes, o = v.pos;
        p.ex = o[0]; p.ey = o[1]; p.ez = o[2];
        p.rx = a.right[0]; p.ry = a.right[1]; p.rz = a.right[2];
        p.ux = a.up[0]; p.uy = a.up[1]; p.uz = a.up[2];
        p.fx = a.forward[0]; p.fy = a.forward[1]; p.fz = a.forward[2];
        p.near = v.near || 0.5;
        p.k = 0.5 * p.h / Math.tan((v.fov || 42) * Math.PI / 360);
        return true;
      },
      projeter(x, y, z, s) {
        const dx = x - p.ex, dy = y - p.ey, dz = z - p.ez, prof = dx * p.fx + dy * p.fy + dz * p.fz;
        if (prof < p.near) return false;
        const inv = p.k / prof;
        s[0] = 0.5 * p.w + (dx * p.rx + dy * p.ry + dz * p.rz) * inv;
        s[1] = 0.5 * p.h - (dx * p.ux + dy * p.uy + dz * p.uz) * inv;
        s[2] = prof;
        return true;
      },
      sol(px, py) { return camera.pointer(px, py); },
      echelle(x, z) {
        const prof = (x - p.ex) * p.fx - p.ey * p.fy + (z - p.ez) * p.fz;
        return prof > 0 ? prof / p.k : 1;
      },
    };
  }

  /* ------------------------------------------------------------------------------------------------------------
     Ordres en fonctions pures. ctx = { joueur, alliance, colere, ids: Int32Array, types: Uint8Array (type de ids[k]),
     eco: { moyens, materiaux, pop, popMax } | null }. Chaque fonction renvoie { cmds: [commande], marque, message }.
     ------------------------------------------------------------------------------------------------------------ */
  const CRITERES = Object.freeze({
    recolter: t => t.capacites.recolter,
    construire: t => t.capacites.construire,
    barricader: t => t.capacites.barricader,
    casser: t => t.capacites.casser > 0,
    lever: t => t.capacites.lever > 0,
    salve: t => !!t.capacites.salve,
    jet: t => !!t.capacites.jet,
  });

  /** Partage les unités de ctx entre celles qui satisfont le critère et les autres. */
  function scinder(R, ctx, critere) {
    const test = CRITERES[critere], ids = ctx.ids, types = ctx.types;
    let k = 0;
    for (let i = 0; i < ids.length; i++) if (test(R.TYPES[types[i]])) k++;
    const oui = new Int32Array(k), non = new Int32Array(ids.length - k);
    for (let i = 0, a = 0, b = 0; i < ids.length; i++) {
      if (test(R.TYPES[types[i]])) oui[a++] = ids[i]; else non[b++] = ids[i];
    }
    return [oui, non];
  }

  /** Clic droit : l'ordre que la cible appelle. cible : { sorte: 'unite', id, faction } | { sorte: 'structure', s } |
   *  { sorte: 'gisement', index, x, z } | { sorte: 'cassable', index, x, z } | { sorte: 'sol' }. (x, z) : point du sol visé. */
  function ordreContextuel(R, P, ctx, cible, x, z) {
    const j = ctx.joueur, C = P.CMD, ids = ctx.ids;
    if (!ids || !ids.length) return { cmds: [], marque: null, message: '' };
    const cmd = (t, champs) => P.commande(t, j, champs);
    const aller = (lot, mode = 0) => (lot.length ? [cmd(C.DEPLACER, { ids: lot, x, z, mode })] : []);
    // Les unités capables reçoivent l'ordre, les autres suivent jusqu'au point.
    const avec = (critere, construire) => {
      const [oui, non] = scinder(R, ctx, critere);
      return oui.length ? [construire(oui)].concat(aller(non)) : null;
    };
    const fait = (cmds, sorte, mx = x, mz = z, message = '') => ({ cmds, marque: { x: mx, z: mz, sorte }, message });
    const sorte = cible ? cible.sorte : 'sol';
    if (sorte === 'unite') {
      if (R.hostile(j, cible.faction, ctx.alliance, ctx.colere)) return fait([cmd(C.ATTAQUER, { ids, cible: cible.id })], 'attaque');
      const message = j === R.BASTION && cible.faction === R.PREFECTURE ? 'Le Bastion ne frappe la Préfecture qu’en colère.'
        : R.allies(j, cible.faction, ctx.alliance) ? 'Des alliés ne se frappent pas.' : '';
      return fait(aller(ids), 'deplacer', x, z, message);
    }
    if (sorte === 'structure') {
      const s = cible.s;
      let c = null;
      if (s.sorte === 'barricade') {
        if (s.faction === j && s.chantier) c = avec('barricader', lot => cmd(C.BARRICADER, { ids: lot, x: s.x, z: s.z, x2: s.x2, z2: s.z2 }));
        if (c) return fait(c, 'batir', s.x, s.z);
        if (j !== R.CONVERGENCE && R.peutLever(j, s, ctx.alliance)) c = avec('lever', lot => cmd(C.LEVER, { ids: lot, cible: s.id }));
        if (c) return fait(c, 'lever', s.x, s.z);
      } else if (s.sorte === 'avant-poste') {
        if (s.faction === j && s.chantier) c = avec('construire', lot => cmd(C.CONSTRUIRE, { ids: lot, x: s.x, z: s.z }));
        if (c) return fait(c, 'batir', s.x, s.z);
        if (R.peutCasserStructure(j, s, ctx.alliance)) c = avec('casser', lot => cmd(C.CASSER, { ids: lot, sorte: 'structure', cible: s.id }));
        if (c) return fait(c, 'casser', s.x, s.z);
        if (R.peutLever(j, s, ctx.alliance)) c = avec('lever', lot => cmd(C.LEVER, { ids: lot, cible: s.id }));
        if (c) return fait(c, 'lever', s.x, s.z);
      } else if (s.sorte === 'qg' && s.faction !== j && !R.allies(j, s.faction, ctx.alliance)) {
        // Un QG ne se casse ni ne se lève : on l'occupe en tenant son parvis.
        return fait(aller(ids, 1), 'attaque', s.x, s.z);
      }
      return fait(aller(ids), 'deplacer');
    }
    if (sorte === 'gisement') {
      const c = avec('recolter', lot => cmd(C.RECOLTER, { ids: lot, gisement: cible.index }));
      if (c) return fait(c, 'recolter', cible.x, cible.z);
    } else if (sorte === 'cassable' && R.peutCasser(j)) {
      const c = avec('casser', lot => cmd(C.CASSER, { ids: lot, sorte: 'cassable', cible: cible.index }));
      if (c) return fait(c, 'casser', cible.x, cible.z);
    }
    return fait(aller(ids), 'deplacer');
  }

  /** Segment de barricade borné à [min, max] mètres, depuis (x, z) vers (x2, z2) ; dir : direction si les deux points
   *  se confondent. */
  function borneSegment(x, z, x2, z2, min, max, dir) {
    let dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz);
    if (L < 1e-3) { dx = dir ? dir[0] : 1; dz = dir ? dir[1] : 0; L = Math.hypot(dx, dz) || 1; }
    const l = L < min ? min : L > max ? max : L;
    return { x, z, x2: x + dx / L * l, z2: z + dz / L * l, longueur: l };
  }
  const coutBarricade = (R, longueur) => Math.ceil(longueur * R.CONSTANTES.BARRICADE.materiauxParMetre);

  /** Visée confirmée : mode 'attaque' | 'regrouper' | 'barricade' | 'lever' | 'casser' | 'avantPoste' | 'recolter' |
   *  'salve' | 'jet' | 'ralliement'. Pour la barricade, (x2, z2) est l'autre bout ; pour le ralliement, ctx.structure. */
  function ordreVisee(R, P, ctx, mode, cible, x, z, x2, z2) {
    const j = ctx.joueur, C = P.CMD, ids = ctx.ids || new Int32Array(0);
    const cmd = (t, champs) => P.commande(t, j, champs);
    const fait = (cmds, sorte, mx = x, mz = z) => ({ cmds, marque: { x: mx, z: mz, sorte }, message: '' });
    const rien = message => ({ cmds: [], marque: null, message });
    const lot = critere => scinder(R, ctx, critere)[0];
    const sorte = cible ? cible.sorte : 'sol';
    switch (mode) {
      case 'attaque':
        if (!ids.length) return rien('');
        if (sorte === 'unite' && R.hostile(j, cible.faction, ctx.alliance, ctx.colere)) return fait([cmd(C.ATTAQUER, { ids, cible: cible.id })], 'attaque');
        return fait([cmd(C.DEPLACER, { ids, x, z, mode: 1 })], 'attaque');
      case 'regrouper':
        return ids.length ? fait([cmd(C.REGROUPER, { ids, x, z })], 'regrouper') : rien('');
      case 'barricade': {
        if (!R.peutBarricader(j)) return rien('Seule la Convergence bâtit des barricades.');
        const l = lot('barricader');
        if (!l.length) return rien('Aucune unité de la sélection ne bâtit de barricade.');
        const B = R.CONSTANTES.BARRICADE, seg = borneSegment(x, z, x2, z2, B.longueurMin, B.longueurMax, null);
        const cout = coutBarricade(R, seg.longueur);
        if (ctx.eco && ctx.eco.materiaux < cout) return rien('Matériaux insuffisants : ' + cout + ' pour ' + Math.round(seg.longueur) + ' m.');
        return fait([cmd(C.BARRICADER, { ids: l, x: seg.x, z: seg.z, x2: seg.x2, z2: seg.z2 })], 'batir', (seg.x + seg.x2) / 2, (seg.z + seg.z2) / 2);
      }
      case 'lever': {
        if (sorte !== 'structure' || !R.peutLever(j, cible.s, ctx.alliance)) {
          return rien(j === R.CONVERGENCE ? 'La Convergence ne retire que ses propres barricades.'
            : j === R.BASTION ? 'Le Bastion lève les barricades des autres camps.' : 'Rien à lever ici.');
        }
        const l = lot('lever');
        return l.length ? fait([cmd(C.LEVER, { ids: l, cible: cible.s.id })], 'lever', cible.s.x, cible.s.z) : rien('Aucune unité de la sélection ne lève.');
      }
      case 'casser': {
        if (!R.peutCasser(j)) return rien('Seule la Convergence casse.');
        const l = lot('casser');
        if (!l.length) return rien('Aucune unité de la sélection ne casse.');
        if (sorte === 'cassable') return fait([cmd(C.CASSER, { ids: l, sorte: 'cassable', cible: cible.index })], 'casser', cible.x, cible.z);
        if (sorte === 'structure' && R.peutCasserStructure(j, cible.s, ctx.alliance)) {
          return fait([cmd(C.CASSER, { ids: l, sorte: 'structure', cible: cible.s.id })], 'casser', cible.s.x, cible.s.z);
        }
        return rien('Choisissez du mobilier, une voiture, une vitrine ou un avant-poste adverse.');
      }
      case 'avantPoste': {
        const l = lot('construire');
        if (!l.length) return rien('Seules les Équipes bâtissent.');
        const A = R.CONSTANTES.AVANT_POSTE;
        if (ctx.eco && (ctx.eco.moyens < A.moyens || ctx.eco.materiaux < A.materiaux)) return rien('Il faut ' + A.moyens + ' Moyens et ' + A.materiaux + ' Matériaux.');
        return fait([cmd(C.CONSTRUIRE, { ids: l, x, z })], 'batir');
      }
      case 'recolter': {
        const l = lot('recolter');
        if (!l.length) return rien('Seules les Équipes récoltent.');
        if (sorte !== 'gisement') return rien('Choisissez un marché (Moyens) ou un chantier (Matériaux).');
        return fait([cmd(C.RECOLTER, { ids: l, gisement: cible.index })], 'recolter', cible.x, cible.z);
      }
      case 'salve': case 'jet': {
        const l = lot(mode);
        return l.length ? fait([cmd(C.CAPACITE, { ids: l, capacite: mode, x, z })], mode)
          : rien(mode === 'salve' ? 'La Salve est celle des Compagnies.' : 'Le Jet est celui du Canon à eau.');
      }
      case 'ralliement':
        return ctx.structure ? fait([cmd(C.RALLIEMENT, { producteur: ctx.structure.id, x, z })], 'ralliement') : rien('');
      default:
        return rien('');
    }
  }

  /** Ordres immédiats : 'arret' | 'tenir' | 'replier'. */
  function ordreImmediat(R, P, ctx, id) {
    const t = { arret: P.CMD.ARRETER, tenir: P.CMD.TENIR, replier: P.CMD.REPLIER }[id];
    if (!t || !ctx.ids || !ctx.ids.length) return { cmds: [], marque: null, message: '' };
    return { cmds: [P.commande(t, ctx.joueur, { ids: ctx.ids })], marque: null, message: '' };
  }

  /** Types qu'une structure produit : tout le camp au QG, l'Équipe et l'unité de base à un avant-poste. */
  function typesProduits(R, s) {
    if (!s || s.faction > 2) return [];
    if (s.sorte === 'qg') return R.TYPES_PAR_FACTION[s.faction].slice();
    if (s.sorte === 'avant-poste') return [R.OUVRIER[s.faction], R.BASE[s.faction]];
    return [];
  }
  const estProducteur = (R, s) => !!s && (s.sorte === 'qg' || s.sorte === 'avant-poste');

  /** Pourquoi la structure s ne peut pas produire n lots du type t (chaîne vide si elle le peut). */
  function raisonProduction(R, ctx, s, t, n = 1) {
    if (!s || s.faction !== ctx.joueur) return 'Cette structure n’est pas à vous.';
    if (!typesProduits(R, s).includes(t)) return s.sorte === 'avant-poste' ? 'Un avant-poste ne produit que les Équipes et l’unité de base.' : 'Ce type n’est pas de ce camp.';
    if (s.chantier) return 'Le chantier n’est pas fini.';
    if (s.sorte === 'qg' && s.occupation >= 1) return 'Le QG est occupé : il ne produit plus.';
    const file = s.file ? s.file.length : 0;
    if (file >= R.CONSTANTES.FILE_MAX) return 'File pleine : ' + R.CONSTANTES.FILE_MAX + ' ordres au plus.';
    const T = R.TYPES[t], e = ctx.eco;
    if (e) {
      if (e.moyens < T.cout.moyens * n) return 'Moyens insuffisants : ' + T.cout.moyens * n + ' pour ' + n + (n > 1 ? ' lots.' : ' lot.');
      if (e.materiaux < T.cout.materiaux * n) return 'Matériaux insuffisants : ' + T.cout.materiaux * n + ' pour ' + n + (n > 1 ? ' lots.' : ' lot.');
      if (e.popMax > 0 && e.pop + T.lot * T.pop * n > e.popMax) return 'Plafond atteint : ' + e.pop + ' sur ' + e.popMax + '.';
    }
    return '';
  }
  /** n lots au plus : autant que la file en accepte et, s'il en faut plusieurs (Maj), autant que les moyens en paient. */
  function ordreProduction(R, P, ctx, s, t, n = 1) {
    const libre = R.CONSTANTES.FILE_MAX - (s && s.file ? s.file.length : 0);
    let lots = Math.max(1, Math.min(n, libre));
    const T = R.TYPES[t], e = ctx.eco;
    if (T && e && lots > 1) {
      const parMoyens = T.cout.moyens ? Math.floor(e.moyens / T.cout.moyens) : lots;
      const parMateriaux = T.cout.materiaux ? Math.floor(e.materiaux / T.cout.materiaux) : lots;
      const parPlace = e.popMax > 0 ? Math.floor((e.popMax - e.pop) / (T.lot * T.pop)) : lots;
      lots = Math.max(1, Math.min(lots, parMoyens, parMateriaux, parPlace));
    }
    const raison = raisonProduction(R, ctx, s, t, lots);
    if (raison) return { cmds: [], marque: null, message: raison };
    return { cmds: [P.commande(P.CMD.PRODUIRE, ctx.joueur, { producteur: s.id, type: t, n: lots })], marque: null, message: '' };
  }

  /* ------------------------------------------------------------------------------------------------------------ */

  function creerCommandes(o) {
    const R = o.regles || PDR.regles, P = o.protocole || PDR.protocole, REGL = I.reglages;
    const REG = o.reglages || REGL.defaults();
    const canvas = o.canvas || null, camera = o.camera || null;
    const doc = o.document || (canvas && canvas.ownerDocument) || null;
    const win = (doc && doc.defaultView) || null;
    const projecteur = o.projecteur || (camera && canvas ? creerProjecteur(camera, canvas) : null);
    const rappels = Object.assign({ ordre() {}, marque() {}, message() {}, selection() {}, mode() {}, alerte() { return null; }, pause() {} }, o.rappels || {});
    const CAP = P.CAPACITE, E = R.ETATS;
    const estOuvrier = new Uint8Array(16);
    for (const t of R.OUVRIER) estOuvrier[t] = 1;

    // ---- Sélection : masque par emplacement (pour le rendu), liste compacte, type retenu au moment du choix. ----
    const masque = new Uint8Array(CAP), liste = new Int32Array(CAP), typeDe = new Uint8Array(CAP);
    const selection = { masque, liste, n: 0, version: 0, structure: -1 };
    const parType = new Uint32Array(16);
    const resume = { n: 0, parType, cohesion: 0, repli: 0, tient: 0, ouvriers: 0, oisifs: 0 };

    // ---- Ce que dit le dernier état. ----
    let f32 = null, n = 0, joueur = 0, alliance = null, colere = 0, temps = 0, eco = null;
    let structures = [], parId = new Map(), cassables = null, stocks = null, voile = null, gv = null;
    let sites = { qg: [], lieux: [], gisements: [], cassables: [] }, ville = null;
    let actif = false, demo = false, versionCtx = 0, signatureCapacites = '';

    let mode = null;            // visée : { id, a: [x, z] | null }
    let apercu = null;
    const groupes = new Array(10).fill(null);
    let dernierGroupe = -1, dernierGroupeT = 0;
    const pointeur = { x: -1, y: -1, dedans: false, surScene: false, bouge: false, ctrl: false, meta: false, maj: false };
    let espaceTenu = false, espaceSaisie = false;
    const vues = new Set();
    let index = null, touchesIndexees = null;
    const sortie = new Float64Array(3);
    let survolT = 0, survol = '';
    const coins = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const racine = canvas && canvas.parentNode && canvas.parentNode.dataset ? canvas.parentNode : null;
    const etiquette = doc ? doc.getElementById('visee') : null;
    const etiquetteTexte = doc ? doc.getElementById('visee-texte') : null;
    const maintenant = () => (globalThis.performance ? globalThis.performance.now() : Date.now());

    const indexTouches = () => {
      if (touchesIndexees !== REG.touches) { index = REGL.indexer(REG.touches); touchesIndexees = REG.touches; }
      return index;
    };
    const premiereTouche = id => { const c = REG.touches[id]; return c && c.length ? REGL.keyName(c[0]) : ''; };

    // ---- Sélection. ----
    function viderSans() {
      for (let k = 0; k < selection.n; k++) masque[liste[k]] = 0;
      selection.n = 0;
      selection.structure = -1;
    }
    function ajouterUn(i, t) {
      if (masque[i]) return;
      masque[i] = 1; typeDe[i] = t; liste[selection.n++] = i;
    }
    function compacter() {
      let m = 0;
      for (let k = 0; k < selection.n; k++) { const i = liste[k]; if (masque[i]) liste[m++] = i; }
      selection.n = m;
    }
    function changer() {
      selection.version++;
      versionCtx++;
      resumer();
      rappels.selection(api);
    }
    /** Une unité de l'emplacement i est-elle encore à moi, du type t, en jeu ? */
    function valide(i, t) {
      if (!f32 || i >= n) return false;
      const c = f32[i * 4 + 3] | 0;
      return (c & 3) === joueur && ((c >>> 2) & 15) === t && ((c >>> 6) & 15) !== E.HORS_JEU;
    }
    function elaguer() {
      let m = 0;
      for (let k = 0; k < selection.n; k++) {
        const i = liste[k];
        if (valide(i, typeDe[i])) liste[m++] = i; else masque[i] = 0;
      }
      if (m !== selection.n) { selection.n = m; selection.version++; }
    }
    function resumer() {
      parType.fill(0);
      let somme = 0, repli = 0, tient = 0, ouvriers = 0, oisifs = 0;
      for (let k = 0; k < selection.n; k++) {
        const i = liste[k], c = f32 ? f32[i * 4 + 3] | 0 : 0, t = typeDe[i], e = (c >>> 6) & 15;
        parType[t]++;
        somme += (c >>> 10) & 63;
        if (e === E.REPLI) repli++; else if (e === E.TIENT) tient++;
        if (estOuvrier[t]) { ouvriers++; if (e === E.OISIF) oisifs++; }
      }
      resume.n = selection.n;
      resume.cohesion = selection.n ? somme / (selection.n * 63) : 0;
      resume.repli = repli; resume.tient = tient; resume.ouvriers = ouvriers; resume.oisifs = oisifs;
      // Les boutons de la carte dépendent des capacités présentes : on la redessine quand elles changent.
      let sig = selection.structure + ':';
      for (let t = 0; t < 13; t++) sig += parType[t] ? '1' : '0';
      if (sig !== signatureCapacites) { signatureCapacites = sig; versionCtx++; }
    }
    function capables(critere) {
      const test = CRITERES[critere];
      let k = 0;
      for (let t = 0; t < 13; t++) if (parType[t] && test(R.TYPES[t])) k += parType[t];
      return k;
    }
    function ctxOrdres() {
      const ids = liste.slice(0, selection.n), types = new Uint8Array(ids.length);
      for (let k = 0; k < ids.length; k++) types[k] = typeDe[ids[k]];
      return { joueur, alliance, colere, ids, types, eco, structure: parId.get(selection.structure) || null };
    }
    const sorte = () => (selection.n ? 'unites' : selection.structure >= 0 ? 'structure' : 'vide');

    // ---- Lecture du monde à l'écran. ----
    function visible(x, z) {
      if (!voile || !gv) return true;
      if (x < gv.x0 || z < gv.z0) return false;
      const i = ((x - gv.x0) / gv.cellule) | 0, j = ((z - gv.z0) / gv.cellule) | 0;
      return i < gv.nx && j < gv.nz && voile[i + j * gv.nx] >= SEUIL_VISIBLE;
    }
    /** Emplacement de l'unité la plus proche du pixel, à moins de rayon px ; quelles : 0 les miennes, 1 les autres
     *  camps (visibles). Un premier tri au sol, sous le curseur, évite de projeter les unités lointaines. */
    function plusProche(px, py, rayon, quelles) {
      if (!f32 || !n || !projecteur || !projecteur.preparer()) return -1;
      const sol = projecteur.sol(px, py);
      let gx = 0, gz = 0, r2 = Infinity;
      if (sol) {
        gx = sol[0]; gz = sol[1];
        const m = projecteur.echelle(gx, gz) * rayon * 1.6 + 3;
        r2 = m * m;
      }
      let meilleur = -1, d2 = rayon * rayon;
      for (let i = 0; i < n; i++) {
        const o = i << 2, x = f32[o], z = f32[o + 1];
        const ex = x - gx, ez = z - gz;
        if (ex * ex + ez * ez > r2) continue;
        const c = f32[o + 3] | 0, f = c & 3;
        if (f === 3 || ((c >>> 6) & 15) === E.HORS_JEU) continue;
        if (quelles === 0 ? f !== joueur : f === joueur || !visible(x, z)) continue;
        if (!projecteur.projeter(x, HAUTEUR, z, sortie)) continue;
        const dx = sortie[0] - px, dy = sortie[1] - py, e2 = dx * dx + dy * dy;
        if (e2 < d2) { d2 = e2; meilleur = i; }
      }
      return meilleur;
    }
    const tol = (px, py, sol, m) => (projecteur && projecteur.preparer() ? Math.max(m, projecteur.echelle(sol[0], sol[1]) * 8) : m);
    function structureSous(px, py, sol) {
      if (!sol) return null;
      let meilleure = null, dmin = Infinity;
      const marge = tol(px, py, sol, 0);
      for (const s of structures) {
        if (s.faction !== joueur && !R.allies(joueur, s.faction, alliance) && s.sorte !== 'qg' && !visible(s.x, s.z)) continue;
        let d;
        if (s.sorte === 'barricade') {
          const ax = s.x2 - s.x, az = s.z2 - s.z, L2 = ax * ax + az * az || 1;
          const t = Math.max(0, Math.min(1, ((sol[0] - s.x) * ax + (sol[1] - s.z) * az) / L2));
          d = Math.hypot(sol[0] - s.x - ax * t, sol[1] - s.z - az * t) - 1.5;
        } else {
          d = Math.hypot(sol[0] - s.x, sol[1] - s.z) - (s.sorte === 'qg' ? RAYON_QG : RAYON_AVANT_POSTE);
        }
        if (d <= marge && d < dmin) { dmin = d; meilleure = s; }
      }
      return meilleure;
    }
    function gisementSous(sol) {
      if (!sol) return null;
      const g = sites.gisements || [];
      for (let k = 0; k < g.length; k++) {
        if (stocks && stocks[k] <= 0) continue;
        if (Math.hypot(sol[0] - g[k].x, sol[1] - g[k].z) <= (g[k].rayon || 10)) return { sorte: 'gisement', index: k, x: g[k].x, z: g[k].z };
      }
      return null;
    }
    function cassableSous(px, py, sol) {
      if (!sol) return null;
      const c = sites.cassables || [], r = tol(px, py, sol, RAYON_CASSABLE);
      let meilleur = null, dmin = r;
      for (let k = 0; k < c.length; k++) {
        if (cassables && cassables[k]) continue;
        const d = Math.hypot(sol[0] - c[k].x, sol[1] - c[k].z);
        if (d < dmin) { dmin = d; meilleur = { sorte: 'cassable', index: k, x: c[k].x, z: c[k].z }; }
      }
      return meilleur;
    }
    function cibleAuPoint(px, py, sol) {
      const u = plusProche(px, py, RAYON_CHOIX, 1);
      if (u >= 0) return { sorte: 'unite', id: u, faction: (f32[u * 4 + 3] | 0) & 3 };
      const s = structureSous(px, py, sol);
      if (s) return { sorte: 'structure', s };
      return gisementSous(sol) || (R.peutCasser(joueur) ? cassableSous(px, py, sol) : null) || { sorte: 'sol' };
    }

    function appliquer(r) {
      if (!r) return false;
      for (const c of r.cmds) rappels.ordre(c);
      if (r.marque && r.cmds.length) rappels.marque(r.marque);
      if (r.message) rappels.message(r.message, r.cmds.length === 0);
      return r.cmds.length > 0;
    }
    const message = t => rappels.message(t, false), refuser = t => rappels.message(t, true);

    // ---- Choisir. ----
    function choisirTypeALecran(t) {
      if (!f32 || !projecteur || !projecteur.preparer()) return;
      const w = projecteur.largeur, h = projecteur.hauteur;
      for (let i = 0; i < n; i++) {
        const o = i << 2, c = f32[o + 3] | 0;
        if ((c & 3) !== joueur || ((c >>> 2) & 15) !== t || ((c >>> 6) & 15) === E.HORS_JEU) continue;
        if (!projecteur.projeter(f32[o], HAUTEUR, f32[o + 1], sortie)) continue;
        if (sortie[0] >= 0 && sortie[0] <= w && sortie[1] >= 0 && sortie[1] <= h) ajouterUn(i, t);
      }
    }
    function choisirAuPoint(px, py, ajouter, memeType, rayon = RAYON_CHOIX) {
      const i = plusProche(px, py, rayon, 0);
      if (i >= 0) {
        const t = ((f32[i * 4 + 3] | 0) >>> 2) & 15;
        if (memeType) { if (!ajouter) viderSans(); selection.structure = -1; choisirTypeALecran(t); }
        else if (ajouter) { selection.structure = -1; if (masque[i]) { masque[i] = 0; compacter(); } else ajouterUn(i, t); }
        else { viderSans(); ajouterUn(i, t); }
        changer();
        return true;
      }
      const sol = projecteur ? projecteur.sol(px, py) : null, s = structureSous(px, py, sol);
      if (s) { viderSans(); selection.structure = s.id; changer(); return true; }
      if (!ajouter && (selection.n || selection.structure >= 0)) { viderSans(); changer(); }
      return false;
    }
    /** Cadre : toutes mes unités dont le centre projeté tombe dedans. Une passe sur le tampon, sans allocation. */
    function choisirCadre(x0, y0, x1, y1, ajouter) {
      if (!ajouter) viderSans();
      selection.structure = -1;
      if (f32 && projecteur && projecteur.preparer()) {
        const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
        for (let i = 0; i < n; i++) {
          const o = i << 2, code = f32[o + 3] | 0;
          if ((code & 3) !== joueur || ((code >>> 6) & 15) === E.HORS_JEU) continue;
          if (!projecteur.projeter(f32[o], HAUTEUR, f32[o + 1], sortie)) continue;
          const px = sortie[0], py = sortie[1];
          if (px >= a && px <= b && py >= c && py <= d) ajouterUn(i, (code >>> 2) & 15);
        }
      }
      changer();
    }
    function choisirSi(test) {
      viderSans();
      if (f32) {
        for (let i = 0; i < n; i++) {
          const c = f32[i * 4 + 3] | 0;
          if ((c & 3) === joueur && ((c >>> 6) & 15) !== E.HORS_JEU && test(c)) ajouterUn(i, (c >>> 2) & 15);
        }
      }
      changer();
    }
    const toutChoisir = () => choisirSi(() => true);

    function centrer(x, z) { if (camera && Number.isFinite(x) && Number.isFinite(z)) camera.viser(x, z); }
    function centrerSelection() {
      if (selection.n && f32) {
        let sx = 0, sz = 0;
        for (let k = 0; k < selection.n; k++) { const o = liste[k] * 4; sx += f32[o]; sz += f32[o + 1]; }
        centrer(sx / selection.n, sz / selection.n);
      } else if (selection.structure >= 0) {
        const s = parId.get(selection.structure);
        if (s) centrer(s.x, s.z);
      }
    }

    function groupe(k, e) {
      if (e.ctrlKey || e.metaKey) {
        const ids = liste.slice(0, selection.n), types = new Uint8Array(ids.length);
        for (let q = 0; q < ids.length; q++) types[q] = typeDe[ids[q]];
        groupes[k] = selection.n || selection.structure >= 0 ? { ids, types, structure: selection.structure } : null;
        message(groupes[k] ? 'Groupe ' + k + ' : ' + (selection.n ? selection.n.toLocaleString('fr-FR') + (selection.n > 1 ? ' unités.' : ' unité.') : 'structure.') : 'Groupe ' + k + ' vidé.');
        return;
      }
      const g = groupes[k];
      if (!g) { message('Groupe ' + k + ' vide : Ctrl + ' + k + ' pour le former.'); return; }
      const t = maintenant(), double = dernierGroupe === k && t - dernierGroupeT < DOUBLE_MS;
      dernierGroupe = k; dernierGroupeT = double ? 0 : t;
      if (!e.shiftKey) viderSans();
      let m = 0;
      for (let q = 0; q < g.ids.length; q++) {
        const i = g.ids[q];
        if (valide(i, g.types[q])) { ajouterUn(i, g.types[q]); g.ids[m] = i; g.types[m++] = g.types[q]; }
      }
      if (m < g.ids.length) { g.ids = g.ids.slice(0, m); g.types = g.types.slice(0, m); }
      if (!selection.n && g.structure >= 0 && parId.has(g.structure)) selection.structure = g.structure;
      changer();
      if (double) centrerSelection();
    }

    function general(id) {
      if (id === 'pause') { rappels.pause(); return; }
      if (id === 'alerte') { const p = rappels.alerte(); if (p) centrer(p[0], p[1]); else message('Aucune alerte située.'); return; }
      if (id === 'oisifs') {
        choisirSi(c => estOuvrier[(c >>> 2) & 15] && ((c >>> 6) & 15) === E.OISIF);
        if (selection.n) { const o = liste[0] * 4; centrer(f32[o], f32[o + 1]); } else message('Aucune Équipe oisive.');
        return;
      }
      if (id === 'armee') { choisirSi(c => !estOuvrier[(c >>> 2) & 15]); if (!selection.n) message('Aucune unité de combat.'); return; }
      if (id === 'qg') {
        viderSans();
        const s = parId.get(joueur) || structures.find(q => q.sorte === 'qg' && q.faction === joueur);
        if (s) { selection.structure = s.id; centrer(s.x, s.z); }
        changer();
      }
    }

    // ---- Visées. ----
    const CRITERE_MODE = { lever: 'lever', casser: 'casser', barricade: 'barricader', avantPoste: 'construire', recolter: 'recolter', salve: 'salve', jet: 'jet' };
    function entrerVisee(id) {
      mode = { id, a: null };
      if (racine) racine.dataset.visee = id;
      versionCtx++;
      rappels.mode(id);
    }
    function annulerVisee() {
      if (!mode) return false;
      mode = null;
      apercu = null;
      if (racine) delete racine.dataset.visee;
      if (etiquette) etiquette.hidden = true;
      versionCtx++;
      rappels.mode(null);
      return true;
    }
    function action(id, opt = {}) {
      if (!actif) return false;
      const s = sorte();
      if (s === 'structure') {
        if (/^produire[1-5]$/.test(id)) return production(Number(id.slice(-1)) - 1, opt.maj ? R.CONSTANTES.FILE_MAX : 1);
        if (id === 'ralliement') {
          const st = parId.get(selection.structure);
          if (st && st.faction === joueur && estProducteur(R, st)) { entrerVisee('ralliement'); return true; }
        }
        return false;
      }
      if (s !== 'unites') return false;
      if (id === 'arret' || id === 'tenir' || id === 'replier') { annulerVisee(); return appliquer(ordreImmediat(R, P, ctxOrdres(), id)); }
      if (id === 'attaque' || id === 'regrouper') { entrerVisee(id); return true; }
      const critere = CRITERE_MODE[id];
      if (!critere) return false;
      if ((id === 'casser' && !R.peutCasser(joueur)) || (id === 'barricade' && !R.peutBarricader(joueur))) {
        refuser(id === 'casser' ? 'Seule la Convergence casse.' : 'Seule la Convergence bâtit des barricades.');
        return false;
      }
      if (!capables(critere)) {
        refuser({ lever: 'Aucune unité de la sélection ne lève.', casser: 'Aucune unité de la sélection ne casse.',
          barricader: 'Aucune unité de la sélection ne bâtit de barricade.', construire: 'Seules les Équipes bâtissent.',
          recolter: 'Seules les Équipes récoltent.', salve: 'La Salve est celle des Compagnies.', jet: 'Le Jet est celui du Canon à eau.' }[critere]);
        return false;
      }
      entrerVisee(id);
      return true;
    }
    function production(k, lots) {
      const s = parId.get(selection.structure);
      if (!s || s.faction !== joueur) return false;
      const t = R.TYPES_PAR_FACTION[s.faction][k];
      if (t === undefined) return false;
      return appliquer(ordreProduction(R, P, ctxOrdres(), s, t, lots));
    }
    function dirEcran() {
      const v = camera && camera.derniere;
      return v && v.axes ? [v.axes.right[0], v.axes.right[2]] : [1, 0];
    }
    function executerBarricade(a, b) {
      const B = R.CONSTANTES.BARRICADE, seg = borneSegment(a[0], a[1], b[0], b[1], B.longueurMin, B.longueurMax, dirEcran());
      const r = ordreVisee(R, P, ctxOrdres(), 'barricade', null, seg.x, seg.z, seg.x2, seg.z2);
      if (appliquer(r)) { if (pointeur.maj) mode.a = null; else annulerVisee(); }
    }
    /** Confirme la visée au pixel (px, py). */
    function viser(px, py) {
      const sol = projecteur ? projecteur.sol(px, py) : null;
      if (!sol || !mode) return;
      if (mode.id === 'barricade') {
        if (!mode.a) { mode.a = sol; return; }
        executerBarricade(mode.a, sol);
        return;
      }
      const cible = cibleAuPoint(px, py, sol);
      const r = ordreVisee(R, P, ctxOrdres(), mode.id, cible, sol[0], sol[1]);
      if (appliquer(r) && !pointeur.maj) annulerVisee();
    }
    function ordonnerAuPoint(px, py) {
      const sol = projecteur ? projecteur.sol(px, py) : null;
      if (!sol) return;
      if (!selection.n && selection.structure >= 0) {
        const s = parId.get(selection.structure);
        if (s && s.faction === joueur && estProducteur(R, s)) appliquer(ordreVisee(R, P, ctxOrdres(), 'ralliement', null, sol[0], sol[1]));
        return;
      }
      if (!selection.n) return;
      appliquer(ordreContextuel(R, P, ctxOrdres(), cibleAuPoint(px, py, sol), sol[0], sol[1]));
    }

    // ---- Les actions que camera.brancher appelle. ----
    const actions = {
      cadre: doc ? doc.getElementById('cadre') : null,
      pointSelection(x, y, ajouter, double) {
        if (!actif) return;
        if (mode) { viser(x, y); return; }
        choisirAuPoint(x, y, ajouter, double || pointeur.ctrl || pointeur.meta);
      },
      rectangleSelection(x0, y0, x1, y1, ajouter) {
        if (!actif) return;
        if (mode && mode.id === 'barricade') {
          const a = projecteur && projecteur.sol(x0, y0), b = projecteur && projecteur.sol(x1, y1);
          if (a && b) executerBarricade(a, b);
          return;
        }
        if (mode) { viser(x1, y1); return; }
        choisirCadre(x0, y0, x1, y1, ajouter);
      },
      ordre(x, y) {
        if (!actif) return;
        if (annulerVisee()) return;        // clic droit pendant une visée : on l'abandonne
        ordonnerAuPoint(x, y);
      },
      toucher(x, y) {
        if (!actif) return;
        if (mode) { viser(x, y); return; }
        if (plusProche(x, y, RAYON_DOIGT, 0) >= 0 || !selection.n) { choisirAuPoint(x, y, false, false, RAYON_DOIGT); return; }
        ordonnerAuPoint(x, y);
      },
      toutSelectionner() { if (actif) toutChoisir(); },
      deselectionner() { if (actif && !annulerVisee()) { viderSans(); changer(); } },
    };

    // ---- Écoutes propres : modificateurs du clic, pointeur pour le bord de l'écran, molette inversée. ----
    if (canvas) {
      canvas.addEventListener('pointerdown', e => {
        pointeur.ctrl = e.ctrlKey; pointeur.meta = e.metaKey; pointeur.maj = e.shiftKey;
        if (espaceTenu) espaceSaisie = true;
      }, { capture: true, passive: true });
    }
    if (win) {
      win.addEventListener('pointermove', e => {
        pointeur.x = e.clientX; pointeur.y = e.clientY; pointeur.dedans = true; pointeur.bouge = true;
        pointeur.surScene = e.target === canvas; pointeur.maj = e.shiftKey;
      }, { passive: true });
      doc.documentElement.addEventListener('mouseleave', () => { pointeur.dedans = false; });
      win.addEventListener('blur', () => { pointeur.dedans = false; vues.clear(); espaceTenu = false; });
      // Molette inversée : seul le zoom à la molette s'inverse ; le pincement et les deux doigts restent naturels.
      // La caméra (camera.js) n'a pas d'option : on prend l'évènement avant elle, sur son parent, en capture.
      if (racine) {
        racine.addEventListener('wheel', e => {
          if (!actif || !REG.moletteInversee || e.target !== canvas || e.ctrlKey || e.shiftKey || !camera) return;
          const ligne = e.deltaMode === 1, molette = ligne || (e.deltaX === 0 && e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0);
          if (!molette) return;
          e.stopPropagation();
          e.preventDefault();
          const b = canvas.getBoundingClientRect(), dy = -(ligne ? e.deltaY * 33 : e.deltaY);
          camera.zoomer(Math.pow(1.18, Math.sign(dy) * Math.min(4, Math.abs(dy) / 100 || 1)), e.clientX - b.left, e.clientY - b.top);
        }, { capture: true, passive: false });
      }
    }

    /** Clavier, appelé par l'aiguilleur de l'interface. Vrai si la touche est consommée. */
    function clavier(e, bas) {
      if (!actif) return false;
      const code = REGL.touche(e);
      if (e.code === 'Space') {
        // Espace + glisser saisit la carte (camera.js) : la touche passe ; l'alerte part au relâchement, sans glissé.
        const lie = indexTouches().get('Space');
        if (bas) { if (!e.repeat) { espaceTenu = true; espaceSaisie = false; } }
        else {
          const avait = espaceTenu && !espaceSaisie;
          espaceTenu = false;
          if (avait && lie && lie.general) general(lie.general);
        }
        return false;
      }
      if (/^Digit[1-9]$/.test(e.code) || (/^Numpad[1-9]$/.test(e.code) && /^[1-9]$/.test(e.key))) {
        if (bas && !e.repeat) groupe(Number(e.code.slice(-1)), e);
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && code === 'KeyA') { if (bas) toutChoisir(); return true; }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;      // raccourcis du navigateur et du système
      const idx = indexTouches().get(code);
      if (idx && idx.vue) {
        let id = idx.vue;
        if (e.shiftKey && id === 'vueGauche') id = 'vueTournerG';
        if (e.shiftKey && id === 'vueDroite') id = 'vueTournerD';
        if (bas) vues.add(id);
        else {
          vues.delete(idx.vue); vues.delete(id);
          if (idx.vue === 'vueGauche') vues.delete('vueTournerG');
          if (idx.vue === 'vueDroite') vues.delete('vueTournerD');
        }
        return true;
      }
      if (!idx) return CODES_CAMERA.has(e.code);
      if (!bas || e.repeat) return true;
      if (idx.general) { general(idx.general); return true; }
      const s = sorte();
      if (s === 'structure' && idx.production) action(idx.production, { maj: e.shiftKey });
      else if (s === 'unites' && idx.ordres) action(idx.ordres, { maj: e.shiftKey });
      return true;
    }

    // ---- À chaque image. ----
    function image(dt) {
      if (!actif || !camera || !camera.derniere) return;
      const v = camera.derniere, pas = (REG.vitesseCamera || 1) * v.D * 1.1 * dt;
      let dr = 0, da = 0, rot = 0, zoom = 0;
      if (vues.has('vueGauche')) dr -= 1;
      if (vues.has('vueDroite')) dr += 1;
      if (vues.has('vueAvant')) da += 1;
      if (vues.has('vueArriere')) da -= 1;
      if (vues.has('vueTournerG')) rot -= 1;
      if (vues.has('vueTournerD')) rot += 1;
      if (vues.has('zoomAvant')) zoom -= 1;
      if (vues.has('zoomArriere')) zoom += 1;
      if (REG.defilementBord && pointeur.dedans && win && (!doc.hasFocus || doc.hasFocus())) {
        const w = win.innerWidth, h = win.innerHeight;
        if (pointeur.x <= BORD_PX) dr -= 1; else if (pointeur.x >= w - 1 - BORD_PX) dr += 1;
        if (pointeur.y <= BORD_PX) da += 1; else if (pointeur.y >= h - 1 - BORD_PX) da -= 1;
      }
      dr = dr < -1 ? -1 : dr > 1 ? 1 : dr;
      da = da < -1 ? -1 : da > 1 ? 1 : da;
      if (dr || da) camera.glisser(dr * pas, da * pas);
      if (rot) camera.tourner(rot * 1.6 * (REG.vitesseCamera || 1) * dt);
      if (zoom) camera.zoomer(Math.exp(zoom * 1.6 * dt));

      // Survol et aperçu : quand le pointeur bouge, et en continu pendant une visée (la vue peut défiler dessous).
      const t = maintenant();
      if (!canvas || !(pointeur.bouge || mode) || t - survolT < SURVOL_MS) return;
      survolT = t;
      pointeur.bouge = false;
      const b = canvas.getBoundingClientRect(), px = pointeur.x - b.left, py = pointeur.y - b.top;
      majSurvol(px, py);
      majApercu(px, py);
    }
    function majSurvol(px, py) {
      let s = '';
      if (pointeur.surScene && !mode) {
        if (plusProche(px, py, RAYON_CHOIX, 0) >= 0) s = 'mien';
        else if (selection.n) {
          const sol = projecteur.sol(px, py), c = sol ? cibleAuPoint(px, py, sol) : null;
          if (c && c.sorte === 'unite') s = R.hostile(joueur, c.faction, alliance, colere) ? 'hostile' : '';
          else if (c && c.sorte === 'structure') {
            const st = c.s;
            if (R.peutCasserStructure(joueur, st, alliance)) s = 'casser';
            else if (joueur !== R.CONVERGENCE && R.peutLever(joueur, st, alliance)) s = 'lever';
            else if (st.faction === joueur && st.chantier) s = 'batir';
          } else if (c && c.sorte === 'gisement') s = capables('recolter') ? 'recolter' : '';
          else if (c && c.sorte === 'cassable') s = 'casser';
        }
      }
      if (s !== survol) { survol = s; if (canvas) { if (s) canvas.dataset.survol = s; else delete canvas.dataset.survol; } }
    }
    function majApercu(px, py) {
      if (!mode || !pointeur.surScene) { apercu = null; if (etiquette) etiquette.hidden = true; return; }
      const sol = projecteur ? projecteur.sol(px, py) : null;
      if (!sol) return;
      let texte = '', valideA = true;
      const A = R.CONSTANTES.AVANT_POSTE;
      switch (mode.id) {
        case 'barricade':
          if (mode.a) {
            const B = R.CONSTANTES.BARRICADE, seg = borneSegment(mode.a[0], mode.a[1], sol[0], sol[1], B.longueurMin, B.longueurMax, dirEcran());
            const cout = coutBarricade(R, seg.longueur);
            valideA = (!eco || eco.materiaux >= cout) && (!ville || !ville.praticable || (ville.praticable(seg.x, seg.z) && ville.praticable(seg.x2, seg.z2)));
            apercu = { sorte: 'barricade', x: seg.x, z: seg.z, x2: seg.x2, z2: seg.z2, rayon: 0, longueur: seg.longueur, cout, valide: valideA };
            texte = Math.round(seg.longueur) + ' m · ' + cout + ' Matériaux';
          } else {
            apercu = { sorte: 'point', x: sol[0], z: sol[1], x2: sol[0], z2: sol[1], rayon: 1, longueur: 0, cout: 0, valide: true };
            texte = 'Premier bout · cliquez puis cliquez, ou glissez';
          }
          break;
        case 'avantPoste':
          valideA = (!eco || (eco.moyens >= A.moyens && eco.materiaux >= A.materiaux)) && (!ville || !ville.praticable || ville.praticable(sol[0], sol[1]));
          apercu = { sorte: 'avant-poste', x: sol[0], z: sol[1], x2: sol[0], z2: sol[1], rayon: RAYON_AVANT_POSTE, longueur: 0, cout: 0, valide: valideA };
          texte = R.FACTIONS[joueur].avantPoste + ' · ' + A.moyens + ' Moyens, ' + A.materiaux + ' Matériaux';
          break;
        case 'salve': {
          const S = R.TYPES[10].capacites.salve;
          apercu = { sorte: 'zone', x: sol[0], z: sol[1], x2: sol[0], z2: sol[1], rayon: S.rayon, longueur: 0, cout: 0, valide: true };
          texte = 'Salve · ' + S.rayon + ' m de rayon, jusqu’à ' + S.portee + ' m';
          break;
        }
        case 'jet': {
          const J = R.TYPES[12].capacites.jet;
          apercu = { sorte: 'cone', x: sol[0], z: sol[1], x2: sol[0], z2: sol[1], rayon: J.portee, longueur: 0, cout: 0, valide: true };
          texte = 'Jet · cône de ' + J.portee + ' m';
          break;
        }
        default:
          apercu = null;
          texte = { attaque: 'Attaque-mouvement : un point ou une unité', regrouper: 'Regrouper ici', lever: 'Lever : une barricade' + (joueur === R.PREFECTURE ? ' ou un avant-poste' : ''),
            casser: 'Casser : mobilier, voiture, vitrine, avant-poste', recolter: 'Récolter : un marché ou un chantier', ralliement: 'Point de ralliement' }[mode.id] || '';
      }
      if (etiquette && etiquetteTexte) {
        etiquetteTexte.textContent = I.outils && I.outils.typo ? I.outils.typo(texte) : texte;
        etiquette.hidden = !texte;
        etiquette.classList.toggle('invalide', !valideA);
        etiquette.style.transform = 'translate(' + Math.round(pointeur.x + 18) + 'px,' + Math.round(pointeur.y + 20) + 'px)';
      }
    }

    // ---- Contexte pour la carte de commandes. ----
    const BOUTONS = ['attaque', 'arret', 'tenir', 'replier', 'regrouper', 'lever', 'casser', 'barricade', 'recolter', 'avantPoste', 'salve', 'jet'];
    function contexte() {
      const s = sorte(), st = selection.structure >= 0 ? parId.get(selection.structure) || null : null;
      const ctx = { version: versionCtx, sorte: s, mode: mode ? mode.id : null, structure: st, joueur, actions: [] };
      const libelle = id => REGL.PAR_ID[id].libelle;
      if (s === 'unites') {
        for (const id of BOUTONS) {
          const critere = CRITERE_MODE[id];
          let present = !critere || capables(critere) > 0;
          if ((id === 'casser' || id === 'barricade') && !R.peutCasser(joueur)) present = false;
          if (!present) { ctx.actions.push({ id, vide: true }); continue; }
          const b = { id, libelle: libelle(id), touche: premiereTouche(id), actif: true, raison: '', enCours: !!mode && mode.id === id, cout: null };
          if (id === 'lever' && joueur === R.CONVERGENCE) b.libelle = 'Retirer une barricade';
          if (id === 'avantPoste') {
            const A = R.CONSTANTES.AVANT_POSTE;
            b.libelle = R.FACTIONS[joueur].avantPoste;
            b.cout = { moyens: A.moyens, materiaux: A.materiaux };
            if (eco && (eco.moyens < A.moyens || eco.materiaux < A.materiaux)) { b.actif = false; b.raison = 'Il faut ' + A.moyens + ' Moyens et ' + A.materiaux + ' Matériaux.'; }
          }
          if (id === 'barricade') b.cout = { moyens: 0, materiaux: R.CONSTANTES.BARRICADE.materiauxParMetre, parMetre: true };
          ctx.actions.push(b);
        }
      } else if (s === 'structure' && st && st.faction === joueur && estProducteur(R, st)) {
        const produits = typesProduits(R, st), liste = R.TYPES_PAR_FACTION[st.faction];
        for (let k = 0; k < 7; k++) {
          const t = liste[k];
          if (t === undefined || !produits.includes(t)) { ctx.actions.push({ id: 'produire' + (k + 1), vide: true }); continue; }
          const T = R.TYPES[t], raison = raisonProduction(R, ctxOrdres(), st, t, 1);
          ctx.actions.push({ id: 'produire' + (k + 1), type: t, libelle: T.pluriel, touche: premiereTouche('produire' + (k + 1)), actif: !raison, raison,
            cout: T.cout, lot: T.lot, duree: T.duree, description: T.description, enCours: false });
        }
        while (ctx.actions.length < 7) ctx.actions.push({ id: 'vide' + ctx.actions.length, vide: true });
        ctx.actions.push({ id: 'ralliement', libelle: libelle('ralliement'), touche: premiereTouche('ralliement'), actif: true, raison: '',
          enCours: !!mode && mode.id === 'ralliement', cout: null });
      }
      return ctx;
    }

    // ---- Flux de la partie. ----
    function partie(infos) {
      const opt = (infos && infos.options) || {};
      demo = !(opt.joueur >= 0 && opt.joueur <= 2);
      joueur = demo ? 0 : opt.joueur;
      sites = (infos && infos.sites) || { qg: [], lieux: [], gisements: [], cassables: [] };
      ville = (infos && infos.ville) || null;
      gv = infos && infos.carte && infos.carte.voile ? infos.carte.voile : null;
      alliance = opt.alliance || null;
      viderSans();
      annulerVisee();
      groupes.fill(null);
      structures = []; parId = new Map(); cassables = null; stocks = null; voile = null; f32 = null; n = 0; eco = null;
      vues.clear();
      changer();
    }
    function etat(e, vue) {
      if (!e) return;
      if (e.unites) {
        f32 = vue || (e.unites instanceof Float32Array ? e.unites : new Float32Array(e.unites, 0, Math.min(e.n * 4, e.unites.byteLength >> 2)));
        n = Math.min(e.n, f32.length >> 2);
      }
      temps = e.temps || 0;
      alliance = e.alliance || null;
      colere = e.colere || 0;
      eco = e.eco ? e.eco[joueur] : eco;
      if (e.structures) {
        structures = e.structures;
        parId = new Map();
        for (const s of structures) parId.set(s.id, s);
        if (selection.structure >= 0 && !parId.has(selection.structure)) selection.structure = -1;
        versionCtx++;
      }
      if (e.cassables) cassables = e.cassables;
      if (e.gisements) stocks = e.gisements;
      if (e.voile) voile = e.voile;
      elaguer();
      resumer();
    }
    function activer(oui) {
      actif = !!oui && !demo;
      if (!actif) {
        annulerVisee();
        vues.clear();
        espaceTenu = false;
        if (canvas) delete canvas.dataset.survol;
        survol = '';
      }
    }
    function coinsVue() {
      if (!projecteur || !projecteur.preparer()) return null;
      const w = projecteur.largeur, h = projecteur.hauteur, ecran = [[0, 0], [w, 0], [w, h], [0, h]];
      for (let k = 0; k < 4; k++) {
        const p = projecteur.sol(ecran[k][0], ecran[k][1]);
        if (!p) return null;
        coins[k][0] = p[0]; coins[k][1] = p[1];
      }
      return coins;
    }

    const api = {
      actions, selection, resume, rappels,
      partie, etat, image, clavier, action, activer, annulerVisee, contexte, coinsVue, centrer,
      produire(type, nLots = 1) {
        const s = parId.get(selection.structure);
        return !!s && appliquer(ordreProduction(R, P, ctxOrdres(), s, type, nLots));
      },
      annuler(rang) {
        const s = parId.get(selection.structure);
        if (!s || s.faction !== joueur) return false;
        rappels.ordre(P.commande(P.CMD.ANNULER, joueur, { producteur: s.id, rang }));
        return true;
      },
      ralliement(x, z) {
        const s = parId.get(selection.structure);
        if (!s || s.faction !== joueur || !estProducteur(R, s)) return false;
        return appliquer(ordreVisee(R, P, ctxOrdres(), 'ralliement', null, x, z));
      },
      diplomatie(quoi, avec) {
        if (joueur < 0 || !['proposer', 'rompre', 'accepter', 'refuser'].includes(quoi)) return false;
        rappels.ordre(P.commande(P.CMD.DIPLOMATIE, joueur, { action: quoi, avec }));
        return true;
      },
      /** Clic droit sur la minicarte : la visée en cours s'y confirme, sinon un déplacement (ou le ralliement). */
      ordreEn(x, z) {
        if (!actif) return false;
        const ctx = ctxOrdres();
        if (mode && mode.id !== 'barricade') { const r = ordreVisee(R, P, ctx, mode.id, { sorte: 'sol' }, x, z); if (appliquer(r)) annulerVisee(); return true; }
        if (!selection.n && selection.structure >= 0) return api.ralliement(x, z);
        return appliquer(ordreContextuel(R, P, ctx, { sorte: 'sol' }, x, z));
      },
      choisirStructure(id) { viderSans(); if (parId.has(id)) selection.structure = id; changer(); },
      /** Raccourcis généraux : 'pause', 'alerte', 'oisifs', 'armee', 'qg'. */
      general(id) { if (actif) general(id); },
      /** Panneau de sélection : garder (vrai) ou retirer (faux) les unités du type t. */
      garderType(t, garder = true) {
        if (!actif || !selection.n) return;
        let m = 0;
        for (let k = 0; k < selection.n; k++) {
          const i = liste[k];
          if ((typeDe[i] === t) === !!garder) liste[m++] = i; else masque[i] = 0;
        }
        if (m === selection.n) return;
        selection.n = m;
        changer();
      },
      get versionContexte() { return versionCtx; },
      get actif() { return actif; },
      get mode() { return mode ? mode.id : null; },
      get apercu() { return mode ? apercu : null; },
      get survol() { return survol; },
      get joueur() { return joueur; },
      get structures() { return structures; },
      structure(id) { return parId.get(id) || null; },
    };
    return api;
  }

  I.creerCommandes = creerCommandes;
  I.creerProjecteur = creerProjecteur;
  I.ordres = Object.freeze({ CRITERES, scinder, ordreContextuel, ordreVisee, ordreImmediat, ordreProduction, raisonProduction,
    typesProduits, estProducteur, borneSegment, coutBarricade, RAYON_CHOIX, HAUTEUR });
})(globalThis.PDR = globalThis.PDR || {});
