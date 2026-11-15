/* Point de rupture — affichage en partie : bandeau du haut (camp, Moyens et Matériaux avec leur rythme, population et
   plafond, scores des trois camps et lien d'alliance, horloge, compteur d'images), panneau de sélection (nombre par
   type, cohésion ; structure, file de production, ralliement), carte de commandes (boutons selon le contexte avec leurs
   touches), fil d'alertes, diplomatie (proposer, rompre, accepter, refuser ; colère du Bastion), messages brefs.
   Le balisage est celui de index.html (#hud) ; rien n'est lu ailleurs que dans l'état reçu et le contexte des commandes.

   const hud = PDR.interface.creerHud({ document, regles, protocole, reglages, rappels });
     rappels : { pause(), action(id, { maj }), general(id), annuler(rang), diplomatie(action, avec), vue(x, z),
                 garderType(t, garder), alerteCarte(x, z, couleur), refus(texte) }
   hud.partie({ options, sites })    une partie commence
   hud.etat(etat)                    ressources, scores, horloge, diplomatie, file de production, évènements → alertes
   hud.contexte(ctx, resume)         carte de commandes et sélection (commandes.contexte(), commandes.resume)
   hud.image(maintenant)             compteur d'images (deux relevés par seconde), fondu des alertes ; mesure du cadre :
                                     --bas-barre et --haut-console (px) sur #hud placent les panneaux flottants entre
                                     le bandeau et la console (aussi à chaque changement de taille, ResizeObserver)
   hud.message(texte, refus?)        un message bref au-dessus de la carte de commandes ; refus : teinte d'alerte et rappels.refus
   hud.alerte(texte, { x, z, sorte, faction }) ajoute une alerte ; hud.derniereAlerte() → [x, z] ou null
   hud.ips                           dernières images par seconde relevées

   hud.invalider()                   redessine la carte de commandes (touches changées)
   PDR.interface.outils : formatNombre, formatHorloge, motifSVG, icone, echapper, typo (typographie française),
   typographier(element), ICONES (partagés par les écrans). */
(function (PDR) {
  'use strict';

  const I = PDR.interface = PDR.interface || {};

  // ---------------------------------------------------------------------------------------------------------------
  // Outils partagés
  // ---------------------------------------------------------------------------------------------------------------
  const NF = typeof Intl !== 'undefined' ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }) : null;
  const formatNombre = v => (NF ? NF.format(Math.round(v)) : String(Math.round(v)));
  function formatHorloge(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, q = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(q).padStart(2, '0');
  }
  const echapper = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
  /** Typographie française à l'affichage : espace fine insécable avant ; ! ?, insécable avant : et dans « », et entre
   *  un nombre et son unité. Les textes des contrats (regles.js) et des modules gardent des espaces simples. */
  const typo = t => String(t).replace(/ ([;!?])/g, ' $1').replace(/ :/g, ' :').replace(/« /g, '« ')
    .replace(/ »/g, ' »').replace(/(\d) (%|s\b|m\b|min\b|×)/g, '$1 $2');
  /** Passe la typographie sur les textes et les libellés d'un sous-arbre du DOM (une fois, au démarrage). */
  function typographier(racine) {
    const doc = racine.ownerDocument, NF_ = doc.defaultView.NodeFilter;
    const w = doc.createTreeWalker(racine, NF_.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const v = typo(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    for (const e of racine.querySelectorAll('[aria-label],[title],[placeholder]')) {
      for (const a of ['aria-label', 'title', 'placeholder']) if (e.hasAttribute(a)) e.setAttribute(a, typo(e.getAttribute(a)));
    }
  }
  const MOTIFS = {
    rond: '<circle cx="8" cy="8" r="6.3"/>',
    carre: '<rect x="2.1" y="2.1" width="11.8" height="11.8" rx="1"/>',
    chevron: '<path d="M1.4 13 8 2.4 14.6 13h-3.4L8 7.9 4.8 13z"/>',
  };
  /** Le motif d'un camp en SVG (rond, carré, chevron), dans la couleur courante. */
  const motifSVG = (motif, classe = 'motif') => '<svg class="' + classe + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + (MOTIFS[motif] || MOTIFS.rond) + '</svg>';
  // Pictogrammes au trait, 24 × 24, dessinés pour ce jeu : ordres, rôles des unités, ressources.
  const ICONES = {
    attaque: '<path d="M4 6l6 6-6 6M11 6l6 6-6 6"/><path d="M20 5v14"/>',
    arret: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    tenir: '<path d="M12 4v13M6 20h12M8.5 9.5h7"/><circle cx="12" cy="4" r="1.2"/>',
    replier: '<path d="M9 13.5L4 8.5l5-5"/><path d="M4 8.5h10a5.5 5.5 0 010 11h-3"/>',
    regrouper: '<path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"/><path d="M9 5.5V9H5.5M15 5.5V9h3.5M9 18.5V15H5.5M15 18.5V15h3.5"/>',
    lever: '<path d="M12 17V5M7 10l5-5 5 5M5 20.5h14"/>',
    casser: '<path d="M4 6h16v12H4z"/><path d="M11.5 6l2 4.2-3 3 2 4.8"/>',
    barricade: '<path d="M3 8.5h18v4.5H3z"/><path d="M6.5 13L4.5 20M17.5 13l2 7M7 8.5l3-4.5M17 8.5L14 4M9 8.5l-1.5 4.5M15 8.5l-1.5 4.5"/>',
    recolter: '<path d="M4 10.5h16L18 20H6z"/><path d="M8.5 10.5L12 4.5l3.5 6"/>',
    avantPoste: '<path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5.5h4V20"/>',
    salve: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.4" stroke-dasharray="3.2 2.6"/><circle cx="12" cy="12" r="10" stroke-dasharray="2 3.6"/>',
    jet: '<path d="M3 8.5q3-3 6 0t6 0 6 0M3 13.5q3-3 6 0t6 0 6 0M3 18.5q3-3 6 0t6 0 6 0"/>',
    ralliement: '<path d="M12 21s-6-6.4-6-11a6 6 0 0112 0c0 4.6-6 11-6 11z"/><circle cx="12" cy="10" r="2.1"/>',
    ouvrier: '<path d="M5 9h14v10H5z"/><path d="M5 9l2.2-4h9.6L19 9M10 13h4"/>',
    ligne: '<circle cx="6" cy="8.6" r="2.1"/><circle cx="12" cy="7.6" r="2.1"/><circle cx="18" cy="8.6" r="2.1"/><path d="M2.8 18.5c.6-3.4 5.8-3.4 6.4 0M8.8 17.5c.6-3.4 5.8-3.4 6.4 0M14.8 18.5c.6-3.4 5.8-3.4 6.4 0"/>',
    choc: '<path d="M3 12h9M3 7.5h5M3 16.5h5"/><path d="M12.5 6.5l7 5.5-7 5.5z"/>',
    soutien: '<path d="M9.5 17.5V6l9.5-2v11.5"/><circle cx="7.2" cy="17.6" r="2.4"/><circle cx="16.7" cy="15.6" r="2.4"/>',
    protege: '<rect x="6.5" y="3" width="11" height="18" rx="2"/><path d="M9.5 8h5M9.5 12h5"/>',
    outil: '<path d="M2.5 9.5h12.5l6 2.5-6 2.5H2.5z"/><path d="M6 14.5V19M11.5 14.5V19"/>',
    rapide: '<circle cx="6.5" cy="16" r="3.2"/><circle cx="17.5" cy="16" r="3.2"/><path d="M6.5 16l4.2-6.2h4.4l2.4 6.2M10.7 9.8L9 7"/>',
    vehicule: '<path d="M2.5 6.5h11.5v9.5H2.5zM14 9.5h4.2l3.3 3.4V16H14"/><circle cx="6.5" cy="17.2" r="2"/><circle cx="17.2" cy="17.2" r="2"/><path d="M7 6.5V3.5h4"/>',
    moyens: '<ellipse cx="12" cy="6.8" rx="7" ry="2.9"/><path d="M5 6.8v5.1c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9V6.8M5 11.9V17c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9v-5.1"/>',
    materiaux: '<rect x="3" y="5" width="8" height="5.5" rx=".6"/><rect x="13" y="5" width="8" height="5.5" rx=".6"/><rect x="8" y="13" width="8" height="5.5" rx=".6"/>',
    population: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.8-6.2 6-6.2s6 2.2 6 6.2"/><path d="M15.5 5.2a3 3 0 010 5.6M17.6 14.3c2 .9 3.4 2.9 3.4 5.7"/>',
    lien: '<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2"/>',
    danger: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 9.5v5M12 17.4v.2"/>',
    lieu: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  };
  const icone = (nom, classe = 'icone') => '<svg class="' + classe + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONES[nom] || '') + '</svg>';
  const COURTS = { attaque: 'Attaque', arret: 'Arrêt', tenir: 'Tenir', replier: 'Repli', regrouper: 'Regrouper', lever: 'Lever',
    casser: 'Casser', barricade: 'Barricade', recolter: 'Récolter', avantPoste: 'Avant-poste', salve: 'Salve', jet: 'Jet', ralliement: 'Rallier' };
  const AIDES = {
    attaque: 'Avance vers le point et frappe tout ce qui est hostile en chemin ; sur une unité, l’attaque.',
    arret: 'Les unités s’arrêtent et oublient leur ordre.',
    tenir: 'Posture : ne bougent plus, frappent à portée et ne se replient pas.',
    replier: 'Vers la zone de soutien la plus proche : le QG ou un avant-poste.',
    regrouper: 'Rassemble la sélection en formation serrée au point choisi.',
    lever: 'Démonte une barricade adverse et rend la moitié de son coût.',
    casser: 'Mobilier urbain, voitures, vitrines, avant-postes adverses : la casse rapporte des Matériaux.',
    barricade: 'Un segment de 4 à 20 m en travers d’une rue, à 6 Matériaux par mètre. Elle bloque tout le monde.',
    recolter: 'Les Équipes portent 10 unités par voyage jusqu’au dépôt le plus proche.',
    avantPoste: 'Dépôt, petit producteur et zone de soutien. Bâti par les Équipes.',
    salve: 'Compagnie : zone de 6 m de rayon jusqu’à 14 m, annoncée 1,5 s avant.',
    jet: 'Canon à eau : cône de 18 m qui repousse.',
    ralliement: 'Où se rendent les unités qui sortent. Clic droit sur le sol : même effet.',
  };
  const ICONE_ROLE = { ouvrier: 'ouvrier', ligne: 'ligne', choc: 'choc', soutien: 'soutien', protege: 'protege', outil: 'outil', rapide: 'rapide', vehicule: 'vehicule' };

  /** Camps encore en jeu qui peuvent frapper le joueur, selon la matrice reçue de la simulation.
   *  La colère seule ne décrit pas les ripostes de la Préfecture ; un ancien état reste explicitement inconnu. */
  function campsHostiles(joueur, e) {
    if (!e.hostilite || e.hostilite.length < 16) return null;
    return [0, 1, 2].filter(f => f !== joueur && !(e.eco && e.eco[f] && e.eco[f].elimine) &&
      PDR.regles.hostile(f, joueur, e.alliance, e.hostilite));
  }

  // ---------------------------------------------------------------------------------------------------------------

  function creerHud(o) {
    const doc = o.document, R = o.regles || PDR.regles, P = o.protocole || PDR.protocole, REG = o.reglages || {};
    const rappels = Object.assign({ pause() {}, action() {}, general() {}, annuler() {}, diplomatie() {}, vue() {}, garderType() {}, alerteCarte() {}, refus() {} }, o.rappels || {});
    const $ = id => doc.getElementById(id);
    const EV = P.EV, F = R.FACTIONS, C = R.CONSTANTES;
    const el = {
      motif: $('barre-motif'), nom: $('barre-nom'), camp: $('barre-camp'),
      moyens: $('moyens'), moyensRythme: $('moyens-rythme'), materiaux: $('materiaux'), materiauxRythme: $('materiaux-rythme'),
      pop: $('pop'), popMax: $('pop-max'), resPop: $('res-pop'), scores: $('scores'), horloge: $('horloge'), vitesse: $('vitesse'),
      ips: $('ips'), pause: $('bouton-pause'), diploBouton: $('bouton-diplomatie'), diplo: $('diplomatie'), proposition: $('proposition'),
      colere: $('colere'), peur: $('peur'), hostilite: $('hostilite'), alertes: $('alertes'), message: $('message'), oisifs: $('bouton-oisifs'), selection: $('selection'),
      grille: $('commandes-grille'), carte: $('commandes'), infobulle: $('infobulle'),
    };
    const ecrit = new WeakMap();
    const jauges = new WeakMap();
    const texte = (e, v) => { if (e && ecrit.get(e) !== v) { ecrit.set(e, v); e.textContent = typo(v); } };
    const poser = (e, s) => { if (e) e.innerHTML = typo(s); };
    const REGL = () => PDR.interface.reglages;
    /** Libellé de la première touche d'une action dans les réglages (« F1 », « A »…). */
    const touchePour = id => { const c = REG.touches && REG.touches[id]; return c && c.length && REGL() ? REGL().keyName(c[0]) : ''; };

    let joueur = 0, options = {}, sites = { lieux: [], gisements: [] }, temps = 0, alliance = null, proposition = null, colere = 0;
    let finDelai = 0, signatureDiplo = '', versionRendue = -1, structureRendue = null, eco = null;
    let ips = 0, images = 0, depuis = 0, demo = false;
    const fil = [];          // alertes affichées : { el, t0, duree, x, z }
    let derniere = null;     // dernière alerte située
    const anti = new Map();  // anti-répétition : clé → instant
    let messageT = 0;
    let derniereCarte = null;
    const sortes = new Map();   // id de structure → sorte, pour nommer ce qui disparaît

    // ---- Bandeau du haut ----
    function dessinerScores() {
      let html = '';
      for (let f = 0; f < 3; f++) {
        html += '<div class="score" data-faction="' + f + '" style="--c:' + F[f].css + '"' + (f === joueur ? ' data-moi="oui"' : '') + '>' +
          motifSVG(F[f].motif) + '<span class="score-nom">' + echapper(F[f].court) + '</span><strong class="score-val">0</strong>' +
          '<span class="score-lien" hidden>' + icone('lien', 'icone lien') + '</span><i class="score-barre"><b></b></i></div>';
      }
      el.scores.innerHTML = html;
    }
    function partie(infos) {
      options = (infos && infos.options) || {};
      joueur = options.joueur >= 0 ? options.joueur : 0;
      demo = !(options.joueur >= 0);
      sites = (infos && infos.sites) || { lieux: [], gisements: [] };
      alliance = options.alliance || null;
      proposition = null; colere = 0; finDelai = 0; signatureDiplo = ''; versionRendue = -1; structureRendue = null; eco = null;
      const f = F[joueur];
      if (el.camp) el.camp.style.setProperty('--c', f.css);
      if (el.motif) el.motif.innerHTML = motifSVG(f.motif);
      texte(el.nom, f.court);
      dessinerScores();
      for (const a of fil) a.el.remove();
      fil.length = 0; derniere = null; anti.clear();
      if (el.diplo) el.diplo.hidden = true;
      if (el.diploBouton) el.diploBouton.setAttribute('aria-expanded', 'false');
      if (el.selection) el.selection.innerHTML = '';
      if (el.grille) el.grille.innerHTML = '';
      majTensions({ eco: [], alliance });
    }

    const rythme = v => (v >= 0 ? '+' : '−') + formatNombre(Math.abs(v)) + '/min';
    function etat(e) {
      if (!e) return;
      temps = e.temps || 0;
      texte(el.horloge, formatHorloge(temps));
      if (el.vitesse) { const v = e.vitesse || 1; texte(el.vitesse, v === 1 ? '' : '×' + v); el.vitesse.hidden = v === 1; }
      if (e.eco) {
        eco = e.eco[joueur];
        if (eco) {
          texte(el.moyens, formatNombre(Math.floor(eco.moyens)));
          texte(el.materiaux, formatNombre(Math.floor(eco.materiaux)));
          texte(el.moyensRythme, rythme(eco.revenu ? eco.revenu.moyens : 0));
          texte(el.materiauxRythme, rythme(eco.revenu ? eco.revenu.materiaux : 0));
          texte(el.pop, formatNombre(eco.pop));
          texte(el.popMax, '/ ' + formatNombre(eco.popMax));
          if (el.resPop) el.resPop.classList.toggle('plein', eco.popMax > 0 && eco.pop >= eco.popMax);
          if (el.oisifs) {
            el.oisifs.hidden = !(eco.oisifs > 0);
            if (eco.oisifs > 0) texte(el.oisifs.querySelector('strong'), formatNombre(eco.oisifs));
          }
        }
        majScores(e);
      }
      alliance = e.alliance || null;
      proposition = e.proposition || null;
      colere = e.colere || 0;
      if (e.evenements && e.evenements.length) lireEvenements(e.evenements);
      if (e.structures) { sortes.clear(); for (const s of e.structures) sortes.set(s.id, s.sorte); }
      majTensions(e);
      majDiplomatie();
      majFile();
    }
    function jauge(element, valeur, maximum, libelle, description) {
      if (!element) return;
      const sig = [valeur, maximum, libelle, description].join('|');
      if (jauges.get(element) === sig) return;
      jauges.set(element, sig);
      texte(element.querySelector('strong'), libelle);
      element.querySelector('i b').style.transform = 'scaleX(' + (valeur === null ? 0 : valeur / maximum).toFixed(3) + ')';
      element.setAttribute('aria-valuemax', String(maximum));
      if (valeur === null) element.removeAttribute('aria-valuenow');
      else element.setAttribute('aria-valuenow', String(valeur));
      element.setAttribute('aria-valuetext', typo(libelle + ' — ' + description));
      element.title = typo(description);
    }
    function majTensions(e) {
      const p = eco && Number.isFinite(eco.peur) ? Math.max(0, Math.min(1, eco.peur)) : 0;
      const pct = Math.round(p * 1000) / 10;
      jauge(el.peur, pct, 100, String(pct).replace('.', ',') + ' %',
        'Peur moyenne de vos unités à pied. À ' + Math.round(C.PEUR_SEUIL / C.PEUR_MAX * 100) +
        ' %, une unité se replie, sauf ordre Tenir. Le calme, les Fanfares et les bases apaisent.');
      const secondes = Math.max(0, Math.min(C.COLERE_S, Math.ceil(colere)));
      jauge(el.colere, secondes, C.COLERE_S, secondes + ' s',
        'Colère du Bastion envers la Préfecture : durée de riposte restante, renouvelée quand elle le frappe.');
      const hostiles = campsHostiles(joueur, e);
      jauge(el.hostilite, hostiles === null ? null : hostiles.length, 2, hostiles === null ? '–' : hostiles.length + ' / 2',
        hostiles === null ? 'Hostilité non reçue.' : hostiles.length ?
          'Camps hostiles envers vous : ' + hostiles.map(f => F[f].nom).join(', ') + '. Alliés et camps éliminés exclus.' :
          'Aucun camp hostile envers vous. Alliés et camps éliminés exclus.');
    }
    function majScores(e) {
      const allie = alliance ? alliance : null;
      const total = allie ? (e.eco[allie[0]].score + e.eco[allie[1]].score) : 0;
      for (let f = 0; f < 3; f++) {
        const s = el.scores.children[f];
        if (!s) continue;
        const ef = e.eco[f], dansAlliance = !!allie && allie.includes(f), sc = dansAlliance ? total : ef.score;
        texte(s.querySelector('.score-val'), formatNombre(ef.score));
        s.querySelector('.score-barre b').style.transform = 'scaleX(' + Math.min(1, sc / C.POINTS_VICTOIRE).toFixed(3) + ')';
        s.querySelector('.score-lien').hidden = !dansAlliance;
        s.dataset.elimine = ef.elimine ? 'oui' : 'non';
        s.title = F[f].nom + ' : ' + formatNombre(ef.score) + ' points' + (dansAlliance ? ' ; alliance : ' + formatNombre(total) : '') +
          ' sur ' + formatNombre(C.POINTS_VICTOIRE) + (ef.elimine ? ' (éliminé)' : '') + (ef.qgOccupe > 0 ? ' ; QG occupé à ' + Math.round(ef.qgOccupe * 100) + ' %' : '');
      }
    }

    // ---- Diplomatie ----
    function majDiplomatie() {
      const autres = [0, 1, 2].filter(f => f !== joueur);
      const reste = Math.max(0, Math.ceil(finDelai - temps));
      const sig = JSON.stringify([alliance, proposition && [proposition.de, proposition.a, Math.ceil(proposition.reste)], reste, Math.ceil(colere)]);
      if (sig === signatureDiplo) return;
      signatureDiplo = sig;
      // Proposition reçue.
      if (el.proposition) {
        const recue = proposition && proposition.a === joueur;
        el.proposition.hidden = !recue;
        if (recue) {
          const de = F[proposition.de];
          el.proposition.style.setProperty('--c', de.css);
          const corps = el.proposition.querySelector('.proposition-texte');
          const html = motifSVG(de.motif) + '<span><strong>' + echapper(de.nom) + '</strong> propose une alliance.<small>Des alliés ne se frappent pas, partagent leur vue et gagnent ensemble.</small></span>';
          if (corps.dataset.de !== String(proposition.de)) { poser(corps, html); corps.dataset.de = String(proposition.de); }
          texte(el.proposition.querySelector('.proposition-reste'), Math.ceil(proposition.reste) + ' s');
          el.proposition.dataset.avec = String(proposition.de);
        }
      }
      if (!el.diplo) return;
      const lignes = autres.map(f => {
        const camp = F[f], avec = alliance && alliance.includes(joueur) && alliance.includes(f);
        let statut, bouton;
        if (avec) { statut = 'Allié'; bouton = '<button type="button" class="secondaire petit" data-diplo="rompre" data-avec="' + f + '">Rompre</button>'; }
        else if (proposition && proposition.de === joueur && proposition.a === f) { statut = 'Proposition envoyée · ' + Math.ceil(proposition.reste) + ' s'; bouton = '<button type="button" class="secondaire petit" disabled>En attente</button>'; }
        else if (alliance && alliance.includes(f)) { statut = 'Allié de ' + F[alliance[0] === f ? alliance[1] : alliance[0]].court; bouton = '<button type="button" class="secondaire petit" disabled>Proposer</button>'; }
        else if (alliance && alliance.includes(joueur)) { statut = 'Hostile'; bouton = '<button type="button" class="secondaire petit" disabled>Proposer</button>'; }
        else if (reste > 0) { statut = 'Nouvelle alliance dans ' + reste + ' s'; bouton = '<button type="button" class="secondaire petit" disabled>Proposer</button>'; }
        else { statut = joueur === R.BASTION && f === R.PREFECTURE ? (colere > 0 ? 'Hostile : colère' : 'Ne la frappe pas') : 'Hostile'; bouton = '<button type="button" class="secondaire petit" data-diplo="proposer" data-avec="' + f + '">Proposer</button>'; }
        return '<div class="diplo-ligne" style="--c:' + camp.css + '">' + motifSVG(camp.motif) + '<span><strong>' + echapper(camp.nom) + '</strong><small>' + echapper(statut) + '</small></span>' + bouton + '</div>';
      }).join('');
      const resumeAlliance = !alliance ? 'Aucune alliance en cours.'
        : alliance.includes(joueur) ? 'Vous êtes allié avec ' + F[alliance[0] === joueur ? alliance[1] : alliance[0]].nom.replace(/^L[ae] /, m => m.toLowerCase()) + '.'
          : F[alliance[0]].nom + ' et ' + F[alliance[1]].nom.replace(/^L[ae] /, m => m.toLowerCase()) + ' sont alliés contre vous.';
      poser(el.diplo.querySelector('.diplo-corps'), '<p class="diplo-etat">' + echapper(resumeAlliance) + '</p>' + lignes);
      if (el.diploBouton) el.diploBouton.classList.toggle('actif', !!alliance && alliance.includes(joueur));
    }

    // ---- File de production de la structure choisie (le temps restant s'extrapole entre deux envois). ----
    let fileRecue = 0;
    function majFile() {
      if (!structureRendue || !el.selection) return;
      const s = structureRendue, items = el.selection.querySelectorAll('.file-item');
      const ecoule = s.sorte === 'qg' && s.occupation >= 1 ? 0 : Math.max(0, temps - fileRecue);
      items.forEach((it, k) => {
        const f = s.file && s.file[k];
        if (!f) return;
        const reste = k === 0 ? Math.max(0, f.reste - ecoule) : f.reste;
        it.querySelector('i b').style.transform = 'scaleX(' + (k === 0 && f.total > 0 ? Math.min(1, 1 - reste / f.total) : 0).toFixed(3) + ')';
        if (k === 0) texte(it.querySelector('small'), Math.ceil(reste) + ' s');
      });
    }

    // ---- Sélection et carte de commandes ----
    function contexte(ctx, resume) {
      if (!ctx) return;
      derniereCarte = ctx;
      if (ctx.version !== versionRendue) {
        versionRendue = ctx.version;
        if (ctx.structure !== structureRendue) fileRecue = temps;
        structureRendue = ctx.sorte === 'structure' ? ctx.structure : null;
        rendreSelection(ctx, resume);
        rendreCarte(ctx);
      }
      majSelection(ctx, resume);
    }
    function rendreSelection(ctx, resume) {
      const z = el.selection;
      if (!z) return;
      z.dataset.sorte = ctx.sorte;
      if (ctx.sorte === 'vide') {
        poser(z, '<p class="selection-vide"><strong>Aucune sélection</strong><span class="aide-souris">Clic gauche ou cadre : choisir · Clic droit : ordonner · ' +
          echapper(touchePour('oisifs')) + ' : Équipes oisives · ' + echapper(touchePour('armee')) + ' : l’armée</span>' +
          '<span class="aide-tactile">Touchez vos unités pour les choisir, puis le sol ou une cible pour l’ordre · un doigt déplace la vue, deux la tournent et zooment</span></p>');
        return;
      }
      if (ctx.sorte === 'unites') {
        const types = [];
        for (let t = 0; t < 13; t++) if (resume.parType[t]) types.push(t);
        const seul = types.length === 1 ? R.TYPES[types[0]] : null, f = F[joueur];
        let html = '<div class="selection-tete" style="--c:' + f.css + '"><strong class="selection-n">0</strong><span class="selection-quoi">' +
          echapper(seul ? seul.pluriel : 'unités') + '</span><span class="selection-etat"></span></div>' +
          '<div class="cohesion" title="Cohésion moyenne : à zéro, une unité est hors jeu ; sous 25 %, elle se replie"><span>Cohésion</span><i><b></b></i><strong class="cohesion-val">0 %</strong></div>';
        if (seul) html += '<p class="selection-desc">' + echapper(seul.description) + '</p>';
        html += '<div class="types">';
        for (const t of types) {
          const T = R.TYPES[t];
          html += '<button type="button" class="type" data-type="' + t + '" style="--c:' + F[T.faction].css + '" title="' + echapper(T.pluriel) +
            ' : clic pour ne garder qu’eux, Maj + clic pour les retirer">' + icone(ICONE_ROLE[T.role] || 'ligne') +
            '<strong data-compte="' + t + '">0</strong><span>' + echapper(T.pluriel) + '</span></button>';
        }
        poser(z, html + '</div>');
        return;
      }
      // Structure.
      const s = ctx.structure;
      if (!s) { z.innerHTML = ''; return; }
      const f = F[s.faction] || F[0];
      const nom = s.sorte === 'qg' ? 'QG ' + (s.faction === 1 ? 'du ' : 'de la ') + f.court : s.sorte === 'avant-poste' ? f.avantPoste : 'Barricade';
      let html = '<div class="selection-tete" style="--c:' + f.css + '">' + motifSVG(f.motif) + '<span class="selection-quoi">' + echapper(nom) +
        '</span><span class="selection-etat"></span></div>';
      if (s.sorte !== 'qg') html += '<div class="cohesion pv"><span>' + (s.chantier ? 'Chantier' : 'Structure') + '</span><i><b></b></i><strong class="cohesion-val"></strong></div>';
      else html += '<div class="cohesion pv"><span>Occupation</span><i><b></b></i><strong class="cohesion-val"></strong></div>';
      if (s.faction === joueur && (s.sorte === 'qg' || s.sorte === 'avant-poste')) {
        html += '<p class="file-titre">File de production <small>clic : annuler et rembourser</small></p><div class="file">';
        for (let k = 0; k < C.FILE_MAX; k++) {
          const q = s.file && s.file[k];
          if (q) {
            const T = R.TYPES[q.type];
            html += '<button type="button" class="file-item" data-rang="' + k + '" aria-label="Annuler : ' + echapper(T.pluriel) + ', lot de ' + q.lot + '">' +
              icone(ICONE_ROLE[T.role]) + '<span>×' + q.lot + '</span><small>' + (k === 0 ? Math.ceil(q.reste) + ' s' : '') + '</small><i><b></b></i></button>';
          } else html += '<span class="file-item vide" aria-hidden="true"></span>';
        }
        html += '</div><p class="ralliement">' + (s.ralliement ? 'Ralliement défini · clic droit sur le sol pour le déplacer' : 'Aucun ralliement · clic droit sur le sol') + '</p>';
      } else if (s.sorte === 'barricade') {
        html += '<p class="selection-desc">' + (s.feu ? 'Elle brûle. Le feu reste un décor : il ne touche personne. ' : '') +
          (s.faction === R.CONVERGENCE ? 'Le Bastion et la Préfecture la lèvent ; la Convergence peut retirer les siennes.' : '') + '</p>';
      }
      poser(z, html);
    }
    function majSelection(ctx, resume) {
      const z = el.selection;
      if (!z) return;
      if (ctx.sorte === 'unites') {
        texte(z.querySelector('.selection-n'), formatNombre(resume.n).replace(/\u202f/g, '\u00a0'));   // police de titre : espace pleine
        const c = z.querySelector('.cohesion');
        if (c) {
          c.querySelector('b').style.transform = 'scaleX(' + resume.cohesion.toFixed(3) + ')';
          c.dataset.niveau = resume.cohesion < 0.25 ? 'bas' : resume.cohesion < 0.5 ? 'moyen' : 'haut';
          texte(c.querySelector('.cohesion-val'), Math.round(resume.cohesion * 100) + ' %');
        }
        const etats = [];
        if (resume.repli) etats.push(formatNombre(resume.repli) + ' en repli');
        if (resume.effrayes) etats.push(formatNombre(resume.effrayes) + ' effrayées');
        if (resume.tient) etats.push(formatNombre(resume.tient) + ' tiennent');
        if (resume.oisifs) etats.push(formatNombre(resume.oisifs) + ' Équipes oisives');
        texte(z.querySelector('.selection-etat'), etats.join(' · '));
        for (const s of z.querySelectorAll('[data-compte]')) texte(s, formatNombre(resume.parType[Number(s.dataset.compte)]));
      } else if (ctx.sorte === 'structure' && ctx.structure) {
        const s = ctx.structure, c = z.querySelector('.cohesion');
        if (c) {
          const part = s.sorte === 'qg' ? s.occupation || 0 : s.pvMax ? s.pv / s.pvMax : 0;
          c.querySelector('b').style.transform = 'scaleX(' + Math.min(1, part).toFixed(3) + ')';
          c.dataset.niveau = s.sorte === 'qg' ? (part > 0 ? 'bas' : 'haut') : part < 0.3 ? 'bas' : 'haut';
          texte(c.querySelector('.cohesion-val'), s.sorte === 'qg' ? Math.round(part * 100) + ' %' : formatNombre(s.pv) + ' / ' + formatNombre(s.pvMax));
        }
        texte(z.querySelector('.selection-etat'), s.sorte === 'qg' ? (s.occupation >= 1 ? 'Occupé : ne produit plus' : s.occupation > 0 ? 'Parvis envahi' : 'Indestructible')
          : s.chantier ? 'En chantier' : s.feu ? 'En feu' : '');
      }
    }
    function rendreCarte(ctx) {
      const g = el.grille;
      if (!g) return;
      g.dataset.sorte = ctx.sorte;
      if (!ctx.actions.length) {
        poser(g, ctx.sorte === 'structure' && ctx.structure && ctx.structure.faction !== joueur
          ? '<p class="carte-vide">' + echapper(F[ctx.structure.faction] ? F[ctx.structure.faction].nom : '') + '</p>'
          : '<p class="carte-vide">Choisissez des unités, votre QG ou un avant-poste.</p>');
        return;
      }
      let html = '';
      for (const a of ctx.actions) {
        if (a.vide) { html += '<span class="cmd vide" aria-hidden="true"></span>'; continue; }
        const nomIcone = a.type !== undefined ? ICONE_ROLE[R.TYPES[a.type].role] : a.id;
        const court = a.type !== undefined ? R.TYPES[a.type].nom : a.id === 'avantPoste' ? a.libelle : COURTS[a.id] || a.libelle;
        html += '<button type="button" class="cmd" data-cmd="' + a.id + '"' + (a.actif ? '' : ' aria-disabled="true"') + ' aria-pressed="' + !!a.enCours + '"' +
          ' aria-label="' + echapper(a.libelle + (a.touche ? ' (' + a.touche + ')' : '') + (a.raison ? ' : ' + a.raison : '')) + '"' +
          (a.type !== undefined ? ' style="--c:' + F[R.TYPES[a.type].faction].css + '"' : '') + '>' + icone(nomIcone) +
          (a.touche ? '<kbd>' + echapper(a.touche) + '</kbd>' : '') + '<span>' + echapper(court) + '</span>' +
          (a.lot ? '<small>×' + a.lot + '</small>' : '') + '</button>';
      }
      poser(g, html);
    }
    function bulle(bouton) {
      const b = el.infobulle;
      if (!b || REG.infobulles === false || !bouton) return;
      const ctxId = bouton.dataset.cmd, a = derniereCarte && derniereCarte.actions.find(q => q.id === ctxId);
      if (!a) return;
      const T = a.type !== undefined ? R.TYPES[a.type] : null;
      let html = '<strong>' + echapper(a.libelle) + (a.touche ? ' <kbd>' + echapper(a.touche) + '</kbd>' : '') + '</strong>';
      html += '<p>' + echapper(T ? T.description : AIDES[a.id] || '') + '</p>';
      if (T) html += '<p class="bulle-chiffres">Lot de ' + T.lot + ' · ' + T.duree + ' s · cohésion ' + T.coh + ' · vitesse ' + String(T.vitesse).replace('.', ',') + ' m/s</p>';
      if (a.cout) {
        const parties = [];
        if (a.cout.moyens) parties.push(icone('moyens', 'icone mini') + formatNombre(a.cout.moyens) + ' Moyens');
        if (a.cout.materiaux) parties.push(icone('materiaux', 'icone mini') + formatNombre(a.cout.materiaux) + ' Matériaux' + (a.cout.parMetre ? ' par mètre' : ''));
        if (parties.length) html += '<p class="bulle-cout">' + parties.join(' · ') + '</p>';
      }
      if (a.raison) html += '<p class="bulle-raison">' + echapper(a.raison) + '</p>';
      poser(b, html);
      b.hidden = false;
    }

    // ---- Alertes ----
    function alerte(txt, opt = {}) {
      if (demo) return;
      if (REG.alertes === false && opt.sorte !== 'danger') return;
      const cle = opt.cle || txt, t = maintenant();
      if (anti.has(cle) && t - anti.get(cle) < (opt.repit || 4000)) return;
      anti.set(cle, t);
      const li = doc.createElement('li');
      li.className = 'alerte';
      li.dataset.sorte = opt.sorte || 'info';
      if (opt.faction >= 0) li.style.setProperty('--c', F[opt.faction].css);
      const situee = Number.isFinite(opt.x) && Number.isFinite(opt.z);
      li.innerHTML = typo('<button type="button"' + (situee ? '' : ' disabled') + '>' + (opt.faction >= 0 ? motifSVG(F[opt.faction].motif) : icone(opt.sorte === 'danger' ? 'danger' : 'lieu')) +
        '<span>' + echapper(txt) + '</span><time>' + formatHorloge(temps) + '</time></button>');
      if (situee) {
        li.firstChild.addEventListener('click', () => rappels.vue(opt.x, opt.z));
        derniere = [opt.x, opt.z];
        rappels.alerteCarte(opt.x, opt.z, opt.sorte === 'danger' ? '#ff6b5a' : opt.faction >= 0 ? F[opt.faction].css : '#f0be4a');
      }
      el.alertes.prepend(li);
      fil.unshift({ el: li, t0: t, duree: opt.sorte === 'danger' ? 14000 : 9000 });
      while (fil.length > 5) fil.pop().el.remove();
    }
    const maintenant = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
    const nomLieu = k => (sites.lieux && sites.lieux[k] ? sites.lieux[k].nom : 'un lieu');
    const sujet = f => F[f].nom;
    const minus = s => s.replace(/^L[ae] /, m => m.toLowerCase());

    function lireEvenements(ev) {
      const k = ev.length / P.EV_TAILLE;
      const moi = joueur, allie = f => alliance && alliance.includes(moi) && alliance.includes(f) && f !== moi;
      for (let q = 0; q < k; q++) {
        const o = q * P.EV_TAILLE, t = ev[o], x = ev[o + 1], z = ev[o + 2], f = ev[o + 3], a = ev[o + 4], b = ev[o + 5];
        switch (t) {
          case EV.ATTAQUE_SUBIE:
            if (f === moi) alerte('Vos unités sont attaquées par ' + minus(sujet(a)) + '.', { x, z, sorte: 'danger', cle: 'att' + Math.round(x / 60) + ':' + Math.round(z / 60), repit: 10000 });
            else if (allie(f)) alerte(sujet(f) + ', votre allié, est attaqué.', { x, z, faction: f, cle: 'allie' + f, repit: 15000 });
            break;
          case EV.LIEU_PRIS:
            if (f === moi) alerte('Vous tenez ' + nomLieu(a) + '.', { x, z, faction: f, sorte: 'bon' });
            else alerte(sujet(f) + ' prend ' + nomLieu(a) + '.', { x, z, faction: f, sorte: allie(f) ? 'info' : 'danger' });
            break;
          case EV.LIEU_NEUTRALISE:
            if (f === moi) alerte('Vous perdez ' + nomLieu(a) + '.', { x, z, sorte: 'danger' });
            break;
          case EV.QG_OCCUPE:
            if (f === moi) alerte('Votre QG est occupé : il ne produit plus !', { x, z, sorte: 'danger', repit: 2000 });
            else alerte('Le QG ' + (f === 1 ? 'du ' : 'de la ') + F[f].court + ' est occupé.', { x, z, faction: a });
            break;
          case EV.QG_REPRIS:
            if (f === moi) alerte('Votre QG est repris.', { x, z, faction: f, sorte: 'bon' });
            break;
          case EV.STRUCTURE_FINIE:
            if (f === moi) alerte(F[moi].avantPoste + ' achevé.', { x, z, faction: f, sorte: 'bon' });
            break;
          case EV.BARRICADE_FINIE:
            if (f === moi) alerte('Barricade achevée.', { x, z, faction: f, sorte: 'bon', cle: 'bf', repit: 3000 });
            break;
          case EV.BARRICADE_POSEE:
            if (f !== moi && !allie(f) && moi !== R.CONVERGENCE) alerte('Une barricade se dresse.', { x, z, faction: f, cle: 'bp' + Math.round(x / 80) + ':' + Math.round(z / 80), repit: 12000 });
            break;
          case EV.BARRICADE_LEVEE:
            if (b === moi && f !== moi) alerte('Une de vos barricades est levée.', { x, z, faction: f, sorte: 'danger', cle: 'bl', repit: 6000 });
            break;
          case EV.STRUCTURE_DETRUITE:
            if (b === moi && sortes.get(a) === 'barricade') alerte('Une de vos barricades est levée.', { x, z, faction: f, sorte: 'danger', cle: 'bl', repit: 6000 });
            else if (b === moi) alerte('Votre ' + F[moi].avantPoste.toLowerCase() + ' est ' + (f === R.CONVERGENCE ? 'cassé.' : 'levé.'), { x, z, sorte: 'danger' });
            break;
          case EV.PRODUCTION:
            if (f === moi) alerte(formatNombre(b) + ' ' + (b > 1 ? R.TYPES[a].pluriel : R.TYPES[a].nom) + ' en renfort.', { x, z, faction: f, cle: 'prod' + a, repit: 5000 });
            break;
          case EV.GISEMENT_EPUISE: {
            const g = sites.gisements && sites.gisements[a];
            alerte((g ? g.nom : 'Un gisement') + ' est épuisé.', { x, z, cle: 'ge' + a });
            break;
          }
          case EV.ALLIANCE_FORMEE:
            alerte(a === moi || b === moi ? 'Alliance conclue avec ' + minus(sujet(a === moi ? b : a)) + '.' : sujet(a) + ' et ' + minus(sujet(b)) + ' s’allient.',
              { sorte: a === moi || b === moi ? 'bon' : 'danger', faction: a === moi ? b : a, repit: 1000 });
            break;
          case EV.ALLIANCE_ROMPUE:
            finDelai = temps + C.ALLIANCE_DELAI_S;
            alerte(f === moi ? 'Vous rompez l’alliance.' : sujet(f) + ' rompt l’alliance' + (a === moi || b === moi ? ' avec vous.' : '.'), { faction: f, sorte: 'danger', repit: 1000 });
            break;
          case EV.ALLIANCE_PROPOSEE:
            if (a === moi) alerte(sujet(f) + ' propose une alliance.', { faction: f, repit: 1000 });
            break;
          case EV.COLERE:
            if (moi === R.PREFECTURE || moi === R.BASTION) alerte(moi === R.BASTION ? 'Frappé par la Préfecture : vous pouvez la frapper ' + Math.round(a) + ' s.' : 'Le Bastion est en colère contre vous : ' + Math.round(a) + ' s.',
              { x, z, faction: R.BASTION, sorte: moi === R.PREFECTURE ? 'danger' : 'info', cle: 'colere', repit: 20000 });
            break;
          case EV.ELIMINATION:
            alerte(f === moi ? 'Vous êtes éliminé.' : sujet(f) + ' est éliminé.', { faction: f, sorte: f === moi ? 'danger' : 'bon', repit: 1000 });
            break;
          case EV.REFUS:
            if (f === moi) refus(a, b);
            break;
          default:
        }
      }
    }
    const RAISONS = {};
    for (const [k, v] of Object.entries(P.RAISONS)) RAISONS[v] = k;
    function refus(raison, typeCmd) {
      const textes = { RESSOURCES: 'Ressources insuffisantes.', PLAFOND: 'Plafond de population atteint.', INTERDIT: 'Votre camp ne peut pas faire cela.',
        EMPLACEMENT: 'Impossible à cet endroit.', INJOIGNABLE: 'Endroit injoignable.', FILE_PLEINE: 'File de production pleine.',
        DELAI: 'Attendez avant une nouvelle alliance.' };
      message(textes[RAISONS[raison]] || (typeCmd === P.CMD.DIPLOMATIE ? 'Proposition refusée.' : 'Ordre refusé.'), true);
    }
    function message(txt, estRefus) {
      if (!el.message || !txt) return;
      el.message.textContent = typo(txt);
      el.message.dataset.sorte = estRefus ? 'refus' : 'info';
      el.message.classList.add('visible');
      messageT = maintenant();
      if (estRefus) rappels.refus(txt);
    }

    // Le bas du bandeau et le haut de la console, mesurés : les panneaux flottants se placent entre les deux
    // (--bas-barre, --haut-console sur #hud), quelle que soit la hauteur du bandeau (un, deux rangs) ou de la console.
    const zoneHud = $('hud'), barreEl = $('barre'), consoleEl = zoneHud ? zoneHud.querySelector('.console') : null;
    let basBarre = -1, hautConsole = -1;
    function mesurerCadre() {
      if (!zoneHud || zoneHud.hidden) return;
      const vue = doc.defaultView || globalThis;
      const b = barreEl ? Math.round(barreEl.getBoundingClientRect().bottom) : 54;
      const c = consoleEl ? Math.round((vue.innerHeight || 0) - consoleEl.getBoundingClientRect().top) : 220;
      if (b !== basBarre) { basBarre = b; zoneHud.style.setProperty('--bas-barre', b + 'px'); }
      if (c !== hautConsole) { hautConsole = c; zoneHud.style.setProperty('--haut-console', c + 'px'); }
    }
    const RO = (doc.defaultView || globalThis).ResizeObserver;
    if (RO && zoneHud) { const ro = new RO(() => mesurerCadre()); if (barreEl) ro.observe(barreEl); if (consoleEl) ro.observe(consoleEl); }

    function image(t) {
      images++;
      if (!depuis) depuis = t;
      if (t - depuis >= 500) {
        ips = images * 1000 / (t - depuis);
        images = 0; depuis = t;
        mesurerCadre();
        const v = String(Math.round(ips));
        if (el.ips) { const b = el.ips.firstChild; if (b && b.nodeType === 3) { if (b.nodeValue !== v + ' ') b.nodeValue = v + ' '; } }
      }
      for (let q = fil.length - 1; q >= 0; q--) {
        const a = fil[q], age = t - a.t0;
        if (age > a.duree) { a.el.remove(); fil.splice(q, 1); }
        else if (age > a.duree - 600 && !a.el.classList.contains('part')) a.el.classList.add('part');
      }
      if (messageT && t - messageT > 2600 && el.message) { el.message.classList.remove('visible'); messageT = 0; }
    }

    // ---- Événements du DOM ----
    if (el.pause) el.pause.addEventListener('click', () => rappels.pause());
    if (el.oisifs) el.oisifs.addEventListener('click', () => rappels.general('oisifs'));
    if (el.diploBouton && el.diplo) {
      el.diploBouton.addEventListener('click', () => {
        el.diplo.hidden = !el.diplo.hidden;
        el.diploBouton.setAttribute('aria-expanded', String(!el.diplo.hidden));
        if (!el.diplo.hidden) { signatureDiplo = ''; majDiplomatie(); }
      });
      el.diplo.addEventListener('click', e => {
        const b = e.target.closest('[data-diplo]');
        if (b && !b.disabled) rappels.diplomatie(b.dataset.diplo, Number(b.dataset.avec));
      });
    }
    if (el.proposition) {
      el.proposition.addEventListener('click', e => {
        const b = e.target.closest('[data-reponse]');
        if (b) rappels.diplomatie(b.dataset.reponse, Number(el.proposition.dataset.avec));
      });
    }
    if (el.grille) {
      el.grille.addEventListener('click', e => {
        const b = e.target.closest('[data-cmd]');
        if (!b) return;
        if (b.getAttribute('aria-disabled') === 'true') {
          const a = derniereCarte && derniereCarte.actions.find(q => q.id === b.dataset.cmd);
          if (a && a.raison) message(a.raison);
          return;
        }
        rappels.action(b.dataset.cmd, { maj: e.shiftKey });
      });
      el.grille.addEventListener('pointerover', e => { const b = e.target.closest('[data-cmd]'); if (b) bulle(b); });
      el.grille.addEventListener('pointerout', e => { if (!el.grille.contains(e.relatedTarget) && el.infobulle) el.infobulle.hidden = true; });
      el.grille.addEventListener('focusin', e => { const b = e.target.closest('[data-cmd]'); if (b) bulle(b); });
      el.grille.addEventListener('focusout', () => { if (el.infobulle) el.infobulle.hidden = true; });
    }
    if (el.selection) {
      el.selection.addEventListener('click', e => {
        const f = e.target.closest('.file-item[data-rang]');
        if (f) { rappels.annuler(Number(f.dataset.rang)); return; }
        const t = e.target.closest('[data-type]');
        if (t) rappels.garderType(Number(t.dataset.type), !e.shiftKey);
      });
    }

    return {
      partie, etat, image, message, alerte,
      contexte,
      /** Redessine la carte de commandes au prochain contexte (touches changées dans les réglages). */
      invalider() { versionRendue = -1; },
      derniereAlerte: () => derniere,
      demo(oui) { demo = !!oui; },
      get ips() { return ips; },
    };
  }

  I.creerHud = creerHud;
  I.outils = Object.freeze({ formatNombre, formatHorloge, motifSVG, icone, echapper, typo, typographier, campsHostiles, ICONES, MOTIFS, COURTS, AIDES, ICONE_ROLE });
})(globalThis.PDR = globalThis.PDR || {});
