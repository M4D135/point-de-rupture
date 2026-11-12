/* Point de rupture — musique ProTracker « M.K. » à quatre canaux ; instruments, batterie et morceaux calculés.
   Porté de FERRO (src/music.js, branche campagne-18-mondes, commit 4ce2271, voir PROVENANCE-SON.md). On garde de
   FERRO l'écriture et la lecture du MOD : en-tête de 31 échantillons, motifs de 64 rangées, périodes de l'Amiga,
   effets C (volume) et F (vitesse, tempo), PCM signé sur 8 bits ; le lecteur programme les rangées d'avance sur
   l'horloge audio, borne ses voix et se recale sur une mesure après un retard ; la préparation se fait par tranches
   pour l'écran de chargement. Le reste est propre au jeu : cuivres, chœurs de foule, sifflet, basse pincée, synthés,
   sirène, batucada, tambours martiaux, batterie électronique et quatre morceaux originaux. Aucun enregistrement,
   aucun module ni banque d'instruments importés. Format : aes.id.au/modformat.html.

   Chaque morceau a une section calme et une section tendue de même longueur, à la suite dans la liste d'ordre. Le
   lecteur passe de l'une à l'autre à la fin d'un motif selon l'intensité (au-dessus de 0,55, sous 0,3) ; un lecteur
   de MOD ordinaire joue les deux à la suite. Ni window ni document : le fichier se charge aussi dans Node.

   PDR.musique = {
     CLES : ['titre', 'convergence', 'bastion', 'prefecture'],
     creer(ctx, sortie) → lecteur { choisir(cle), intensite(0..1), volume(0..1), jouer(bool), preparer(cle) → bool,
                                    rythme(f(temps, rangee, duree)), tick(), liberer(), stats },
     module(cle) → Uint8Array : le MOD complet, copie neuve à chaque appel (export),
     morceau(cle) → { cle, titre, style, bpm, duree (s), canaux, octets },
     prechauffer(cles?, surProgres?) → Promise : calcule les échantillons par tranches, sans ouvrir de périphérique,
     son(nom), frappe(sorte) → { donnees: Float32Array, taux } : un instrument ou un coup de batterie, pour les ambiances,
   } */
(function (PDR) {
  'use strict';

  const { sin, cos, tan, exp, tanh, floor, abs, min, max, round, ceil, sqrt, pow, imul, PI } = Math;
  const HORLOGE = 7093789.2, TAUX = HORLOGE / 856, TAUX_BATTERIE = 2 * TAUX, TAU = 2 * PI, VOIX_MAX = 28;
  // Périodes de l'Amiga du do-1 (856) au si-3 (113), rangs MOD 36 à 71. Au rang 48 (période 428), un échantillon sonne
  // à sa hauteur de calcul ; les mesures de batterie, calculées au double du taux, se jouent au rang 60 (période 214).
  const PERIODES = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285,
    269, 254, 240, 226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113];
  const borner = (x, a, b) => (x < a ? a : x > b ? b : x);
  const hz = midi => 440 * pow(2, (midi - 69) / 12);
  const lisse = x => x * x * (3 - 2 * x);
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

  // ---- Outils de synthèse. ----
  /** Correction BLEP polynomiale d'une dent de scie (phase 0..1, pas dt) : évite le repliement à 8 kHz. */
  function blep(t, dt) {
    if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
    if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
    return 0;
  }
  /** Passe-bande biquadratique à gain de crête unité (formants, souffles). */
  function passeBande(f, q, taux) {
    const w = TAU * min(f, taux * 0.45) / taux, alpha = sin(w) / (2 * q), a0 = 1 + alpha;
    return { b0: alpha / a0, b2: -alpha / a0, a1: -2 * cos(w) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  }
  function filtrer(r, x) {
    const y = r.b0 * x + r.b2 * r.x2 - r.a1 * r.y1 - r.a2 * r.y2;
    r.x2 = r.x1; r.x1 = x; r.y2 = r.y1; r.y1 = y;
    return y;
  }
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

  // ---- Instruments mélodiques, calculés au taux de l'Amiga (8 287 Hz). ----
  /** Cuivre : harmoniques par récurrence de Tchebychev, dont l'éclat monte avec le souffle ; la note part un peu bas et
   *  se pose (la lèvre), vibrato retardé, souffle d'attaque, résonance du pavillon. accord : plusieurs notes (pupitre). */
  function cuivre(o) {
    const n = ceil(o.duree * TAUX), sortie = new Float32Array(n), hasard = alea(o.graine), accord = o.accord || [0];
    const voix = accord.map((demi, k) => ({ f: o.f0 * pow(2, demi / 12) * (1 + (k % 2 ? 0.0021 : -0.0013) * (k > 0)),
      phase: (hasard() + 1) * PI, retard: k * 0.007, vib: 5.1 + 0.6 * hasard() }));
    const pavillon = passeBande(o.cloche || 1300, 1.1, TAUX);
    let bas = 0;
    for (let i = 0; i < n; i++) {
      const t = i / TAUX;
      let somme = 0;
      for (let k = 0; k < voix.length; k++) {
        const v = voix[k], u = t - v.retard;
        if (u < 0) continue;
        const att = min(1, u / o.attaque), env = att * (1 + 0.22 * exp(-u * 9) * att) * exp(-u * o.amorti);
        const eclat = o.eclat * (0.3 + 0.7 * min(1, env)), q = exp(-(1.3 - 0.95 * eclat));
        const vib = 1 + (o.vibrato === undefined ? 0.0035 : o.vibrato) * min(1, max(0, u - 0.25) * 2.5) * sin(TAU * v.vib * u);
        const f = v.f * vib * (1 - 0.03 * exp(-u * 28));
        v.phase += TAU * f / TAUX;
        const H = max(1, min(16, floor(TAUX * 0.46 / f))), s1 = sin(v.phase), c2 = 2 * cos(v.phase);
        let sp = 0, sc = s1, poids = 1, x = 0;
        for (let h = 1; h <= H; h++) { x += sc * poids; const ss = c2 * sc - sp; sp = sc; sc = ss; poids *= q; }
        somme += x * env * (1 - q) / (1 - pow(q, H) + 1e-9);
      }
      bas += 0.3 * (hasard() - bas);
      const brut = somme / sqrt(accord.length) + bas * (o.souffle === undefined ? 0.06 : o.souffle) * exp(-t * 22);
      sortie[i] = tanh(1.5 * (brut + 0.6 * filtrer(pavillon, brut))) * min(1, (n - i) / (TAUX * 0.04));
    }
    return sortie;
  }
  // Formants des voyelles : [fréquence (Hz), largeur (Hz), gain] × 3.
  const VOYELLES = {
    o: [[450, 70, 1], [800, 80, 0.55], [2830, 120, 0.1]],
    ou: [[325, 60, 1], [700, 70, 0.32], [2530, 120, 0.06]],
    a: [[700, 90, 1], [1220, 100, 0.65], [2600, 130, 0.22]],
    e: [[400, 70, 1], [2000, 110, 0.42], [2550, 130, 0.28]],
    eu: [[400, 70, 1], [1600, 100, 0.45], [2400, 130, 0.18]],
  };
  /** Chœur de foule sans paroles : voix en dents de scie désaccordées, chacune avec son vibrato et son retard, une part à
   *  l'octave, un souffle, puis trois formants de la voyelle. contour(u) : inflexion de la hauteur (un cri qui monte). */
  function choeur(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), hasard = alea(o.graine);
    const voix = Array.from({ length: o.voix }, (_, k) => ({
      f: o.f0 * (k < (o.octave || 0) * o.voix ? 2 : 1) * pow(2, hasard() * (o.desaccord || 14) / 1200),
      phase: (hasard() + 1) / 2, retard: (hasard() + 1) / 2 * (o.etalement === undefined ? 0.035 : o.etalement),
      vib: 4.6 + 0.9 * hasard(), ph: hasard() * PI, poids: 0.75 + 0.25 * hasard() }));
    const formants = VOYELLES[o.voyelle].map(([f, largeur, g]) => ({ r: passeBande(f, f / largeur, taux), g }));
    let souffle = 0;
    for (let i = 0; i < n; i++) {
      const t = i / taux, contour = o.contour ? o.contour(t) : 1;
      let somme = 0;
      for (let k = 0; k < voix.length; k++) {
        const v = voix[k], u = t - v.retard;
        if (u < 0) continue;
        const env = min(1, u / o.attaque) * exp(-u * (o.amorti || 0.4));
        const dt = v.f * contour * (1 + 0.006 * sin(TAU * v.vib * u + v.ph) * min(1, u * 2)) / taux;
        v.phase += dt; if (v.phase >= 1) v.phase -= 1;
        somme += (2 * v.phase - 1 - blep(v.phase, dt)) * env * v.poids;
      }
      souffle += 0.5 * (hasard() - souffle);
      const excitation = somme / sqrt(o.voix) + souffle * (o.souffle || 0.08) * min(1, t / o.attaque) * exp(-t * (o.amorti || 0.4));
      let y = 0;
      for (let k = 0; k < formants.length; k++) y += filtrer(formants[k].r, excitation) * formants[k].g;
      sortie[i] = y * min(1, (n - i) / (taux * 0.05));
    }
    return sortie;
  }
  /** Sifflet à bille : une sinusoïde que la bille module ~31 fois par seconde, et le souffle autour d'elle. */
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
  /** Basse pincée (Karplus-Strong) : un bruit adouci recircule dans une ligne d'un tour de corde, moyenné à chaque passage. */
  function corde(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), hasard = alea(o.graine);
    const N = max(2, round(taux / o.f0 - 0.5)), ligne = new Float32Array(N);
    let bas = 0, moyenne = 0;
    for (let i = 0; i < N; i++) { bas += 0.4 * (hasard() - bas); ligne[i] = bas; moyenne += bas / N; }
    for (let i = 0; i < N; i++) ligne[i] -= moyenne;
    let pos = 0, corps = 0, phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / taux, a = ligne[pos], b = ligne[pos + 1 < N ? pos + 1 : 0];
      ligne[pos] = (a + b) * 0.5 * (o.tenue || 0.9965);
      pos = pos + 1 < N ? pos + 1 : 0;
      corps += 0.35 * (a - corps);
      phase += TAU * o.f0 / taux;
      const coup = sin(phase) * exp(-t * 18) * 0.35;
      sortie[i] = tanh(1.6 * (corps * 2.2 + coup)) * min(1, (n - i) / (taux * 0.03));
    }
    return sortie;
  }
  /** Synthé : dents de scie ou carrés corrigés (BLEP), voix désaccordées, filtre d'état variable dont la coupure suit
   *  une enveloppe (de coupure0 vers coupure1). accord : intervalles joués ensemble (une frappe en quinte). */
  function synthe(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n), hasard = alea(o.graine), accord = o.accord || [0];
    const nv = o.voix || 1, voix = [];
    for (const demi of accord) for (let k = 0; k < nv; k++) {
      voix.push({ f: o.f0 * pow(2, demi / 12 + (nv > 1 ? (k / (nv - 1) - 0.5) * (o.desaccord || 0) / 1200 : 0)), phase: (hasard() + 1) / 2 });
    }
    const kq = 1 / (o.resonance || 0.9);
    let ic1 = 0, ic2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / taux;
      let x = 0;
      for (let k = 0; k < voix.length; k++) {
        const v = voix[k], dt = v.f / taux;
        v.phase += dt; if (v.phase >= 1) v.phase -= 1;
        const scie = 2 * v.phase - 1 - blep(v.phase, dt);
        if (o.forme === 'scie') { x += scie; continue; }
        let p2 = v.phase + 0.5; if (p2 >= 1) p2 -= 1;
        const carre = scie - (2 * p2 - 1 - blep(p2, dt));
        x += o.forme === 'carre' ? carre * 0.7 : 0.5 * scie + 0.35 * carre;
      }
      x /= sqrt(voix.length);
      const fc = o.coupure1 + (o.coupure0 - o.coupure1) * exp(-t / (o.tempsFiltre || 0.15));
      const g = tan(PI * min(fc, taux * 0.42) / taux), a1 = 1 / (1 + g * (g + kq)), a2 = g * a1, a3 = g * a2;
      const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      const env = min(1, t / (o.attaque || 0.004)) * exp(-t * (o.amorti || 1)) * min(1, (n - i) / (taux * 0.02));
      sortie[i] = tanh(1.3 * v2) * env;
    }
    return sortie;
  }
  /** Motif de sirène : la note monte d'une quarte, tient, redescend ; triangle et carré adoucis. */
  function sirene(o, taux = TAUX) {
    const n = ceil(o.duree * taux), sortie = new Float32Array(n);
    let phase = 0, bas = 0;
    for (let i = 0; i < n; i++) {
      const t = i / taux, demi = 5 * lisse(min(1, t / 0.3)) - 5 * lisse(borner((t - 0.6) / 0.38, 0, 1));
      const dt = o.f0 * pow(2, demi / 12) * (1 + 0.004 * sin(TAU * 6 * t)) / taux;
      phase += dt; if (phase >= 1) phase -= 1;
      let p2 = phase + 0.5; if (p2 >= 1) p2 -= 1;
      const carre = (2 * phase - 1 - blep(phase, dt)) - (2 * p2 - 1 - blep(p2, dt)), triangle = 1 - 4 * abs(phase - 0.5);
      bas += 0.55 * (0.62 * triangle + 0.3 * carre - bas);
      sortie[i] = bas * min(1, t / 0.02) * min(1, (n - i) / (taux * 0.05)) * (0.85 + 0.15 * exp(-t * 3));
    }
    return sortie;
  }

  // Les instruments des quatre morceaux. ref : hauteur MIDI jouée à la période 428. volume : volume MOD par défaut.
  const cri = u => 1 + 0.1 * min(1, u / 0.07) - 0.18 * max(0, u - 0.1);
  const INSTRUMENTS = {
    cuivre: { nom: 'CUIVRE', ref: 60, volume: 50, faire: () => cuivre({ f0: hz(60), duree: 1.9, eclat: 0.95, attaque: 0.026, amorti: 0.45, cloche: 1450, graine: 1301 }) },
    trombone: { nom: 'TROMBONE', ref: 48, volume: 52, faire: () => cuivre({ f0: hz(48), duree: 2.2, eclat: 0.8, attaque: 0.04, amorti: 0.4, cloche: 950, graine: 1409 }) },
    tuba: { nom: 'TUBA', ref: 36, volume: 58, faire: () => cuivre({ f0: hz(36), duree: 1.5, eclat: 0.62, attaque: 0.03, amorti: 1.0, cloche: 560, vibrato: 0.0015, graine: 1511 }) },
    muraille: { nom: 'MURAILLE CUIVRES', ref: 48, volume: 54, faire: () => cuivre({ f0: hz(48), accord: [0, 7, 12], duree: 2.1, eclat: 0.85, attaque: 0.035, amorti: 0.45, cloche: 850, graine: 1601 }) },
    section_maj: { nom: 'PUPITRE MAJEUR', ref: 60, volume: 48, faire: () => cuivre({ f0: hz(60), accord: [0, 4, 7], duree: 0.62, eclat: 1, attaque: 0.018, amorti: 3.2, graine: 1709 }) },
    section_min: { nom: 'PUPITRE MINEUR', ref: 60, volume: 48, faire: () => cuivre({ f0: hz(60), accord: [0, 3, 7], duree: 0.62, eclat: 1, attaque: 0.018, amorti: 3.2, graine: 1747 }) },
    sifflet: { nom: 'SIFFLET', ref: 96, volume: 36, faire: () => sifflet({ f0: hz(96), duree: 0.9, graine: 1801 }) },
    choeur_o: { nom: 'CHOEUR O', ref: 48, volume: 46, faire: () => choeur({ f0: hz(48), voyelle: 'o', voix: 7, octave: 0.3, duree: 2.6, attaque: 0.12, amorti: 0.25, graine: 1901 }) },
    choeur_ou: { nom: 'CHOEUR OU', ref: 48, volume: 54, faire: () => choeur({ f0: hz(48), voyelle: 'ou', voix: 8, duree: 1.4, attaque: 0.03, amorti: 1.3, souffle: 0.12, graine: 1999 }) },
    choeur_he: { nom: 'CRI HE', ref: 55, volume: 50, faire: () => choeur({ f0: hz(55), voyelle: 'e', voix: 8, octave: 0.4, duree: 0.38, attaque: 0.014, amorti: 5.5, contour: cri, souffle: 0.22, etalement: 0.02, graine: 2003 }) },
    basse: { nom: 'BASSE PINCEE', ref: 36, volume: 56, faire: () => corde({ f0: hz(36), duree: 1.8, graine: 2111 }) },
    synthe_basse: { nom: 'SYNTHE BASSE', ref: 36, volume: 54, faire: () => synthe({ f0: hz(36), forme: 'mixte', voix: 2, desaccord: 8, coupure0: 1700, coupure1: 260, tempsFiltre: 0.09, resonance: 1.6, amorti: 2.2, duree: 0.72, graine: 2203 }) },
    nappe: { nom: 'NAPPE', ref: 60, volume: 40, faire: () => synthe({ f0: hz(60), forme: 'scie', voix: 3, desaccord: 18, coupure0: 700, coupure1: 1500, tempsFiltre: 0.5, resonance: 0.8, attaque: 0.18, amorti: 0.3, duree: 2.4, graine: 2309 }) },
    arpege: { nom: 'ARPEGE', ref: 60, volume: 42, faire: () => synthe({ f0: hz(60), forme: 'carre', voix: 1, coupure0: 3200, coupure1: 650, tempsFiltre: 0.07, resonance: 1.3, amorti: 4, duree: 0.46, graine: 2411 }) },
    sirene: { nom: 'SIRENE', ref: 60, volume: 40, faire: () => sirene({ f0: hz(60), duree: 1.25 }) },
    frappe: { nom: 'FRAPPE SYNTHE', ref: 60, volume: 44, faire: () => synthe({ f0: hz(60), forme: 'scie', voix: 2, desaccord: 12, accord: [0, 7, 12], coupure0: 2600, coupure1: 500, tempsFiltre: 0.1, resonance: 1.1, amorti: 3.5, duree: 0.55, graine: 2503 }) },
  };

  // ---- Batterie : coups calculés au double du taux (16 574 Hz), réunis en mesures entières (une par variante). ----
  const DUREES_FRAPPES = { grosse: 0.42, caisse: 0.3, charleston: 0.08, ouvert: 0.36, claque: 0.32, tom: 0.38, cymbale: 1.5,
    surdoOuvert: 0.95, surdoEtouffe: 0.28, caixa: 0.15, repinique: 0.26, tamborim: 0.09, agogoHaut: 0.36, agogoBas: 0.36,
    chocalho: 0.1, grosseCaisse: 1.05, tambour: 0.34, roulement: 0.12, timbale: 1.25, kick: 0.62, tic: 0.045, chute: 1.1 };
  const METAL = [317, 470, 571, 807, 834, 1235];
  function synthFrappe(sorte) {
    const taux = TAUX_BATTERIE, n = ceil(DUREES_FRAPPES[sorte] * taux), sortie = new Float32Array(n), hasard = alea(graineDe(sorte));
    const bande = sorte === 'claque' ? passeBande(1150, 1.6, taux) : sorte === 'caixa' ? passeBande(3600, 1.2, taux)
      : sorte === 'tambour' || sorte === 'roulement' ? passeBande(2300, 0.9, taux) : null;
    let phase = 0, bas = 0, metalBas = 0, aiguBas = 0;
    for (let i = 0; i < n; i++) {
      const t = i / taux, b = hasard();
      bas += 0.22 * (b - bas);
      const aigu = b - bas;
      aiguBas += 0.3 * (aigu - aiguBas);
      let v = 0;
      if (sorte === 'charleston' || sorte === 'ouvert' || sorte === 'cymbale') {
        let m = 0;
        for (let k = 0; k < 6; k++) m += sin(TAU * METAL[k] * t) > 0 ? 1 : -1;
        metalBas += 0.3 * (m / 6 - metalBas);
        const metal = m / 6 - metalBas;
        v = (aigu * 0.6 + metal * 0.45) * exp(-t * (sorte === 'charleston' ? 55 : sorte === 'ouvert' ? 11 : 3)) * (sorte === 'cymbale' ? 0.5 : 0.55);
      } else switch (sorte) {
        case 'grosse': phase += TAU * (50 + 110 * exp(-t * 38)) / taux;
          v = sin(phase) * exp(-t * 10) + 0.25 * sin(2 * phase) * exp(-t * 22) + aigu * 0.4 * exp(-t * 140); break;
        case 'caisse': v = (aigu * 0.85 + b * 0.12) * exp(-t * 15) + (sin(TAU * 186 * t) * 0.45 + sin(TAU * 334 * t) * 0.2) * exp(-t * 24); break;
        case 'claque': {
          let env = 0;
          for (const d of [0, 0.011, 0.022, 0.034]) if (t >= d) env += exp(-(t - d) * 170);
          if (t > 0.034) env += 0.35 * exp(-(t - 0.034) * 20);
          v = filtrer(bande, b) * env * 1.7; break;
        }
        case 'tom': phase += TAU * (98 + 50 * exp(-t * 14)) / taux; v = sin(phase) * exp(-t * 9) + aigu * 0.1 * exp(-t * 35); break;
        // Les fûts graves : le mode fondamental, deux modes de la peau (1,59 et 2,14 fois plus haut) et le coup de
        // mailloche dans le médium, pour qu'ils s'entendent aussi sur de petits haut-parleurs.
        case 'surdoOuvert': phase += TAU * (60 + 18 * exp(-t * 9)) / taux;
          v = (sin(phase) + 0.38 * sin(1.59 * phase) * exp(-t * 7) + 0.2 * sin(2.14 * phase) * exp(-t * 11)) * exp(-t * 4.6) * (1 + 0.25 * exp(-t * 30))
            + (bas - 0.5) * 1.6 * exp(-t * 45); break;
        case 'surdoEtouffe': phase += TAU * (64 + 12 * exp(-t * 20)) / taux;
          v = (sin(phase) + 0.35 * sin(1.59 * phase) * exp(-t * 12)) * exp(-t * 17) + aigu * 0.25 * exp(-t * 90) + (bas - 0.5) * 1.4 * exp(-t * 60); break;
        case 'caixa': v = filtrer(bande, b) * 1.5 * exp(-t * 32) + aigu * 0.35 * exp(-t * 22) + sin(TAU * 240 * t) * 0.15 * exp(-t * 50); break;
        case 'repinique': phase += TAU * (255 + 45 * exp(-t * 20)) / taux; v = sin(phase) * exp(-t * 13) * 0.8 + aigu * 0.55 * exp(-t * 110); break;
        case 'tamborim': phase += TAU * 690 / taux; v = sin(phase) * exp(-t * 48) * 0.8 + aigu * 0.45 * exp(-t * 160); break;
        case 'agogoHaut': case 'agogoBas': {
          const f = sorte === 'agogoHaut' ? 980 : 740;
          v = sin(TAU * f * t) * exp(-t * 9) + 0.5 * sin(TAU * f * 2.38 * t) * exp(-t * 13) + 0.28 * sin(TAU * f * 4.1 * t) * exp(-t * 19)
            + aigu * 0.2 * exp(-t * 200); v *= 0.6; break;
        }
        case 'chocalho': v = (aigu - aiguBas) * min(1, t / 0.006) * exp(-t * 42) * 0.9; break;
        case 'grosseCaisse': phase += TAU * (54 + 14 * exp(-t * 12)) / taux;
          v = (sin(phase) + 0.32 * sin(1.59 * phase) * exp(-t * 8) + 0.16 * sin(2.3 * phase) * exp(-t * 12)) * exp(-t * 4.2) * (1 + 0.3 * exp(-t * 25))
            + (bas - 0.5) * 1.5 * exp(-t * 40); break;
        case 'tambour': v = (filtrer(bande, b) * 1.3 + aigu * 0.5) * exp(-t * 13) + sin(TAU * 205 * t) * 0.4 * exp(-t * 32); break;
        case 'roulement': v = (filtrer(bande, b) * 1.1 + aigu * 0.4) * exp(-t * 38) + sin(TAU * 210 * t) * 0.2 * exp(-t * 55); break;
        case 'timbale': phase += TAU * 98 / taux;
          v = (sin(phase) + 0.5 * sin(1.51 * phase) + 0.3 * sin(1.99 * phase)) * exp(-t * 2.6) * 0.6 + bas * 0.2 * exp(-t * 35); break;
        case 'kick': phase += TAU * (44 + 115 * exp(-t * 28)) / taux; v = tanh(1.6 * sin(phase) * exp(-t * 4.6)) + aigu * 0.2 * exp(-t * 220); break;
        case 'tic': v = sin(TAU * 1850 * t) * exp(-t * 110) * 0.6 + aigu * 0.4 * exp(-t * 300); break;
        case 'chute': phase += TAU * (36 + 54 * exp(-t * 3.5)) / taux; v = sin(phase) * min(1, t / 0.01) * exp(-t * 1.9); break;
        default: throw new Error('coup de batterie inconnu : ' + sorte);
      }
      sortie[i] = tanh(v * 1.25) * min(1, i / 6) * min(1, (n - i) / 60);
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
  const HUIT = [0, 2, 4, 6, 8, 10, 12, 14], SEIZE = Array.from({ length: 16 }, (_, i) => i), CONTRE = [2, 6, 10, 14];
  const KITS = {
    titre: [
      [['grosse', [0], 0.8], ['tic', [8], 0.45], ['charleston', [0, 4, 8, 12], 0.32]],
      [['grosse', [0, 10], 0.8], ['caisse', [4, 12], 0.45], ['charleston', HUIT, 0.38]],
      [['grosse', [0, 7, 10], 0.8], ['caisse', [4, 12], 0.45], ['charleston', [0, 2, 4, 6, 8, 10, 12], 0.38], ['ouvert', [14], 0.38]],
      [['grosse', [0], 0.8], ['caisse', [4], 0.45], ['tom', [12, 13, 14], [0.5, 0.58, 0.66]], ['caisse', [15], 0.6]],
      [['grosse', [0, 6, 8, 11], 0.95], ['caisse', [4, 12], 0.9], ['caisse', [7, 9, 15], 0.28], ['charleston', SEIZE, SEIZE.map(r => (r % 2 ? 0.3 : 0.5))]],
      [['grosse', [0, 6, 8, 11], 0.95], ['caisse', [4], 0.9], ['caisse', [12, 13, 14, 15], [0.55, 0.65, 0.75, 0.85]], ['charleston', HUIT, 0.48]],
      [['cymbale', [0], 0.7], ['grosse', [0, 6, 8, 11], 1], ['caisse', [4, 12], 0.95], ['charleston', [2, 4, 6, 8, 10, 12, 14], 0.52]],
      [['grosse', [0, 8], 1], ['caisse', [4], 0.9], ['tom', [8, 9, 10, 11], [0.6, 0.66, 0.72, 0.8]], ['caisse', [12, 13, 14, 15], [0.6, 0.72, 0.84, 0.95]]],
    ],
    convergence: (() => {
      const base = [['surdoEtouffe', [0, 8], 0.7], ['surdoOuvert', [4, 12], 0.9], ['chocalho', SEIZE, SEIZE.map(r => (r % 2 ? 0.36 : 0.24))],
        ['agogoHaut', [0, 3, 8, 11], 0.45], ['agogoBas', [6, 14], 0.45]];
      const caixa = ['caixa', SEIZE, SEIZE.map(r => (r % 4 === 3 ? 0.55 : 0.24))], tamborim = ['tamborim', [0, 3, 6, 10, 13], 0.5];
      return [
        base,
        [...base, caixa, tamborim],
        [...base, caixa, tamborim, ['repinique', [6, 14], 0.5]],
        [...base.slice(0, 3), ['caixa', SEIZE.slice(0, 12), 0.3], tamborim, ['repinique', [12, 13, 14, 15], [0.55, 0.6, 0.68, 0.75]], ['surdoOuvert', [14], 0.9]],
        [...base, caixa, tamborim, ['repinique', [6, 14], 0.5], ['claque', [4, 12], 0.4]],
        [['surdoOuvert', [4, 12], 1], ['surdoEtouffe', [0, 8], 0.6], ['tamborim', [0, 3, 6, 10, 13], 0.55], ['claque', [4, 12], 0.5]],
        [...base, caixa, ['tamborim', [0, 2, 5, 8, 10, 13], 0.5], ['repinique', [3, 11], 0.5]],
        [...base.slice(0, 2), ['caixa', SEIZE.slice(0, 12), 0.3], tamborim, ['surdoOuvert', [12, 13, 14, 15], 0.85],
          ['caixa', [12, 13, 14, 15], 0.8], ['repinique', [12, 13, 14, 15], 0.75], ['tamborim', [12, 13, 14, 15], 0.7]],
      ];
    })(),
    bastion: [
      [['grosseCaisse', [0, 8], 0.6], ['tambour', [12], 0.35]],
      [['grosseCaisse', [0, 8], 0.7], ['tambour', [4, 12], 0.45], ['roulement', [14, 15], 0.25]],
      [['grosseCaisse', [0, 8], 0.8], ['tambour', [0, 4, 8, 12], 0.6], ['roulement', [2, 3, 6, 7, 10, 11, 14, 15], 0.3]],
      [['grosseCaisse', [0], 0.8], ['roulement', [8, 9, 10, 11, 12, 13, 14, 15], [0.3, 0.35, 0.4, 0.46, 0.52, 0.58, 0.64, 0.7]], ['tambour', [15], 0.7]],
      [['grosseCaisse', [0, 4, 8, 12], 0.9], ['tambour', [0, 4, 8, 12], 0.8], ['tambour', [3.75, 11.75], 0.35],
        ['roulement', [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], 0.4]],
      [['grosseCaisse', [0, 3, 8, 11], 0.9], ['tambour', [4], 0.9], ['roulement', [12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5], [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]], ['tambour', [12], 0.9]],
      [['cymbale', [0], 0.6], ['timbale', [0], 0.8], ['grosseCaisse', [0, 8], 1], ['tambour', [4, 12], 0.9], ['roulement', CONTRE, 0.4]],
      [['grosseCaisse', [0, 8, 12, 14], 1], ['timbale', [12, 14], 0.8],
        ['roulement', [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5], Array.from({ length: 16 }, (_, k) => 0.35 + k * 0.035)]],
    ],
    prefecture: [
      [['kick', [0], 0.7], ['charleston', CONTRE, 0.3], ['tic', [4, 12], 0.25]],
      [['kick', [0, 8], 0.75], ['charleston', CONTRE, 0.35], ['claque', [12], 0.4], ['tic', [3, 7, 11, 15], 0.2]],
      [['kick', [0, 4, 8, 12], 0.8], ['charleston', CONTRE, 0.4], ['claque', [4, 12], 0.5]],
      [['kick', [0, 8], 0.75], ['claque', [12, 13, 14, 15], [0.3, 0.4, 0.5, 0.6]]],
      [['kick', [0, 4, 8, 12], 0.9], ['charleston', SEIZE, SEIZE.map(r => (r % 4 === 2 ? 0.5 : 0.28))], ['claque', [4, 12], 0.65], ['tic', [3, 6, 11, 14], 0.3]],
      [['kick', [0, 3, 6, 8, 11, 14], 0.9], ['claque', [4, 12], 0.65], ['charleston', SEIZE, 0.32], ['ouvert', [10], 0.35]],
      [['chute', [0], 1], ['kick', [0, 4, 8, 12], 0.9], ['claque', [4, 12], 0.65], ['charleston', SEIZE, 0.3], ['cymbale', [0], 0.35]],
      [['kick', [0, 4, 8], 0.9], ['claque', [8, 9, 10, 11, 12, 13, 14, 15], [0.3, 0.36, 0.42, 0.5, 0.58, 0.66, 0.75, 0.85]], ['montee', [8], 0.5]],
    ],
  };
  /** Une mesure entière de batterie, au double du taux, pour un seul canal du MOD (FERRO, drumBar). */
  function mesureBatterie(cle, variante) {
    const bpm = MORCEAUX[cle].bpm, pas = 60 / bpm / 4, taux = TAUX_BATTERIE, n = ceil((pas * 16 + 0.25) * taux);
    const sortie = new Float32Array(n);
    for (const [sorte, rangs, velocite] of KITS[cle][variante]) {
      for (let k = 0; k < rangs.length; k++) {
        const vel = Array.isArray(velocite) ? velocite[k] : velocite, at = round(rangs[k] * pas * taux);
        if (sorte === 'montee') {
          // Montée de bruit jusqu'à la fin de la mesure : la relance d'une reprise.
          const hasard = alea(7717 + variante), fin = round(16 * pas * taux);
          let bas = 0;
          for (let i = at; i < fin; i++) { const b = hasard(); bas += 0.2 * (b - bas); sortie[i] += (b - bas) * vel * pow((i - at) / (fin - at), 2); }
          continue;
        }
        const d = donneesFrappe(sorte);
        for (let i = 0; i < d.length && at + i < n; i++) sortie[at + i] += d[i] * vel;
      }
    }
    for (let i = 0; i < n; i++) sortie[i] = tanh(sortie[i] * 1.1) * min(1, (n - i) / 110);
    return sortie;
  }

  // ---- Les morceaux. ----
  const MORCEAUX = {
    titre: { titre: 'Point de rupture', moduleTitre: 'PDR I - THEME', style: 'Thème de rue, cuivres et chœur', bpm: 108,
      instruments: ['cuivre', 'choeur_o', 'basse', 'section_maj', 'section_min', 'choeur_he'] },
    convergence: { titre: 'La Convergence', moduleTitre: 'PDR II - CONVERGENCE', style: 'Fanfare de rue et batucada', bpm: 132,
      instruments: ['cuivre', 'tuba', 'trombone', 'sifflet', 'section_maj', 'section_min', 'choeur_he'] },
    bastion: { titre: 'Le Bastion', moduleTitre: 'PDR III - BASTION', style: 'Tambours martiaux et cuivres graves', bpm: 92,
      instruments: ['muraille', 'tuba', 'trombone', 'choeur_ou', 'cuivre'] },
    prefecture: { titre: 'La Préfecture', moduleTitre: 'PDR IV - PREFECTURE', style: 'Pulsation tendue, synthés et sirènes', bpm: 120,
      instruments: ['synthe_basse', 'nappe', 'arpege', 'sirene', 'frappe'] },
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
    function note(p, mesure, pas, canal, nom, hauteur, vol) {
      const k = liste.indexOf(nom), r = 48 + hauteur - INSTRUMENTS[nom].ref;
      if (k < 0) throw new Error(cle + ' : instrument absent ' + nom);
      if (r < 36 || r > 71 || hauteur !== round(hauteur)) throw new Error(cle + ' : ' + nom + ' ' + hauteur + ' hors de la tessiture');
      cellule(p, mesure * 16 + pas, canal, k + 1, PERIODES[r - 36], vol === undefined ? 0 : 12, vol === undefined ? 0 : vol);
    }
    const coupe = (p, mesure, pas, canal) => cellule(p, mesure * 16 + pas, canal, 0, 0, 12, 0);
    /** notes : [pas, hauteur, durée] ; un silence coupe la note tenue (C00). */
    function phrase(p, mesure, canal, nom, notes, vol, transposition = 0) {
      for (let k = 0; k < notes.length; k++) {
        const [pas, hauteur, duree] = notes[k], fin = pas + duree, suivant = k + 1 < notes.length ? notes[k + 1][0] : 16;
        note(p, mesure, pas, canal, nom, hauteur + transposition, vol);
        if (fin < suivant && fin < 16) coupe(p, mesure, fin, canal);
      }
    }
    const batterie = (p, mesure, variante) => cellule(p, mesure * 16, 3, liste.length + 1 + variante, PERIODES[60 - 36], 0, 0);
    return { motifs, note, coupe, phrase, batterie };
  }

  /** « Point de rupture », le thème : ré mineur, 108 BPM. La mélodie reprend le rythme d'un chant de rue
   *  (noire, noire, deux croches, noire) ; grilles ré m – si♭ – do – la et ré m – si♭ – do – ré m. */
  function composerTitre() {
    const e = ecrivain('titre', 8);
    const Dm = { r: 38, s: ['section_min', 62] }, Bb = { r: 34, s: ['section_maj', 58] }, C = { r: 36, s: ['section_maj', 60] },
      A = { r: 33, s: ['section_maj', 57] };
    const grille1 = [Dm, Bb, C, A], grille2 = [Dm, Bb, C, Dm];
    const theme1 = [
      [[0, 62, 3], [4, 62, 3], [8, 65, 2], [10, 67, 2], [12, 69, 4]],
      [[0, 70, 3], [4, 69, 3], [8, 67, 2], [10, 65, 2], [12, 62, 4]],
      [[0, 60, 3], [4, 64, 3], [8, 67, 2], [10, 69, 2], [12, 67, 4]],
      [[0, 69, 6], [6, 67, 2], [8, 64, 4], [12, 61, 4]],
    ];
    const theme2 = [theme1[0],
      [[0, 74, 3], [4, 72, 3], [8, 70, 2], [10, 69, 2], [12, 65, 4]],
      [[0, 67, 3], [4, 69, 3], [8, 70, 2], [10, 69, 2], [12, 67, 2], [14, 64, 2]],
      [[0, 62, 12]],
    ];
    const riff = [
      [[0, 74, 2], [3, 72, 1], [4, 69, 2], [6, 67, 2], [8, 69, 3], [11, 65, 1], [12, 67, 2], [14, 69, 2]],
      [[0, 70, 2], [3, 69, 1], [4, 65, 2], [6, 62, 2], [8, 65, 3], [11, 62, 1], [12, 65, 2], [14, 67, 2]],
      [[0, 72, 2], [3, 70, 1], [4, 67, 2], [6, 64, 2], [8, 67, 3], [11, 64, 1], [12, 67, 2], [14, 69, 2]],
      [[0, 73, 4], [4, 69, 2], [6, 64, 2], [8, 69, 4], [12, 73, 4]],
    ];
    const ligne1 = [57, 58, 60, 61], ligne2 = [62, 62, 64, 62];
    const basseCalme = r => [[0, r, 8], [8, r + 7, 8]];
    const basseTendue = r => [[0, r, 2], [2, r, 2], [4, r + 12, 2], [6, r, 2], [8, r, 2], [10, r + 7, 2], [12, r + 12, 2], [14, r + 7, 2]];
    const kits = [[0, 0, 0, 3], [1, 1, 2, 3], [1, 2, 1, 3], [0, 1, 0, 3], [6, 4, 5, 7], [6, 4, 4, 7], [6, 5, 4, 7], [6, 6, 6, 7]];
    for (let p = 0; p < 8; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    for (let m = 0; m < 4; m++) {
      // Section calme : introduction du chœur, thème, réponse, pont chanté.
      e.phrase(0, m, 2, 'choeur_o', [[0, ligne1[m], 16]], 40);
      e.phrase(0, m, 1, 'basse', basseCalme(grille1[m].r), 44);
      e.phrase(1, m, 0, 'cuivre', theme1[m], 38);
      e.phrase(1, m, 2, 'choeur_o', [[0, ligne1[m], 16]], 30);
      e.phrase(1, m, 1, 'basse', basseCalme(grille1[m].r), 44);
      e.phrase(2, m, 0, 'cuivre', theme2[m], 38);
      e.phrase(2, m, 2, 'choeur_o', [[0, ligne2[m], 16]], 30);
      e.phrase(2, m, 1, 'basse', basseCalme(grille2[m].r), 44);
      e.phrase(3, m, 2, 'choeur_o', theme1[m], 42);
      e.phrase(3, m, 1, 'basse', [[0, grille1[m].r, 16]], 42);
      // Section tendue : thème avec pupitres, réponse, riff de rupture, reprise.
      for (const [p, theme, grille, vol] of [[4, theme1, grille1, 50], [5, theme2, grille2, 50], [7, theme1, grille1, 54]]) {
        e.phrase(p, m, 0, 'cuivre', theme[m], vol);
        e.phrase(p, m, 1, 'basse', basseTendue(grille[m].r), vol);
        for (const pas of p === 7 ? [2, 6, 10, 14] : [6, 14]) e.note(p, m, pas, 2, grille[m].s[0], grille[m].s[1], p === 7 ? 34 : 38);
      }
      e.phrase(6, m, 0, 'cuivre', riff[m], 48);
      e.phrase(6, m, 1, 'basse', basseTendue(grille1[m].r), 50);
      for (const pas of [0, 8]) e.note(6, m, pas, 2, grille1[m].s[0], grille1[m].s[1], 40);
    }
    for (const [p, m] of [[4, 3], [5, 3], [7, 3]]) e.note(p, m, 10, 2, 'choeur_he', 57, 48);
    for (const m of [1, 3]) e.note(6, m, 12, 2, 'choeur_he', 57, 52);
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 1, 2], tendu: [4, 5, 6, 7, 4, 5] };
  }

  /** « La Convergence » : fanfare de rue sur une batucada, 132 BPM. Groove en ré dorien (ré m – sol), refrain en fa
   *  majeur (si♭ – do – fa – ré m), appels de sifflet et cris. */
  function composerConvergence() {
    const e = ecrivain('convergence', 8);
    const tubaGroove = [[[0, 38, 2], [3, 38, 1], [6, 41, 2], [8, 45, 2], [11, 48, 1], [12, 45, 2], [14, 43, 2]],
      [[0, 31, 2], [3, 31, 1], [6, 35, 2], [8, 38, 2], [11, 41, 1], [12, 38, 2], [14, 37, 2]]];
    const riff = [[[0, 69, 2], [2, 69, 1], [3, 72, 2], [6, 69, 2], [8, 67, 1], [9, 69, 1], [10, 65, 2], [12, 62, 4]],
      [[0, 71, 2], [2, 71, 1], [3, 74, 2], [6, 71, 2], [8, 69, 1], [9, 71, 1], [10, 67, 2], [12, 65, 2], [14, 64, 2]]];
    const reponses = [[[2, 50, 1], [10, 53, 1], [12, 57, 2]], [[2, 50, 1], [10, 53, 1], [12, 55, 2]]];
    const refrain = [
      [[0, 74, 3], [3, 72, 1], [4, 70, 2], [6, 69, 2], [8, 70, 4], [12, 65, 4]],
      [[0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 70, 2], [8, 72, 4], [12, 67, 4]],
      [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 2], [10, 69, 2], [12, 72, 4]],
      [[0, 74, 6], [6, 72, 2], [8, 69, 4], [14, 69, 2]],
    ];
    const tubaRefrain = [
      [[0, 34, 2], [4, 41, 2], [6, 34, 1], [8, 34, 2], [12, 41, 2], [14, 33, 2]],
      [[0, 36, 2], [4, 43, 2], [6, 36, 1], [8, 36, 2], [12, 43, 2], [14, 40, 2]],
      [[0, 41, 2], [4, 48, 2], [6, 41, 1], [8, 41, 2], [12, 45, 2], [14, 40, 2]],
      [[0, 38, 2], [4, 45, 2], [6, 38, 1], [8, 38, 2], [12, 45, 2], [14, 37, 2]],
    ];
    const pupitres = [['section_maj', 58], ['section_maj', 60], ['section_maj', 53], ['section_min', 62]];
    const tenues = [50, 52, 57, 53];
    const appel = [[0, 98, 1], [2, 98, 1], [4, 101, 4]];
    const kits = [[0, 0, 1, 3], [1, 1, 1, 3], [1, 2, 1, 3], [5, 5, 5, 3], [2, 4, 2, 7], [4, 2, 6, 7], [5, 5, 6, 7], [4, 6, 2, 7]];
    for (let p = 0; p < 8; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    for (let m = 0; m < 4; m++) {
      const g = m % 2;
      e.phrase(0, m, 1, 'tuba', tubaGroove[g], 44);
      if (g) e.phrase(0, m, 2, 'sifflet', appel, 34);
      e.phrase(1, m, 1, 'tuba', tubaGroove[g], 44);
      e.phrase(1, m, 0, 'cuivre', riff[g], 36);
      e.phrase(2, m, 1, 'tuba', tubaRefrain[m], 44);
      e.phrase(2, m, 0, 'cuivre', refrain[m], 38);
      e.phrase(2, m, 2, 'trombone', [[0, tenues[m], 16]], 28);
      e.phrase(3, m, 1, 'tuba', [[0, g ? 31 : 38, 6]], 46);
      e.phrase(3, m, 2, 'sifflet', appel, 38);
      e.phrase(4, m, 1, 'tuba', tubaGroove[g], 52);
      e.phrase(4, m, 0, 'cuivre', riff[g], 50);
      e.phrase(4, m, 2, 'trombone', reponses[g], 40);
      for (const p of [5, 7]) {
        e.phrase(p, m, 1, 'tuba', tubaRefrain[m], 52);
        e.phrase(p, m, 0, 'cuivre', refrain[m], 52);
        for (const pas of CONTRE) e.note(p, m, pas, 2, pupitres[m][0], pupitres[m][1], 36);
      }
      e.phrase(6, m, 0, 'cuivre', [[0, 74, 2], [3, 74, 1], [6, 72, 2]], 50);
      e.phrase(6, m, 1, 'tuba', [[0, 38, 2], [3, 38, 1], [6, 36, 2]], 52);
      e.phrase(6, m, 2, 'sifflet', appel, 40);
    }
    e.note(4, 3, 12, 2, 'choeur_he', 57, 50);
    for (const m of [0, 2]) { e.note(6, m, 8, 2, 'choeur_he', 57, 54); e.note(6, m, 12, 2, 'choeur_he', 59, 54); }
    for (const m of [1, 3]) e.note(7, m, 0, 2, 'choeur_he', 57, 52);
    return { motifs: e.motifs, calme: [0, 1, 2, 1, 3, 2], tendu: [4, 5, 6, 4, 7, 5] };
  }

  /** « Le Bastion » : marche en do mineur, 92 BPM. Accords de quinte des cuivres graves, tuba, mélodie de trombone,
   *  « hou ! » de la troupe, tambours de marche ; appel de trompette au sommet. */
  function composerBastion() {
    const e = ecrivain('bastion', 8);
    const grille1 = [48, 44, 46, 43], grille2 = [48, 41, 43, 48];
    const theme1 = [
      [[0, 60, 6], [6, 63, 2], [8, 67, 8]],
      [[0, 65, 4], [4, 63, 4], [8, 60, 8]],
      [[0, 62, 6], [6, 63, 2], [8, 65, 4], [12, 62, 4]],
      [[0, 59, 8], [8, 62, 4], [12, 55, 4]],
    ];
    const theme2 = [
      [[0, 67, 6], [6, 65, 2], [8, 63, 4], [12, 60, 4]],
      [[0, 68, 6], [6, 67, 2], [8, 65, 4], [12, 63, 4]],
      [[0, 62, 4], [4, 65, 4], [8, 59, 4], [12, 62, 4]],
      [[0, 60, 12]],
    ];
    const appel = [[[0, 67, 2], [2, 67, 1], [3, 72, 6], [12, 71, 4]], [[0, 68, 3], [4, 67, 3], [8, 63, 6]],
      [[0, 70, 2], [2, 70, 1], [3, 74, 6], [12, 72, 4]], [[0, 71, 6], [6, 74, 2], [8, 71, 4], [12, 67, 4]]];
    const marche = r => [[0, r, 3], [6, r, 2], [8, r, 3], [12, r, 2]];
    const pasTuba = r => [[0, r - 12, 4], [4, r - 5, 4], [8, r - 12, 4], [12, r - 5, 4]];
    const kits = [[0, 0, 0, 3], [1, 1, 2, 3], [1, 2, 1, 3], [2, 2, 2, 3], [6, 4, 5, 7], [4, 5, 4, 7], [4, 4, 6, 7], [6, 6, 6, 7]];
    for (let p = 0; p < 8; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    for (let m = 0; m < 4; m++) {
      for (const [p, grille] of [[0, grille1], [1, grille1], [2, grille2], [3, grille1]]) {
        e.phrase(p, m, 0, 'muraille', [[0, grille[m], 16]], p ? 32 : 34);
        e.phrase(p, m, 1, 'tuba', [[0, grille[m] - 12, 16]], 44);
      }
      e.phrase(1, m, 2, 'trombone', theme1[m], 40);
      e.phrase(2, m, 2, 'trombone', theme2[m], 40);
      for (const pas of [0, 8]) e.note(3, m, pas, 2, 'choeur_ou', m === 3 && pas ? 43 : 48, 40);
      for (const [p, grille] of [[4, grille1], [5, grille2], [6, grille1], [7, grille1]]) {
        e.phrase(p, m, 0, 'muraille', p === 6 ? [[4, grille[m], 3], [12, grille[m], 3]] : marche(grille[m]), 44);
        e.phrase(p, m, 1, 'tuba', pasTuba(grille[m]), 52);
      }
      e.phrase(4, m, 2, 'trombone', theme1[m], 52);
      e.phrase(5, m, 2, 'trombone', theme2[m], 52);
      for (const pas of [0, 8]) e.note(6, m, pas, 2, 'choeur_ou', m === 3 && pas ? 43 : 48, 54);
      e.phrase(7, m, 2, 'cuivre', appel[m], 48);
    }
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 1, 2], tendu: [4, 5, 6, 7, 4, 5] };
  }

  /** « La Préfecture » : pulsation en mi phrygien, 120 BPM. Basse de synthé en octaves, arpèges, nappe, frappes en
   *  quinte et motifs de sirène (la note monte d'une quarte et redescend). */
  function composerPrefecture() {
    const e = ecrivain('prefecture', 8);
    const ARP = { E: [64, 67, 71, 76], F: [65, 69, 72, 77], G: [67, 71, 74, 79], D: [62, 66, 69, 74] };
    const RAC = { E: 28, F: 29, G: 31, D: 26 };
    const calme = ['E', 'F', 'E', 'D'], tendu = ['E', 'F', 'G', 'F'], rupture = ['E', 'E', 'F', 'F'];
    const nappe = { E: 71, F: 72, G: 71, D: 69 };
    const octaves = r => HUIT.map(pas => [pas, pas % 4 ? r + 12 : r, 2]);
    const pulsation = r => SEIZE.map(pas => [pas, pas % 4 === 3 ? r + 12 : r, 1]);
    const arpege = (a, pas) => Array.from({ length: 16 / pas }, (_, k) => [k * pas, a[[0, 1, 2, 3, 2, 1, 0, 1][k % 8]], pas]);
    const kits = [[0, 0, 0, 3], [1, 1, 2, 3], [1, 2, 1, 3], [0, 0, 1, 3], [4, 4, 5, 7], [6, 4, 5, 7], [5, 5, 6, 7], [6, 6, 6, 7]];
    for (let p = 0; p < 8; p++) for (let m = 0; m < 4; m++) e.batterie(p, m, kits[p][m]);
    for (let m = 0; m < 4; m++) {
      const c = calme[m], t = tendu[m], r = rupture[m];
      e.phrase(0, m, 0, 'synthe_basse', octaves(RAC[c]), 40);
      e.phrase(0, m, 1, 'nappe', [[0, nappe[c], 16]], 30);
      e.phrase(1, m, 0, 'synthe_basse', octaves(RAC[c]), 42);
      e.phrase(1, m, 1, 'nappe', [[0, nappe[c], 16]], 30);
      if (m === 3) e.phrase(1, m, 2, 'sirene', [[0, 71, 12]], 26);
      e.phrase(2, m, 0, 'synthe_basse', octaves(RAC[c]), 42);
      e.phrase(2, m, 1, 'arpege', arpege(ARP[c], 2), 30);
      e.note(2, m, 0, 2, 'frappe', ARP[c][0], 24);
      e.phrase(3, m, 0, 'synthe_basse', [[0, RAC[c], 16]], 44);
      e.phrase(3, m, 1, 'nappe', [[0, nappe[c], 16]], 32);
      if (m % 2 === 0) e.phrase(3, m, 2, 'sirene', [[0, 71, 12]], 30);
      for (const p of [4, 5, 7]) {
        e.phrase(p, m, 0, 'synthe_basse', pulsation(RAC[t]), 46);
        for (const pas of [0, 4, 8, 12]) e.note(p, m, pas, 0, 'synthe_basse', RAC[t], 54);
        e.phrase(p, m, 1, 'arpege', arpege(ARP[t], 1), 36);
      }
      for (const pas of [0, 3, 6, 10]) e.note(4, m, pas, 2, 'frappe', ARP[t][0], 36);
      e.phrase(5, m, 2, 'sirene', [[0, 71, 8], [8, m % 2 ? 72 : 71, 8]], 40);
      e.phrase(6, m, 0, 'synthe_basse', pulsation(RAC[r]), 48);
      e.phrase(6, m, 1, 'arpege', arpege(ARP[r], 1), 36);
      e.phrase(6, m, 2, 'sirene', [[0, 71 + m, 12]], 42);
      if (m % 2) e.phrase(7, m, 2, 'sirene', [[0, 72, 12]], 42);
      else for (const pas of [0, 3, 6, 10]) e.note(7, m, pas, 2, 'frappe', ARP[t][0], 38);
    }
    return { motifs: e.motifs, calme: [0, 1, 2, 3, 1, 2], tendu: [4, 5, 6, 7, 4, 5] };
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
  /** Les huit mesures de batterie d'un morceau, normalisées ensemble : leurs nuances restent celles de la partition. */
  function batterieDe(cle) {
    let s = mesures.get(cle);
    if (!s) {
      const brutes = KITS[cle].map((_, v) => mesureBatterie(cle, v));
      let crete = 0;
      for (const d of brutes) crete = max(crete, sansContinu(d));
      const gain = 0.9 * 127 / (crete || 1);
      s = brutes.map((d, v) => ({ nom: 'PDR KIT ' + cle.toUpperCase().slice(0, 9) + ' ' + String.fromCharCode(65 + v), volume: 56, pcm: versPcm(d, gain) }));
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
    return { cle, titre: d.titre, style: d.style, bpm: d.bpm, duree: (m ? m.ordre.length : 12) * 960 / d.bpm, canaux: 4,
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
