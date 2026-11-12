/* Point de rupture — le travailleur de simulation (CONCEPTION.md §2, contrat : protocole.js). Ni window ni document.

   Il reçoit les messages de la page, fait tourner le monde à 20 itérations par seconde × vitesse et renvoie un état
   après chaque itération. Dans un vrai Web Worker, le fichier se branche seul sur self.onmessage ; ailleurs (fil
   principal quand le navigateur refuse le travailleur, Node pour les essais), on l'appelle par :

     const t = PDR.travailleur.creer(envoyer, reglages)
       envoyer(message, transferts)  vers la page ; dans un Worker : self.postMessage(message, transferts)
       reglages (facultatif)         { horloge: () => ms, minuterie: (fn, ms) => jeton, annuler: jeton => void }
     t.recevoir(message)             un message de la page (demarrer, commandes, rendre, vitesse, arreter)
     t.arreter()                     arrête la boucle
     t.monde, t.ia                   (lecture, essais)

   Boucle : un réveil par setTimeout ; à chaque réveil, les itérations dues depuis l'origine de l'horloge, quatre au
   plus ; un retard de plus de dix itérations est abandonné (la partie ralentit au lieu de s'emballer). Chaque
   itération : monde.iterer(), puis ia.penser(), puis un message « etat » dont le tampon d'unités est transféré ; la
   page le rend par « rendre », et la réserve (quatre tampons au plus) le resert. Les tableaux du message (voile,
   minicarte, combats, cassables, gisements, évènements) sont des copies, transférées elles aussi.

   Commandes : seules celles du camp du joueur sont acceptées (positions quantifiées au mm et enregistrées par le
   monde) ; les autres, et toutes en démo (joueur -1), donnent un évènement REFUS (raison INTERDIT) dans l'état
   suivant. Les mesures (msIteration, msIA, et msNav par le monde) ne changent rien à l'état.
   Fin de partie : un dernier « etat », puis « fin » { vainqueur, bilan, enregistrement } (enregistrement : celui du
   monde si options.enregistrer, sinon null). Une exception donne « erreur » { message, pile } et arrête tout. */
(function (PDR) {
  'use strict';

  const P = PDR.protocole, R = PDR.regles, K = R.CONSTANTES;
  const TICK = K.TICK_MS, RATTRAPAGE = 4, RETARD_MAX = 10, RESERVE_MAX = 4, MARGE = 4096;
  const OPTIONS_PUBLIQUES = ['graine', 'effectifs', 'joueur', 'alliance', 'difficulte', 'brouillard', 'coalitions', 'enregistrer'];
  // options.ville : 'marseille' (plan réel) ou 'damier' ; « pret » rend celle qui est vraiment construite (P.villeDe).

  function creer(envoyer, reglages = {}) {
    const horloge = reglages.horloge || (() => performance.now());
    const minuterie = reglages.minuterie || ((fn, ms) => setTimeout(fn, ms));
    const annuler = reglages.annuler || (j => clearTimeout(j));
    let monde = null, ia = null, joueur = -1, vitesse = 1, jeton = null, fini = true;
    let origine = 0, faites = 0;
    let msIteration = 0, msIA = 0;
    const reserve = [];
    let refus = [];                                    // [camp, type de commande] en attente du prochain état

    function erreur(e) {
      arreter();
      envoyer({ type: 'erreur', message: String(e && e.message || e), pile: String(e && e.stack || '') });
    }
    function arreter() {
      if (jeton !== null) { annuler(jeton); jeton = null; }
      fini = true;
    }
    function demarrer(o) {
      arreter();
      const options = o || {};
      const effectifs = Number.isFinite(options.effectifs) ? Math.trunc(options.effectifs) : K.EFFECTIFS_DEFAUT;
      const graine = Number.isFinite(options.graine) ? Math.trunc(options.graine) >>> 0 : 1;
      const ville = P.villeDe({ ville: options.ville, graine }, R.ilots(effectifs));
      // L'horloge ne sert qu'à mesurer msNav ; l'état n'en dépend pas.
      monde = PDR.monde.creer(ville, { ...options, graine, effectifs, horloge, vide: false, ia: null });
      ia = PDR.ia.creer(monde);
      joueur = monde.options.joueur;
      vitesse = 1; refus = []; fini = false;
      const publiques = {};
      for (const k of OPTIONS_PUBLIQUES) publiques[k] = monde.options[k];
      publiques.ville = ville.nom;
      envoyer({ type: 'pret', carte: monde.carte, options: publiques });
      envoyerEtat();                                   // l'état de départ (it 0), pour dessiner tout de suite
      origine = horloge(); faites = 0;
      planifier();
    }

    function tamponPour(n) {
      const octets = n * P.FLOATS_PAR_UNITE * 4;
      for (let k = 0; k < reserve.length; k++) if (reserve[k].byteLength >= octets) return reserve.splice(k, 1)[0];
      return new ArrayBuffer(Math.min(P.CAPACITE, n + MARGE) * P.FLOATS_PAR_UNITE * 4);
    }
    function envoyerEtat() {
      const tampon = tamponPour(Math.max(1, monde.n));
      const msg = monde.etat(tampon, vitesse);
      msg.mesure.msIteration = msIteration;
      msg.mesure.msIA = msIA;
      if (refus.length) {
        // Les refus du travailleur s'ajoutent aux évènements de l'itération.
        const ev = new Float32Array(msg.evenements.length + refus.length * 3);
        ev.set(msg.evenements);
        for (let q = 0, o = msg.evenements.length; q < refus.length; q += 2, o += P.EV_TAILLE) {
          ev[o] = P.EV.REFUS; ev[o + 3] = refus[q]; ev[o + 4] = P.RAISONS.INTERDIT; ev[o + 5] = refus[q + 1];
        }
        msg.evenements = ev;
        refus = [];
      }
      const transferts = [tampon, msg.evenements.buffer];
      for (const k of ['voile', 'minicarte', 'combats', 'cassables', 'gisements']) if (msg[k]) transferts.push(msg[k].buffer);
      envoyer(msg, transferts);
    }

    function iterer() {
      const t0 = horloge();
      monde.iterer();
      const t1 = horloge();
      ia.penser();
      msIteration = t1 - t0; msIA = horloge() - t1;
      envoyerEtat();
      if (monde.vainqueur !== P.VAINQUEUR.EN_COURS) {
        fini = true;
        envoyer({ type: 'fin', vainqueur: monde.vainqueur, bilan: monde.bilan(),
          enregistrement: monde.options.enregistrer ? monde.enregistrement() : null });
      }
    }
    /** Un réveil : les itérations dues, puis le réveil suivant à l'heure de la prochaine. */
    function boucle() {
      jeton = null;
      if (fini || vitesse <= 0) return;
      try {
        const pas = TICK / vitesse;
        let dues = Math.floor((horloge() - origine) / pas) - faites;
        if (dues > RETARD_MAX) { faites += dues - RATTRAPAGE; dues = RATTRAPAGE; }
        for (let k = 0; k < Math.min(dues, RATTRAPAGE) && !fini; k++) { iterer(); faites++; }
        planifier();
      } catch (e) { erreur(e); }
    }
    function planifier() {
      if (fini || vitesse <= 0 || jeton !== null) return;
      const pas = TICK / vitesse, prochaine = origine + (faites + 1) * pas;
      jeton = minuterie(boucle, Math.max(0, prochaine - horloge()));
    }

    function recevoir(m) {
      try {
        if (!m || typeof m !== 'object') return;
        switch (m.type) {
          case 'demarrer': demarrer(m.options); return;
          case 'commandes': {
            if (!monde || fini || !Array.isArray(m.liste)) return;
            for (const c of m.liste) {
              if (P.forme(c) !== '') continue;
              if (joueur < 0 || c.j !== joueur) { refus.push(c.j, c.t); continue; }
              monde.soumettre(c, false);
            }
            return;
          }
          case 'rendre':
            if (m.tampon instanceof ArrayBuffer && m.tampon.byteLength > 0 && reserve.length < RESERVE_MAX) reserve.push(m.tampon);
            return;
          case 'vitesse': {
            const x = Number(m.x);
            if (!Number.isFinite(x) || x < 0 || x > 8) return;
            if (jeton !== null) { annuler(jeton); jeton = null; }
            vitesse = x; origine = horloge(); faites = 0;
            planifier();
            return;
          }
          case 'arreter': arreter(); monde = null; ia = null; return;
          default:
        }
      } catch (e) { erreur(e); }
    }

    return { recevoir, arreter, get monde() { return monde; }, get ia() { return ia; }, get vitesse() { return vitesse; } };
  }

  PDR.travailleur = Object.freeze({ creer });

  // Dans un vrai Web Worker : on se branche sur les messages de la page.
  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    const t = creer((message, transferts) => self.postMessage(message, transferts || []));
    self.onmessage = e => t.recevoir(e.data);
  }
})(globalThis.PDR = globalThis.PDR || {});
