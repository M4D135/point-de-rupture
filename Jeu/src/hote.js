/* Point de rupture — hôte de la simulation, côté page.

   La simulation tourne dans un travailleur (Web Worker) construit à partir du texte des scripts marqués
   « data-travailleur » dans la page, dans leur ordre : les scripts partagés (exécutés aussi dans la page, comme
   ville.js ou les contrats) et ceux de la simulation seule, posés en type="text/plain" et donc inertes dans la page.
   Si le navigateur refuse le travailleur (politique de sécurité, cadre isolé, Worker absent), la même simulation tourne
   sur le fil principal : ses scripts sont alors exécutés une fois dans la page et PDR.travailleur.creer(envoyer)
   reçoit les messages. Le protocole ne change pas (sim/protocole.js) ; seuls les transferts de tampons disparaissent.

   API :
     PDR.hote.creer({ surMessage, surPanne, document, forcerFil }) → hote
       surMessage(message)  chaque message du travailleur (pret, etat, fin, erreur)
       surPanne(texte)      le travailleur est tombé après le départ de la partie (rare : sinon c'est « erreur »)
       forcerFil            vrai : simulation sur le fil principal d'emblée (essais, mesures)
     hote.mode              'travailleur' ou 'fil'
     hote.raison            pourquoi le fil principal, le cas échéant ('' sinon)
     hote.demarrer(options) envoie { type: 'demarrer', options } (OPTIONS du protocole)
     hote.envoyer(message, transferts)
     hote.commandes(liste)  envoie { type: 'commandes', liste }
     hote.rendre(tampon)    rend un tampon d'unités lu (transféré au travailleur)
     hote.vitesse(x)        0, 1, 2 ou 4
     hote.arreter()         arrête la partie et libère le travailleur
*/
(function (PDR) {
  'use strict';

  function creer({ surMessage, surPanne = null, document: doc = globalThis.document, forcerFil = false } = {}) {
    if (typeof surMessage !== 'function') throw new TypeError('hote : surMessage manquant');
    const scripts = Array.from(doc.querySelectorAll('script[data-travailleur]'));
    let worker = null, url = '', local = null, pret = false, fini = false;
    // Messages partis avant « pret » et sans transfert : rejoués si le travailleur tombe au chargement.
    const avantPret = [];
    const hote = { mode: '', raison: '', demarrer, envoyer, commandes, rendre, vitesse, arreter };

    function recu(message) {
      if (fini || !message) return;
      if (message.type === 'pret') { pret = true; avantPret.length = 0; }
      surMessage(message);
    }

    function libererTravailleur() {
      if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); worker = null; }
      if (url) { URL.revokeObjectURL(url); url = ''; }
    }

    function surLeFil(raison) {
      libererTravailleur();
      if (!PDR.travailleur) {
        // Les scripts de la simulation seule ne sont que du texte dans la page : on les exécute ici, une fois.
        for (const s of scripts) {
          if ((s.type || '').toLowerCase() !== 'text/plain') continue;
          const vif = doc.createElement('script');
          vif.textContent = s.textContent;
          (doc.head || doc.documentElement).appendChild(vif);
        }
      }
      if (!PDR.travailleur || typeof PDR.travailleur.creer !== 'function') throw new Error('hote : simulation absente de la page');
      local = PDR.travailleur.creer(recu);
      hote.mode = 'fil';
      hote.raison = raison;
      for (const m of avantPret.splice(0)) livrerLocal(m);
    }

    // Sur le fil principal, la page ne parle jamais à la simulation au milieu d'une de ses itérations. L'ordre des
    // messages est celui de l'envoi, « arreter » compris (les messages partis avant lui sont livrés avant lui).
    function livrerLocal(message, cible = local) {
      queueMicrotask(() => {
        if (!cible) return;
        try { cible.recevoir(message); }
        catch (e) { recu({ type: 'erreur', message: String((e && e.message) || e), pile: String((e && e.stack) || '') }); }
      });
    }

    function envoyer(message, transferts) {
      if (fini) return;
      if (worker) {
        if (!pret && !(transferts && transferts.length)) avantPret.push(message);
        worker.postMessage(message, transferts || []);
      } else livrerLocal(message);
    }
    function demarrer(options) { envoyer({ type: 'demarrer', options }); }
    function commandes(liste) { if (liste && liste.length) envoyer({ type: 'commandes', liste }); }
    function rendre(tampon) {
      if (!tampon || !tampon.byteLength) return;   // tampon détaché ou vide : rien à rendre
      envoyer({ type: 'rendre', tampon }, worker ? [tampon] : null);
    }
    function vitesse(x) { envoyer({ type: 'vitesse', x }); }
    function arreter() {
      if (fini) return;
      if (local) livrerLocal({ type: 'arreter' }, local);   // arrête la boucle de la simulation sur le fil
      fini = true;
      libererTravailleur();
      local = null;
    }

    const possible = !forcerFil && typeof Worker === 'function' && typeof Blob === 'function'
      && typeof URL === 'function' && typeof URL.createObjectURL === 'function';
    if (!possible) surLeFil(forcerFil ? 'demandé' : 'Worker absent');
    else {
      try {
        const texte = scripts.map(s => s.textContent).join('\n;\n');
        url = URL.createObjectURL(new Blob([texte], { type: 'text/javascript' }));
        worker = new Worker(url, { name: 'point-de-rupture-simulation' });
        worker.onmessage = e => recu(e.data);
        worker.onmessageerror = () => recu({ type: 'erreur', message: 'message illisible du travailleur', pile: '' });
        worker.onerror = e => {
          if (e && e.preventDefault) e.preventDefault();
          const texteErreur = (e && e.message) || 'erreur de chargement';
          if (!pret) surLeFil('travailleur refusé : ' + texteErreur);
          else if (surPanne) surPanne(texteErreur);
        };
        hote.mode = 'travailleur';
      } catch (e) {
        surLeFil('travailleur refusé : ' + (e && e.message || e));
      }
    }
    return hote;
  }

  PDR.hote = Object.freeze({ creer });
})(globalThis.PDR = globalThis.PDR || {});
