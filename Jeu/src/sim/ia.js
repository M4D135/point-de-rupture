/* Point de rupture — l'intelligence des camps (CONCEPTION.md §1.9). Ni window ni document.

   L'IA ne modifie jamais l'état : elle lit les tableaux du monde et n'agit que par des commandes du protocole,
   soumises par monde.soumettre(cmd, true). Elle est déterministe : entiers et flottants IEEE sans trigonométrie,
   aléa à graine propre à chaque camp ; même état, mêmes commandes.

   Chaque camp tenu par l'IA (monde.estIA) réfléchit une fois par seconde (une toutes les deux en Facile), à tour de
   rôle : le camp f réfléchit aux itérations où (it + décalage f) % période = 0. Une vue partagée — la force des camps
   par case de 32 m — est refaite au plus une fois par itération où un camp réfléchit.

   Ce que fait un camp à chaque réflexion :
   - diplomatie : il accepte une alliance quand le troisième camp est le plus fort ; avec options.coalitions, deux
     IA s'allient contre un camp qui dépasse 45 % de la force totale, et rompent quand l'allié dépasse 55 % ;
   - économie : environ 4 % d'Équipes, envoyées au gisement non saturé le plus proche ; production selon la
     composition cible et les ressources ; un avant-poste quand il est riche ;
   - armées : 3 à 8 groupes par proximité (k-moyennes sur les cases de 32 m), refaits toutes les 10 s ; objectifs
     pris dans l'ordre : défendre le QG, défendre un lieu attaqué, prendre un lieu, frapper un groupe plus faible,
     harceler des récolteurs ;
   - règles du camp : la Convergence barricade les rues qui mènent à ses lieux quand l'ennemi approche, et casse
     quand elle manque de Matériaux ; le Bastion évite la Préfecture tant qu'il n'est pas en colère ; la Préfecture
     (et le Bastion) lèvent les barricades qui les gênent, la Préfecture lève aussi les avant-postes ennemis.
   - Difficile : un groupe nettement plus faible que l'ennemi au contact se replie.

   API :
     const ia = PDR.ia.creer(monde)   les camps de monde.estIA (tous en démo, joueur -1)
     ia.penser()                      après chaque monde.iterer()
     ia.camps[f]                      état d'un camp (groupes, objectifs), pour les essais */
(function (PDR) {
  'use strict';

  const R = PDR.regles, P = PDR.protocole, K = R.CONSTANTES, ET = R.ETATS, CMD = P.CMD;
  const CONV = R.CONVERGENCE, BAST = R.BASTION, PREF = R.PREFECTURE;
  const IT_S = K.IT_PAR_S, HORS_JEU = ET.HORS_JEU;
  const CASE = 32000;                                   // mm : case de la vue (4 × 4 cases de 8 m)
  const REGROUPER_IT = 10 * IT_S, RELANCE_IT = 15 * IT_S, POSTE_IT = 30 * IT_S, CASSE_IT = 10 * IT_S, BARRICADE_IT = 25 * IT_S;
  const SATURE = K.RECOLTEURS_MAX + 8;                  // récolteurs envoyés par gisement au plus (40 + 8 qui attendent)
  /** Distance au carré, par multiplications (pas d'opérateur **, dont l'arrondi n'est pas garanti partout). */
  const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

  function creer(monde) {
    const nav = monde.nav, O = monde.O, S = monde.S, T = monde.T, opt = monde.options;
    const { ufac, utyp, uetat, uord, ucib, ucoh, ux, uz, uc8 } = monde;
    const nx8 = monde.nx8, nz8 = monde.nz8, N8 = monde.N8, echelle = monde.echelle;
    const gx = Math.ceil(nx8 / 4), gz = Math.ceil(nz8 / 4), G = gx * gz;
    const X0 = nav.X0, Z0 = nav.Z0;
    const c32DeC8 = new Int32Array(N8);
    for (let c = 0; c < N8; c++) c32DeC8[c] = ((c % nx8) >> 2) + (((c / nx8) | 0) >> 2) * gx;
    const caseDe = (x, z) => {
      const i = Math.max(0, Math.min(gx - 1, Math.trunc((x - X0) / CASE))), j = Math.max(0, Math.min(gz - 1, Math.trunc((z - Z0) / CASE)));
      return i + j * gx;
    };
    const cx32 = c => X0 + (c % gx) * CASE + CASE / 2, cz32 = c => Z0 + ((c / gx) | 0) * CASE + CASE / 2;
    const diff = R.DIFFICULTES[opt.difficulte];
    const periode = IT_S * diff.reflexion, fin = opt.difficulte === 2;
    const decalage = [0, Math.round(periode / 3), Math.round(2 * periode / 3)];
    const NL = monde.lieux.length, NG = monde.gis.length, NK = monde.casX.length;
    const combat = o => o === O.AUCUN || o === O.ALLER || o === O.ATTAQUE_MVT || o === O.ATTAQUER || o === O.TENIR || o === O.REGROUPER;

    // ---- Vue partagée : force (cohésion, en millièmes) des unités de combat et Équipes, par camp et case de 32 m. ----
    const force = new Float64Array(3 * G), equipes = new Int32Array(3 * G), forceCamp = new Float64Array(3);
    let vueIt = -1;
    function voir() {
      if (vueIt === monde.it) return;
      vueIt = monde.it;
      force.fill(0); equipes.fill(0); forceCamp.fill(0);
      const n = monde.n;
      for (let i = 0; i < n; i++) {
        const f = ufac[i];
        if (f > 2 || uetat[i] === HORS_JEU) continue;
        const c = c32DeC8[uc8[i]];
        if (utyp[i] === R.OUVRIER[f]) equipes[f * G + c]++;
        else force[f * G + c] += ucoh[i];
        forceCamp[f] += ucoh[i];
      }
    }
    /** Somme, sur le carré de (2r + 1)² cases autour de c, de la force des camps g tels que filtre(g). */
    function forceAutour(c, r, filtre) {
      const ci = c % gx, cj = (c / gx) | 0;
      let s = 0;
      for (let g = 0; g < 3; g++) {
        if (!filtre(g)) continue;
        const b = g * G;
        for (let j = Math.max(0, cj - r); j <= Math.min(gz - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(gx - 1, ci + r); i++) s += force[b + i + j * gx];
      }
      return s;
    }
    const allies = (a, b) => R.allies(a, b, monde.alliance);

    // ---- État de chaque camp. ----
    const camps = [0, 1, 2].map(f => ({
      f, actif: !!monde.estIA[f], ouvrier: R.OUVRIER[f], base: R.BASE[f], groupes: [], regroupe: -1e9,
      alea: ((opt.graine ^ Math.imul(f + 1, 0x9E3779B1)) >>> 0) || 1,
      dernierPoste: -1e9, derniereCasse: -1e9, barricadeLieu: new Float64Array(NL).fill(-1e9), coalition: false,
      parType: new Int32Array(R.TYPES.length), recolteurs: new Int32Array(NG), oisives: new Int32Array(1024), nOisives: 0,
      recolteursIds: new Int32Array(1024), nRecolteurs: 0,
      nCasseurs: 0, leveurs: new Map(), compte: new Int32Array(G), unites: new Int32Array(1024), nUnites: 0,
      commandes: 0,
    }));
    const tirer = c => {
      c.alea = (c.alea + 0x6D2B79F5) >>> 0;
      let t = c.alea;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
    function ordonner(c, t, champs) {
      c.commandes++;
      monde.soumettre(P.commande(t, c.f, champs), true);
    }
    let tampon = new Int32Array(4096);
    const agrandir = (a, n) => { if (a.length >= n) return a; const b = new Int32Array(Math.max(n, a.length * 2)); b.set(a); return b; };

    function penser() {
      if (monde.vainqueur !== P.VAINQUEUR.EN_COURS) return;
      const it = monde.it;
      for (let f = 0; f < 3; f++) {
        const c = camps[f];
        if (!c.actif || monde.elimine[f] || (it + decalage[f]) % periode !== 0) continue;
        voir();
        recenser(c);
        diplomatie(c);
        economie(c);
        armees(c);
      }
    }

    // ---- Recensement : une lecture des emplacements du camp. ----
    function recenser(c) {
      const f = c.f, n = monde.n;
      c.parType.fill(0); c.recolteurs.fill(0); c.nOisives = 0; c.nRecolteurs = 0; c.nCasseurs = 0; c.leveurs.clear();
      for (let i = 0; i < n; i++) {
        if (ufac[i] !== f || uetat[i] === HORS_JEU) continue;
        const t = utyp[i], o = uord[i];
        c.parType[t]++;
        if (t === c.ouvrier) {
          if (o === O.AUCUN) { c.oisives = agrandir(c.oisives, c.nOisives + 1); c.oisives[c.nOisives++] = i; }
          else if (o === O.RECOLTER) {
            c.recolteurs[ucib[i]]++;
            c.recolteursIds = agrandir(c.recolteursIds, c.nRecolteurs + 1); c.recolteursIds[c.nRecolteurs++] = i;
          }
        }
        if (o === O.CASSER) c.nCasseurs++;
        else if (o === O.LEVER || o === O.BARRICADER || o === O.CONSTRUIRE) c.leveurs.set(ucib[i], (c.leveurs.get(ucib[i]) || 0) + 1);
      }
    }

    // ---- Diplomatie (§1.2). ----
    function diplomatie(c) {
      const f = c.f, total = forceCamp[0] + forceCamp[1] + forceCamp[2];
      const prop = monde.proposition, alliance = monde.alliance;
      if (prop && prop.a === f) {
        const t = 3 - f - prop.de;
        const accepte = forceCamp[t] >= forceCamp[f] && forceCamp[t] >= forceCamp[prop.de];
        ordonner(c, CMD.DIPLOMATIE, { action: accepte ? 'accepter' : 'refuser', avec: prop.de });
        if (accepte && monde.estIA[prop.de]) { c.coalition = true; camps[prop.de].coalition = true; }
        return;
      }
      if (!opt.coalitions || total <= 0) return;
      if (alliance) {
        // Une coalition d'IA se rompt quand l'allié devient à son tour dominant.
        const allie = alliance[0] === f ? alliance[1] : alliance[1] === f ? alliance[0] : -1;
        if (allie >= 0 && c.coalition && forceCamp[allie] > 0.55 * total) {
          ordonner(c, CMD.DIPLOMATIE, { action: 'rompre', avec: allie });
          c.coalition = false; camps[allie].coalition = false;
        }
        return;
      }
      if (prop || monde.delaiAlliance > 0) return;
      for (let x = 0; x < 3; x++) {
        if (x === f || forceCamp[x] <= K.COALITION_SEUIL * total) continue;
        const autre = 3 - f - x;
        // Le plus petit des deux camps menacés propose ; l'autre acceptera (le troisième est le plus fort).
        if (monde.estIA[autre] && !monde.elimine[autre] && f < autre) ordonner(c, CMD.DIPLOMATIE, { action: 'proposer', avec: autre });
        return;
      }
    }

    // ---- Économie. ----
    function economie(c) {
      recolter(c);
      produire(c);
      batirPoste(c);
    }
    /**
     * Les Équipes oisives vont au gisement non saturé le plus proche, de la sorte qui manque le plus ; quand une
     * ressource s'entasse, un dixième des récolteurs de cette sorte (ceux qui ne portent rien) passe à l'autre.
     */
    function recolter(c) {
      const f = c.f, gis = monde.gis;
      const moyens = monde.res[f * 2], materiaux = monde.res[f * 2 + 1];
      const veutMateriaux = materiaux * 3 < moyens;
      if (c.nOisives) affecter(c, c.oisives, c.nOisives, veutMateriaux, false);
      // Rééquilibrage : part voulue des récolteurs sur les Matériaux.
      if (c.nRecolteurs < 10) return;
      const part = materiaux > 2 * moyens ? 0.1 : materiaux * 5 < moyens ? 0.5 : 0.28;
      let surX = 0;
      for (let q = 0; q < c.nRecolteurs; q++) if (!gis[ucib[c.recolteursIds[q]]].moyens) surX++;
      const voulu = Math.round(part * c.nRecolteurs), ecart = surX - voulu;
      if (Math.abs(ecart) * 10 < c.nRecolteurs) return;
      const versX = ecart < 0, nombre = Math.min(Math.abs(ecart), Math.ceil(c.nRecolteurs / 10));
      let k = 0;
      c.mobiles = agrandir(c.mobiles || new Int32Array(64), nombre);
      for (let q = 0; q < c.nRecolteurs && k < nombre; q++) {
        const i = c.recolteursIds[q];
        if (gis[ucib[i]].moyens === versX && monde.ucharge[i] === 0 && monde.uphase[i] !== monde.PH.RECOLTE) c.mobiles[k++] = i;
      }
      if (k) affecter(c, c.mobiles, k, versX, true);
    }
    /** Répartit des Équipes sur les gisements non saturés, la sorte voulue d'abord, les plus proches du QG d'abord. */
    function affecter(c, liste, nombre, veutMateriaux, strict) {
      const f = c.f, gis = monde.gis, stock = monde.stock, qg = monde.structures[f], ordre = [];
      for (let g = 0; g < NG; g++) {
        if (stock[g] <= 0 || c.recolteurs[g] >= SATURE || (strict && gis[g].moyens === veutMateriaux)) continue;
        if (forceAutour(caseDe(gis[g].x, gis[g].z), 1, h => h !== f && monde.hostileA(h, f)) > 3000000) continue;   // trop exposé
        const dx = gis[g].x - qg.x, dz = gis[g].z - qg.z;
        ordre.push([(gis[g].moyens === !veutMateriaux ? 0 : 1e13) + dx * dx + dz * dz, g]);
      }
      ordre.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const pris = new Uint8Array(nombre);
      let reste = nombre;
      for (const [, g] of ordre) {
        if (!reste) break;
        let place = SATURE - c.recolteurs[g];
        tampon = agrandir(tampon, place);
        // Les Équipes les plus proches de ce gisement.
        const choix = [];
        for (let q = 0; q < nombre; q++) {
          if (pris[q]) continue;
          const i = liste[q], dx = ux[i] - gis[g].x, dz = uz[i] - gis[g].z;
          choix.push([dx * dx + dz * dz, q]);
        }
        choix.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let k = 0;
        for (const [, q] of choix) { if (!place) break; pris[q] = 1; tampon[k++] = liste[q]; place--; reste--; }
        if (k) { ordonner(c, CMD.RECOLTER, { ids: tampon.subarray(0, k), gisement: g }); c.recolteurs[g] += k; }
      }
    }
    /** Production : des Équipes jusqu'à 4 % des effectifs, puis le type le plus en retard sur la composition cible. */
    function produire(c) {
      const f = c.f, structures = monde.structures;
      const vivantes = monde.vivantes[f];
      let libre = monde.popMax[f] - monde.pop[f] - monde.popEnFile(f);
      let moyens = monde.res[f * 2], materiaux = monde.res[f * 2 + 1];
      const reserveX = f === CONV ? 60000 * echelle : 0;
      const compo = PDR.monde.COMPOSITION[f];
      let totalCombat = 0;
      for (const [t] of compo) totalCombat += c.parType[t];
      const lot = t => T.lot[t] * echelle, coutM = t => T.coutM[t] * echelle, coutX = t => T.coutX[t] * echelle;
      const abordable = (t, reserve) => moyens >= coutM(t) && materiaux - coutX(t) >= reserve && libre >= lot(t) * T.pop[t];
      for (const s of structures) {
        if (!s.vivante || s.faction !== f || s.sorte === S.BARRICADE || s.chantier || (s.sorte === S.QG && s.occupe)) continue;
        const max = s.sorte === S.QG ? 2 : 1;
        if (s.file.length >= max) continue;
        let t = -1;
        if (c.parType[c.ouvrier] < Math.round(vivantes * K.PART_OUVRIERS) && c.nOisives * 10 < c.parType[c.ouvrier] && abordable(c.ouvrier, 0)) t = c.ouvrier;
        else if (s.sorte === S.POSTE) { if (abordable(c.base, reserveX)) t = c.base; }
        else {
          // Le plus grand retard sur la composition, parmi les types abordables.
          let meilleur = -Infinity;
          for (const [tt, part] of compo) {
            if (!abordable(tt, reserveX)) continue;
            const retard = part / 1000 - (totalCombat > 0 ? c.parType[tt] / totalCombat : 0);
            if (retard > meilleur) { meilleur = retard; t = tt; }
          }
        }
        if (t < 0) continue;
        ordonner(c, CMD.PRODUIRE, { producteur: s.id, type: t, n: 1 });
        moyens -= coutM(t); materiaux -= coutX(t); libre -= lot(t) * T.pop[t];
        c.parType[t] += lot(t);
      }
    }
    /** Riche, le camp bâtit un avant-poste près d'un lieu tenu ou d'un gisement éloigné du QG. */
    function batirPoste(c) {
      const f = c.f, it = monde.it, A = K.AVANT_POSTE;
      if (it - c.dernierPoste < POSTE_IT) return;
      const moyens = monde.res[f * 2] / 1000, materiaux = monde.res[f * 2 + 1] / 1000;
      if (moyens < A.moyens + 250 * echelle || materiaux < A.materiaux + 60 * echelle) return;
      let postes = 0;
      for (const s of monde.structures) if (s.vivante && s.faction === f && s.sorte === S.POSTE) postes++;
      if (postes >= Math.min(8, 3 + echelle)) return;
      c.dernierPoste = it;
      const qg = monde.structures[f], candidats = [];
      for (let l = 0; l < NL; l++) if (monde.lieuProp[l] === f) candidats.push([monde.lieux[l].x, monde.lieux[l].z]);
      for (let g = 0; g < NG; g++) if (monde.stock[g] > 0) candidats.push([monde.gis[g].x, monde.gis[g].z]);
      const loin = candidats.filter(([x, z]) => dist2(x, z, qg.x, qg.z) > 70000 * 70000)
        .sort((a, b) => (dist2(a[0], a[1], qg.x, qg.z)) - (dist2(b[0], b[1], qg.x, qg.z)) || a[0] - b[0] || a[1] - b[1]);
      for (const [x0, z0] of loin) {
        if (forceAutour(caseDe(x0, z0), 1, h => h !== f && monde.hostileA(h, f)) > 0) continue;
        for (let r = 0; r <= 3; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const centre = monde.postePossible(x0 + di * 8000, z0 + dj * 8000);
          if (!centre) continue;
          const ids = plusProches(f, centre[0], centre[1], 8, i => utyp[i] === c.ouvrier && (uord[i] === O.AUCUN || uord[i] === O.RECOLTER), 0);
          if (!ids.length) return;
          ordonner(c, CMD.CONSTRUIRE, { ids, x: centre[0] / 1000, z: centre[1] / 1000 });
          return;
        }
      }
    }
    /** Les k unités du camp les plus proches de (x, z) qui passent le filtre (dans un rayon r mm si r > 0). */
    function plusProches(f, x, z, k, filtre, r) {
      const n = monde.n, choix = [];
      for (let i = 0; i < n; i++) {
        if (ufac[i] !== f || uetat[i] === HORS_JEU || !filtre(i)) continue;
        const dx = ux[i] - x, dz = uz[i] - z, d = dx * dx + dz * dz;
        if (r > 0 && d > r * r) continue;
        choix.push([d, i]);
      }
      choix.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return Int32Array.from(choix.slice(0, k), e => e[1]);
    }

    // ---- Armées. ----
    function armees(c) {
      const it = monde.it;
      if (it - c.regroupe >= REGROUPER_IT) { regrouper(c); c.regroupe = it; }
      for (const g of c.groupes) mesurer(c, g);
      objectifs(c);
      if (c.f === CONV) { barricader(c); casser(c); } else lever(c);
    }
    /** Ids valides d'un groupe (du camp, en jeu, pas Équipe, ordre de combat), centre et force. */
    function mesurer(c, g) {
      let k = 0, sx = 0, sz = 0, fo = 0;
      tampon = agrandir(tampon, g.ids.length);
      for (let q = 0; q < g.ids.length; q++) {
        const i = g.ids[q];
        if (ufac[i] !== c.f || uetat[i] === HORS_JEU || utyp[i] === c.ouvrier || !combat(uord[i])) continue;
        g.ids[k++] = i; sx += ux[i]; sz += uz[i]; fo += ucoh[i];
      }
      g.ids = g.ids.subarray(0, k);
      g.n = k; g.force = fo;
      if (k) { g.x = sx / k; g.z = sz / k; }
    }
    /** k-moyennes pondérées sur les cases de 32 m des unités de combat disponibles. */
    function regrouper(c) {
      const f = c.f, n = monde.n, compte = c.compte;
      compte.fill(0);
      let total = 0;
      for (let i = 0; i < n; i++) {
        if (ufac[i] !== f || uetat[i] === HORS_JEU || utyp[i] === c.ouvrier || !combat(uord[i])) continue;
        c.unites = agrandir(c.unites, total + 1);
        c.unites[total++] = i;
        compte[c32DeC8[uc8[i]]]++;
      }
      const anciens = c.groupes;
      c.groupes = [];
      if (!total) return;
      const cases = [];
      for (let q = 0; q < G; q++) if (compte[q]) cases.push(q);
      const k = Math.max(1, Math.min(cases.length, Math.max(3, Math.min(8, Math.round(Math.sqrt(total / 60))))));
      // Germes : la case la plus peuplée, puis celle qui maximise compte × distance² au germe le plus proche.
      const cx = new Float64Array(k), cz = new Float64Array(k);
      let premier = cases[0];
      for (const q of cases) if (compte[q] > compte[premier]) premier = q;
      cx[0] = cx32(premier); cz[0] = cz32(premier);
      for (let g = 1; g < k; g++) {
        let meilleur = -1, score = -1;
        for (const q of cases) {
          let d = Infinity;
          for (let h = 0; h < g; h++) d = Math.min(d, dist2(cx32(q), cz32(q), cx[h], cz[h]));
          const s = compte[q] * d;
          if (s > score) { score = s; meilleur = q; }
        }
        cx[g] = cx32(meilleur); cz[g] = cz32(meilleur);
      }
      const groupeDe = new Int32Array(G).fill(-1);
      for (let pas = 0; pas < 6; pas++) {
        const sx = new Float64Array(k), sz = new Float64Array(k), sw = new Float64Array(k);
        for (const q of cases) {
          let meilleur = 0, d = Infinity;
          for (let h = 0; h < k; h++) { const e = dist2(cx32(q), cz32(q), cx[h], cz[h]); if (e < d) { d = e; meilleur = h; } }
          groupeDe[q] = meilleur;
          sx[meilleur] += cx32(q) * compte[q]; sz[meilleur] += cz32(q) * compte[q]; sw[meilleur] += compte[q];
        }
        for (let h = 0; h < k; h++) if (sw[h] > 0) { cx[h] = sx[h] / sw[h]; cz[h] = sz[h] / sw[h]; }
      }
      const tailles = new Int32Array(k);
      for (let q = 0; q < total; q++) tailles[groupeDe[c32DeC8[uc8[c.unites[q]]]]]++;
      const groupes = [];
      for (let h = 0; h < k; h++) groupes.push({ ids: new Int32Array(tailles[h]), n: 0, x: cx[h], z: cz[h], force: 0, but: null, depuis: -1e9, repli: -1e9 });
      for (let q = 0; q < total; q++) { const i = c.unites[q], g = groupes[groupeDe[c32DeC8[uc8[i]]]]; g.ids[g.n++] = i; }
      // Les objectifs se transmettent au nouveau groupe le plus proche de l'ancien (à moins de 64 m).
      for (const g of groupes) {
        let proche = null, d = 64000 * 64000;
        for (const a of anciens) { const e = dist2(a.x, a.z, g.x, g.z); if (a.but && e < d) { d = e; proche = a; } }
        if (proche) { g.but = proche.but; g.depuis = proche.depuis; g.repli = proche.repli; }
      }
      c.groupes = groupes.filter(g => g.n > 0);
    }

    /** Les objectifs du camp, du plus pressant au moins pressant, distribués aux groupes. */
    function objectifs(c) {
      const f = c.f, it = monde.it, structures = monde.structures, colere = monde.colere > 0;
      const menace = g => g !== f && !allies(f, g) && monde.hostileA(g, f);       // ceux qui nous frappent
      const visable = g => g !== f && !allies(f, g) && monde.hostileA(f, g);     // ceux que l'on frappe
      // Le Bastion sans colère se tient loin de la Préfecture.
      const evite = (q) => f === BAST && !colere && forceAutour(q, 1, g => g === PREF) > 2000000;
      const cand = [];
      const qg = structures[f], cq = caseDe(qg.x, qg.z), hq = forceAutour(cq, 1, menace);
      if (qg.occupation > 0 || hq > 0) cand.push({ prio: 100, x: qg.sortieX, z: qg.sortieZ, besoin: hq, cle: 'qg' });
      for (let l = 0; l < NL; l++) {
        const L = monde.lieux[l], q = caseDe(L.x, L.z), p = monde.lieuProp[l];
        const nous = p === f || (p >= 0 && allies(f, p));
        const h = forceAutour(q, 1, menace);
        if (nous) { if (h > 0 || monde.lieuConteste[l]) cand.push({ prio: 70 + (monde.lieuConteste[l] ? 10 : 0), x: L.x, z: L.z, besoin: h, cle: 'l' + l }); continue; }
        if (evite(q) || (f === BAST && !colere && p === PREF)) continue;
        cand.push({ prio: p < 0 ? 50 : 45, x: L.x, z: L.z, besoin: forceAutour(q, 1, g => menace(g) || visable(g)), cle: 'l' + l });
      }
      // Groupes hostiles plus faibles : les cases de force visable, près d'un de nos groupes.
      for (const g of c.groupes) {
        const q0 = caseDe(g.x, g.z), qi = q0 % gx, qj = (q0 / gx) | 0;
        let meilleure = -1, fm = 0;
        for (let j = Math.max(0, qj - 4); j <= Math.min(gz - 1, qj + 4); j++) for (let i = Math.max(0, qi - 4); i <= Math.min(gx - 1, qi + 4); i++) {
          const q = i + j * gx;
          let s = 0;
          for (let h = 0; h < 3; h++) if (visable(h)) s += force[h * G + q];
          if (s > fm && !evite(q)) { fm = s; meilleure = q; }
        }
        if (meilleure >= 0 && forceAutour(meilleure, 1, menace) < 0.7 * g.force) cand.push({ prio: 35, x: cx32(meilleure), z: cz32(meilleure), besoin: fm, cle: 'c' + meilleure });
      }
      // Récolteurs ennemis à harceler.
      let harcele = -1, nh = 3;
      for (let q = 0; q < G; q++) {
        let e = 0;
        for (let h = 0; h < 3; h++) if (visable(h)) e += equipes[h * G + q];
        if (e > nh && !evite(q)) { nh = e; harcele = q; }
      }
      if (harcele >= 0) cand.push({ prio: 25, x: cx32(harcele), z: cz32(harcele), besoin: forceAutour(harcele, 1, menace), cle: 'h' + harcele });
      cand.sort((a, b) => b.prio - a.prio || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));

      // Repli des groupes écrasés (Difficile).
      const libres = c.groupes.filter(g => g.n > 0 && it - g.repli > RELANCE_IT);
      if (fin) {
        for (const g of libres) {
          const h = forceAutour(caseDe(g.x, g.z), 0, menace);
          if (h > 2 * g.force && g.force > 0) { g.repli = it; g.but = null; ordonner(c, CMD.REPLIER, { ids: g.ids }); }
        }
      }
      const disponibles = libres.filter(g => it - g.repli > RELANCE_IT);
      const vus = new Set();
      for (const o of cand) {
        if (!disponibles.length) break;
        if (vus.has(o.cle)) continue;
        vus.add(o.cle);
        // Le groupe le plus proche assez fort ; à défaut, pour une urgence, le plus proche.
        let choisi = -1, d = Infinity;
        for (let k = 0; k < disponibles.length; k++) {
          const g = disponibles[k];
          if (g.force < 1.2 * o.besoin && o.prio < 70) continue;
          const e = dist2(g.x, g.z, o.x, o.z);
          if (o.prio < 40 && e > 200000 * 200000) continue;
          if (e < d) { d = e; choisi = k; }
        }
        if (choisi < 0) continue;
        const g = disponibles.splice(choisi, 1)[0];
        envoyer(c, g, o);
      }
      // Les groupes sans objectif tiennent le lieu le plus proche de leur camp, sinon restent où ils sont.
      for (const g of disponibles) {
        let meilleur = -1, d = Infinity;
        for (let l = 0; l < NL; l++) {
          if (monde.lieuProp[l] !== f) continue;
          const e = dist2(monde.lieux[l].x, monde.lieux[l].z, g.x, g.z);
          if (e < d) { d = e; meilleur = l; }
        }
        if (meilleur >= 0 && d > 60000 * 60000) envoyer(c, g, { prio: 10, x: monde.lieux[meilleur].x, z: monde.lieux[meilleur].z, besoin: 0, cle: 'l' + meilleur });
      }
    }
    /** Attaque-mouvement d'un groupe vers un objectif ; on ne répète l'ordre que s'il change ou que le groupe traîne. */
    function envoyer(c, g, o) {
      const it = monde.it;
      if (g.but && g.but.cle === o.cle && it - g.depuis < RELANCE_IT) return;
      if (g.but && g.but.cle === o.cle) {
        // Même objectif : relancé seulement si le groupe est loin et à l'arrêt.
        const d2 = dist2(g.x, g.z, o.x, o.z);
        let oisifs = 0;
        for (let q = 0; q < g.n; q++) if (uord[g.ids[q]] === O.AUCUN) oisifs++;
        if (d2 < 40000 * 40000 || oisifs * 2 < g.n) { g.depuis = it; return; }
      }
      g.but = o; g.depuis = it;
      ordonner(c, CMD.DEPLACER, { ids: g.ids, x: o.x / 1000, z: o.z / 1000, mode: 1 });
    }

    // ---- Règles de la Convergence : barricader devant ses lieux, casser quand les Matériaux manquent. ----
    function barricader(c) {
      const f = c.f, it = monde.it, B = K.BARRICADE;
      if (monde.res[f * 2 + 1] < 80000) return;
      const menace = g => g !== f && !allies(f, g) && monde.hostileA(g, f);
      for (let l = 0; l < NL; l++) {
        if (monde.lieuProp[l] !== f || it - c.barricadeLieu[l] < BARRICADE_IT) continue;
        const L = monde.lieux[l], q0 = caseDe(L.x, L.z), qi = q0 % gx, qj = (q0 / gx) | 0;
        // Le centre de la force qui approche, à deux cases (64 m) autour du lieu.
        let sx = 0, sz = 0, sw = 0;
        for (let j = Math.max(0, qj - 2); j <= Math.min(gz - 1, qj + 2); j++) for (let i = Math.max(0, qi - 2); i <= Math.min(gx - 1, qi + 2); i++) {
          const q = i + j * gx;
          let s = 0;
          for (let h = 0; h < 3; h++) if (menace(h)) s += force[h * G + q];
          sx += cx32(q) * s; sz += cz32(q) * s; sw += s;
        }
        if (sw <= 0) continue;
        let deja = 0;
        for (const s of monde.structures) if (s.vivante && s.sorte === S.BARRICADE && s.faction === f && dist2(s.x, s.z, L.x, L.z) < 50000 * 50000) deja++;
        if (deja >= 3) continue;
        c.barricadeLieu[l] = it;
        const seg = enTravers(L.x, L.z, sx / sw, sz / sw, L.rayon, B);
        if (!seg) continue;
        const mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2;
        const ids = plusProches(f, mx, mz, 6 * echelle + 4, i => T.barricader[utyp[i]] === 1 && (uord[i] === O.AUCUN || uord[i] === O.ATTAQUE_MVT), 60000);
        if (!ids.length) continue;
        ordonner(c, CMD.BARRICADER, { ids, x: seg[0] / 1000, z: seg[1] / 1000, x2: seg[2] / 1000, z2: seg[3] / 1000 });
        return;
      }
    }
    const fineLibre = (x, z) => nav.fineLibre(nav.fineDe(x, z));
    /**
     * Un passage à barrer entre le lieu (xl, zl) et la menace (xh, zh) : le point d'une rue bordée de murs des deux
     * côtés (largeur de 4,6 à 20 m, mesurée selon x ou z) le plus proche du lieu, à 15–60 m de son bord, du côté de la
     * menace (à moins de 60° de sa direction). Rend [x, z, x2, z2] mm, d'un mur à l'autre, ou null.
     */
    function enTravers(xl, zl, xh, zh, rayon, B) {
      const dx = xh - xl, dz = zh - zl, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 8000) return null;
      const vx = dx / d, vz = dz / d, rmin = rayon + 4000, rmax = rayon + 60000;
      let meilleur = null, dm = Infinity;
      for (let j = -rmax; j <= rmax; j += 4000) for (let i = -rmax; i <= rmax; i += 4000) {
        const r2 = i * i + j * j;
        if (r2 < rmin * rmin || r2 > rmax * rmax || r2 >= dm) continue;
        const r = Math.sqrt(r2);
        if (i * vx + j * vz < 0.5 * r) continue;
        const px = xl + i, pz = zl + j;
        if (!fineLibre(px, pz)) continue;
        for (let axe = 0; axe < 2; axe++) {
          const ax = axe === 0 ? 1 : 0, az = 1 - ax;
          let a = 0, b = 0;
          while (a < 12000 && fineLibre(px + ax * (a + 500), pz + az * (a + 500))) a += 500;
          while (b < 12000 && fineLibre(px - ax * (b + 500), pz - az * (b + 500))) b += 500;
          const w = a + b;
          if (a >= 12000 || b >= 12000 || w < B.longueurMin * 1000 + 600 || w > B.longueurMax * 1000) continue;
          meilleur = [px + ax * (a - 200), pz + az * (a - 200), px - ax * (b - 200), pz - az * (b - 200)];
          dm = r2;
          break;
        }
      }
      return meilleur;
    }
    function casser(c) {
      const f = c.f, it = monde.it;
      if (it - c.derniereCasse < CASSE_IT) return;
      // Les avant-postes ennemis proches d'un groupe d'abord, puis le mobilier quand les Matériaux manquent.
      for (const s of monde.structures) {
        if (!s.vivante || s.sorte !== S.POSTE || !R.peutCasserStructure(f, { sorte: 'avant-poste', faction: s.faction }, monde.alliance)) continue;
        if ((c.leveurs.get(s.id) || 0) > 0) continue;
        for (const g of c.groupes) {
          if (!g.n || dist2(g.x, g.z, s.x, s.z) > 70000 * 70000) continue;
          const ids = plusProches(f, s.x, s.z, 12 * echelle, i => T.casser[utyp[i]] > 0 && combat(uord[i]), 80000);
          if (ids.length) { ordonner(c, CMD.CASSER, { ids, sorte: 'structure', cible: s.id }); c.derniereCasse = it; return; }
        }
      }
      if (monde.res[f * 2 + 1] >= 150000 * echelle || c.nCasseurs >= 12 * echelle) return;
      // Le groupe le moins occupé casse l'objet intact le plus proche de lui (la casse s'enchaîne ensuite).
      let g = null;
      for (const h of c.groupes) if (h.n && (!g || (h.but ? h.but.prio : 0) < (g.but ? g.but.prio : 0))) g = h;
      if (!g) return;
      let meilleur = -1, d = 150000 * 150000;
      for (let k = 0; k < NK; k++) {
        if (monde.casEtat[k]) continue;
        const e = dist2(monde.casX[k], monde.casZ[k], g.x, g.z);
        if (e < d) { d = e; meilleur = k; }
      }
      if (meilleur < 0) return;
      const ids = plusProches(f, monde.casX[meilleur], monde.casZ[meilleur], 8 * echelle, i => T.casser[utyp[i]] > 0 && combat(uord[i]), 120000);
      if (!ids.length) return;
      ordonner(c, CMD.CASSER, { ids, sorte: 'cassable', cible: meilleur });
      c.derniereCasse = it;
    }

    // ---- Bastion et Préfecture : lever ce qui gêne. ----
    function lever(c) {
      const f = c.f, alliance = monde.alliance;
      let envoyes = 0;
      for (const s of monde.structures) {
        if (!s.vivante || s.sorte === S.QG || envoyes >= 2) continue;
        const sorte = s.sorte === S.BARRICADE ? 'barricade' : 'avant-poste';
        if (!R.peutLever(f, { sorte, faction: s.faction }, alliance)) continue;
        const mx = (s.x + s.x2) / 2, mz = (s.z + s.z2) / 2;
        const deja = c.leveurs.get(s.id) || 0, voulu = (sorte === 'barricade' ? 6 : 12) * echelle;
        if (deja >= voulu) continue;
        let proche = false;
        for (const g of c.groupes) if (g.n && dist2(g.x, g.z, mx, mz) < 110000 * 110000) { proche = true; break; }
        if (!proche) continue;
        // Les outils d'abord (Béliers, Canon à eau), puis toute unité qui lève.
        const outil = f === BAST ? 7 : 12;
        let ids = plusProches(f, mx, mz, voulu - deja, i => utyp[i] === outil && combat(uord[i]), 90000);
        if (ids.length < voulu - deja) {
          const plus = plusProches(f, mx, mz, voulu - deja - ids.length,
            i => utyp[i] !== outil && T.lever[utyp[i]] > 0 && (sorte === 'barricade' || T.leverTout[utyp[i]] === 1) && combat(uord[i]), 90000);
          const tout = new Int32Array(ids.length + plus.length);
          tout.set(ids); tout.set(plus, ids.length);
          ids = tout;
        }
        if (!ids.length) continue;
        ordonner(c, CMD.LEVER, { ids, cible: s.id });
        envoyes++;
      }
    }

    return { penser, camps, voir: () => { vueIt = -1; voir(); return { force, equipes, forceCamp, G, gx, gz }; }, enTravers: (a, b, c2, d, r) => enTravers(a, b, c2, d, r, K.BARRICADE) };
  }

  PDR.ia = Object.freeze({ creer });
})(globalThis.PDR = globalThis.PDR || {});
