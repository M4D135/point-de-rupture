// Rendu hors ligne d'un module de PDR.musique avec les règles du lecteur (moteur/musique.js, creer) : périodes de
// l'Amiga, volumes (échantillon, effet C), coupe de la note précédente (constante 1,5 ms, arrêt à 8 ms), silence C00
// (arrêt à 30 ms), gains et panoramiques des quatre pistes selon l'intensité, échantillons joués une seule fois (le
// lecteur n'a pas de boucle), interpolation linéaire (celle de Chrome pour un AudioBufferSourceNode).
// Outil de mesure : ne fait pas partie du jeu.
import fs from 'node:fs';
import vm from 'node:vm';

export const HORLOGE = 7093789.2, TAUX_MOD = HORLOGE / 856;

export function charger(fichier) {
  const scope = vm.createContext({ setTimeout, clearTimeout, performance });
  vm.runInContext(fs.readFileSync(fichier, 'utf8'), scope, { filename: fichier });
  return scope.PDR.musique;
}

/** Relit un module : ordre, motifs, échantillons (PCM en flottants /128, comme le lecteur). */
export function decoder(o) {
  const longueur = o[950], ordre = Array.from(o.subarray(952, 952 + longueur)), nbMotifs = Math.max(...ordre) + 1;
  let at = 1084 + nbMotifs * 1024;
  const echantillons = [];
  for (let i = 0; i < 31; i++) {
    const h = 20 + i * 30, n = ((o[h + 22] << 8) | o[h + 23]) * 2, volume = o[h + 25];
    const nom = Buffer.from(o.subarray(h, h + 22)).toString('latin1').replace(/\0+$/, '');
    const pcm = new Float32Array(n), brut = new Int8Array(o.buffer, o.byteOffset + at, n);
    for (let k = 0; k < n; k++) pcm[k] = brut[k] / 128;
    echantillons.push({ nom, n, volume, pcm, reprise: (o[h + 26] << 8) | o[h + 27], boucle: (o[h + 28] << 8) | o[h + 29] });
    at += n;
  }
  return { o, ordre, nbMotifs, echantillons };
}

/** Rend les positions données de la liste d'ordre. intensite : 0..1 (gains des pistes). Retourne { g, d, taux, duree,
 *  notes : [{ t, canal, echantillon, periode, volume }], rangees, dureeRangee }. */
export function rendre(mod, positions, intensite = 0, taux = 44100, pistesSeules = null) {
  const { o, ordre, echantillons } = mod;
  let bpm = 125, vitesse = 6, t = 0;
  const pistes = [0, 1, 2, 3].map(() => ({ echantillon: 0, volume: 64, voix: null, liste: [] }));
  const notes = [];
  let rangees = 0, dureeRangee = 0;
  for (const pos of positions) {
    for (let r = 0; r < 64; r++) {
      const base = 1084 + (ordre[pos] * 64 + r) * 16, lus = [];
      for (let c = 0; c < 4; c++) {
        const at = base + c * 4, a = o[at], b = o[at + 1], cc = o[at + 2];
        const e = { echantillon: (a & 240) | (cc >> 4), periode: ((a & 15) << 8) | b, effet: cc & 15, param: o[at + 3] };
        if (e.effet === 15 && e.param) { if (e.param < 32) vitesse = e.param; else bpm = e.param; }
        lus.push(e);
      }
      for (let c = 0; c < 4; c++) {
        const e = lus[c], p = pistes[c];
        if (e.echantillon) { p.echantillon = e.echantillon; p.volume = echantillons[e.echantillon - 1].volume; }
        if (e.effet === 12) p.volume = Math.min(64, e.param);
        if (e.periode) {
          const ins = echantillons[p.echantillon - 1];
          if (ins && ins.n >= 4) {
            if (p.voix && p.voix.fin > t) { p.voix.evenements.push({ t, cible: 0.0001, tau: 0.0015 }); p.voix.fin = Math.min(p.voix.fin, t + 0.008); }
            const vitesseLecture = 428 / e.periode, fin = t + (ins.n / TAUX_MOD) / vitesseLecture + 0.001;
            const v = { debut: t, pas: TAUX_MOD * vitesseLecture / taux, pcm: ins.pcm, volume: p.volume / 64, evenements: [], fin };
            p.voix = v; p.liste.push(v);
            notes.push({ t, canal: c, echantillon: p.echantillon, periode: e.periode, volume: p.volume });
          }
        } else if (e.effet === 12 && p.voix) {
          p.voix.evenements.push({ t, cible: p.volume / 64, tau: 0.002 });
          if (!p.volume && p.voix.fin > t + 0.03) p.voix.fin = t + 0.03;
        }
      }
      dureeRangee = 2.5 * vitesse / bpm;
      t += dureeRangee; rangees++;
    }
  }
  const duree = t, n = Math.ceil(duree * taux), g = new Float32Array(n), d = new Float32Array(n);
  const I = intensite, gains = [0.86 + 0.1 * I, 0.9 + 0.06 * I, 0.55 + 0.25 * I, 0.86 + 0.14 * I], pans = [-0.3, -0.05, 0.3, 0.06];
  const mono = new Float32Array(n);
  for (let c = 0; c < 4; c++) {
    if (pistesSeules && !pistesSeules.includes(c)) continue;
    mono.fill(0);
    for (const v of pistes[c].liste) {
      const i0 = Math.ceil(v.debut * taux), i1 = Math.min(n, Math.floor(v.fin * taux));
      let gain = 0, k = 0, cible = null, tau = 0;
      const rampe = 0.0015 * taux;
      for (let i = i0; i < i1; i++) {
        const temps = i / taux;
        while (k < v.evenements.length && v.evenements[k].t <= temps) { cible = v.evenements[k].cible; tau = v.evenements[k].tau; k++; }
        if (cible === null) gain = Math.min(1, (i - v.debut * taux) / rampe) * v.volume;
        else gain = cible + (gain - cible) * Math.exp(-1 / (tau * taux));
        // Le premier échantillon tombe parfois un cheveu avant `debut` (arrondi de ceil) : indice 0, pas -1.
        const x = (temps - v.debut) * v.pas * taux, brut = Math.floor(x), j = brut < 0 ? 0 : brut, f = brut < 0 ? 0 : x - brut;
        if (j + 1 >= v.pcm.length) { if (j < v.pcm.length) mono[i] += v.pcm[j] * (1 - f) * gain; continue; }
        mono[i] += (v.pcm[j] * (1 - f) + v.pcm[j + 1] * f) * gain;
      }
    }
    const x = (pans[c] + 1) / 2, gG = Math.cos(x * Math.PI / 2) * gains[c], gD = Math.sin(x * Math.PI / 2) * gains[c];
    for (let i = 0; i < n; i++) { g[i] += mono[i] * gG; d[i] += mono[i] * gD; }
  }
  return { g, d, taux, duree, notes, rangees, dureeRangee, bpm };
}

// ---- Analyse. ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
export const BANDES = [0, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 22050];
const ponderationA = f => {
  const f2 = f * f, ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * 1.2589;   // gain linéaire d'amplitude (0 dB à 1 kHz)
};
/** Densité spectrale moyenne (Welch, Hann, recouvrement de moitié) de la somme des puissances gauche et droite. */
export function spectre(g, d, taux, N = 8192) {
  const fen = new Float32Array(N), puissance = new Float64Array(N / 2 + 1), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) fen[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let trames = 0;
  for (const canal of [g, d]) {
    for (let at = 0; at + N <= canal.length; at += N / 2) {
      for (let i = 0; i < N; i++) { re[i] = canal[at + i] * fen[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= N / 2; k++) puissance[k] += re[k] * re[k] + im[k] * im[k];
      trames++;
    }
  }
  for (let k = 0; k <= N / 2; k++) puissance[k] /= trames || 1;
  return { puissance, pas: taux / N };
}
export function equilibre(sp) {
  const { puissance, pas } = sp, bandes = new Array(BANDES.length - 1).fill(0), bandesA = new Array(BANDES.length - 1).fill(0);
  let total = 0, totalA = 0, moment = 0, momentA = 0;
  for (let k = 1; k < puissance.length; k++) {
    const f = k * pas, p = puissance[k], a = ponderationA(f), pa = p * a * a;
    let b = 0;
    while (b < BANDES.length - 2 && f >= BANDES[b + 1]) b++;
    bandes[b] += p; bandesA[b] += pa; total += p; totalA += pa; moment += p * f; momentA += pa * f;
  }
  // Fréquence sous laquelle se trouvent 50 % et 85 % de l'énergie.
  let cumul = 0, mediane = 0, r85 = 0;
  for (let k = 1; k < puissance.length; k++) {
    cumul += puissance[k];
    if (!mediane && cumul >= 0.5 * total) mediane = k * pas;
    if (!r85 && cumul >= 0.85 * total) { r85 = k * pas; break; }
  }
  const part = (t, liste) => liste.map(x => x / (t || 1));
  const pb = part(total, bandes), pa = part(totalA, bandesA);
  return { bandes: pb, bandesA: pa, centroide: moment / (total || 1), centroideA: momentA / (totalA || 1), mediane, r85,
    grave: pb[0] + pb[1] + pb[2], aigu: pb[6] + pb[7] + pb[8], graveA: pa[0] + pa[1] + pa[2], aiguA: pa[6] + pa[7] + pa[8] };
}
const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
/** Niveaux : crête, RMS, continu, plus long silence (trames de 50 ms sous le seuil), RMS par tranche. */
export function niveaux(g, d, taux, seuilSilenceDb = -50) {
  let crete = 0, somme2 = 0, sommeG = 0, sommeD = 0, ecretes = 0;
  const n = g.length;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(g[i]), b = Math.abs(d[i]);
    if (a > crete) crete = a; if (b > crete) crete = b;
    if (a >= 1) ecretes++; if (b >= 1) ecretes++;
    somme2 += g[i] * g[i] + d[i] * d[i]; sommeG += g[i]; sommeD += d[i];
  }
  const rms = Math.sqrt(somme2 / (2 * n));
  const trame = Math.round(0.05 * taux), seuil = 10 ** (seuilSilenceDb / 20);
  let silence = 0, plusLong = 0, trames = 0, muettes = 0, rmsMin = Infinity;
  for (let at = 0; at + trame <= n; at += trame) {
    let s = 0;
    for (let i = at; i < at + trame; i++) s += g[i] * g[i] + d[i] * d[i];
    const r = Math.sqrt(s / (2 * trame));
    trames++;
    if (r < seuil) { silence++; muettes++; if (silence > plusLong) plusLong = silence; } else silence = 0;
    if (r < rmsMin) rmsMin = r;
  }
  return { crete, creteDb: db(crete), rms, rmsDb: db(rms), facteurCrete: db(crete) - db(rms), continuG: sommeG / n, continuD: sommeD / n,
    silenceMax: plusLong * 0.05, partSilence: muettes / (trames || 1), rmsMinDb: db(rmsMin), ecretes, partEcretee: ecretes / (2 * n) };
}
/** RMS (dB) par tranche de durée donnée. */
export function rmsParTranche(g, d, taux, duree) {
  const pas = Math.round(duree * taux), sortie = [];
  for (let at = 0; at + pas <= g.length + 1; at += pas) {
    let s = 0, m = 0;
    for (let i = at; i < Math.min(g.length, at + pas); i++) { s += g[i] * g[i] + d[i] * d[i]; m++; }
    sortie.push(db(Math.sqrt(s / (2 * (m || 1)))));
  }
  return sortie;
}
/** Attaques par seconde : flux spectral positif (trames de 1024, pas de 10 ms), pics au-dessus d'un seuil adaptatif. */
export function attaques(g, d, taux) {
  const N = 1024, pas = Math.round(taux / 100), re = new Float64Array(N), im = new Float64Array(N), fen = new Float32Array(N);
  for (let i = 0; i < N; i++) fen[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let prec = new Float64Array(N / 2);
  const flux = [];
  for (let at = 0; at + N <= g.length; at += pas) {
    for (let i = 0; i < N; i++) { re[i] = (g[at + i] + d[at + i]) * 0.5 * fen[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float64Array(N / 2);
    let f = 0;
    for (let k = 1; k < N / 2; k++) { mag[k] = Math.log(1 + 100 * Math.hypot(re[k], im[k])); const dlt = mag[k] - prec[k]; if (dlt > 0) f += dlt; }
    prec = mag; flux.push(f);
  }
  // Seuil adaptatif : moyenne locale (±0,25 s) × 1,5 + plancher ; au moins 60 ms entre deux attaques.
  const demi = 25, temps = [];
  let dernier = -100;
  const moyenne = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  for (let i = 1; i < flux.length - 1; i++) {
    let s = 0, m = 0;
    for (let j = Math.max(0, i - demi); j < Math.min(flux.length, i + demi); j++) { s += flux[j]; m++; }
    const seuil = 1.5 * s / m + 0.1 * moyenne;
    if (flux[i] > seuil && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && i - dernier >= 6) { temps.push(i * pas / taux); dernier = i; }
  }
  return temps;
}
export function ecrireWav(fichier, g, d, taux, gain = 1) {
  const n = g.length, tete = Buffer.alloc(44), corps = Buffer.alloc(n * 4);
  tete.write('RIFF', 0); tete.writeUInt32LE(36 + n * 4, 4); tete.write('WAVEfmt ', 8); tete.writeUInt32LE(16, 16); tete.writeUInt16LE(1, 20);
  tete.writeUInt16LE(2, 22); tete.writeUInt32LE(taux, 24); tete.writeUInt32LE(taux * 4, 28); tete.writeUInt16LE(4, 32); tete.writeUInt16LE(16, 34);
  tete.write('data', 36); tete.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    corps.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(g[i] * gain * 32767))), i * 4);
    corps.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(d[i] * gain * 32767))), i * 4 + 2);
  }
  fs.writeFileSync(fichier, Buffer.concat([tete, corps]));
}
