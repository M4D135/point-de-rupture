/* FERRO — shared BITUME tyre, load, torque and steering equations. Game profiles supply parameters. */
(function(G){'use strict';
 function create(P){
  if(!P||!Array.isArray(P.couple))throw TypeError('FERRO vehicle dynamics requires a parameter profile');
  const G=9.81,A=P.empattement*(1-P.repartition);
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function borne01(x) { x = +x; return x > 0 ? (x < 1 ? x : 1) : 0; }
  function sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
  function expTau(tau, dt) { return tau > 0 ? 1 - Math.exp(-dt / tau) : 1; }
  function ramener(s, Lc) { return ((s % Lc) + Lc) % Lc; }
  function angle(a) { return a - 2 * Math.PI * Math.round(a / (2 * Math.PI)); }
  function rampe(x, a, b) { return x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); }
  function regimeBrut(v, vPointe) { return P.ralenti + (P.maxUtile - P.ralenti) * v / vPointe; }

  function couple(r) {
    const c = P.couple;
    if (r <= c[0][0]) return c[0][1];
    for (let i = 0; i < c.length - 1; i++) {
      if (r <= c[i + 1][0]) return c[i][1] + (c[i + 1][1] - c[i][1]) * (r - c[i][0]) / (c[i + 1][0] - c[i][0]);
    }
    return c[c.length - 1][1];
  }

  // Courbe de pneu normalisée, x = dérive / dérive au pic : montée en sinus jusqu'au pic (forme), puis retombée
  // douce vers 1 − chute (retombee ; à l'avant, 85 % de l'adhérence de pic en pleine glisse).
  function forme(x) {
    if (x >= 1) return 1;
    if (x <= -1) return -1;
    return Math.sin(x * Math.PI / 2);
  }
  function retombee(x, chute, largeur) {
    const ax = x < 0 ? -x : x;
    if (ax <= 1) return 1;
    const q = (ax - 1) * (ax - 1);
    return 1 - chute * q / (q + largeur * largeur);
  }
  function pneu(x) { return forme(x) * retombee(x, P.chute, P.chuteLargeur); }
  // Consigne de dérive avant (en dérive au pic) pour une part rho de l'adhérence avant : inverse de la montée,
  // si bien que la force suit le volant ; plein volant à P.marge fois la dérive au pic, au-delà en dérive.
  function consigne(rho) {
    const a = rho < 0 ? -rho : rho;
    let x;
    if (a <= 1) { const a3 = a * a * a; x = Math.asin(a) * 2 / Math.PI * (1 + (P.marge - 1) * a3 * a3); }
    else x = P.marge + (a - 1) * 2;
    return rho < 0 ? -x : x;
  }
  // adhérence d'une roue selon sa charge (N), pour un coefficient de surface mu
  function adherence(mu, fz) {
    return fz > 0 ? mu * clamp(1 - P.sensibilite * (fz / P.chargeNominale - 1), 0.6, 1.15) * fz : 0;
  }
  // part de la direction qui suit la vitesse du centre de gravité : nulle au pas, entière dès 6 m/s
  function suivi(v) { return rampe(v, P.vSuivi0, P.vSuivi1); }
  // Capacité latérale nominale (m/s²) à la vitesse v, sur la piste, sans transfert.
  function capaciteLaterale(v) { return P.muPiste * (G + P.aero * v * v); }
  // Braquage géométrique (rad) qui fait tourner la voiture à l'accélération latérale amax à la vitesse v : le lacet
  // qu'il faut, vu de l'essieu avant (CG → avant × courbure).
  function geometrie(v, amax) { return Math.min(P.braquageMeca, A * amax / Math.max(v * v, 1)); }
  // Braquage (rad) par rapport à la vitesse du centre de gravité pour une part rho de l'adhérence avant : part
  // géométrique et dérive au pic ; au pas, braquage mécanique.
  function braquer(rho, v, amax) {
    const l = suivi(v), x = consigne(rho);
    return l * (rho * geometrie(v, amax) + x * P.alphaAv) + (1 - l) * clamp(rho, -1, 1) * P.braquageMeca;
  }
  // Plus grand braquage commandé (rad) à la vitesse v, plein volant, pour la capacité nominale : partagé avec l'IA.
  function braquageMax(v) {
    v = Math.max(0, +v || 0);
    return Math.min(P.braquageMeca, braquer(1, v, capaciteLaterale(v)));
  }

  return Object.freeze({clamp,borne01,sign,expTau,ramener,angle,rampe,regimeBrut,couple,forme,retombee,pneu,consigne,adherence,suivi,capaciteLaterale,geometrie,braquer,braquageMax});
 }
 G.FVehicleDynamics=Object.freeze({create});
})(globalThis);
