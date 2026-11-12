/* Point de rupture — le monde de la simulation (CONCEPTION.md §1.2 à §1.8 et §2). Ni window ni document.

   Déterminisme : l'état n'est fait que d'entiers (positions en millimètres, cohésion et ressources en millièmes),
   d'un aléa à graine (mulberry32) et des commandes appliquées dans l'ordre canonique (itération, joueur, numéro).
   Le pas n'appelle ni Math.sin, ni Math.cos, ni horloge ; Math.sqrt ne sert que sur des entiers. Une empreinte FNV-1a
   de 64 bits est relevée toutes les 100 itérations ; la partie s'enregistre et se relit.

   Échelle : 262 144 emplacements en tableaux par champ. Grille spatiale de 4 m triée par comptage à chaque itération ;
   champ de densité de 2 m tenu à jour quand une unité change de case (la foule s'écarte selon son gradient, à coût
   constant par unité) ; recherche de cible étalée (une itération sur huit, 32 voisins au plus).

   Version 0.3 (CONCEPTION.md §1.5 à §1.7) — tout reste borné, pour que le coût ne dépende pas de la violence :
   - le feu : 128 foyers au plus (cocktails Molotov, objets cassés, barricades, avant-postes), des disques ; deux
     grilles de 4 m disent à chaque unité, d'une lecture, le foyer et le nuage qui la concernent ; on fuit un foyer, on
     le contourne ; il se propage une fois, à l'objet voisin ; le jet du Canon à eau l'éteint ;
   - le gaz lacrymogène : 64 nuages au plus ; on y suffoque, on en sort au pas ;
   - les projectiles : pierres dans une file à durée de vol fixe (16 384 au plus), cocktails et grenades dans une
     liste de 256 vols ;
   - la violence : mises à terre (trois secondes, puis six sans retomber), charges, hors-jeu couchés six secondes
     (4 096 gisants au plus, les suivants 1,5 s) ;
   - la victoire : quatre modes (options.victoire), l'élimination par déroute (30 s sans base), l'occupation des
     avant-postes ; la part de la Convergence (options.manifestants).

   API (voir aussi l'en-tête de travailleur.js) :
     const m = PDR.monde.creer(ville, options)      options du protocole (joueur -1 : démo, trois IA, sans brouillard),
                                 plus { vide: true } (essais : aucune unité au départ) et { ia: [camps] } (camps tenus
                                 par l'IA ; par défaut tous sauf le joueur)
     m.soumettre(cmd, ia)        commande du protocole (positions en mètres) pour l'itération m.it ; ia : vrai si l'IA
     m.iterer()                  une itération de 50 ms
     m.etat(tampon, vitesse)     le message ETAT du protocole ; tampon : ArrayBuffer d'au moins m.n × 16 octets
     m.evenements()              évènements de la dernière itération (vue Float32Array, 6 nombres par évènement)
     m.carte                     CARTE du protocole, plus echelle, depart, popMax
     m.empreinte()               empreinte de l'état présent ; m.empreintes : [[it, hex], …] toutes les 100 itérations
     m.enregistrement()          { version, options, commandes: [{ it, j, n, ia, c }], empreintes }
     PDR.monde.relire(ville, enregistrement, iterations, creerIA)   rejoue une partie (creerIA null : sans IA)
     m.it, m.n, m.vainqueur, m.bilan(), m.res, m.score, m.structures … lecture pour l'IA et les essais
     m.ajouter(f, type, x, z)    (essais) place une unité, positions en mètres ; rend son emplacement */
(function (PDR) {
  'use strict';

  const R = PDR.regles, P = PDR.protocole, NAV = PDR.nav;
  const K = R.CONSTANTES, ET = R.ETATS, DR = R.DRAPEAUX, CMD = P.CMD, EV = P.EV, RAISON = P.RAISONS;
  const { DX, DZ, cap: CAP, BUT, AUCUN, RADIANS } = NAV;
  const IT_S = K.IT_PAR_S, CAPACITE = K.CAPACITE, LIBRE = R.LIBRE;
  const CONV = R.CONVERGENCE, BAST = R.BASTION, PREF = R.PREFECTURE;

  // ---- Ordres d'une unité. ----
  const O = Object.freeze({ AUCUN: 0, ALLER: 1, ATTAQUE_MVT: 2, ATTAQUER: 3, TENIR: 4, REPLI: 5, REGROUPER: 6, RECOLTER: 7,
    CASSER: 8, LEVER: 9, BARRICADER: 10, CONSTRUIRE: 11, CAPACITE: 12 });
  // Phases de la récolte.
  const PH = Object.freeze({ VERS: 0, ATTENTE: 1, RECOLTE: 2, RETOUR: 3 });
  // Drapeaux internes (umode) : repli automatique, cible cassable, jet en cours, gisant (hors jeu couché longtemps),
  // capacité seconde de l'ordre CAPACITE (la grenade lacrymogène de la Compagnie plutôt que sa salve).
  const M_REPLI_AUTO = 1, M_CASSABLE = 2, M_JET = 4, M_GISANT = 8, M_SECONDE = 16;
  // Sortes de structure.
  const S_QG = 0, S_POSTE = 1, S_BARRICADE = 2;
  const SORTES_S = ['qg', 'avant-poste', 'barricade'];

  const ARRIVEE = 350, DIRECT = 10000, DIRECT2 = DIRECT * DIRECT, FIN = NAV.FIN;
  const RECOLTE_IT = 5 * IT_S, TOUCHE_IT = 10;
  const HORS_JEU_IT = Math.round(K.HORS_JEU_S * IT_S), GISANT_IT = Math.round(K.GISANT_S * IT_S), GISANTS_MAX = K.GISANTS_MAX;
  const A_TERRE_IT = Math.round(K.A_TERRE_S * IT_S), IMMUNITE_IT = Math.round(K.A_TERRE_IMMUNITE_S * IT_S), LANCE_IT = 8;
  const CAUSE = P.CAUSES_A_TERRE, SF = P.SORTES_FEU;
  const PLUSIEURS = 255;              // feuCase, gazCase : plusieurs foyers (128 au plus) ou nuages (64) s'y chevauchent
  const RECHERCHE_OISIF2 = 7000 * 7000, RECHERCHE_MVT2 = 12000 * 12000, LAISSE2 = 14000 * 14000;
  const JET_IT = 60, JET_PAS = 4;
  const PORTEE_TRAVAIL = 2600, PORTEE_POSTE = 7000;
  const POSTE_MIN_ECART = 24000, POSTE_CASES = 2;          // un avant-poste couvre 2 × 2 cases de 4 m
  const POSTE_PARVIS = 14000;                               // rayon du terrain d'un avant-poste, pour son occupation
  const MUR = 0xFFFF;                                       // densité d'une case fine murée (le gradient l'ignore)
  const SEPARATION = 14, SEPARATION_MAX = 70, ETALEMENT = 12;
  const PROPOSITION_IT = 30 * IT_S;
  // Les huit voisins d'une case et le code de direction (cap / 2) qui y mène.
  const VI = Int8Array.of(1, -1, 0, 0, 1, -1, 1, -1), VJ = Int8Array.of(0, 0, 1, -1, 1, 1, -1, -1);
  const VCODE = Uint8Array.from(VI, (di, k) => NAV.cap(di, VJ[k]) >> 1);

  const carre = v => v * v;
  // Le rythme : toutes les pressions des tables (contact, salve, jet, pierres, charge, souffle) sont multipliées par
  // RYTHME ; le feu et le gaz, qui chassent plus qu'ils ne blessent, gardent leurs chiffres.
  const RYTHME = K.RYTHME, REPLI_PCT = Math.round(K.REPLI_SEUIL * 100);
  /** Tables entières par type d'unité, tirées de regles.TYPES. */
  const NT = R.TYPES.length;
  const T = {
    fac: new Uint8Array(NT), coh: new Int32Array(NT), pres: new Int32Array(NT), rayon: new Int32Array(NT), portee: new Int32Array(NT),
    v: new Int32Array(NT), vhc: new Int32Array(NT), r8: new Uint8Array(NT), pop: new Int32Array(NT), protege: new Uint8Array(NT),
    vehicule: new Uint8Array(NT), recolter: new Uint8Array(NT), construire: new Uint8Array(NT), barricader: new Uint8Array(NT),
    casser: new Uint8Array(NT), lever: new Uint8Array(NT), leverTout: new Uint8Array(NT), interpeller: new Uint8Array(NT),
    salve: new Uint8Array(NT), jet: new Uint8Array(NT), soigner: new Int32Array(NT), lot: new Int32Array(NT),
    coutM: new Int32Array(NT), coutX: new Int32Array(NT), duree: new Int32Array(NT), base: new Uint8Array(NT),
    // 0.3 : pierres (pi*), charge (ch*), cocktail, grenade. Distances en mm (et leurs carrés), durées en itérations,
    // pressions en millièmes de point.
    pierres: new Uint8Array(NT), piMin2: new Float64Array(NT), piMax2: new Float64Array(NT), piPres: new Int32Array(NT), piRech: new Int32Array(NT),
    charge: new Uint8Array(NT), chMin2: new Float64Array(NT), chMax2: new Float64Array(NT), chPres: new Int32Array(NT), chRech: new Int32Array(NT),
    chElan: new Int32Array(NT), chDuree: new Int32Array(NT), chRecul: new Int32Array(NT), chPerce: new Uint8Array(NT),
    molotov: new Uint8Array(NT), lacrymo: new Uint8Array(NT),
  };
  for (const t of R.TYPES) {
    const k = t.id, c = t.capacites;
    T.fac[k] = t.faction; T.coh[k] = t.coh * 1000; T.pres[k] = Math.round(t.pression * RYTHME * 1000 / IT_S);
    T.rayon[k] = Math.round(t.rayon * 1000); T.portee[k] = Math.round(t.portee * 1000);
    T.v[k] = Math.round(t.vitesse * 1000 / IT_S); T.vhc[k] = t.vitesseHorsChaussee ? Math.round(t.vitesseHorsChaussee * 1000 / IT_S) : 0;
    T.r8[k] = Math.ceil(t.vision / K.CELLULE_VOILE); T.pop[k] = t.pop; T.protege[k] = t.protege ? 1 : 0; T.vehicule[k] = t.vehicule ? 1 : 0;
    T.recolter[k] = c.recolter ? 1 : 0; T.construire[k] = c.construire ? 1 : 0; T.barricader[k] = c.barricader ? 1 : 0;
    T.casser[k] = c.casser; T.lever[k] = c.lever; T.leverTout[k] = c.leverTout ? 1 : 0; T.interpeller[k] = c.interpeller ? 1 : 0;
    T.salve[k] = c.salve ? 1 : 0; T.jet[k] = c.jet ? 1 : 0; T.soigner[k] = c.soigner * 1000;
    T.lot[k] = t.lot; T.coutM[k] = t.cout.moyens * 1000; T.coutX[k] = t.cout.materiaux * 1000; T.duree[k] = t.duree * IT_S;
    T.base[k] = t.base ? 1 : 0;
    if (c.pierres) {
      T.pierres[k] = 1; T.piMin2[k] = carre(c.pierres.porteeMin * 1000); T.piMax2[k] = carre(c.pierres.portee * 1000);
      T.piPres[k] = Math.round(c.pierres.pression * RYTHME * 1000); T.piRech[k] = Math.round(c.pierres.recharge * IT_S);
    }
    if (c.charge) {
      T.charge[k] = 1; T.chMin2[k] = carre(c.charge.porteeMin * 1000); T.chMax2[k] = carre(c.charge.portee * 1000);
      T.chPres[k] = Math.round(c.charge.pression * RYTHME * 1000); T.chRech[k] = Math.round(c.charge.recharge * IT_S);
      T.chElan[k] = Math.round(c.charge.elan * 16); T.chDuree[k] = Math.round(c.charge.duree * IT_S); T.chRecul[k] = Math.round(c.charge.recul * 1000);
      T.chPerce[k] = c.charge.perce ? 1 : 0;
    }
    T.molotov[k] = c.molotov ? 1 : 0; T.lacrymo[k] = c.lacrymo ? 1 : 0;
  }
  const SALVE = R.TYPES[10].capacites.salve, JET = R.TYPES[12].capacites.jet;
  const SALVE_PORTEE = SALVE.portee * 1000, SALVE_RAYON = SALVE.rayon * 1000, SALVE_COUPS = Math.round(SALVE.pression * RYTHME * 1000);
  const SALVE_ANNONCE_IT = Math.round(SALVE.annonce * IT_S), SALVE_RECHARGE_IT = Math.round(SALVE.recharge * IT_S);
  const SALVE_MAX = SALVE.max || 1e9;
  /** Cases de 4 m autour du point de chute, des plus proches aux plus lointaines : le plafond touche les plus près. */
  const ORDRE_SALVE = [];
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) ORDRE_SALVE.push([di * di + dj * dj, di, dj]);
  ORDRE_SALVE.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const JET_PORTEE = JET.portee * 1000, JET_COUPS = Math.round(JET.pression * RYTHME * 1000 * JET_PAS / IT_S);
  const JET_RECUL = Math.round(JET.recul * 1000 * JET_PAS / IT_S), JET_COS1000 = 940;   // cos 20° (demi-angle de 40°)
  const SALVE_A_TERRE = SALVE.aTerre || 0, JET_A_TERRE2 = carre((JET.aTerre || 0) * 1000);
  // ---- 0.3 : le cocktail Molotov (Furets), la grenade lacrymogène (Compagnie), le feu, le gaz, les projectiles. ----
  const MOLOTOV = R.TYPES.find(t => t.capacites.molotov).capacites.molotov, LACRYMO = R.TYPES.find(t => t.capacites.lacrymo).capacites.lacrymo;
  const MO_MIN2 = carre(MOLOTOV.porteeMin * 1000), MO_MAX = MOLOTOV.portee * 1000, MO_MAX2 = MO_MAX * MO_MAX, MO_RAYON = MOLOTOV.rayon * 1000;
  const MO_PRES = Math.round(MOLOTOV.pression * RYTHME * 1000), MO_MAXU = MOLOTOV.max, MO_A_TERRE = MOLOTOV.aTerre, MO_RECH = Math.round(MOLOTOV.recharge * IT_S);
  const MO_COUT = MOLOTOV.cout * 1000;
  const LA_MIN2 = carre(LACRYMO.porteeMin * 1000), LA_MAX = LACRYMO.portee * 1000, LA_MAX2 = LA_MAX * LA_MAX, LA_RECH = Math.round(LACRYMO.recharge * IT_S);
  const FEU = K.FEU, GAZ = K.GAZ, PJ = K.PROJECTILES;
  const NFEUX = FEU.max, FEU_RAYON = FEU.rayon * 1000, FEU_DUREE = FEU.duree * IT_S, FEU_PRES = Math.round(FEU.pression * 1000 / IT_S);
  const FEU_ALLUMAGE = Math.round(FEU.allumage * IT_S), FEU_MARGE = FEU.marge * 1000, FEU_EAU = Math.round(FEU.eau * IT_S);
  const FEU_PROPAGE_IT = FEU.propagation.delai * IT_S, FEU_PROPAGE_R2 = carre(FEU.propagation.rayon * 1000);
  const FEU_PROPAGE_CHANCE = Math.round(FEU.propagation.chance * 100), FEU_GENERATIONS = FEU.propagation.generations;
  const NNUAGES = GAZ.max, GAZ_RAYON = GAZ.rayon * 1000, GAZ_DUREE = GAZ.duree * IT_S, GAZ_PRES = Math.round(GAZ.pression * 1000 / IT_S);
  const GAZ_MONTEE = GAZ.montee * IT_S, GAZ_MARGE = GAZ.marge * 1000, GAZ_LENTEUR16 = Math.round(GAZ.lenteur * 16);
  const NVOLS = 256, NPIERRES = 16384, PIERRE_IT = Math.round(PJ.pierre.vol * IT_S);
  const EV_A_TERRE_MAX = 24, EV_PIERRE_MAX = 12;
  /** Durée de vol en itérations d'un cocktail ou d'une grenade lancés à d mm (regles.dureeVol, en entiers). */
  const volIt = (p, d) => Math.round(p.vol * IT_S) + Math.trunc(d * IT_S / (p.vitesse * 1000));

  // Composition de départ (après les 4 % d'Équipes), en millièmes, par camp et par type.
  const COMPOSITION = [
    [[1, 620], [2, 290], [3, 90]],
    [[5, 520], [6, 310], [7, 170]],
    [[9, 480], [10, 345], [11, 172], [12, 3]],
  ];

  /** FNV-1a 64 bits sur des octets [debut, fin[, en quatre membres de 16 bits (h[0] le plus bas) : tout reste en
   *  petits entiers. Premier de FNV : 2^40 + 435 ; h × premier = h × 435 + (h << 40). */
  function fnvOctets(h, octets, debut = 0, fin = octets.length) {
    let h0 = h[0], h1 = h[1], h2 = h[2], h3 = h[3];
    for (let i = debut; i < fin; i++) {
      h0 ^= octets[i];
      const t0 = h0 * 435, t1 = h1 * 435 + (t0 >>> 16), t2 = h2 * 435 + (t1 >>> 16) + ((h0 & 255) << 8);
      const t3 = h3 * 435 + (t2 >>> 16) + (h0 >>> 8) + ((h1 & 255) << 8);
      h0 = t0 & 0xFFFF; h1 = t1 & 0xFFFF; h2 = t2 & 0xFFFF; h3 = t3 & 0xFFFF;
    }
    h[0] = h0; h[1] = h1; h[2] = h2; h[3] = h3;
  }
  const fnvDepart = () => Int32Array.of(0x2325, 0x8422, 0x9ce4, 0xcbf2);
  const hex4 = v => v.toString(16).padStart(4, '0');
  const fnvHex = h => hex4(h[3]) + hex4(h[2]) + hex4(h[1]) + hex4(h[0]);
  /** Empreinte FNV-1a 64 d'une chaîne (octets UTF-16 bas seulement : pour les essais, comparée à noyau.js en ASCII). */
  const fnvTexte = s => { const h = fnvDepart(); fnvOctets(h, Uint8Array.from(s, c => c.charCodeAt(0) & 255)); return fnvHex(h); };

  function normaliser(o = {}) {
    const entier = (v, d) => (Number.isFinite(v) ? Math.trunc(v) : d);
    const alliance = Array.isArray(o.alliance) && o.alliance.length === 2 && o.alliance[0] !== o.alliance[1]
      && [0, 1, 2].includes(o.alliance[0]) && [0, 1, 2].includes(o.alliance[1]) ? [o.alliance[0], o.alliance[1]] : null;
    const joueur = [0, 1, 2].includes(o.joueur) ? o.joueur : -1;
    return {
      graine: entier(o.graine, 1) >>> 0, effectifs: Math.max(0, Math.min(CAPACITE, entier(o.effectifs, K.EFFECTIFS_DEFAUT))),
      joueur, alliance, difficulte: [0, 1, 2].includes(o.difficulte) ? o.difficulte : 1,
      // Démo (joueur -1) : pas de brouillard, quoi que disent les options.
      brouillard: joueur >= 0 && o.brouillard !== false, coalitions: !!o.coalitions, enregistrer: o.enregistrer !== false, vide: !!o.vide,
      ia: Array.isArray(o.ia) ? o.ia.slice() : null,
      // Démo : ni points ni temps, le dernier debout ou la limite de sécurité (CONCEPTION.md §1.11) ; points et durée à
      // 0 disent qu'il n'y a ni cible ni limite de temps, comme dans etat.victoire.
      victoire: joueur < 0 ? { mode: 'dernier', points: 0, duree: 0 } : R.victoire(o.victoire), manifestants: R.manifestants(o.manifestants),
    };
  }

  function creer(ville, options) {
    const opt = normaliser(options);
    const E = opt.effectifs, DEMO = opt.joueur < 0, PARTS = R.parts(opt.manifestants);
    const echelle = Math.max(1, Math.round(E / 20000));
    const nav = NAV.creer(ville);
    const { X0, Z0, nx, nz, n: NC, nx2, nz2, n2: NF, masque2, bloque, libre } = nav;
    const nx8 = Math.ceil(nx / 2), nz8 = Math.ceil(nz / 2), N8 = nx8 * nz8;

    // ---- Aléa à graine (mulberry32), entiers seulement. ----
    let alea = (opt.graine ^ 0x9E3779B9) >>> 0;
    const tirer = () => {
      alea = (alea + 0x6D2B79F5) >>> 0;
      let t = alea;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };

    // ---- Unités : un tableau par champ. ----
    const ux = new Int32Array(CAPACITE), uz = new Int32Array(CAPACITE);
    const ufac = new Uint8Array(CAPACITE).fill(LIBRE), utyp = new Uint8Array(CAPACITE), ucoh = new Int32Array(CAPACITE);
    const ucap = new Uint8Array(CAPACITE), uetat = new Uint8Array(CAPACITE), uord = new Uint8Array(CAPACITE);
    const uphase = new Uint8Array(CAPACITE), umode = new Uint8Array(CAPACITE), uchamp = new Int16Array(CAPACITE).fill(-1);
    const ubx = new Int32Array(CAPACITE), ubz = new Int32Array(CAPACITE), ucib = new Int32Array(CAPACITE).fill(-1);
    const ucibg = new Uint16Array(CAPACITE), ugen = new Uint16Array(CAPACITE), uminu = new Int16Array(CAPACITE);
    const ucharge = new Uint8Array(CAPACITE), urech = new Uint16Array(CAPACITE), usal = new Uint8Array(CAPACITE);
    const usx = new Int32Array(CAPACITE), usz = new Int32Array(CAPACITE), utouche = new Uint8Array(CAPACITE);
    const uagr = new Int32Array(CAPACITE).fill(-1), udeg = new Int32Array(CAPACITE), ubloc = new Uint8Array(CAPACITE);
    const uc2 = new Int32Array(CAPACITE), uc4 = new Int32Array(CAPACITE), uc8 = new Int32Array(CAPACITE);
    // 0.3 : à terre (itérations restantes), immunité après s'être relevée, geste du lancer, élan d'une charge,
    // recharge de la capacité seconde (la grenade de la Compagnie).
    const uterre = new Uint8Array(CAPACITE), uimm = new Uint8Array(CAPACITE), ulance = new Uint8Array(CAPACITE);
    const uassaut = new Uint8Array(CAPACITE), urech2 = new Uint16Array(CAPACITE);
    let nGisants = 0, nATerre = 0;
    const libres = new Int32Array(CAPACITE);
    let nLibres = 0, nHaut = 0;
    const touches = new Int32Array(CAPACITE);
    let nTouches = 0;

    // ---- Grilles : densité fine, présence de 8 m par camp, index spatial de 4 m, soins, zones de base. ----
    const dens = new Uint16Array(NF);
    for (let f = 0; f < NF; f++) if (!masque2[f]) dens[f] = MUR;
    const pres = new Uint16Array(3 * N8);
    const debutCase = new Int32Array(NC + 1), ecrit = new Int32Array(NC + 1), tri = new Int32Array(CAPACITE);
    const soin = new Uint8Array(NC);             // bit f : une Fanfare du camp f soigne ici
    const soin8 = new Uint8Array(Math.ceil(nx / 2) * Math.ceil(nz / 2)), soins = new Int32Array(128);
    let nSoins = 0;
    const zoneBase = new Uint8Array(NC);         // bit f : QG ou avant-poste du camp f (dépôt et soutien)
    const hostile = new Uint8Array(16);          // hostile[a × 4 + b] : a frappe b
    const c8DeC4 = new Int32Array(NC);
    for (let c = 0; c < NC; c++) c8DeC4[c] = ((c % nx) >> 1) + (((c / nx) | 0) >> 1) * nx8;

    // Sorties périodiques : voile 8 m, minicarte 128, combats 64 ; zones d'alerte 8 × 8.
    const voile = new Uint8Array(N8), vision = new Uint8Array(N8);
    const etendueM = ville.etendue, coteVille = Math.max(etendueM.x1 - etendueM.x0, etendueM.z1 - etendueM.z0);
    const MINI = K.MINICARTE, COMB = K.GRILLE_COMBATS;
    const miniCote = Math.ceil(coteVille * 1000 / MINI), miniX0 = Math.round((etendueM.x0 + etendueM.x1) * 500 - miniCote * MINI / 2);
    const miniZ0 = Math.round((etendueM.z0 + etendueM.z1) * 500 - miniCote * MINI / 2);
    const combCote = miniCote * (MINI / COMB);
    const combats = new Uint16Array(COMB * COMB);
    const zoneDeC8 = new Uint8Array(N8);
    for (let c = 0; c < N8; c++) zoneDeC8[c] = Math.min(7, ((c % nx8) * 8 / nx8) | 0) + 8 * Math.min(7, (((c / nx8) | 0) * 8 / nz8) | 0);
    const combDeC8 = new Int32Array(N8);
    for (let c = 0; c < N8; c++) {
      const x = X0 + (c % nx8) * 8000 + 4000, z = Z0 + ((c / nx8) | 0) * 8000 + 4000;
      const i = Math.max(0, Math.min(COMB - 1, Math.trunc((x - miniX0) / combCote))), j = Math.max(0, Math.min(COMB - 1, Math.trunc((z - miniZ0) / combCote)));
      combDeC8[c] = i + j * COMB;
    }
    const derniereAlerte = new Int32Array(3 * 64).fill(-100000);

    // ---- Économie, structures, lieux, gisements, cassables. ----
    const res = new Float64Array(6);             // millièmes : [moyens, matériaux] × 3
    const acc = new Float64Array(3);             // restes des revenus à la minute (lieux, dotation)
    const score = new Int32Array(3), pop = new Int32Array(3), vivantes = new Int32Array(3), popMax = new Int32Array(3);
    const depart = new Int32Array(3), elimine = new Uint8Array(3), oisifs = new Int32Array(3);
    const revenus = new Float64Array(3 * 2 * 60);    // fenêtre de 60 s des revenus (millièmes), par camp et ressource
    const revenuSeconde = new Float64Array(6);
    const facteurRevenu = new Int32Array(3).fill(5);  // revenus × facteur / 5 ; l'IA facile 4, difficile 6
    const estIA = [0, 1, 2].map(f => (opt.ia ? opt.ia.includes(f) : f !== opt.joueur));
    for (let f = 0; f < 3; f++) if (estIA[f]) facteurRevenu[f] = [4, 5, 6][opt.difficulte];
    // En démo, les renforts ne tarissent pas : tous les revenus sont multipliés (§1.11).
    if (DEMO) for (let f = 0; f < 3; f++) facteurRevenu[f] *= K.DEMO_RENFORTS;
    const bilan = [0, 1, 2].map(() => ({ produites: 0, horsJeu: 0, infliges: 0, barricadesPosees: 0, barricadesLevees: 0,
      casses: 0, lieuxPris: 0, recolte: 0, molotovs: 0, grenades: 0, pierres: 0, charges: 0, aTerre: 0, feux: 0, eteints: 0 }));
    // D'où viennent les coups de chaque camp (millièmes) : contact, salve, jet, pierres, charge, souffle, feu, gaz.
    const sources = new Float64Array(3 * 8);
    for (let f = 0; f < 3; f++) {
      depart[f] = Math.trunc(E * PARTS[f] / 100);
      popMax[f] = Math.trunc(E * PARTS[f] * 125 / 10000);
      res[f * 2] = K.RESSOURCES_DEPART[f].moyens * 1000 * echelle;
      res[f * 2 + 1] = K.RESSOURCES_DEPART[f].materiaux * 1000 * echelle;
    }
    depart[0] += E - depart[0] - depart[1] - depart[2];

    const sites = ville.sites;
    const mm = v => Math.round(v * 1000);
    const disqueCases8 = (x, z, rayon) => {
      const liste = [];
      for (let c = 0; c < N8; c++) {
        const cx = X0 + (c % nx8) * 8000 + 4000, cz = Z0 + ((c / nx8) | 0) * 8000 + 4000;
        if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= rayon * rayon) liste.push(c);
      }
      return Int32Array.from(liste);
    };
    const lieux = sites.lieux.map(l => ({ x: mm(l.x), z: mm(l.z), rayon: mm(l.rayon), cases: disqueCases8(mm(l.x), mm(l.z), mm(l.rayon)) }));
    const NL = lieux.length;
    const lieuProp = new Int8Array(NL).fill(-1), lieuPreneur = new Int8Array(NL).fill(-1), lieuProgres = new Int32Array(NL);
    const lieuConteste = new Uint8Array(NL);
    const PRISE_IT = K.PRISE_LIEU_S * IT_S;
    const tampon2048 = new Int32Array(2048);
    const gis = sites.gisements.map(g => {
      const x = mm(g.x), z = mm(g.z), k = nav.remplir(x, z, 48, tampon2048);
      const places = Int32Array.from(tampon2048.subarray(0, k));
      return { x, z, rayon: mm(g.rayon), moyens: g.sorte === 'moyens', places, cle: nav.cleDe(x, z) };
    });
    const NG = gis.length;
    const stock = new Int32Array(NG), actifs = new Int32Array(NG);
    sites.gisements.forEach((g, k) => { stock[k] = g.stock * echelle; });
    const NK = sites.cassables.length;
    const casX = new Int32Array(NK), casZ = new Int32Array(NK), casPv = new Int32Array(NK), casEtat = new Uint8Array(NK);
    const casRend = new Int32Array(NK), casSorte = new Int8Array(NK), casAppro = new Int32Array(NK);
    // Le feu de chaque objet (durée en itérations, rayon en mm) : le sien s'il en porte un, sinon celui de sa sorte,
    // sinon celui de ses points de structure (regles.feuObjet) ; une ville peut ajouter des sortes inconnues.
    const casFeuDuree = new Int32Array(NK), casFeuRayon = new Int32Array(NK);
    sites.cassables.forEach((c, k) => {
      casX[k] = mm(c.x); casZ[k] = mm(c.z); casPv[k] = c.pv * 1000; casRend[k] = c.rendement * 1000 * echelle;
      casSorte[k] = P.SORTES_CASSABLES.indexOf(c.sorte);
      casAppro[k] = nav.fineProche(casX[k], casZ[k], 6);
      const feu = R.feuObjet(c.pv, c.feu, c.sorte);
      casFeuDuree[k] = Math.round(feu.duree * IT_S); casFeuRayon[k] = Math.round(feu.rayon * 1000);
    });
    // Les cassables par case de 8 m, pour enchaîner la casse sur l'objet voisin.
    const casDebut = new Int32Array(N8 + 1), casListe = new Int32Array(NK);
    {
      const c8 = k => { const f = nav.fineDe(casX[k], casZ[k]); return ((f % nx2) >> 2) + (((f / nx2) | 0) >> 2) * nx8; };
      for (let k = 0; k < NK; k++) casDebut[c8(k) + 1]++;
      for (let c = 0; c < N8; c++) casDebut[c + 1] += casDebut[c];
      const pos = casDebut.slice();
      for (let k = 0; k < NK; k++) casListe[pos[c8(k)]++] = k;
    }
    let versionCassables = 0, cassablesEnvoyes = -1;

    // Structures : 0, 1, 2 les QG, puis croissant. pv en millièmes.
    const structures = [];
    let versionStructures = 0, structuresEnvoyees = -1, structuresDetail = 0, detailEnvoye = 0;
    const casesTampon = new Int32Array(64);
    for (let f = 0; f < 3; f++) {
      const q = sites.qg[f];
      structures.push({ id: f, sorte: S_QG, faction: f, x: mm(q.x), z: mm(q.z), x2: mm(q.x), z2: mm(q.z), pv: 1, pvMax: 1,
        chantier: false, travail: 0, travailMax: 0, feu: false, feux: 0, feuCamp: -1, occupation: 0, reprise: 0, occupe: false, file: [],
        ralliement: null, sortieX: mm(q.sortie[0]), sortieZ: mm(q.sortie[1]), rayon: mm(q.rayon), cases: null, vivante: true,
        parvis: disqueCases8(mm(q.x), mm(q.z), mm(q.rayon)), coutM: 0, coutX: 0 });
    }
    // Victoire (options.victoire) : cible de points, limite de temps, limite de sécurité, en itérations ; 0 : aucune.
    const VIC = opt.victoire;
    const ciblePoints = !DEMO && (VIC.mode === 'points' || VIC.mode === 'mixte') ? VIC.points : 0;
    const limiteTemps = !DEMO && (VIC.mode === 'temps' || VIC.mode === 'mixte') ? VIC.duree * 60 * IT_S : 0;
    const plafondIt = limiteTemps ? 0 : (DEMO ? K.VICTOIRE.DEMO_PLAFOND_S : K.VICTOIRE.PLAFOND_S) * IT_S;
    const DEROUTE_IT = K.DEROUTE_S * IT_S;
    const sansBase = new Int32Array(3);         // itérations passées sans base (0 : le camp en a une)
    let raison = 0;                              // indice dans P.RAISONS_FIN
    let alliance = opt.alliance, proposition = null, delaiAlliance = 0, colere = 0, derniereColere = -1000;
    let vainqueur = P.VAINQUEUR.EN_COURS;
    let it = 0;

    // ---- Évènements de l'itération. ----
    let ev = new Float32Array(6 * 512), nev = 0;
    const evenement = (type, x, z, f, a, b) => {
      if ((nev + 1) * 6 > ev.length) { const plus = new Float32Array(ev.length * 2); plus.set(ev); ev = plus; }
      const o = nev * 6;
      ev[o] = type; ev[o + 1] = x / 1000; ev[o + 2] = z / 1000; ev[o + 3] = f; ev[o + 4] = a; ev[o + 5] = b;
      nev++;
    };
    const refus = (j, raison, t) => evenement(EV.REFUS, 0, 0, j, raison, t);

    const majHostilite = () => {
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) hostile[a * 4 + b] = R.hostile(a, b, alliance, colere) ? 1 : 0;
    };
    majHostilite();
    const adversaires = (a, b) => a !== b && a < 3 && b < 3 && !R.allies(a, b, alliance);

    // ---- Emplacements. ----
    function allouer() {
      if (nLibres > 0) return libres[--nLibres];
      if (nHaut >= CAPACITE) return -1;
      return nHaut++;
    }
    function placerCases(i) {
      const f = nav.fineDe(ux[i], uz[i]), i2 = f % nx2, j2 = (f / nx2) | 0;
      uc2[i] = f; uc4[i] = (i2 >> 1) + (j2 >> 1) * nx; uc8[i] = (i2 >> 2) + (j2 >> 2) * nx8;
      if (dens[f] !== MUR) dens[f]++;
      pres[ufac[i] * N8 + uc8[i]]++;
    }
    /** Crée une unité (f, t) en (x, z) mm ; rend son emplacement ou -1. */
    function creerUnite(f, t, x, z, capInitial) {
      const i = allouer();
      if (i < 0) return -1;
      ux[i] = x; uz[i] = z; ufac[i] = f; utyp[i] = t; ucoh[i] = T.coh[t]; ucap[i] = capInitial & 255;
      uetat[i] = ET.OISIF; uord[i] = O.AUCUN; uphase[i] = 0; umode[i] = 0; uchamp[i] = -1; ubx[i] = x; ubz[i] = z;
      ucib[i] = -1; ugen[i] = (ugen[i] + 1) & 0xFFFF; uminu[i] = 0; ucharge[i] = 0; urech[i] = 0; usal[i] = 0;
      utouche[i] = 0; uagr[i] = -1; udeg[i] = 0; ubloc[i] = 0;
      uterre[i] = 0; uimm[i] = 0; ulance[i] = 0; uassaut[i] = 0; urech2[i] = 0;
      placerCases(i);
      pop[f] += T.pop[t]; vivantes[f]++;
      return i;
    }
    /** Rend un emplacement. Le plus haut fait baisser n ; les autres vont sur la pile (tous restent sous n). */
    function liberer(i) {
      ufac[i] = LIBRE; uetat[i] = 0;
      if (i === nHaut - 1) nHaut--; else libres[nLibres++] = i;
    }

    // ---- Ordres : on quitte proprement l'ancien avant d'en donner un nouveau. ----
    function quitterOrdre(i) {
      if (uord[i] === O.RECOLTER && uphase[i] === PH.RECOLTE) actifs[ucib[i]]--;
      if (uchamp[i] >= 0) { nav.lacher(uchamp[i]); uchamp[i] = -1; }
      // La salve annoncée ou le jet en cours (usal) survivent à un nouvel ordre : l'annonce est déjà partie.
      uord[i] = O.AUCUN; ucib[i] = -1; uphase[i] = 0; umode[i] &= ~(M_REPLI_AUTO | M_CASSABLE | M_SECONDE); ubloc[i] = 0;
      uassaut[i] = 0;
    }
    function viser(i, cle) {
      if (uchamp[i] >= 0) nav.lacher(uchamp[i]);
      const k = nav.demander(cle, it);
      nav.prendre(k);
      uchamp[i] = k;
    }
    const cleBase = f => NC + f;          // champ vers les zones de base d'un camp
    nav.sourcesSpeciales((cle, sortie) => {
      const f = cle - NC, bit = 1 << f;
      let k = 0;
      for (let c = 0; c < NC; c++) if ((zoneBase[c] & bit) && libre[c]) sortie[k++] = c;
      return k;
    });
    function majZonesBase() {
      zoneBase.fill(0);
      for (const s of structures) {
        if (!s.vivante || s.sorte === S_BARRICADE || s.chantier || (s.sorte === S_POSTE && s.occupe)) continue;
        const rayon = s.sorte === S_QG ? s.rayon : 10000, bit = 1 << s.faction;
        const c0 = nav.caseDe(s.x, s.z), ci = c0 % nx, cj = (c0 / nx) | 0, rc = Math.ceil(rayon / 4000) + 1;
        for (let j = Math.max(0, cj - rc); j <= Math.min(nz - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(nx - 1, ci + rc); i++) {
          const c = i + j * nx, dx = nav.centreX(c) - s.x, dz = nav.centreZ(c) - s.z;
          if (dx * dx + dz * dz <= rayon * rayon) zoneBase[c] |= bit;
        }
      }
      nav.perimerSpeciaux();
    }
    majZonesBase();

    // ---- Formation : des places sur la grille fine autour du point, les unités les plus proches d'abord. ----
    let fines = new Int32Array(4096), ordre = new Int32Array(4096);
    const ordreCle = new Float64Array(CAPACITE);
    function former(ids, nombre, x, z, parCase) {
      const besoin = Math.ceil(nombre / parCase);
      if (fines.length < besoin) fines = new Int32Array(besoin * 2);
      const k = nav.remplir(x, z, besoin, fines);
      if (ordre.length < nombre) ordre = new Int32Array(nombre * 2);
      for (let q = 0; q < nombre; q++) {
        const i = ids[q], dx = ux[i] - x, dz = uz[i] - z;
        ordre[q] = i; ordreCle[i] = dx * dx + dz * dz;
      }
      const vue = ordre.subarray(0, nombre);
      vue.sort((a, b) => (ordreCle[a] - ordreCle[b]) || (a - b));
      for (let q = 0; q < nombre; q++) {
        const i = vue[q];
        if (k === 0) { ubx[i] = x; ubz[i] = z; continue; }
        const f = fines[Math.min(k - 1, (q / parCase) | 0)], r = q % parCase;
        ubx[i] = nav.fineX(f) + (r === 0 ? -450 : r === 1 ? 450 : 0);
        ubz[i] = nav.fineZ(f) + (r === 0 ? -450 : r === 1 ? 450 : 0);
      }
    }

    // ---- Validation des identifiants d'une commande : les unités vivantes du camp j. ----
    let idsTampon = new Int32Array(4096);
    function filtrer(c, j, accepter) {
      const ids = c.ids;
      if (idsTampon.length < ids.length) idsTampon = new Int32Array(ids.length);
      let k = 0;
      for (let q = 0; q < ids.length; q++) {
        const i = ids[q];
        if (i < 0 || i >= nHaut || ufac[i] !== j || uetat[i] === ET.HORS_JEU) continue;
        if (accepter && !accepter(utyp[i])) continue;
        idsTampon[k++] = i;
      }
      return k;
    }
    const structureVivante = id => (id >= 0 && id < structures.length && structures[id].vivante ? structures[id] : null);
    const vueStructure = s => ({ sorte: SORTES_S[s.sorte], faction: s.faction });

    // ---- Les commandes, dans l'ordre canonique. ----
    const attente = [];                        // { it, j, n, ia, c }
    const journal = [];
    const sequence = new Int32Array(3);
    let enregistrer = opt.enregistrer;

    /** Quantifie une commande du protocole (positions en mètres → mm, ids recopiés) ; rend null si elle est mal formée. */
    function quantifier(c) {
      if (P.forme(c) !== '') return null;
      const q = { t: c.t, j: c.j };
      if (c.ids) q.ids = Int32Array.from(c.ids);
      for (const k of ['x', 'z', 'x2', 'z2']) if (typeof c[k] === 'number' && Number.isFinite(c[k])) q[k] = Math.round(c[k] * 1000);
      for (const k of ['mode', 'cible', 'gisement', 'producteur', 'type', 'n', 'rang', 'avec']) if (typeof c[k] === 'number' && Number.isFinite(c[k])) q[k] = Math.trunc(c[k]);
      for (const k of ['sorte', 'action', 'capacite']) if (typeof c[k] === 'string') q[k] = c[k];
      return q;
    }
    function soumettre(c, ia = false) {
      const q = quantifier(c);
      if (!q) return false;
      const e = { it, j: q.j, n: sequence[q.j]++, ia: !!ia, c: q };
      attente.push(e);
      return true;
    }
    /** Relecture : une commande déjà quantifiée, à son itération et à son numéro d'origine. */
    function injecter(e) {
      attente.push({ it: e.it, j: e.j, n: e.n, ia: !!e.ia, c: e.c });
      if (e.n >= sequence[e.j]) sequence[e.j] = e.n + 1;
    }
    function appliquerCommandes() {
      if (!attente.length) return;
      const maintenant = [], plusTard = [];
      for (const e of attente) (e.it <= it ? maintenant : plusTard).push(e);
      if (!maintenant.length) return;
      attente.length = 0;
      for (const e of plusTard) attente.push(e);
      maintenant.sort((a, b) => (a.it - b.it) || (a.j - b.j) || (a.n - b.n));
      for (const e of maintenant) {
        if (enregistrer) journal.push({ it, j: e.j, n: e.n, ia: e.ia, c: e.c });
        if (elimine[e.j] || vainqueur !== P.VAINQUEUR.EN_COURS) continue;
        appliquer(e.c);
      }
    }

    function appliquer(c) {
      const j = c.j;
      switch (c.t) {
        case CMD.DEPLACER: case CMD.REGROUPER: {
          const k = filtrer(c, j);
          if (!k) return;
          const regrouper = c.t === CMD.REGROUPER, cle = nav.cleDe(c.x, c.z);
          const ids = idsTampon.slice(0, k);
          for (let q = 0; q < k; q++) {
            const i = ids[q];
            quitterOrdre(i);
            uord[i] = regrouper ? O.REGROUPER : c.mode === 1 ? O.ATTAQUE_MVT : O.ALLER;
            uetat[i] = ET.MARCHE;
            viser(i, cle);
          }
          former(ids, k, c.x, c.z, regrouper ? 3 : 2);
          return;
        }
        case CMD.ATTAQUER: {
          const k = filtrer(c, j), t = c.cible;
          if (!k) return;
          if (!(t >= 0 && t < nHaut && ufac[t] !== LIBRE && uetat[t] !== ET.HORS_JEU) || !R.hostile(j, ufac[t], alliance, colere)) {
            refus(j, RAISON.INTERDIT, c.t); return;
          }
          const cle = nav.cleDe(ux[t], uz[t]), ids = idsTampon.slice(0, k);
          for (let q = 0; q < k; q++) {
            const i = ids[q];
            quitterOrdre(i);
            uord[i] = O.ATTAQUER; uetat[i] = ET.MARCHE;
            ucib[i] = t; ucibg[i] = ugen[t];
            viser(i, cle);
          }
          former(ids, k, ux[t], uz[t], 2);
          return;
        }
        case CMD.ARRETER: case CMD.TENIR: {
          const k = filtrer(c, j);
          for (let q = 0; q < k; q++) {
            const i = idsTampon[q];
            quitterOrdre(i);
            uord[i] = c.t === CMD.TENIR ? O.TENIR : O.AUCUN;
            uetat[i] = c.t === CMD.TENIR ? ET.TIENT : ET.OISIF;
            ubx[i] = ux[i]; ubz[i] = uz[i];
          }
          return;
        }
        case CMD.REPLIER: {
          const k = filtrer(c, j);
          for (let q = 0; q < k; q++) commencerRepli(idsTampon[q], false);
          return;
        }
        case CMD.RECOLTER: {
          const g = c.gisement;
          if (!(g >= 0 && g < NG)) { refus(j, RAISON.EMPLACEMENT, c.t); return; }
          const k = filtrer(c, j, t => T.recolter[t] === 1);
          if (!k) { refus(j, RAISON.INTERDIT, c.t); return; }
          for (let q = 0; q < k; q++) envoyerRecolter(idsTampon[q], g);
          return;
        }
        case CMD.CASSER: {
          if (!R.peutCasser(j)) { refus(j, RAISON.INTERDIT, c.t); return; }
          const k = filtrer(c, j, t => T.casser[t] > 0);
          if (!k) { refus(j, RAISON.INTERDIT, c.t); return; }
          if (c.sorte === 'structure') {
            const s = structureVivante(c.cible);
            if (!s || !R.peutCasserStructure(j, vueStructure(s), alliance)) { refus(j, RAISON.INTERDIT, c.t); return; }
            for (let q = 0; q < k; q++) envoyerTravail(idsTampon[q], O.CASSER, s.id, false);
          } else {
            const b = c.cible;
            if (!(b >= 0 && b < NK) || casEtat[b]) { refus(j, RAISON.EMPLACEMENT, c.t); return; }
            for (let q = 0; q < k; q++) envoyerTravail(idsTampon[q], O.CASSER, b, true);
          }
          return;
        }
        case CMD.LEVER: {
          const s = structureVivante(c.cible);
          if (!s || !R.peutLever(j, vueStructure(s), alliance)) { refus(j, RAISON.INTERDIT, c.t); return; }
          const k = filtrer(c, j, t => T.lever[t] > 0 && (s.sorte !== S_POSTE || T.leverTout[t] === 1));
          if (!k) { refus(j, RAISON.INTERDIT, c.t); return; }
          for (let q = 0; q < k; q++) envoyerTravail(idsTampon[q], O.LEVER, s.id, false);
          return;
        }
        case CMD.BARRICADER: {
          if (!R.peutBarricader(j)) { refus(j, RAISON.INTERDIT, c.t); return; }
          const k = filtrer(c, j, t => T.barricader[t] === 1);
          if (!k) { refus(j, RAISON.INTERDIT, c.t); return; }
          const s = poserBarricade(j, c.x, c.z, c.x2, c.z2, c.t);
          if (!s) return;
          for (let q = 0; q < k; q++) envoyerTravail(idsTampon[q], O.BARRICADER, s.id, false);
          return;
        }
        case CMD.CONSTRUIRE: {
          const k = filtrer(c, j, t => T.construire[t] === 1);
          if (!k) { refus(j, RAISON.INTERDIT, c.t); return; }
          const s = poserPoste(j, c.x, c.z, c.t);
          if (!s) return;
          for (let q = 0; q < k; q++) envoyerTravail(idsTampon[q], O.CONSTRUIRE, s.id, false);
          return;
        }
        case CMD.PRODUIRE: {
          const s = structureVivante(c.producteur), t = c.type, nLots = Math.max(1, Math.min(K.FILE_MAX, c.n || 1));
          if (!s || s.faction !== j || s.sorte === S_BARRICADE || s.chantier || !(t >= 0 && t < NT) || T.fac[t] !== j
            || (s.sorte === S_POSTE && !(R.OUVRIER[j] === t || R.BASE[j] === t))) { refus(j, RAISON.INTERDIT, c.t); return; }
          for (let q = 0; q < nLots; q++) {
            if (s.file.length >= K.FILE_MAX) { refus(j, RAISON.FILE_PLEINE, c.t); return; }
            const lot = T.lot[t] * echelle, cm = T.coutM[t] * echelle, cx = T.coutX[t] * echelle;
            if (pop[j] + popEnFile(j) + lot * T.pop[t] > popMax[j]) { refus(j, RAISON.PLAFOND, c.t); return; }
            if (res[j * 2] < cm || res[j * 2 + 1] < cx) { refus(j, RAISON.RESSOURCES, c.t); return; }
            res[j * 2] -= cm; res[j * 2 + 1] -= cx;
            s.file.push({ type: t, lot, reste: T.duree[t], total: T.duree[t], coutM: cm, coutX: cx });
            versionStructures++;
          }
          return;
        }
        case CMD.ANNULER: {
          const s = structureVivante(c.producteur);
          if (!s || s.faction !== j || !(c.rang >= 0 && c.rang < s.file.length)) return;
          const [o] = s.file.splice(c.rang, 1);
          res[j * 2] += o.coutM; res[j * 2 + 1] += o.coutX;
          versionStructures++;
          return;
        }
        case CMD.RALLIEMENT: {
          const s = structureVivante(c.producteur);
          if (!s || s.faction !== j || s.sorte === S_BARRICADE) return;
          s.ralliement = [c.x, c.z];
          versionStructures++;
          return;
        }
        case CMD.DIPLOMATIE: diplomatie(j, c.action, c.avec); return;
        case CMD.CAPACITE: case CMD.MOLOTOV: {
          // Salve et grenade (Compagnie), jet (Canon à eau), cocktail (Furets) : l'unité s'approche à portée du point,
          // puis agit. Le cocktail coûte des Matériaux : sans de quoi en lancer un seul, l'ordre est refusé.
          const cap = c.t === CMD.MOLOTOV ? 'molotov' : c.capacite, salve = cap === 'salve';
          const table = salve ? T.salve : cap === 'jet' ? T.jet : cap === 'lacrymo' ? T.lacrymo : cap === 'molotov' ? T.molotov : null;
          if (!table) return;
          const k = filtrer(c, j, t => table[t] === 1);
          if (!k) { refus(j, RAISON.INTERDIT, c.t); return; }
          if (cap === 'molotov' && res[j * 2 + 1] < MO_COUT) { refus(j, RAISON.RESSOURCES, c.t); return; }
          const cle = nav.cleDe(c.x, c.z);
          for (let q = 0; q < k; q++) {
            const i = idsTampon[q];
            if (salve && urech[i] > 0) continue;
            quitterOrdre(i);
            uord[i] = O.CAPACITE; usx[i] = c.x; usz[i] = c.z; ubx[i] = c.x; ubz[i] = c.z;
            if (cap === 'lacrymo') umode[i] |= M_SECONDE;
            uetat[i] = ET.MARCHE;
            viser(i, cle);
          }
          return;
        }
        default:
      }
    }

    function popEnFile(f) {
      let p = 0;
      for (const s of structures) if (s.vivante && s.faction === f) for (const o of s.file) p += o.lot * T.pop[o.type];
      return p;
    }

    function commencerRepli(i, auto) {
      quitterOrdre(i);
      uord[i] = O.REPLI; uetat[i] = ET.REPLI;
      if (auto) umode[i] |= M_REPLI_AUTO;
      const q = structures[ufac[i]];
      ubx[i] = q.sortieX; ubz[i] = q.sortieZ;
      viser(i, cleBase(ufac[i]));
    }
    function envoyerRecolter(i, g) {
      quitterOrdre(i);
      uord[i] = O.RECOLTER; uphase[i] = PH.VERS; ucib[i] = g; uetat[i] = ET.MARCHE;
      const pl = gis[g].places;
      if (pl.length) { const f = pl[(i * 7) % pl.length]; ubx[i] = nav.fineX(f); ubz[i] = nav.fineZ(f); } else { ubx[i] = gis[g].x; ubz[i] = gis[g].z; }
      viser(i, gis[g].cle);
    }
    /** Casser, lever, bâtir : aller au plus près de la cible, puis y travailler. */
    function envoyerTravail(i, ordreTravail, cible, cassable) {
      quitterOrdre(i);
      uord[i] = ordreTravail; ucib[i] = cible; uetat[i] = ET.MARCHE;
      if (cassable) umode[i] |= M_CASSABLE; else umode[i] &= ~M_CASSABLE;
      // La place de l'unité (but personnel) et la clé du champ, partagée par tout le groupe (un champ par côté
      // d'une barricade, un par cassable, un par avant-poste).
      let x, z, cx, cz;
      if (cassable) {
        const f = casAppro[cible];
        x = cx = f >= 0 ? nav.fineX(f) : casX[cible]; z = cz = f >= 0 ? nav.fineZ(f) : casZ[cible];
      } else {
        const s = structures[cible];
        if (s.sorte === S_BARRICADE) {
          // Une place le long du segment, du côté où se trouve l'unité, à 2,2 m de la ligne.
          const lx = s.x2 - s.x, lz = s.z2 - s.z, l = Math.sqrt(lx * lx + lz * lz) | 1;
          const cote = (ux[i] - s.x) * -lz + (uz[i] - s.z) * lx >= 0 ? 1 : -1;
          const u = (i * 37) % 1000, px = s.x + Math.trunc(lx * u / 1000), pz = s.z + Math.trunc(lz * u / 1000);
          x = px + Math.trunc(-lz * 2200 * cote / l); z = pz + Math.trunc(lx * 2200 * cote / l);
          cx = ((s.x + s.x2) >> 1) + Math.trunc(-lz * 3000 * cote / l); cz = ((s.z + s.z2) >> 1) + Math.trunc(lx * 3000 * cote / l);
        } else {
          x = s.x + ((i % 5) - 2) * 1800; z = s.z + (((i / 5) | 0) % 5 - 2) * 1800;
          cx = s.sortieX; cz = s.sortieZ;
        }
        const f = nav.fineProche(x, z, 8);
        if (f >= 0) { x = nav.fineX(f); z = nav.fineZ(f); }
      }
      ubx[i] = x; ubz[i] = z;
      // Une cible proche se rejoint en ligne droite : pas de champ à calculer.
      const dx = x - ux[i], dz = z - uz[i];
      if (dx * dx + dz * dz > DIRECT2) viser(i, nav.cleDe(cx, cz));
    }

    // ---- Barricades et avant-postes. ----
    function nouvelleStructure(s) {
      s.id = structures.length;
      structures.push(s);
      versionStructures++;
      return s;
    }
    function poserBarricade(j, xa, za, xb, zb, t) {
      const lx = xb - xa, lz = zb - za, L = Math.round(Math.sqrt(lx * lx + lz * lz));
      const B = K.BARRICADE;
      if (L < B.longueurMin * 1000 || L > B.longueurMax * 1000) { refus(j, RAISON.EMPLACEMENT, t); return null; }
      const cout = B.materiauxParMetre * L;                                  // millièmes : 6 par mètre = 6 par mm
      if (res[j * 2 + 1] < cout) { refus(j, RAISON.RESSOURCES, t); return null; }
      const nb = nav.segment(xa, za, xb, zb, casesTampon);
      let ouvertes = 0;
      for (let q = 0; q < nb; q++) if (nav.statique[casesTampon[q]]) ouvertes++;
      if (ouvertes * 2 < nb || !nav.statique[nav.caseDe(xa + (lx >> 1), za + (lz >> 1))]) { refus(j, RAISON.EMPLACEMENT, t); return null; }
      for (const s of structures) {
        if (!s.vivante) continue;
        if (s.sorte === S_QG) {
          const dx = s.x - (xa + (lx >> 1)), dz = s.z - (za + (lz >> 1));
          if (dx * dx + dz * dz < (s.rayon - 6000) * (s.rayon - 6000)) { refus(j, RAISON.EMPLACEMENT, t); return null; }
        } else if (s.cases) {
          for (let q = 0; q < nb; q++) for (let w = 0; w < s.nCases; w++) if (s.cases[w] === casesTampon[q] && s.sorte === S_POSTE) { refus(j, RAISON.EMPLACEMENT, t); return null; }
        }
      }
      res[j * 2 + 1] -= cout;
      // Depuis la 0.3, une barricade ne brûle que si on y met le feu (cocktail, foyer voisin) : « feu » dit qu'elle brûle.
      const s = nouvelleStructure({ id: 0, sorte: S_BARRICADE, faction: j, x: xa, z: za, x2: xb, z2: zb, pv: 0, pvMax: B.pvParMetre * L,
        chantier: true, travail: 0, travailMax: Math.max(1, Math.trunc(L * B.travailParMetre * IT_S / 1000)), feu: false, feux: 0, feuCamp: -1,
        occupation: 0, reprise: 0, occupe: false, file: [], ralliement: null, cases: casesTampon.slice(0, nb), nCases: nb, vivante: true,
        coutM: 0, coutX: cout, longueur: L });
      bilan[j].barricadesPosees++;
      evenement(EV.BARRICADE_POSEE, xa + (lx >> 1), za + (lz >> 1), j, s.id, 0);
      return s;
    }
    /** Emprise d'un avant-poste autour de (x, z) mm : 2 × 2 cases de 4 m autour du coin de case le plus proche,
     *  toutes praticables, loin des QG (parvis + 8 m) et des autres avant-postes (24 m). Range les cases dans
     *  cases (s'il est donné) et rend le centre [px, pz], ou null. */
    function emprisePoste(x, z, cases) {
      const i0 = Math.round((x - X0) / 4000) - 1, j0 = Math.round((z - Z0) / 4000) - 1;
      let k = 0;
      for (let dj = 0; dj < POSTE_CASES; dj++) for (let di = 0; di < POSTE_CASES; di++) {
        const a = i0 + di, b = j0 + dj;
        if (a < 1 || b < 1 || a >= nx - 1 || b >= nz - 1 || !libre[a + b * nx]) return null;
        if (cases) cases[k] = a + b * nx;
        k++;
      }
      const px = X0 + (i0 + 1) * 4000, pz = Z0 + (j0 + 1) * 4000;
      for (const s of structures) {
        if (!s.vivante || s.sorte === S_BARRICADE) continue;
        const dx = s.x - px, dz = s.z - pz, ecart = s.sorte === S_QG ? s.rayon + 8000 : POSTE_MIN_ECART;
        if (dx * dx + dz * dz < ecart * ecart) return null;
      }
      return [px, pz];
    }
    function poserPoste(j, x, z, t) {
      const A = K.AVANT_POSTE, cm = A.moyens * 1000, cx = A.materiaux * 1000;
      if (res[j * 2] < cm || res[j * 2 + 1] < cx) { refus(j, RAISON.RESSOURCES, t); return null; }
      const cases = new Int32Array(4), centre = emprisePoste(x, z, cases);
      if (!centre) { refus(j, RAISON.EMPLACEMENT, t); return null; }
      const px = centre[0], pz = centre[1];
      res[j * 2] -= cm; res[j * 2 + 1] -= cx;
      const s = nouvelleStructure({ id: 0, sorte: S_POSTE, faction: j, x: px, z: pz, x2: px, z2: pz, pv: Math.trunc(A.pv * 100), pvMax: A.pv * 1000,
        chantier: true, travail: 0, travailMax: A.travail * IT_S, feu: false, feux: 0, feuCamp: -1, occupation: 0, reprise: 0, occupe: false, file: [],
        ralliement: null, sortieX: px, sortieZ: pz + 6000, cases, nCases: 4, vivante: true, coutM: cm, coutX: cx,
        parvis: disqueCases8(px, pz, POSTE_PARVIS) });
      nav.obstacle(cases, 4, 1);
      return s;
    }
    function detruire(s, auteur) {
      s.vivante = false;
      // Les foyers d'une structure détruite finissent de brûler au sol, six secondes au plus.
      if (s.feux > 0) {
        for (let q = 0; q < NFEUX; q++) {
          if (!fActif[q] || fCible[q] !== s.id || (fSorte[q] !== SF.BARRICADE && fSorte[q] !== SF.POSTE)) continue;
          fSorte[q] = SF.SOL; fCible[q] = -1;
          if (fReste[q] > 6 * IT_S) fReste[q] = 6 * IT_S;
        }
        s.feux = 0; s.feu = false; versionFeux++;
      }
      if (s.cases && (s.sorte === S_POSTE || !s.chantier)) nav.obstacle(s.cases, s.nCases, -1);
      // Remboursement de la file ; un avant-poste détruit perd sa production.
      s.file.length = 0;
      versionStructures++;
      if (s.sorte === S_POSTE) majZonesBase();
      const mx = (s.x + s.x2) >> 1, mz = (s.z + s.z2) >> 1;
      if (s.sorte === S_BARRICADE) evenement(EV.BARRICADE_LEVEE, mx, mz, auteur, s.id, s.faction);
      else evenement(EV.STRUCTURE_DETRUITE, mx, mz, auteur, s.id, s.faction);
    }
    /** Distance² d'un point au segment d'une barricade (mm²). */
    function distSegment2(s, x, z) {
      const lx = s.x2 - s.x, lz = s.z2 - s.z, l2 = lx * lx + lz * lz;
      let px = x - s.x, pz = z - s.z;
      const t = l2 > 0 ? Math.max(0, Math.min(l2, px * lx + pz * lz)) : 0;
      if (l2 > 0) { px -= Math.trunc(lx * t / l2); pz -= Math.trunc(lz * t / l2); }
      return px * px + pz * pz;
    }

    // ---- 0.3 : le feu. Des foyers en disque ; feuCase dit à chaque case de 4 m le foyer qui la concerne (indice + 1). ----
    const fX = new Int32Array(NFEUX), fZ = new Int32Array(NFEUX), fR = new Int32Array(NFEUX), fReste = new Int32Array(NFEUX);
    const fDuree = new Int32Array(NFEUX), fAge = new Int32Array(NFEUX), fDelai = new Int32Array(NFEUX), fSorte = new Uint8Array(NFEUX);
    const fCible = new Int32Array(NFEUX), fCamp = new Int8Array(NFEUX), fId = new Int32Array(NFEUX), fGen = new Uint8Array(NFEUX);
    const fActif = new Uint8Array(NFEUX);
    const feuCase = new Uint8Array(NC);
    let nFeux = 0, prochainFeu = 1, grilleFeux = false, versionFeux = 0, feuxEnvoyes = 0;
    const BAR_FEU = FEU.barricade, POSTE_FEU = FEU.poste;
    /** Allume un foyer ; rend son indice, ou -1 s'il n'y a plus de place. Quand les 128 foyers brûlent, celui du sol
     *  qui est le plus près de sa fin cède la place. delai : itérations avant qu'il ne presse (l'objet s'embrase). */
    function creerFeu(x, z, rayon, duree, sorte, cible, camp, gen, delai) {
      let q = -1;
      if (nFeux < NFEUX) {
        for (let k = 0; k < NFEUX; k++) if (!fActif[k]) { q = k; break; }
      } else {
        let reste = 0x7FFFFFFF;
        for (let k = 0; k < NFEUX; k++) if (fSorte[k] === SF.SOL && fReste[k] < reste) { reste = fReste[k]; q = k; }
        if (q < 0) return -1;
        eteindre(q, -1, false);
      }
      fActif[q] = 1; fX[q] = x; fZ[q] = z; fR[q] = rayon; fReste[q] = duree; fDuree[q] = duree; fAge[q] = 0; fDelai[q] = delai;
      fSorte[q] = sorte; fCible[q] = cible; fCamp[q] = camp; fGen[q] = gen; fId[q] = prochainFeu++;
      nFeux++; grilleFeux = true; versionFeux++;
      if (camp >= 0) bilan[camp].feux++;
      evenement(EV.FEU_ALLUME, x, z, camp, fId[q], sorte);
      return q;
    }
    /** Éteint un foyer : consumé (eau faux), ou éteint par le jet du camp « par ». L'objet reste calciné. */
    function eteindre(q, par, eau) {
      fActif[q] = 0; nFeux--; grilleFeux = true; versionFeux++;
      const sorte = fSorte[q], cible = fCible[q];
      if (sorte === SF.OBJET) { casEtat[cible] = 3; versionCassables++; }
      else if (sorte === SF.BARRICADE || sorte === SF.POSTE) {
        const s = structures[cible];
        if (s && s.feux > 0 && --s.feux === 0) { s.feu = false; versionStructures++; }
      }
      if (eau && par >= 0) bilan[par].eteints++;
      evenement(EV.FEU_ETEINT, fX[q], fZ[q], eau ? par : -1, fId[q], eau ? 1 : 0);
    }
    // feuCase (et gazCase plus bas) : 0 rien, q + 1 un seul foyer, PLUSIEURS des foyers qui se chevauchent : on les lit
    // tous (liste des actifs), pour que personne ne reste dans l'un parce que sa case montre l'autre.
    const feuxActifs = new Uint8Array(NFEUX);
    let nFeuxListe = 0;
    function majGrilleFeux() {
      grilleFeux = false;
      feuCase.fill(0);
      nFeuxListe = 0;
      for (let q = 0; q < NFEUX; q++) {
        if (!fActif[q]) continue;
        feuxActifs[nFeuxListe++] = q;
        // Toute unité à moins de rayon + marge du foyer est dans une case marquée (demi-diagonale d'une case : 2,83 m).
        const r = fR[q] + FEU_MARGE + 3000, c0 = nav.caseDe(fX[q], fZ[q]), ci = c0 % nx, cj = (c0 / nx) | 0, rc = Math.ceil(r / 4000);
        for (let j = Math.max(0, cj - rc); j <= Math.min(nz - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(nx - 1, ci + rc); i++) {
          const c = i + j * nx, dx = nav.centreX(c) - fX[q], dz = nav.centreZ(c) - fZ[q];
          if (dx * dx + dz * dz <= r * r) feuCase[c] = feuCase[c] === 0 ? q + 1 : PLUSIEURS;
        }
      }
    }
    /** Le foyer qui concerne un point (x, z) de case marquée k : celui où il est le plus avant (r² − d² le plus grand),
     *  ou, s'il n'est dans aucun, celui dont il est le plus près d'entrer. */
    function feuDe(k, x, z) {
      if (k !== PLUSIEURS) return fActif[k - 1] ? k - 1 : -1;
      let meilleur = -1, haut = -Infinity;
      for (let n = 0; n < nFeuxListe; n++) {
        const q = feuxActifs[n];
        if (!fActif[q]) continue;                   // éteint pendant l'itération (la grille est refaite à la suivante)
        const dx = x - fX[q], dz = z - fZ[q], p = fR[q] * fR[q] - (dx * dx + dz * dz);
        if (p > haut) { haut = p; meilleur = q; }
      }
      return meilleur;
    }
    /** L'objet cassé (ou touché par un cocktail) s'embrase : il devient « en feu » (2), puis « calciné » (3). */
    function allumerCassable(k, camp, gen) {
      if (casEtat[k] >= 2 || casFeuDuree[k] <= 0) return -1;
      const q = creerFeu(casX[k], casZ[k], casFeuRayon[k], casFeuDuree[k], SF.OBJET, k, camp, gen, FEU_ALLUMAGE);
      if (q < 0) return -1;
      casEtat[k] = 2; versionCassables++;
      return q;
    }
    /** Met le feu à une barricade (un foyer tous les 7 m, trois au plus) ou à un avant-poste ; jamais à un QG. */
    function allumerStructure(s, camp, gen) {
      if (!s.vivante || s.feu || s.sorte === S_QG) return false;
      let n = 0;
      if (s.sorte === S_BARRICADE) {
        const foyers = Math.max(1, Math.min(BAR_FEU.foyers, Math.round(s.longueur / (BAR_FEU.pas * 1000))));
        for (let k = 0; k < foyers; k++) {
          const u = 2 * k + 1, x = s.x + Math.trunc((s.x2 - s.x) * u / (2 * foyers)), z = s.z + Math.trunc((s.z2 - s.z) * u / (2 * foyers));
          if (creerFeu(x, z, BAR_FEU.rayon * 1000, BAR_FEU.duree * IT_S, SF.BARRICADE, s.id, camp, gen, 0) >= 0) n++;
        }
      } else if (creerFeu(s.x, s.z, POSTE_FEU.rayon * 1000, POSTE_FEU.duree * IT_S, SF.POSTE, s.id, camp, gen, 0) >= 0) n = 1;
      if (!n) return false;
      s.feu = true; s.feux = n; s.feuCamp = camp; versionStructures++;
      return true;
    }
    /** Autour d'un foyer neuf en (x, z), de rayon r : les barricades qu'il touche et les avant-postes tout proches
     *  prennent feu ; avec objets > 0, autant d'objets pas encore brûlés dans le disque s'embrasent aussi. */
    function embraser(x, z, r, camp, gen, objets) {
      for (const s of structures) {
        if (!s.vivante || s.feu || s.sorte === S_QG) continue;
        if (s.sorte === S_BARRICADE) { if (distSegment2(s, x, z) <= (r + 1000) * (r + 1000)) allumerStructure(s, camp, gen); }
        else { const dx = s.x - x, dz = s.z - z; if (dx * dx + dz * dz <= (r + 4500) * (r + 4500)) allumerStructure(s, camp, gen); }
      }
      for (let n = 0; n < objets; n++) {
        const k = cassableProche(x, z, r * r);
        if (k < 0 || allumerCassable(k, camp, gen) < 0) break;
      }
    }
    /** L'objet pas encore brûlé le plus proche de (x, z), à moins de √r2 ; -1 s'il n'y en a pas. */
    function cassableProche(x, z, r2) {
      const fc = nav.fineDe(x, z), ci = (fc % nx2) >> 2, cj = ((fc / nx2) | 0) >> 2;
      let meilleur = -1, md = r2;
      for (let j = Math.max(0, cj - 1); j <= Math.min(nz8 - 1, cj + 1); j++) for (let i = Math.max(0, ci - 1); i <= Math.min(nx8 - 1, ci + 1); i++) {
        const cc = i + j * nx8;
        for (let p = casDebut[cc]; p < casDebut[cc + 1]; p++) {
          const k = casListe[p];
          if (casEtat[k] >= 2 || casFeuDuree[k] <= 0) continue;
          const dx = casX[k] - x, dz = casZ[k] - z, d = dx * dx + dz * dz;
          if (d < md) { md = d; meilleur = k; }
        }
      }
      return meilleur;
    }
    /** Chaque itération : l'âge des foyers, leur fin, et leur propagation — une fois par foyer, après six secondes, une
     *  chance sur deux d'embraser l'objet le plus proche à moins de 7 m, sur deux générations au plus. */
    function avancerFeux() {
      for (let q = 0; q < NFEUX; q++) {
        if (!fActif[q]) continue;
        const age = ++fAge[q];
        if (--fReste[q] <= 0) { eteindre(q, -1, false); continue; }
        if (age === fDelai[q] + FEU_PROPAGE_IT && fGen[q] < FEU_GENERATIONS && nFeux < NFEUX - 16 && (tirer() % 100) < FEU_PROPAGE_CHANCE) {
          const k = cassableProche(fX[q], fZ[q], FEU_PROPAGE_R2);
          if (k >= 0) allumerCassable(k, fCamp[q], fGen[q] + 1);
        }
      }
      if (grilleFeux) majGrilleFeux();
    }
    /** Une fois par seconde : une structure en feu perd une part de ses points ; à zéro, le feu l'a détruite. */
    function brulerStructures() {
      for (const s of structures) {
        if (!s.vivante || !s.feu) continue;
        s.pv -= Math.trunc(s.pvMax * (s.sorte === S_BARRICADE ? BAR_FEU.usure : POSTE_FEU.usure));
        structuresDetail++;
        if (s.pv <= 0) detruire(s, s.feuCamp >= 0 ? s.feuCamp : s.faction);
      }
    }
    /** Le jet d'un Canon à eau, de (x, z) vers (ax, az) de longueur la, arrose les foyers du cône : chaque impulsion
     *  leur retire trois secondes. Rend vrai si un foyer a été touché. */
    function arroser(x, z, ax, az, la, f) {
      let touche = false;
      for (let q = 0; q < NFEUX; q++) {
        if (!fActif[q]) continue;
        const dx = fX[q] - x, dz = fZ[q] - z, d2 = dx * dx + dz * dz, r = fR[q], p = JET_PORTEE + r;
        if (d2 > p * p) continue;
        if (d2 > r * r) {
          const dot = dx * ax + dz * az;
          if (dot <= 0) continue;
          // Dans le cône, ou à moins d'un rayon de son axe.
          const d = Math.sqrt(d2) | 0, travers = dx * az - dz * ax;
          if (dot * 1000 < JET_COS1000 * la * d && (travers < 0 ? -travers : travers) > (r + 1000) * la) continue;
        }
        touche = true;
        fReste[q] -= FEU_EAU;
        if (fReste[q] <= 0) eteindre(q, f, true);
      }
      return touche;
    }
    /** Le foyer le plus proche de (x, z) dont le bord est à moins de « portee » ; -1 s'il n'y en a pas. */
    function feuProche(x, z, portee) {
      let meilleur = -1, md = Infinity;
      for (let q = 0; q < NFEUX; q++) {
        if (!fActif[q]) continue;
        const dx = fX[q] - x, dz = fZ[q] - z, d2 = dx * dx + dz * dz, p = portee + fR[q];
        if (d2 <= p * p && d2 < md) { md = d2; meilleur = q; }
      }
      return meilleur;
    }

    // ---- 0.3 : le gaz lacrymogène. Des nuages en disque, qui grossissent deux secondes ; gazCase comme feuCase. ----
    const gX = new Int32Array(NNUAGES), gZ = new Int32Array(NNUAGES), gRc = new Int32Array(NNUAGES), gReste = new Int32Array(NNUAGES);
    const gAge = new Int32Array(NNUAGES), gCamp = new Int8Array(NNUAGES), gId = new Int32Array(NNUAGES), gActif = new Uint8Array(NNUAGES);
    const gazCase = new Uint8Array(NC);
    let nNuages = 0, prochainNuage = 1, grilleGaz = false, versionGaz = 0, gazEnvoye = 0;
    function creerNuage(x, z, camp) {
      if (nNuages >= NNUAGES) return -1;
      let q = 0;
      while (gActif[q]) q++;
      gActif[q] = 1; gX[q] = x; gZ[q] = z; gRc[q] = 2000; gReste[q] = GAZ_DUREE; gAge[q] = 0; gCamp[q] = camp; gId[q] = prochainNuage++;
      nNuages++; grilleGaz = true; versionGaz++;
      evenement(EV.GAZ, x, z, camp, gId[q], GAZ.rayon);
      return q;
    }
    const nuagesActifs = new Uint8Array(NNUAGES);
    let nNuagesListe = 0;
    function avancerNuages() {
      for (let q = 0; q < NNUAGES; q++) {
        if (!gActif[q]) continue;
        const age = ++gAge[q];
        if (--gReste[q] <= 0) { gActif[q] = 0; nNuages--; grilleGaz = true; versionGaz++; continue; }
        gRc[q] = age >= GAZ_MONTEE ? GAZ_RAYON : 2000 + Math.trunc((GAZ_RAYON - 2000) * age / GAZ_MONTEE);
      }
      if (!grilleGaz) return;
      grilleGaz = false;
      gazCase.fill(0);
      nNuagesListe = 0;
      for (let q = 0; q < NNUAGES; q++) {
        if (!gActif[q]) continue;
        nuagesActifs[nNuagesListe++] = q;
        const r = GAZ_RAYON + GAZ_MARGE + 3000, c0 = nav.caseDe(gX[q], gZ[q]), ci = c0 % nx, cj = (c0 / nx) | 0, rc = Math.ceil(r / 4000);
        for (let j = Math.max(0, cj - rc); j <= Math.min(nz - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(nx - 1, ci + rc); i++) {
          const c = i + j * nx, dx = nav.centreX(c) - gX[q], dz = nav.centreZ(c) - gZ[q];
          if (dx * dx + dz * dz <= r * r) gazCase[c] = gazCase[c] === 0 ? q + 1 : PLUSIEURS;
        }
      }
    }
    /** Le nuage hostile au camp f qui concerne un point (x, z) de case marquée k (comme feuDe), ou -1. */
    function gazDe(k, x, z, f) {
      if (k !== PLUSIEURS) return hostile[gCamp[k - 1] * 4 + f] ? k - 1 : -1;
      let meilleur = -1, haut = -Infinity;
      for (let n = 0; n < nNuagesListe; n++) {
        const q = nuagesActifs[n];
        if (!hostile[gCamp[q] * 4 + f]) continue;
        const dx = x - gX[q], dz = z - gZ[q], p = gRc[q] * gRc[q] - (dx * dx + dz * dz);
        if (p > haut) { haut = p; meilleur = q; }
      }
      return meilleur;
    }

    // ---- 0.3 : les projectiles. Cocktails et grenades : une liste de vols ; pierres : une file à durée fixe. ----
    const vIt = new Int32Array(NVOLS), vX = new Int32Array(NVOLS), vZ = new Int32Array(NVOLS), vCamp = new Int8Array(NVOLS);
    const vSorte = new Uint8Array(NVOLS), vTireur = new Int32Array(NVOLS);
    let nVols = 0;
    const sIt = new Int32Array(NPIERRES), sCible = new Int32Array(NPIERRES), sGen = new Uint16Array(NPIERRES), sTireur = new Int32Array(NPIERRES);
    const sCamp = new Uint8Array(NPIERRES), sPres = new Int32Array(NPIERRES);
    let sTete = 0, sQueue = 0;
    let nEvATerre = 0, nEvPierres = 0;
    const derniereCharge = new Int32Array(N8).fill(-100000);
    // Cadence des cocktails et des grenades lancés d'eux-mêmes : un jeton vaut quatre points ; chaque camp en reçoit
    // « echelle » par seconde (1,25 lancer par seconde à 100 000 unités) et en garde six lancers au plus.
    const jetons = new Int32Array(3);
    const JETON = 4, JETONS_MAX = 6 * JETON;
    const NFEUX_AUTO = (NFEUX * 3) >> 2, NNUAGES_AUTO = (NNUAGES * 3) >> 2, MO_RESERVE = 60000 * echelle;

    /** Un coup porté de loin ou par une zone : la pression p du camp f (lanceur i, ou -1) sur l'unité j. */
    function toucher(j, p, f, i, source) {
      if (udeg[j] === 0) touches[nTouches++] = j;
      udeg[j] += p;
      if (i >= 0) uagr[j] = i;
      bilan[f].infliges += p; sources[f * 8 + source] += p;
      if (f === PREF && ufac[j] === BAST) { colere = K.COLERE_S * IT_S; colereAllumee = true; }
      const cb = combDeC8[uc8[j]];
      if (combats[cb] < 65535) combats[cb]++;
    }
    /** La pression d'une zone (feu, gaz) sur l'unité i, de type t : appliquée tout de suite, sans l'éclair « touchée »
     *  des coups. Rend vrai si l'unité est hors jeu (par : le camp à qui cela revient, -1 pour personne). */
    function presser(i, t, p, par) {
      ucoh[i] -= p;
      if (ucoh[i] <= 0) { horsJeu(i, false, par); return true; }
      if (ucoh[i] * 100 < T.coh[t] * REPLI_PCT && uord[i] !== O.TENIR && uord[i] !== O.REPLI) commencerRepli(i, true);
      return false;
    }
    /** Jette l'unité j au sol pour trois secondes ; rend vrai si elle tombe. Un véhicule ne tombe pas ; une unité déjà
     *  à terre, ou relevée depuis moins de six secondes, non plus ; une unité protégée ne tombe que si « force ». */
    function mettreATerre(j, cause, par, force) {
      const tj = utyp[j];
      if (uterre[j] > 0 || uimm[j] > 0 || uetat[j] === ET.HORS_JEU || T.vehicule[tj] || (T.protege[tj] && !force)) return false;
      uterre[j] = A_TERRE_IT; uetat[j] = ET.A_TERRE; uassaut[j] = 0; ulance[j] = 0;
      if (usal[j] > 0) { usal[j] = 0; umode[j] &= ~M_JET; }
      if (par >= 0 && par < 3) bilan[par].aTerre++;
      if (nEvATerre < EV_A_TERRE_MAX) { nEvATerre++; evenement(EV.A_TERRE, ux[j], uz[j], ufac[j], tj, cause); }
      return true;
    }
    function ajouterVol(sorte, x, z, camp, tireur, arrivee) {
      const k = nVols++;
      vSorte[k] = sorte; vX[k] = x; vZ[k] = z; vCamp[k] = camp; vTireur[k] = tireur; vIt[k] = arrivee;
    }
    /** L'unité i lance un cocktail sur (tx, tz) : 4 Matériaux, 25 s de recharge ; il tombe à 1,3 m près. */
    function lancerMolotov(i, tx, tz) {
      const f = ufac[i];
      if (urech[i] > 0 || nVols >= NVOLS || res[f * 2 + 1] < MO_COUT) return false;
      res[f * 2 + 1] -= MO_COUT;
      const a = tirer();
      tx += ((a & 255) - 128) * 10; tz += (((a >>> 8) & 255) - 128) * 10;
      const dx = tx - ux[i], dz = tz - uz[i], d = Math.sqrt(dx * dx + dz * dz) | 0;
      ajouterVol(0, tx, tz, f, i, it + volIt(PJ.molotov, d));
      urech[i] = MO_RECH + (i & 31); ulance[i] = LANCE_IT; uetat[i] = ET.LANCE; ucap[i] = CAP(dx, dz, ucap[i]);
      bilan[f].molotovs++;
      evenement(EV.MOLOTOV, ux[i], uz[i], f, dx / 1000, dz / 1000);
      return true;
    }
    /** La Compagnie i lance une grenade lacrymogène sur (tx, tz) : 35 s de recharge. */
    function lancerGrenade(i, tx, tz) {
      const f = ufac[i];
      if (urech2[i] > 0 || nVols >= NVOLS) return false;
      const a = tirer();
      tx += ((a & 255) - 128) * 12; tz += (((a >>> 8) & 255) - 128) * 12;
      const dx = tx - ux[i], dz = tz - uz[i], d = Math.sqrt(dx * dx + dz * dz) | 0;
      ajouterVol(1, tx, tz, f, i, it + volIt(PJ.lacrymo, d));
      urech2[i] = LA_RECH + (i & 31); ulance[i] = LANCE_IT; uetat[i] = ET.LANCE; ucap[i] = CAP(dx, dz, ucap[i]);
      bilan[f].grenades++;
      evenement(EV.LACRYMO, ux[i], uz[i], f, dx / 1000, dz / 1000);
      return true;
    }
    /** Le cocktail tombe : un souffle (les hostiles à moins de 3 m, huit au plus, repoussés hors du foyer, les trois
     *  premiers jetés au sol), puis le feu, qui prend aussi aux barricades, aux avant-postes et à deux objets. */
    function molotovTombe(x, z, f, tireur) {
      const c0 = nav.caseDe(x, z), ci = c0 % nx, cj = (c0 / nx) | 0, r2 = MO_RAYON * MO_RAYON;
      const lanceur = tireur >= 0 && ufac[tireur] === f ? tireur : -1;
      let n = 0;
      for (let q = 0; q < 9 && n < MO_MAXU; q++) {
        const ii = ci + ORDRE_SALVE[q][1], j = cj + ORDRE_SALVE[q][2];
        if (ii < 0 || j < 0 || ii >= nx || j >= nz) continue;
        const cc = ii + j * nx;
        for (let p = debutCase[cc], fin = debutCase[cc + 1]; p < fin && n < MO_MAXU; p++) {
          const u = tri[p];
          if (!hostile[f * 4 + ufac[u]] || uetat[u] === ET.HORS_JEU) continue;
          const dx = ux[u] - x, dz = uz[u] - z, d2 = dx * dx + dz * dz;
          if (d2 > r2) continue;
          toucher(u, T.protege[utyp[u]] ? MO_PRES >> 1 : MO_PRES, f, lanceur, 5);
          // Soufflée hors du foyer : personne ne reste couché dans les flammes.
          const d = Math.sqrt(d2) | 0, pousse = FEU_RAYON + 700 - d;
          if (d > 0 && pousse > 0 && !T.vehicule[utyp[u]]) deplacer(u, Math.trunc(dx * pousse / d), Math.trunc(dz * pousse / d));
          if (n < MO_A_TERRE) mettreATerre(u, CAUSE.MOLOTOV, f, true);
          n++;
        }
      }
      creerFeu(x, z, FEU_RAYON, FEU_DUREE, SF.SOL, -1, f, 0, 0);
      embraser(x, z, FEU_RAYON, f, 0, 2);
    }
    /** Chaque itération : les cocktails et les grenades qui arrivent, les pierres qui touchent. */
    function avancerProjectiles() {
      for (let k = nVols - 1; k >= 0; k--) {
        if (vIt[k] > it) continue;
        const sorte = vSorte[k], x = vX[k], z = vZ[k], f = vCamp[k], tireur = vTireur[k];
        nVols--;
        if (k !== nVols) { vSorte[k] = vSorte[nVols]; vX[k] = vX[nVols]; vZ[k] = vZ[nVols]; vCamp[k] = vCamp[nVols]; vTireur[k] = vTireur[nVols]; vIt[k] = vIt[nVols]; }
        if (sorte === 0) molotovTombe(x, z, f, tireur); else creerNuage(x, z, f);
      }
      while (sTete !== sQueue && sIt[sTete] <= it) {
        const j = sCible[sTete], f = sCamp[sTete];
        if (ufac[j] !== LIBRE && ugen[j] === sGen[sTete] && uetat[j] !== ET.HORS_JEU && hostile[f * 4 + ufac[j]]) {
          const i = sTireur[sTete];
          toucher(j, sPres[sTete], f, ufac[i] === f && uetat[i] !== ET.HORS_JEU ? i : -1, 3);
        }
        sTete = (sTete + 1) & (NPIERRES - 1);
      }
    }
    /** L'unité i (type t, camp f) jette une pierre sur sa cible j, à (dx, dz) d'elle : le coup porte 0,6 s plus tard. */
    function lancerPierre(i, j, t, f, dx, dz) {
      let p = T.piPres[t];
      if (T.protege[utyp[j]]) {
        // De face sur un bouclier : la moitié.
        const h = ucap[j], dot = -(DX[h] * dx + DZ[h] * dz);
        if (dot > 0 && 4 * dot * dot >= 1048576 * (dx * dx + dz * dz)) p >>= 1;
      }
      urech[i] = T.piRech[t] + (i & 31); ulance[i] = LANCE_IT; uetat[i] = ET.LANCE; ucap[i] = CAP(dx, dz, ucap[i]);
      bilan[f].pierres++;
      if (nEvPierres < EV_PIERRE_MAX) { nEvPierres++; evenement(EV.PIERRE, ux[i], uz[i], f, dx / 1000, dz / 1000); }
      const suivant = (sQueue + 1) & (NPIERRES - 1);
      if (suivant === sTete) { toucher(j, p, f, i, 3); return; }       // file pleine : le coup porte tout de suite
      sIt[sQueue] = it + PIERRE_IT; sCible[sQueue] = j; sGen[sQueue] = ugen[j]; sTireur[sQueue] = i; sCamp[sQueue] = f; sPres[sQueue] = p;
      sQueue = suivant;
    }
    /** Pour les lancers de loin : la case de 8 m la plus peuplée d'hostiles au camp f, entre dmin et dmax (mm) de
     *  (x, z), sans foyer ni nuage (selon « grille ») et où les siens ne sont pas plus de la moitié des hostiles. Rend
     *  une unité hostile de cette case, à viser, ou -1 si aucune case n'atteint « seuil » hostiles. */
    function viserFoule(i, f, x, z, dmin2, dmax, seuil, grille) {
      const c8 = uc8[i], ci = c8 % nx8, cj = (c8 / nx8) | 0, rc = Math.ceil(dmax / 8000), dmax2 = dmax * dmax;
      const hb = f * 4, h0 = hostile[hb], h1 = hostile[hb + 1], h2 = hostile[hb + 2];
      let meilleure = -1, plus = seuil - 1;
      for (let j = Math.max(0, cj - rc); j <= Math.min(nz8 - 1, cj + rc); j++) for (let ii = Math.max(0, ci - rc); ii <= Math.min(nx8 - 1, ci + rc); ii++) {
        const c = ii + j * nx8;
        const n = (h0 ? pres[c] : 0) + (h1 ? pres[N8 + c] : 0) + (h2 ? pres[2 * N8 + c] : 0);
        if (n <= plus || pres[f * N8 + c] * 2 > n) continue;
        const px = X0 + ii * 8000 + 4000, pz = Z0 + j * 8000 + 4000, dx = px - x, dz = pz - z, d2 = dx * dx + dz * dz;
        if (d2 < dmin2 || d2 > dmax2 || grille[nav.caseDe(px, pz)]) continue;
        plus = n; meilleure = c;
      }
      if (meilleure < 0) return -1;
      const a0 = 2 * (meilleure % nx8), b0 = 2 * ((meilleure / nx8) | 0);
      for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
        if (a0 + di >= nx || b0 + dj >= nz) continue;
        const cc = a0 + di + (b0 + dj) * nx;
        for (let p = debutCase[cc], fin = debutCase[cc + 1]; p < fin; p++) {
          const u = tri[p];
          if (hostile[hb + ufac[u]] && uetat[u] !== ET.HORS_JEU) return u;
        }
      }
      return -1;
    }

    // ---- Diplomatie (CONCEPTION.md §1.2). ----
    function diplomatie(j, action, avec) {
      const valide = [0, 1, 2].includes(avec) && avec !== j;
      if (action === 'proposer') {
        if (!valide || alliance || proposition || delaiAlliance > 0 || elimine[avec]) { refus(j, RAISON.DELAI, CMD.DIPLOMATIE); return; }
        proposition = { de: j, a: avec, reste: PROPOSITION_IT };
        evenement(EV.ALLIANCE_PROPOSEE, 0, 0, j, avec, 0);
      } else if (action === 'accepter') {
        if (!proposition || proposition.a !== j || alliance) return;
        alliance = [proposition.de, j];
        proposition = null;
        evenement(EV.ALLIANCE_FORMEE, 0, 0, -1, alliance[0], alliance[1]);
        majHostilite();
      } else if (action === 'refuser') {
        if (proposition && proposition.a === j) proposition = null;
      } else if (action === 'rompre') {
        if (!alliance || (alliance[0] !== j && alliance[1] !== j)) return;
        evenement(EV.ALLIANCE_ROMPUE, 0, 0, j, alliance[0], alliance[1]);
        alliance = null;
        delaiAlliance = K.ALLIANCE_DELAI_S * IT_S;
        majHostilite();
      }
    }

    // ---- Départ : E unités réparties selon les parts, autour des QG et sur les rues de leur quartier. ----
    if (!opt.vide && E > 0) {
      const qx = structures.map(s => s.sortieX), qz = structures.map(s => s.sortieZ);
      const marge = 40000;
      for (let f = 0; f < 3; f++) {
        const nf = depart[f], ouvriers = Math.round(nf * K.PART_OUVRIERS);
        const enSonQuartier = fc => {
          const x = nav.fineX(fc), z = nav.fineZ(fc);
          const d = Math.sqrt((x - qx[f]) * (x - qx[f]) + (z - qz[f]) * (z - qz[f]));
          for (let g = 0; g < 3; g++) {
            if (g === f) continue;
            const e = Math.sqrt((x - qx[g]) * (x - qx[g]) + (z - qz[g]) * (z - qz[g]));
            if (d + marge > e) return false;
          }
          return true;
        };
        let parCase = 2, places = null, k = 0;
        for (; parCase <= 6; parCase++) {
          const besoin = Math.ceil(nf / parCase);
          places = new Int32Array(besoin);
          k = nav.remplir(qx[f], qz[f], besoin, places, enSonQuartier);
          if (k >= besoin) break;
        }
        const cx = (ville.etendue.x0 + ville.etendue.x1) * 500, cz = (ville.etendue.z0 + ville.etendue.z1) * 500;
        const compo = COMPOSITION[f];
        for (let q = 0; q < nf; q++) {
          let t;
          if (q < ouvriers) t = R.OUVRIER[f];
          else {
            // Suite à faible discrépance : chaque quartier reçoit le même mélange de types.
            const u = (Math.imul(q - ouvriers, 40503) >>> 0) % 1000;
            let cumul = 0; t = compo[compo.length - 1][0];
            for (const [tt, part] of compo) { cumul += part; if (u < cumul) { t = tt; break; } }
          }
          if (!k) break;
          const fc = places[Math.min(k - 1, (q / parCase) | 0)], r = q % parCase;
          const ox = r === 0 ? -500 : r === 1 ? 500 : r === 2 ? 0 : r === 3 ? -500 : r === 4 ? 500 : 0;
          const oz = r === 0 ? -500 : r === 1 ? 500 : r === 2 ? 0 : r === 3 ? 500 : r === 4 ? -500 : 300;
          const x = nav.fineX(fc) + ox, z = nav.fineZ(fc) + oz;
          creerUnite(f, t, x, z, CAP(cx - x, cz - z));
        }
      }
    }

    // ---- Recherche de cible : la plus proche des 32 premières unités vues autour, anneau par anneau. ----
    const ANNEAUX = [[0], [], []];
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const r = Math.max(Math.abs(di), Math.abs(dj));
      if (r > 0) ANNEAUX[r].push(di + dj * nx);
    }
    const ANNEAU = ANNEAUX.map(a => Int32Array.from(a));
    // Une case de 4 m sans hostile dans sa case de 8 m (grille de présence) est sautée sans lire ses unités.
    // Au plus 32 hostiles examinés et 128 unités lues ; l'anneau le plus proche qui en contient l'emporte.
    function chercher(i, f, x, z, anneaux, r2max) {
      let meilleur = -1, md = r2max, vus = 0, lues = 0;
      const c = uc4[i], hb = f * 4, h0 = hostile[hb], h1 = hostile[hb + 1], h2 = hostile[hb + 2];
      for (let a = 0; a <= anneaux; a++) {
        const off = ANNEAU[a];
        for (let o = 0; o < off.length; o++) {
          const cc = c + off[o];
          if (cc < 0 || cc >= NC) continue;
          const c8 = c8DeC4[cc];
          if (!((h0 && pres[c8]) || (h1 && pres[N8 + c8]) || (h2 && pres[2 * N8 + c8]))) continue;
          for (let p = debutCase[cc], fin = debutCase[cc + 1]; p < fin; p++) {
            const j = tri[p];
            if (++lues > 128) return meilleur;
            if (!hostile[hb + ufac[j]] || uetat[j] === ET.HORS_JEU) continue;
            const dx = ux[j] - x, dz = uz[j] - z, d = dx * dx + dz * dz;
            if (d < md) { md = d; meilleur = j; }
            if (++vus >= 32) return meilleur;
          }
        }
        if (meilleur >= 0) return meilleur;
      }
      return meilleur;
    }
    const cibleValide = (i, j) => j >= 0 && ufac[j] !== LIBRE && ugen[j] === ucibg[i] && uetat[j] !== ET.HORS_JEU && hostile[ufac[i] * 4 + ufac[j]] === 1;

    // ---- Coups : pression au contact, flanc × 1,5, protégé × 0,5 de face, interpeller × 2 sous 30 %. ----
    let colereAllumee = false;
    function frapper(i, j, p, source) {
      const g = ufac[j], tj = utyp[j], f = ufac[i];
      // Interpeller : pression doublée sur une unité sous 30 % de cohésion, et la matraque la jette au sol.
      if (T.interpeller[utyp[i]] && ucoh[j] * 10 < T.coh[tj] * 3) { p *= 2; if (uterre[j] === 0 && uimm[j] === 0) mettreATerre(j, CAUSE.MATRAQUE, f, false); }
      const vx = ux[i] - ux[j], vz = uz[i] - uz[j], h = ucap[j];
      const dot = DX[h] * vx + DZ[h] * vz;
      if (dot <= 0 || 4 * dot * dot < 1048576 * (vx * vx + vz * vz)) p = (p * 3) >> 1;     // hors de l'arc frontal de 120°
      else if (T.protege[tj]) p >>= 1;
      if (udeg[j] === 0) touches[nTouches++] = j;
      udeg[j] += p;
      uagr[j] = i;
      bilan[f].infliges += p; sources[f * 8 + source] += p;
      if (f === PREF && g === BAST) { colere = K.COLERE_S * IT_S; colereAllumee = true; }
      const c8 = uc8[j], cb = combDeC8[c8];
      if (combats[cb] < 65535) combats[cb]++;
      const zone = g * 64 + zoneDeC8[c8];
      if (it - derniereAlerte[zone] >= 10 * IT_S) { derniereAlerte[zone] = it; evenement(EV.ATTAQUE_SUBIE, ux[j], uz[j], g, f, 0); }
    }

    // ---- Déplacement d'un pas, avec glissement le long des murs et mise à jour des grilles. ----
    function deplacer(i, sx, sz) {
      if (sx === 0 && sz === 0) return false;
      const x = ux[i], z = uz[i], c4 = uc4[i];
      let nxp = x + sx, nzp = z + sz;
      let i2 = ((nxp - X0) / 2000) | 0, j2 = ((nzp - Z0) / 2000) | 0, f = i2 + j2 * nx2, c = (i2 >> 1) + (j2 >> 1) * nx;
      if (!(masque2[f] && (bloque[c] === 0 || c === c4))) {
        nxp = x + sx; nzp = z;
        i2 = ((nxp - X0) / 2000) | 0; j2 = ((nzp - Z0) / 2000) | 0; f = i2 + j2 * nx2; c = (i2 >> 1) + (j2 >> 1) * nx;
        if (sx === 0 || !(masque2[f] && (bloque[c] === 0 || c === c4))) {
          nxp = x; nzp = z + sz;
          i2 = ((nxp - X0) / 2000) | 0; j2 = ((nzp - Z0) / 2000) | 0; f = i2 + j2 * nx2; c = (i2 >> 1) + (j2 >> 1) * nx;
          if (sz === 0 || !(masque2[f] && (bloque[c] === 0 || c === c4))) return false;
        }
      }
      ux[i] = nxp; uz[i] = nzp;
      const f0 = uc2[i];
      if (f !== f0) {
        if (dens[f0] !== MUR) dens[f0]--;
        if (dens[f] !== MUR) dens[f]++;
        uc2[i] = f; uc4[i] = c;
        const c8 = (i2 >> 2) + (j2 >> 2) * nx8;
        if (c8 !== uc8[i]) { const b = ufac[i] * N8; pres[b + uc8[i]]--; pres[b + c8]++; uc8[i] = c8; }
      }
      return true;
    }

    // Pas voulu, calculé par avancerVers ; arrivee : 1 arrivé, 2 sans chemin.
    let PX = 0, PZ = 0;
    /** Vers le but personnel (ubx, ubz) par le champ de l'unité ; rend 0 en route, 1 arrivé, 2 sans chemin. */
    function avancerVers(i, v) {
      const x = ux[i], z = uz[i], dx = ubx[i] - x, dz = ubz[i] - z, d2 = dx * dx + dz * dz;
      if (d2 <= ARRIVEE * ARRIVEE) { PX = dx; PZ = dz; return 1; }
      let code = BUT;
      const k = uchamp[i];
      if (k >= 0 && d2 > DIRECT2) {
        const ch = nav.champs[k];
        if (ch.pret) code = ch.dir[uc4[i]];
      }
      if (code === BUT) {
        const d = Math.sqrt(d2);
        if (d <= v) { PX = dx; PZ = dz; } else { PX = Math.trunc(dx * v / d); PZ = Math.trunc(dz * v / d); }
        return 0;
      }
      if (code === AUCUN) {
        const c = uc4[i];
        if (!nav.statique[c] && nav.sortie[c] !== AUCUN) code = nav.sortie[c];
        else if (bloque[c]) code = sortieBloquee(c);
        else code = AUCUN;
        if (code === AUCUN) { PX = 0; PZ = 0; return 2; }
      }
      const h = code << 1;
      PX = (DX[h] * v) >> 10; PZ = (DZ[h] * v) >> 10;
      return 0;
    }
    /** Code de direction vers une case voisine libre, pour une unité prise dans un obstacle qui vient de se fermer. */
    function sortieBloquee(c) {
      for (let k = 0; k < 8; k++) if (libre[c + VI[k] + VJ[k] * nx]) return VCODE[k];
      return AUCUN;
    }
    /** Pas direct vers (bx, bz), de longueur v au plus. */
    function versPoint(x, z, bx, bz, v) {
      const dx = bx - x, dz = bz - z, d2 = dx * dx + dz * dz;
      if (d2 <= v * v) { PX = dx; PZ = dz; return; }
      const d = Math.sqrt(d2);
      PX = Math.trunc(dx * v / d); PZ = Math.trunc(dz * v / d);
    }

    // ---- Capacités de zone : la salve tombe 1,5 s après l'annonce et jette au sol les quatre premières unités
    // touchées ; le jet pousse et presse dans un cône, jette au sol de près et éteint les foyers. ----
    function salve(i) {
      const f = ufac[i], x = usx[i], z = usz[i], r2 = SALVE_RAYON * SALVE_RAYON;
      const c0 = nav.caseDe(x, z), ci = c0 % nx, cj = (c0 / nx) | 0;
      let n = 0, tombees = 0;
      for (let q = 0; q < ORDRE_SALVE.length && n < SALVE_MAX; q++) {
        const ii = ci + ORDRE_SALVE[q][1], j = cj + ORDRE_SALVE[q][2];
        if (ii < 0 || j < 0 || ii >= nx || j >= nz) continue;
        const cc = ii + j * nx;
        for (let p = debutCase[cc], fin = debutCase[cc + 1]; p < fin && n < SALVE_MAX; p++) {
          const u = tri[p];
          if (!hostile[f * 4 + ufac[u]] || uetat[u] === ET.HORS_JEU) continue;
          const dx = ux[u] - x, dz = uz[u] - z;
          if (dx * dx + dz * dz > r2) continue;
          if (udeg[u] === 0) touches[nTouches++] = u;
          udeg[u] += T.protege[utyp[u]] ? SALVE_COUPS >> 1 : SALVE_COUPS;
          uagr[u] = i;
          if (f === PREF && ufac[u] === BAST) { colere = K.COLERE_S * IT_S; colereAllumee = true; }
          if (tombees < SALVE_A_TERRE && mettreATerre(u, CAUSE.SALVE, f, false)) tombees++;
          n++;
        }
      }
      bilan[f].infliges += n * SALVE_COUPS; sources[f * 8 + 1] += n * SALVE_COUPS;
      evenement(EV.SALVE, x, z, f, SALVE.rayon, n);
    }
    function jet(i) {
      const f = ufac[i], x = ux[i], z = uz[i], ax = usx[i] - x, az = usz[i] - z, la = Math.sqrt(ax * ax + az * az) | 0;
      if (la === 0) return;
      const c0 = uc4[i], ci = c0 % nx, cj = (c0 / nx) | 0, r2 = JET_PORTEE * JET_PORTEE, rc = Math.ceil(JET_PORTEE / 4000);
      for (let j = Math.max(0, cj - rc); j <= Math.min(nz - 1, cj + rc); j++) for (let ii = Math.max(0, ci - rc); ii <= Math.min(nx - 1, ci + rc); ii++) {
        const cc = ii + j * nx;
        for (let p = debutCase[cc], fin = debutCase[cc + 1]; p < fin; p++) {
          const u = tri[p];
          if (!hostile[f * 4 + ufac[u]] || uetat[u] === ET.HORS_JEU) continue;
          const dx = ux[u] - x, dz = uz[u] - z, d2 = dx * dx + dz * dz;
          if (d2 > r2 || d2 === 0) continue;
          const dot = dx * ax + dz * az;
          if (dot <= 0) continue;
          const d = Math.sqrt(d2) | 0;
          if (dot * 1000 < JET_COS1000 * la * d) continue;
          if (udeg[u] === 0) touches[nTouches++] = u;
          udeg[u] += JET_COUPS;
          uagr[u] = i;
          bilan[f].infliges += JET_COUPS; sources[f * 8 + 2] += JET_COUPS;
          if (f === PREF && ufac[u] === BAST) { colere = K.COLERE_S * IT_S; colereAllumee = true; }
          deplacer(u, Math.trunc(dx * JET_RECUL / d), Math.trunc(dz * JET_RECUL / d));
          if (d2 <= JET_A_TERRE2) mettreATerre(u, CAUSE.JET, f, false);
        }
      }
      if (nFeux > 0) arroser(x, z, ax, az, la, f);
    }

    // ---- Hors jeu : l'unité reste couchée six secondes (1,5 s au-delà de 4 096 gisants, ou si « vite »), puis son
    // emplacement se libère. Dans un foyer, elle disparaît aussitôt : personne n'est montré en feu. ----
    function horsJeu(i, vite, par) {
      const f = ufac[i], t = utyp[i], a = uagr[i], af = par !== undefined ? par : a >= 0 && ufac[a] < 3 ? ufac[a] : -1;
      quitterOrdre(i);
      uetat[i] = ET.HORS_JEU; ucoh[i] = 0; ucharge[i] = 0; usal[i] = 0; umode[i] = 0;
      uterre[i] = 0; uimm[i] = 0; ulance[i] = 0;
      const kf = feuCase[uc4[i]], q = kf ? feuDe(kf, ux[i], uz[i]) : -1;
      let dansLeFeu = false;
      if (q >= 0) { const dx = ux[i] - fX[q], dz = uz[i] - fZ[q], r = fR[q]; dansLeFeu = dx * dx + dz * dz <= r * r; }
      if (dansLeFeu) uminu[i] = 2;
      else if (vite || nGisants >= GISANTS_MAX) uminu[i] = HORS_JEU_IT;
      else { uminu[i] = GISANT_IT; umode[i] = M_GISANT; nGisants++; }
      if (dens[uc2[i]] !== MUR) dens[uc2[i]]--;
      pres[f * N8 + uc8[i]]--;
      pop[f] -= T.pop[t]; vivantes[f]--;
      bilan[f].horsJeu++;
      evenement(EV.HORS_JEU, ux[i], uz[i], f, t, af);
    }

    // ---- L'itération. ----
    const tri4 = () => {
      debutCase.fill(0);
      for (let i = 0; i < nHaut; i++) if (ufac[i] !== LIBRE && uetat[i] !== ET.HORS_JEU) debutCase[uc4[i] + 1]++;
      for (let c = 0; c < NC; c++) debutCase[c + 1] += debutCase[c];
      ecrit.set(debutCase);
      for (let i = 0; i < nHaut; i++) if (ufac[i] !== LIBRE && uetat[i] !== ET.HORS_JEU) tri[ecrit[uc4[i]]++] = i;
    };
    // Horloge facultative (performance.now du travailleur) : mesure seulement, l'état n'en dépend pas.
    const horloge = options && typeof options.horloge === 'function' ? options.horloge : null;
    const mesure = { msNav: 0, champs: 0 };

    function iterer() {
      if (vainqueur !== P.VAINQUEUR.EN_COURS) return;
      nev = 0;
      colereAllumee = false;
      nEvATerre = 0; nEvPierres = 0;
      appliquerCommandes();
      if (colere > 0) colere--;
      if (delaiAlliance > 0) delaiAlliance--;
      if (proposition && --proposition.reste <= 0) proposition = null;
      majHostilite();
      tri4();
      // 0.3 : ce qui arrive (cocktails, grenades, pierres), puis les foyers et les nuages, avant le tour des unités.
      avancerProjectiles();
      avancerFeux();
      avancerNuages();
      const t0 = horloge ? horloge() : 0;
      mesure.champs = nav.avancer(3);
      if (horloge) mesure.msNav = horloge() - t0;

      const phaseSoin = it % IT_S, marquerSoins = phaseSoin === IT_S - 2, soigner = phaseSoin === IT_S - 1;
      if (marquerSoins) soin.fill(0);
      oisifs.fill(0);
      boucle(marquerSoins, soigner);
      if (soigner) {
        for (let q = 0; q < nSoins; q++) {
          const c8 = soins[q] >> 2, f = soins[q] & 3;
          soin8[c8] = 0;
          evenement(EV.SOIN, X0 + (c8 % nx8) * 8000 + 4000, Z0 + ((c8 / nx8) | 0) * 8000 + 4000, f, 0, 0);
        }
        nSoins = 0;
      }
      degats();
      production();
      if ((it & 3) === 0) { lieuxEtQG(); }
      if (phaseSoin === 0) economie();
      if (phaseSoin === 7) brulerStructures();
      if (colereAllumee && it - derniereColere >= IT_S) { derniereColere = it; evenement(EV.COLERE, structures[BAST].x, structures[BAST].z, BAST, K.COLERE_S, 0); }
      if (phaseSoin === 5) victoire();
      it++;
      if (it % 100 === 0) lancerEmpreinte(); else avancerEmpreinte();
    }

    function boucle(marquerSoins, soigner) {
      for (let i = 0; i < nHaut; i++) {
        const f = ufac[i];
        if (f === LIBRE) continue;
        if (uetat[i] === ET.HORS_JEU) {
          if (--uminu[i] <= 0) { if (umode[i] & M_GISANT) { nGisants--; umode[i] = 0; } liberer(i); }
          continue;
        }
        const t = utyp[i];
        if (utouche[i] > 0) utouche[i]--;
        if (urech[i] > 0) urech[i]--;
        if (urech2[i] > 0) urech2[i]--;
        if (uassaut[i] > 0) uassaut[i]--;
        const x = ux[i], z = uz[i];
        let ord = uord[i], v = T.v[t];
        if (T.vhc[t] && masque2[uc2[i]] !== 2) v = T.vhc[t];

        // ---- Feu : dans un foyer, l'unité est pressée et fuit droit dehors (un véhicule reste, et encaisse) ; près
        // d'un foyer, elle le contournera (plus bas). Une unité à terre s'en relève aussitôt. ----
        let contourX = 0, contourZ = 0, contour = false;
        const c4 = uc4[i], kf = feuCase[c4], q = kf ? feuDe(kf, x, z) : -1;
        if (q >= 0) {
          const dx = x - fX[q], dz = z - fZ[q], d2 = dx * dx + dz * dz, r = fR[q];
          if (d2 <= r * r) {
            if (fAge[q] >= fDelai[q]) {
              const camp = fCamp[q];
              if (camp >= 0 && hostile[camp * 4 + f]) { bilan[camp].infliges += FEU_PRES; sources[camp * 8 + 6] += FEU_PRES; }
              const cb = combDeC8[uc8[i]];
              if (combats[cb] < 65535) combats[cb]++;
              if (presser(i, t, FEU_PRES, -1)) continue;
              ord = uord[i];
            }
            if (!T.vehicule[t]) {
              uterre[i] = 0; ulance[i] = 0; uassaut[i] = 0;
              let vx = dx, vz = dz;
              if (d2 < 10000) { const h = Math.imul(i, 0x9E3779B1) >>> 24; vx = DX[h]; vz = DZ[h]; }
              const d = Math.sqrt(vx * vx + vz * vz), vf = (v * 13 / 10) | 0;
              const px = Math.trunc(vx * vf / d), pz = Math.trunc(vz * vf / d);
              uetat[i] = ET.REPLI;
              if (deplacer(i, px, pz)) ucap[i] = CAP(px, pz, ucap[i]);
              continue;
            }
          } else if (d2 <= (r + FEU_MARGE) * (r + FEU_MARGE)) { contour = true; contourX = dx; contourZ = dz; }
        }
        // ---- À terre : rien à faire pendant trois secondes ; relevée, elle ne retombe pas avant six. ----
        if (uterre[i] > 0) {
          if (--uterre[i] === 0) { uimm[i] = IMMUNITE_IT; uetat[i] = ord === O.TENIR ? ET.TIENT : ET.OISIF; } else uetat[i] = ET.A_TERRE;
          continue;
        }
        if (uimm[i] > 0) uimm[i]--;
        // ---- Gaz : dans un nuage hostile, l'unité suffoque, ne frappe plus et en sort au pas ; elle contourne ceux
        // dont elle s'approche. La Préfecture et ses alliés portent le masque ; un véhicule passe. ----
        const kg = gazCase[c4], g = kg && !T.vehicule[t] ? gazDe(kg, x, z, f) : -1;
        if (g >= 0) {
          const q = g, dx = x - gX[q], dz = z - gZ[q], d2 = dx * dx + dz * dz, r = gRc[q];
          if (d2 <= r * r) {
            const camp = gCamp[q];
            bilan[camp].infliges += GAZ_PRES; sources[camp * 8 + 7] += GAZ_PRES;
            if (camp === PREF && f === BAST) { colere = K.COLERE_S * IT_S; colereAllumee = true; }
            const cb = combDeC8[uc8[i]];
            if (combats[cb] < 65535) combats[cb]++;
            if (presser(i, t, GAZ_PRES, camp)) continue;
            ulance[i] = 0; uassaut[i] = 0;
            let vx = dx, vz = dz;
            if (d2 < 10000) { const h = Math.imul(i, 0x9E3779B1) >>> 24; vx = DX[h]; vz = DZ[h]; }
            const d = Math.sqrt(vx * vx + vz * vz), vf = (v * GAZ_LENTEUR16) >> 4;
            const px = Math.trunc(vx * vf / d), pz = Math.trunc(vz * vf / d);
            uetat[i] = ET.SUFFOQUE;
            if (deplacer(i, px, pz)) ucap[i] = CAP(px, pz, ucap[i]);
            continue;
          }
          if (!contour && d2 <= (r + GAZ_MARGE) * (r + GAZ_MARGE)) { contour = true; contourX = dx; contourZ = dz; }
        }
        // ---- Le geste du lancer : quatre dixièmes de seconde sans rien faire d'autre. ----
        if (ulance[i] > 0) {
          if (--ulance[i] === 0) uetat[i] = ord === O.TENIR ? ET.TIENT : ET.OISIF; else uetat[i] = ET.LANCE;
          continue;
        }

        // Soins : la Fanfare marque les cases à moins de 8 m ; l'itération suivante, chacun lit sa case.
        if (marquerSoins && T.soigner[t] && ord !== O.REPLI) {
          const c = uc4[i], bit = 1 << f;
          for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (di * di + dj * dj <= 4) soin[c + di + dj * nx] |= bit;
        }
        if (soigner && ucoh[i] < T.coh[t]) {
          let plus = 0;
          const c = uc4[i], bit = 1 << f;
          if (soin[c] & bit) {
            plus += T.soigner[3];
            // Un évènement SOIN par case de 8 m soignée (au plus 128 par seconde).
            const c8 = uc8[i];
            if (!(soin8[c8] & bit) && nSoins < 128) { soin8[c8] |= bit; soins[nSoins++] = c8 * 4 + f; }
          }
          if (zoneBase[c] & bit) plus += K.SOUTIEN_PAR_S * 1000;
          if (plus) ucoh[i] = Math.min(T.coh[t], ucoh[i] + plus);
        }

        // Salve annoncée, jet en cours.
        if (usal[i] > 0) {
          if (umode[i] & M_JET) {
            if ((usal[i] & (JET_PAS - 1)) === 0) jet(i);
            if (usal[i] % 10 === 0) evenement(EV.JET, x, z, f, RADIANS[CAP(usx[i] - x, usz[i] - z)], JET.portee);
            if (--usal[i] === 0) umode[i] &= ~M_JET;
          } else if (--usal[i] === 0) salve(i);
        }

        let sx = 0, sz = 0, marche = false;
        // ---- Combat : ordres qui frappent. ----
        if (ord === O.AUCUN || ord === O.TENIR || ord === O.ATTAQUE_MVT || ord === O.ATTAQUER) {
          // 0.3, de loin et d'eux-mêmes, une itération sur seize : le Canon à eau arrose le foyer à sa portée ; les
          // Furets lancent un cocktail, la Compagnie une grenade, sur la case de 8 m la plus peuplée d'hostiles à leur
          // portée — tant que leur camp a un jeton, et sans dépasser les trois quarts des foyers ou des nuages permis.
          if (((i + it) & 15) === 0) {
            if (T.jet[t]) {
              if (nFeux > 0 && usal[i] === 0) { const q = feuProche(x, z, JET_PORTEE - 1000); if (q >= 0) lancerJet(i, fX[q], fZ[q]); }
            } else if (T.molotov[t]) {
              if (urech[i] === 0 && jetons[f] >= JETON && nFeux + nVols < NFEUX_AUTO && res[f * 2 + 1] >= MO_RESERVE) {
                const u = viserFoule(i, f, x, z, MO_MIN2, MO_MAX, 6, feuCase);
                if (u >= 0 && lancerMolotov(i, ux[u], uz[u])) { jetons[f] -= JETON; continue; }
              }
            } else if (T.lacrymo[t] && urech2[i] === 0 && jetons[f] >= JETON && nNuages + nVols < NNUAGES_AUTO) {
              const u = viserFoule(i, f, x, z, LA_MIN2, LA_MAX, 10, gazCase);
              if (u >= 0 && lancerGrenade(i, ux[u], uz[u])) { jetons[f] -= JETON; continue; }
            }
          }
          let cible = ucib[i];
          if (cible >= 0 && !cibleValide(i, cible)) {
            cible = -1; ucib[i] = -1;
            if (ord === O.ATTAQUER) { ord = O.ATTAQUE_MVT; uord[i] = ord; }
          }
          const portee = T.portee[t] + T.rayon[t] + 300;
          // Recherche étalée : une itération sur huit ; on garde la cible si elle est au contact, et la cible
          // désignée par l'ordre ATTAQUER tant qu'elle reste valide.
          if (((i + it) & 7) === 0 && ord !== O.ATTAQUER) {
            let garde = false;
            if (cible >= 0) {
              const dx = ux[cible] - x, dz = uz[cible] - z, r = portee + T.rayon[utyp[cible]];
              garde = dx * dx + dz * dz <= r * r;
            }
            if (!garde) {
              // Qui tient sa position et sait lancer des pierres regarde jusqu'à leur portée.
              const loin = ord === O.TENIR && T.pierres[t] === 1;
              const r2 = loin ? T.piMax2[t] : ord === O.TENIR ? (portee + 1600) * (portee + 1600) : ord === O.AUCUN ? RECHERCHE_OISIF2 : RECHERCHE_MVT2;
              const nouvelle = chercher(i, f, x, z, ord === O.TENIR && !loin ? 1 : 2, r2);
              if (nouvelle >= 0) { if (nouvelle !== cible) { cible = nouvelle; ucib[i] = cible; ucibg[i] = ugen[cible]; } }
              else if (cible < 0) {
                // Riposte : on rend le coup à qui nous frappe, s'il est encore là et à portée de recherche.
                const a = uagr[i];
                if (a >= 0 && ufac[a] < 3 && uetat[a] !== ET.HORS_JEU && hostile[f * 4 + ufac[a]]) {
                  const dx = ux[a] - x, dz = uz[a] - z;
                  if (dx * dx + dz * dz <= r2) { cible = a; ucib[i] = a; ucibg[i] = ugen[a]; }
                }
                uagr[i] = -1;
              }
            }
          }
          if (cible >= 0) {
            const dx = ux[cible] - x, dz = uz[cible] - z, d2 = dx * dx + dz * dz, r = portee + T.rayon[utyp[cible]];
            if (ord === O.AUCUN && ((ubx[i] - x) * (ubx[i] - x) + (ubz[i] - z) * (ubz[i] - z)) > LAISSE2) {
              ucib[i] = -1; cible = -1;              // trop loin de son poste : on lâche et on revient
            } else if (d2 <= r * r) {
              ucap[i] = CAP(dx, dz, ucap[i]);
              uetat[i] = ET.ATTAQUE;
              if (uassaut[i] > 0) {
                // L'élan d'une charge arrive au contact : le choc, le recul de la cible, sa chute.
                uassaut[i] = 0;
                frapper(i, cible, T.chPres[t], 4);
                const d = Math.sqrt(d2) | 0;
                if (d > 0 && !T.vehicule[utyp[cible]]) deplacer(cible, Math.trunc(dx * T.chRecul[t] / d), Math.trunc(dz * T.chRecul[t] / d));
                mettreATerre(cible, CAUSE.CHARGE, f, T.chPerce[t] === 1);
              } else if (T.pres[t]) frapper(i, cible, T.pres[t], 0);
              // Au contact d'un groupe, la Compagnie annonce une salve.
              if (T.salve[t] && urech[i] === 0 && pres[ufac[cible] * N8 + uc8[cible]] >= 6) lancerSalve(i, ux[cible], uz[cible]);
            } else if (T.pierres[t] && urech[i] === 0 && d2 >= T.piMin2[t] && d2 <= T.piMax2[t]) {
              // De loin, avant le contact : une pierre, puis on reprend sa marche.
              lancerPierre(i, cible, t, f, dx, dz);
            } else if (ord === O.ATTAQUER && d2 > DIRECT2) {
              // Cible désignée et lointaine : le champ mène vers elle ; on le refait si elle s'est éloignée de 16 m.
              if (((i + it) % 40) === 0) {
                const ex = ux[cible] - ubx[i], ez = uz[cible] - ubz[i];
                if (ex * ex + ez * ez > 16000 * 16000) { ubx[i] = ux[cible]; ubz[i] = uz[cible]; viser(i, nav.cleDe(ubx[i], ubz[i])); }
              }
              const etat = avancerVers(i, v);
              if (etat === 1) { ubx[i] = ux[cible]; ubz[i] = uz[cible]; versPoint(x, z, ubx[i], ubz[i], v); }
              sx = PX; sz = PZ; marche = true;
              uetat[i] = ET.MARCHE;
            } else if (ord !== O.TENIR) {
              // La charge (Patrouille, Béliers) : à portée d'élan, l'unité fonce deux secondes au plus.
              let va = v;
              if (T.charge[t]) {
                if (uassaut[i] === 0 && urech[i] === 0 && d2 >= T.chMin2[t] && d2 <= T.chMax2[t]) {
                  uassaut[i] = T.chDuree[t]; urech[i] = T.chRech[t] + (i & 31);
                  bilan[f].charges++;
                  const c8 = uc8[i];
                  if (it - derniereCharge[c8] >= IT_S) { derniereCharge[c8] = it; evenement(EV.CHARGE, x, z, f, RADIANS[CAP(dx, dz)], t); }
                }
                if (uassaut[i] > 0) va = (v * T.chElan[t]) >> 4;
              }
              versPoint(x, z, ux[cible], uz[cible], va);
              sx = PX; sz = PZ; marche = true;
              uetat[i] = uassaut[i] > 0 ? ET.ASSAUT : ET.ATTAQUE;
            }
            if (T.jet[t] && usal[i] === 0 && d2 <= JET_PORTEE * JET_PORTEE) lancerJet(i, ux[cible], uz[cible]);
            if (T.salve[t] && urech[i] === 0 && d2 <= SALVE_PORTEE * SALVE_PORTEE && d2 > r * r
              && pres[ufac[cible] * N8 + uc8[cible]] >= 8) lancerSalve(i, ux[cible], uz[cible]);
          }
          if (cible < 0) {
            if (ord === O.ATTAQUE_MVT || ord === O.ATTAQUER) {
              const etat = avancerVers(i, v);
              sx = PX; sz = PZ; marche = true; uetat[i] = ET.MARCHE;
              if (etat !== 0) { arriver(i); marche = false; }
            } else if (ord === O.AUCUN) {
              const dx = ubx[i] - x, dz = ubz[i] - z;
              if (dx * dx + dz * dz > 1500 * 1500) { versPoint(x, z, ubx[i], ubz[i], v); sx = PX; sz = PZ; marche = true; uetat[i] = ET.MARCHE; }
              else { uetat[i] = ET.OISIF; if (T.recolter[t]) oisifs[f]++; }
            } else uetat[i] = ET.TIENT;
          }
        } else if (ord === O.ALLER || ord === O.REGROUPER || ord === O.REPLI) {
          if (ord === O.REPLI) v = (v * 13) / 10 | 0;
          const etat = avancerVers(i, v);
          sx = PX; sz = PZ; marche = true;
          if (ord === O.REPLI && (zoneBase[uc4[i]] & (1 << f))) { quitterOrdre(i); uetat[i] = ET.OISIF; ubx[i] = x; ubz[i] = z; marche = false; sx = sz = 0; }
          else if (etat !== 0) { arriver(i); marche = false; }
        } else if (ord === O.RECOLTER) {
          const r = recolter(i, f, x, z, v);
          if (r) { sx = PX; sz = PZ; marche = true; }
        } else if (ord === O.CAPACITE) {
          // Sur ordre : 3 cocktail (Furets), 2 grenade (Compagnie, capacité seconde), 1 salve, 0 jet.
          const dx = usx[i] - x, dz = usz[i] - z, d2 = dx * dx + dz * dz;
          const sorte = T.molotov[t] ? 3 : (umode[i] & M_SECONDE) ? 2 : T.salve[t] ? 1 : 0;
          const portee = sorte === 3 ? MO_MAX : sorte === 2 ? LA_MAX : sorte === 1 ? SALVE_PORTEE : JET_PORTEE;
          if (d2 <= portee * portee) {
            if (sorte >= 2) {
              // À portée, le lanceur attend sa recharge s'il le faut ; sans Matériaux, l'ordre du cocktail tombe.
              if ((sorte === 3 ? urech[i] : urech2[i]) > 0 && (sorte === 2 || res[f * 2 + 1] >= MO_COUT)) uetat[i] = ET.OISIF;
              else {
                const tx = usx[i], tz = usz[i];
                quitterOrdre(i); ubx[i] = x; ubz[i] = z; uetat[i] = ET.OISIF;
                if (sorte === 3) lancerMolotov(i, tx, tz); else lancerGrenade(i, tx, tz);
              }
            } else {
              if (sorte === 1) lancerSalve(i, usx[i], usz[i]); else lancerJet(i, usx[i], usz[i]);
              quitterOrdre(i); ubx[i] = x; ubz[i] = z; uetat[i] = ET.CAPACITE;
            }
          } else {
            const etat = avancerVers(i, v);
            sx = PX; sz = PZ; marche = true;
            if (etat === 2) { quitterOrdre(i); ubx[i] = x; ubz[i] = z; }
          }
        } else {
          // Casser, lever, bâtir.
          const r = travailler(i, f, t, ord, x, z, v);
          if (r) { sx = PX; sz = PZ; marche = true; }
        }

        // ---- Contournement : près d'un foyer ou d'un nuage, on ne s'en approche pas ; on glisse autour de lui. ----
        if (contour && marche && !T.vehicule[t]) {
          const dot = sx * contourX + sz * contourZ;
          if (dot < 0) {
            const d2 = contourX * contourX + contourZ * contourZ;
            sx -= Math.trunc(dot * contourX / d2); sz -= Math.trunc(dot * contourZ / d2);
            const l2 = sx * sx + sz * sz;
            if (l2 * 16 > v * v) { const l = Math.sqrt(l2); sx = Math.trunc(sx * v / l); sz = Math.trunc(sz * v / l); }
          }
        }

        // ---- Écartement de la foule : le gradient du champ de densité, plus un étalement dans la case. ----
        // Une unité au repos ne s'écarte que dans une case fine de trois unités ou plus (deux tiennent sur 4 m²).
        const c2 = uc2[i], dc = dens[c2];
        if (dc > 2 || (marche && dc > 0)) {
          let g = dens[c2 - 1]; const gx0 = g === MUR ? dc : g;
          g = dens[c2 + 1]; const gx1 = g === MUR ? dc : g;
          g = dens[c2 - nx2]; const gz0 = g === MUR ? dc : g;
          g = dens[c2 + nx2]; const gz1 = g === MUR ? dc : g;
          let px = (gx0 - gx1) * SEPARATION, pz = (gz0 - gz1) * SEPARATION;
          if (dc > 1) {
            // Chaque unité a sa place dans la case fine, tirée de son emplacement : on ne se superpose pas.
            // Place relative au coin de la case : 232..1767 mm sur chaque axe ; zone morte de 24 mm.
            const hsh = Math.imul(i, 0x9E3779B1) >>> 0;
            const ex = 1000 + ((((hsh & 1023) - 512) * 3) >> 1) - ((x - X0) % FIN);
            const ez = 1000 + (((((hsh >>> 10) & 1023) - 512) * 3) >> 1) - ((z - Z0) % FIN);
            px += ex > 24 ? ETALEMENT : ex < -24 ? -ETALEMENT : 0;
            pz += ez > 24 ? ETALEMENT : ez < -24 ? -ETALEMENT : 0;
          }
          if (px > SEPARATION_MAX) px = SEPARATION_MAX; else if (px < -SEPARATION_MAX) px = -SEPARATION_MAX;
          if (pz > SEPARATION_MAX) pz = SEPARATION_MAX; else if (pz < -SEPARATION_MAX) pz = -SEPARATION_MAX;
          if (marche && dc > 2) { sx = (sx * 5 / (3 + dc)) | 0; sz = (sz * 5 / (3 + dc)) | 0; }
          sx += px | 0; sz += pz | 0;
        }
        if (sx !== 0 || sz !== 0) {
          const bouge = deplacer(i, sx, sz);
          if (marche) {
            if ((sx > 40 || sx < -40 || sz > 40 || sz < -40) && uetat[i] !== ET.ATTAQUE) ucap[i] = CAP(sx, sz, ucap[i]);
            if (!bouge) { if (ubloc[i] < 255) ubloc[i]++; } else if (ubloc[i]) ubloc[i]--;
            // Coincée depuis deux secondes près du but : elle s'arrête là.
            if (ubloc[i] > 40 && (ord === O.ALLER || ord === O.ATTAQUE_MVT || ord === O.REGROUPER || ord === O.ATTAQUER)) arriver(i);
          }
        }
      }
    }

    /** Fin d'un ordre : l'unité devient oisive et prend sa position comme poste. */
    function arriver(i) {
      quitterOrdre(i);
      ubx[i] = ux[i]; ubz[i] = uz[i];
      uetat[i] = ET.OISIF;
    }
    function lancerSalve(i, x, z) {
      if (urech[i] > 0 || usal[i] > 0) return;
      usx[i] = x; usz[i] = z; usal[i] = SALVE_ANNONCE_IT; urech[i] = SALVE_RECHARGE_IT;
      umode[i] &= ~M_JET;
      uetat[i] = ET.CAPACITE;
      evenement(EV.SALVE_ANNONCE, x, z, ufac[i], SALVE.rayon, SALVE.annonce);
    }
    function lancerJet(i, x, z) {
      if (usal[i] > 0) return;
      usx[i] = x; usz[i] = z; usal[i] = JET_IT; umode[i] |= M_JET;
      uetat[i] = ET.CAPACITE;
      ucap[i] = CAP(x - ux[i], z - uz[i], ucap[i]);
    }

    /** La récolte : aller au gisement, attendre une place, récolter, rapporter au dépôt le plus proche. */
    function recolter(i, f, x, z, v) {
      const g = ucib[i], gs = gis[g];
      const ph = uphase[i];
      if (ph === PH.VERS || ph === PH.ATTENTE) {
        const dx = gs.x - x, dz = gs.z - z, dedans = dx * dx + dz * dz <= gs.rayon * gs.rayon;
        if (stock[g] <= 0) { if (!changerGisement(i, g)) { quitterOrdre(i); uetat[i] = ET.OISIF; ubx[i] = x; ubz[i] = z; } return false; }
        if (dedans && ((i + it) & 7) === 0 || (dedans && ph === PH.VERS)) {
          if (actifs[g] < K.RECOLTEURS_MAX) { actifs[g]++; uphase[i] = PH.RECOLTE; uminu[i] = RECOLTE_IT; uetat[i] = ET.RECOLTE; return false; }
          uphase[i] = PH.ATTENTE; uetat[i] = ET.OISIF;
        }
        if (uphase[i] === PH.ATTENTE) return false;
        const etat = avancerVers(i, v);
        uetat[i] = ET.MARCHE;
        if (etat === 2) { quitterOrdre(i); uetat[i] = ET.OISIF; ubx[i] = x; ubz[i] = z; return false; }
        return true;
      }
      if (ph === PH.RECOLTE) {
        uetat[i] = ET.RECOLTE;
        if (--uminu[i] > 0) return false;
        // 0.3 : la charge suit l'échelle, comme les coûts, les stocks et les autres revenus (à 100 000 unités, les
        // 800 places des gisements rapportaient autant qu'à 20 000 : la production ne comptait plus).
        const pris = Math.min(K.CHARGE_RECOLTE * echelle, stock[g]);
        stock[g] -= pris; actifs[g]--;
        if (pris > 0 && stock[g] === 0) evenement(EV.GISEMENT_EPUISE, gs.x, gs.z, -1, g, 0);
        ucharge[i] = pris;
        uphase[i] = PH.RETOUR; uetat[i] = ET.CHARGE;
        if (uchamp[i] >= 0) nav.lacher(uchamp[i]);
        viser(i, cleBase(f));
        const q = structures[f];
        ubx[i] = q.sortieX; ubz[i] = q.sortieZ;
        return false;
      }
      // Retour au dépôt : la première case de base du camp termine le voyage.
      if (zoneBase[uc4[i]] & (1 << f)) {
        const montant = ucharge[i] * 1000 * facteurRevenu[f] / 5;
        const r = f * 2 + (gs.moyens ? 0 : 1);
        res[r] += montant; revenuSeconde[r] += montant;
        bilan[f].recolte += ucharge[i];
        ucharge[i] = 0;
        if (stock[g] > 0) envoyerRecolter(i, g);
        else if (!changerGisement(i, g)) { quitterOrdre(i); uetat[i] = ET.OISIF; ubx[i] = x; ubz[i] = z; }
        return false;
      }
      const etat = avancerVers(i, v);
      uetat[i] = ET.CHARGE;
      if (etat === 2) {
        // Plus de chemin vers la base : on vise la sortie du QG en ligne droite.
        const q = structures[f];
        versPoint(x, z, q.sortieX, q.sortieZ, v);
      }
      return true;
    }
    /** Le gisement de même sorte le plus proche qui a encore du stock ; rend vrai si on en a trouvé un. */
    function changerGisement(i, g) {
      const moyens = gis[g].moyens;
      let meilleur = -1, md = Infinity;
      for (let k = 0; k < NG; k++) {
        if (stock[k] <= 0 || gis[k].moyens !== moyens) continue;
        const dx = gis[k].x - ux[i], dz = gis[k].z - uz[i], d = dx * dx + dz * dz;
        if (d < md) { md = d; meilleur = k; }
      }
      if (meilleur < 0) return false;
      if (ucharge[i] > 0) { ucib[i] = meilleur; return true; }
      envoyerRecolter(i, meilleur);
      return true;
    }

    /** Casser, lever, bâtir : au plus près de la cible, l'unité y travaille ; rend vrai si elle marche. */
    function travailler(i, f, t, ord, x, z, v) {
      const cassable = (umode[i] & M_CASSABLE) !== 0, cible = ucib[i];
      let portee2, d2, s = null;
      if (cassable) {
        if (casEtat[cible]) { if (!enchainerCasse(i, f)) arriver(i); return false; }
        const dx = casX[cible] - x, dz = casZ[cible] - z;
        d2 = dx * dx + dz * dz; portee2 = (PORTEE_TRAVAIL + 1200) * (PORTEE_TRAVAIL + 1200);
      } else {
        s = structures[cible];
        if (!s.vivante || (ord === O.BARRICADER && !s.chantier) || (ord === O.CONSTRUIRE && !s.chantier)) { arriver(i); return false; }
        if (s.sorte === S_BARRICADE) { d2 = distSegment2(s, x, z); portee2 = PORTEE_TRAVAIL * PORTEE_TRAVAIL; }
        else { const dx = s.x - x, dz = s.z - z; d2 = dx * dx + dz * dz; portee2 = PORTEE_POSTE * PORTEE_POSTE; }
      }
      if (d2 > portee2) {
        const etat = avancerVers(i, v);
        uetat[i] = ET.MARCHE;
        if (etat === 1) {
          // Arrivée à sa place mais encore loin de la cible : on finit en ligne droite.
          versPoint(x, z, cassable ? casX[cible] : s.sorte === S_BARRICADE ? (s.x + s.x2) >> 1 : s.x, cassable ? casZ[cible] : s.sorte === S_BARRICADE ? (s.z + s.z2) >> 1 : s.z, v);
          if (++ubloc[i] > 60) { arriver(i); return false; }
        } else if (etat === 2) { arriver(i); return false; }
        return true;
      }
      if (cassable) {
        uetat[i] = ET.CASSE;
        ucap[i] = CAP(casX[cible] - x, casZ[cible] - z, ucap[i]);
        casPv[cible] -= K.CASSER_PAR_S * 1000 / IT_S * T.casser[t];
        if (casPv[cible] <= 0) {
          casEtat[cible] = 1; versionCassables++;
          const montant = casRend[cible] * facteurRevenu[f] / 5;
          res[f * 2 + 1] += montant; revenuSeconde[f * 2 + 1] += montant;
          bilan[f].casses++;
          evenement(EV.CASSE, casX[cible], casZ[cible], f, cible, casSorte[cible]);
          allumerCassable(cible, f, 0);
          if (!enchainerCasse(i, f)) arriver(i);
        }
        return false;
      }
      const mx = (s.x + s.x2) >> 1, mz = (s.z + s.z2) >> 1;
      ucap[i] = CAP(mx - x, mz - z, ucap[i]);
      if (ord === O.BARRICADER || ord === O.CONSTRUIRE) {
        uetat[i] = ET.CONSTRUIT;
        s.travail++;
        s.pv = Math.trunc(s.pvMax * Math.min(s.travail, s.travailMax) / s.travailMax);
        if ((s.travail & 7) === 0) structuresDetail++;
        if (s.travail >= s.travailMax) finirStructure(s);
        return false;
      }
      // Lever ou casser une structure.
      uetat[i] = ord === O.LEVER ? ET.LEVE : ET.CASSE;
      s.pv -= ord === O.LEVER ? K.LEVER_PAR_S * 1000 / IT_S * T.lever[t] : K.CASSER_PAR_S * 1000 / IT_S * T.casser[t];
      structuresDetail++;
      if (s.pv <= 0) {
        if (s.sorte === S_BARRICADE) {
          // Lever rend au Bastion ou à la Préfecture la moitié des Matériaux de la barricade (§1.4) ; la Convergence
          // qui retire la sienne ne récupère rien.
          bilan[f].barricadesLevees++;
          if (f !== CONV) {
            const rendu = Math.trunc(s.coutX * K.BARRICADE.rendement);
            res[f * 2 + 1] += rendu; revenuSeconde[f * 2 + 1] += rendu;
          }
        }
        detruire(s, f);
        if (ord === O.LEVER && enchainerLevee(i, f, s)) return false;
        arriver(i);
      }
      return false;
    }
    function finirStructure(s) {
      s.chantier = false; s.pv = s.pvMax;
      versionStructures++;
      if (s.sorte === S_BARRICADE) {
        nav.obstacle(s.cases, s.nCases, 1);
        evenement(EV.BARRICADE_FINIE, (s.x + s.x2) >> 1, (s.z + s.z2) >> 1, s.faction, s.id, 0);
      } else {
        majZonesBase();
        evenement(EV.STRUCTURE_FINIE, s.x, s.z, s.faction, s.id, 0);
      }
    }
    /** Après une casse, l'objet intact le plus proche à moins de 15 m. */
    function enchainerCasse(i) {
      // L'objet qu'on vient de casser brûle : on s'écarte, on n'enchaîne pas sur le voisin.
      if (casEtat[ucib[i]] === 2) return false;
      const c8 = uc8[i], ci = c8 % nx8, cj = (c8 / nx8) | 0;
      let meilleur = -1, md = 15000 * 15000;
      for (let j = Math.max(0, cj - 2); j <= Math.min(nz8 - 1, cj + 2); j++) for (let ii = Math.max(0, ci - 2); ii <= Math.min(nx8 - 1, ci + 2); ii++) {
        const cc = ii + j * nx8;
        for (let p = casDebut[cc]; p < casDebut[cc + 1]; p++) {
          const k = casListe[p];
          if (casEtat[k]) continue;
          const dx = casX[k] - ux[i], dz = casZ[k] - uz[i], d = dx * dx + dz * dz;
          if (d < md) { md = d; meilleur = k; }
        }
      }
      if (meilleur < 0) return false;
      envoyerTravail(i, O.CASSER, meilleur, true);
      return true;
    }
    /** Après une levée, la barricade levable la plus proche à moins de 20 m. */
    function enchainerLevee(i, f, faite) {
      let meilleure = null, md = 20000 * 20000;
      for (const s of structures) {
        if (!s.vivante || s.sorte !== S_BARRICADE || s === faite || !R.peutLever(f, vueStructure(s), alliance)) continue;
        const d = distSegment2(s, ux[i], uz[i]);
        if (d < md) { md = d; meilleure = s; }
      }
      if (!meilleure) return false;
      envoyerTravail(i, O.LEVER, meilleure.id, false);
      return true;
    }

    /** Applique les coups de l'itération : cohésion, hors jeu, repli automatique sous 25 %. */
    function degats() {
      for (let q = 0; q < nTouches; q++) {
        const i = touches[q];
        if (ufac[i] === LIBRE || uetat[i] === ET.HORS_JEU) { udeg[i] = 0; continue; }
        ucoh[i] -= udeg[i]; udeg[i] = 0; utouche[i] = TOUCHE_IT;
        const t = utyp[i];
        if (ucoh[i] <= 0) { horsJeu(i); continue; }
        if (ucoh[i] * 100 < T.coh[t] * REPLI_PCT && uord[i] !== O.TENIR && uord[i] !== O.REPLI) commencerRepli(i, true);
      }
      nTouches = 0;
    }

    /** Production par lots : la tête de chaque file avance ; à terme, le lot sort à côté du producteur. */
    function production() {
      for (const s of structures) {
        if (!s.vivante || s.chantier || !s.file.length) continue;
        // Occupé (QG ou avant-poste), ou avant-poste en feu : rien ne sort.
        if (s.occupe || (s.feu && s.sorte === S_POSTE)) continue;
        const o = s.file[0];
        if (o.reste > 0) { o.reste--; if ((o.reste & 3) === 0) structuresDetail++; continue; }
        const f = s.faction, t = o.type;
        if (pop[f] + o.lot * T.pop[t] > popMax[f]) continue;          // au plafond : le lot attend
        if (fines.length < o.lot) fines = new Int32Array(o.lot * 2);
        const k = nav.remplir(s.sortieX, s.sortieZ, Math.ceil(o.lot / 2), fines, fc => dens[fc] < 2);
        if (!k) continue;
        let sorties = 0;
        const ids = new Int32Array(o.lot);
        for (let q = 0; q < o.lot; q++) {
          const fc = fines[Math.min(k - 1, q >> 1)];
          const i = creerUnite(f, t, nav.fineX(fc) + ((q & 1) ? 500 : -500), nav.fineZ(fc), CAP(s.sortieX - s.x, s.sortieZ - s.z));
          if (i < 0) break;
          ids[sorties++] = i;
        }
        s.file.shift();
        versionStructures++;
        bilan[f].produites += sorties;
        evenement(EV.PRODUCTION, s.sortieX, s.sortieZ, f, t, sorties);
        if (s.ralliement && sorties) {
          const cle = nav.cleDe(s.ralliement[0], s.ralliement[1]);
          for (let q = 0; q < sorties; q++) { uord[ids[q]] = O.ALLER; uetat[ids[q]] = ET.MARCHE; viser(ids[q], cle); }
          former(ids, sorties, s.ralliement[0], s.ralliement[1], 2);
        }
      }
    }

    /** Présence par camp sur un disque de cases de 8 m. */
    const compte = new Int32Array(3);
    function compter(cases) {
      compte[0] = compte[1] = compte[2] = 0;
      for (let q = 0; q < cases.length; q++) {
        const c = cases[q];
        compte[0] += pres[c]; compte[1] += pres[N8 + c]; compte[2] += pres[2 * N8 + c];
      }
    }
    /** Lieux (prise en 15 s sans ennemi, gelée par une présence ennemie) et occupation des QG (60 s, reprise 20 s). */
    function lieuxEtQG() {
      const pas = 4;
      for (let l = 0; l < NL; l++) {
        compter(lieux[l].cases);
        let camps = 0, seul = -1;
        for (let f = 0; f < 3; f++) if (compte[f] > 0 && !elimine[f]) { camps++; seul = f; }
        // Deux alliés présents comptent pour un seul côté ; le plus nombreux prend.
        let cotes = camps;
        if (camps === 2 && alliance && compte[alliance[0]] > 0 && compte[alliance[1]] > 0) {
          cotes = 1; seul = compte[alliance[0]] >= compte[alliance[1]] ? alliance[0] : alliance[1];
        }
        lieuConteste[l] = cotes > 1 ? 1 : 0;
        if (cotes !== 1) continue;
        const prop = lieuProp[l];
        if (prop === seul || (prop >= 0 && R.allies(prop, seul, alliance))) { lieuPreneur[l] = -1; lieuProgres[l] = 0; continue; }
        if (lieuPreneur[l] !== seul) { lieuPreneur[l] = seul; lieuProgres[l] = 0; }
        lieuProgres[l] += pas;
        if (lieuProgres[l] >= PRISE_IT) {
          if (prop >= 0) evenement(EV.LIEU_NEUTRALISE, lieux[l].x, lieux[l].z, prop, l, 0);
          lieuProp[l] = seul; lieuPreneur[l] = -1; lieuProgres[l] = 0;
          bilan[seul].lieuxPris++;
          evenement(EV.LIEU_PRIS, lieux[l].x, lieux[l].z, seul, l, 0);
        }
      }
      for (let f = 0; f < 3; f++) {
        const q = structures[f];
        compter(q.parvis);
        let defenseurs = 0, ennemis = 0, occupant = -1, plus = 0;
        for (let g = 0; g < 3; g++) {
          if (!compte[g]) continue;
          if (g === f || R.allies(f, g, alliance)) defenseurs += compte[g];
          else { ennemis += compte[g]; if (compte[g] > plus) { plus = compte[g]; occupant = g; } }
        }
        if (!q.occupe) {
          // En démo, un QG ne s'occupe pas : chaque camp garde sa base et ses renforts, le spectacle dure (§1.11).
          if (ennemis > 0 && defenseurs === 0 && !DEMO) {
            q.occupation += pas; structuresDetail++;
            if (q.occupation >= K.OCCUPATION_QG_S * IT_S) { q.occupe = true; q.reprise = 0; versionStructures++; evenement(EV.QG_OCCUPE, q.x, q.z, f, occupant, 0); }
          }
        } else if (defenseurs > 0 && ennemis === 0) {
          q.reprise += pas;
          if (q.reprise >= K.REPRISE_QG_S * IT_S) { q.occupe = false; q.occupation = 0; q.reprise = 0; versionStructures++; evenement(EV.QG_REPRIS, q.x, q.z, f, 0, 0); }
        } else q.reprise = 0;
      }
      // 0.3 : un avant-poste achevé s'occupe comme un QG, en 30 s (reprise : 10 s). Occupé, il ne produit plus, ne
      // soutient plus, ne sert plus de dépôt et ne compte plus comme base.
      let zones = false;
      for (let k = 3; k < structures.length; k++) {
        const s = structures[k];
        if (!s.vivante || s.sorte !== S_POSTE || s.chantier) continue;
        compter(s.parvis);
        const f = s.faction;
        let defenseurs = 0, ennemis = 0, occupant = -1, plus = 0;
        for (let g = 0; g < 3; g++) {
          if (!compte[g]) continue;
          if (g === f || R.allies(f, g, alliance)) defenseurs += compte[g];
          else { ennemis += compte[g]; if (compte[g] > plus) { plus = compte[g]; occupant = g; } }
        }
        if (!s.occupe) {
          if (ennemis > 0 && defenseurs === 0) {
            s.occupation += pas; structuresDetail++;
            if (s.occupation >= K.OCCUPATION_POSTE_S * IT_S) { s.occupe = true; s.reprise = 0; versionStructures++; zones = true; evenement(EV.POSTE_OCCUPE, s.x, s.z, f, s.id, occupant); }
          } else if (s.occupation > 0 && ennemis === 0) { s.occupation = Math.max(0, s.occupation - pas); structuresDetail++; }
        } else if (defenseurs > 0 && ennemis === 0) {
          s.reprise += pas;
          if (s.reprise >= K.REPRISE_POSTE_S * IT_S) { s.occupe = false; s.occupation = 0; s.reprise = 0; versionStructures++; zones = true; evenement(EV.POSTE_REPRIS, s.x, s.z, f, s.id, 0); }
        } else s.reprise = 0;
      }
      if (zones) majZonesBase();
    }

    /** Une fois par seconde : revenus des lieux, dotation de la Préfecture, points, fenêtre des revenus. */
    function economie() {
      const s = (it / IT_S) | 0, case60 = s % 60;
      for (let f = 0; f < 3; f++) {
        if (elimine[f]) continue;
        let tenus = 0;
        for (let l = 0; l < NL; l++) if (lieuProp[l] === f) tenus++;
        score[f] += tenus;
        let parMinute = tenus * K.REVENU_LIEU * 1000 * echelle;
        if (f === PREF && !structures[PREF].occupe) parMinute += K.DOTATION_PREFECTURE * 1000 * echelle;
        acc[f] += parMinute * facteurRevenu[f];
        const gain = Math.trunc(acc[f] / 300);              // ÷ 60 s × facteur / 5
        acc[f] -= gain * 300;
        res[f * 2] += gain; revenuSeconde[f * 2] += gain;
        if (jetons[f] < JETONS_MAX) jetons[f] = Math.min(JETONS_MAX, jetons[f] + echelle);
        for (let r = 0; r < 2; r++) { revenus[(f * 2 + r) * 60 + case60] = revenuSeconde[f * 2 + r]; revenuSeconde[f * 2 + r] = 0; }
      }
    }

    /** Le camp f a-t-il une base : son QG libre, ou un avant-poste achevé et libre ? */
    function aUneBase(f) {
      if (!structures[f].occupe) return true;
      for (let k = 3; k < structures.length; k++) {
        const s = structures[k];
        if (s.vivante && s.sorte === S_POSTE && s.faction === f && !s.chantier && !s.occupe) return true;
      }
      return false;
    }
    /** Le camp f quitte la partie : ses unités se dispersent, ses avant-postes tombent, ses lieux redeviennent neutres. */
    function eliminer(f) {
      elimine[f] = 1; sansBase[f] = 0;
      evenement(EV.ELIMINATION, 0, 0, f, 0, 0);
      for (let i = 0; i < nHaut; i++) if (ufac[i] === f && uetat[i] !== ET.HORS_JEU) horsJeu(i, true);
      for (let l = 0; l < NL; l++) if (lieuProp[l] === f) { lieuProp[l] = -1; evenement(EV.LIEU_NEUTRALISE, lieux[l].x, lieux[l].z, f, l, 0); }
      for (let k = 3; k < structures.length; k++) { const s = structures[k]; if (s.vivante && s.sorte === S_POSTE && s.faction === f) detruire(s, f); }
      structures[f].file.length = 0; versionStructures++;
      if (alliance && (alliance[0] === f || alliance[1] === f)) { alliance = null; majHostilite(); }
    }
    /**
     * Une fois par seconde : la déroute, l'élimination, puis la fin de la partie selon options.victoire (§1.7).
     * Élimination, dans tous les modes : un camp resté 30 s sans base (QG occupé, aucun avant-poste achevé et libre), ou
     * aussitôt s'il est sans base avec moins de 2 % de ses effectifs de départ. Fin : le dernier camp (ou la dernière
     * alliance) debout ; la cible de points (« points », « mixte ») ; la limite de temps (« temps », « mixte » : le
     * meilleur score) ; sinon la limite de sécurité (« dernier », démo : le plus d'unités ; « points » : le meilleur score).
     */
    function victoire() {
      for (let f = 0; f < 3; f++) {
        if (elimine[f]) continue;
        const q = structures[f];
        if (aUneBase(f)) {
          if (sansBase[f] > 0) { sansBase[f] = 0; evenement(EV.BASE_REPRISE, q.x, q.z, f, 0, 0); }
          continue;
        }
        if (sansBase[f] === 0) evenement(EV.DEROUTE, q.x, q.z, f, K.DEROUTE_S, 0);
        sansBase[f] += IT_S;
        if (sansBase[f] >= DEROUTE_IT || vivantes[f] * 100 < depart[f] * K.ELIMINATION_PART * 100) eliminer(f);
      }
      const enJeu = [0, 1, 2].filter(f => !elimine[f]);
      const cotes = [];
      for (const f of enJeu) {
        if (alliance && alliance.includes(f)) { if (!cotes.some(c => c.length === 2)) cotes.push(alliance.slice()); } else cotes.push([f]);
      }
      const codeCote = c => (c.length === 2 ? P.VAINQUEUR.ALLIANCE : c[0]);
      const total = (c, table) => c.reduce((s, f) => s + table[f], 0);
      /** Le côté qui a le plus (de points, d'unités) l'emporte ; à égalité, personne. */
      const departager = (table, r) => {
        let meilleur = -1, haut = -1, egal = false;
        cotes.forEach((c, k) => {
          const t = total(c, table);
          if (t > haut) { haut = t; meilleur = k; egal = false; } else if (t === haut) egal = true;
        });
        finir(egal ? P.VAINQUEUR.NUL : codeCote(cotes[meilleur]), r);
      };
      if (cotes.length === 0) { finir(P.VAINQUEUR.NUL, 5); return; }
      if (cotes.length === 1 && enJeu.length < 3) { finir(codeCote(cotes[0]), 1); return; }
      if (ciblePoints) for (const c of cotes) if (total(c, score) >= ciblePoints) { finir(codeCote(c), 2); return; }
      if (limiteTemps && it >= limiteTemps) { departager(score, 3); return; }
      if (plafondIt && it >= plafondIt) departager(!DEMO && VIC.mode === 'points' ? score : vivantes, 4);
    }
    /** Fin de la partie ; r : indice de la raison dans P.RAISONS_FIN. */
    function finir(v, r) {
      vainqueur = v; raison = r;
      evenement(EV.VICTOIRE, 0, 0, -1, v, r);
    }

    // ---- Brouillard du joueur et de son allié (cases de 8 m), toutes les 4 itérations. ----
    const DISQUES = [null];
    for (let r = 1; r <= 4; r++) {
      const d = [];
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r + r) d.push(di, dj);
      DISQUES.push(Int8Array.from(d));
    }
    function majVoile() {
      const voit = [0, 1, 2].map(f => opt.joueur >= 0 && (f === opt.joueur || R.allies(f, opt.joueur, alliance)));
      vision.fill(0);
      for (let i = 0; i < nHaut; i++) {
        const f = ufac[i];
        if (f === LIBRE || !voit[f] || uetat[i] === ET.HORS_JEU) continue;
        const r = T.r8[utyp[i]], c = uc8[i];
        if (vision[c] < r) vision[c] = r;
      }
      for (const s of structures) {
        if (!s.vivante || !voit[s.faction]) continue;
        const f = nav.fineDe(s.x, s.z), c = ((f % nx2) >> 2) + (((f / nx2) | 0) >> 2) * nx8;
        const r = s.sorte === S_QG ? 4 : s.sorte === S_POSTE ? 3 : 1;
        if (vision[c] < r) vision[c] = r;
      }
      for (let c = 0; c < N8; c++) if (voile[c] > 0) voile[c] = voile[c] > 40 ? voile[c] - 40 : 0;
      for (let c = 0; c < N8; c++) {
        const r = vision[c];
        if (!r) continue;
        const ci = c % nx8, cj = (c / nx8) | 0, d = DISQUES[r];
        for (let q = 0; q < d.length; q += 2) {
          const i = ci + d[q], j = cj + d[q + 1];
          if (i >= 0 && j >= 0 && i < nx8 && j < nz8) voile[i + j * nx8] = 255;
        }
      }
    }

    function minicarte() {
      const m = new Uint16Array(MINI * MINI * 3);
      for (let i = 0; i < nHaut; i++) {
        const f = ufac[i];
        if (f === LIBRE || uetat[i] === ET.HORS_JEU) continue;
        const a = Math.trunc((ux[i] - miniX0) / miniCote), b = Math.trunc((uz[i] - miniZ0) / miniCote);
        if (a < 0 || b < 0 || a >= MINI || b >= MINI) continue;
        const k = (a + b * MINI) * 3 + f;
        if (m[k] < 65535) m[k]++;
      }
      return m;
    }

    // ---- Empreinte : FNV-1a 64 bits de tout l'état. ----
    // Toutes les 100 itérations, l'état est recopié d'un bloc (cliché) puis haché par cinquantièmes sur les
    // itérations suivantes : pas de pic. L'empreinte de l'itération k × 100 entre dans m.empreintes 50 itérations
    // plus tard ; elle vaut exactement m.empreinte() appelée à l'itération k × 100.
    const PAR_UNITE = [ux, uz, ucoh, ubx, ubz, ucib, ufac, utyp, ucap, uetat, uord, uphase, umode, ucharge, uminu, urech, usal, uchamp, ugen,
      uterre, uimm, ulance, uassaut, urech2];
    const GLOBAUX = [res, acc, score, pop, vivantes, elimine, lieuProp, lieuPreneur, lieuProgres, stock, actifs, casEtat, casPv,
      sansBase, jetons, fX, fZ, fR, fReste, fAge, fDelai, fSorte, fCible, fCamp, fId, fGen, fActif, gX, gZ, gRc, gReste, gAge, gCamp, gId, gActif];
    let cliche = new Uint8Array(1 << 20);
    const ecrire = (vue, o) => {
      if (o + vue.length > cliche.length) { const plus = new Uint8Array(Math.max(cliche.length * 2, o + vue.length)); plus.set(cliche.subarray(0, o)); cliche = plus; }
      cliche.set(vue, o);
      return o + vue.length;
    };
    /** Recopie tout l'état dans le cliché ; rend sa longueur en octets. */
    function photographier() {
      const entete = Int32Array.of(it, alea | 0, nHaut, nLibres, colere, delaiAlliance, alliance ? alliance[0] * 3 + alliance[1] : -1,
        proposition ? proposition.de * 3 + proposition.a : -1, proposition ? proposition.reste : 0, vainqueur, nav.version,
        raison, nGisants, nFeux, prochainFeu, nNuages, prochainNuage, nVols, (sQueue - sTete) & (NPIERRES - 1));
      let o = ecrire(new Uint8Array(entete.buffer), 0);
      for (const a of PAR_UNITE) o = ecrire(new Uint8Array(a.buffer, 0, nHaut * a.BYTES_PER_ELEMENT), o);
      o = ecrire(new Uint8Array(libres.buffer, 0, nLibres * 4), o);
      for (const a of GLOBAUX) o = ecrire(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o);
      const st = [];
      for (const s of structures) {
        st.push(s.id, s.sorte, s.faction, s.x, s.z, s.x2, s.z2, s.pv, s.chantier ? 1 : 0, s.travail, s.feu ? 1 : 0, s.occupation, s.reprise,
          s.occupe ? 1 : 0, s.vivante ? 1 : 0, s.feux, s.feuCamp, s.file.length);
        for (const o2 of s.file) st.push(o2.type, o2.lot, o2.reste);
      }
      // Ce qui vole : cocktails et grenades, puis les pierres de la file, de la plus ancienne à la plus récente.
      for (let k = 0; k < nVols; k++) st.push(vIt[k], vX[k], vZ[k], vCamp[k], vSorte[k], vTireur[k]);
      for (let k = sTete; k !== sQueue; k = (k + 1) & (NPIERRES - 1)) st.push(sIt[k], sCible[k], sGen[k], sTireur[k], sCamp[k], sPres[k]);
      return ecrire(new Uint8Array(Int32Array.from(st).buffer), o);
    }
    /** L'empreinte de l'état présent, calculée d'un coup (essais, relecture). */
    function empreinte() {
      if (enCours) { enCours.pas = enCours.n; avancerEmpreinte(); }
      const n = photographier(), h = fnvDepart();
      fnvOctets(h, cliche, 0, n);
      return fnvHex(h);
    }
    const empreintes = [];
    let enCours = null;                            // { it, n, pos, h, pas }
    function avancerEmpreinte() {
      if (!enCours) return;
      const fin = Math.min(enCours.n, enCours.pos + enCours.pas);
      fnvOctets(enCours.h, cliche, enCours.pos, fin);
      enCours.pos = fin;
      if (fin === enCours.n) { empreintes.push([enCours.it, fnvHex(enCours.h)]); enCours = null; }
    }
    function lancerEmpreinte() {
      if (enCours) { enCours.pas = enCours.n; avancerEmpreinte(); }     // la précédente se termine d'abord
      const n = photographier();
      enCours = { it, n, pos: 0, h: fnvDepart(), pas: Math.ceil(n / 50) };
    }

    // ---- Le message ETAT. ----
    function etat(tampon, vitesse = 1) {
      const n = nHaut;
      const f32 = new Float32Array(tampon, 0, Math.max(1, n) * 4);
      const colereBastion = colere > 0 ? DR.COLERE : 0;
      let aTerre = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4, f = ufac[i];
        if (f === LIBRE) { f32[o] = 0; f32[o + 1] = 0; f32[o + 2] = 0; f32[o + 3] = LIBRE; continue; }
        const t = utyp[i];
        if (uetat[i] === ET.A_TERRE) aTerre++;
        let niveau = Math.trunc(ucoh[i] * 63 / T.coh[t]);
        if (niveau < 0) niveau = 0; else if (niveau > 63) niveau = 63;
        let d = 0;
        if (ucharge[i]) d |= DR.PORTE;
        if (utouche[i]) d |= DR.TOUCHE;
        if (f === BAST) d |= colereBastion;
        if (T.protege[t]) d |= DR.BOUCLIER;
        if (T.vehicule[t]) d |= DR.VEHICULE;
        f32[o] = ux[i] / 1000; f32[o + 1] = uz[i] / 1000; f32[o + 2] = RADIANS[ucap[i]];
        f32[o + 3] = f | (t << 2) | (uetat[i] << 6) | (niveau << 10) | (d << 16);
      }
      const msg = {
        type: 'etat', it, temps: it / IT_S, vitesse, n, unites: tampon,
        eco: [0, 1, 2].map(f => {
          let rm = 0, rx = 0;
          for (let s = 0; s < 60; s++) { rm += revenus[(f * 2) * 60 + s]; rx += revenus[(f * 2 + 1) * 60 + s]; }
          const q = structures[f];
          return { moyens: Math.floor(res[f * 2] / 1000), materiaux: Math.floor(res[f * 2 + 1] / 1000), pop: pop[f], popMax: popMax[f],
            score: score[f], revenu: { moyens: Math.round(rm / 1000), materiaux: Math.round(rx / 1000) }, oisifs: oisifs[f],
            elimine: !!elimine[f], qgOccupe: q.occupe ? 1 : Math.min(1, q.occupation / (K.OCCUPATION_QG_S * IT_S)), vivantes: vivantes[f],
            depart: depart[f], force: depart[f] > 0 ? vivantes[f] / depart[f] : 0,
            deroute: sansBase[f] > 0 ? Math.max(0, (DEROUTE_IT - sansBase[f]) / IT_S) : -1 };
        }),
        alliance: alliance ? alliance.slice() : null,
        proposition: proposition ? { de: proposition.de, a: proposition.a, reste: proposition.reste / IT_S } : null,
        colere: colere / IT_S,
        lieux: Array.from({ length: NL }, (_, l) => ({ proprietaire: lieuProp[l], progression: lieuProgres[l] / PRISE_IT,
          conteste: !!lieuConteste[l], preneur: lieuPreneur[l] })),
        victoire: { mode: VIC.mode, points: ciblePoints, duree: limiteTemps ? VIC.duree : 0,
          reste: limiteTemps ? Math.max(0, (limiteTemps - it) / IT_S) : -1, plafond: plafondIt / IT_S, demo: DEMO },
        structures: null, versionStructures: versionStructures + structuresDetail,
        cassables: null, gisements: null, voile: null, feux: null, nuages: null, minicarte: null, combats: null,
        evenements: ev.slice(0, nev * 6), vainqueur, raison: P.RAISONS_FIN[raison],
        mesure: { msIteration: 0, msIA: 0, msNav: mesure.msNav, vivantes: vivantes[0] + vivantes[1] + vivantes[2], champs: nav.champs.length,
          feux: nFeux, nuages: nNuages, aTerre, gisants: nGisants },
      };
      // La liste part à chaque changement majeur (pose, fin, destruction, file, occupation), et toutes les
      // 5 itérations au plus quand seuls les pv ou l'avancement des files bougent.
      if (versionStructures !== structuresEnvoyees || (structuresDetail !== detailEnvoye && it % 5 === 0)) {
        structuresEnvoyees = versionStructures; detailEnvoye = structuresDetail;
        msg.structures = structures.filter(s => s.vivante).map(s => ({
          id: s.id, sorte: SORTES_S[s.sorte], faction: s.faction, x: s.x / 1000, z: s.z / 1000, x2: s.x2 / 1000, z2: s.z2 / 1000,
          pv: s.sorte === S_QG ? 1 : Math.max(0, Math.round(s.pv / 1000)), pvMax: s.sorte === S_QG ? 1 : Math.round(s.pvMax / 1000),
          chantier: s.chantier, feu: s.feu,
          occupation: s.sorte === S_BARRICADE ? 0 : s.occupe ? 1 : s.occupation / ((s.sorte === S_QG ? K.OCCUPATION_QG_S : K.OCCUPATION_POSTE_S) * IT_S),
          file: s.file.map(o => ({ type: o.type, lot: o.lot, reste: o.reste / IT_S, total: o.total / IT_S })),
          ralliement: s.ralliement ? [s.ralliement[0] / 1000, s.ralliement[1] / 1000] : null,
        }));
      }
      if (versionCassables !== cassablesEnvoyes) { cassablesEnvoyes = versionCassables; msg.cassables = casEtat.slice(); }
      // Foyers et nuages : la liste entière, à chaque changement et quatre fois par seconde tant qu'il y en a.
      if (versionFeux !== feuxEnvoyes || (nFeux > 0 && it % 5 === 0)) {
        feuxEnvoyes = versionFeux;
        const a = new Float32Array(nFeux * P.FEU_TAILLE);
        for (let q = 0, o = 0; q < NFEUX; q++) {
          if (!fActif[q]) continue;
          // L'intensité monte à l'allumage (plus lentement pour un objet qui s'embrase) et baisse sur trois secondes.
          const monte = (fAge[q] + 6) / (fDelai[q] + 12), baisse = fReste[q] / (3 * IT_S);
          a[o] = fId[q]; a[o + 1] = fX[q] / 1000; a[o + 2] = fZ[q] / 1000; a[o + 3] = fR[q] / 1000;
          a[o + 4] = Math.min(1, monte, baisse); a[o + 5] = fReste[q] / IT_S; a[o + 6] = fSorte[q]; a[o + 7] = fCible[q];
          o += P.FEU_TAILLE;
        }
        msg.feux = a;
      }
      if (versionGaz !== gazEnvoye || (nNuages > 0 && it % 5 === 0)) {
        gazEnvoye = versionGaz;
        const a = new Float32Array(nNuages * P.NUAGE_TAILLE);
        for (let q = 0, o = 0; q < NNUAGES; q++) {
          if (!gActif[q]) continue;
          a[o] = gId[q]; a[o + 1] = gX[q] / 1000; a[o + 2] = gZ[q] / 1000; a[o + 3] = gRc[q] / 1000;
          a[o + 4] = Math.min(1, gReste[q] / (4 * IT_S)); a[o + 5] = gReste[q] / IT_S;
          o += P.NUAGE_TAILLE;
        }
        msg.nuages = a;
      }
      if (it % 20 === 0) msg.gisements = stock.slice();
      if (opt.brouillard && opt.joueur >= 0 && it % 4 === 0) { majVoile(); msg.voile = voile.slice(); }
      if (it % 10 === 0) msg.minicarte = minicarte();
      if (it % 2 === 0) { msg.combats = combats.slice(); combats.fill(0); }
      return msg;
    }

    const carte = {
      ilots: ville.ilots || ville.N, etendue: { ...ville.etendue }, nav: nav.carte,
      voile: { nx: nx8, nz: nz8, x0: X0 / 1000, z0: Z0 / 1000, cellule: K.CELLULE_VOILE },
      minicarte: { taille: MINI, x0: miniX0 / 1000, z0: miniZ0 / 1000, cote: miniCote / 1000 },
      combats: { taille: COMB, x0: miniX0 / 1000, z0: miniZ0 / 1000, cote: combCote / 1000 },
      echelle, depart: Array.from(depart), popMax: Array.from(popMax), parts: Array.from(PARTS),
    };
    empreintes.push([0, empreinte()]);

    const monde = {
      carte, options: opt, ville, nav, O, PH, T, S: { QG: S_QG, POSTE: S_POSTE, BARRICADE: S_BARRICADE },
      ux, uz, ufac, utyp, ucoh, ucap, uetat, uord, uphase, umode, ucib, ubx, ubz, ucharge, uc4, uc8, pres, N8, nx8, nz8,
      res, score, pop, popMax, vivantes, depart, elimine, structures, lieuProp, lieuPreneur, lieuProgres, lieuConteste, lieux,
      gis, stock, actifs, casX, casZ, casEtat, empreintes, estIA, echelle, mesure,
      // 0.3 : lecture pour l'IA et les essais. feux et nuages : tableaux par foyer ou nuage, « actif » dit lesquels servent.
      urech, urech2, uterre, uimm, ulance, uassaut, usal, jetons, sansBase, demo: DEMO,
      feux: { max: NFEUX, actif: fActif, x: fX, z: fZ, r: fR, reste: fReste, age: fAge, sorte: fSorte, cible: fCible, camp: fCamp, id: fId },
      nuages: { max: NNUAGES, actif: gActif, x: gX, z: gZ, r: gRc, reste: gReste, camp: gCamp, id: gId },
      get nFeux() { return nFeux; }, get nNuages() { return nNuages; }, get nVols() { return nVols; }, get nGisants() { return nGisants; },
      get raison() { return P.RAISONS_FIN[raison]; },
      victoire: { mode: VIC.mode, points: ciblePoints, limiteTemps, plafond: plafondIt },
      /** (essais) Un cocktail du camp f tombe en (x, z) m : souffle, foyer, embrasement. */
      incendier: (f, x, z) => molotovTombe(mm(x), mm(z), f, -1),
      /** (essais) Un nuage de gaz du camp f en (x, z) m. */
      gazer: (f, x, z) => creerNuage(mm(x), mm(z), f),
      /** (essais) Jette l'unité i au sol. */
      renverser: i => mettreATerre(i, CAUSE.CHARGE, -1, true),
      get it() { return it; }, get n() { return nHaut; }, get vainqueur() { return vainqueur; },
      get alliance() { return alliance; }, get proposition() { return proposition; }, get colere() { return colere; },
      get delaiAlliance() { return delaiAlliance; },
      soumettre, injecter, iterer, etat, empreinte,
      enregistrement: () => ({ version: P.VERSION, options: { ...opt }, commandes: journal.slice(), empreintes: empreintes.slice() }),
      bilan: () => bilan.map((b, f) => ({ ...b, infliges: Math.round(b.infliges / 1000),
        sources: Array.from(sources.subarray(f * 8, f * 8 + 8), v => Math.round(v / 1000)) })),
      ajouter: (f, t, x, z) => creerUnite(f, t, mm(x), mm(z), 0),
      ressources: (f, moyens, materiaux) => { res[f * 2] = moyens * 1000; res[f * 2 + 1] = materiaux * 1000; },
      hostileA: (a, b) => hostile[a * 4 + b] === 1,
      /** (IA) Un avant-poste tiendrait-il autour de (x, z) mm ? Rend son centre [x, z] mm ou null. */
      postePossible: (x, z) => emprisePoste(x, z, null),
      popEnFile,
      /** Évènements de la dernière itération : Float32Array (vue, valable jusqu'à l'itération suivante). */
      evenements: () => ev.subarray(0, nev * 6),
    };
    return monde;
  }

  /** Relit un enregistrement : même ville, mêmes options ; ia vrai : l'IA rejoue (seules les commandes du joueur sont
   *  réinjectées), faux : toutes les commandes enregistrées sont réinjectées et l'IA se tait. */
  function relire(ville, enr, iterations, creerIA) {
    const m = creer(ville, { ...enr.options, enregistrer: true });
    const ia = creerIA ? creerIA(m) : null;
    const cmds = enr.commandes.filter(e => (ia ? !e.ia : true));
    let k = 0;
    for (let q = 0; q < iterations; q++) {
      while (k < cmds.length && cmds[k].it <= m.it) m.injecter(cmds[k++]);
      m.iterer();
      if (ia) ia.penser();
    }
    return m;
  }

  PDR.monde = Object.freeze({ creer, relire, fnvOctets, fnvDepart, fnvHex, fnvTexte, ORDRES: O, PHASES: PH, COMPOSITION });
})(globalThis.PDR = globalThis.PDR || {});
