// alertes.js — file d’alertes contextuelles
// Dépend de : etatSimulation (feux, nuagesGaz, baseJoueur, avantPostes, unitesSelectionnees)

const ALERTES = (() => {
  const MAX_VISIBLES = 4;
  let file = [];
  let conteneur = null;

  function creerConteneur() {
    conteneur = document.createElement('div');
    conteneur.className = 'conteneur-alertes';
    document.body.appendChild(conteneur);
  }

  function ajouterAlerte(type, message, duree) {
    if (!conteneur) creerConteneur();
    if (duree == null) duree = 4000;

    while (file.length >= MAX_VISIBLES) {
      const ancienne = file.shift();
      if (ancienne.el && ancienne.el.parentNode) {
        ancienne.el.parentNode.removeChild(ancienne.el);
      }
    }

    const el = document.createElement('div');
    el.className = 'alerte alerte-' + type;
    el.textContent = message;
    el.style.opacity = '0';
    conteneur.appendChild(el);

    const item = { el, type, message, duree };
    file.push(item);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });

    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        const idx = file.indexOf(item);
        if (idx !== -1) file.splice(idx, 1);
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, duree);
  }

  function verifierFeuProche(etatSimulation) {
    const feux = etatSimulation.feux || [];
    const unitesSel = etatSimulation.unitesSelectionnees || [];
    const baseJoueur = etatSimulation.baseJoueur;
    const seuil2 = 80 * 80;

    for (let i = 0; i < feux.length; i++) {
      const feu = feux[i];
      for (let j = 0; j < unitesSel.length; j++) {
        const u = unitesSel[j];
        const dx = u.x - feu.x;
        const dy = u.y - feu.y;
        if (dx * dx + dy * dy < seuil2) {
          ajouterAlerte('feu-proche', 'Feu près de vos unités !');
          return;
        }
      }
      if (baseJoueur) {
        const dx = baseJoueur.x - feu.x;
        const dy = baseJoueur.y - feu.y;
        if (dx * dx + dy * dy < seuil2) {
          ajouterAlerte('feu-proche', 'Feu près de vos unités !');
          return;
        }
      }
    }
  }

  function verifierGaz(etatSimulation) {
    const nuages = etatSimulation.nuagesGaz || [];
    const unitesSel = etatSimulation.unitesSelectionnees || [];

    for (let i = 0; i < nuages.length; i++) {
      const n = nuages[i];
      const r2 = n.rayon * n.rayon;
      for (let j = 0; j < unitesSel.length; j++) {
        const u = unitesSel[j];
        const dx = u.x - n.x;
        const dy = u.y - n.y;
        if (dx * dx + dy * dy < r2) {
          ajouterAlerte('gaz', 'Zone de gaz !');
          return;
        }
      }
    }
  }

  function verifierQG(etatSimulation) {
    const baseJoueur = etatSimulation.baseJoueur;
    if (baseJoueur && baseJoueur.occupeeParEnnemi) {
      ajouterAlerte('qg-occupe', 'Votre QG est occupé : déroute dans 30 s');
    }
  }

  function verifierAvantPostes(etatSimulation) {
    const avantPostes = etatSimulation.avantPostes || [];
    for (let i = 0; i < avantPostes.length; i++) {
      const ap = avantPostes[i];
      if (ap.occupee && !ap._dernierEtatOccupee) {
        ajouterAlerte('avant-poste', 'Avant-poste perdu !');
      } else if (!ap.occupee && ap._dernierEtatOccupee) {
        ajouterAlerte('avant-poste', 'Avant-poste repris.');
      }
      ap._dernierEtatOccupee = ap.occupee;
    }
  }

  function tick(etatSimulation) {
    verifierFeuProche(etatSimulation);
    verifierGaz(etatSimulation);
    verifierQG(etatSimulation);
    verifierAvantPostes(etatSimulation);
  }

  return { creerConteneur, ajouterAlerte, tick };
})();
