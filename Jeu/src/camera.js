// Caméra RTS : vue plongeante qui suit une visée au sol, zoom vers le curseur, rotation autour de la visée, carte
// saisie à la main. Elle donne aussi au moteur l'emprise visible au sol (camera.sun), où le soleil concentre son ombre.
// Le lissage reprend l'amortisseur critique de FERRO (src/motion.js, damp) : la vue rejoint la visée sans dépasser.
(function (PDR) {
  'use strict';

  const DMIN = 40, DMAX = 900, FOV = 42;
  const TAN = Math.tan(FOV * Math.PI / 360);
  const borner = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Amortisseur critique de FERRO (motion.js, damp), à la même formule. */
  function amortir(q, cible, omega, dt) {
    const x = q.x - cible, e = Math.exp(-omega * dt), t = (q.v + omega * x) * dt;
    q.x = cible + (x + t) * e; q.v = (q.v - omega * t) * e;
    return q.x;
  }
  const canal = x => ({ x, v: 0 });
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));

  /** Axes du moteur (cameraAxes) : avant = [sin lacet · cos tangage, sin tangage, -cos lacet · cos tangage]. */
  function axes(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return { right: [cy, 0, sy], up: [-sy * sp, cp, cy * sp], forward: [sy * cp, sp, -cy * cp] };
  }
  /** Plus on s'éloigne, plus on regarde à plomb : 42° près du sol, 60° tout en haut. */
  const tangage = D => -(42 + 18 * Math.pow(borner((D - DMIN) / (DMAX - DMIN), 0, 1), 0.7)) * Math.PI / 180;

  /**
   * Hauteur des toits par cases de 4 m, élargie de 12 m de chaque côté, tirée des pièces de la ville (ville.objets) :
   * la caméra passe au-dessus des immeubles, jamais dedans. Rend une fonction (x, z) → hauteur (m), 0 hors de la ville.
   */
  function grilleToits(ville) {
    const objets = ville && ville.objets, e = ville && ville.etendue;
    if (!Array.isArray(objets) || !e) return null;
    const C = 4, M = 80, x0 = e.x0 - M, z0 = e.z0 - M;
    const nx = Math.ceil((e.x1 - e.x0 + 2 * M) / C), nz = Math.ceil((e.z1 - e.z0 + 2 * M) / C);
    let h = new Float32Array(nx * nz);
    for (const o of objets) {
      if (!o || !o.p || !o.s) continue;
      const haut = o.p[1] + o.s[1] / 2;
      if (!(haut > 3)) continue;
      const a = (o.r && o.r[1]) || 0, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      const hx = (ca * o.s[0] + sa * o.s[2]) / 2, hz = (sa * o.s[0] + ca * o.s[2]) / 2;
      const i0 = Math.max(0, Math.floor((o.p[0] - hx - x0) / C)), i1 = Math.min(nx - 1, Math.floor((o.p[0] + hx - x0) / C));
      const j0 = Math.max(0, Math.floor((o.p[2] - hz - z0) / C)), j1 = Math.min(nz - 1, Math.floor((o.p[2] + hz - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (h[j * nx + i] < haut) h[j * nx + i] = haut;
    }
    for (let passe = 0; passe < 2; passe++) {
      const g = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        let m = 0;
        for (let d = -3; d <= 3; d++) {
          const ii = passe ? i : i + d, jj = passe ? j + d : j;
          if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && h[jj * nx + ii] > m) m = h[jj * nx + ii];
        }
        g[j * nx + i] = m;
      }
      h = g;
    }
    return (x, z) => {
      const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
      return i < 0 || j < 0 || i >= nx || j >= nz ? 0 : h[j * nx + i];
    };
  }
  const MARGE_TOITS = 4;

  /**
   * options.ville : la ville (objets, etendue) ; la caméra recule alors d'elle-même au-dessus des toits, sans toucher à
   * la visée. options.toits : à la place, une fonction (x, z) → hauteur des toits (m).
   */
  function creerCamera(canvas, limites, directionSoleil, options = {}) {
    const vise = { x: 0, z: 0, D: 330, yaw: 0 };
    const lis = { x: canal(0), z: canal(0), D: canal(330), yaw: canal(0), recul: canal(0) };
    let toits = typeof options.toits === 'function' ? options.toits : options.ville ? grilleToits(options.ville) : null;
    /** Distance où l'œil, qui regarde (x, z) sous le lacet donné, passe à MARGE_TOITS au-dessus des toits. */
    function degager(x, z, D, yaw) {
      if (!toits) return D;
      for (let k = 0; k < 24 && D < DMAX; k++) {
        const p = tangage(D), cp = Math.cos(p), sp = Math.sin(p);
        if (-sp * D >= toits(x - Math.sin(yaw) * cp * D, z + Math.cos(yaw) * cp * D) + MARGE_TOITS) break;
        D = Math.min(DMAX, D * 1.06);
      }
      return D;
    }
    const touches = new Set();
    let vue = null;

    // Repère du soleil, comme dans sunShadowPass : avant = -soleil, droite horizontale, haut = droite × avant.
    const s = directionSoleil.slice(); s[1] = Math.max(0.12, s[1]);
    const ls = Math.hypot(...s), fw = s.map(v => -v / ls), lh = Math.hypot(fw[0], fw[2]);
    const sr = [-fw[2] / lh, 0, fw[0] / lh];
    const su = [sr[1] * fw[2] - sr[2] * fw[1], sr[2] * fw[0] - sr[0] * fw[2], sr[0] * fw[1] - sr[1] * fw[0]];

    const aspect = () => (canvas.clientWidth || 800) / (canvas.clientHeight || 600);

    function camera(x, z, D, yaw) {
      const pitch = tangage(D), a = axes(yaw, pitch), f = a.forward;
      const pos = [x - f[0] * D, -f[1] * D, z - f[2] * D];
      return { pos, yaw, pitch, roll: 0, fov: FOV, near: Math.max(0.5, D * 0.02), far: D * 4 + 600, allStatic: true, axes: a, D, cible: [x, z] };
    }
    /** Point du sol (y = 0) sous un pixel CSS, pour une caméra donnée. */
    function sol(cam, px, py) {
      const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
      const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2, { right: r, up: u, forward: f } = cam.axes, k = aspect();
      const d = [f[0] + (r[0] * nx * k + u[0] * ny) * TAN, f[1] + (r[1] * nx * k + u[1] * ny) * TAN, f[2] + (r[2] * nx * k + u[2] * ny) * TAN];
      if (d[1] > -1e-4) return null;
      const t = -cam.pos[1] / d[1];
      return [cam.pos[0] + d[0] * t, cam.pos[2] + d[2] * t];
    }
    /** Emprise du soleil : le carré, dans le repère du soleil, qui couvre le sol visible et les toits en vue. */
    function emprise(cam) {
      const coins = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => sol(cam, a * (canvas.clientWidth || 800), b * (canvas.clientHeight || 600)));
      if (coins.some(c => !c)) return { center: [cam.cible[0], 0, cam.cible[1]], extent: cam.D * 1.5, depth: cam.D * 3.75 + 150 };
      let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, gx = 0, gz = 0;
      for (const c of coins) {
        gx += c[0] / 4; gz += c[1] / 4;
        for (const y of [0, 40]) {
          const pr = c[0] * sr[0] + y * sr[1] + c[1] * sr[2], pu = c[0] * su[0] + y * su[1] + c[1] * su[2];
          r0 = Math.min(r0, pr); r1 = Math.max(r1, pr); u0 = Math.min(u0, pu); u1 = Math.max(u1, pu);
        }
      }
      const g = [gx, 0, gz], dr = (r0 + r1) / 2 - (g[0] * sr[0] + g[2] * sr[2]), du = (u0 + u1) / 2 - (g[0] * su[0] + g[1] * su[1] + g[2] * su[2]);
      const center = [g[0] + sr[0] * dr + su[0] * du, g[1] + sr[1] * dr + su[1] * du, g[2] + sr[2] * dr + su[2] * du];
      const extent = Math.ceil((Math.max(r1 - r0, u1 - u0) / 2 + 6) / 8) * 8;
      return { center, extent, depth: extent * 2.5 + 150 };
    }

    function borne() {
      vise.x = borner(vise.x, limites.x0 - 60, limites.x1 + 60);
      vise.z = borner(vise.z, limites.z0 - 60, limites.z1 + 60);
      vise.D = borner(vise.D, DMIN, DMAX);
    }
    const visee = () => camera(vise.x, vise.z, degager(vise.x, vise.z, vise.D, vise.yaw), vise.yaw);

    const api = {
      DMIN, DMAX,
      /** Une autre ville (nouvelle partie) : nouvelles limites et nouveaux toits ; la visée est bornée de nouveau. */
      monde(nouvelles, opt = {}) {
        limites = nouvelles;
        toits = typeof opt.toits === 'function' ? opt.toits : opt.ville ? grilleToits(opt.ville) : null;
        borne();
      },
      placer(x, z, D = vise.D, yaw = vise.yaw) {
        Object.assign(vise, { x, z, D, yaw }); borne();
        lis.x = canal(vise.x); lis.z = canal(vise.z); lis.D = canal(vise.D); lis.yaw = canal(vise.yaw);
        lis.recul = canal(degager(vise.x, vise.z, vise.D, vise.yaw) - vise.D);
      },
      viser(x, z) { vise.x = x; vise.z = z; borne(); },
      /** Déplace la visée dans le plan du sol : droite et avant de l'écran, en mètres. */
      glisser(droite, avant) {
        const c = Math.cos(vise.yaw), s = Math.sin(vise.yaw);
        vise.x += c * droite + s * avant; vise.z += s * droite - c * avant; borne();
      },
      /** Garde sous le curseur le point du sol saisi : le geste suit la main, sans lissage. */
      saisir(px, py) { return sol(visee(), px, py); },
      tenir(prise, px, py) {
        const ici = sol(visee(), px, py);
        if (!prise || !ici) return;
        vise.x += prise[0] - ici[0]; vise.z += prise[1] - ici[1]; borne();
        lis.x = canal(vise.x); lis.z = canal(vise.z);
      },
      /** Zoom d'un facteur vers le pixel (px, py) : le point du sol sous le curseur ne bouge pas. */
      zoomer(facteur, px, py) {
        const avant = px === undefined ? null : sol(visee(), px, py);
        vise.D = borner(vise.D * facteur, DMIN, DMAX);
        if (avant) {
          const apres = sol(visee(), px, py);
          if (apres) { vise.x += avant[0] - apres[0]; vise.z += avant[1] - apres[1]; }
        }
        borne();
      },
      tourner(da) { vise.yaw += da; },
      /** Pose la visée sans couper le lissage : c'est ainsi que le réalisateur de la démo mène la caméra. */
      diriger(x, z, D = vise.D, yaw = vise.yaw) {
        if (Number.isFinite(x)) vise.x = x;
        if (Number.isFinite(z)) vise.z = z;
        if (Number.isFinite(D)) vise.D = D;
        if (Number.isFinite(yaw)) vise.yaw = yaw;
        borne();
      },
      /** La visée en cours (copie). */
      get visee() { return { x: vise.x, z: vise.z, D: vise.D, yaw: vise.yaw }; },
      touche(code, bas) { if (bas) touches.add(code); else touches.delete(code); },
      relacher() { touches.clear(); },
      /** Avance le lissage et rend la caméra du moteur pour cette image. */
      vue(dt) {
        const pas = vise.D * 1.1 * dt;
        let dr = 0, da = 0, rot = 0;
        if (touches.has('gauche')) dr -= 1;
        if (touches.has('droite')) dr += 1;
        if (touches.has('avant')) da += 1;
        if (touches.has('arriere')) da -= 1;
        if (touches.has('tourneG')) rot -= 1;
        if (touches.has('tourneD')) rot += 1;
        if (touches.has('plus')) api.zoomer(Math.exp(-1.6 * dt));
        if (touches.has('moins')) api.zoomer(Math.exp(1.6 * dt));
        if (dr || da) api.glisser(dr * pas, da * pas);
        if (rot) vise.yaw += rot * 1.6 * dt;
        // La rotation suit le plus court chemin ; la visée garde son nombre de tours.
        const yaw = amortir(lis.yaw, lis.yaw.x + angle(vise.yaw - lis.yaw.x), 12, dt);
        const x = amortir(lis.x, vise.x, 14, dt), z = amortir(lis.z, vise.z, 14, dt), D = amortir(lis.D, vise.D, 11, dt);
        // Au-dessus des toits : le recul se lisse vite, et la grille élargie le fait commencer avant le bord du toit.
        const recul = toits ? Math.max(0, amortir(lis.recul, degager(x, z, D, yaw) - D, 12, dt)) : 0;
        vue = camera(x, z, Math.min(DMAX, D + recul), yaw);
        vue.sun = emprise(vue);
        return vue;
      },
      /** Pixel CSS d'un point du monde pour la dernière vue, ou null s'il est derrière l'œil. */
      projeter(x, y, z) {
        if (!vue) return null;
        const { right: r, up: u, forward: f } = vue.axes, p = vue.pos;
        const dx = x - p[0], dy = y - p[1], dz = z - p[2], profondeur = dx * f[0] + dy * f[1] + dz * f[2];
        if (profondeur < vue.near) return null;
        const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
        const sx = (dx * r[0] + dy * r[1] + dz * r[2]) / (profondeur * TAN * aspect()), sy = (dx * u[0] + dy * u[1] + dz * u[2]) / (profondeur * TAN);
        return [(sx + 1) * 0.5 * w, (1 - sy) * 0.5 * h, profondeur];
      },
      /** Point du sol sous un pixel CSS, pour la dernière vue. */
      pointer(px, py) { return vue ? sol(vue, px, py) : null; },
      get derniere() { return vue; },
    };
    return api;
  }

  const CLAVIER = {
    ArrowUp: 'avant', KeyW: 'avant', ArrowDown: 'arriere', KeyS: 'arriere',
    ArrowLeft: 'gauche', KeyA: 'gauche', ArrowRight: 'droite', KeyD: 'droite',
    Equal: 'plus', NumpadAdd: 'plus', PageUp: 'plus', Minus: 'moins', NumpadSubtract: 'moins', PageDown: 'moins',
    KeyQ: 'tourneG', KeyE: 'tourneD',
  };

  /**
   * Branche souris, trackpad, clavier et toucher sur la caméra. actions : { cadre (élément du rectangle de sélection),
   * pointSelection(x, y, ajouter, double), rectangleSelection(x0, y0, x1, y1, ajouter), ordre(x, y), toucher(x, y),
   * toutSelectionner(), deselectionner() }. Les coordonnées sont des pixels CSS du canevas.
   */
  function brancher(canvas, cam, actions) {
    const doigts = new Map();
    let geste = null, espace = false, dernierClic = { t: 0, x: 0, y: 0 };
    const local = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const cadre = actions.cadre;
    const montrerCadre = (x0, y0, x1, y1) => {
      cadre.hidden = false;
      Object.assign(cadre.style, { left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
    };

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      const [x, y] = local(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché : le geste suit sans capture */ }
      if (e.pointerType === 'touch') {
        doigts.set(e.pointerId, [x, y]);
        if (doigts.size === 1) geste = { type: 'doigt', x0: x, y0: y, t0: performance.now(), bouge: false, prise: cam.saisir(x, y) };
        else if (doigts.size === 2) {
          const [a, b] = [...doigts.values()];
          geste = { type: 'pince', d: Math.hypot(b[0] - a[0], b[1] - a[1]), a: Math.atan2(b[1] - a[1], b[0] - a[0]),
            prise: cam.saisir((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
        }
        return;
      }
      if (e.button === 1 || (e.button === 0 && (espace || e.altKey))) geste = { type: 'carte', prise: cam.saisir(x, y) };
      else if (e.button === 0) geste = { type: 'selection', x0: x, y0: y, cadre: false, ajouter: e.shiftKey };
      else if (e.button === 2) geste = { type: 'ordre', x0: x, y0: y, xp: x, tourne: false };
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (!geste) return;
      const [x, y] = local(e);
      if (e.pointerType === 'touch') {
        if (!doigts.has(e.pointerId)) return;
        doigts.set(e.pointerId, [x, y]);
        if (geste.type === 'doigt') {
          if (Math.hypot(x - geste.x0, y - geste.y0) > 9) geste.bouge = true;
          if (geste.bouge) cam.tenir(geste.prise, x, y);
        } else if (geste.type === 'pince' && doigts.size >= 2) {
          const [a, b] = [...doigts.values()], d = Math.hypot(b[0] - a[0], b[1] - a[1]), an = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
          if (d > 10 && geste.d > 10) cam.zoomer(geste.d / d, cx, cy);
          cam.tourner(-angle(an - geste.a));
          geste.d = d; geste.a = an;
          cam.tenir(geste.prise, cx, cy);
        }
        return;
      }
      if (geste.type === 'carte') cam.tenir(geste.prise, x, y);
      else if (geste.type === 'selection') {
        if (!geste.cadre && Math.hypot(x - geste.x0, y - geste.y0) > 5) geste.cadre = true;
        if (geste.cadre) montrerCadre(geste.x0, geste.y0, x, y);
        geste.x = x; geste.y = y;
      } else if (geste.type === 'ordre') {
        if (!geste.tourne && Math.abs(x - geste.x0) > 7) geste.tourne = true;
        if (geste.tourne) cam.tourner((x - geste.xp) * 0.006);
        geste.xp = x;
      }
    });
    const fin = e => {
      const [x, y] = local(e);
      if (e.pointerType === 'touch') {
        doigts.delete(e.pointerId);
        if (geste && geste.type === 'doigt' && !geste.bouge && e.type === 'pointerup' && performance.now() - geste.t0 < 450) actions.toucher(x, y);
        if (doigts.size === 1) { const [p] = [...doigts.values()]; geste = { type: 'doigt', x0: p[0], y0: p[1], t0: 0, bouge: true, prise: cam.saisir(p[0], p[1]) }; }
        else if (!doigts.size) geste = null;
        return;
      }
      if (!geste) return;
      if (e.type === 'pointerup') {
        if (geste.type === 'selection') {
          if (geste.cadre) actions.rectangleSelection(geste.x0, geste.y0, x, y, geste.ajouter);
          else {
            const t = performance.now(), double = t - dernierClic.t < 320 && Math.hypot(x - dernierClic.x, y - dernierClic.y) < 8;
            dernierClic = { t: double ? 0 : t, x, y };
            actions.pointSelection(x, y, geste.ajouter, double);
          }
        } else if (geste.type === 'ordre' && !geste.tourne) actions.ordre(x, y);
      }
      cadre.hidden = true;
      geste = null;
    };
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = local(e);
      const ligne = e.deltaMode === 1, molette = ligne || (e.deltaX === 0 && e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0);
      const dy = ligne ? e.deltaY * 33 : e.deltaY, dx = ligne ? e.deltaX * 33 : e.deltaX;
      if (e.ctrlKey) cam.zoomer(Math.exp(dy * 0.01), x, y);                       // pincement du trackpad, ou Ctrl + molette
      else if (e.shiftKey) cam.tourner((dy || dx) * 0.004);
      else if (molette) cam.zoomer(Math.pow(1.18, Math.sign(dy) * Math.min(4, Math.abs(dy) / 100 || 1)), x, y);
      else {
        // Deux doigts sur le trackpad : la carte suit les doigts.
        const k = 2 * (cam.derniere ? cam.derniere.D : 300) * TAN / (canvas.clientHeight || 600);
        cam.glisser(dx * k, -dy * k);
      }
    }, { passive: false });

    const saisie = e => e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.isContentEditable);
    window.addEventListener('keydown', e => {
      if (saisie(e)) return;
      if (e.code === 'Space') { espace = true; e.preventDefault(); return; }
      if (e.key === 'Escape') { actions.deselectionner(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); actions.toutSelectionner(); return; }
      if (e.metaKey || e.ctrlKey) return;
      let nom = CLAVIER[e.code];
      if (e.shiftKey && e.code === 'ArrowLeft') nom = 'tourneG';
      if (e.shiftKey && e.code === 'ArrowRight') nom = 'tourneD';
      if (nom) { cam.touche(nom, true); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') espace = false;
      const nom = CLAVIER[e.code];
      if (nom) cam.touche(nom, false);
      if (e.code === 'ArrowLeft') cam.touche('tourneG', false);
      if (e.code === 'ArrowRight') cam.touche('tourneD', false);
    });
    window.addEventListener('blur', () => { cam.relacher(); espace = false; });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Réalisateur de la démo (CONCEPTION.md §1.11).
  // ---------------------------------------------------------------------------------------------------------------

  /** Tirage reproductible (mulberry32) : la démo n'a pas besoin d'être la même d'une fois à l'autre, les tests si. */
  function alea(graine) {
    let a = (graine === undefined ? (Math.random() * 4294967296) : graine) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lisse = s => s * s * s * (s * (s * 6 - 15) + 10);
  const PI = Math.PI;

  // Poids de chaque évènement dans l'activité (protocole.EV), et sorte de plan qu'il nourrit.
  const POIDS = { 1: [0.4, 0], 2: [10, 1], 3: [22, 1], 4: [12, 1], 5: [26, 1], 7: [45, 1], 8: [70, 2], 9: [45, 2], 10: [14, 0],
    11: [30, 0], 12: [6, 0], 18: [8, 0], 19: [16, 0], 22: [70, 2], 23: [50, 2] };
  const SORTES = ['combat', 'barricade', 'lieu', 'marche'];

  /**
   * Le réalisateur : toutes les 8 à 12 s, il choisit le point le plus vivant (combats, barricades, prises de lieux,
   * grandes marches), y vole en douceur et tourne lentement autour ; de temps en temps, il prend de la hauteur pour
   * montrer toute la ville. Il mène la caméra RTS par cam.diriger ; le lissage de la caméra reste le sien.
   *   const real = PDR.camera.creerRealisateur(cam, ville, { carte, graine })
   *     cam : creerCamera(...) ; ville : etendue, sites.lieux ; carte : CARTE du message « pret » (grille des combats).
   *   real.etat(etat, f32, n)   à chaque message « etat » : combats, evenements, lieux ; f32 et n (les unités, comme
   *                             foule.recevoir) nourrissent les grandes marches, une fois sur dix.
   *   real.avancer(dt)          à chaque image, avant cam.vue(dt).
   *   real.arreter()            le joueur reprend la main (premier geste) ; real.reprendre() : la démo repart.
   *   real.plan                 { sorte: 'ville' | 'combat' | 'barricade' | 'lieu' | 'marche', x, z, D, debut, duree,
   *                               vol (s), bosse (m), dyaw (rad : quart de tour au plus, vers le centre de la ville) }
   *   real.actif, real.activite (Float32Array G × G), real.G
   */
  function creerRealisateur(cam, ville, options = {}) {
    const e = (ville && ville.etendue) || { x0: -400, z0: -400, x1: 400, z1: 400 };
    const G = 32, cw = (e.x1 - e.x0) / G, ch = (e.z1 - e.z0) / G;
    const grilles = SORTES.map(() => new Float32Array(G * G)), activite = new Float32Array(G * G);
    const rd = alea(options.graine);
    const lieux = (ville && ville.sites && ville.sites.lieux) || [];
    const carte = options.carte || null;
    const centre = [(e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2];
    let t = 0, tEtat = -1, nEtats = 0, actif = true, plan = null, nPlans = 0, prochaineVille = 3 + Math.floor(rd() * 3), sens = 1;
    let depart = null;
    const recents = [];

    function ajouter(sorte, x, z, poids) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !(poids > 0)) return;
      const i = Math.floor((x - e.x0) / cw), j = Math.floor((z - e.z0) / ch);
      if (i < 0 || j < 0 || i >= G || j >= G) return;
      grilles[sorte][j * G + i] += poids;
    }
    function geometrie(g, taille) {
      if (g && Number.isFinite(g.cote) && Number.isFinite(g.x0) && Number.isFinite(g.z0)) {
        return { x0: g.x0, z0: g.z0, cellule: g.cote * taille > 20000 ? g.cote / taille : g.cote };
      }
      return { x0: e.x0, z0: e.z0, cellule: Math.max(e.x1 - e.x0, e.z1 - e.z0) / taille };
    }

    function etat(et, f32, n) {
      if (!et) return;
      // L'activité s'éteint d'elle-même : demi-vie d'environ 4 s.
      if (tEtat >= 0 && t > tEtat) {
        const k = Math.exp(-(t - tEtat) / 6);
        for (const g of grilles) for (let i = 0; i < g.length; i++) g[i] *= k;
      }
      tEtat = t; nEtats++;
      if (et.combats && et.combats.length) {
        const gc = carte && carte.combats, taille = gc && gc.taille ? gc.taille | 0 : Math.round(Math.sqrt(et.combats.length));
        const geo = geometrie(gc, taille);
        for (let j = 0; j < taille; j++) for (let i = 0; i < taille; i++) {
          const v = et.combats[j * taille + i];
          if (v) ajouter(0, geo.x0 + (i + 0.5) * geo.cellule, geo.z0 + (j + 0.5) * geo.cellule, v * 0.04);
        }
      }
      const ev = et.evenements, T = 6;
      if (ev && ev.length) for (let k = 0; k + T <= ev.length; k += T) {
        const p = POIDS[ev[k] | 0];
        if (p) ajouter(p[1], ev[k + 1], ev[k + 2], p[0]);
      }
      if (Array.isArray(et.lieux)) for (let i = 0; i < et.lieux.length && i < lieux.length; i++) {
        const l = et.lieux[i];
        if (l && (l.conteste || Math.abs(l.progression || 0) > 0.01)) ajouter(2, lieux[i].x, lieux[i].z, l.conteste ? 3 : 2);
      }
      // Grandes marches : un échantillon des unités en marche ou en repli, une fois sur dix.
      if (f32 && n > 0 && nEtats % 10 === 0) {
        const pas = Math.max(1, Math.floor(n / 12000));
        for (let i = 0; i < n; i += pas) {
          const code = f32[i * 4 + 3] | 0, etatU = (code >>> 6) & 15;
          if ((code & 3) === 3 || (etatU !== 1 && etatU !== 8)) continue;
          ajouter(3, f32[i * 4], f32[i * 4 + 1], pas * 0.012);
        }
      }
    }

    function choisir() {
      nPlans++;
      const v = cam.visee;
      depart = { x: v.x, z: v.z, D: v.D, yaw: v.yaw, t };
      sens = rd() < 0.5 ? -1 : 1;
      const duree = 8 + 4 * rd();
      let cible = null;
      if (nPlans > 1 && nPlans < prochaineVille) {
        // La case la plus vivante, loin des deux derniers plans.
        let best = -1, score = 0;
        for (let c = 0; c < G * G; c++) {
          let s = 0;
          for (const g of grilles) s += g[c];
          activite[c] = s;
          if (s <= score) continue;
          const x = e.x0 + ((c % G) + 0.5) * cw, z = e.z0 + (Math.floor(c / G) + 0.5) * ch;
          let pen = 1;
          for (const r of recents) if (Math.hypot(x - r[0], z - r[1]) < 140) pen = 0.3;
          if (s * pen > score) { score = s * pen; best = c; }
        }
        if (best >= 0 && score > 4) {
          // Barycentre des cases voisines, pondéré par leur activité.
          const bi = best % G, bj = Math.floor(best / G);
          let sx = 0, sz = 0, sw = 0, kinds = [0, 0, 0, 0];
          for (let j = Math.max(0, bj - 1); j <= Math.min(G - 1, bj + 1); j++) for (let i = Math.max(0, bi - 1); i <= Math.min(G - 1, bi + 1); i++) {
            const c = j * G + i, w = activite[c];
            sx += (e.x0 + (i + 0.5) * cw) * w; sz += (e.z0 + (j + 0.5) * ch) * w; sw += w;
            for (let k = 0; k < 4; k++) kinds[k] += grilles[k][c];
          }
          let sorte = 0;
          for (let k = 1; k < 4; k++) if (kinds[k] > kinds[sorte]) sorte = k;
          cible = { sorte: SORTES[sorte], x: sx / sw, z: sz / sw, D: 150 + 90 * rd() };
        } else if (lieux.length) {
          const l = lieux[Math.floor(rd() * lieux.length)];
          cible = { sorte: 'lieu', x: l.x, z: l.z, D: 190 + 80 * rd() };
        }
      }
      if (!cible) {
        cible = { sorte: 'ville', x: centre[0], z: centre[1], D: DMAX };
        prochaineVille = nPlans + 3 + Math.floor(rd() * 3);
      }
      // Près d'un bord, la cible rentre un peu dans la ville et la caméra tourne (d'un quart de tour au plus) pour la
      // regarder depuis le dehors : la ville emplit l'image plutôt que la campagne.
      let dyaw = 0;
      if (cible.sorte !== 'ville') {
        const marge = 0.22 * cible.D;
        cible.x = borner(cible.x, e.x0 + marge, e.x1 - marge);
        cible.z = borner(cible.z, e.z0 + marge, e.z1 - marge);
        const dx = centre[0] - cible.x, dz = centre[1] - cible.z;
        if (Math.hypot(dx, dz) > 120) {
          let d = Math.atan2(dx, -dz) - depart.yaw;
          d -= 2 * PI * Math.round(d / (2 * PI));
          dyaw = borner(d, -PI / 2, PI / 2);
        }
      }
      recents.unshift([cible.x, cible.z]); recents.length = Math.min(recents.length, 2);
      const distance = Math.hypot(cible.x - depart.x, cible.z - depart.z);
      plan = { sorte: cible.sorte, x: cible.x, z: cible.z, D: cible.D, debut: t, duree, dyaw,
        vol: borner(distance / 160 + 1.8, 2.2, 5.5), bosse: distance > 120 ? Math.min(320, distance * 0.35) : 0 };
    }

    function avancer(dt) {
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.25);
      t += dt;
      if (!actif) return;
      if (!plan || t >= plan.debut + plan.duree) choisir();
      const age = t - plan.debut, s = lisse(borner(age / plan.vol, 0, 1));
      const x = depart.x + (plan.x - depart.x) * s, z = depart.z + (plan.z - depart.z) * s;
      // Après le vol, un lent travelling avant ; la ville entière reste à distance.
      const rapproche = plan.sorte === 'ville' ? 1 : 1 - 0.1 * borner((age - plan.vol) / (plan.duree - plan.vol), 0, 1);
      const D = (depart.D + (plan.D - depart.D) * s) * (s >= 1 ? rapproche : 1) + plan.bosse * Math.sin(PI * s);
      const omega = (plan.sorte === 'ville' ? 0.045 : 0.075) * sens * (0.4 + 0.6 * s);
      depart.yaw += omega * dt;
      cam.diriger(x, z, D, depart.yaw + plan.dyaw * s);
    }

    return {
      etat, avancer,
      arreter() { actif = false; },
      reprendre() { actif = true; plan = null; },
      get actif() { return actif; },
      get plan() { return plan; },
      activite, G, grilles,
    };
  }

  PDR.camera = { creerCamera, brancher, creerRealisateur, grilleToits, DMIN, DMAX, FOV };
})(globalThis.PDR = globalThis.PDR || {});
