// bandeau.js — barre supérieure, affichage selon modeVictoire
// Dépend de : etatSimulation (modeVictoire, casseurs, patriotes, deroute, tempsRestant, points)

const BANDEAU = (() => {
  let elBandeau = null;
  let elBarreGauche = null;
  let elBarreDroite = null;
  let elCompteGauche = null;
  let elCompteDroite = null;
  let elTemps = null;
  let elPointsGauche = null;
  let elPointsDroite = null;
  let stylesInjectes = false;

  function injecterStyles() {
    if (stylesInjectes) return;
    stylesInjectes = true;
    const s = document.createElement('style');
    s.textContent = [
      '.bandeau{position:fixed;top:0;left:0;right:0;height:48px;background:rgba(0,0,0,0.7);display:flex;align-items:center;padding:0 12px;z-index:100;color:#fff;font-family:sans-serif;font-size:13px;}',
      '.bandeau-zone{flex:1;display:flex;flex-direction:column;justify-content:center;gap:2px;}',
      '.bandeau-centre{display:flex;align-items:center;gap:12px;padding:0 12px;white-space:nowrap;}',
      '.barre-forces{height:8px;border-radius:3px;transition:width 0.3s ease;}',
      '.compte-deroute{font-size:11px;color:#ff6666;}',
      '.bandeau-temps{font-weight:bold;}',
      '.bandeau-points{font-size:12px;}',
      '.points-gauche{color:#66ccff;}',
      '.points-droite{color:#ffcc66;}',
      '.bandeau-mixte{font-size:12px;}',
      '.bandeau-mixte .bandeau-centre{gap:6px;}',
      '.conteneur-alertes{position:fixed;top:56px;right:12px;display:flex;flex-direction:column;gap:6px;z-index:200;}',
      '.alerte{padding:8px 14px;border-radius:4px;color:#fff;font-size:13px;font-family:sans-serif;transition:opacity 300ms ease;opacity:0;}',
      '.alerte-feu-proche{background:#ff4444;}',
      '.alerte-gaz{background:#ffaa00;}',
      '.alerte-qg-occupe{background:#cc0000;}',
      '.alerte-avant-poste{background:#ff6600;}',
      '@media(max-width:420px){.bandeau{height:36px;font-size:11px;}.bandeau-mixte{font-size:10px;}.alerte{font-size:11px;padding:6px 10px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function creer() {
    injecterStyles();
    elBandeau = document.createElement('div');
    elBandeau.className = 'bandeau';

    const zoneGauche = document.createElement('div');
    zoneGauche.className = 'bandeau-zone';
    elBarreGauche = document.createElement('div');
    elBarreGauche.className = 'barre-forces';
    elBarreGauche.style.width = '100%';
    elBarreGauche.style.background = '#44cc44';
    zoneGauche.appendChild(elBarreGauche);
    elCompteGauche = document.createElement('span');
    elCompteGauche.className = 'compte-deroute';
    zoneGauche.appendChild(elCompteGauche);
    elBandeau.appendChild(zoneGauche);

    const zoneCentre = document.createElement('div');
    zoneCentre.className = 'bandeau-centre';
    elTemps = document.createElement('span');
    elTemps.className = 'bandeau-temps';
    zoneCentre.appendChild(elTemps);
    elPointsGauche = document.createElement('span');
    elPointsGauche.className = 'bandeau-points points-gauche';
    zoneCentre.appendChild(elPointsGauche);
    elPointsDroite = document.createElement('span');
    elPointsDroite.className = 'bandeau-points points-droite';
    zoneCentre.appendChild(elPointsDroite);
    elBandeau.appendChild(zoneCentre);

    const zoneDroite = document.createElement('div');
    zoneDroite.className = 'bandeau-zone';
    elBarreDroite = document.createElement('div');
    elBarreDroite.className = 'barre-forces';
    elBarreDroite.style.width = '100%';
    elBarreDroite.style.background = '#44cc44';
    zoneDroite.appendChild(elBarreDroite);
    elCompteDroite = document.createElement('span');
    elCompteDroite.className = 'compte-deroute';
    zoneDroite.appendChild(elCompteDroite);
    elBandeau.appendChild(zoneDroite);

    document.body.appendChild(elBandeau);
  }

  function couleurPourcentage(pct) {
    const r = Math.round(255 * (1 - pct));
    const g = Math.round(200 * pct);
    return 'rgb(' + r + ',' + g + ',40)';
  }

  function formaterTemps(secondes) {
    const s = Math.max(0, Math.floor(secondes));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return mm + ':' + ss;
  }

  function maj(etatSimulation) {
    if (!elBandeau) return;

    const mode = etatSimulation.modeVictoire || 'dernier';
    const casseurs = etatSimulation.casseurs || { vivantes: 0, initiales: 1 };
    const patriotes = etatSimulation.patriotes || { vivantes: 0, initiales: 1 };
    const deroute = etatSimulation.deroute || {};
    const tempsRestant = etatSimulation.tempsRestant || 0;
    const points = etatSimulation.points || { casseurs: 0, patriotes: 0, cible: 500 };

    const pctCasseurs = casseurs.initiales > 0 ? casseurs.vivantes / casseurs.initiales : 0;
    const pctPatriotes = patriotes.initiales > 0 ? patriotes.vivantes / patriotes.initiales : 0;
    elBarreGauche.style.width = (pctCasseurs * 100) + '%';
    elBarreGauche.style.background = couleurPourcentage(pctCasseurs);
    elBarreDroite.style.width = (pctPatriotes * 100) + '%';
    elBarreDroite.style.background = couleurPourcentage(pctPatriotes);

    if (mode === 'dernier') {
      const dCasseurs = deroute.casseurs;
      const dPatriotes = deroute.patriotes;
      elCompteGauche.textContent = (dCasseurs != null && dCasseurs > 0)
        ? 'Déroute dans ' + Math.ceil(dCasseurs) + ' s' : '';
      elCompteDroite.textContent = (dPatriotes != null && dPatriotes > 0)
        ? 'Déroute dans ' + Math.ceil(dPatriotes) + ' s' : '';
    } else {
      elCompteGauche.textContent = '';
      elCompteDroite.textContent = '';
    }

    if (mode === 'temps' || mode === 'mixte') {
      elTemps.textContent = formaterTemps(tempsRestant);
      elTemps.style.display = '';
    } else {
      elTemps.textContent = '';
      elTemps.style.display = 'none';
    }

    if (mode === 'points' || mode === 'mixte') {
      elPointsGauche.textContent = points.casseurs + ' / ' + points.cible;
      elPointsDroite.textContent = points.patriotes + ' / ' + points.cible;
      elPointsGauche.style.display = '';
      elPointsDroite.style.display = '';
    } else {
      elPointsGauche.textContent = '';
      elPointsDroite.textContent = '';
      elPointsGauche.style.display = 'none';
      elPointsDroite.style.display = 'none';
    }

    if (mode === 'mixte') {
      elBandeau.classList.add('bandeau-mixte');
    } else {
      elBandeau.classList.remove('bandeau-mixte');
    }
  }

  return { creer, maj };
})();
