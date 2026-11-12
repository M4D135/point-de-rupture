/* Point de rupture — sons calculés : WebAudio, oscillateurs, bruit et tampons calculés au chargement. Aucun
   enregistrement, aucun fichier, rien de chargé d'ailleurs.
   Porté de FERRO (src/audio.js, branche campagne-18-mondes, commit 4ce2271, voir PROVENANCE-SON.md). On garde son
   architecture : un contexte créé au premier geste seulement ; bus général, musique, effets et ambiances (plus un bus
   d'interface, sec) ; compresseur puis plafond de sortie doux ; voix bornées avec priorités et vol de voix ; une même
   source ne se répète pas dans un délai court ; la musique s'efface un instant sous les sons forts ; primitives ton et
   bruit ; essai du mixage de deux secondes ; libération complète. Les sons sont ceux d'un RTS de rue, propres au jeu :
   banque de bruitages calculés (foule, chants, mêlée, feu, eau, ville, verre, ferraille, bois, tôle, clameurs),
   ambiances continues réglées par son.js, séquenceur de rue (chants, tambours, sifflets, mêlée, chantiers), sons
   ponctuels du monde, annonces et sons d'interface. Ton du jeu : personne ne meurt ; la salve est un souffle et un
   choc de boucliers, pas une détonation ; aucune arme à feu.
   Ni window ni document : le contexte vient de globalThis.AudioContext, et le fichier se charge dans Node.

   PDR.audio = { create(options?) → moteur (API en tête de create), prechauffer(surProgres?) → Promise, SONS }. */
(function (PDR) {
  'use strict';

  const { sin, cos, exp, tanh, floor, abs, min, max, round, ceil, sqrt, pow, imul, PI } = Math;
  const TAU = 2 * PI;
  const borner = (v, a, b) => (v < a ? a : v > b ? b : v);
  function alea(graine) {
    let s = graine | 0;
    return () => { s = (imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
  }
  function passeBande(f, q, taux) {
    const w = TAU * min(f, taux * 0.45) / taux, alpha = sin(w) / (2 * q), a0 = 1 + alpha;
    return { b0: alpha / a0, b2: -alpha / a0, a1: -2 * cos(w) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  }
  function regler(r, f, q, taux) {
    const w = TAU * min(f, taux * 0.45) / taux, alpha = sin(w) / (2 * q), a0 = 1 + alpha;
    r.b0 = alpha / a0; r.b2 = -alpha / a0; r.a1 = -2 * cos(w) / a0; r.a2 = (1 - alpha) / a0;
  }
  function filtrer(r, x) {
    const y = r.b0 * x + r.b2 * r.x2 - r.a1 * r.y1 - r.a2 * r.y2;
    r.x2 = r.x1; r.x1 = x; r.y2 = r.y1; r.y1 = y;
    return y;
  }
  function blep(t, dt) {
    if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
    if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
    return 0;
  }
  function normaliser(d, crete) {
    let haut = 0, moyenne = 0;
    for (let i = 0; i < d.length; i++) moyenne += d[i] / d.length;
    for (let i = 0; i < d.length; i++) { d[i] -= moyenne; const a = abs(d[i]); if (a > haut) haut = a; }
    const g = crete / (haut || 1);
    for (let i = 0; i < d.length; i++) d[i] *= g;
    return d;
  }

  // ---- Banque de bruitages : des Float32Array calculés sans périphérique, au chargement (prechauffer). ----
  const TAUX = 22050;
  // Formants [F1, F2, F3] des voyelles chantées et parlées.
  const FORMANTS = { a: [700, 1220, 2600], o: [450, 800, 2830], e: [400, 2000, 2550], ou: [325, 700, 2530], eu: [400, 1600, 2400],
    ai: [550, 1770, 2500], i: [300, 2300, 3000] };
  /** Une foule qui chante la même syllabe : voix en dents de scie, chacune avec son retard, son vibrato et sa justesse ;
   *  graves et aiguës à l'octave ; trois formants de la voyelle. cri : attaque vive et hauteur qui monte puis tombe. */
  function chorale(voyelle, duree, nbVoix, f0, graine, o = {}) {
    const n = ceil(duree * TAUX), sortie = new Float32Array(n), hasard = alea(graine), F = FORMANTS[voyelle];
    const voix = Array.from({ length: nbVoix }, (_, k) => ({ f: f0 * (k % 3 === 2 ? 2 : 1) * pow(2, (hasard() - 0.5) * (o.justesse || 40) / 1200),
      phase: hasard(), retard: hasard() * (o.etalement === undefined ? 0.045 : o.etalement), vib: 4.6 + hasard(), ph: hasard() * TAU, poids: 0.6 + 0.4 * hasard() }));
    const r = F.map((f, k) => passeBande(f * (o.ouverture || 1), f / [75, 95, 130][k], TAUX)), g = [1, 0.55, 0.2];
    let souffle = 0;
    const att = o.attaque || 0.03, amorti = o.amorti || 0;
    for (let i = 0; i < n; i++) {
      const t = i / TAUX;
      let somme = 0;
      for (let k = 0; k < voix.length; k++) {
        const v = voix[k], u = t - v.retard;
        if (u < 0) continue;
        const contour = o.contour ? o.contour(u) : 1 - 0.04 * exp(-u * 30);
        const dt = v.f * contour * (1 + 0.007 * sin(TAU * v.vib * u + v.ph) * min(1, u * 3)) / TAUX;
        v.phase += dt; if (v.phase >= 1) v.phase -= 1;
        somme += (2 * v.phase - 1 - blep(v.phase, dt)) * v.poids * min(1, u / att) * exp(-u * amorti);
      }
      souffle += 0.6 * ((hasard() * 2 - 1) - souffle);
      const x = somme / sqrt(nbVoix) + souffle * (o.souffle || 0.1) * min(1, t / att);
      let y = 0;
      for (let k = 0; k < 3; k++) y += filtrer(r[k], x) * g[k];
      sortie[i] = y * min(1, (n - i) / (TAUX * 0.04));
    }
    return normaliser(sortie, 0.85);
  }
  /** Ajoute une sinusoïde amortie (un éclat, un mode de tôle) ; le temps boucle si « tour » est donné. */
  function sinusAmorti(d, debut, f, tau, amp, tour) {
    const n = min(ceil(tau * 7 * TAUX), d.length), w = TAU * f / TAUX;
    for (let i = 0; i < n; i++) {
      let at = debut + i;
      if (at >= d.length) { if (!tour) break; at -= d.length; }
      d[at] += sin(w * i) * amp * exp(-i / (tau * TAUX)) * min(1, i / 12);
    }
  }
  /** Ajoute une bouffée de bruit filtré (passe-bande), enveloppe en cloche ou percussive. */
  function bouffee(d, debut, longueur, f, q, amp, hasard, percussif, tour) {
    const r = passeBande(f, q, TAUX);
    for (let i = 0; i < longueur; i++) {
      let at = debut + i;
      if (at >= d.length) { if (!tour) break; at -= d.length; }
      const u = i / longueur, env = percussif ? exp(-u * 5) * min(1, i / 8) : sin(PI * u) ** 2;
      d[at] += filtrer(r, hasard() * 2 - 1) * amp * env;
    }
  }
  /** Une foule qui parle : dix voix en syllabes au hasard, voyelles et hauteurs changeantes, pauses ; boucle sans couture. */
  function rumeur() {
    const taux = 16000, duree = 6, fondu = 0.5, n = ceil((duree + fondu) * taux), d = new Float32Array(n), hasard = alea(4441);
    const voyelles = Object.values(FORMANTS);
    for (let k = 0; k < 10; k++) {
      const f0 = (k % 3 === 0 ? 205 : 112) * pow(2, (hasard() - 0.5) * 0.5), niveau = 0.5 + 0.5 * hasard();
      const f1 = passeBande(500, 5, taux), f2 = passeBande(1500, 8, taux);
      let at = floor(hasard() * 0.6 * taux), phase = hasard();
      while (at < n) {
        const longueur = floor((0.08 + 0.15 * hasard()) * taux), v = voyelles[floor(hasard() * voyelles.length)];
        regler(f1, v[0] * (0.9 + 0.2 * hasard()), 5, taux); regler(f2, v[1] * (0.9 + 0.2 * hasard()), 8, taux);
        const pente = (hasard() - 0.5) * 0.3, amp = niveau * (0.5 + 0.5 * hasard());
        for (let i = 0; i < longueur && at + i < n; i++) {
          const u = i / longueur, f = f0 * (1 + pente * u), dt = f / taux;
          phase += dt; if (phase >= 1) phase -= 1;
          const x = 2 * phase - 1 - blep(phase, dt) + (hasard() - 0.5) * 0.3;
          d[at + i] += (filtrer(f1, x) + 0.5 * filtrer(f2, x)) * amp * pow(sin(PI * u), 0.7);
        }
        at += longueur + floor((hasard() < 0.15 ? 0.3 + 0.6 * hasard() : 0.02 + 0.12 * hasard()) * taux);
      }
    }
    // Le début se fond dans la fin : la boucle n'a pas de couture.
    const m = floor(duree * taux), f = floor(fondu * taux), sortie = new Float32Array(m);
    for (let i = 0; i < m; i++) sortie[i] = d[i];
    for (let i = 0; i < f; i++) { const u = i / f; sortie[i] = d[i] * sqrt(u) + d[m + i] * sqrt(1 - u); }
    let bas = 0, bas2 = 0;
    for (let tour = 0; tour < 2; tour++) for (let i = 0; i < m; i++) { bas += 0.55 * (sortie[i] - bas); bas2 += 0.55 * (bas - bas2); if (tour) sortie[i] = bas2; }
    return { donnees: normaliser(sortie, 0.8), taux };
  }
  /** Mêlée : étoffes froissées, pas traînés, coups sourds et souffles, en boucle (les évènements débordent au début). */
  function bousculade() {
    const n = 5 * TAUX, d = new Float32Array(n), hasard = alea(5501);
    for (let k = 0; k < 140; k++) bouffee(d, floor(hasard() * n), floor((0.04 + 0.11 * hasard()) * TAUX), 1400 + 2600 * hasard(), 1.1, 0.2 + 0.3 * hasard(), hasard, false, true);
    for (let k = 0; k < 70; k++) bouffee(d, floor(hasard() * n), floor((0.05 + 0.05 * hasard()) * TAUX), 180 + 220 * hasard(), 0.8, 0.5 + 0.4 * hasard(), hasard, true, true);
    for (let k = 0; k < 34; k++) sinusAmorti(d, floor(hasard() * n), 70 + 60 * hasard(), 0.025, 0.5 + 0.4 * hasard(), true);
    for (let k = 0; k < 12; k++) {
      // Un « han ! » : une voix brève qui tombe.
      const at = floor(hasard() * n), longueur = floor((0.1 + 0.08 * hasard()) * TAUX), f0 = 100 + 70 * hasard(), F = FORMANTS[hasard() < 0.5 ? 'eu' : 'o'];
      const r1 = passeBande(F[0], 5, TAUX), r2 = passeBande(F[1], 7, TAUX);
      let phase = 0;
      for (let i = 0; i < longueur; i++) {
        const u = i / longueur, dt = f0 * (1.1 - 0.25 * u) / TAUX;
        phase += dt; if (phase >= 1) phase -= 1;
        const x = 2 * phase - 1 - blep(phase, dt);
        d[(at + i) % n] += (filtrer(r1, x) + 0.5 * filtrer(r2, x)) * 0.35 * sin(PI * u);
      }
    }
    return { donnees: normaliser(d, 0.8), taux: TAUX };
  }
  /** Feu de barricade : grondement qui vacille, crépitements serrés, quelques éclats ; boucle de 5 s. */
  function crepitement() {
    const n = 5 * TAUX, d = new Float32Array(n), hasard = alea(6607), phases = [hasard() * TAU, hasard() * TAU, hasard() * TAU];
    let b1 = 0, b2 = 0, h = 0;
    for (let i = 0; i < n; i++) {
      const t = i / TAUX, x = hasard() * 2 - 1;
      b1 += 0.09 * (x - b1); b2 += 0.09 * (b1 - b2); h += 0.5 * (x - h);
      // Fréquences de vacillement entières sur 5 s : la boucle retombe sur ses pieds.
      const vacille = 0.7 + 0.12 * sin(TAU * 0.6 * t + phases[0]) + 0.1 * sin(TAU * 1.4 * t + phases[1]) + 0.08 * sin(TAU * 2.2 * t + phases[2]);
      d[i] = b2 * 2.2 * vacille + (x - h) * 0.03;
    }
    for (let k = 0; k < 230; k++) {
      const at = floor(hasard() * n), longueur = floor((0.0006 + 0.003 * hasard()) * TAUX), amp = pow(hasard(), 3) * 1.4;
      for (let i = 0; i < longueur; i++) d[(at + i) % n] += (hasard() * 2 - 1) * amp * exp(-i / (longueur * 0.3));
    }
    for (let k = 0; k < 26; k++) sinusAmorti(d, floor(hasard() * n), 500 + 1100 * hasard(), 0.004 + 0.008 * hasard(), 0.3 + 0.4 * hasard(), true);
    return { donnees: normaliser(d, 0.8), taux: TAUX };
  }
  /** Jet d'eau : chuintement serré, éclaboussures, pression grave ; boucle de 4 s. */
  function eau() {
    const n = 4 * TAUX, d = new Float32Array(n), hasard = alea(7703);
    let b = 0, h1 = 0, h2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / TAUX, x = hasard() * 2 - 1;
      h1 += 0.35 * (x - h1); h2 += 0.35 * (h1 - h2); b += 0.04 * (x - b);
      d[i] = (x - h2) * 0.45 * (1 + 0.12 * sin(TAU * 17.25 * t) + 0.08 * sin(TAU * 23.5 * t)) + b * 1.1;
    }
    for (let k = 0; k < 320; k++) bouffee(d, floor(hasard() * n), floor((0.004 + 0.01 * hasard()) * TAUX), 800 + 2700 * hasard(), 2, 0.2 + 0.4 * hasard(), hasard, true, true);
    return { donnees: normaliser(d, 0.8), taux: TAUX };
  }
  /** Fond de ville : rumeur de la circulation (de 40 à 250 Hz environ, sans infra-grave), voitures qui passent au loin,
   *  air ; boucle de 10 s. */
  function ville() {
    const taux = 16000, n = 10 * taux, d = new Float32Array(n), hasard = alea(8807);
    let b1 = 0, b2 = 0, lent = 0, air = 0;
    for (let i = 0; i < n; i++) {
      const x = hasard() * 2 - 1;
      b1 += 0.045 * (x - b1); b2 += 0.045 * (b1 - b2); lent += 0.016 * (b2 - lent); air += 0.3 * (x - air);
      d[i] = (b2 - lent) * 5 + (x - air) * 0.015;
    }
    for (let k = 0; k < 4; k++) {
      // Une voiture au loin : un souffle de pneus qui monte, passe et s'éloigne, en glissant vers le grave.
      const longueur = floor((2.5 + 1.5 * hasard()) * taux), at = floor((k * 2.5 + hasard()) * taux), r = passeBande(900, 1.2, taux), amp = 0.35 + 0.2 * hasard();
      for (let i = 0; i < longueur; i++) {
        const u = i / longueur;
        if ((i & 63) === 0) regler(r, 900 - 500 * u, 1.2, taux);
        d[(at + i) % n] += filtrer(r, hasard() * 2 - 1) * amp * exp(-pow((u - 0.5) * 3.2, 2));
      }
    }
    return { donnees: normaliser(d, 0.7), taux };
  }
  /** Vitre qui éclate : un craquement, puis des dizaines d'éclats qui sonnent et rebondissent. */
  function eclats() {
    const n = ceil(0.8 * TAUX), d = new Float32Array(n), hasard = alea(9901);
    bouffee(d, 0, floor(0.006 * TAUX), 6000, 0.7, 1.2, hasard, true);
    for (let k = 0; k < 52; k++) {
      const depart = hasard() < 0.6 ? hasard() * 0.04 : -0.2 * Math.log(1 - 0.95 * hasard()), f = 2200 * pow(4, hasard());
      const amp = (0.2 + 0.5 * hasard()) * exp(-depart / 0.3), tau = 0.008 + 0.05 * hasard();
      sinusAmorti(d, floor(depart * TAUX), f, tau, amp);
      if (hasard() < 0.3) sinusAmorti(d, floor((depart + 0.05 + 0.1 * hasard()) * TAUX), f * 1.01, tau * 0.7, amp * 0.4);
    }
    bouffee(d, 0, floor(0.04 * TAUX), 350, 0.8, 0.5, hasard, true);
    return { donnees: normaliser(d, 0.85), taux: TAUX };
  }
  /** Ferraille : modes inharmoniques d'une tôle frappée, et trois rebonds plus faibles. */
  function ferraille(graine = 1103, f0 = 230, duree = 0.9) {
    const n = ceil(duree * TAUX), d = new Float32Array(n), hasard = alea(graine), rapports = [1, 2.32, 3.98, 5.12, 6.79, 8.21, 11.4];
    for (const [t0, a] of [[0, 1], [0.12, 0.35], [0.2, 0.25], [0.33, 0.18]]) {
      const at = floor(t0 * TAUX), f = f0 * (0.9 + 0.2 * hasard());
      rapports.forEach((r, k) => sinusAmorti(d, at, f * r, (0.7 - k * 0.08) * (0.4 + 0.6 * hasard()) * (duree / 0.9), a * 0.6 / (1 + k * 0.5)));
      bouffee(d, at, floor(0.01 * TAUX), 3000, 0.8, a * 0.6, hasard, true);
    }
    return { donnees: normaliser(d, 0.85), taux: TAUX };
  }
  /** Bois qui se brise : craquement, échardes, corps grave, morceaux qui retombent. */
  function bois() {
    const n = ceil(0.6 * TAUX), d = new Float32Array(n), hasard = alea(1201);
    bouffee(d, 0, floor(0.008 * TAUX), 2000, 1.2, 1.4, hasard, true);
    for (let k = 0; k < 12; k++) bouffee(d, floor(hasard() * 0.15 * TAUX), floor((0.01 + 0.02 * hasard()) * TAUX), 800 + 1700 * hasard(), 1.5, 0.4 + 0.3 * hasard(), hasard, true);
    for (const f of [180, 410, 690]) sinusAmorti(d, 0, f * (0.9 + 0.2 * hasard()), 0.02 + 0.02 * hasard(), 0.5);
    for (let k = 0; k < 3; k++) sinusAmorti(d, floor((0.25 + 0.25 * hasard()) * TAUX), 300 + 200 * hasard(), 0.012, 0.35);
    return { donnees: normaliser(d, 0.85), taux: TAUX };
  }
  /** Tôle de voiture enfoncée : froissement grave irrégulier, grands modes, panneau qui se déforme. */
  function tole() {
    const n = ceil(0.9 * TAUX), d = new Float32Array(n), hasard = alea(1307);
    let b = 0, pic = 0;
    for (let i = 0; i < ceil(0.4 * TAUX); i++) {
      if (hasard() < 0.004) pic = 0.6 + 0.4 * hasard();
      pic *= 0.9993; b += 0.12 * ((hasard() * 2 - 1) - b);
      d[i] += b * (0.3 + pic) * exp(-i / (0.25 * TAUX));
    }
    const f0 = 95 + 40 * hasard();
    [1, 1.83, 2.7, 3.9, 5.3].forEach((r, k) => sinusAmorti(d, 0, f0 * r, 0.25 + 0.4 * hasard(), 0.5 / (1 + k * 0.4)));
    let phase = 0;
    for (let i = 0; i < ceil(0.3 * TAUX); i++) { const u = i / (0.3 * TAUX); phase += TAU * (160 - 50 * u) / TAUX; d[i + floor(0.05 * TAUX)] += sin(phase) * 0.3 * (1 - u); }
    return { donnees: normaliser(d, 0.85), taux: TAUX };
  }
  /** Clameur « ooh » : la foule retient son souffle, la hauteur monte puis s'affaisse. */
  const oh = () => ({ donnees: chorale('o', 1.4, 16, 150, 1409, { etalement: 0.15, attaque: 0.15, amorti: 1.2, contour: u => 1 + 0.08 * min(1, u / 0.3) - 0.12 * max(0, u - 0.5), souffle: 0.2 }), taux: TAUX });
  /** Hourra : des voix qui montent, deux sifflets, des applaudissements. */
  function hourra() {
    const d = chorale('ai', 1.8, 16, 170, 1511, { etalement: 0.2, attaque: 0.06, amorti: 1.1, justesse: 120, contour: u => 1 + 0.25 * min(1, u / 0.25) - 0.15 * max(0, u - 0.6), souffle: 0.25 });
    const hasard = alea(1513);
    for (let k = 0; k < 2; k++) {
      const at = floor((0.1 + 0.3 * hasard()) * TAUX), f = 2300 + 600 * hasard();
      let phase = 0;
      for (let i = 0; i < 0.5 * TAUX && at + i < d.length; i++) { const u = i / (0.5 * TAUX); phase += TAU * f * (1 + 0.15 * u) / TAUX; d[at + i] += sin(phase) * 0.12 * sin(PI * u); }
    }
    for (let k = 0; k < 22; k++) bouffee(d, floor(hasard() * 1.6 * TAUX), floor(0.012 * TAUX), 1300 + 600 * hasard(), 1.3, 0.25 + 0.2 * hasard(), hasard, true);
    return { donnees: normaliser(d, 0.85), taux: TAUX };
  }
  const RECETTES = {
    rumeur, bousculade, crepitement, eau, ville, eclats, ferraille: () => ferraille(), bois, tole, oh, hourra,
    // Chants : une foule entière sur une syllabe, autour de 138 Hz et de son octave.
    'chant-o': () => ({ donnees: chorale('o', 0.6, 12, 138, 2101), taux: TAUX }),
    'chant-e': () => ({ donnees: chorale('e', 0.6, 12, 138, 2203), taux: TAUX }),
    'chant-a': () => ({ donnees: chorale('a', 0.6, 12, 138, 2309), taux: TAUX }),
    'chant-ou': () => ({ donnees: chorale('ou', 0.75, 12, 118, 2411, { souffle: 0.16 }), taux: TAUX }),
    'chant-he': () => ({ donnees: chorale('e', 0.32, 12, 150, 2503, { attaque: 0.012, amorti: 5, etalement: 0.03, souffle: 0.25, contour: u => 1 + 0.12 * min(1, u / 0.06) - 0.2 * max(0, u - 0.1) }), taux: TAUX }),
    // Cris d'une seule voix : « hé ! », « ho ! », « ouf ».
    'cri-he': () => ({ donnees: chorale('e', 0.3, 2, 190, 2609, { attaque: 0.01, amorti: 6, etalement: 0.01, justesse: 10, souffle: 0.3, contour: u => 1 + 0.15 * min(1, u / 0.05) - 0.25 * max(0, u - 0.08) }), taux: TAUX }),
    'cri-ho': () => ({ donnees: chorale('o', 0.32, 2, 140, 2707, { attaque: 0.012, amorti: 5, etalement: 0.01, justesse: 10, souffle: 0.25, contour: u => 1 + 0.1 * min(1, u / 0.05) - 0.2 * max(0, u - 0.1) }), taux: TAUX }),
    'cri-ouf': () => ({ donnees: chorale('eu', 0.22, 2, 125, 2801, { attaque: 0.008, amorti: 9, etalement: 0.01, justesse: 10, souffle: 0.4, contour: u => 1.1 - 0.5 * u }), taux: TAUX }),
  };
  const BANQUE = new Map();
  const NOMS_BANQUE = Object.freeze(Object.keys(RECETTES));
  function donneesBanque(nom) {
    let s = BANQUE.get(nom);
    if (!s) { s = RECETTES[nom](); BANQUE.set(nom, s); }
    return s;
  }
  let preparation = null;
  /** Calcule la banque de bruitages par tranches (un bruitage par tâche, en rendant la main entre deux) : aucun
   *  périphérique n'est ouvert. surProgres(0..1). */
  function prechauffer(surProgres) {
    if (NOMS_BANQUE.every(nom => BANQUE.has(nom))) { if (surProgres) surProgres(1); return Promise.resolve(true); }
    if (preparation) return preparation;
    const pause = () => new Promise(fin => (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout(fin, 0) : fin()));
    preparation = (async () => {
      for (let k = 0; k < NOMS_BANQUE.length; k++) {
        await pause();
        donneesBanque(NOMS_BANQUE[k]);
        if (surProgres) surProgres((k + 1) / NOMS_BANQUE.length);
      }
      return true;
    })();
    preparation.then(() => { preparation = null; }, () => { preparation = null; });
    return preparation;
  }

  // ---- Les sons ponctuels : priorité (1 ambiance, 2 monde, 3 joueur et annonces), délai minimal entre deux sons d'une
  // même source et d'une même direction, et force de l'effacement de la musique (1 : aucun). ----
  const SONS = {
    coup: [2, 0.05, 1], bouclier: [2, 0.05, 1], horsJeu: [2, 0.09, 1], casse: [2, 0.07, 0.72], barricadePosee: [2, 0.2, 1],
    barricadeFinie: [2, 0.3, 0.85], barricadeLevee: [2, 0.25, 0.85], lever: [2, 0.35, 0.8], feu: [2, 0.4, 0.82], jet: [2, 0.5, 0.9],
    salveAnnonce: [2, 0.3, 0.75], salve: [2, 0.12, 0.45], sifflet: [2, 0.35, 1], tambour: [2, 0.12, 1], sirene: [2, 0.8, 1],
    soin: [2, 1.0, 1], clameur: [2, 1.2, 0.85], marteau: [2, 0.08, 1], raclement: [2, 0.2, 1], cri: [2, 0.12, 1],
    chantierFini: [2, 0.4, 1], colere: [3, 1.5, 0.5],
    production: [3, 0.25, 1], lieuPris: [3, 0.6, 0.7], lieuPerdu: [3, 0.6, 0.62], lieuNeutralise: [3, 0.4, 1], alerte: [3, 1.0, 0.6],
    allianceFormee: [3, 1.0, 0.6], allianceRompue: [3, 1.0, 0.6], allianceProposee: [3, 0.8, 1], victoire: [3, 3, 0.22],
    defaite: [3, 3, 0.22], elimination: [3, 1.5, 0.4], qgOccupe: [3, 1.2, 0.45], qgRepris: [3, 1.2, 0.7], gisementEpuise: [3, 0.6, 1],
    clic: [3, 0.03, 1], survol: [3, 0.05, 1], selection: [3, 0.05, 1], ordre: [3, 0.09, 1], refus: [3, 0.25, 1], menu: [3, 0.08, 1],
  };
  const NOMS_SONS = Object.freeze(Object.keys(SONS));

  function create(options = {}) {
    /* Moteur sonore. Rien ne s'ouvre avant demarrer()/reprendre(), à appeler depuis un geste (clic, touche).
       demarrer() = start(), reprendre() = resume() → Promise ; preparer(cle) → Promise<bool> : AudioBuffers d'un morceau
       et de la banque, sans rien changer à ce qui joue ;
       sourdine(bool) ; mixage({ general, musique, effets, ambiance, interface }) (0..1) ;
       morceau(cle), intensite(0..1), musique(bool) : quel morceau, calme ou tendu, joue ou non ;
       actif(bool) : les ambiances et le séquenceur de rue tournent (partie ou démo en cours) ; pause(bool) ;
       ecoute(eloignement 0..1) : filtre de distance et écho selon la hauteur de la caméra ;
       niveaux : objet à remplir (voir plus bas), puis ambiance() l'applique ; tick() à chaque image ;
       essai() → Promise<bool> : deux secondes de mixage ; annulerEssai() ; un son ponctuel par nom de SONS,
       appelé avec { niveau 0..1, pan -1..1, camp, sorte, … } ; stats ; liberer() = dispose(). */
    let ctx = options.contexte || null, maitre = null, effets = null, ambiance = null, busMusique = null, busInterface = null;
    let filtreEffets = null, filtreAmbiance = null, envoiEcho = null, tamponBruit = null, musique = null;
    const horsLigne = !!(ctx && typeof ctx.startRendering === 'function');
    let coupe = false, libere = false, echec = false, enJeu = false, enPause = false, musiqueOn = false, eloignement = 0.5;
    let cleMorceau = 'titre', intensiteMusique = 0;
    const mix = { general: 1, musique: 0.45, effets: 1, ambiance: 1, interface: 1 };
    const persistants = [], voix = new Set(), tampons = Object.create(null), reglages = [];
    const derniersTemps = new Float64Array(NOMS_SONS.length * 8).fill(-1e9), derniersNiveaux = new Float32Array(NOMS_SONS.length * 8);
    let graine = 0x96f3, priorite = 2, indice = -1, niveauIndice = 1, dejaEfface = false, effaceJusqua = 0, profondeur = 1;
    let essaiEnCours = null, serieEssai = 0, api = null, amb = null, dernierTick = 0;
    // Musique un peu plus haut que dans FERRO : le titre n'a qu'elle, et la rue d'un RTS est plus dense qu'un couloir.
    const GAIN_MUSIQUE = 0.8, GAIN_EFFETS = 0.9, GAIN_AMBIANCE = 0.9, GAIN_INTERFACE = 0.75;
    const stats = { voix: 0, picVoix: 0, sautes: 0, volees: 0, parPriorite: [0, 0, 0, 0], attenuation: GAIN_MUSIQUE, essai: false,
      plafond: 1, ambiances: false, pasDeRue: 0, pasMusique: 0, joues: 0 };
    /** Niveaux d'ambiance, remplis par son.js puis appliqués par ambiance() : 0..1, pans -1..1. Par camp (0, 1, 2) :
     *  chants, tambours, sifflets et le pan de ce camp dans la vue. */
    const niveaux = { foule: 0, foulePan: 0, ville: 0, altitude: 0, melee: 0, meleePan: 0, bouclier: 0, feu: 0, feuPan: 0,
      sirene: 0, sirenePan: 0, jet: 0, jetPan: 0, chantier: 0, chantierPan: 0, lever: 0, leverPan: 0, radio: 0,
      chants: new Float32Array(3), tambours: new Float32Array(3), sifflets: new Float32Array(3), pans: new Float32Array(3) };
    // Le séquenceur de rue : une double-croche par rangée de la musique (horloge propre à 100 BPM quand elle se tait),
    // cycles de deux mesures ; vagues de chants des deux camps qui chantent.
    const PAS_RUE = 60 / 100 / 4;
    let prochainPas = 0, pasRue = 0, prochaineVille = 0, prochaineRadio = 0, sireneJusqua = 0, sireneReprise = 0;
    // Quand la musique joue, c'est elle qui donne la mesure à la rue (surRangee) ; sinon, l'horloge propre à 100 BPM.
    let pasDuree = PAS_RUE, musiqueMene = -1e9;
    const vagues = [{ chante: false, reste: 2, motif: 0 }, { chante: false, reste: 3, motif: 2 }];
    // Chants : [pas, syllabe, demi-tons, durée (pas), accent]. Deux pour la Convergence, un pour le Bastion.
    const CHANTS = [
      [[0, 'chant-o', 0, 2, 1], [4, 'chant-e', 0, 2, 0.85], [8, 'chant-o', 2, 1, 0.8], [10, 'chant-e', 2, 1, 0.8], [12, 'chant-o', 0, 3, 1],
        [16, 'chant-a', 3, 2, 1], [20, 'chant-a', 3, 2, 0.85], [24, 'chant-o', 2, 1, 0.8], [26, 'chant-e', 0, 1, 0.8], [28, 'chant-o', -2, 3, 1]],
      [[0, 'chant-he', 0, 1, 1], [2, 'chant-he', 0, 1, 0.9], [4, 'chant-he', 2, 1, 1], [6, 'chant-o', 2, 2, 1],
        [16, 'chant-he', 0, 1, 1], [18, 'chant-he', 0, 1, 0.9], [20, 'chant-he', 3, 1, 1], [22, 'chant-o', 0, 2, 1]],
      [[0, 'chant-ou', 0, 3, 1], [8, 'chant-ou', 0, 3, 1], [16, 'chant-ou', 0, 3, 1], [24, 'chant-ou', -2, 4, 1]],
    ];
    const FRAPPES = ['surdoOuvert', 'surdoEtouffe', 'caixa', 'tamborim', 'agogoHaut', 'agogoBas', 'claque', 'grosseCaisse', 'tambour', 'roulement'];
    const CRIS = ['cri-he', 'cri-ho', 'cri-ouf'];

    const garder = n => (persistants.push(n), n);
    const hasard = () => { graine = (imul(graine, 1664525) + 1013904223) | 0; return (graine >>> 0) / 4294967296; };
    function nettoyer(entree) {
      for (const n of entree.noeuds) try { n.disconnect(); } catch (_) { /* déjà détaché */ }
      if (voix.delete(entree)) stats.parPriorite[entree.priorite]--;
      stats.voix = voix.size;
    }
    function suivre(source, noeuds, niveau) {
      const entree = { source, noeuds, priorite, niveau: niveau || 0, essai: essaiEnCours ? essaiEnCours.id : 0 };
      voix.add(entree); stats.parPriorite[priorite]++;
      stats.voix = voix.size; stats.picVoix = max(stats.picVoix, voix.size); stats.joues++;
      source.onended = () => nettoyer(entree);
    }
    const enMarche = () => !!ctx && (horsLigne || ctx.state === 'running');
    const disponible = () => enMarche() && !libere && (!coupe || !!essaiEnCours);
    /** Une place pour une voix : l'ambiance a 32 voix, le monde 40, le joueur et les annonces les 8 dernières. Un son
     *  plus important peut prendre la place d'un son moins important et plus faible ; jamais celle de la musique. */
    function reserver(niveau, bus) {
      const volume = bus === ambiance ? mix.ambiance : bus === busInterface ? mix.interface : mix.effets;
      if (!disponible() || niveau <= 0.0001 || volume <= 0) return false;
      const limite = priorite < 2 ? 32 : priorite === 2 ? 40 : 48;
      if (voix.size >= limite) {
        let candidat = null;
        for (const v of voix) if (v.priorite < priorite && (!candidat || v.priorite < candidat.priorite || (v.priorite === candidat.priorite && v.niveau < candidat.niveau))) candidat = v;
        if (!candidat) { stats.sautes++; return false; }
        try { candidat.source.stop(ctx.currentTime); } catch (_) { /* déjà arrêtée */ }
        nettoyer(candidat); stats.volees++;
      }
      return true;
    }
    /** La musique s'efface un instant sous un son fort ; jamais sous l'ambiance, et jamais si les effets sont muets. */
    function effacerMusique() {
      if (dejaEfface || !busMusique || indice < 0 || mix.effets <= 0 || priorite < 2) return;
      let force = SONS[NOMS_SONS[indice]][2];
      if (force >= 1) return;
      force = 1 - (1 - force) * min(1, max(0, niveauIndice) * 1.25);
      dejaEfface = true;
      const maintenant = ctx.currentTime, tenue = force < 0.4 ? 0.6 : 0.2;
      profondeur = maintenant < effaceJusqua ? min(profondeur, force) : force;
      effaceJusqua = max(effaceJusqua, maintenant + tenue);
      busMusique.gain.cancelScheduledValues(maintenant);
      busMusique.gain.setTargetAtTime(GAIN_MUSIQUE * profondeur * (enPause ? 0.5 : 1), maintenant, 0.008);
      busMusique.gain.setTargetAtTime(GAIN_MUSIQUE * (enPause ? 0.5 : 1), effaceJusqua, 0.22);
      stats.attenuation = GAIN_MUSIQUE * profondeur;
    }
    function majMaitre() {
      if (!ctx || !maitre || libere) return;
      const maintenant = ctx.currentTime;
      maitre.gain.cancelScheduledValues(maintenant);
      maitre.gain.setTargetAtTime(coupe && !essaiEnCours ? 0 : 0.65 * mix.general, maintenant, 0.025);
      // Une coupure sur l'horloge audio garantit la fin de l'essai même si les minuteries du fil principal ralentissent.
      if (essaiEnCours && coupe) {
        maitre.gain.setValueAtTime(0.65 * mix.general, max(maintenant, essaiEnCours.fin - 0.018));
        maitre.gain.linearRampToValueAtTime(0, essaiEnCours.fin);
      }
    }
    /** Le son d'une source ponctuelle passe-t-il ? Un même son, dans la même direction, attend « intervalle » secondes,
     *  sauf s'il est nettement plus fort. Rend le niveau (0 : rien ne joue). */
    let panSon = 0;
    function evenement(e) {
      if (!disponible() || indice < 0) return 0;
      const niveau = borner(e && Number.isFinite(e.niveau) ? e.niveau : 1, 0, 1), pan = borner(e && Number.isFinite(e.pan) ? e.pan : 0, -1, 1);
      const k = indice * 8 + round(pan * 3) + 3, maintenant = ctx.currentTime;
      if (niveau < 0.018 || (maintenant - derniersTemps[k] < SONS[NOMS_SONS[indice]][1] && niveau <= derniersNiveaux[k] * 1.45)) { stats.sautes++; return 0; }
      derniersTemps[k] = maintenant; derniersNiveaux[k] = niveau; panSon = pan;
      return niveau;
    }
    function panoramique(valeur) {
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = borner(Number(valeur) || 0, -1, 1); return p; }
      return ctx.createGain();
    }
    /** Ton : oscillateur glissant de f à fin, enveloppe percussive (FERRO, tone) ; attaque réglable. */
    function ton(f, fin, duree, niveau, forme, decalage, pan, coupure, bus, attaque) {
      if (!reserver(niveau, bus)) return;
      effacerMusique();
      const t = ctx.currentTime + (decalage || 0), o = ctx.createOscillator(), g = ctx.createGain(), p = panoramique(pan), noeuds = [o, g, p];
      o.type = forme || 'sine';
      o.frequency.setValueAtTime(max(1, f), t);
      if (fin && fin !== f) o.frequency.exponentialRampToValueAtTime(max(1, fin), t + duree);
      const a = min(attaque || 0.005, duree / 3);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(niveau, t + a);
      g.gain.exponentialRampToValueAtTime(max(0.00011, niveau * 0.28), t + a + (duree - a) * 0.46);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      if (coupure) {
        const filtre = ctx.createBiquadFilter();
        filtre.type = 'lowpass'; filtre.frequency.value = coupure; filtre.Q.value = 0.65;
        o.connect(filtre); filtre.connect(g); noeuds.push(filtre);
      } else o.connect(g);
      g.connect(p); p.connect(bus || effets);
      suivre(o, noeuds, niveau);
      o.start(t); o.stop(t + duree + 0.03);
    }
    /** Bruit filtré (FERRO, noise) ; la fréquence du filtre peut glisser vers fFin ; attaque et Q réglables. */
    function bruit(duree, niveau, f, pan, decalage, type, bus, fFin, q, attaque) {
      if (!tamponBruit || !reserver(niveau, bus)) return;
      effacerMusique();
      const t = ctx.currentTime + (decalage || 0), s = ctx.createBufferSource(), filtre = ctx.createBiquadFilter(), g = ctx.createGain(), p = panoramique(pan);
      s.buffer = tamponBruit;
      filtre.type = type || 'bandpass'; filtre.Q.value = q || 0.7;
      filtre.frequency.setValueAtTime(f, t);
      if (fFin && fFin !== f) filtre.frequency.exponentialRampToValueAtTime(fFin, t + duree);
      const a = min(attaque || 0.004, duree / 2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(niveau, t + a);
      g.gain.exponentialRampToValueAtTime(max(0.00011, niveau * 0.18), t + a + (duree - a) * 0.52);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      s.connect(filtre); filtre.connect(g); g.connect(p); p.connect(bus || effets);
      suivre(s, [s, filtre, g, p], niveau);
      s.start(t, hasard() * 0.7); s.stop(t + duree + 0.02);
    }
    /** Joue un tampon de la banque (ou un instrument de la musique) : vitesse (hauteur), début et durée facultatifs. */
    function lire(nom, niveau, pan, decalage, vitesse, bus, debut, duree, attaque) {
      const b = tampons[nom];
      if (!b || !reserver(niveau, bus)) return;
      effacerMusique();
      const t = ctx.currentTime + (decalage || 0), s = ctx.createBufferSource(), g = ctx.createGain(), p = panoramique(pan);
      const v = vitesse || 1, reste = (b.duration - (debut || 0)) / v, d = duree ? min(duree, reste) : reste;
      s.buffer = b; s.playbackRate.value = v;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(niveau, t + (attaque || 0.004));
      if (duree && duree < reste) { g.gain.setValueAtTime(niveau, t + max(attaque || 0.004, d - 0.05)); g.gain.linearRampToValueAtTime(0, t + d); }
      s.connect(g); g.connect(p); p.connect(bus || effets);
      suivre(s, [s, g, p], niveau);
      s.start(t, debut || 0); s.stop(t + d + 0.01);
    }
    const frapper = (sorte, niveau, pan, decalage, bus, vitesse) => lire('frappe-' + sorte, niveau, pan, decalage, vitesse, bus || ambiance);

    function tamponDe(donnees, taux) {
      const b = ctx.createBuffer(1, donnees.length, taux);
      if (b.copyToChannel) b.copyToChannel(donnees, 0); else b.getChannelData(0).set(donnees);
      return b;
    }
    /** AudioBuffers de la banque et des instruments partagés avec la musique (sifflet, coups de batterie). */
    function chargerTampons() {
      for (const nom of NOMS_BANQUE) if (!tampons[nom] && BANQUE.has(nom)) { const s = BANQUE.get(nom); tampons[nom] = tamponDe(s.donnees, s.taux); }
      const M = PDR.musique;
      if (M) {
        if (!tampons.sifflet) { const s = M.son('sifflet'); tampons.sifflet = tamponDe(s.donnees, s.taux); }
        for (const sorte of FRAPPES) if (!tampons['frappe-' + sorte]) { const s = M.frappe(sorte); tampons['frappe-' + sorte] = tamponDe(s.donnees, s.taux); }
      }
    }
    /** Les ambiances continues : sources en boucle, réglées par ambiance(). Une seule fois, quand la banque est prête. */
    function construireAmbiances() {
      if (amb || !ctx || libere) return;
      chargerTampons();
      if (NOMS_BANQUE.some(nom => !tampons[nom])) return;
      const maintenant = ctx.currentTime;
      const gain = v => { const g = garder(ctx.createGain()); g.gain.value = v; return g; };
      const filtre = (type, f, q) => { const n = garder(ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q || 0.7; return n; };
      const boucle = (nom, vitesse, debut, sortie) => {
        const s = garder(ctx.createBufferSource());
        s.buffer = tampons[nom]; s.loop = true; s.playbackRate.value = vitesse; s.connect(sortie);
        s.start(maintenant, debut % tampons[nom].duration);
        return s;
      };
      const voie = (bus, avecPan = true) => {
        const g = gain(0), p = avecPan ? garder(panoramique(0)) : null;
        if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
        return { g, p };
      };
      amb = {};
      // Rumeur de la foule : deux lectures décalées de la même boucle, à des vitesses voisines, ne se répètent pas.
      amb.foule = voie(ambiance);
      const doux = filtre('lowpass', 2800, 0.5); doux.connect(amb.foule.g);
      boucle('rumeur', 1, 0, doux); boucle('rumeur', 0.93, 2.7, doux);
      amb.ville = voie(ambiance, false); boucle('ville', 1, 0, amb.ville.g);
      amb.vent = voie(ambiance, false);
      const souffle = filtre('bandpass', 520, 0.6); souffle.connect(amb.vent.g);
      const air = garder(ctx.createBufferSource()); air.buffer = tamponBruit; air.loop = true; air.connect(souffle); air.start(maintenant);
      amb.melee = voie(ambiance); boucle('bousculade', 1, 0, amb.melee.g);
      amb.feu = voie(ambiance); boucle('crepitement', 1, 0, amb.feu.g);
      // Le canon à eau : le chuintement adouci au-dessus de 6 kHz, et le moteur du camion au ralenti.
      amb.jet = voie(effets);
      const doucheJet = filtre('lowpass', 6000, 0.5); doucheJet.connect(amb.jet.g); boucle('eau', 1, 0, doucheJet);
      const moteur = garder(ctx.createOscillator()), grave = filtre('lowpass', 300, 0.8), niveauMoteur = gain(0.22);
      moteur.type = 'sawtooth'; moteur.frequency.value = 58; moteur.connect(grave); grave.connect(niveauMoteur); niveauMoteur.connect(amb.jet.g); moteur.start(maintenant);
      // Sirène : un carré adouci que balaie un triangle lent (de 600 à 1 200 Hz), et son octave grave.
      amb.sirene = voie(ambiance);
      const s1 = garder(ctx.createOscillator()), s2 = garder(ctx.createOscillator()), lfo = garder(ctx.createOscillator());
      const p1 = gain(300), p2 = gain(150), adouci = filtre('lowpass', 2600, 0.6), corps = gain(0.35);
      s1.type = 'square'; s1.frequency.value = 900; s2.type = 'triangle'; s2.frequency.value = 450;
      lfo.type = 'triangle'; lfo.frequency.value = 0.18;
      lfo.connect(p1); p1.connect(s1.frequency); lfo.connect(p2); p2.connect(s2.frequency);
      s1.connect(adouci); s2.connect(corps); corps.connect(adouci); adouci.connect(amb.sirene.g);
      for (const o of [s1, s2, lfo]) o.start(maintenant);
      for (const [cle, voieSon, facteur] of [['foule', amb.foule, 0.6], ['ville', amb.ville, 0.32], ['vent', amb.vent, 0.18], ['melee', amb.melee, 0.42],
        ['feu', amb.feu, 0.5], ['jet', amb.jet, 0.42], ['sirene', amb.sirene, 0.05]]) {
        reglages.push({ cle, param: voieSon.g.gain, pan: voieSon.p ? voieSon.p.pan : null, facteur, valeur: 0, valeurPan: 0 });
      }
      stats.ambiances = true;
      appliquer();
    }
    function initialiser() {
      if (ctx && maitre) return;
      if (libere || echec) return;
      const Contexte = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!ctx && !Contexte) { echec = true; return; }
      try {
        if (!ctx) ctx = new Contexte();
        maitre = garder(ctx.createGain());
        maitre.gain.value = coupe ? 0 : 0.65 * mix.general;
        const limiteur = garder(ctx.createDynamicsCompressor());
        limiteur.threshold.value = -19; limiteur.knee.value = 18; limiteur.ratio.value = 5; limiteur.attack.value = 0.004; limiteur.release.value = 0.18;
        // Plafond doux de FERRO : exactement linéaire sous 0,875, borné au-dessus, même si tout tombe en même temps.
        const garde = garder(ctx.createWaveShaper()), courbe = new Float32Array(2049);
        for (let i = 0; i < courbe.length; i++) {
          const x = i / 1024 - 1, a = abs(x);
          courbe[i] = Math.sign(x) * (a <= 0.875 ? a : 0.875 + 0.095 * (1 - exp(-(a - 0.875) / 0.095)));
        }
        garde.curve = courbe; garde.oversample = 'none'; stats.plafond = courbe[courbe.length - 1];
        maitre.connect(limiteur); limiteur.connect(garde); garde.connect(ctx.destination);
        // Les sons du monde passent par un filtre de distance : de haut, la ville s'entend plus sourde. Un passe-haut
        // retire l'infra-grave, qui ne s'entend pas et mangerait la marge du limiteur.
        const passeHaut = (f) => { const n = garder(ctx.createBiquadFilter()); n.type = 'highpass'; n.frequency.value = f; n.Q.value = 0.7; return n; };
        effets = garder(ctx.createGain()); effets.gain.value = GAIN_EFFETS * mix.effets;
        filtreEffets = garder(ctx.createBiquadFilter()); filtreEffets.type = 'lowpass'; filtreEffets.frequency.value = 12000; filtreEffets.Q.value = 0.5;
        const hautEffets = passeHaut(35);
        effets.connect(hautEffets); hautEffets.connect(filtreEffets); filtreEffets.connect(maitre);
        ambiance = garder(ctx.createGain()); ambiance.gain.value = GAIN_AMBIANCE * mix.ambiance;
        filtreAmbiance = garder(ctx.createBiquadFilter()); filtreAmbiance.type = 'lowpass'; filtreAmbiance.frequency.value = 12000; filtreAmbiance.Q.value = 0.5;
        const hautAmbiance = passeHaut(50);
        ambiance.connect(hautAmbiance); hautAmbiance.connect(filtreAmbiance); filtreAmbiance.connect(maitre);
        busMusique = garder(ctx.createGain()); busMusique.gain.value = GAIN_MUSIQUE; busMusique.connect(maitre);
        busInterface = garder(ctx.createGain()); busInterface.gain.value = GAIN_INTERFACE * mix.interface; busInterface.connect(maitre);
        // L'écho des façades : un retard court, adouci, qui revient un peu sur lui-même (FERRO : l'écho des salles).
        envoiEcho = garder(ctx.createGain()); envoiEcho.gain.value = 0.1;
        const retard = garder(ctx.createDelay(0.5)), amorti = garder(ctx.createBiquadFilter()), retour = garder(ctx.createGain());
        retard.delayTime.value = 0.137; amorti.type = 'lowpass'; amorti.frequency.value = 1900; retour.gain.value = 0.22;
        filtreEffets.connect(envoiEcho); envoiEcho.connect(retard); retard.connect(amorti); amorti.connect(maitre); amorti.connect(retour); retour.connect(retard);
        tamponBruit = ctx.createBuffer(1, floor(ctx.sampleRate * 2), ctx.sampleRate);
        const bruitBrut = tamponBruit.getChannelData(0);
        let doux = 0;
        for (let i = 0; i < bruitBrut.length; i++) { const blanc = hasard() * 2 - 1; doux = doux * 0.96 + blanc * 0.04; bruitBrut[i] = blanc * 0.64 + doux * 0.55; }
        if (PDR.musique) {
          musique = PDR.musique.creer(ctx, busMusique);
          if (musique.rythme) musique.rythme(surRangee);
          musique.choisir(cleMorceau); musique.volume(mix.musique); musique.intensite(intensiteMusique); musique.jouer(musiqueOn || !!essaiEnCours);
        }
        // La banque se calcule par tranches si le chargement ne l'a pas déjà fait ; les ambiances naissent ensuite.
        if (NOMS_BANQUE.every(nom => BANQUE.has(nom))) construireAmbiances();
        else prechauffer().then(construireAmbiances, () => {});
      } catch (_) {
        echec = true;
        if (ctx && !options.contexte) { try { ctx.close().catch(() => {}); } catch (__) { /* contexte déjà fermé */ } }
        ctx = null; maitre = null;
      }
    }
    function reprendre() {
      initialiser();
      if (!ctx || libere) return Promise.resolve();
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        if (horsLigne) return Promise.resolve();
        try { return ctx.resume().catch(() => {}); } catch (_) { /* reprise refusée */ }
      }
      return Promise.resolve();
    }

    /** Applique les niveaux d'ambiance (seulement ce qui a changé), et le volume des bus. */
    function appliquer() {
      if (!amb || !ctx || libere) return;
      const maintenant = ctx.currentTime, ouvert = (enJeu || !!essaiEnCours) && !enPause ? 1 : 0;
      for (const r of reglages) {
        let v = 0, pan = 0;
        switch (r.cle) {
          case 'foule': v = niveaux.foule; pan = niveaux.foulePan; break;
          case 'ville': v = niveaux.ville; break;
          case 'vent': v = niveaux.ville * (0.3 + niveaux.altitude); break;
          case 'melee': v = niveaux.melee; pan = niveaux.meleePan; break;
          case 'feu': v = niveaux.feu; pan = niveaux.feuPan; break;
          case 'jet': v = niveaux.jet; pan = niveaux.jetPan; break;
          case 'sirene': v = niveaux.sirene * (maintenant < sireneJusqua ? 1 : 0); pan = niveaux.sirenePan; break;
          default: break;
        }
        v = borner(v, 0, 1) * r.facteur * ouvert;
        if (abs(v - r.valeur) > 0.002 || (v === 0 && r.valeur !== 0)) { r.param.setTargetAtTime(v, maintenant, v > r.valeur ? 0.25 : 0.45); r.valeur = v; }
        if (r.pan && abs(pan - r.valeurPan) > 0.02) { r.pan.setTargetAtTime(borner(pan, -1, 1) * 0.85, maintenant, 0.2); r.valeurPan = pan; }
      }
    }
    function majEcoute() {
      if (!ctx || !filtreEffets || libere) return;
      const maintenant = ctx.currentTime, coupure = 15000 * pow(3800 / 15000, eloignement);
      filtreEffets.frequency.setTargetAtTime(coupure, maintenant, 0.15);
      filtreAmbiance.frequency.setTargetAtTime(coupure * 0.85, maintenant, 0.15);
      envoiEcho.gain.setTargetAtTime(0.08 + 0.09 * eloignement, maintenant, 0.3);
    }

    // ---- Le séquenceur de rue : chants, tambours et sifflets des camps en vue, mêlée, chantiers, ville. ----
    function syllabe(nom, demi, duree, niveau, pan, decalage) {
      lire(nom, niveau, pan, decalage, pow(2, demi / 12), ambiance, 0, duree, 0.02);
    }
    function jouerPas(pas, decalage) {
      const n = niveaux, p16 = pas & 15;
      if (pas === 0) for (let c = 0; c < 2; c++) {
        const v = vagues[c];
        if (--v.reste <= 0) {
          v.chante = !v.chante && n.chants[c] > 0.02;
          v.reste = v.chante ? 2 + floor(hasard() * 3) : 1 + floor(hasard() * 3);
          if (v.chante) v.motif = c === 0 ? floor(hasard() * 2) : 2;
        }
      }
      for (let c = 0; c < 2; c++) {
        const v = vagues[c], niveau = n.chants[c];
        if (!v.chante || niveau < 0.02) continue;
        for (const s of CHANTS[v.motif]) if (s[0] === pas) syllabe(s[1], s[2] + (c === 1 ? -3 : 0), s[3] * pasDuree + 0.06, 0.5 * niveau * s[4], n.pans[c] + (hasard() - 0.5) * 0.2, decalage);
        // Les mains de la Convergence, les boucliers frappés du Bastion, entre les syllabes.
        if (c === 0 && v.motif === 0 && (p16 === 6 || p16 === 14)) frapper('claque', 0.28 * niveau, n.pans[0], decalage);
        if (c === 1 && (p16 === 4 || p16 === 12)) {
          ton(230, 170, 0.09, 0.06 * niveau, 'triangle', decalage, n.pans[1], 1400, ambiance);
          bruit(0.05, 0.05 * niveau, 900, n.pans[1], decalage, 'lowpass', ambiance);
        }
      }
      const t0 = n.tambours[0], t1 = n.tambours[1];
      if (t0 > 0.02) {
        // Batucada : surdo étouffé sur les temps impairs, ouvert sur les pairs, caisse claire et tamborim quand elle est proche.
        if (p16 === 0 || p16 === 8) frapper('surdoEtouffe', 0.32 * t0, n.pans[0], decalage);
        if (p16 === 4 || p16 === 12) frapper('surdoOuvert', 0.42 * t0, n.pans[0], decalage);
        if (t0 > 0.25) frapper('caixa', (p16 % 4 === 3 ? 0.3 : 0.13) * t0, n.pans[0] + 0.08, decalage);
        if (t0 > 0.15 && (p16 === 0 || p16 === 3 || p16 === 6 || p16 === 10 || p16 === 13)) frapper('tamborim', 0.25 * t0, n.pans[0] - 0.1, decalage);
        if (t0 > 0.4) {
          if (p16 === 0 || p16 === 3 || p16 === 8 || p16 === 11) frapper('agogoHaut', 0.18 * t0, n.pans[0] + 0.15, decalage);
          else if (p16 === 6 || p16 === 14) frapper('agogoBas', 0.18 * t0, n.pans[0] + 0.15, decalage);
        }
      }
      if (t1 > 0.02) {
        // Marche du Bastion : grosse caisse sur les temps forts, caisse claire, roulement avant la reprise.
        if (p16 === 0 || p16 === 8) frapper('grosseCaisse', 0.36 * t1, n.pans[1], decalage);
        if (p16 === 4 || p16 === 12) frapper('tambour', 0.3 * t1, n.pans[1], decalage);
        if (t1 > 0.3 && (p16 === 14 || p16 === 15 || (pas === 31))) frapper('roulement', 0.16 * t1, n.pans[1], decalage);
      }
      // Sifflets : l'appel de la Convergence en tête de cycle, les coups de sifflet longs de la Préfecture.
      if (pas === 0 && n.sifflets[0] > 0.03 && hasard() < 0.05 + 0.3 * n.sifflets[0]) {
        const g = 0.32 * n.sifflets[0], p = n.pans[0];
        lire('sifflet', g, p, decalage, 1.32, ambiance, 0, 0.1); lire('sifflet', g, p, decalage + 0.16, 1.32, ambiance, 0, 0.1);
        lire('sifflet', g, p, decalage + 0.32, 1.4, ambiance, 0, 0.42);
      }
      if ((pas & 7) === 0 && n.sifflets[2] > 0.03 && hasard() < 0.03 + 0.08 * n.sifflets[2]) lire('sifflet', 0.3 * n.sifflets[2], n.pans[2], decalage, 0.98, ambiance, 0, 0.75);
      stats.pasDeRue++;
    }
    function aleatoires(maintenant, dt) {
      const n = niveaux;
      // Mêlée : jusqu'à 16 coups par seconde, des boucliers selon la part des unités protégées, quelques cris.
      if (n.melee > 0.02 && hasard() < n.melee * 16 * dt) {
        const g = n.melee * (0.5 + 0.5 * hasard()), p = borner(n.meleePan + (hasard() - 0.5) * 0.6, -1, 1), r = hasard(), d = hasard() * 0.05;
        if (r < n.bouclier * 0.45) bouclierInterne(g * 0.8, p, d, hasard() < 0.5 ? 1 : 2, ambiance);
        else if (r < 0.9) coupInterne(g * 0.8, p, d, ambiance);
        else lire(CRIS[floor(hasard() * 3)], 0.16 * g, p, d, 0.85 + 0.35 * hasard(), ambiance);
      }
      if (n.chantier > 0.02 && hasard() < n.chantier * 3 * dt) marteauInterne(0.7 * n.chantier, borner(n.chantierPan + (hasard() - 0.5) * 0.3, -1, 1), 0, ambiance);
      if (n.lever > 0.02 && hasard() < n.lever * 1.5 * dt) bruit(0.25, 0.06 * n.lever, 1500 + 700 * hasard(), n.leverPan, 0, 'bandpass', ambiance, 900, 1.2);
      // La ville au loin : un klaxon, des pigeons, un rideau de fer.
      if (n.ville > 0.1 && maintenant >= prochaineVille) {
        prochaineVille = maintenant + 7 + 9 * hasard();
        const p = hasard() * 1.6 - 0.8, g = n.ville * (1 - 0.6 * n.altitude), r = hasard();
        if (r < 0.4) { ton(392, 392, 0.22, 0.016 * g, 'square', 0, p, 1300, ambiance); ton(330, 330, 0.3, 0.016 * g, 'square', 0.26, p, 1300, ambiance); }
        else if (r < 0.7) for (let k = 0; k < 5; k++) bruit(0.05, 0.02 * g, 1300 + 500 * hasard(), p, k * 0.07, 'bandpass', ambiance);
        else bruit(1.1, 0.025 * g, 2600, p, 0, 'bandpass', ambiance, 1800, 3);
      }
      // La Préfecture se parle par radio : un grésillement, deux bips.
      if (n.radio > 0.05 && maintenant >= prochaineRadio) {
        prochaineRadio = maintenant + 5 + 6 * hasard();
        const g = n.radio, p = n.pans[2];
        bruit(0.09, 0.03 * g, 3300, p, 0, 'highpass', ambiance);
        ton(1450, 1450, 0.05, 0.02 * g, 'square', 0.1, p, 3200, ambiance); ton(1900, 1900, 0.06, 0.018 * g, 'square', 0.16, p, 3200, ambiance);
      }
      // Les sirènes hurlent par épisodes, tant que des véhicules de la Préfecture sont en vue.
      if (n.sirene > 0.05 && maintenant >= sireneReprise) { sireneJusqua = maintenant + 5 + 4 * hasard(); sireneReprise = sireneJusqua + 8 + 10 * hasard(); }
    }
    /** La musique donne la mesure : chaque rangée programmée (une double-croche) joue le pas de rue de même rang, au même
     *  instant. Les chants et les tambours de la rue tombent alors en place avec la fanfare. */
    function surRangee(temps, rangee, duree) {
      if (!ctx || libere || !enJeu || enPause || !amb || (coupe && !essaiEnCours)) return;
      musiqueMene = ctx.currentTime; pasDuree = duree;
      const prec = priorite, precIndice = indice;
      priorite = 1; indice = -1;
      jouerPas(rangee & 31, max(0, temps - ctx.currentTime));
      priorite = prec; indice = precIndice;
      pasRue = (rangee + 1) & 31;                                    // si la musique se tait, l'horloge propre reprend la phrase
      stats.pasMusique++;
    }
    function sequenceur(maintenant, dt) {
      if (!enJeu || enPause || !amb) { prochainPas = 0; return; }
      const prec = priorite;
      priorite = 1; indice = -1;
      if (maintenant - musiqueMene < 0.5) prochainPas = 0;          // la musique mène
      else {
        pasDuree = PAS_RUE;
        if (prochainPas < maintenant - 0.25) prochainPas = maintenant + 0.03;   // retard (onglet caché) : on se recale
        let garde = 0;
        while (prochainPas < maintenant + 0.12 && garde++ < 8) { jouerPas(pasRue, prochainPas - maintenant); pasRue = (pasRue + 1) & 31; prochainPas += PAS_RUE; }
      }
      aleatoires(maintenant, dt);
      priorite = prec;
    }
    function tick() {
      // La musique a ses propres voix : les sons du monde ne l'affament jamais. En sourdine, elle ne programme rien
      // (elle se recale sur une mesure en revenant).
      if (musique && (!coupe || essaiEnCours)) musique.tick();
      if (!enMarche() || libere) return;
      const maintenant = ctx.currentTime, dt = borner(maintenant - dernierTick, 0, 0.1);
      dernierTick = maintenant;
      if (maintenant >= effaceJusqua + 1) stats.attenuation = GAIN_MUSIQUE;
      if (!coupe || essaiEnCours) sequenceur(maintenant, dt);
      appliquer();
    }

    // ---- Sons partagés par plusieurs indices et par le séquenceur. ----
    function coupInterne(g, p, d, bus) {
      const k = hasard();
      ton(95 + 30 * k, 48, 0.11, 0.16 * g, 'sine', d, p, 0, bus);
      bruit(0.07, 0.12 * g, 700 + 300 * k, p, d, 'lowpass', bus);
      bruit(0.05, 0.06 * g, 2400, p, d + 0.008, 'bandpass', bus, 1500);
    }
    function bouclierInterne(g, p, d, camp, bus) {
      if (camp === 1) {
        // Les panneaux du Bastion : du contreplaqué.
        ton(240, 180, 0.13, 0.12 * g, 'triangle', d, p, 1600, bus); bruit(0.06, 0.1 * g, 1100, p, d, 'bandpass', bus, 0, 3); ton(90, 50, 0.12, 0.1 * g, 'sine', d, p, 0, bus);
      } else {
        // Les boucliers de la Préfecture : une plaque claire et creuse.
        ton(420, 360, 0.16, 0.09 * g, 'triangle', d, p, 2600, bus); bruit(0.045, 0.11 * g, 2600, p, d, 'bandpass', bus, 0, 2); ton(110, 60, 0.1, 0.09 * g, 'sine', d, p, 0, bus);
      }
    }
    function marteauInterne(g, p, d, bus) {
      const k = hasard();
      ton(1000 + 200 * k, 800, 0.04, 0.08 * g, 'triangle', d, p, 3500, bus);
      bruit(0.03, 0.07 * g, 3200, p, d, 'highpass', bus);
      ton(180, 120, 0.06, 0.05 * g, 'sine', d, p, 0, bus);
    }
    const NOTE = m => 440 * pow(2, (m - 69) / 12);
    /** Un petit motif cuivré (dents de scie adoucies) : les annonces du jeu. */
    function cuivres(notes, ecart, duree, g, p, coupure, bus, d0) {
      for (let k = 0; k < notes.length; k++) ton(NOTE(notes[k]), NOTE(notes[k]), duree, g, 'sawtooth', (d0 || 0) + k * ecart, p, coupure || 1900, bus || busInterface, 0.02);
    }

    api = {
      start: reprendre, resume: reprendre, demarrer: reprendre, reprendre,
      preparer(cle) {
        // Le geste a déjà ouvert le contexte : ceci ne fait que préparer des tampons, sans rien démarrer.
        if (libere) return Promise.resolve(false);
        const M = PDR.musique;
        return Promise.all([prechauffer(), M ? M.prechauffer(cle) : null]).then(() => {
          if (!ctx || libere) return false;
          chargerTampons(); construireAmbiances();
          return !!(musique && musique.preparer(cle));
        });
      },
      sourdine(valeur) { annulerEssai(); coupe = !!valeur; majMaitre(); },
      mixage(valeur) {
        for (const k in mix) if (valeur && Number.isFinite(valeur[k])) mix[k] = borner(valeur[k], 0, 1);
        if (!ctx || libere || !maitre) return;
        const maintenant = ctx.currentTime;
        majMaitre();
        effets.gain.setTargetAtTime(GAIN_EFFETS * mix.effets, maintenant, 0.025);
        ambiance.gain.setTargetAtTime(GAIN_AMBIANCE * mix.ambiance, maintenant, 0.025);
        busInterface.gain.setTargetAtTime(GAIN_INTERFACE * mix.interface, maintenant, 0.025);
        if (musique) musique.volume(mix.musique);
      },
      morceau(cle) { cleMorceau = cle; if (musique) musique.choisir(cle); },
      intensite(valeur) { intensiteMusique = borner(Number(valeur) || 0, 0, 1); if (musique) musique.intensite(intensiteMusique); },
      musique(valeur) { annulerEssai(); musiqueOn = !!valeur; if (musique) musique.jouer(musiqueOn); },
      actif(valeur) { enJeu = !!valeur; if (!enJeu) { niveaux.jet = 0; } appliquer(); },
      pause(valeur) {
        enPause = !!valeur;
        if (busMusique && ctx) { busMusique.gain.cancelScheduledValues(ctx.currentTime); busMusique.gain.setTargetAtTime(GAIN_MUSIQUE * (enPause ? 0.5 : 1), ctx.currentTime, 0.2); }
        appliquer();
      },
      ecoute(valeur) { const v = borner(Number(valeur) || 0, 0, 1); if (abs(v - eloignement) < 0.01) return; eloignement = v; majEcoute(); },
      niveaux,
      ambiance: appliquer,
      tick, stats,
      essai, annulerEssai,
      /** Vrai quand le contexte tourne (après un geste) et que le moteur n'est pas libéré. */
      get enMarche() { return enMarche() && !libere; },
      get contexte() { return ctx; },
      get lecteur() { return musique; },

      // ---- Le monde. e : { niveau, pan, camp, sorte, … } ----
      coup(e) { const g = evenement(e); if (g) coupInterne(g, panSon, 0, effets); },
      bouclier(e) { const g = evenement(e); if (g) bouclierInterne(g, panSon, 0, e && e.camp === 1 ? 1 : 2, effets); },
      horsJeu(e) {
        const g = evenement(e); if (!g) return;
        const h = e && e.camp === 1 ? 0.8 : e && e.camp === 2 ? 1 : 1.15, p = panSon;
        // Burlesque : un sifflet qui descend, une chute en douceur. Personne ne se fait mal.
        ton(1050 * h, 380 * h, 0.26, 0.05 * g, 'triangle', 0, p, 2400);
        bruit(0.12, 0.08 * g, 500, p, 0.14, 'lowpass');
        ton(80, 45, 0.14, 0.1 * g, 'sine', 0.15, p);
      },
      casse(e) {
        const g = evenement(e); if (!g) return;
        const p = panSon, k = hasard(), sorte = e && e.sorte;
        if (sorte === 'vitre') { bruit(0.03, 0.2 * g, 5200, p, 0, 'highpass'); lire('eclats', 0.5 * g, p, 0.005, 0.9 + 0.2 * k); ton(150, 70, 0.08, 0.06 * g, 'sine', 0, p); }
        else if (sorte === 'voiture') {
          lire('tole', 0.5 * g, p, 0, 0.9 + 0.15 * k); lire('eclats', 0.3 * g, p, 0.06, 1, effets, 0, 0.4); ton(70, 38, 0.3, 0.14 * g, 'sine', 0, p);
          // Une fois sur trois, l'alarme de la voiture s'affole et se tait aussitôt.
          if (k < 0.33) for (let i = 0; i < 2; i++) { ton(1650, 1650, 0.16, 0.03 * g, 'square', 0.35 + i * 0.36, p, 3000); ton(1250, 1250, 0.16, 0.03 * g, 'square', 0.53 + i * 0.36, p, 3000); }
        } else if (sorte === 'bois') { bruit(0.02, 0.18 * g, 2200, p, 0, 'bandpass'); lire('bois', 0.5 * g, p, 0.004, 0.9 + 0.2 * k); ton(130, 80, 0.1, 0.07 * g, 'triangle', 0, p, 900); }
        else if (sorte === 'structure') {
          lire('bois', 0.5 * g, p, 0, 0.85); lire('ferraille', 0.4 * g, p, 0.05, 0.75); lire('eclats', 0.25 * g, p, 0.1);
          ton(60, 32, 0.45, 0.16 * g, 'sine', 0, p); bruit(0.4, 0.15 * g, 600, p, 0.02, 'lowpass');
        } else { lire('ferraille', 0.45 * g, p, 0, 0.85 + 0.3 * k); bruit(0.05, 0.12 * g, 1800, p, 0, 'bandpass'); ton(110, 60, 0.12, 0.08 * g, 'sine', 0, p); }
      },
      barricadePosee(e) {
        const g = evenement(e); if (!g) return;
        for (let i = 0; i < 3; i++) { const d = i * 0.11 + 0.02 * hasard(); ton(260 + 140 * hasard(), 160, 0.09, 0.09 * g, 'triangle', d, panSon, 1200); bruit(0.05, 0.08 * g, 1000, panSon, d, 'bandpass'); }
        bruit(0.28, 0.05 * g, 2600, panSon, 0.05, 'bandpass', effets, 3200);
      },
      barricadeFinie(e) {
        const g = evenement(e); if (!g) return;
        for (const d of [0, 0.19]) { ton(900, 700, 0.045, 0.08 * g, 'triangle', d, panSon, 3000); bruit(0.03, 0.09 * g, 3000, panSon, d, 'highpass'); }
        lire('hourra', 0.22 * g, panSon, 0.35, 1.05, effets, 0, 0.9);
      },
      barricadeLevee(e) {
        const g = evenement(e); if (!g) return;
        lire('bois', 0.35 * g, panSon, 0, 0.8); lire('ferraille', 0.25 * g, panSon, 0.12, 0.7);
        bruit(0.35, 0.06 * g, 1800, panSon, 0, 'bandpass', effets, 900); lire('cri-ho', 0.18 * g, panSon, 0.02, 0.95);
      },
      lever(e) {
        const g = evenement(e); if (!g) return;
        // Un cliquet, des panneaux qui tombent, l'hydraulique qui souffle.
        for (let i = 0; i < 7; i++) bruit(0.012, 0.07 * g, 3800, panSon, i * 0.045, 'highpass');
        lire('ferraille', 0.35 * g, panSon, 0.32, 0.8); bruit(0.5, 0.05 * g, 5200, panSon, 0.2, 'highpass'); ton(70, 50, 0.3, 0.08 * g, 'sine', 0.32, panSon);
      },
      feu(e) {
        const g = evenement(e); if (!g) return;
        bruit(0.7, 0.16 * g, 300, panSon, 0, 'lowpass', effets, 1600, 0.7, 0.03);
        lire('crepitement', 0.3 * g, panSon, 0.05, 1.1, effets, 0.4, 0.8, 0.05); ton(80, 140, 0.4, 0.06 * g, 'sine', 0, panSon, 0, effets, 0.05);
      },
      jet(e) {
        const g = evenement(e); if (!g) return;
        bruit(0.45, 0.12 * g, 900, panSon, 0, 'highpass', effets, 2400, 0.7, 0.04); bruit(0.3, 0.1 * g, 180, panSon, 0, 'lowpass');
        ton(60, 52, 0.4, 0.06 * g, 'sawtooth', 0, panSon, 200);
      },
      salveAnnonce(e) {
        const g = evenement(e); if (!g) return;
        const delai = borner(e && Number.isFinite(e.delai) ? e.delai : 1.5, 0.5, 3), k = delai / 1.5;
        // Les boucliers battent de plus en plus vite, un long coup de sifflet, l'air se tend.
        for (const t of [0, 0.42, 0.76, 1.02, 1.2, 1.32]) { ton(330, 260, 0.08, 0.07 * g, 'triangle', t * k, panSon, 2000); bruit(0.04, 0.06 * g, 1400, panSon, t * k, 'bandpass'); }
        lire('sifflet', 0.3 * g, panSon, 0, 0.95, effets, 0, min(0.85, delai * 0.6));
        bruit(delai, 0.05 * g, 300, panSon, 0, 'bandpass', effets, 1300, 1.2, delai * 0.6);
      },
      salve(e) {
        const g0 = evenement(e); if (!g0) return;
        const g = g0 * (0.6 + 0.4 * min(1, sqrt((e && e.touchees) || 8) / 4.5)), p = panSon;
        // Un souffle et un choc sourd, pas une détonation : attaques lentes, rien d'aigu ni de claquant.
        bruit(0.55, 0.2 * g, 380, p, 0, 'bandpass', effets, 1500, 0.8, 0.06);
        bruit(0.7, 0.14 * g, 900, p, 0.08, 'lowpass', effets, 260, 0.7, 0.08);
        ton(92, 40, 0.5, 0.26 * g, 'sine', 0, p, 0, effets, 0.018);
        for (let i = 0; i < 5; i++) ton(300 + 120 * hasard(), 200, 0.07, 0.07 * g, 'triangle', 0.02 + i * 0.013, borner(p + (hasard() - 0.5) * 0.2, -1, 1), 1500);
        lire('oh', 0.2 * g, p, 0.12, 1.15, effets, 0, 0.7);
      },
      sifflet(e) {
        const g = evenement(e); if (!g) return;
        if (e && e.camp === 0) { for (const [d, l, v] of [[0, 0.1, 1.32], [0.16, 0.1, 1.32], [0.32, 0.42, 1.4]]) lire('sifflet', 0.3 * g, panSon, d, v, effets, 0, l); }
        else lire('sifflet', 0.3 * g, panSon, 0, e && e.camp === 2 ? 0.98 : 1.15, effets, 0, e && e.camp === 2 ? 0.75 : 0.3);
      },
      tambour(e) {
        const g = evenement(e); if (!g) return;
        if (e && e.camp === 1) { frapper('grosseCaisse', 0.45 * g, panSon, 0, effets); frapper('tambour', 0.3 * g, panSon, 0.02, effets); }
        else frapper('surdoOuvert', 0.5 * g, panSon, 0, effets);
      },
      sirene(e) {
        const g = evenement(e); if (!g) return;
        ton(600, 1300, 0.8, 0.05 * g, 'square', 0, panSon, 2400, effets, 0.05); ton(300, 650, 0.8, 0.03 * g, 'triangle', 0, panSon, 0, effets, 0.05);
      },
      soin(e) {
        const g = evenement(e); if (!g) return;
        cuivres([67, 71, 74], 0.12, 0.14, 0.045 * g, panSon, 1800, effets);
      },
      clameur(e) { const g = evenement(e); if (g) lire(e && e.sorte === 'hourra' ? 'hourra' : 'oh', 0.35 * g, panSon, 0, 0.95 + 0.1 * hasard()); },
      marteau(e) { const g = evenement(e); if (g) marteauInterne(g, panSon, 0, effets); },
      raclement(e) { const g = evenement(e); if (g) bruit(0.25, 0.06 * g, 1600 + 600 * hasard(), panSon, 0, 'bandpass', effets, 900, 1.2); },
      cri(e) {
        const g = evenement(e); if (!g) return;
        const camp = e && e.camp, nom = camp === 1 ? 'cri-ho' : camp === 2 ? 'cri-ouf' : 'cri-he';
        lire(nom, 0.2 * g, panSon, 0, camp === 1 ? 0.85 : 1 + 0.15 * hasard());
      },
      chantierFini(e) {
        const g = evenement(e); if (!g) return;
        marteauInterne(g, panSon, 0, effets); marteauInterne(g * 0.9, panSon, 0.21, effets);
        ton(NOTE(72), NOTE(72), 0.3, 0.035 * g, 'triangle', 0.42, panSon, 2400); ton(NOTE(79), NOTE(79), 0.4, 0.03 * g, 'triangle', 0.52, panSon, 2400);
      },
      colere(e) {
        const g = evenement(e); if (!g) return;
        // La colère du Bastion : un « hou ! » énorme, deux coups de grosse caisse, les boucliers qui s'entrechoquent.
        lire('chant-ou', 0.55 * g, panSon, 0, 0.78, effets, 0, 1.2, 0.05);
        frapper('grosseCaisse', 0.5 * g, panSon, 0, effets); frapper('grosseCaisse', 0.5 * g, panSon, 0.32, effets);
        lire('ferraille', 0.12 * g, panSon, 0.1, 0.6); bruit(0.9, 0.1 * g, 400, panSon, 0, 'bandpass', effets, 900, 0.8, 0.1);
      },

      // ---- Annonces : non spatialisées (un pan léger au plus), sur le bus d'interface. ----
      production(e) {
        const g = evenement(e); if (!g) return;
        const camp = e && e.camp;
        if (camp === 0) { lire('sifflet', 0.16 * g, 0, 0, 1.4, busInterface, 0, 0.09); lire('sifflet', 0.16 * g, 0, 0.12, 1.5, busInterface, 0, 0.12); }
        else if (camp === 1) { for (const d of [0, 0.16]) { ton(82, 50, 0.12, 0.13 * g, 'sine', d, 0, 0, busInterface); bruit(0.05, 0.05 * g, 500, 0, d, 'lowpass', busInterface); } }
        else { ton(1400, 1400, 0.05, 0.04 * g, 'square', 0, 0, 3000, busInterface); ton(1900, 1900, 0.07, 0.035 * g, 'square', 0.07, 0, 3000, busInterface); }
      },
      lieuPris(e) {
        const g = evenement(e); if (!g) return;
        const p = panSon * 0.4, camp = e && e.camp;
        if (e && e.ami === false) { ton(392, 392, 0.25, 0.06 * g, 'triangle', 0, p, 1200, busInterface); ton(330, 330, 0.4, 0.06 * g, 'triangle', 0.2, p, 1000, busInterface); return; }
        if (camp === 1) { cuivres([50, 57, 62], 0.14, 0.4, 0.07 * g, p, 1100); frapper('grosseCaisse', 0.4 * g, p, 0, busInterface); }
        else if (camp === 2) { for (const [m, d] of [[76, 0], [81, 0.1], [88, 0.2]]) ton(NOTE(m), NOTE(m), 0.3, 0.035 * g, 'square', d, p, 3000, busInterface); }
        else { cuivres([62, 66, 69, 74], 0.1, 0.32, 0.055 * g, p, 2200); lire('hourra', 0.18 * g, p, 0.2, 1, busInterface, 0, 1.2); }
      },
      lieuPerdu(e) {
        const g = evenement(e); if (!g) return;
        const p = panSon * 0.4;
        ton(440, 415, 0.3, 0.07 * g, 'sawtooth', 0, p, 1400, busInterface); ton(349, 330, 0.5, 0.07 * g, 'sawtooth', 0.22, p, 1100, busInterface);
        ton(70, 40, 0.3, 0.1 * g, 'sine', 0.22, p, 0, busInterface);
      },
      lieuNeutralise(e) {
        const g = evenement(e); if (!g) return;
        ton(660, 700, 0.08, 0.04 * g, 'triangle', 0, panSon * 0.4, 2000, busInterface); ton(880, 900, 0.1, 0.035 * g, 'triangle', 0.08, panSon * 0.4, 2400, busInterface);
      },
      alerte(e) {
        const g = evenement(e); if (!g) return;
        for (let i = 0; i < 2; i++) { ton(523, 523, 0.16, 0.07 * g, 'sawtooth', i * 0.36, panSon * 0.5, 1800, busInterface); ton(392, 392, 0.16, 0.07 * g, 'sawtooth', i * 0.36 + 0.18, panSon * 0.5, 1800, busInterface); }
      },
      allianceFormee(e) {
        const g = evenement(e); if (!g) return;
        [57, 64, 69, 73].forEach((m, k) => { ton(NOTE(m), NOTE(m), 1, 0.045 * g, 'triangle', k * 0.06, (k - 1.5) * 0.15, 2400, busInterface, 0.02); ton(NOTE(m + 12), NOTE(m + 12), 0.6, 0.015 * g, 'sine', k * 0.06, 0, 0, busInterface); });
      },
      allianceRompue(e) {
        const g = evenement(e); if (!g) return;
        ton(466, 440, 0.5, 0.06 * g, 'sawtooth', 0, -0.2, 1400, busInterface); ton(330, 311, 0.6, 0.06 * g, 'sawtooth', 0.05, 0.2, 1200, busInterface);
        bruit(0.05, 0.08 * g, 1800, 0, 0, 'bandpass', busInterface);
      },
      allianceProposee(e) {
        const g = evenement(e); if (!g) return;
        ton(659, 659, 0.14, 0.05 * g, 'sine', 0, 0, 0, busInterface); ton(784, 784, 0.22, 0.05 * g, 'sine', 0.14, 0, 0, busInterface);
      },
      victoire(e) {
        const g = evenement(e); if (!g) return;
        const base = e && e.camp === 1 ? 48 : e && e.camp === 2 ? 52 : 50;
        cuivres([base + 12, base + 16, base + 19, base + 24], 0.12, 0.3, 0.06 * g, 0, 2200);
        for (const m of [12, 16, 19, 24]) ton(NOTE(base + m), NOTE(base + m), 1.3, 0.05 * g, 'sawtooth', 0.5, (m - 18) * 0.03, 2000, busInterface, 0.03);
        lire('hourra', 0.4 * g, 0, 0.45, 1, busInterface);
        for (let i = 0; i < 4; i++) frapper('claque', 0.2 * g, (hasard() - 0.5) * 0.8, 0.6 + 0.2 * i + 0.05 * hasard(), busInterface);
      },
      defaite(e) {
        const g = evenement(e); if (!g) return;
        // Un trombone qui se désole, gentiment : la partie est perdue, pas les joueurs.
        [[62, 0, 0.35], [61, 0.42, 0.4], [60, 0.88, 0.45]].forEach(([m, d, l]) => ton(NOTE(m) / 2, NOTE(m) / 2, l, 0.08 * g, 'sawtooth', d, 0, 900, busInterface, 0.04));
        ton(NOTE(59) / 2, NOTE(58) / 2, 1.3, 0.08 * g, 'sawtooth', 1.4, 0, 800, busInterface, 0.05);
        lire('oh', 0.25 * g, 0, 1.4, 0.92, busInterface);
      },
      elimination(e) {
        const g = evenement(e); if (!g) return;
        ton(520, 130, 1.4, 0.07 * g, 'sawtooth', 0, 0, 1200, busInterface, 0.03); ton(260, 65, 1.4, 0.06 * g, 'triangle', 0, 0, 0, busInterface, 0.03);
        lire('oh', 0.3 * g, 0, 0.3, 1, busInterface);
      },
      qgOccupe(e) {
        const g = evenement(e); if (!g) return;
        if (e && e.ami === false) { ton(392, 392, 0.2, 0.07 * g, 'sawtooth', 0, 0, 2000, busInterface); ton(523, 523, 0.4, 0.07 * g, 'sawtooth', 0.18, 0, 2200, busInterface); lire('hourra', 0.3 * g, 0, 0.2, 1, busInterface); return; }
        for (let i = 0; i < 3; i++) { ton(196, 185, 0.3, 0.09 * g, 'sawtooth', i * 0.4, 0, 900, busInterface); frapper('grosseCaisse', 0.4 * g, 0, i * 0.4, busInterface); }
      },
      qgRepris(e) {
        const g = evenement(e); if (!g) return;
        [60, 64, 67].forEach((m, k) => ton(NOTE(m), NOTE(m), 0.7, 0.05 * g, 'triangle', k * 0.08, 0, 2400, busInterface, 0.02));
      },
      gisementEpuise(e) {
        const g = evenement(e); if (!g) return;
        bruit(0.04, 0.08 * g, 900, 0, 0, 'bandpass', busInterface); ton(330, 330, 0.15, 0.04 * g, 'triangle', 0.05, 0, 0, busInterface); ton(247, 247, 0.3, 0.04 * g, 'triangle', 0.2, 0, 0, busInterface);
      },

      // ---- Interface : sec, sans filtre de distance. ----
      clic(e) { const g = evenement(e); if (g) { ton(1800, 1500, 0.03, 0.05 * g, 'sine', 0, 0, 0, busInterface); bruit(0.012, 0.03 * g, 4200, 0, 0, 'highpass', busInterface); } },
      survol(e) { const g = evenement(e); if (g) ton(2400, 2300, 0.02, 0.015 * g, 'sine', 0, 0, 0, busInterface); },
      selection(e) {
        const g = evenement(e); if (!g) return;
        // Le motif du camp s'entend : rond (sinus), carré (carré adouci), chevron (triangle qui monte).
        const camp = e && e.camp, nombre = max(1, (e && e.n) || 1), h = 1 + 0.06 * min(5, Math.log2(nombre));
        const forme = camp === 1 ? 'square' : camp === 2 ? 'triangle' : 'sine', f = (camp === 1 ? 660 : camp === 2 ? 990 : 880) * h;
        ton(f, f * (camp === 2 ? 1.12 : 1.03), 0.06, 0.05 * g, forme, 0, 0, 3000, busInterface);
        if (nombre > 1) ton(f * 1.5, f * 1.5, 0.06, 0.035 * g, forme, 0.05, 0, 3000, busInterface);
      },
      ordre(e) {
        const g = evenement(e); if (!g) return;
        // Chaque camp accuse réception à sa façon. sorte : 'deplacer', 'attaquer', 'replier', 'tenir', 'outil', 'recolter', 'regrouper'.
        const camp = e && e.camp, sorte = (e && e.sorte) || 'deplacer', fort = sorte === 'attaquer' ? 1.3 : sorte === 'recolter' ? 0.7 : 1;
        const h = sorte === 'replier' ? 0.85 : sorte === 'tenir' ? 0.75 : sorte === 'attaquer' ? 1.12 : 1, bus = busInterface;
        if (camp === 1) {
          for (const d of sorte === 'regrouper' ? [0, 0.12, 0.24] : [0, 0.14]) { ton(85 * h, 50, 0.1, 0.13 * g * fort, 'sine', d, 0, 0, bus); bruit(0.05, 0.06 * g * fort, 500, 0, d, 'lowpass', bus); }
          lire('cri-ho', 0.1 * g * fort, 0, 0.02, 0.8 * h, bus, 0, 0.2);
        } else if (camp === 2) {
          bruit(0.07, 0.05 * g, 3500, 0, 0, 'highpass', bus);
          ton(1450 * h, 1450 * h, 0.05, 0.04 * g * fort, 'square', 0.07, 0, 3200, bus); ton(1950 * h, 1950 * h, 0.06, 0.035 * g * fort, 'square', 0.12, 0, 3200, bus);
          if (sorte === 'regrouper') ton(1950 * h, 1950 * h, 0.06, 0.035 * g, 'square', 0.2, 0, 3200, bus);
        } else {
          lire('sifflet', 0.14 * g * fort, 0, 0, 1.35 * h, bus, 0, 0.07);
          if (sorte === 'regrouper') lire('sifflet', 0.14 * g, 0, 0.1, 1.35 * h, bus, 0, 0.07);
          lire('cri-he', 0.12 * g * fort, 0, 0.05, 1.1 * h, bus, 0, 0.25);
        }
        if (sorte === 'outil') bruit(0.03, 0.05 * g, 2600, 0, 0.02, 'bandpass', bus, 0, 3);
      },
      refus(e) {
        const g = evenement(e); if (!g) return;
        ton(196, 175, 0.09, 0.08 * g, 'triangle', 0, 0, 1200, busInterface); ton(165, 147, 0.14, 0.08 * g, 'triangle', 0.1, 0, 1000, busInterface);
      },
      menu(e) {
        const g = evenement(e); if (!g) return;
        const ouvert = !(e && e.ouvert === false);
        bruit(0.12, 0.03 * g, ouvert ? 1200 : 2600, 0, 0, 'bandpass', busInterface, ouvert ? 2600 : 1200);
        ton(ouvert ? 520 : 780, ouvert ? 780 : 520, 0.1, 0.03 * g, 'sine', 0.02, 0, 0, busInterface);
      },

      liberer: dispose, dispose,
    };

    function annulerEssai() {
      serieEssai++;
      const precedent = essaiEnCours;
      if (!precedent) return;
      essaiEnCours = null; stats.essai = false;
      if (precedent.minuterie !== null) globalThis.clearTimeout(precedent.minuterie);
      for (const v of Array.from(voix)) if (v.essai === precedent.id) { try { v.source.stop(); } catch (_) { /* déjà arrêtée */ } nettoyer(v); }
      if (musique) musique.jouer(musiqueOn);
      if (busMusique && ctx) { busMusique.gain.cancelScheduledValues(ctx.currentTime); busMusique.gain.setTargetAtTime(GAIN_MUSIQUE * (enPause ? 0.5 : 1), ctx.currentTime, 0.03); }
      effaceJusqua = 0; profondeur = 1; stats.attenuation = GAIN_MUSIQUE;
      for (const k of ['foule', 'ville', 'melee']) niveaux[k] = precedent.avant[k];
      majMaitre(); appliquer();
    }
    /** Essai du mixage (menu des réglages) : deux secondes avec les vrais bus, les vrais volumes et la musique. */
    function essai(o) {
      annulerEssai();
      const serie = ++serieEssai;
      if (libere || (o && o.sourdine) || mix.general <= 0 || typeof globalThis.setTimeout !== 'function') return Promise.resolve(false);
      return reprendre().then(() => {
        if (!ctx || libere || serie !== serieEssai || !enMarche()) return false;
        const debut = ctx.currentTime, audition = { id: serie, fin: debut + 2, minuterie: null, rang: 0,
          avant: { foule: niveaux.foule, ville: niveaux.ville, melee: niveaux.melee } };
        essaiEnCours = audition; stats.essai = true; majMaitre();
        if (musique) musique.jouer(true);
        niveaux.foule = max(niveaux.foule, 0.6); niveaux.ville = max(niveaux.ville, 0.6); appliquer();
        const camp = o && (o.camp === 0 || o.camp === 1 || o.camp === 2) ? o.camp : 0;
        const etapes = [
          [0.02, () => api.ordre({ niveau: 1, camp, sorte: 'deplacer' })],
          [0.2, () => { priorite = 1; lire('chant-o', 0.35, -0.3, 0, 1, ambiance, 0, 0.3, 0.02); lire('chant-e', 0.3, -0.3, 0.3, 1, ambiance, 0, 0.3, 0.02); }],
          [0.4, () => api.coup({ niveau: 0.9, pan: 0.2 })],
          [0.7, () => api.casse({ niveau: 0.9, pan: -0.25, sorte: 'vitre' })],
          [1.05, () => api.sifflet({ niveau: 0.8, pan: 0.3, camp: 0 })],
          [1.45, () => api.salve({ niveau: 0.6, pan: 0, touchees: 10 })],
        ];
        function pompe() {
          if (essaiEnCours !== audition || libere) return;
          if (ctx.currentTime >= audition.fin || !enMarche()) { annulerEssai(); return; }
          while (audition.rang < etapes.length && ctx.currentTime - debut >= etapes[audition.rang][0]) {
            const prec = priorite; priorite = 2; etapes[audition.rang++][1](); priorite = prec;
          }
          tick();
          audition.minuterie = globalThis.setTimeout(pompe, 40);
        }
        pompe();
        return true;
      });
    }
    function dispose() {
      if (libere) return;
      annulerEssai();
      libere = true;
      if (musique) { musique.liberer(); musique = null; }
      for (const v of Array.from(voix)) { try { v.source.stop(); } catch (_) { /* déjà arrêtée */ } nettoyer(v); }
      for (const n of persistants) {
        try { if (n.stop) n.stop(); } catch (_) { /* déjà arrêtée */ }
        try { n.disconnect(); } catch (_) { /* déjà détaché */ }
      }
      persistants.length = 0; reglages.length = 0; amb = null; stats.ambiances = false;
      if (ctx && !options.contexte) { try { ctx.close().catch(() => {}); } catch (_) { /* déjà fermé */ } }
      ctx = null; tamponBruit = null;
    }
    // La priorité et l'effacement de la musique appartiennent à l'indice, pas aux formes d'onde : les composantes d'un
    // son gardent la même réservation et ne creusent la musique qu'une fois (FERRO).
    for (const nom of NOMS_SONS) {
      const methode = api[nom], k = NOMS_SONS.indexOf(nom);
      api[nom] = function (e) {
        if (e && typeof e === 'object' && Number.isFinite(e.niveau) && e.niveau <= 0.008) return;
        const prec = priorite, precIndice = indice, precNiveau = niveauIndice, precEfface = dejaEfface;
        priorite = e && e.important ? 3 : SONS[nom][0];
        indice = k; niveauIndice = e && typeof e === 'object' && Number.isFinite(e.niveau) ? borner(e.niveau, 0, 1) : 1; dejaEfface = false;
        try { methode(e); } finally { priorite = prec; indice = precIndice; niveauIndice = precNiveau; dejaEfface = precEfface; }
      };
    }
    return api;
  }

  PDR.audio = Object.freeze({ create, prechauffer, SONS: NOMS_SONS, BANQUE: NOMS_BANQUE });
})(globalThis.PDR = globalThis.PDR || {});
