/* Point de rupture — réglages du joueur, à la manière de FOptions (FERRO, src/options.js) : valeurs par défaut,
   normalisation de ce qui est relu, touches réassignables sans conflit, stockage local sous try/catch.
   Le panneau de réglages (onglets Partie, Image, Audio, Commandes, comme le menu de METAL) est câblé par creerPanneau
   sur le balisage de index.html (#ecran-reglages).

   PDR.interface.reglages
     ACTIONS                      [{ id, libelle, groupe, defaut: [codes] }], dans l'ordre d'affichage
     GROUPES                      { vue, ordres, production, general } → libellé. « ordres » (unités choisies) et
                                  « production » (QG ou avant-poste choisi) ne servent jamais ensemble : une touche peut
                                  appartenir aux deux. « vue » et « general » valent partout : leurs touches sont uniques.
     FIXES                        raccourcis non réassignables, pour l'aide : [[touches, effet]]
     defaults(tactile)            réglages par défaut (objet neuf) ; alias defauts
     normalize(brut, tactile)     réglages valides (objet neuf) : toute valeur absente, d'un autre type ou hors bornes
                                  reprend sa valeur par défaut ; des touches en conflit reprennent toutes leurs défauts ;
                                  alias normaliser
     assign(touches, action, code, rang = 0)   { ok: true, touches } (objet neuf) ou { ok: false, raison, conflit } ;
                                  rang 0 : touche principale, 1 : seconde touche ; alias assigner
     effacer(touches, action, rang)            touches sans la touche de ce rang (objet neuf)
     conflit(touches, action, code)            id de l'action qui garde déjà ce code dans un groupe croisé, ou null
     keyName(code)                libellé affiché (« Espace », « ↑ », « A », « F1 »…) ; alias nomTouche
     touche(evenement)            code logique d'un KeyboardEvent : les lettres suivent la disposition du clavier
                                  (sur un AZERTY, la touche marquée A donne « KeyA »), le reste suit la position (e.code)
     indexer(touches)             Map code → { vue, ordres, production, general } : id de l'action par groupe
     charger(stockage, tactile)   réglages lus sous « pdr.reglages » (localStorage par défaut) ; défauts si absent,
                                  illisible ou refusé
     enregistrer(reglages, stockage)   vrai si l'écriture a réussi
     creerPanneau(document, options)   panneau DOM, navigateur seulement (voir sa documentation plus bas)

   Les réglages : demo, alertes, infobulles, vitesse (1, 2, 4) ; partie { faction, alliance (-1 : aucune ; 0 à 2 :
   allié ; 3 : les deux autres camps alliés contre le joueur), effectifs, difficulte, graine, brouillard, coalitions,
   ville ('marseille' : le plan réel ; 'damier' : la ville imaginaire de la graine) } ;
   qualite ('auto' | 'low' | 'high', les valeurs du renderer de FERRO), limiteImages (0, 30, 60, 120), luminosite
   (0,7 à 1,4), ombres, eclat, anticrenelage, compteur, vignettage ; son (vrai : activé), volumeGeneral, volumeMusique,
   volumeEffets, volumeAmbiances (0 à 1) ; vitesseCamera (0,5 à 2), defilementBord, moletteInversee ; touches. */
(function (PDR) {
  'use strict';

  const I = PDR.interface = PDR.interface || {};
  const VERSION = 1, CLE = 'pdr.reglages';

  const GROUPES = Object.freeze({ vue: 'Vue', ordres: 'Ordres aux unités', production: 'Production', general: 'Général' });

  // Libellés de la production tirés des règles : la n-ième touche produit le n-ième type du camp choisi.
  function libelleProduction(k) {
    const R = PDR.regles;
    if (!R) return 'Produire le type ' + (k + 1);
    const noms = [];
    for (const liste of R.TYPES_PAR_FACTION) if (liste[k] !== undefined && !noms.includes(R.TYPES[liste[k]].pluriel)) noms.push(R.TYPES[liste[k]].pluriel);
    return noms.join(', ');
  }
  function toucheProduction(k) {
    const R = PDR.regles, liste = R && R.TYPES_PAR_FACTION.find(l => l[k] !== undefined);
    return liste ? 'Key' + R.TYPES[liste[k]].raccourci : 'Key' + 'QWERT'[k];
  }

  const ACTIONS = Object.freeze([
    ['vueAvant', 'Faire défiler vers le haut', 'vue', ['ArrowUp']],
    ['vueArriere', 'Faire défiler vers le bas', 'vue', ['ArrowDown']],
    ['vueGauche', 'Faire défiler à gauche', 'vue', ['ArrowLeft']],
    ['vueDroite', 'Faire défiler à droite', 'vue', ['ArrowRight']],
    ['vueTournerG', 'Tourner la vue à gauche', 'vue', ['Home']],
    ['vueTournerD', 'Tourner la vue à droite', 'vue', ['End']],
    ['zoomAvant', 'Rapprocher la vue', 'vue', ['PageUp', 'NumpadAdd']],
    ['zoomArriere', 'Éloigner la vue', 'vue', ['PageDown', 'NumpadSubtract']],
    ['attaque', 'Attaque-mouvement', 'ordres', ['KeyA']],
    ['arret', 'Arrêt', 'ordres', ['KeyS']],
    ['tenir', 'Tenir la position', 'ordres', ['KeyH']],
    ['replier', 'Se replier', 'ordres', ['KeyR']],
    ['regrouper', 'Regrouper', 'ordres', ['KeyG']],
    ['lever', 'Lever', 'ordres', ['KeyL']],
    ['casser', 'Casser', 'ordres', ['KeyC']],
    ['barricade', 'Barricade', 'ordres', ['KeyB']],
    ['recolter', 'Récolter', 'ordres', ['KeyX']],
    ['avantPoste', 'Bâtir un avant-poste', 'ordres', ['KeyE']],
    ['salve', 'Salve (Compagnie)', 'ordres', ['KeyV']],
    ['jet', 'Jet (Canon à eau)', 'ordres', ['KeyJ']],
    ['produire1', libelleProduction(0), 'production', [toucheProduction(0)]],
    ['produire2', libelleProduction(1), 'production', [toucheProduction(1)]],
    ['produire3', libelleProduction(2), 'production', [toucheProduction(2)]],
    ['produire4', libelleProduction(3), 'production', [toucheProduction(3)]],
    ['produire5', libelleProduction(4), 'production', [toucheProduction(4)]],
    ['ralliement', 'Point de ralliement', 'production', ['KeyY']],
    ['pause', 'Pause', 'general', ['KeyP']],
    ['alerte', 'Aller à la dernière alerte', 'general', ['Space']],
    ['oisifs', 'Équipes oisives', 'general', ['F1']],
    ['armee', 'Toute l’armée', 'general', ['F2']],
    ['qg', 'Le QG', 'general', ['F3']],
  ].map(([id, libelle, groupe, defaut]) => Object.freeze({ id, libelle, groupe, defaut: Object.freeze(defaut) })));
  const PAR_ID = Object.freeze(Object.fromEntries(ACTIONS.map(a => [a.id, a])));

  const FIXES = Object.freeze([
    ['Échap', 'annuler la visée, sinon la pause'],
    ['Ctrl + 1 à 9', 'former un groupe'],
    ['1 à 9', 'choisir un groupe ; deux fois : centrer la vue'],
    ['Maj + 1 à 9', 'ajouter un groupe à la sélection'],
    ['Ctrl + A', 'toutes vos unités'],
    ['Maj + ← / →', 'tourner la vue'],
    ['Clic gauche', 'choisir ; Maj : ajouter ou retirer'],
    ['Double-clic, Ctrl + clic', 'tout ce type à l’écran'],
    ['Clic droit', 'ordre selon la cible ; glissé : tourner la vue'],
    ['Molette', 'zoom ; bouton du milieu ou Espace + glisser : déplacer la vue'],
  ]);

  // Touches refusées, avec la raison montrée au joueur.
  function raisonReservee(code) {
    if (typeof code !== 'string' || !code) return 'Touche inconnue.';
    if (code === 'Escape') return 'Échap annule la visée ou ouvre la pause.';
    if (code === 'Tab') return 'Tab sert à parcourir l’interface au clavier.';
    if (code === 'Backspace' || code === 'Delete') return 'Retour arrière et Suppr effacent une touche.';
    if (/^Digit[1-9]$/.test(code)) return 'Les chiffres 1 à 9 sont réservés aux groupes.';
    if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(code)) return 'Ctrl, Maj, Alt et ⌘ servent aux clics et aux groupes.';
    if (/^F(5|11|12)$/.test(code)) return 'Cette touche est réservée au navigateur.';
    if (!/^(Key[A-Z]|Digit0|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-2])|Space|Enter|PageUp|PageDown|Home|End|Insert|Numpad[0-9]|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide|NumpadDecimal|NumpadEnter|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Backslash|Comma|Period|Slash|IntlBackslash)$/.test(code)) {
      return 'Cette touche ne peut pas être assignée.';
    }
    return '';
  }
  const permise = code => !raisonReservee(code);
  /** Deux groupes se gênent-ils ? « ordres » et « production » ne servent jamais en même temps. */
  const seCroisent = (a, b) => a === b || a === 'vue' || b === 'vue' || a === 'general' || b === 'general';

  function conflit(touches, action, code) {
    const a = PAR_ID[action];
    if (!a) return null;
    for (const b of ACTIONS) {
      if (b.id !== action && seCroisent(a.groupe, b.groupe) && Array.isArray(touches[b.id]) && touches[b.id].includes(code)) return b.id;
    }
    return null;
  }

  const borne = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const EFFECTIFS = () => (PDR.regles ? PDR.regles.CONSTANTES.EFFECTIFS : [20000, 50000, 100000, 150000, 200000]);
  const EFFECTIFS_DEFAUT = () => (PDR.regles ? PDR.regles.CONSTANTES.EFFECTIFS_DEFAUT : 100000);

  function defaults(tactile = false) {
    return {
      version: VERSION,
      demo: true, alertes: true, infobulles: !tactile, vitesse: 1,
      partie: { faction: 0, alliance: -1, effectifs: EFFECTIFS_DEFAUT(), difficulte: 1, graine: 1, brouillard: true, coalitions: true, ville: 'marseille' },
      qualite: 'auto', limiteImages: 0, luminosite: 1, ombres: true, eclat: true, anticrenelage: true, compteur: true, vignettage: true,
      son: true, volumeGeneral: 1, volumeMusique: 0.45, volumeEffets: 1, volumeAmbiances: 0.8,
      vitesseCamera: 1, defilementBord: !tactile, moletteInversee: false,
      touches: Object.fromEntries(ACTIONS.map(a => [a.id, a.defaut.slice()])),
    };
  }

  const BOOLEENS = ['demo', 'alertes', 'infobulles', 'ombres', 'eclat', 'anticrenelage', 'compteur', 'vignettage', 'son',
    'defilementBord', 'moletteInversee'];
  const BORNES = [['luminosite', 0.7, 1.4], ['volumeGeneral', 0, 1], ['volumeMusique', 0, 1], ['volumeEffets', 0, 1],
    ['volumeAmbiances', 0, 1], ['vitesseCamera', 0.5, 2]];
  const fini = v => typeof v === 'number' && Number.isFinite(v);

  function normalize(brut, tactile = false) {
    const d = defaults(tactile), v = brut && typeof brut === 'object' ? brut : {};
    for (const k of BOOLEENS) if (typeof v[k] === 'boolean') d[k] = v[k];
    for (const [k, lo, hi] of BORNES) if (fini(v[k])) d[k] = borne(v[k], lo, hi);
    if (['auto', 'low', 'high'].includes(v.qualite)) d.qualite = v.qualite;
    if ([0, 30, 60, 120].includes(v.limiteImages)) d.limiteImages = v.limiteImages;
    if ([1, 2, 4].includes(v.vitesse)) d.vitesse = v.vitesse;
    const p = v.partie && typeof v.partie === 'object' ? v.partie : {};
    if ([0, 1, 2].includes(p.faction)) d.partie.faction = p.faction;
    if ([-1, 0, 1, 2, 3].includes(p.alliance) && p.alliance !== d.partie.faction) d.partie.alliance = p.alliance;
    if (EFFECTIFS().includes(p.effectifs)) d.partie.effectifs = p.effectifs;
    if ([0, 1, 2].includes(p.difficulte)) d.partie.difficulte = p.difficulte;
    if (Number.isInteger(p.graine) && p.graine >= 1 && p.graine <= 999999) d.partie.graine = p.graine;
    if (typeof p.brouillard === 'boolean') d.partie.brouillard = p.brouillard;
    if (typeof p.coalitions === 'boolean') d.partie.coalitions = p.coalitions;
    if (['marseille', 'damier'].includes(p.ville)) d.partie.ville = p.ville;

    if (v.touches && typeof v.touches === 'object') {
      const candidat = {};
      let valide = true;
      for (const a of ACTIONS) {
        const codes = v.touches[a.id];
        if (codes === undefined) { candidat[a.id] = a.defaut.slice(); continue; }
        if (!Array.isArray(codes) || codes.length > 2 || codes.some(c => !permise(c)) || new Set(codes).size !== codes.length) { valide = false; break; }
        candidat[a.id] = codes.slice();
      }
      if (valide) {
        // Une action apparue depuis l'enregistrement laisse ses touches par défaut déjà prises par le joueur.
        for (const a of ACTIONS) if (v.touches[a.id] === undefined) candidat[a.id] = candidat[a.id].filter(c => !conflit(candidat, a.id, c));
        for (const a of ACTIONS) for (const c of candidat[a.id]) if (conflit(candidat, a.id, c)) valide = false;
      }
      if (valide) d.touches = candidat;
    }
    return d;
  }

  function assign(touches, action, code, rang = 0) {
    if (!PAR_ID[action]) return { ok: false, raison: 'Action inconnue.' };
    const raison = raisonReservee(code);
    if (raison) return { ok: false, raison };
    const autre = conflit(touches, action, code);
    if (autre) return { ok: false, raison: 'Déjà utilisée : ' + PAR_ID[autre].libelle + ' (' + GROUPES[PAR_ID[autre].groupe].toLowerCase() + ').', conflit: autre };
    const avant = Array.isArray(touches[action]) ? touches[action] : [];
    // Rang 0 : la touche principale change, la seconde reste. Rang 1 : la seconde change, la principale reste.
    // Une touche déjà portée par l'autre rang de la même action y est retirée, sans doublon.
    const garde = rang === 1 ? avant[0] : avant[1];
    const liste = garde !== undefined && garde !== code ? (rang === 1 ? [garde, code] : [code, garde]) : [code];
    return { ok: true, touches: { ...touches, [action]: liste } };
  }

  function effacer(touches, action, rang) {
    if (!PAR_ID[action] || !Array.isArray(touches[action])) return touches;
    const liste = touches[action].slice();
    liste.splice(rang === 1 ? 1 : 0, 1);
    return { ...touches, [action]: liste };
  }

  const NOMS = Object.freeze({
    Space: 'Espace', Enter: 'Entrée', Backspace: 'Retour', Escape: 'Échap', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓',
    ArrowLeft: '←', ArrowRight: '→', PageUp: 'Page ↑', PageDown: 'Page ↓', Home: 'Début', End: 'Fin', Insert: 'Inser',
    Delete: 'Suppr', NumpadAdd: 'Pavé +', NumpadSubtract: 'Pavé −', NumpadMultiply: 'Pavé ×', NumpadDivide: 'Pavé ÷',
    NumpadDecimal: 'Pavé ,', NumpadEnter: 'Pavé Entrée', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: '\'', Backquote: '`', Backslash: '\\', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
    ShiftLeft: 'Maj', ShiftRight: 'Maj', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt Gr',
    MetaLeft: '⌘', MetaRight: '⌘',
  });
  // Disposition réelle du clavier pour nommer la ponctuation, quand le navigateur la donne (Chrome).
  let disposition = null;
  function keyName(code) {
    if (!code) return '—';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return 'Pavé ' + code.slice(6);
    if (/^F\d\d?$/.test(code)) return code;
    if (disposition && disposition.has(code) && !/^(Arrow|Page|Home|End|Space|Enter|Numpad|Insert|Delete|Escape|Tab|Backspace)/.test(code)) {
      return String(disposition.get(code)).toUpperCase();
    }
    return NOMS[code] || code;
  }
  /** Demande la disposition du clavier ; rappel quand elle arrive (les libellés de ponctuation changent). */
  function lireDisposition(rappel) {
    try {
      const nav = globalThis.navigator;
      if (nav && nav.keyboard && typeof nav.keyboard.getLayoutMap === 'function') {
        nav.keyboard.getLayoutMap().then(m => { disposition = m; if (rappel) rappel(); }, () => {});
      }
    } catch (e) { /* API absente ou refusée : les noms anglais de position restent */ }
  }

  /** Code logique d'un KeyboardEvent. Chiffres, pavé, flèches et touches de fonction : la position. Lettres : le
   *  caractère produit, pour que « A » soit l'attaque sur un AZERTY comme sur un QWERTY. */
  function touche(e) {
    const code = e && e.code ? e.code : '';
    if (/^(Digit|Numpad|Arrow|F\d|Page|Home|End|Space|Enter|Escape|Tab|Backspace|Delete|Insert)/.test(code)) return code;
    const k = e && e.key;
    if (typeof k === 'string' && k.length === 1) {
      const c = k.toUpperCase();
      if (c >= 'A' && c <= 'Z') return 'Key' + c;
      // Ponctuation produite par une touche de lettre (la virgule d'un AZERTY est en « KeyM ») : ni lettre, ni assignable.
      if (/^Key[A-Z]$/.test(code)) return 'Signe' + k;
    }
    return code;
  }

  function indexer(touches) {
    const index = new Map();
    for (const a of ACTIONS) {
      for (const c of touches[a.id] || []) {
        let e = index.get(c);
        if (!e) index.set(c, e = { vue: null, ordres: null, production: null, general: null });
        e[a.groupe] = a.id;
      }
    }
    return index;
  }

  const tactileParDefaut = () => {
    try { return !!(globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  };
  function charger(stockage, tactile = tactileParDefaut()) {
    try {
      const s = stockage || globalThis.localStorage;
      const brut = s ? s.getItem(CLE) : null;
      return normalize(brut ? JSON.parse(brut) : {}, tactile);
    } catch (e) {
      return defaults(tactile);       // stockage refusé ou texte illisible : les défauts, sans erreur
    }
  }
  function enregistrer(reglages, stockage) {
    try {
      const s = stockage || globalThis.localStorage;
      if (!s) return false;
      s.setItem(CLE, JSON.stringify(reglages));
      return true;
    } catch (e) {
      return false;                   // navigation privée, quota, artefact sans stockage : réglages de la session
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------
     Panneau de réglages, sur le balisage de #ecran-reglages (index.html). Les contrôles se décrivent par attributs :
       data-bascule="cle" (bouton : booléen, libellés data-oui / data-non dans <strong>),
       data-curseur="cle" (input range : valeur × data-echelle, sortie [data-sortie="cle"], suffixe data-suffixe),
       data-choix="cle" (select : valeur, nombre si data-nombre),
       data-retablir="image" | "audio" | "commandes" | "partie" (bouton : défauts de la rubrique),
       data-action="exporter-musique" | "essai-son" | "recommencer" | "quitter" (bouton : options.surAction(nom)).
     options : { reglages (modifié en place), surChangement(cles), surAction(nom) → valeur ou promesse,
                 surFermer(), enregistre() → vrai si le stockage a pris la dernière écriture }
     Renvoie { ouvrir(contexte 'titre' | 'pause', onglet), fermer(), ouvert, ecoute, toucheEcoutee(e) → vrai si
               consommée, rafraichir(), infos(texte), musique(titre), statutAudio(texte) }.
     --------------------------------------------------------------------------------------------------------------- */
  const ONGLETS = ['partie', 'image', 'audio', 'commandes'];
  const CLES_ONGLET = {
    partie: ['demo', 'alertes', 'infobulles', 'vitesse'],
    image: ['qualite', 'limiteImages', 'luminosite', 'ombres', 'eclat', 'anticrenelage', 'compteur', 'vignettage'],
    audio: ['son', 'volumeGeneral', 'volumeMusique', 'volumeEffets', 'volumeAmbiances'],
    commandes: ['vitesseCamera', 'defilementBord', 'moletteInversee', 'touches'],
  };
  const echapper = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
  const pourcent = v => Math.round(v * 100) + ' %';

  function creerPanneau(doc, options) {
    const REG = options.reglages;
    const $ = id => doc.getElementById(id);
    const racine = $('ecran-reglages');
    if (!racine) throw new Error('#ecran-reglages manque dans la page');
    const tous = sel => Array.from(racine.querySelectorAll(sel));
    let onglet = 'partie', contexte = 'titre', ecoute = null, ouvert = false, dernierFocus = null, confirmation = 0;
    const statutTouches = $('touches-etat'), grille = $('touches-grille');
    const AIDE_TOUCHES = 'Cliquez une touche pour la changer. Échap annule ; Retour arrière efface la seconde touche.';
    // Typographie française à l'affichage (PDR.interface.outils.typo, hud.js), si elle est chargée.
    const typo = t => (I.outils && I.outils.typo ? I.outils.typo(t) : String(t));
    const ecrire = (e, t) => { if (e) e.textContent = typo(t); };
    /** Ligne d'état des touches ; sorte « info », « ecoute » (en attente d'une touche) ou « refus » (conflit). */
    const statuer = (t, sorte) => { if (statutTouches) { statutTouches.dataset.sorte = sorte || 'info'; ecrire(statutTouches, t); } };

    function changer(cles) { options.surChangement(cles); majPied(); }
    function majPied() {
      const pied = $('reglages-memoire');
      ecrire(pied, options.enregistre && !options.enregistre()
        ? 'Réglages gardés pour cette session : ce navigateur refuse le stockage.'
        : 'Réglages enregistrés sur cet appareil.');
    }

    function rafraichir() {
      for (const b of tous('[data-bascule]')) {
        const v = !!REG[b.dataset.bascule];
        b.setAttribute('aria-pressed', String(v));
        const s = b.querySelector('strong');
        if (s) s.textContent = v ? b.dataset.oui || 'Activé' : b.dataset.non || 'Désactivé';
      }
      for (const c of tous('[data-curseur]')) {
        const k = c.dataset.curseur, e = Number(c.dataset.echelle || 1);
        c.value = String(Math.round(REG[k] * e));
        const s = racine.querySelector('[data-sortie="' + k + '"]');
        ecrire(s, k === 'vitesseCamera' ? REG[k].toFixed(2).replace('.', ',') + ' ×' : pourcent(REG[k]));
      }
      for (const s of tous('[data-choix]')) s.value = String(REG[s.dataset.choix]);
      dessinerTouches();
    }

    function dessinerTouches() {
      if (!grille) return;
      let html = '';
      for (const g of Object.keys(GROUPES)) {
        html += '<p class="touches-groupe">' + echapper(GROUPES[g]) + (g === 'ordres' ? '<small>unités choisies</small>' : g === 'production' ? '<small>QG ou avant-poste choisi</small>' : '') + '</p>';
        for (const a of ACTIONS) {
          if (a.groupe !== g) continue;
          const codes = REG.touches[a.id] || [];
          html += '<div class="touche-ligne" data-ligne="' + a.id + '"><span>' + echapper(a.libelle) + '</span><span class="touche-boutons">';
          for (let r = 0; r < 2; r++) {
            const enEcoute = ecoute && ecoute.action === a.id && ecoute.rang === r;
            const libelle = enEcoute ? 'Touche…' : codes[r] ? keyName(codes[r]) : r ? '+' : '—';
            html += '<button type="button" class="touche' + (enEcoute ? ' ecoute' : '') + (codes[r] ? '' : ' vide') + '" data-action-touche="' + a.id +
              '" data-rang="' + r + '" aria-label="' + echapper(a.libelle + (r ? ', seconde touche : ' : ', touche : ') + (codes[r] ? keyName(codes[r]) : 'aucune')) + '">' + echapper(libelle) + '</button>';
          }
          html += '</span></div>';
        }
      }
      grille.innerHTML = typo(html);
      const fixes = $('touches-fixes');
      if (fixes && !fixes.childElementCount) {
        fixes.innerHTML = typo(FIXES.map(([k, t]) => '<div class="touche-ligne fixe"><span>' + echapper(t) + '</span><kbd>' + echapper(k) + '</kbd></div>').join(''));
      }
      if (ecoute) {
        const b = grille.querySelector('[data-action-touche="' + ecoute.action + '"][data-rang="' + ecoute.rang + '"]');
        if (b) b.focus({ preventScroll: false });
      }
    }

    function choisirOnglet(nom, focus) {
      if (!ONGLETS.includes(nom)) return;
      onglet = nom;
      ecoute = null;
      for (const id of ONGLETS) {
        const actif = id === nom, t = $('onglet-' + id), v = $('volet-' + id);
        if (t) { t.setAttribute('aria-selected', String(actif)); t.tabIndex = actif ? 0 : -1; }
        if (v) v.hidden = !actif;
      }
      const corps = $('reglages-contenu');
      if (corps) corps.scrollTop = 0;
      statuer(AIDE_TOUCHES);
      dessinerTouches();
      if (focus) $('onglet-' + nom).focus();
    }

    // ---- Événements ----
    for (const id of ONGLETS) {
      const t = $('onglet-' + id);
      if (!t) continue;
      t.addEventListener('click', () => choisirOnglet(id, false));
      t.addEventListener('keydown', e => {
        let k = ONGLETS.indexOf(onglet);
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') k = (k + 1) % 4;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') k = (k + 3) % 4;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = 3;
        else return;
        e.preventDefault();
        choisirOnglet(ONGLETS[k], true);
      });
    }
    for (const b of tous('[data-bascule]')) b.addEventListener('click', () => { const k = b.dataset.bascule; REG[k] = !REG[k]; rafraichir(); changer([k]); });
    for (const c of tous('[data-curseur]')) {
      c.addEventListener('input', () => {
        const k = c.dataset.curseur, e = Number(c.dataset.echelle || 1);
        REG[k] = Number(c.value) / e;
        const s = racine.querySelector('[data-sortie="' + k + '"]');
        ecrire(s, k === 'vitesseCamera' ? REG[k].toFixed(2).replace('.', ',') + ' ×' : pourcent(REG[k]));
        changer([k]);
      });
    }
    for (const s of tous('[data-choix]')) {
      s.addEventListener('change', () => {
        const k = s.dataset.choix;
        REG[k] = s.hasAttribute('data-nombre') ? Number(s.value) : s.value;
        changer([k]);
      });
    }
    for (const b of tous('[data-retablir]')) {
      b.addEventListener('click', () => {
        const rub = b.dataset.retablir, d = defaults(tactileParDefaut()), cles = CLES_ONGLET[rub] || [];
        for (const k of cles) REG[k] = k === 'touches' ? d.touches : d[k];
        ecoute = null;
        rafraichir();
        changer(cles);
        if (rub === 'commandes') statuer('Commandes par défaut rétablies.');
        if (rub === 'audio') statutAudio('Mix recommandé rétabli. Essayez le son.');
      });
    }
    for (const b of tous('[data-action]')) {
      b.addEventListener('click', () => {
        const nom = b.dataset.action;
        if (nom === 'quitter' && confirmation < Date.now()) {
          // Abandonner ne se rattrape pas : un second clic confirme.
          confirmation = Date.now() + 4000;
          b.dataset.libelle = b.dataset.libelle || b.textContent;
          b.textContent = 'Confirmer l’abandon';
          b.classList.add('alerte');
          setTimeout(() => { if (confirmation && Date.now() >= confirmation) { b.textContent = b.dataset.libelle; b.classList.remove('alerte'); confirmation = 0; } }, 4100);
          return;
        }
        if (nom === 'quitter') { confirmation = 0; b.textContent = b.dataset.libelle || b.textContent; b.classList.remove('alerte'); }
        const r = options.surAction(nom);
        if (nom === 'essai-son') {
          Promise.resolve(r).then(ok => statutAudio(ok === false ? 'Le son est coupé ou indisponible : activez-le et montez le volume général.'
            : 'Essai lancé : ordre, frappe, ambiance de rue. Les quatre volumes restent indépendants.'));
        } else if (nom === 'exporter-musique') {
          Promise.resolve(r).then(ok => statutAudio(ok ? 'Module enregistré : il se lit dans tout lecteur MOD (ProTracker, 4 canaux).' : 'La musique n’est pas encore prête.'));
        }
      });
    }
    if (grille) {
      grille.addEventListener('click', e => {
        const b = e.target.closest('[data-action-touche]');
        if (!b) return;
        ecoute = { action: b.dataset.actionTouche, rang: Number(b.dataset.rang) };
        statuer('Appuyez sur une touche pour « ' + PAR_ID[ecoute.action].libelle + ' ». Échap annule, Retour arrière efface.', 'ecoute');
        dessinerTouches();
      });
    }
    const fermerBouton = $('reglages-fermer');
    if (fermerBouton) fermerBouton.addEventListener('click', () => options.surFermer());

    /** Clavier pendant l'écoute d'une touche : la touche pressée devient l'assignation, sauf conflit. */
    function toucheEcoutee(e) {
      if (!ecoute) return false;
      e.preventDefault();
      if (e.repeat) return true;
      const { action, rang } = ecoute, libelle = PAR_ID[action].libelle;
      if (e.code === 'Escape') {
        ecoute = null;
        statuer('Modification annulée.');
        dessinerTouches();
        return true;
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        REG.touches = effacer(REG.touches, action, rang);
        ecoute = null;
        statuer('« ' + libelle + ' » : touche effacée.');
        dessinerTouches();
        changer(['touches']);
        return true;
      }
      const code = touche(e), r = assign(REG.touches, action, code, rang);
      if (!r.ok) {
        statuer(r.raison + ' Choisissez une autre touche, ou Échap.', 'refus');
        if (r.conflit && grille) {
          const ligne = grille.querySelector('[data-ligne="' + r.conflit + '"]');
          if (ligne) { ligne.classList.remove('conflit'); void ligne.offsetWidth; ligne.classList.add('conflit'); }
        }
        return true;
      }
      REG.touches = r.touches;
      ecoute = null;
      statuer('« ' + libelle + ' » : ' + keyName(code) + '.');
      dessinerTouches();
      changer(['touches']);
      return true;
    }

    function statutAudio(texte) { ecrire($('audio-etat'), texte); }

    function ouvrir(ctx, nom) {
      contexte = ctx === 'pause' ? 'pause' : 'titre';
      racine.dataset.contexte = contexte;
      const surtitre = $('reglages-surtitre'), titre = $('reglages-titre'), fermer = $('reglages-fermer');
      if (surtitre) surtitre.textContent = contexte === 'pause' ? 'PARTIE EN PAUSE' : 'RÉGLAGES';
      if (titre) titre.textContent = contexte === 'pause' ? 'La rue attend.' : 'À votre main.';
      if (fermer) fermer.firstChild.textContent = contexte === 'pause' ? 'Reprendre ' : 'Retour ';
      for (const el of tous('[data-pause]')) el.hidden = contexte !== 'pause';
      dernierFocus = doc.activeElement;
      racine.hidden = false;
      ouvert = true;
      rafraichir();
      majPied();
      choisirOnglet(nom || 'partie', false);
      const t = $('onglet-' + onglet);
      if (t) t.focus({ preventScroll: true });
    }
    function fermer() {
      ecoute = null;
      ouvert = false;
      racine.hidden = true;
      if (dernierFocus && typeof dernierFocus.focus === 'function' && doc.contains(dernierFocus)) dernierFocus.focus({ preventScroll: true });
    }

    lireDisposition(() => { if (ouvert) dessinerTouches(); });
    rafraichir();
    return {
      ouvrir, fermer, rafraichir, toucheEcoutee, statutAudio,
      get ouvert() { return ouvert; },
      get ecoute() { return !!ecoute; },
      get onglet() { return onglet; },
      choisirOnglet,
      infos(html) { const z = $('partie-infos'); if (z) z.innerHTML = typo(html); },
      musique(titre) { const z = $('musique-titre'); if (z && titre) z.textContent = titre; },
    };
  }

  I.reglages = Object.freeze({
    VERSION, CLE, ACTIONS, GROUPES, FIXES, PAR_ID,
    defaults, normalize, assign, keyName, charger, enregistrer,
    defauts: defaults, normaliser: normalize, assigner: assign, nomTouche: keyName,
    effacer, conflit, touche, indexer, raisonReservee, seCroisent, creerPanneau, lireDisposition,
  });
})(globalThis.PDR = globalThis.PDR || {});
