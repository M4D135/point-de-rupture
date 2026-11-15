// Recherche exhaustive historique, monde.js SHA-256
// 491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235.
// Insérée uniquement dans le monde de référence du test, jamais dans le jeu.
    function separer() {
      for (let i = 0; i < nHaut; i++) {
        const f = ufac[i];
        if (f < 0 || f > 2 || uetat[i] === ET.HORS_JEU) continue;
        const tt = utyp[i];
        if (tt >= 0 && tt < R.TYPES.length && R.TYPES[tt].vehicule) continue;
        const c4 = uc4[i], ci = c4 % nx, cj = (c4 / nx) | 0;
        let ax = 0, az = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (n >= SEP_VOISINS) break;
          const a = ci + di, b = cj + dj;
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const cc = a + b * nx;
          for (let q = debutCase[cc], fin = debutCase[cc + 1]; q < fin && n < SEP_VOISINS; q++) {
            const j = tri[q];
            if (j === i) continue;
            const dx = ux[i] - ux[j], dz = uz[i] - uz[j], d2 = dx * dx + dz * dz;
            if (d2 >= SEP_DISTANCE * SEP_DISTANCE) continue;
            if (d2 < 1) { ax += ((i * 2654435761 + j * 40503) & 3) - 1.5; az += ((i * 2246822519 + j * 668265263) & 3) - 1.5; n++; continue; }
            const d = Math.sqrt(d2);
            ax += dx / d; az += dz / d; n++;
          }
        }
        // La poussée ne doit pas s'éteindre dans la bousculade : on la divise par trois voisins au plus, pas par
        // le nombre trouvé — sinon plus il y a de monde sur la case, moins ça pousse, soit l'inverse du besoin.
        if (n > 0) { const k = n > 3 ? 3 : n; deplacer(i, Math.round(ax * SEP_PAS / k), Math.round(az * SEP_PAS / k)); }
      }
    }
