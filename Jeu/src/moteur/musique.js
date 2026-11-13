/* Point de rupture — musique ProTracker « M.K. » à quatre canaux ; instruments, batterie et morceaux calculés.
   Porté de FERRO (src/music.js, branche campagne-18-mondes, commit 4ce2271, voir PROVENANCE-SON.md). On garde de
   FERRO l'écriture et la lecture du MOD : en-tête de 31 échantillons, motifs de 64 rangées, périodes de l'Amiga,
   effets C (volume) et F (vitesse, tempo), PCM signé sur 8 bits ; le lecteur programme les rangées d'avance sur
   l'horloge audio, borne ses voix et se recale sur une mesure après un retard ; la préparation se fait par tranches
   pour l'écran de chargement ; la corde saturée vient aussi de FERRO (strings). Le reste est propre au jeu : cloche,
   bourdon, pupitres de cordes, cuivres graves, chœurs graves, synthés froids, sirènes, tambours lourds, salle
   calculée et quatre morceaux originaux. Aucun enregistrement, aucun module ni banque d'instruments importés.
   Format : aes.id.au/modformat.html.

   Depuis la version 0.3 la musique est sombre (David, 12/11/2026 : « une musique moins rigolote ») : modes mineurs et
   phrygiens, pédales graves, tambours lourds, cuivres et cordes graves, synthés froids, frottements, sirènes,
   silences et montées. Plus de fanfare ni de batucada dans les morceaux ; le sifflet et les coups de la batucada
   restent calculés ici pour le séquenceur de rue (moteur/audio.js), qui se cale sur chaque rangée.

   Chaque morceau a une section calme (la menace, l'attente) et une section tendue (l'émeute) de six motifs chacune, à
   la suite dans la liste d'ordre. Le lecteur passe de l'une à l'autre à la fin d'un motif selon l'intensité (au-dessus
   de 0,55, sous 0,3) : le motif k d'une section mène au motif k + 1 de l'autre ; un lecteur de MOD ordinaire joue
   les deux à la suite. Mesures à quatre temps, une double-croche par rangée. Ni window ni document : le fichier se
   charge aussi dans Node.

   PDR.musique = {
     CLES : ['titre', 'convergence', 'bastion', 'prefecture'],
     creer(ctx, sortie) → lecteur { choisir(cle), intensite(0..1), volume(0..1), jouer(bool), preparer(cle) → bool,
                                    rythme(f(temps, rangee, duree)), tick(), liberer(), stats },
     module(cle) → Uint8Array : le MOD complet, copie neuve à chaque appel (export),
     morceau(cle) → { cle, titre, style, bpm, tonique (note MIDI), mode, duree (s), canaux, octets },
     prechauffer(cles?, surProgres?) → Promise : calcule les échantillons par tranches, sans ouvrir de périphérique,
     son(nom), frappe(sorte) → { donnees: Float32Array, taux } : un instrument ou un coup de batterie, pour les ambiances,
   } */
(function (PDR) {
  'use strict';

  const { sin, cos, tan, exp, log, tanh, floor, abs, min, max, round, ceil, sqrt, pow, imul, PI } = Math;
  const HORLOGE = 7093789.2, TAUX = HORLOGE / 856, TAUX_BATTERIE = 2 * TAUX, TAU = 2 * PI, VOIX_MAX = 28;
  // Périodes de l'Amiga du do-1 (856) au si-3 (113), rangs MOD 36 à 71. Au rang 48 (période 428), un échantillon sonne
  // à sa hauteur de calcul ; les mesures de batterie, calculées au double du taux, se jouent au rang 60 (période 214).
  const PERIODES = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285,
    269, 254, 240, 226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113];
  const borner = (x, a, b) => (x < a ? a : x > b ? b : x);
  const hz = midi => 440 * pow(2, (midi - 69) / 12);
  const lisse = x => x * x * (3 - 2 * x);
  const rampe = (n, a, b) => Array.from({ length: n }, (_, k) => a + (b - a) * k / max(1, n - 1));
  /** Aléa à graine de FERRO : valeurs dans [-1, 1). */
  function alea(graine) {
    let s = graine | 0;
    return () => { s = (imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 2147483648 - 1; };
  }
  function graineDe(nom) {
    let h = 2166136261;
    for (let i = 0; i < nom.length; i++) h = imul(h ^ nom.charCodeAt(i), 16777619);
    return h | 0;
  }

  // ---- Outils de synthèse. L'état qui change à chaque échantillon vit dans des tableaux typés ; ce qui bouge
  // lentement (enveloppes, vibratos, coupures) se recalcule tous les CADENCE échantillons, soit 0,5 ms. ----
  const CADENCE = 4;
  /** Correction BLEP polynomiale d'une dent de scie (phase 0..1, pas dt) : évite le repliement à 8 kHz. */
  function blep(t, dt) {
    if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
    if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
    return 0;
  }
  /** Passe-bande biquadratique à gain de crête unité (formants, souffles) : [b0, b2, a1, a2, x1, x2, y1, y2]. */
  function passeBande(f, q, taux) {
    const w = TAU * min(f, taux * 0.45) / taux, alpha = sin(w) / (2 * q), a0 = 1 + alpha, r = new Float64Array(8);
    r[0] = alpha / a0; r[1] = -alpha / a0; r[2] = -2 * cos(w) / a0; r[3] = (1 - alpha) / a0;
    return r;
  }
  function filtrer(r, x) {
    const y = r[0] * x + r[1] * r[5] - r[2] * r[6] - r[3] * r[7];
    r[5] = r[4]; r[4] = x; r[7] = r[6]; r[6] = y;
    return y;
  }
  /** Coefficient d'un passe-bas à un pôle de coupure f. */
  const pole = (f, taux) => 1 - exp(-TAU * f / taux);
  /** Retire la composante continue (pôle à 0,995) et donne la crête, avant la mise sur 8 bits. */
  function sansContinu(donnees) {
    let x1 = 0, y1 = 0, crete = 0;
    for (let i = 0; i < donnees.length; i++) {
      const x = donnees[i], y = x - x1 + 0.995 * y1;
      x1 = x; y1 = y; donnees[i] = y;
      const a = abs(y); if (a > crete) crete = a;
    }
    return crete;
  }
  /** PCM signé sur 8 bits, longueur paire. Les deux premiers octets restent nuls : les anciennes routines de l'Amiga
   *  s'en servent (FERRO). gain : imposé pour normaliser un groupe d'échantillons ensemble. */
  function versPcm(donnees, gain) {
    const sortie = new Int8Array((donnees.length + 1) & ~1);
    for (let i = 2; i < donnees.length; i++) sortie[i] = borner(round(donnees[i] * gain), -127, 127);
    return sortie;
  }
  /** Salle calculée : quatre peignes en parallèle, dont l'aigu s'éteint d'abord, puis deux passe-tout (Schroeder) ; le
   *  grave n'y entre pas. melange : part de la salle ; duree : temps de réverbération (s). pas : 2 pour ne calculer la
   *  salle qu'un échantillon sur deux (elle n'a rien au-dessus de 3 kHz). periode : le son est une mesure qui se répète
   *  toutes les `periode` valeurs, et la queue de sa fin revient à son début. Sur place. */
  function salle(donnees, taux, melange, duree, pas, periode) {
    const tauxSalle = taux / pas, e = tauxSalle / TAUX_BATTERIE, n = donnees.length;
    const n0 = round(691 * e), n1 = round(797 * e), n2 = round(911 * e), n3 = round(1039 * e), n4 = round(149 * e), n5 = round(53 * e);
    const l0 = new Float64Array(n0), l1 = new Float64Array(n1), l2 = new Float64Array(n2), l3 = new Float64Array(n3), l4 = new Float64Array(n4), l5 = new Float64Array(n5);
    const g0 = pow(10, -3 * n0 / tauxSalle / duree), g1 = pow(10, -3 * n1 / tauxSalle / duree), g2 = pow(10, -3 * n2 / tauxSalle / duree), g3 = pow(10, -3 * n3 / tauxSalle / duree);
    const amorti = pole(2600, tauxSalle), coupeGrave = pole(140, tauxSalle);
    let i0 = 0, i1 = 0, i2 = 0, i3 = 0, i4 = 0, i5 = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, grave = 0, avant = 0;
    // Première passe (mesure en boucle) : la fin de la mesure, pour retrouver la queue qu'elle laisse à son début.
    for (let passe = periode ? 0 : 1; passe < 2; passe++) {
      const debut = passe ? 0 : max(0, floor((periode - 0.8 * duree * taux) / pas) * pas), fin = (passe ? n : min(n, periode)) - pas + 1;
      for (let i = debut; i < fin; i += pas) {
        const x = pas === 2 ? 0.5 * (donnees[i] + donnees[i + 1]) : donnees[i];
        grave += coupeGrave * (x - grave);
        const envoi = x - grave, r0 = l0[i0], r1 = l1[i1], r2 = l2[i2], r3 = l3[i3];
        b0 += amorti * (r0 - b0); b1 += amorti * (r1 - b1); b2 += amorti * (r2 - b2); b3 += amorti * (r3 - b3);
        l0[i0] = envoi + b0 * g0; l1[i1] = envoi + b1 * g1; l2[i2] = envoi + b2 * g2; l3[i3] = envoi + b3 * g3;
        if (++i0 === n0) i0 = 0;
        if (++i1 === n1) i1 = 0;
        if (++i2 === n2) i2 = 0;
        if (++i3 === n3) i3 = 0;
        let y = (r0 + r1 + r2 + r3) * 0.25;
        const r4 = l4[i4], v4 = y + 0.6 * r4;
        l4[i4] = v4; if (++i4 === n4) i4 = 0;
        y = r4 - 0.6 * v4;
        const r5 = l5[i5], v5 = y + 0.6 * r5;
        l5[i5] = v5; if (++i5 === n5) i5 = 0;
        y = (r5 - 0.6 * v5) * melange;
        if (passe) {
          if (pas === 2) { donnees[i] += 0.5 * (avant + y); donnees[i + 1] += y; } else donnees[i] += y;
        }
        avant = y;
      }
    }
    return donnees;
  }
  /** Un son bref dans la salle : la queue (s) s'ajoute à la fin de l'échantillon et s'éteint. */
  function resonner(donnees, melange, duree, queue) {
    const total = donnees.length + ceil(queue * TAUX), sortie = new Float32Array(total), fondu = TAUX * queue * 0.7;
    sortie.set(donnees);
    salle(sortie, TAUX, melange, duree, 1, 0);
    for (let i = floor(total - fondu); i < total; i++) sortie[i] *= (total - i) / fondu;
    return sortie;
  }
  /** a + gain × b, sur la longueur de a. */
  function melange(a, b, gain) {
    for (let i = 0; i < a.length && i < b.length; i++) a[i] += b[i] * gain;
    return a;
  }

  // ---- Instruments mélodiques, calculés au taux de l'Amiga (8 287 Hz). ----
  /** Cuivre : harmoniques par récurrence de Tchebychev, dont l'éclat monte avec le souffle ; la note part un peu bas et
   *  se pose (la lèvre), vibrato retardé, souffle d'attaque, résonance du pavillon. accord : plusieurs notes (pupitre). */
  function cuivre(o) {
    const n = ceil(o.duree * TAUX), sortie = new Float32Array(n), hasard = alea(o.graine), accord = o.accord || [0], nv = accord.length;
    const F = new Float64Array(nv), PH = new Float64Array(nv), VIB = new Float64Array(nv), DPH = new Float64Array(nv), Q = new Float64Array(nv), G = new Float64Array(nv);
    const HH = new Int32Array(nv);
    for (let k = 0; k < nv; k++) { F[k] = o.f0 * pow(2, accord[k] / 12) * (1 + (k % 2 ? 0.0021 : -0.0013) * (k > 0)); PH[k] = (hasard() + 1) * PI; VIB[k] = 5.1 + 0.6 * hasard(); }
    const pavillon = passeBande(o.cloche || 1300, 1.1, TAUX), vibrato = o.vibrato === undefined ? 0.0035 : o.vibrato, souffle = o.souffle === undefined ? 0.06 : o.souffle;
    const norme = 1 / sqrt(nv), fondu = TAUX * 0.04;
    let bas = 0, haleine = 0;
    for (let i = 0; i < n; i++) {
      if (i % CADENCE === 0) {
        const t = i / TAUX;
        haleine = souffle * exp(-t * 22);
        for (let k = 0; k < nv; k++) {
          const u = t - k * 0.007;
          if (u <= 0) { G[k] = 0; continue; }
          const att = min(1, u / o.attaque), env = att * (1 + 0.22 * exp(-u * 9) * att) * exp(-u * o.amorti);
          const q = exp(-(1.3 - 0.95 * o.eclat * (0.3 + 0.7 * min(1, env))));
          const f = F[k] * (1 + vibrato * min(1, max(0, u - 0.25) * 2.5) * sin(TAU * VIB[k] * u)) * (1 - 0.03 * exp(-u * 28));
          // Au-delà du rang où q^h passe sous −48 dB, les harmoniques ne comptent plus.
          const H = max(1, min(16, floor(TAUX * 0.46 / f), ceil(-5.5 / log(q))));
          Q[k] = q; HH[k] = H; DPH[k] = TAU * f / TAUX; G[k] = env * (1 - q) / (1 - pow(q, H) + 1e-9);
        }
      }
      let somme = 0;
      for (let k = 0; k < nv; k++) {
        if (G[k] === 0) continue;
        let ph = PH[k] + DPH[k];
        if (ph > TAU) ph -= TAU;
        PH[k] = ph;
        const c2 = 2 * cos(ph), q = Q[k], H = HH[k];
        let sp = 0, sc = sin(ph), poids = 1, x = 0;
        for (let h = 0; h < H; h++) { x += sc * poids; const ss = c2 * sc - sp; sp = sc; sc = ss; poids *= q; }
        somme += x * G[k];
      }
      bas += 0.3 * (hasard() - bas);
      const brut = somme * norme + bas * haleine;
      sortie[i] = tanh(1.5 * (brut + 0.6 * filtrer(pavillon, brut))) * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  // Formants des voyelles : [fréquence (Hz), largeur (Hz), gain] × 3.
  const VOYELLES = {
    o: [[450, 70, 1], [800, 80, 0.55], [2830, 120, 0.1]],
    ou: [[325, 60, 1], [700, 70, 0.32], [2530, 120, 0.06]],
  };
  /** Chœur sans paroles : voix en dents de scie désaccordées, chacune avec son vibrato et son retard, une part à
   *  l'octave, un souffle, puis trois formants de la voyelle. */
  function choeur(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), hasard = alea(o.graine), nv = o.voix;
    const F = new Float64Array(nv), PH = new Float64Array(nv), RET = new Float64Array(nv), VIB = new Float64Array(nv), PHV = new Float64Array(nv), POIDS = new Float64Array(nv);
    const DT = new Float64Array(nv), ENV = new Float64Array(nv);
    for (let k = 0; k < nv; k++) {
      F[k] = o.f0 * (k < (o.octave || 0) * nv ? 2 : 1) * pow(2, hasard() * (o.desaccord || 14) / 1200);
      PH[k] = (hasard() + 1) / 2; RET[k] = (hasard() + 1) / 2 * (o.etalement === undefined ? 0.035 : o.etalement);
      VIB[k] = 4.6 + 0.9 * hasard(); PHV[k] = hasard() * PI; POIDS[k] = 0.75 + 0.25 * hasard();
    }
    const formants = VOYELLES[o.voyelle].map(([f, largeur]) => passeBande(f, f / largeur, taux)), gains = VOYELLES[o.voyelle].map(f => f[2]);
    const amorti = o.amorti || 0.4, norme = 1 / sqrt(nv), fondu = taux * (o.relache || 0.05);
    let souffle = 0, haleine = 0;
    for (let i = 0; i < n; i++) {
      if (i % CADENCE === 0) {
        const t = i / taux;
        haleine = (o.souffle || 0.08) * min(1, t / o.attaque) * exp(-t * amorti);
        for (let k = 0; k < nv; k++) {
          const u = t - RET[k];
          if (u <= 0) { DT[k] = 0; continue; }
          ENV[k] = min(1, u / o.attaque) * exp(-u * amorti) * POIDS[k];
          DT[k] = F[k] * (1 + 0.006 * sin(TAU * VIB[k] * u + PHV[k]) * min(1, u * 2)) / taux;
        }
      }
      let somme = 0;
      for (let k = 0; k < nv; k++) {
        const dt = DT[k];
        if (dt === 0) continue;
        let ph = PH[k] + dt;
        if (ph >= 1) ph -= 1;
        PH[k] = ph;
        somme += (2 * ph - 1 - blep(ph, dt)) * ENV[k];
      }
      souffle += 0.5 * (hasard() - souffle);
      const excitation = somme * norme + souffle * haleine;
      sortie[i] = (filtrer(formants[0], excitation) * gains[0] + filtrer(formants[1], excitation) * gains[1] + filtrer(formants[2], excitation) * gains[2]) * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  /** Sifflet à bille : une sinusoïde que la bille module ~31 fois par seconde, et le souffle autour d'elle. Il ne joue
   *  plus dans les morceaux : il reste pour les sifflets de la rue (moteur/audio.js). */
  function sifflet(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), hasard = alea(o.graine), bande = passeBande(o.f0, 7, taux);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / taux, bille = tanh(3.5 * sin(TAU * (o.trille || 31) * t));
      const env = min(1, t / 0.012) * min(1, (n - i) / (taux * 0.025));
      phase += TAU * o.f0 * (1 + 0.028 * bille) / taux;
      sortie[i] = (sin(phase) * (0.78 + 0.22 * bille) + filtrer(bande, hasard()) * 0.32) * env;
    }
    return sortie;
  }
  // Résonances du corps des cordes : [fréquence (Hz), Q, gain] ; pupitre grave (violoncelles, contrebasses) et médium.
  const CORPS_GRAVE = [[110, 1.8, 0.7], [210, 2.2, 0.9], [340, 2.4, 0.6], [620, 2.6, 0.4], [1250, 3, 0.2]];
  const CORPS_MEDIUM = [[290, 2.4, 0.7], [460, 2.6, 0.8], [780, 3, 0.45], [1400, 3, 0.3], [2500, 3.2, 0.16]];
  /** Pupitre de cordes : une dent de scie par instrumentiste, désaccordée, avec son vibrato et son retard ; le grain de
   *  l'archet à l'attaque ; les résonances du corps. tremolo (Hz) : l'archet va et vient, chacun à son rythme.
   *  accord : intervalles joués ensemble. */
  function cordes(o) {
    const n = ceil(o.duree * TAUX), sortie = new Float32Array(n), hasard = alea(o.graine), accord = o.accord || [0], nv = accord.length * o.voix;
    const F = new Float64Array(nv), PH = new Float64Array(nv), RET = new Float64Array(nv), VIB = new Float64Array(nv), PHV = new Float64Array(nv), TREM = new Float64Array(nv);
    const PHT = new Float64Array(nv), DT = new Float64Array(nv), AMP = new Float64Array(nv);
    for (let k = 0; k < nv; k++) {
      F[k] = o.f0 * pow(2, accord[floor(k / o.voix)] / 12 + hasard() * o.desaccord / 1200); PH[k] = (hasard() + 1) / 2;
      RET[k] = (hasard() + 1) / 2 * (o.etalement === undefined ? 0.018 : o.etalement); VIB[k] = 5 + hasard(); PHV[k] = hasard() * PI;
      TREM[k] = (o.tremolo || 0) * (1 + 0.07 * hasard()); PHT[k] = hasard() * PI;
    }
    const corps = o.corps.map(([f, q]) => passeBande(f, q, TAUX)), gains = o.corps.map(c => c[2]), nc = corps.length, kBas = pole(o.coupure, TAUX);
    const vibrato = o.vibrato === undefined ? 0.003 : o.vibrato, fondu = TAUX * (o.relache || 0.04), norme = 1 / sqrt(nv);
    let bas = 0, archet = 0, grain = 0, env = 1;
    for (let i = 0; i < n; i++) {
      if (i % CADENCE === 0) {
        const t = i / TAUX;
        grain = (o.archet || 0) * exp(-t * 35); env = exp(-t * o.amorti);
        for (let k = 0; k < nv; k++) {
          const u = t - RET[k];
          if (u <= 0) { DT[k] = 0; continue; }
          DT[k] = F[k] * (1 + vibrato * sin(TAU * VIB[k] * u + PHV[k]) * min(1, u * 1.5)) / TAUX;
          AMP[k] = min(1, u / o.attaque) * (TREM[k] ? 0.3 + 0.7 * abs(sin(PI * TREM[k] * u + PHT[k])) : 1);
        }
      }
      let somme = 0;
      for (let k = 0; k < nv; k++) {
        const dt = DT[k];
        if (dt === 0) continue;
        let ph = PH[k] + dt;
        if (ph >= 1) ph -= 1;
        PH[k] = ph;
        somme += (2 * ph - 1 - blep(ph, dt)) * AMP[k];
      }
      archet += 0.4 * (hasard() - archet);
      const x = somme * norme + archet * grain;
      bas += kBas * (x - bas);
      let y = bas * 0.5;
      for (let j = 0; j < nc; j++) y += filtrer(corps[j], x) * gains[j];
      sortie[i] = tanh(1.4 * y * env) * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  /** Banc d'oscillateurs par rotation : S et C portent sinus et cosinus, DS et DC le pas, A le niveau, D son amorti
   *  par échantillon. Rend la somme des sinus de `de` à `a`, et les fait tous avancer. */
  function banc(nb) { return { S: new Float64Array(nb), C: new Float64Array(nb), DS: new Float64Array(nb), DC: new Float64Array(nb), A: new Float64Array(nb), D: new Float64Array(nb) }; }
  function poser(b, k, f, phase, niveau, amorti, taux) {
    const w = TAU * f / taux;
    b.S[k] = sin(phase); b.C[k] = cos(phase); b.DS[k] = sin(w); b.DC[k] = cos(w); b.A[k] = niveau; b.D[k] = exp(-amorti / taux);
  }
  function avancer(b, de, a) {
    const S = b.S, C = b.C, DS = b.DS, DC = b.DC, A = b.A, D = b.D;
    let x = 0;
    for (let k = de; k < a; k++) {
      const s = S[k] * DC[k] + C[k] * DS[k];
      C[k] = C[k] * DC[k] - S[k] * DS[k]; S[k] = s; A[k] *= D[k];
      x += s * A[k];
    }
    return x;
  }
  // Partiels d'une cloche d'église : [rapport au fondamental, niveau, amorti relatif]. Le bourdon sonne à l'octave
  // grave, la tierce est mineure : une cloche est sombre de naissance.
  const PARTIELS_CLOCHE = [[0.5, 0.5, 0.6], [1, 1, 1], [1.189, 0.75, 1.25], [1.5, 0.4, 1.7], [2, 0.65, 2.1], [2.378, 0.2, 2.9],
    [3.01, 0.3, 3.6], [4.07, 0.2, 5], [5.43, 0.13, 7], [6.8, 0.08, 9]];
  /** Cloche : partiels inharmoniques, chacun doublé à un battement près ; l'aigu s'éteint d'abord ; le coup du battant
   *  est un bruit bref. */
  function cloche(o) {
    const n = ceil(o.duree * TAUX), sortie = new Float32Array(n), hasard = alea(o.graine), battant = passeBande(o.f0 * 6, 1.2, TAUX), b = banc(2 * PARTIELS_CLOCHE.length);
    let nb = 0;
    for (const [rapport, niveau, amorti] of PARTIELS_CLOCHE) for (const signe of [-1, 1]) {
      const f = o.f0 * rapport * (1 + signe * 0.0011 * (1.5 + 0.5 * hasard())), phase = hasard() * PI;
      if (f < TAUX * 0.45) poser(b, nb++, f, phase, niveau * 0.5, o.amorti * amorti, TAUX);
    }
    const fondu = TAUX * 0.12, coup = floor(TAUX * 0.15);
    for (let i = 0; i < n; i++) {
      let x = avancer(b, 0, nb);
      if (i < coup) x += filtrer(battant, hasard()) * 0.5 * exp(-i / TAUX * 60);
      sortie[i] = x * min(1, i / 24) * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  /** Corde saturée (FERRO, strings) : chaque corde est une somme de partiels un peu inharmoniques qui s'éteignent
   *  chacun à son rythme ; un bruit de contact à l'attaque ; un ampli asymétrique écrase le tout, puis l'enceinte.
   *  accord : intervalles joués ensemble ; doubles : deux cordes à peine désaccordées par note. */
  function saturee(o) {
    const n = ceil(o.duree * TAUX), sortie = new Float32Array(n), hasard = alea(o.graine), accord = o.accord || [0], parNote = o.doubles ? 2 : 1;
    const nc = accord.length * parNote, b = banc(nc * o.partiels), debuts = new Int32Array(nc + 1), poids = new Float64Array(nc), retards = new Float64Array(nc);
    let nb = 0;
    for (let c = 0; c < nc; c++) {
      const rang = floor(c / parNote), double = c % parNote;
      const f = o.f0 * pow(2, accord[rang] / 12) * (o.doubles ? 1 + (double ? 1 : -1) * (0.0014 + rang * 0.0004) : 1);
      for (let h = 0; h < min(o.partiels, floor(TAUX * 0.45 / f)); h++) {
        const k = h + 1;
        poser(b, nb++, f * k * sqrt(1 + 0.000035 * k * k), hasard() * 0.08, sin(k * 0.43) / pow(k, o.pente), 0.5 + h * o.etouffe, TAUX);
      }
      debuts[c + 1] = nb; poids[c] = rang === 0 ? 1 : rang === 1 ? 0.74 : 0.42; retards[c] = round((rang * 1.3 + double * 0.7) / 1000 * TAUX);
    }
    const kAigu = pole(o.coupure, TAUX), biais = tanh(0.12), attaque = 0.0018 * TAUX, contactFin = floor(0.06 * TAUX);
    let bas = 0, corps = 0, continu = 0, mediator = 0, env = 1;
    for (let i = 0; i < n; i++) {
      if (i % CADENCE === 0) env = exp(-i / TAUX * o.amorti);
      let somme = 0;
      for (let c = 0; c < nc; c++) if (i >= retards[c]) somme += avancer(b, debuts[c], debuts[c + 1]) * poids[c] * min(1, (i - retards[c]) / attaque);
      let contact = 0;
      if (i < contactFin) { const bruit = hasard(); mediator += 0.2 * (bruit - mediator); contact = (bruit - mediator) * exp(-i / TAUX * 160) * o.contact; }
      const asym = tanh(tanh((somme * 0.43 + contact) * o.gain) * 1.7 + 0.12) - biais;
      bas += kAigu * (asym - bas); corps += 0.16 * (bas - corps); continu += 0.014 * (bas - continu);
      sortie[i] = (o.grave ? bas * 0.58 + corps * 0.38 : bas * 0.91 - corps * 0.2 - continu * 0.71) * env * min(1, (n - i) / 120);
    }
    return sortie;
  }
  /** Synthé : dents de scie ou carrés corrigés (BLEP), voix désaccordées, filtre d'état variable dont la coupure suit
   *  une enveloppe (de coupure0 vers coupure1) et un balancement lent (lfo : [Hz, profondeur]). accord : intervalles
   *  joués ensemble, niveaux : le poids de chacun. */
  function synthe(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), hasard = alea(o.graine), accord = o.accord || [0], parNote = o.voix || 1, nv = accord.length * parNote;
    const DT = new Float64Array(nv), PH = new Float64Array(nv), POIDS = new Float64Array(nv);
    let energie = 0;
    for (let k = 0; k < nv; k++) {
      const rang = floor(k / parNote), j = k % parNote;
      DT[k] = o.f0 * pow(2, accord[rang] / 12 + (parNote > 1 ? (j / (parNote - 1) - 0.5) * (o.desaccord || 0) / 1200 : 0)) / taux;
      PH[k] = (hasard() + 1) / 2; POIDS[k] = o.niveaux ? o.niveaux[rang] : 1; energie += POIDS[k] * POIDS[k];
    }
    const kq = 1 / (o.resonance || 0.9), norme = 1 / sqrt(energie), lfo = o.lfo || [0, 0], fondu = taux * (o.relache || 0.02), amorti = o.amorti === undefined ? 1 : o.amorti;
    const scie = o.forme === 'scie', carre = o.forme === 'carre';
    let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0, env = 0;
    for (let i = 0; i < n; i++) {
      if (i % CADENCE === 0) {
        const t = i / taux, fc = (o.coupure1 + (o.coupure0 - o.coupure1) * exp(-t / (o.tempsFiltre || 0.15))) * (1 + lfo[1] * sin(TAU * lfo[0] * t));
        const g = tan(PI * min(fc, taux * 0.42) / taux);
        a1 = 1 / (1 + g * (g + kq)); a2 = g * a1; a3 = g * a2;
        env = min(1, (t + CADENCE / taux) / (o.attaque || 0.004)) * exp(-t * amorti);
      }
      let x = 0;
      for (let k = 0; k < nv; k++) {
        const dt = DT[k];
        let ph = PH[k] + dt;
        if (ph >= 1) ph -= 1;
        PH[k] = ph;
        const dent = 2 * ph - 1 - blep(ph, dt);
        if (scie) { x += dent * POIDS[k]; continue; }
        let p2 = ph + 0.5; if (p2 >= 1) p2 -= 1;
        const creneau = dent - (2 * p2 - 1 - blep(p2, dt));
        x += (carre ? creneau * 0.7 : 0.5 * dent + 0.35 * creneau) * POIDS[k];
      }
      const v3 = x * norme - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      sortie[i] = tanh(1.3 * v2) * env * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  /** Sirène : la note glisse de `depart` à `sommet` (demi-tons autour de f0), tient, puis gagne `arrivee` ; deux
   *  rotors à peine désaccordés, triangle et carré adoucis. chute : part du niveau perdue en redescendant. */
  function sirene(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), ecart = 1 + (o.battement || 0), fondu = taux * 0.08;
    let ph0 = 0, ph1 = 0.37, bas = 0, dt = 0, niveau = 0;
    for (let i = 0; i < n; i++) {
      if (i % CADENCE === 0) {
        const t = i / taux, a = lisse(min(1, t / o.montee)), b = lisse(borner((t - o.montee - o.tenue) / o.descente, 0, 1));
        dt = o.f0 * pow(2, (o.depart + (o.sommet - o.depart) * a + (o.arrivee - o.sommet) * b) / 12) * (1 + 0.004 * sin(TAU * 6 * t)) / taux;
        niveau = min(1, (t + CADENCE / taux) / (o.attaque || 0.02)) * (1 - (o.chute || 0) * b);
      }
      const dt1 = dt * ecart;
      ph0 += dt; if (ph0 >= 1) ph0 -= 1;
      ph1 += dt1; if (ph1 >= 1) ph1 -= 1;
      let q0 = ph0 + 0.5; if (q0 >= 1) q0 -= 1;
      let q1 = ph1 + 0.5; if (q1 >= 1) q1 -= 1;
      const carre = (2 * ph0 - 1 - blep(ph0, dt)) - (2 * q0 - 1 - blep(q0, dt)) + (2 * ph1 - 1 - blep(ph1, dt1)) - (2 * q1 - 1 - blep(q1, dt1));
      const triangle = 2 - 4 * abs(ph0 - 0.5) - 4 * abs(ph1 - 0.5);
      bas += 0.55 * ((0.62 * triangle + 0.3 * carre) * 0.5 - bas);
      sortie[i] = bas * niveau * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  /** Verre : une sinusoïde modulée en fréquence par une autre, sans rapport simple ; l'indice retombe vite. */
  function verre(o) {
    const n = ceil(o.duree * TAUX), sortie = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / TAUX, indice = o.indice * exp(-t * 9) + 0.2;
      sortie[i] = sin(TAU * o.f0 * t + indice * sin(TAU * o.f0 * o.rapport * t)) * exp(-t * o.amorti) * min(1, t / 0.002) * min(1, (n - i) / (TAUX * 0.05));
    }
    return sortie;
  }

  // Les instruments. ref : hauteur MIDI jouée à la période 428 ; une note va de ref − 12 à ref + 23. volume : volume MOD
  // par défaut. Le bourdon est calculé une octave au-dessus de la note qu'il tient (ré 2) : il n'a rien au-dessus de
  // 1 kHz, la moitié du taux lui suffit, et il dure deux mesures pour le poids d'une.
  const INSTRUMENTS = {
    glas: { nom: 'GLAS', ref: 50, volume: 48, faire: () => cloche({ f0: hz(50), duree: 3.3, amorti: 0.85, graine: 1103 }) },
    bourdon: { nom: 'BOURDON', ref: 50, volume: 44, faire: () => synthe({ f0: hz(50), forme: 'scie', voix: 2, desaccord: 18, accord: [0, 12], niveaux: [1, 0.3],
      coupure0: 380, coupure1: 900, tempsFiltre: 0.7, lfo: [0.5, 0.22], resonance: 0.9, attaque: 0.3, amorti: 0.42, relache: 0.2, duree: 2.3, graine: 1201 }) },
    trombone: { nom: 'TROMBONE', ref: 50, volume: 50, faire: () => cuivre({ f0: hz(50), duree: 2.4, eclat: 0.62, attaque: 0.07, amorti: 0.3, cloche: 700, vibrato: 0.002, graine: 1409 }) },
    cuivres: { nom: 'CUIVRES OCTAVE', ref: 62, volume: 52, faire: () => cuivre({ f0: hz(62), accord: [-12, 0], duree: 2.3, eclat: 0.78, attaque: 0.045, amorti: 0.4, cloche: 800, graine: 1307 }) },
    cor: { nom: 'COR', ref: 62, volume: 50, faire: () => cuivre({ f0: hz(62), duree: 2.3, eclat: 0.58, attaque: 0.05, amorti: 0.35, cloche: 900, vibrato: 0.003, graine: 1301 }) },
    ostinato: { nom: 'CORDES GRAVES', ref: 38, volume: 52, faire: () => cordes({ f0: hz(38), voix: 4, desaccord: 12, attaque: 0.012, amorti: 6.5, archet: 0.5, coupure: 1500,
      corps: CORPS_GRAVE, etalement: 0.008, duree: 0.5, graine: 1501 }) },
    frottement: { nom: 'FROTTEMENT', ref: 69, volume: 36, faire: () => cordes({ f0: hz(69), accord: [0, 1], voix: 2, desaccord: 14, attaque: 0.25, amorti: 0.15, tremolo: 12.5,
      coupure: 2000, corps: CORPS_MEDIUM, relache: 0.25, duree: 2.4, graine: 1613 }) },
    accord_min: { nom: 'ACCORD MINEUR', ref: 62, volume: 46, faire: () => resonner(melange(
      cordes({ f0: hz(62), accord: [-12, 0, 3, 7], voix: 2, desaccord: 12, attaque: 0.01, amorti: 4.5, archet: 0.6, coupure: 1900, corps: CORPS_MEDIUM, etalement: 0.012, duree: 0.62, graine: 1709 }),
      cuivre({ f0: hz(50), accord: [0, 7], duree: 0.62, eclat: 0.85, attaque: 0.02, amorti: 3.4, cloche: 800, graine: 1711 }), 0.6), 0.25, 1.3, 0.5) },
    accord_quinte: { nom: 'ACCORD DE QUINTE', ref: 50, volume: 46, faire: () => resonner(melange(
      cordes({ f0: hz(50), accord: [0, 7, 12], voix: 2, desaccord: 12, attaque: 0.01, amorti: 4.5, archet: 0.6, coupure: 1700, corps: CORPS_GRAVE, etalement: 0.012, duree: 0.62, graine: 1747 }),
      cuivre({ f0: hz(38), accord: [0, 7], duree: 0.62, eclat: 0.85, attaque: 0.02, amorti: 3.4, cloche: 700, graine: 1753 }), 0.6), 0.25, 1.3, 0.5) },
    choeur_grave: { nom: 'CHOEUR GRAVE', ref: 48, volume: 44, faire: () => choeur({ f0: hz(48), voyelle: 'ou', voix: 6, duree: 2.5, attaque: 0.25, amorti: 0.15, souffle: 0.1,
      etalement: 0.08, relache: 0.2, graine: 1999 }) },
    alerte: { nom: 'ALERTE', ref: 69, volume: 36, faire: () => sirene({ f0: hz(69), duree: 3.4, depart: -12, sommet: 0, arrivee: -7, montee: 1.3, tenue: 0.4, descente: 1.7,
      attaque: 0.9, chute: 0.6, battement: 0.006 }) },
    basse_brute: { nom: 'BASSE BRUTE', ref: 33, volume: 56, faire: () => saturee({ f0: hz(33), duree: 1, partiels: 14, pente: 1.2, etouffe: 0.075, gain: 3.4, contact: 0.05,
      coupure: 1100, grave: true, amorti: 2.2, graine: 2111 }) },
    accord_brut: { nom: 'ACCORD BRUT', ref: 45, volume: 46, faire: () => saturee({ f0: hz(45), accord: [0, 7, 12], doubles: true, duree: 0.8, partiels: 14, pente: 0.85, etouffe: 0.075,
      gain: 4, contact: 0.2, coupure: 1800, amorti: 2.6, graine: 2203 }) },
    foule: { nom: 'FOULE', ref: 45, volume: 44, faire: () => choeur({ f0: hz(45), voyelle: 'o', voix: 6, octave: 0.2, duree: 1.9, attaque: 0.09, amorti: 0.3, souffle: 0.12,
      etalement: 0.06, relache: 0.12, graine: 1901 }) },
    muraille: { nom: 'MURAILLE CUIVRES', ref: 48, volume: 52, faire: () => cuivre({ f0: hz(48), accord: [0, 7, 12], duree: 2.1, eclat: 0.74, attaque: 0.045, amorti: 0.4, cloche: 760, graine: 1607 }) },
    tuba: { nom: 'TUBA', ref: 36, volume: 56, faire: () => cuivre({ f0: hz(36), duree: 2.2, eclat: 0.6, attaque: 0.04, amorti: 0.55, cloche: 520, vibrato: 0.0015, graine: 1511 }) },
    pulsation: { nom: 'PULSATION', ref: 28, volume: 54, faire: () => synthe({ f0: hz(28), forme: 'mixte', voix: 2, desaccord: 9, coupure0: 1500, coupure1: 230, tempsFiltre: 0.08,
      resonance: 1.9, amorti: 2.2, duree: 0.7, graine: 2207 }) },
    nappe: { nom: 'NAPPE FROIDE', ref: 64, volume: 38, faire: () => synthe({ f0: hz(64), forme: 'carre', voix: 1, accord: [0, 0.13, 7, 13], niveaux: [0.7, 0.7, 0.8, 0.55],
      coupure0: 500, coupure1: 1700, tempsFiltre: 0.9, lfo: [0.7, 0.12], resonance: 0.8, attaque: 0.3, amorti: 0.15, relache: 0.3, duree: 1.95, graine: 2309 }) },
    arpege: { nom: 'ARPEGE', ref: 64, volume: 40, faire: () => synthe({ f0: hz(64), forme: 'carre', voix: 1, coupure0: 2600, coupure1: 600, tempsFiltre: 0.06, resonance: 1.4,
      amorti: 5, duree: 0.4, graine: 2411 }) },
    sirene: { nom: 'SIRENE', ref: 71, volume: 38, faire: () => sirene({ f0: hz(71), duree: 1.9, depart: 0, sommet: 6, arrivee: 0, montee: 0.5, tenue: 0.5, descente: 0.6, battement: 0.004 }) },
    bip: { nom: 'BIP', ref: 76, volume: 30, faire: () => synthe({ f0: hz(76), forme: 'carre', voix: 1, coupure0: 2300, coupure1: 2300, resonance: 1.5, attaque: 0.003, amorti: 0,
      relache: 0.015, duree: 0.115, graine: 2603 }) },
    frappe: { nom: 'FRAPPE SYNTHE', ref: 52, volume: 44, faire: () => synthe({ f0: hz(52), forme: 'scie', voix: 2, desaccord: 12, accord: [0, 7, 12], coupure0: 2200, coupure1: 420,
      tempsFiltre: 0.09, resonance: 1.2, amorti: 3.2, duree: 0.6, graine: 2503 }) },
    verre: { nom: 'VERRE', ref: 76, volume: 30, faire: () => verre({ f0: hz(76), rapport: 3.51, indice: 1.4, amorti: 3.2, duree: 1.1 }) },
    sifflet: { nom: 'SIFFLET', ref: 96, volume: 36, faire: () => sifflet({ f0: hz(96), duree: 0.9, graine: 1801 }) },
  };

  // ---- Batterie : coups calculés au double du taux (16 574 Hz), réunis en mesures entières (une par variante). ----
  // Durée de chaque famille de coups (s). « tom@87 », « timbale@65 », « bidon@150 » : la même famille, accordée (Hz).
  // Les dix coups de la rue (surdos, caixa, tamborim, agogôs, claque, grosse caisse, tambour, roulement) gardent leur
  // formule : moteur/audio.js les joue.
  const DUREES_FRAPPES = { grosse: 0.42, charleston: 0.08, ouvert: 0.36, claque: 0.32, tom: 0.5, surdoOuvert: 0.95, surdoEtouffe: 0.28,
    caixa: 0.15, tamborim: 0.09, agogoHaut: 0.36, agogoBas: 0.36, grosseCaisse: 1.05, tambour: 0.34, roulement: 0.12, timbale: 1.05,
    kick: 0.62, tic: 0.045, chute: 1.1, impact: 1.6, gong: 1.6, enclume: 0.5, bidon: 0.32, caisseLourde: 0.55, radio: 0.22 };
  const METAL = [317, 470, 571, 807, 834, 1235], FER = [382, 913, 1508, 2187, 2913, 3806], NIVEAUX_FER = [1, 0.8, 0.6, 0.45, 0.3, 0.2];
  const BANDES = { claque: [1150, 1.6], caixa: [3600, 1.2], tambour: [2300, 0.9], roulement: [2300, 0.9], bidon: [1500, 1.4], caisseLourde: [1700, 0.7], radio: [1900, 2.5] };
  function synthFrappe(sorte) {
    const [famille, reglage] = sorte.split('@'), f0 = Number(reglage) || 0;
    if (!(famille in DUREES_FRAPPES)) throw new Error('coup de batterie inconnu : ' + sorte);
    const taux = TAUX_BATTERIE, n = ceil(DUREES_FRAPPES[famille] * taux), sortie = new Float32Array(n), hasard = alea(graineDe(sorte));
    const bande = BANDES[famille] ? passeBande(BANDES[famille][0], BANDES[famille][1], taux) : null, fondu = n > taux ? taux * 0.04 : 60;
    // Tam-tam : partiels denses, sans rapport simple ; les aigus s'épanouissent après le coup et s'éteignent d'abord.
    const NG = famille === 'gong' ? 16 : 0, tam = banc(NG), R = new Float64Array(NG).fill(1), DR = new Float64Array(NG);
    for (let k = 0; k < NG; k++) { poser(tam, k, 61 * pow(1.26, k) * (1 + 0.035 * hasard()), 0, 1 / (1 + 0.28 * k), 1.9 + 0.22 * k, taux); DR[k] = exp(-1 / ((0.012 + 0.026 * k) * taux)); }
    let phase = 0, bas = 0, metalBas = 0, aiguBas = 0, lent = 0, porte = 1, cran = -1;
    for (let i = 0; i < n; i++) {
      const t = i / taux, b = hasard();
      bas += 0.22 * (b - bas);
      const aigu = b - bas;
      aiguBas += 0.3 * (aigu - aiguBas);
      let v = 0;
      if (famille === 'charleston' || famille === 'ouvert') {
        let m = 0;
        for (let k = 0; k < 6; k++) m += sin(TAU * METAL[k] * t) > 0 ? 1 : -1;
        metalBas += 0.3 * (m / 6 - metalBas);
        const metal = m / 6 - metalBas;
        v = (aigu * 0.6 + metal * 0.45) * exp(-t * (famille === 'charleston' ? 55 : 11)) * 0.55;
      } else switch (famille) {
        case 'grosse': phase += TAU * (50 + 110 * exp(-t * 38)) / taux;
          v = sin(phase) * exp(-t * 10) + 0.25 * sin(2 * phase) * exp(-t * 22) + aigu * 0.4 * exp(-t * 140); break;
        case 'claque': {
          let env = 0;
          for (const d of [0, 0.011, 0.022, 0.034]) if (t >= d) env += exp(-(t - d) * 170);
          if (t > 0.034) env += 0.35 * exp(-(t - 0.034) * 20);
          v = filtrer(bande, b) * env * 1.7; break;
        }
        // Les fûts graves : le mode fondamental, deux modes de la peau (1,59 et 2,14 fois plus haut) et le coup de
        // mailloche dans le médium, pour qu'ils s'entendent aussi sur de petits haut-parleurs.
        case 'tom': phase += TAU * (f0 || 98) * (1 + 0.45 * exp(-t * 16)) / taux;
          v = (sin(phase) + 0.32 * sin(1.59 * phase) * exp(-t * 8) + 0.16 * sin(2.14 * phase) * exp(-t * 12)) * exp(-t * 6.5) * (1 + 0.3 * exp(-t * 30))
            + aigu * 0.12 * exp(-t * 60) + bas * 1.1 * exp(-t * 45); break;
        case 'surdoOuvert': phase += TAU * (60 + 18 * exp(-t * 9)) / taux;
          v = (sin(phase) + 0.38 * sin(1.59 * phase) * exp(-t * 7) + 0.2 * sin(2.14 * phase) * exp(-t * 11)) * exp(-t * 4.6) * (1 + 0.25 * exp(-t * 30))
            + (bas - 0.5) * 1.6 * exp(-t * 45); break;
        case 'surdoEtouffe': phase += TAU * (64 + 12 * exp(-t * 20)) / taux;
          v = (sin(phase) + 0.35 * sin(1.59 * phase) * exp(-t * 12)) * exp(-t * 17) + aigu * 0.25 * exp(-t * 90) + (bas - 0.5) * 1.4 * exp(-t * 60); break;
        case 'caixa': v = filtrer(bande, b) * 1.5 * exp(-t * 32) + aigu * 0.35 * exp(-t * 22) + sin(TAU * 240 * t) * 0.15 * exp(-t * 50); break;
        case 'tamborim': phase += TAU * 690 / taux; v = sin(phase) * exp(-t * 48) * 0.8 + aigu * 0.45 * exp(-t * 160); break;
        case 'agogoHaut': case 'agogoBas': {
          const f = famille === 'agogoHaut' ? 980 : 740;
          v = sin(TAU * f * t) * exp(-t * 9) + 0.5 * sin(TAU * f * 2.38 * t) * exp(-t * 13) + 0.28 * sin(TAU * f * 4.1 * t) * exp(-t * 19)
            + aigu * 0.2 * exp(-t * 200); v *= 0.6; break;
        }
        case 'grosseCaisse': phase += TAU * (54 + 14 * exp(-t * 12)) / taux;
          v = (sin(phase) + 0.32 * sin(1.59 * phase) * exp(-t * 8) + 0.16 * sin(2.3 * phase) * exp(-t * 12)) * exp(-t * 4.2) * (1 + 0.3 * exp(-t * 25))
            + (bas - 0.5) * 1.5 * exp(-t * 40); break;
        case 'tambour': v = (filtrer(bande, b) * 1.3 + aigu * 0.5) * exp(-t * 13) + sin(TAU * 205 * t) * 0.4 * exp(-t * 32); break;
        case 'roulement': v = (filtrer(bande, b) * 1.1 + aigu * 0.4) * exp(-t * 38) + sin(TAU * 210 * t) * 0.2 * exp(-t * 55); break;
        case 'timbale': phase += TAU * (f0 || 98) / taux;
          v = (sin(phase) + 0.5 * sin(1.51 * phase) + 0.3 * sin(1.99 * phase)) * exp(-t * 2.6) * 0.6 + bas * 0.2 * exp(-t * 35); break;
        case 'kick': phase += TAU * (44 + 115 * exp(-t * 28)) / taux; v = tanh(1.6 * sin(phase) * exp(-t * 4.6)) + aigu * 0.2 * exp(-t * 220); break;
        case 'tic': v = sin(TAU * 1850 * t) * exp(-t * 110) * 0.6 + aigu * 0.4 * exp(-t * 300); break;
        case 'chute': phase += TAU * (36 + 54 * exp(-t * 3.5)) / taux; v = sin(phase) * min(1, t / 0.01) * exp(-t * 1.9); break;
        // Le choc : un grave qui s'effondre et sature, un souffle sourd, le claquement, puis les débris.
        case 'impact': phase += TAU * (34 + 62 * exp(-t * 7)) / taux; lent += 0.05 * (b - lent);
          v = tanh(2.4 * sin(phase) * exp(-t * 2.8)) * 0.85 + lent * 5 * exp(-t * 5) + aigu * 0.45 * exp(-t * 50) + bas * 0.5 * exp(-t * 2.6); break;
        case 'gong': {
          let g = 0;
          for (let k = 0; k < NG; k++) {
            const s = tam.S[k] * tam.DC[k] + tam.C[k] * tam.DS[k];
            tam.C[k] = tam.C[k] * tam.DC[k] - tam.S[k] * tam.DS[k]; tam.S[k] = s; tam.A[k] *= tam.D[k]; R[k] *= DR[k];
            g += s * tam.A[k] * (1 - R[k]);
          }
          v = g * 0.3 + sin(TAU * 61 * t) * exp(-t * 4) * 0.5; break;
        }
        // Le fer : une plaque d'acier frappée, partiels sans rapport simple.
        case 'enclume': v = aigu * 0.5 * exp(-t * 170);
          for (let k = 0; k < 6; k++) v += sin(TAU * FER[k] * t) * NIVEAUX_FER[k] * exp(-t * (9 + 4.5 * k));
          v *= 0.5; break;
        // Le bidon : une tôle creuse, sourde, qui sonne court.
        case 'bidon': { const f = TAU * (f0 || 165) * t;
          v = (sin(f) + 0.6 * sin(1.47 * f) * exp(-t * 6) + 0.42 * sin(2.09 * f) * exp(-t * 10) + 0.28 * sin(2.56 * f) * exp(-t * 14)) * exp(-t * 13) * 0.75
            + filtrer(bande, b) * 0.9 * exp(-t * 70); break; }
        case 'caisseLourde': v = filtrer(bande, b) * 1.5 * exp(-t * 10) + aigu * 0.3 * exp(-t * 16) + (sin(TAU * 148 * t) * 0.6 + sin(TAU * 226 * t) * 0.3) * exp(-t * 15); break;
        // La radio : un souffle étroit que la porte hache.
        case 'radio': { const c = floor(t / 0.011);
          if (c !== cran) { cran = c; porte = hasard() > -0.3 ? 1 : 0.15; }
          v = filtrer(bande, b) * 2 * porte * min(1, t / 0.004) * exp(-t * 9); break; }
        default: throw new Error('coup de batterie inconnu : ' + sorte);
      }
      sortie[i] = tanh(v * 1.25) * min(1, i / 6) * min(1, (n - i) / fondu);
    }
    return sortie;
  }
  const banqueFrappes = new Map();
  function donneesFrappe(sorte) {
    let d = banqueFrappes.get(sorte);
    if (!d) { d = synthFrappe(sorte); banqueFrappes.set(sorte, d); }
    return d;
  }

  // Variantes de batterie de chaque morceau : [sorte, rangs (doubles-croches de la mesure), vélocité ou vélocités].
  // « montee » : un souffle qui s'ouvre du premier rang au second, puis le vide avant le temps fort.
  const HUIT = [0, 2, 4, 6, 8, 10, 12, 14], SEIZE = Array.from({ length: 16 }, (_, i) => i), CONTRE = [2, 6, 10, 14];
  const DEMIS = Array.from({ length: 16 }, (_, i) => 8 + i / 2);
  const KITS = {
    // Titre : le cœur qui bat, les fûts accordés sur ré mineur (ré, fa, la), le choc et le tam-tam.
    titre: (() => {
      const charge = [['grosse', [0, 3, 10], [1, 0.75, 0.85]], ['grosseCaisse', [0], 0.7], ['caisseLourde', [8], 0.95], ['enclume', [8], 0.3],
        ['tom@73', [6, 14], [0.55, 0.6]], ['tom@87', [15], 0.6], ['tic', [2, 4, 6, 10, 12, 14], 0.16]];
      return [
        /* A cœur    */ [['grosse', [0, 3], [0.6, 0.4]], ['tic', [8], 0.22]],
        /* B fût     */ [['grosse', [0, 3], [0.6, 0.4]], ['tom@73', [10, 14], [0.32, 0.4]], ['tic', [4, 12], 0.18]],
        /* C pas     */ [['grosse', [0, 8], 0.65], ['grosse', [3, 11], 0.36], ['tom@73', [6, 14], 0.4], ['tom@110', [15], 0.3], ['tic', [4, 12], 0.2]],
        /* D montée  */ [['grosse', [0], 0.65], ['montee', [4, 14], 0.45], ['tom@73', [8, 9, 12], [0.3, 0.36, 0.6]], ['tom@87', [10, 13], [0.44, 0.72]], ['tom@110', [11], 0.52]],
        /* E charge  */ charge,
        /* F charge  */ [['grosse', [0, 3, 6, 10, 11], [1, 0.7, 0.8, 0.85, 0.6]], ['grosseCaisse', [0], 0.7], ['caisseLourde', [8], 0.95], ['enclume', [8], 0.3],
          ['tom@110', [13], 0.6], ['tom@87', [14], 0.65], ['tom@73', [15], 0.7], ['tic', [2, 4, 12], 0.16]],
        /* G rupture */ [['impact', [0], 1], ['gong', [0], 0.6]],
        /* H relance */ [['grosse', [0, 6], [1, 0.8]], ['caisseLourde', [4], 0.8], ['roulement', DEMIS, rampe(16, 0.22, 0.8)], ['tom@110', [12], 0.6], ['tom@87', [13], 0.66],
          ['tom@73', [14, 15], [0.75, 0.85]]],
        /* I choc    */ [...charge, ['impact', [0], 0.9], ['gong', [0], 0.45]],
      ];
    })(),
    // Convergence : la rue frappe ce qu'elle trouve. Tresillo (3 + 3 + 2) des surdos, fûts accordés sur la mineur
    // (mi, la, do), bidons, fer, mains.
    convergence: (() => {
      const tresillo = [['surdoOuvert', [0, 8], 1], ['grosse', [0, 8], 0.8], ['surdoEtouffe', [3, 6, 11, 14], [0.75, 0.85, 0.75, 0.85]], ['claque', [4, 12], 0.5],
        ['bidon', [2, 5, 7, 10, 13, 15], 0.3]];
      return [
        /* A lointain */ [['surdoEtouffe', [0, 3, 6], [0.5, 0.3, 0.38]], ['tom@82', [8], 0.3], ['bidon', [12], 0.2]],
        /* B guet     */ [['surdoOuvert', [0], 0.6], ['surdoEtouffe', [3, 6, 11], [0.32, 0.4, 0.32]], ['tom@110', [14], 0.3], ['bidon', [4, 12], 0.22]],
        /* C pas      */ [['surdoOuvert', [0, 8], 0.65], ['surdoEtouffe', [3, 6, 11, 14], 0.4], ['bidon', [2, 10], 0.22], ['enclume', [12], 0.2]],
        /* D montée   */ [['surdoOuvert', [0], 0.65], ['montee', [0, 14], 0.4], ['tom@82', [8, 9], [0.3, 0.38]], ['tom@110', [10, 11], [0.46, 0.54]], ['tom@131', [12, 13], [0.64, 0.76]]],
        /* E tresillo */ [...tresillo, ['tom@110', [6, 14], 0.45]],
        /* F fûts     */ [...tresillo, ['tom@131', [12], 0.7], ['tom@110', [13, 14], [0.7, 0.75]], ['tom@82', [15], 0.85]],
        /* G charge   */ [['tom@82', [0, 3, 6, 8, 11, 14], 0.9], ['tom@110', [1, 2, 4, 5, 7, 9, 10, 12, 13, 15], 0.42], ['surdoOuvert', [0, 8], 0.9], ['claque', [4, 12], 0.4]],
        /* H relance  */ [['surdoOuvert', [0, 3, 6], 1], ['grosse', [0, 3, 6], 0.8], ['enclume', [0, 3, 6], 0.4], ['tom@131', [8, 9, 10, 11], rampe(4, 0.4, 0.6)],
          ['tom@110', [12, 13], [0.66, 0.72]], ['tom@82', [14, 15], [0.8, 0.9]]],
        /* I choc     */ [...tresillo, ['impact', [0], 0.9]],
        /* J arrêt    */ [['surdoOuvert', [0, 3, 6], 1], ['grosse', [0, 3, 6], 0.8], ['enclume', [0, 3, 6], 0.35], ['bidon', [10, 13], 0.22], ['tom@82', [14, 15], [0.5, 0.6]]],
      ];
    })(),
    // Bastion : la marche. Grosse caisse, tambours, timbales sur do et sol, tam-tam au sommet.
    bastion: (() => {
      const marche = [['grosseCaisse', [0, 4, 8, 12], [1, 0.75, 0.9, 0.75]], ['tambour', [0, 4, 6, 7, 8, 12], [0.8, 0.8, 0.5, 0.6, 0.8, 0.8]], ['roulement', [14, 15], [0.4, 0.5]],
        ['timbale@65', [0, 8], 0.7], ['timbale@98', [6, 7], 0.5]];
      return [
        /* A veille  */ [['grosseCaisse', [0, 10], [0.6, 0.3]]],
        /* B garde   */ [['grosseCaisse', [0, 8], [0.62, 0.5]], ['tambour', [12], 0.3], ['roulement', [14, 15], [0.18, 0.24]]],
        /* C pas     */ [['grosseCaisse', [0, 8], 0.65], ['timbale@65', [0], 0.45], ['tambour', [4, 12], 0.4], ['roulement', [6, 7, 14, 15], 0.22]],
        /* D montée  */ [['grosseCaisse', [0], 0.7], ['roulement', DEMIS, rampe(16, 0.2, 0.75)], ['timbale@98', [12, 14], [0.5, 0.6]], ['tambour', [15], 0.7]],
        /* E marche  */ marche,
        /* F marche  */ [['grosseCaisse', [0, 3, 8, 11], [1, 0.6, 0.9, 0.6]], ['tambour', [4, 12], 0.9], ['roulement', [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], 0.32],
          ['timbale@65', [0, 3, 8], [0.7, 0.5, 0.7]], ['timbale@98', [11, 14], 0.6]],
        /* G sommet  */ [...marche, ['gong', [0], 0.6], ['impact', [0], 0.8]],
        /* H relance */ [['grosseCaisse', [0, 8, 12, 14], 1], ['timbale@98', [8, 10, 12], [0.6, 0.66, 0.72]], ['timbale@65', [13, 14, 15], [0.7, 0.78, 0.86]],
          ['roulement', DEMIS, rampe(16, 0.3, 0.85)]],
      ];
    })(),
    // Préfecture : la machine. Grosse caisse électronique, fer et mains ensemble sur les temps faibles, cymbales
    // serrées, radio, chute.
    prefecture: [
      /* A veille  */ [['kick', [0], 0.7], ['tic', [4, 8, 12], 0.22], ['charleston', CONTRE, 0.14]],
      /* B ronde   */ [['kick', [0, 10], [0.72, 0.5]], ['tic', [4, 12], 0.22], ['charleston', CONTRE, 0.18], ['radio', [13], 0.22]],
      /* C pas     */ [['kick', [0, 8], 0.75], ['enclume', [12], 0.3], ['claque', [12], 0.3], ['charleston', SEIZE, SEIZE.map(r => (r % 4 === 2 ? 0.2 : 0.1))], ['tic', [4], 0.2]],
      /* D montée  */ [['kick', [0, 8, 12], [0.75, 0.75, 0.8]], ['montee', [4, 14], 0.45], ['claque', [10, 11, 12, 13], [0.3, 0.4, 0.5, 0.6]]],
      /* E machine */ [['kick', [0, 4, 8, 12], 0.95], ['claque', [4, 12], 0.6], ['enclume', [4, 12], 0.35], ['charleston', SEIZE, SEIZE.map(r => (r % 4 === 2 ? 0.34 : 0.2))], ['tic', [3, 11], 0.25]],
      /* F machine */ [['kick', [0, 4, 8, 12, 14], [0.95, 0.95, 0.95, 0.95, 0.7]], ['claque', [4, 12], 0.6], ['enclume', [4, 12], 0.35], ['charleston', SEIZE, 0.22], ['ouvert', [10], 0.25],
        ['radio', [7], 0.25]],
      /* G rupture */ [['chute', [0], 1], ['impact', [0], 0.8], ['kick', [8, 10, 12, 13, 14, 15], rampe(6, 0.5, 0.9)]],
      /* H relance */ [['kick', [0, 4, 8], 0.95], ['claque', SEIZE.slice(8), rampe(8, 0.3, 0.85)], ['montee', [8, 16], 0.5]],
    ],
  };
  /** Une mesure entière de batterie, au double du taux, pour un seul canal du MOD (FERRO, drumBar), dans la salle du
   *  morceau. */
  function mesureBatterie(cle, variante) {
    const def = MORCEAUX[cle], pas = 60 / def.bpm / 4, taux = TAUX_BATTERIE, periode = round(pas * 16 * taux), n = ceil((pas * 16 + 0.25) * taux);
    const sortie = new Float32Array(n);
    for (const [sorte, rangs, velocite] of KITS[cle][variante]) {
      if (sorte === 'montee') {
        const hasard = alea(7717 + variante), de = round(rangs[0] * pas * taux), a = min(n, round(rangs[1] * pas * taux));
        let bas = 0;
        for (let i = de; i < a; i++) {
          const x = (i - de) / (a - de), b = hasard();
          bas += (0.02 + 0.5 * x * x) * (b - bas);
          sortie[i] += bas * velocite * (0.3 + 0.7 * x) * x * min(1, (a - i) / 80) * 2.2;
        }
        continue;
      }
      for (let k = 0; k < rangs.length; k++) {
        const vel = Array.isArray(velocite) ? velocite[k] : velocite, at = round(rangs[k] * pas * taux), d = donneesFrappe(sorte);
        for (let i = 0; i < d.length && at + i < n; i++) sortie[at + i] += d[i] * vel;
      }
    }
    for (let i = 0; i < n; i++) sortie[i] = tanh(sortie[i] * 1.1);
    salle(sortie, taux, def.salle[0], def.salle[1], 2, periode);
    const fondu = 0.25 * taux;
    for (let i = floor(n - fondu); i < n; i++) sortie[i] *= (n - i) / fondu;
    return sortie;
  }

  // ---- Les morceaux. tonique : la note MIDI du ton ; salle : [part, durée (s)] de la réverbération de la batterie. ----
  const MORCEAUX = {
    titre: { titre: 'Point de rupture', moduleTitre: 'PDR I - THEME', style: 'Glas, bourdon, cordes et cuivres graves', bpm: 100, tonique: 50, mode: 'ré mineur', salle: [0.22, 1.7],
      instruments: ['glas', 'bourdon', 'trombone', 'cuivres', 'ostinato', 'choeur_grave', 'frottement', 'accord_min', 'accord_quinte', 'alerte'] },
    convergence: { titre: 'La Convergence', moduleTitre: 'PDR II - CONVERGENCE', style: 'Tambours de rue et basse brute', bpm: 126, tonique: 45, mode: 'la mineur phrygien', salle: [0.14, 0.8],
      instruments: ['basse_brute', 'accord_brut', 'foule', 'alerte'] },
    bastion: { titre: 'Le Bastion', moduleTitre: 'PDR III - BASTION', style: 'Tambours de guerre et cuivres graves', bpm: 88, tonique: 48, mode: 'do mineur', salle: [0.24, 1.9],
      instruments: ['muraille', 'tuba', 'trombone', 'choeur_grave', 'glas', 'cor'] },
    prefecture: { titre: 'La Préfecture', moduleTitre: 'PDR IV - PREFECTURE', style: 'Pulsation froide, synthés et sirènes', bpm: 124, tonique: 52, mode: 'mi phrygien', salle: [0.1, 0.45],
      instruments: ['pulsation', 'nappe', 'arpege', 'sirene', 'bip', 'frappe', 'verre'] },
  };
  const CLES = Object.freeze(Object.keys(MORCEAUX));
  const cleDe = x => (MORCEAUX[x] ? x : typeof x === 'number' && CLES[x | 0] ? CLES[x | 0] : 'titre');

  /** Rédaction d'un morceau dans des motifs de 64 rangées × 4 canaux (FERRO, compose/put). */
  function ecrivain(cle, nbMotifs) {
    const liste = MORCEAUX[cle].instruments, motifs = Array.from({ length: nbMotifs }, () => new Uint8Array(1024));
    function cellule(p, rang, canal, echantillon, periode, effet, param) {
      const at = (rang * 4 + canal) * 4, m = motifs[p];
      m[at] = (echantillon & 240) | (periode >> 8); m[at + 1] = periode & 255; m[at + 2] = ((echantillon & 15) << 4) | effet; m[at + 3] = param;
    }
    const libre = (p, rang, canal) => { const at = (rang * 4 + canal) * 4, m = motifs[p]; return !(m[at] | m[at + 1] | m[at + 2] | m[at + 3]); };
    /** Une note à un rang du motif (0..63). vol : volume MOD (1..64) ; sans lui, celui de l'instrument. */
    function note(p, rang, canal, nom, hauteur, vol) {
      const k = liste.indexOf(nom), r = 48 + hauteur - INSTRUMENTS[nom].ref;
      if (k < 0) throw new Error(cle + ' : instrument absent ' + nom);
      if (r < 36 || r > 71 || hauteur !== round(hauteur)) throw new Error(cle + ' : ' + nom + ' ' + hauteur + ' hors de la tessiture');
      if (rang !== round(rang) || rang < 0 || rang > 63) throw new Error(cle + ' : rang ' + rang);
      cellule(p, rang, canal, k + 1, PERIODES[r - 36], vol === undefined ? 0 : 12, vol === undefined ? 0 : borner(round(vol), 1, 64));
    }
    /** Silence (C00) : il coupe la note tenue, sauf si une autre commence là. */
    const coupe = (p, rang, canal) => { if (rang < 64 && libre(p, rang, canal)) cellule(p, rang, canal, 0, 0, 12, 0); };
    /** notes : [rang, hauteur, durée, volume ?] sur les 64 rangées du motif ; la note s'arrête à la fin de sa durée. */
    function ligne(p, canal, nom, notes, vol, transposition = 0) {
      for (let k = 0; k < notes.length; k++) {
        const [rang, hauteur, duree, v] = notes[k], fin = rang + duree, suivant = k + 1 < notes.length ? notes[k + 1][0] : 64;
        note(p, rang, canal, nom, hauteur + transposition, v === undefined ? vol : v);
        if (fin < suivant) coupe(p, fin, canal);
      }
    }
    /** La même chose dans une mesure : rangs de 0 à 15 ; la dernière note sonne au-delà de la barre. */
    function phrase(p, mesure, canal, nom, notes, vol, transposition = 0) {
      for (let k = 0; k < notes.length; k++) {
        const [pas, hauteur, duree, v] = notes[k], fin = pas + duree, suivant = k + 1 < notes.length ? notes[k + 1][0] : 16;
        note(p, mesure * 16 + pas, canal, nom, hauteur + transposition, v === undefined ? vol : v);
        if (fin < suivant && fin < 16) coupe(p, mesure * 16 + fin, canal);
      }
    }
    /** Nuance sans réattaque : le volume glisse de v0 à v1 du rang `de` au rang `a` (effet C sur les rangées libres). */
    function nuance(p, canal, de, a, v0, v1) {
      for (let r = de; r <= a; r++) if (libre(p, r, canal)) cellule(p, r, canal, 0, 0, 12, borner(round(v0 + (v1 - v0) * (r - de) / max(1, a - de)), 1, 64));
    }
    const batterie = (p, mesure, variante) => { if (variante >= 0) cellule(p, mesure * 16, 3, liste.length + 1 + variante, PERIODES[60 - 36], 0, 0); };
    return { motifs, note, coupe, ligne, phrase, nuance, batterie };
  }

  /** « Point de rupture », le thème : ré mineur, 100 BPM. Calme : le glas sur un bourdon de ré, le thème grave au
   *  trombone (ré – fa – mi♭ | ré – do – la | si♭ – do – do♯ | ré), sa réponse, l'attente. Tendu : le thème aux cuivres
   *  à l'octave sur un ostinato de cordes graves au galop, accords frappés, la rupture (choc, silence, alerte et
   *  frottements qui montent), la charge. Pistes : 1 le chant, 2 la basse, 3 l'harmonie, 4 la batterie. */
  function composerTitre() {
    const e = ecrivain('titre', 12);
    const themeA = [[0, 62, 6], [6, 65, 2], [8, 63, 8], [16, 62, 6], [22, 60, 2], [24, 57, 8], [32, 58, 4], [36, 60, 4], [40, 61, 8], [48, 62, 12]];
    const themeB = [[0, 69, 8], [8, 70, 4], [12, 69, 4], [16, 67, 4], [20, 65, 4], [24, 63, 6], [30, 62, 2], [32, 65, 6], [38, 63, 2], [40, 62, 4], [44, 61, 4], [48, 62, 12]];
    // Fondamentales et accords par demi-mesure : ré m, la, sol m ; la réponse passe par mi♭, le second degré abaissé.
    const basA = [38, 38, 38, 33, 31, 33, 38, 38], basB = [38, 38, 43, 39, 34, 33, 38, 38], re = [38, 38, 38, 38, 38, 38, 38, 38];
    const mi = h => ['accord_min', h], qu = h => ['accord_quinte', h];
    const accA = [mi(62), mi(62), mi(62), qu(57), mi(55), qu(57), mi(62), mi(62)], accB = [mi(62), mi(62), mi(55), qu(51), qu(58), qu(57), mi(62), mi(62)];
    const galop = (p, bas, vol) => { for (let d = 0; d < 8; d++) for (const pas of [0, 2, 3, 4, 6, 7]) e.note(p, d * 8 + pas, 1, 'ostinato', bas[d], pas % 4 ? vol - 12 : vol); };
    const croches = (p, bas, v0, v1) => { for (let r = 0; r < 62; r += 2) e.note(p, r, 1, 'ostinato', bas[r >> 3], v0 + (v1 - v0) * r / 60 + (r % 4 ? 0 : 6)); };
    const frappes = (p, acc, vol) => { for (let d = 0; d < 8; d++) for (const pas of d % 2 ? [4] : [0, 6]) e.note(p, d * 8 + pas, 2, acc[d][0], acc[d][1], vol); };
    const kits = [[0, 0, 1, 0], [0, 1, 0, 1], [1, 2, 1, 2], [2, 2, 2, 3], [1, 1, 2, 1], [2, 2, 2, 3], [8, 4, 5, 4], [4, 5, 4, 7], [6, -1, 3, 7], [8, 5, 4, 5], [4, 5, 4, 7], [8, 5, 5, 7]];
    for (let p = 0; p < 12; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    // Section calme. Le bourdon revient toutes les deux mesures, comme un souffle.
    for (const p of [0, 1, 2, 4]) for (const r of [0, 32]) e.note(p, r, 1, 'bourdon', 38, 44);
    // 0, le glas.
    e.note(0, 0, 0, 'glas', 50, 48); e.note(0, 32, 0, 'glas', 50, 38);
    e.ligne(0, 2, 'choeur_grave', [[16, 45, 16], [32, 46, 16], [48, 45, 14]], 30);
    // 1, le thème grave ; le chœur tient la quinte et soupire sur la sixte mineure.
    e.ligne(1, 0, 'trombone', themeA, 40, -12);
    e.ligne(1, 2, 'choeur_grave', [[0, 45, 16], [16, 45, 16], [32, 46, 16], [48, 45, 14]], 28);
    // 2, la réponse ; un frottement grave (ré contre mi♭) enfle sous la cadence, puis se tait.
    e.ligne(2, 0, 'trombone', themeB, 40, -12);
    e.ligne(2, 2, 'frottement', [[16, 62, 16, 6], [32, 62, 14, 16]]);
    e.nuance(2, 2, 17, 31, 6, 16); e.nuance(2, 2, 33, 45, 16, 26);
    // 3, l'attente : l'ostinato approche, le frottement monte, puis le vide.
    e.note(3, 0, 0, 'glas', 50, 40);
    croches(3, re, 18, 32);
    e.ligne(3, 2, 'frottement', [[32, 69, 16, 10], [48, 69, 14, 26]]);
    e.nuance(3, 2, 33, 47, 10, 26); e.nuance(3, 2, 49, 61, 26, 42);
    // 4, le thème au loin, sous le glas.
    e.note(4, 0, 0, 'glas', 50, 46); e.note(4, 32, 0, 'glas', 50, 38);
    e.ligne(4, 2, 'trombone', themeA, 48, -12);
    // 5, la réponse sur l'ostinato.
    e.ligne(5, 0, 'trombone', themeB, 42, -12);
    croches(5, basB, 22, 34);
    e.ligne(5, 2, 'frottement', [[32, 69, 16, 10], [48, 69, 14, 24]]);
    e.nuance(5, 2, 33, 47, 10, 24); e.nuance(5, 2, 49, 61, 24, 40);
    // Section tendue. 6 et 9 : le thème ; 7 et 10 : la réponse.
    for (const [p, theme, bas, acc] of [[6, themeA, basA, accA], [7, themeB, basB, accB], [9, themeA, basA, null], [10, themeB, basB, accB]]) {
      e.ligne(p, 0, 'cuivres', theme, 54);
      galop(p, bas, 54);
      if (acc) frappes(p, acc, 44);
    }
    e.ligne(9, 2, 'frottement', [[0, 69, 16], [16, 69, 16], [32, 69, 14]], 34);
    // 8, la rupture : le choc, puis rien que la basse qui descend, l'alerte et le frottement qui monte.
    e.ligne(8, 1, 'bourdon', [[0, 50, 16], [16, 49, 16], [32, 48, 16], [48, 47, 14]], 46);
    e.note(8, 0, 0, 'alerte', 69, 30); e.note(8, 32, 0, 'alerte', 74, 38);
    e.ligne(8, 2, 'frottement', [[0, 69, 16, 8], [16, 69, 16, 22], [32, 74, 16, 26], [48, 74, 14, 40]]);
    e.nuance(8, 2, 1, 15, 8, 22); e.nuance(8, 2, 17, 31, 22, 34); e.nuance(8, 2, 33, 47, 26, 40); e.nuance(8, 2, 49, 61, 40, 54);
    // 11, la charge : les cuivres martèlent ré, puis montent par le second degré abaissé.
    const riff = [[0, 62, 2], [3, 62, 2], [6, 65, 2], [8, 62, 2], [11, 62, 2], [14, 63, 2]];
    for (let m = 0; m < 3; m++) e.phrase(11, m, 0, 'cuivres', m === 1 ? riff.map(([r, h, d]) => [r, h === 63 ? 61 : h, d]) : riff, 54);
    e.phrase(11, 3, 0, 'cuivres', [[0, 62, 3], [3, 63, 3], [6, 65, 2], [8, 67, 3], [11, 69, 3], [14, 70, 2]], 56);
    galop(11, re, 54);
    for (let r = 48; r < 64; r++) e.note(11, r, 1, 'ostinato', 38, 42 + (r - 48));
    frappes(11, [mi(62), mi(62), mi(62), mi(62), mi(62), mi(62), qu(51), qu(51)], 44);
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 4, 5], tendu: [6, 7, 8, 9, 10, 11] };
  }

  /** « La Convergence » : la mineur phrygien, 126 BPM. Tout tient sur un tresillo (3 + 3 + 2) : les surdos, la basse
   *  brute (la – la – do | la – la – si♭, puis ré – mi♭ – ré, le triton). Calme : coups lointains, la foule qui gronde
   *  sur la, l'alerte au loin. Tendu : le riff, les accords saturés à l'unisson, la montée (do, ré, mi♭), la charge
   *  des fûts seuls, les arrêts. Pistes : 1 les accords et la foule, 2 la basse, 3 la foule et l'alerte, 4 la batterie. */
  function composerConvergence() {
    const e = ecrivain('convergence', 12);
    const riffA = [[0, 33, 3], [3, 33, 3], [6, 36, 2], [8, 33, 3], [11, 33, 3], [14, 34, 2]];
    const riffB = [[0, 33, 3], [3, 33, 3], [6, 36, 2], [8, 38, 3], [11, 39, 3], [14, 38, 2]];
    // Les mêmes, serrés : des doubles-croches entre les appuis.
    const serre = riff => riff.flatMap(([r, h, d]) => (d === 3 ? [[r, h, 2], [r + 2, h, 1]] : [[r, h, d]]));
    const kits = [[0, 0, 1, 0], [0, 1, 0, 1], [1, 2, 1, 2], [2, 2, 2, 3], [1, 0, 1, 0], [2, 2, 2, 3], [8, 4, 4, 5], [4, 5, 4, 7], [4, 5, 5, 7], [6, 6, 6, 7], [8, 4, 5, 4], [9, 9, 9, 7]];
    for (let p = 0; p < 12; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    // Section calme. 0 : un coup de basse toutes les deux mesures, l'alerte très loin.
    e.note(0, 0, 1, 'basse_brute', 33, 36); e.note(0, 32, 1, 'basse_brute', 33, 36); e.note(0, 60, 1, 'basse_brute', 34, 28);
    e.note(0, 32, 2, 'alerte', 69, 12);
    // 1 : la foule gronde sur la.
    for (let m = 0; m < 4; m++) e.note(1, m * 16, 1, 'basse_brute', 33, 36);
    e.note(1, 56, 1, 'basse_brute', 34, 30);
    e.ligne(1, 0, 'foule', [[0, 45, 16, 16], [16, 45, 14, 24]]); e.nuance(1, 0, 1, 15, 16, 24);
    // 2 : le tresillo à voix basse ; la foule chante la – la – do – si♭.
    [33, 33, 36, 34].forEach((r, m) => e.phrase(2, m, 1, 'basse_brute', [[0, r, 3], [3, r, 3], [6, r, 2]], 38));
    e.ligne(2, 0, 'foule', [[0, 45, 16], [16, 45, 16], [32, 48, 16], [48, 46, 14]], 30);
    // 3 : l'alerte ; la foule revient et enfle.
    e.note(3, 0, 1, 'basse_brute', 33, 36); e.note(3, 32, 1, 'basse_brute', 33, 36);
    e.note(3, 0, 2, 'alerte', 69, 22); e.note(3, 32, 2, 'alerte', 69, 28);
    e.ligne(3, 0, 'foule', [[32, 45, 16, 12], [48, 45, 14, 24]]); e.nuance(3, 0, 33, 47, 12, 24); e.nuance(3, 0, 49, 61, 24, 36);
    // 4 : le riff à mi-voix, la foule lui répond.
    for (const m of [0, 2]) { e.phrase(4, m, 1, 'basse_brute', riffA, 36); e.coupe(4, m * 16 + 16, 1); }
    e.ligne(4, 2, 'foule', [[16, 45, 14], [48, 45, 14]], 34);
    // 5 : le tresillo entier, qui enfle ; la foule monte à la quinte et frotte la sixte mineure.
    for (let m = 0; m < 4; m++) e.phrase(5, m, 1, 'basse_brute', riffA, 36 + 3 * m);
    e.ligne(5, 0, 'foule', [[0, 52, 16, 30], [16, 53, 16, 33], [32, 52, 16, 36], [48, 50, 14, 40]]);
    e.note(5, 32, 2, 'alerte', 69, 26);
    // Section tendue. 6 : le riff, un accord saturé sur chaque temps fort.
    for (const p of [6, 7]) for (let m = 0; m < 4; m++) e.phrase(p, m, 1, 'basse_brute', m % 2 ? riffB : riffA, 56);
    for (let m = 0; m < 4; m++) e.phrase(6, m, 0, 'accord_brut', m % 2 ? [[0, 45, 3], [8, 50, 3], [11, 51, 3], [14, 50, 2]] : [[0, 45, 3]], 44);
    for (let m = 0; m < 4; m++) e.note(6, m * 16, 2, 'foule', 45, 40);
    // 7 : accords et basse à l'unisson.
    for (let m = 0; m < 4; m++) e.phrase(7, m, 0, 'accord_brut', m % 2 ? riffB : riffA, 44, 12);
    [45, 45, 48, 45].forEach((h, m) => e.note(7, m * 16, 2, 'foule', h, 42));
    // 8 : la montée. Le riff grimpe : do, do, ré, mi♭ ; l'alerte hurle.
    [3, 3, 5, 6].forEach((t, m) => { e.phrase(8, m, 1, 'basse_brute', riffA, 56, t); e.phrase(8, m, 0, 'accord_brut', riffA, 44 + m, 12 + t); });
    e.note(8, 0, 2, 'alerte', 72, 34); e.note(8, 32, 2, 'alerte', 74, 42);
    // 9 : la charge. Les fûts seuls et la foule qui enfle ; puis la basse en croches, qui grimpe.
    e.ligne(9, 2, 'foule', [[0, 45, 16, 20], [16, 45, 16, 30], [32, 48, 16, 38], [48, 48, 14, 44]]);
    e.nuance(9, 2, 1, 15, 20, 30); e.nuance(9, 2, 17, 31, 30, 40);
    for (let r = 32; r < 48; r += 2) e.note(9, r, 1, 'basse_brute', 33, 38 + (r - 32));
    [33, 33, 34, 34, 36, 36, 38, 38].forEach((h, k) => e.note(9, 48 + 2 * k, 1, 'basse_brute', h, 52 + k));
    e.note(9, 32, 0, 'accord_brut', 45, 44); e.note(9, 48, 0, 'accord_brut', 45, 46); e.note(9, 56, 0, 'accord_brut', 48, 48);
    // 10 : le riff serré, les accords à l'unisson, l'alerte.
    for (let m = 0; m < 4; m++) { e.phrase(10, m, 1, 'basse_brute', serre(m % 2 ? riffB : riffA), 56); e.phrase(10, m, 0, 'accord_brut', m % 2 ? riffB : riffA, 46, 12); }
    e.note(10, 0, 2, 'alerte', 69, 36); e.note(10, 32, 2, 'alerte', 72, 40);
    // 11 : les arrêts. Trois coups, le vide ; puis la basse remonte par demi-tons jusqu'à la dominante.
    for (let m = 0; m < 3; m++) for (const [canal, nom, t] of [[1, 'basse_brute', 0], [0, 'accord_brut', 12]]) {
      e.phrase(11, m, canal, nom, [[0, 33, 2], [3, 33, 2], [6, 36, 2]], canal ? 58 : 48, t); e.coupe(11, m * 16 + 8, canal);
    }
    for (let k = 0; k < 16; k++) e.note(11, 48 + k, 1, 'basse_brute', 33 + (k >> 1), 46 + k);
    e.note(11, 48, 0, 'accord_brut', 45, 46); e.note(11, 56, 0, 'accord_brut', 49, 50);
    e.ligne(11, 2, 'foule', [[48, 52, 14, 30]]); e.nuance(11, 2, 49, 61, 30, 48);
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 4, 5], tendu: [6, 7, 8, 9, 10, 11] };
  }

  /** « Le Bastion » : do mineur, 88 BPM. Le thème grave du trombone passe par le second degré abaissé et la sensible
   *  (do – do – mi♭ | ré♭ – do – si | do – mi♭ – fa – sol | la♭ – sol), sur des quintes à vide de cuivres graves et un
   *  tuba qui tient do. Calme : la veille, le glas, le chœur. Tendu : la marche (un rythme, tout le monde dessus),
   *  l'appel du cor, le mur. Pistes : 1 le chant, 2 le tuba, 3 la muraille de cuivres et le chœur, 4 la batterie. */
  function composerBastion() {
    const e = ecrivain('bastion', 12);
    const themeA = [[0, 48, 6], [6, 48, 2], [8, 51, 8], [16, 49, 6], [22, 48, 2], [24, 47, 8], [32, 48, 6], [38, 51, 2], [40, 53, 4], [44, 55, 4], [48, 56, 8], [56, 55, 8]];
    const themeB = [[0, 55, 6], [6, 55, 2], [8, 56, 8], [16, 55, 6], [22, 53, 2], [24, 51, 8], [32, 53, 4], [36, 51, 4], [40, 50, 4], [44, 47, 4], [48, 48, 12]];
    const appel = [[0, 67, 3], [3, 67, 1], [4, 68, 4], [8, 67, 8], [16, 72, 3], [19, 72, 1], [20, 73, 4], [24, 72, 8], [32, 75, 4], [36, 74, 4], [40, 72, 4], [44, 71, 4], [48, 72, 12]];
    // Fondamentales des quintes par demi-mesure.
    const grilleA = [48, 48, 49, 43, 48, 41, 44, 43], grilleB = [48, 44, 48, 51, 41, 43, 48, 48], grilleAppel = [48, 48, 48, 48, 48, 43, 48, 48], mur = [48, 48, 48, 48, 49, 49, 48, 43];
    // Le rythme de la marche, par demi-mesure : [pas, durée, accent].
    const MARCHE = [[[0, 3, 1], [4, 2, 0], [6, 1, 0], [7, 1, 0]], [[0, 3, 1], [4, 3, 0]]];
    function marche(p, grille, vol) {
      for (let d = 0; d < 8; d++) for (const [pas, duree, accent] of MARCHE[d % 2]) {
        const r = d * 8 + pas;
        e.note(p, r, 2, 'muraille', grille[d], accent ? vol : vol - 10); e.coupe(p, r + duree, 2);
        e.note(p, r, 1, 'tuba', grille[d] - 12, accent ? vol + 4 : vol - 8); e.coupe(p, r + duree, 1);
      }
    }
    /** Accords tenus : une quinte à chaque mesure et à chaque changement de fondamentale (vol nul : pas de quintes) ;
     *  le tuba une octave dessous. */
    function tenues(p, grille, vol, volTuba) {
      for (let d = 0; d < 8; d++) {
        const change = !d || grille[d] !== grille[d - 1];
        if (vol && (change || d % 2 === 0)) e.note(p, d * 8, 2, 'muraille', grille[d], vol);
        if (change) e.note(p, d * 8, 1, 'tuba', grille[d] - 12, volTuba);
      }
    }
    const kits = [[0, 0, 0, 1], [0, 1, 0, 1], [1, 1, 2, 1], [1, 2, 1, 3], [1, 2, 1, 2], [2, 2, 2, 3], [6, 4, 5, 4], [4, 5, 4, 7], [4, 5, 5, 7], [6, 4, 4, 5], [4, 5, 4, 5], [4, 5, 4, 7]];
    for (let p = 0; p < 12; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    // Section calme. 0, la veille : le glas, le tuba, deux accords qui enflent, do puis ré♭.
    e.note(0, 0, 0, 'glas', 48, 44); e.note(0, 32, 0, 'glas', 48, 34);
    e.note(0, 0, 1, 'tuba', 36, 40); e.note(0, 32, 1, 'tuba', 36, 40);
    e.ligne(0, 2, 'muraille', [[16, 48, 15, 12], [48, 49, 14, 12]]);
    for (const r of [16, 48]) { e.nuance(0, 2, r + 1, r + 8, 12, 26); e.nuance(0, 2, r + 9, r + 13, 26, 14); }
    // 1 et 2, le thème et sa réponse, à mi-voix.
    for (const [p, theme, grille] of [[1, themeA, grilleA], [2, themeB, grilleB]]) { e.ligne(p, 0, 'trombone', theme, 40); tenues(p, grille, 24, 38); }
    // 3, le chœur : do, do, ré♭, do ; le glas.
    e.note(3, 0, 0, 'glas', 48, 42); e.note(3, 32, 0, 'glas', 48, 36);
    e.ligne(3, 2, 'choeur_grave', [[0, 48, 16], [16, 48, 16], [32, 49, 16], [48, 48, 14]], 36);
    [36, 36, 37, 36].forEach((h, m) => e.note(3, m * 16, 1, 'tuba', h, 38));
    // 4, le thème sur la quinte tenue du chœur.
    e.ligne(4, 0, 'trombone', themeA, 42);
    e.ligne(4, 2, 'choeur_grave', [[0, 43, 16], [16, 43, 16], [32, 43, 16], [48, 43, 14]], 30);
    tenues(4, grilleA, 0, 38);
    // 5, l'attente : les quintes enflent une à une, le cor appelle de loin.
    [48, 49, 48, 43].forEach((h, m) => { e.note(5, m * 16, 2, 'muraille', h, 14); e.nuance(5, 2, m * 16 + 1, m * 16 + 12, 14, 30 + 2 * m); e.note(5, m * 16, 1, 'tuba', h - 12, 38); });
    e.coupe(5, 62, 2); e.coupe(5, 62, 1);
    e.ligne(5, 0, 'cor', [[32, 67, 3], [35, 67, 1], [36, 68, 4], [40, 67, 8]], 24);
    // Section tendue. 6 et 7 : la marche, le thème au trombone ; 10 et 11 : au cor, une octave plus haut.
    for (const [p, theme, grille, nom, t] of [[6, themeA, grilleA, 'trombone', 0], [7, themeB, grilleB, 'trombone', 0], [10, themeA, grilleA, 'cor', 12], [11, themeB, grilleB, 'cor', 12]]) {
      e.ligne(p, 0, nom, theme, 56, t);
      marche(p, grille, 50);
    }
    // 8, l'appel du cor : sol – sol – la♭ – sol, puis do – do – ré♭ – do, et la descente par la sensible.
    e.ligne(8, 0, 'cor', appel, 52);
    marche(8, grilleAppel, 50);
    // 9, le mur : tout le monde sur le rythme, le chœur par-dessus (do, do, ré♭, si).
    marche(9, mur, 54);
    e.ligne(9, 0, 'choeur_grave', [[0, 48, 16], [16, 48, 16], [32, 49, 16], [48, 47, 14]], 52);
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 4, 5], tendu: [6, 7, 8, 9, 10, 11] };
  }

  /** « La Préfecture » : mi phrygien, 124 BPM. Une pulsation de basse qui ne s'arrête pas, croches au calme, doubles
   *  quand ça se tend ; une nappe froide (mi, si, fa) ; des notes de verre qui tombent d'un demi-ton ; des sirènes qui
   *  glissent d'un triton (si – fa) ; l'alarme. Tendu : arpèges serrés, frappes en tresillo, la grille mi – fa – sol –
   *  fa, la rupture. Pistes : 1 les sirènes, le verre, l'alarme, les frappes, 2 la basse, 3 la nappe et l'arpège,
   *  4 la batterie. */
  function composerPrefecture() {
    const e = ecrivain('prefecture', 12);
    const RAC = { E: 28, F: 29, G: 31 }, ARP = { E: [64, 67, 71, 76], F: [65, 69, 72, 77], G: [67, 71, 74, 79] }, FRA = { E: 52, F: 53, G: 55 };
    const croches = (p, m, a, vol) => e.phrase(p, m, 1, 'pulsation', HUIT.map(pas => [pas, RAC[a], 2, pas % 8 ? vol : vol + 6]));
    const doubles = (p, m, a, vol) => e.phrase(p, m, 1, 'pulsation', SEIZE.map(pas => [pas, pas === 14 ? RAC[a] + 12 : RAC[a], 1, pas % 4 ? vol - 12 : vol]));
    const arpege = (p, m, a, pas, vol) => e.phrase(p, m, 2, 'arpege', Array.from({ length: 16 / pas }, (_, k) => [k * pas, ARP[a][[0, 1, 2, 3, 2, 1, 0, 1][k % 8]], pas]), vol);
    const tresillo = (p, m, a, vol) => { for (const pas of [0, 3, 6, 11, 14]) e.note(p, m * 16 + pas, 0, 'frappe', FRA[a], vol); };
    const alarme = (p, m, vol) => e.phrase(p, m, 0, 'bip', HUIT.map(pas => [pas, pas % 4 ? 77 : 71, 1]), vol);
    const kits = [[0, 0, 1, 0], [0, 1, 0, 1], [1, 2, 1, 2], [2, 2, 2, 3], [0, 0, 1, 2], [2, 2, 2, 3], [4, 4, 5, 4], [4, 5, 4, 7], [4, 5, 5, 7], [6, -1, 3, 7], [4, 5, 4, 5], [4, 5, 5, 7]];
    for (let p = 0; p < 12; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    const gouttes = (p, vol) => { e.phrase(p, 0, 0, 'verre', [[8, 77, 4], [12, 76, 4]], vol); e.phrase(p, 2, 0, 'verre', [[8, 84, 4], [12, 83, 4]], vol - 4); };
    // Section calme. 0 : la pulsation, la nappe, le verre.
    for (let m = 0; m < 4; m++) { croches(0, m, 'E', 32); e.note(0, m * 16, 2, 'nappe', 64, 30); }
    gouttes(0, 26);
    // 1 : les sirènes, loin.
    for (let m = 0; m < 4; m++) { croches(1, m, 'E', 34); e.note(1, m * 16, 2, 'nappe', 64, 30); }
    e.note(1, 16, 0, 'sirene', 65, 18); e.note(1, 48, 0, 'sirene', 71, 22);
    // 2 : l'arpège à mi-voix, mi – mi – fa – mi.
    ['E', 'E', 'F', 'E'].forEach((a, m) => { croches(2, m, a, 34); arpege(2, m, a, 2, 26); });
    gouttes(2, 24);
    // 3 : la basse passe par fa ; la sirène glisse dessus.
    ['E', 'E', 'F', 'E'].forEach((a, m) => { croches(3, m, a, 36); if (a === 'E') e.note(3, m * 16, 2, 'nappe', 64, 30); });
    e.note(3, 32, 0, 'sirene', 65, 26);
    // 4 : l'attente. La pulsation se tait deux mesures ; restent la nappe, le verre, les tics.
    for (let m = 0; m < 4; m++) { e.note(4, m * 16, 2, 'nappe', 64, 32); if (m > 1) croches(4, m, 'E', 30 + 4 * (m - 2)); }
    gouttes(4, 26);
    // 5 : la montée. Les croches deviennent des doubles, l'alarme s'approche.
    ['E', 'E', 'F', 'E'].forEach((a, m) => { if (m < 2) croches(5, m, a, 36); else doubles(5, m, a, 40 + 6 * (m - 2)); arpege(5, m, a, 2, 26 + 2 * m); });
    alarme(5, 3, 20); e.coupe(5, 62, 0);
    // Section tendue. 6 : la machine. Doubles-croches, arpège serré, frappes en tresillo.
    for (let m = 0; m < 4; m++) { doubles(6, m, 'E', 54); arpege(6, m, m === 3 ? 'F' : 'E', 1, 34); tresillo(6, m, m === 3 ? 'F' : 'E', 40); }
    // 7 : les sirènes, si – fa, l'une après l'autre.
    for (let m = 0; m < 4; m++) { doubles(7, m, 'E', 54); arpege(7, m, m % 2 ? 'F' : 'E', 1, 34); e.note(7, m * 16, 0, 'sirene', [71, 65, 71, 77][m], 40); }
    // 8 et 11 : la grille mi – fa – sol – fa ; à la fin, l'alarme.
    for (const p of [8, 11]) ['E', 'F', 'G', 'F'].forEach((a, m) => { doubles(p, m, a, 54); arpege(p, m, a, 1, 36); if (p === 8 || m < 2) tresillo(p, m, a, 42); else alarme(p, m, 30); });
    // 9 : la rupture. La chute, le vide, l'alarme seule, les sirènes ; la basse revient avec la batterie.
    e.note(9, 0, 1, 'pulsation', 28, 56); e.note(9, 16, 1, 'pulsation', 28, 44);
    for (let m = 2; m < 4; m++) doubles(9, m, 'E', 46 + 8 * (m - 2));
    for (let m = 0; m < 4; m++) alarme(9, m, 24 + 4 * m);
    e.note(9, 0, 2, 'sirene', 71, 40); e.note(9, 16, 2, 'sirene', 77, 44); e.note(9, 32, 2, 'sirene', 71, 46); e.note(9, 48, 2, 'sirene', 77, 50);
    // 10 : la machine et les sirènes ensemble, la basse à l'octave sur les contretemps.
    for (let m = 0; m < 4; m++) {
      e.phrase(10, m, 1, 'pulsation', SEIZE.map(pas => [pas, pas % 4 === 2 ? 40 : 28, 1, pas % 4 ? 44 : 56]));
      arpege(10, m, m % 2 ? 'F' : 'E', 1, 36);
      e.note(10, m * 16, 0, 'sirene', [71, 77, 71, 65][m], 42);
    }
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 4, 5], tendu: [6, 7, 8, 9, 10, 11] };
  }
  const COMPOSITIONS = { titre: composerTitre, convergence: composerConvergence, bastion: composerBastion, prefecture: composerPrefecture };

  // ---- Banque d'échantillons, MOD, préparation. ----
  const banque = new Map(), mesures = new Map(), modules = new Map();
  /** { nom, volume, pcm (Int8Array), donnees (Float32Array, avant quantification) } d'un instrument. */
  function instrument(nom) {
    let s = banque.get(nom);
    if (!s) {
      // Les mêmes données servent au module (PCM 8 bits) et aux ambiances (flottants sans continu, crête 0,86).
      const def = INSTRUMENTS[nom], donnees = def.faire(), crete = sansContinu(donnees) || 1, flottants = new Float32Array(donnees.length);
      for (let i = 0; i < donnees.length; i++) flottants[i] = donnees[i] * 0.86 / crete;
      s = { nom: 'PDR ' + def.nom, volume: def.volume, pcm: versPcm(donnees, 0.86 * 127 / crete), donnees: flottants, taux: TAUX };
      banque.set(nom, s);
    }
    return s;
  }
  /** Les mesures de batterie d'un morceau. Chacune remplit ses 8 bits ; son volume d'échantillon porte sa nuance, celle
   *  de la partition : la plus forte à 56, les autres en proportion. */
  function batterieDe(cle) {
    let s = mesures.get(cle);
    if (!s) {
      const brutes = KITS[cle].map((_, v) => mesureBatterie(cle, v)), cretes = brutes.map(d => sansContinu(d) || 1), plusForte = max(...cretes);
      s = brutes.map((d, v) => ({ nom: 'PDR KIT ' + cle.toUpperCase().slice(0, 9) + ' ' + String.fromCharCode(65 + v), volume: borner(round(56 * cretes[v] / plusForte), 4, 64),
        pcm: versPcm(d, 0.9 * 127 / cretes[v]) }));
      mesures.set(cle, s);
    }
    return s;
  }
  function serialiser(titre, motifs, ordre, echantillons) {
    const taille = 1084 + motifs.length * 1024 + echantillons.reduce((n, s) => n + s.pcm.length, 0), octets = new Uint8Array(taille);
    const mot = (at, v) => { octets[at] = v >> 8; octets[at + 1] = v & 255; };
    const texte = (at, s, n) => { for (let i = 0; i < min(n, s.length); i++) octets[at + i] = s.charCodeAt(i) & 127; };
    texte(0, titre, 20);
    for (let i = 0; i < 31; i++) {
      const at = 20 + i * 30, s = echantillons[i];
      if (s) { texte(at, s.nom, 22); mot(at + 22, s.pcm.length / 2); octets[at + 25] = s.volume; }
      else if (i === 29) texte(at, '#MUSIQUE ORIGINALE', 22); else if (i === 30) texte(at, '#PCM CALCULE PAR CODE', 22);
      mot(at + 28, 1);
    }
    octets[950] = ordre.length; octets[951] = 127; octets.set(ordre, 952); texte(1080, 'M.K.', 4);
    let at = 1084;
    for (const m of motifs) { octets.set(m, at); at += m.length; }
    for (const s of echantillons) { octets.set(new Uint8Array(s.pcm.buffer, s.pcm.byteOffset, s.pcm.length), at); at += s.pcm.length; }
    return octets;
  }
  /** Relit un MOD (FERRO, decode) ; vitesse et tempo sont ceux de la première rangée jouée. */
  function decoder(octets) {
    const ordre = Array.from(octets.subarray(952, 952 + octets[950])), nbMotifs = max(...ordre) + 1, echantillons = [];
    let at = 1084 + nbMotifs * 1024, vitesse = 6, bpm = 125;
    for (let i = 0; i < 31; i++) {
      const h = 20 + i * 30, longueur = ((octets[h + 22] << 8) | octets[h + 23]) * 2;
      echantillons.push({ pcm: new Int8Array(octets.buffer, octets.byteOffset + at, longueur), volume: octets[h + 25] });
      at += longueur;
    }
    for (let c = 0; c < 4; c++) {
      const o = 1084 + ordre[0] * 1024 + c * 4, param = octets[o + 3];
      if ((octets[o + 2] & 15) === 15 && param) { if (param < 32) vitesse = param; else bpm = param; }
    }
    return { octets, ordre, echantillons, bpm, vitesse };
  }
  function moduleDe(cle) {
    cle = cleDe(cle);
    let m = modules.get(cle);
    if (m) return m;
    const def = MORCEAUX[cle], partition = COMPOSITIONS[cle]();
    // Vitesse et tempo à chaque motif, sur le canal de la batterie, qui ne porte jamais de volume : le tempo dès la
    // première rangée, pour tout lecteur ; la vitesse 6, celle d'origine, à la deuxième mesure.
    for (const motif of partition.motifs) {
      motif[14] = (motif[14] & 240) | 15; motif[15] = def.bpm;
      motif[16 * 16 + 14] = (motif[16 * 16 + 14] & 240) | 15; motif[16 * 16 + 15] = 6;
    }
    const echantillons = def.instruments.map(instrument).concat(batterieDe(cle));
    const ordre = partition.calme.concat(partition.tendu);
    m = { ...decoder(serialiser(def.moduleTitre, partition.motifs, ordre, echantillons)), cle, segment: partition.calme.length };
    modules.set(cle, m);
    return m;
  }
  const module = cle => moduleDe(cle).octets.slice();
  function morceau(cle) {
    cle = cleDe(cle);
    const d = MORCEAUX[cle], m = modules.get(cle);
    return { cle, titre: d.titre, style: d.style, bpm: d.bpm, tonique: d.tonique, mode: d.mode, duree: (m ? m.ordre.length : 12) * 960 / d.bpm, canaux: 4,
      octets: m ? m.octets.length : 0 };
  }
  /** Un instrument ou un coup de batterie en flottants, pour les ambiances du jeu (audio.js). */
  function son(nom) { const s = instrument(nom); return { donnees: s.donnees, taux: s.taux }; }
  function frappe(sorte) { return { donnees: donneesFrappe(sorte), taux: TAUX_BATTERIE }; }

  let chaine = Promise.resolve();
  const enCours = new Map();
  /** Calcule les échantillons des morceaux demandés, un instrument ou une batterie par tâche, en rendant la main entre
   *  deux tâches : l'écran de chargement peut se peindre. N'ouvre aucun périphérique audio. surProgres(0..1). */
  function prechauffer(cles, surProgres) {
    const liste = (cles === undefined ? CLES : Array.isArray(cles) ? cles : [cles]).map(cleDe), cle = liste.join('+');
    if (liste.every(c => modules.has(c))) { if (surProgres) surProgres(1); return Promise.resolve(liste.map(morceau)); }
    if (enCours.has(cle)) return enCours.get(cle);
    const pause = () => new Promise(fin => (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout(fin, 0) : fin()));
    const taches = [];
    for (const c of liste) {
      for (const nom of MORCEAUX[c].instruments) if (!banque.has(nom) && !taches.some(t => t.nom === nom)) taches.push({ nom, faire: () => instrument(nom) });
      if (!mesures.has(c)) taches.push({ nom: 'kit ' + c, faire: () => batterieDe(c) });
      taches.push({ nom: 'mod ' + c, faire: () => moduleDe(c) });
    }
    const tache = chaine.then(async () => {
      for (let k = 0; k < taches.length; k++) { await pause(); taches[k].faire(); if (surProgres) surProgres((k + 1) / taches.length); }
      return liste.map(morceau);
    });
    enCours.set(cle, tache);
    chaine = tache.catch(() => {});
    tache.then(() => enCours.delete(cle), () => enCours.delete(cle));
    return tache;
  }

  // ---- Lecteur : programmation anticipée des rangées sur l'horloge audio (FERRO, create). ----
  function creer(ctx, sortie) {
    let cle = 'titre', intensite = 0, volume = 0.45, joue = false, libere = false, mod = null, position = 0, rangee = 0;
    let prochain = null, bpm = 125, vitesse = 6, rappel = null;
    const voix = new Set(), tampons = new Map(), noeuds = [], pistes = [];
    const stats = { voixActives: 0, picVoix: 0, rangees: 0, notes: 0, resynchronisations: 0, joue: false, morceau: cle,
      position: 0, rangee: 0, tempo: 0, section: 'calme', passagesTendus: 0, passagesCalmes: 0 };
    const pret = !!(ctx && sortie && ctx.createBuffer && ctx.createBufferSource && ctx.createGain);
    // Un rendu hors ligne (OfflineAudioContext, essais) se programme pendant ses suspensions : il compte comme lancé.
    const horsLigne = !!(ctx && typeof ctx.startRendering === 'function');
    const garder = n => (noeuds.push(n), n);
    const maitre = pret ? garder(ctx.createGain()) : null;
    // Un évènement réutilisé par canal : la lecture d'une rangée n'alloue rien.
    const lus = [0, 1, 2, 3].map(() => ({ echantillon: 0, periode: 0, effet: 0, param: 0 }));
    if (maitre) {
      maitre.gain.value = 0; maitre.connect(sortie);
      for (let i = 0; i < 4; i++) {
        const gain = garder(ctx.createGain()), pan = garder(ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain());
        if (pan.pan) pan.pan.value = [-0.3, -0.05, 0.3, 0.06][i];
        gain.connect(pan); pan.connect(maitre);
        pistes.push({ gain, voix: null, echantillon: 0, periode: 428, volume: 64 });
      }
    }
    function nettoyer(v) {
      if (!voix.delete(v)) return;
      try { v.source.disconnect(); } catch (_) { /* déjà détaché */ }
      try { v.gain.disconnect(); } catch (_) { /* déjà détaché */ }
      if (pistes[v.piste] && pistes[v.piste].voix === v) pistes[v.piste].voix = null;
      stats.voixActives = voix.size;
    }
    function toutArreter(immediat = false) {
      if (!pret) return;
      const maintenant = ctx.currentTime;
      for (const v of voix) {
        try { v.gain.gain.cancelScheduledValues(maintenant); v.gain.gain.setTargetAtTime(0.0001, maintenant, 0.003); v.source.stop(maintenant + (immediat ? 0 : 0.015)); } catch (_) { /* source déjà arrêtée */ }
        v.fin = maintenant + (immediat ? 0 : 0.015);
        if (immediat) nettoyer(v);
      }
      for (const p of pistes) { p.voix = null; p.echantillon = 0; p.volume = 64; }
    }
    function melanger() {
      if (!pret || libere) return;
      const maintenant = ctx.currentTime, I = intensite;
      const gains = [0.86 + 0.1 * I, 0.9 + 0.06 * I, 0.55 + 0.25 * I, 0.86 + 0.14 * I];
      for (let i = 0; i < 4; i++) pistes[i].gain.gain.setTargetAtTime(gains[i], maintenant, 0.08);
    }
    function niveau() {
      if (!maitre || libere) return;
      const maintenant = ctx.currentTime;
      maitre.gain.cancelScheduledValues(maintenant);
      maitre.gain.setTargetAtTime(joue ? volume : 0, maintenant, 0.012);
    }
    function charger() {
      if (mod) return;
      mod = moduleDe(cle); bpm = mod.bpm; vitesse = mod.vitesse; stats.tempo = bpm;
    }
    function tampon(echantillon, quelle = cle) {
      const cleTampon = quelle + ':' + echantillon;
      let b = tampons.get(cleTampon);
      if (b) return b;
      const donnees = (quelle === cle && mod ? mod : moduleDe(quelle)).echantillons[echantillon - 1].pcm;
      b = ctx.createBuffer(1, donnees.length, TAUX);
      const canal = b.getChannelData(0);
      for (let i = 0; i < donnees.length; i++) canal[i] = donnees[i] / 128;
      tampons.set(cleTampon, b);
      return b;
    }
    function jouerNote(piste, echantillon, periode, temps) {
      const p = pistes[piste], ins = mod.echantillons[echantillon - 1];
      if (!ins || ins.pcm.length < 4) return;
      if (p.voix && p.voix.fin > temps) {
        const ancienne = p.voix;
        ancienne.gain.gain.setTargetAtTime(0.0001, temps, 0.0015);
        try { ancienne.source.stop(temps + 0.008); } catch (_) { /* déjà arrêtée */ }
        ancienne.fin = temps + 0.008;
      }
      if (voix.size >= VOIX_MAX) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain(), b = tampon(echantillon), vitesseLecture = 428 / periode;
      const fin = temps + b.duration / vitesseLecture;
      source.buffer = b; source.playbackRate.setValueAtTime(vitesseLecture, temps);
      gain.gain.setValueAtTime(0, temps); gain.gain.linearRampToValueAtTime(p.volume / 64, temps + 0.0015);
      source.connect(gain); gain.connect(p.gain);
      const v = { source, gain, piste, fin };
      voix.add(v); p.voix = v;
      source.onended = () => nettoyer(v);
      source.start(temps); source.stop(fin + 0.001);
      stats.notes++; stats.voixActives = voix.size; stats.picVoix = max(stats.picVoix, voix.size);
    }
    /** Motif suivant : dans la section en cours, ou dans l'autre si l'intensité le demande. */
    function suivante(pos) {
      const L = mod.segment, n = mod.ordre.length;
      if (!L || n !== 2 * L) return (pos + 1) % n;
      const tendu = pos >= L, k = (pos % L + 1) % L;
      if (!tendu && intensite >= 0.55) { stats.passagesTendus++; return L + k; }
      if (tendu && intensite <= 0.3) { stats.passagesCalmes++; return k; }
      return (tendu ? L : 0) + k;
    }
    function programmer(temps) {
      const o = mod.octets, base = 1084 + (mod.ordre[position] * 64 + rangee) * 16;
      for (let c = 0; c < 4; c++) {
        const at = base + c * 4, a = o[at], b = o[at + 1], cc = o[at + 2], e = lus[c];
        e.echantillon = (a & 240) | (cc >> 4); e.periode = ((a & 15) << 8) | b; e.effet = cc & 15; e.param = o[at + 3];
        if (e.effet === 15 && e.param) { if (e.param < 32) vitesse = e.param; else bpm = e.param; }
      }
      for (let c = 0; c < 4; c++) {
        const e = lus[c], p = pistes[c];
        if (e.echantillon) { p.echantillon = e.echantillon; p.volume = mod.echantillons[e.echantillon - 1].volume; }
        if (e.effet === 12) p.volume = min(64, e.param);
        if (e.periode) { p.periode = e.periode; jouerNote(c, p.echantillon, e.periode, temps); }
        else if (e.effet === 12 && p.voix) {
          p.voix.gain.gain.setTargetAtTime(p.volume / 64, temps, 0.002);
          // Un silence (C00) arrête la note : la voix rend sa place au budget.
          if (!p.volume && p.voix.fin > temps + 0.03) { try { p.voix.source.stop(temps + 0.03); } catch (_) { /* déjà arrêtée */ } p.voix.fin = temps + 0.03; }
        }
      }
      stats.position = position; stats.rangee = rangee; stats.tempo = bpm; stats.rangees++;
      stats.section = mod.segment && position >= mod.segment ? 'tendue' : 'calme';
      const duree = 2.5 * vitesse / bpm;
      if (rappel) rappel(temps, rangee, duree);
      rangee++;
      if (rangee === 64) { rangee = 0; position = suivante(position); }
      return duree;
    }
    function tick() {
      if (!pret || libere || !joue || volume <= 0 || (ctx.state !== 'running' && !horsLigne)) return;
      charger();
      const maintenant = ctx.currentTime;
      for (const v of voix) if (v.fin < maintenant - 0.02) nettoyer(v);
      if (prochain === null || prochain < maintenant - 0.2) {
        if (prochain !== null) { toutArreter(); rangee = floor(rangee / 16) * 16; stats.resynchronisations++; }
        prochain = maintenant + 0.035;
      }
      let compte = 0;
      while (prochain < maintenant + 0.28 && compte++ < 6) prochain += programmer(max(maintenant + 0.002, prochain));
    }
    melanger();
    return {
      /** Change de morceau : il repart de son début, au prochain tick. */
      choisir(valeur) {
        const suivant = cleDe(valeur);
        if (libere || suivant === cle) return;
        toutArreter(); cle = suivant; stats.morceau = cle; mod = null; position = rangee = 0; prochain = null;
      },
      intensite(valeur) {
        const v = borner(Number(valeur) || 0, 0, 1);
        if (libere || abs(v - intensite) < 0.01) return;
        intensite = v; melanger();
      },
      volume(valeur) {
        if (libere) return;
        const v = borner(Number(valeur) || 0, 0, 1);
        if (v === volume) return;
        volume = v;
        if (!volume) { toutArreter(); prochain = null; rangee = floor(rangee / 16) * 16; }
        niveau();
      },
      jouer(valeur) {
        if (libere || joue === !!valeur) return;
        joue = !!valeur; stats.joue = joue;
        if (!joue) { toutArreter(); rangee = floor(rangee / 16) * 16; }
        prochain = null; niveau();
      },
      /** Prépare les AudioBuffers d'un morceau sans en changer ni démarrer aucun. */
      preparer(valeur = cle) {
        if (!pret || libere) return false;
        const quelle = cleDe(valeur), m = moduleDe(quelle);
        for (let i = 0; i < m.echantillons.length; i++) if (m.echantillons[i].pcm.length > 2) tampon(i + 1, quelle);
        return true;
      },
      /** f(temps, rangee, duree) à chaque rangée programmée : l'heure audio de la rangée, son rang (0..63), sa durée. Le
       *  jeu y cale sa rue sur la mesure. */
      rythme(f) { rappel = typeof f === 'function' ? f : null; },
      tick, stats,
      liberer() {
        if (libere) return;
        toutArreter(true); libere = true; joue = false; stats.joue = false; tampons.clear(); rappel = null;
        for (const n of noeuds) try { n.disconnect(); } catch (_) { /* déjà détaché */ }
        noeuds.length = 0;
      },
    };
  }

  PDR.musique = Object.freeze({ CLES, TAUX, TAUX_BATTERIE, PERIODES: Object.freeze(PERIODES.slice()), creer, module, morceau,
    prechauffer, son, frappe, instruments: Object.freeze(Object.keys(INSTRUMENTS)) });
})(globalThis.PDR = globalThis.PDR || {});
