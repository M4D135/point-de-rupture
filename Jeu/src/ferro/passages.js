/* FPassages — passages obligatoires, analysés sur données plates.
   Brique de moteur générique : elle ne connaît ni salles, ni pièges, ni METAL.
   Elle reçoit des rectangles, des solides et un graphe de liens, et répond à
   deux questions : « ce bloc barre-t-il le chemin ? » et « ce lien est-il le
   seul qui relie ces deux zones ? ». Tout est déterministe : ni horloge, ni
   hasard, ni ordre d'itération dépendant de l'environnement. */
(function () {
  'use strict';
  const FMath = (typeof window!=='undefined'?window:globalThis).FMath;
  const FPassages = {};

  // Grille d'occupation d'un corps de rayon `radius` et de hauteur `height`.
  // `heightAt(x,z)` renvoie la hauteur du sol ou null hors du sol praticable ;
  // `solidAt(x,z,y)` renvoie vrai si un solide gêne le corps à cette hauteur.
  // Deux cellules ne communiquent que si la marche entre elles reste <= `step`.
  FPassages.grid = function ({ bounds, cell = 0.8, heightAt, solidAt, radius = 0.38, height = 1.8, step = 0.42 } = {}) {
    if (!bounds || typeof heightAt !== 'function') throw new Error('FPassages.grid : bounds et heightAt sont requis');
    const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    const nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    const free = new Uint8Array(nx * nz), levels = new Float64Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = bounds.minX + (ix + 0.5) * cell, z = bounds.minZ + (iz + 0.5) * cell, i = iz * nx + ix;
      const y = heightAt(x, z);
      levels[i] = y === null || !Number.isFinite(y) ? NaN : y;
      if (Number.isFinite(levels[i]) && !(solidAt && solidAt(x, z, levels[i]))) free[i] = 1;
    }
    return { bounds: { ...bounds }, cell, nx, nz, free, levels, radius, height, step, index: (x, z) => Math.min(nz - 1, Math.max(0, Math.floor((z - bounds.minZ) / cell))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((x - bounds.minX) / cell))) };
  };

  // Un solide de plus sur la grille : les cellules dont le centre est à moins de
  // `radius` du rectangle, et dont le corps (y .. y+height) recoupe le solide.
  function applyBlocker(grid, box) {
    const { minX, maxX, minZ, maxZ } = box, r = grid.radius, h = grid.height;
    const ix0 = Math.max(0, Math.floor((minX - r - grid.bounds.minX) / grid.cell));
    const ix1 = Math.min(grid.nx - 1, Math.ceil((maxX + r - grid.bounds.minX) / grid.cell));
    const iz0 = Math.max(0, Math.floor((minZ - r - grid.bounds.minZ) / grid.cell));
    const iz1 = Math.min(grid.nz - 1, Math.ceil((maxZ + r - grid.bounds.minZ) / grid.cell));
    const touched = [];
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * grid.nx + ix;
      if (!grid.free[i]) continue;
      const y = grid.levels[i];
      if (box.maxY <= y + 0.05 || box.minY >= y + h - 0.05) continue;
      const x = grid.bounds.minX + (ix + 0.5) * grid.cell, z = grid.bounds.minZ + (iz + 0.5) * grid.cell;
      const dx = Math.max(minX - x, 0, x - maxX), dz = Math.max(minZ - z, 0, z - maxZ);
      if (dx * dx + dz * dz <= r * r) { touched.push(i); grid.free[i] = 0; }
    }
    return touched;
  }

  // Inonde depuis `sources` (indices de cellule) et rend un masque de visite.
  // `blockers` est une liste optionnelle de rectangles ajoutés le temps du test ;
  // ils sont retirés avant le retour, la grille reste réutilisable. `region`
  // borne le déplacement à un rectangle (un couloir, par exemple) : on teste
  // ainsi si un bloc barre le passage *dans ce passage*, sans faire le tour.
  FPassages.flood = function (grid, sources, blockers = [], region = null) {
    const seen = new Uint8Array(grid.nx * grid.nz), queue = new Int32Array(grid.nx * grid.nz);
    const touched = [];
    const inRegion = region ? (ix, iz) => {
      const x = grid.bounds.minX + (ix + 0.5) * grid.cell, z = grid.bounds.minZ + (iz + 0.5) * grid.cell;
      return x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ;
    } : null;
    for (const box of blockers) touched.push(...applyBlocker(grid, box));
    let head = 0, tail = 0;
    for (const i of sources) if (i >= 0 && i < seen.length && grid.free[i] && !seen[i] && (!inRegion || inRegion(i % grid.nx, Math.floor(i / grid.nx)))) { seen[i] = 1; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++], x = i % grid.nx, y = grid.levels[i];
      const neighbours = [x ? i - 1 : -1, x < grid.nx - 1 ? i + 1 : -1, i - grid.nx, i + grid.nx];
      for (const j of neighbours) {
        if (j < 0 || j >= seen.length || !grid.free[j] || seen[j]) continue;
        if (Math.abs(grid.levels[j] - y) > grid.step) continue;
        const jx = j % grid.nx;
        if (inRegion && !inRegion(jx, Math.floor(j / grid.nx))) continue;
        seen[j] = 1; queue[tail++] = j;
      }
    }
    for (const i of touched) grid.free[i] = 1;
    return seen;
  };

  // Vrai si la cible est atteignable depuis au moins une source.
  FPassages.reaches = function (grid, sources, target, blockers = [], region = null) {
    const seen = FPassages.flood(grid, Array.isArray(sources) ? sources : [grid.index(sources.x, sources.z)], blockers, region);
    return seen[grid.index(target.x, target.z)] === 1;
  };

  // Le bloc barre-t-il le chemin ? atteignable sans lui, injoignable avec lui.
  FPassages.cuts = function (grid, source, target, box) {
    const from = [grid.index(source.x, source.z)], sources = grid.free[from[0]] ? from : FPassages.nearestFree(grid, source);
    if (!sources.length || !FPassages.reaches(grid, sources, target)) return false;
    return !FPassages.reaches(grid, sources, target, [box]);
  };

  // Cellule libre la plus proche d'un point (pour poser une source mal placée).
  FPassages.nearestFree = function (grid, point, radius = 3) {
    const reach = Math.max(1, Math.ceil(radius / grid.cell)), cx = Math.floor((point.x - grid.bounds.minX) / grid.cell), cz = Math.floor((point.z - grid.bounds.minZ) / grid.cell);
    let best = -1, bestD = Infinity;
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= grid.nx || iz >= grid.nz) continue;
      const i = iz * grid.nx + ix;
      if (!grid.free[i]) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? [] : [best];
  };

  // Liens obligatoires d'un graphe : ceux dont le retrait déconnecte l'une des
  // cibles du point de départ. `links` = [{from,to}] sur des entiers de 0 à nodes-1.
  function connected(links, start, targets, skip) {
    const nodes = new Set([start]);
    let grew = true;
    while (grew) {
      grew = false;
      for (let k = 0; k < links.length; k++) {
        if (k === skip) continue;
        const { from, to } = links[k];
        const a = nodes.has(from), b = nodes.has(to);
        if (a && !b) { nodes.add(to); grew = true; } else if (b && !a) { nodes.add(from); grew = true; }
      }
    }
    return targets.every(t => nodes.has(t));
  }
  FPassages.mandatoryLinks = function ({ links = [], start = 0, objectives = [] } = {}) {
    const targets = objectives.filter(t => t !== start);
    if (!targets.length || !connected(links, start, targets, -1)) return [];
    const forced = [];
    for (let k = 0; k < links.length; k++) if (!connected(links, start, targets, k)) forced.push(k);
    return forced;
  };

  // Liens traversés par une tournée gloutonne : départ, puis la cible la plus
  // proche en longueur de liens, jusqu'à les avoir toutes vues. Rend l'ensemble
  // des liens empruntés, pour ne poser un piège que là où le joueur passe.
  if (!FMath) throw new Error('FPassages: charger src/fmath.js avant src/passages.js');
  FPassages.tourLinks = function ({ links = [], start = 0, objectives = [], length = link => FMath.hypot2((link.x2 ?? 0) - (link.x1 ?? 0), (link.z2 ?? 0) - (link.z1 ?? 0)) } = {}) {
    const adjacency = new Map();
    for (let k = 0; k < links.length; k++) {
      const { from, to } = links[k], w = Math.max(0.001, length(links[k]));
      if (!adjacency.has(from)) adjacency.set(from, []);
      if (!adjacency.has(to)) adjacency.set(to, []);
      adjacency.get(from).push({ node: to, link: k, w });
      adjacency.get(to).push({ node: from, link: k, w });
    }
    const path = (from, to) => {
      if (from === to) return { nodes: [from], links: [] };
      const dist = new Map([[from, 0]]), prev = new Map();
      const todo = [{ node: from, d: 0 }];
      while (todo.length) {
        todo.sort((a, b) => a.d - b.d || a.node - b.node);
        const { node, d } = todo.shift();
        if (d > (dist.get(node) ?? Infinity)) continue;
        for (const e of adjacency.get(node) || []) {
          const nd = d + e.w;
          if (nd < (dist.get(e.node) ?? Infinity)) { dist.set(e.node, nd); prev.set(e.node, { node, link: e.link }); todo.push({ node: e.node, d: nd }); }
        }
      }
      if (!dist.has(to)) return null;
      const nodes = [], used = [];
      for (let at = to; at !== undefined;) {
        nodes.unshift(at);
        const p = prev.get(at);
        if (!p) break;
        used.unshift(p.link); at = p.node;
      }
      return { nodes, links: used };
    };
    const used = new Set();
    let at = start, remaining = objectives.filter((t, i, a) => t !== start && a.indexOf(t) === i).sort((a, b) => a - b);
    while (remaining.length) {
      let pick = null, pickPath = null;
      for (const target of remaining) {
        const found = path(at, target);
        if (!found) continue;
        const cost = found.links.reduce((n, k) => n + Math.max(0.001, length(links[k])), 0);
        if (!pickPath || cost < pickPath.cost || (cost === pickPath.cost && target < pick)) { pick = target; pickPath = { ...found, cost }; }
      }
      if (!pickPath) break;
      for (const k of pickPath.links) used.add(k);
      at = pick;
      remaining = remaining.filter(t => t !== pick);
    }
    return [...used].sort((a, b) => a - b);
  };

  (typeof window!=='undefined'?window:globalThis).FPassages = FPassages;
}());
