# FERRO dans Point de rupture

Le jeu repose sur **FERRO 0.2**, le moteur commun aux jeux de David : `github.com/M4D135/FERRO` (dépôt privé), étiquette
`v0.2`, commit `248043a674e5353724731a7322ae932487c236b7` du 12 novembre 2026. Décision de David, le même jour : « vire
unreal engine, go full mon moteur ferro ».

Un jeu prend les fichiers de FERRO à une étiquette, marque chacune de ses retouches et note la provenance à côté.
Ici, dans `Jeu/src/moteur/` :

| Fichier du jeu | Dans FERRO | Lien | Base | Détail |
|---|---|---|---|---|
| `renderer.js` | `src/renderer.js` | copie de la 0.2, avec 6 retouches marquées « PDR (nom) » | `v0.2` | `PROVENANCE.md` |
| `audio.js` | `src/audio.js` | portage en français ; les sons sont ceux du jeu | `metal-4ce2271` | `PROVENANCE-SON.md` |
| `musique.js` | `src/music.js` | portage en français ; les morceaux sont ceux du jeu | `metal-4ce2271` | `PROVENANCE-SON.md` |

- Renderer d'origine : 120 863 octets, sha256 `d57dae38eed729f6ba72b6673a2174e82869c8ab85670dd7c6a71628504a85a1`.
- Copie du jeu : 137 113 octets, sha256 `4b1fcc5317b645bda9272a575c270d801c6fb58d02d79f71927529442bfc3398`.

Rien d'autre de FERRO n'est pris : `camera.js` reprend la formule d'amortissement de `src/motion.js`, avec mention ;
`src/options.js` ne sert pas. `PROVENANCE-SON.md` cite « FERRO, branche `campagne-18-mondes`, commit `4ce2271` » : c'était
le dépôt du jeu METAL, renommé depuis `M4D135/METAL` ; dans FERRO, cet état est l'étiquette `metal-4ce2271`.

Ce que le jeu demande au renderer : à la création, `{ msaa: 4, shadowMapScale: 2, vignette: 0.84, bloomThreshold:
[0.86, 0.98] }` (`REGLAGES_MOTEUR` dans `jeu.js`) ; sur la caméra, `near`, `far`, `allStatic` et `sun` (`camera.js`) ;
sur `fx`, `sunOnly`, `torch: false`, `shadows`, `bloom`, `lights`, et les quatre champs des retouches du jeu : `voile`,
`lots`, `foule`, `msaa`.

## Passer à la version suivante de FERRO

1. Lire dans FERRO la section de la version dans `VERSIONS.md` : ce qui est ajouté, ce qui est repris du jeu, les
   réglages à passer pour garder l'image.
2. Fusion à trois dans le dépôt du jeu, sur des copies : la base (`git show v0.2:src/renderer.js` dans FERRO), la
   nouvelle étiquette, et `Jeu/src/moteur/renderer.js`, avec `git merge-file --diff3`. Dans chaque conflit, garder FERRO,
   puis reposer autour les retouches que FERRO n'a pas reprises.
3. Relire aussi ce que la fusion garde du jeu sans conflit : une retouche que FERRO vient de reprendre sous une autre
   forme reste en double sans rien signaler. Le fichier doit redevenir l'original plus des blocs « PDR (nom) ».
4. Mettre à jour `verifications/originaux-ferro.mjs` (étiquette, commit, sha256 des originaux, copie d'avant), l'en-tête
   de la copie, ce fichier et `PROVENANCE.md` (version, sha256, comptes, retouches restantes).
5. Vérifier : `verifications/ferro.test.mjs` ; `verifications/rendu.test.mjs` (mêmes commandes GPU que la nouvelle
   étiquette ; passage depuis la copie d'avant, écart par écart) ; `verifications/banc-rendu.py`, une fois avec
   `--moteur` sur la copie d'avant et une fois sans, pour l'avant et l'après sous la même charge ; puis le jeu assemblé,
   dans un navigateur, sur les deux villes.
6. Dans le dépôt de FERRO, par la session qui y travaille : noter la nouvelle base du jeu dans `jeux/jeux.json` et dans
   le tableau des jeux du `README.md`. Le dépôt du jeu ne modifie jamais celui de FERRO.
