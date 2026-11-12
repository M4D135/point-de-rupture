# Les quatre morceaux de la 0.3

La musique de la 0.3 est plus sombre que celle de la 0.2 (« moins rigolote », David, 12/11/2026) :
modes mineurs et phrygiens, tempos qui ralentissent ou se tendent, cuivres graves, cordes, chœurs, aucune
fanfare. Chaque morceau garde douze motifs de 64 rangées à quatre canaux : six calmes (0 à 5) puis six
tendus (6 à 11). Le lecteur enchaîne le motif k d'une section vers le motif k + 1 de l'autre ; il bascule en
fin de motif quand l'intensité dépasse 0,55, et revient au calme sous 0,3. Aucun son n'est importé : tout est
calculé, et les instruments restent disponibles pour la rue (`audio.js`).

## Point de rupture (thème)

Ré mineur, 100 BPM. Quatre pistes : le chant, la basse, l'harmonie, la batterie. Calme : le glas sur un
bourdon de ré, le thème grave au trombone (ré – fa – mi♭ | ré – do – la | si♭ – do – do♯ | ré), sa
réponse, un frottement qui enfle, puis l'attente. Tendu : le thème aux cuivres à l'octave sur un ostinato de
cordes graves au galop, des accords frappés, la rupture (choc, silence, alerte, frottements), et la charge
qui martèle ré avant de monter par le second degré abaissé. Instruments : glas, bourdon, trombone, cuivres,
cordes graves, chœur grave, frottement, accords mineur et de quinte, alerte.

## La Convergence

La mineur phrygien, 126 BPM. Tout tient sur un tresillo 3 + 3 + 2 : surdos, basse brute (la – la – do |
la – la – si♭, puis ré – mi♭ – ré, le triton). Calme : coups lointains, la foule qui gronde sur la, l'alerte
au loin. Tendu : le riff, les accords saturés à l'unisson, la montée (do, ré, mi♭), la charge des fûts
seuls, les arrêts. Les tambours latins de la rue servent ici de tresillo lourd, pas de batucada joyeuse.
Instruments : basse brute, accord brut, foule, alerte.

## Le Bastion

Do mineur, 88 BPM. Le thème grave du trombone passe par le second degré abaissé et la sensible (do – do –
mi♭ | ré♭ – do – si | do – mi♭ – fa – sol | la♭ – sol), sur des quintes à vide de cuivres graves et un
tuba qui tient do. Calme : la veille, le glas, le chœur, l'attente et l'appel lointain du cor. Tendu : la
marche (un rythme, tout le monde dessus), le thème au trombone puis au cor une octave plus haut, l'appel,
le mur. Instruments : muraille de cuivres, tuba, trombone, chœur grave, glas, cor.

## La Préfecture

Mi phrygien, 124 BPM. Une pulsation de basse qui ne s'arrête pas, croches au calme, doubles quand ça se
tend ; une nappe froide (mi, si, fa) ; des notes de verre qui tombent d'un demi-ton ; des sirènes qui
glissent d'un triton (si – fa) ; l'alarme. Calme : pulsation, nappe, verre, sirènes lointaines, attente.
Tendu : la machine, arpèges serrés, frappes en tresillo, la grille mi – fa – sol – fa, la rupture et les
sirènes ensemble. Instruments : pulsation, nappe froide, arpège, sirène, bip, frappe synthé, verre.

## Mesures avant / après

Méthode : `mesurer.mjs` rend chaque section en entier (56 à 66 s) avec les règles du lecteur, sans gain
maître ni bus ; les crêtes supérieures à 1 sont donc celles du mix avant le limiteur et le `WaveShaper`
d'`audio.js`. Le PCM des modules, lui, ne dépasse jamais 114/127 et **aucun échantillon n'atteint le bord**
(0 au bord, avant comme après) : il n'y a pas de saturation du PCM. Les valeurs « après » viennent de
`Jeu/src/moteur/musique.js`, les valeurs « avant » de `mesures-avant.json` (musique 0.2, conservée dans
l'historique git).

### Niveaux, continu, silences et timbre

| morceau / section | crête | RMS (dB) | continu | silence max (s) | grave < 250 Hz | centroïde | médiane | écrêtés au mix |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| titre calme | 0,94 → 0,81 | -14,8 → -14,3 | 1,2e-5 → 8,1e-5 | 0,00 → 0,20 | 41,3 % → 84,5 % | 448 → 176 | 296 → 145 | 0 → 0 |
| titre tendue | 1,35 → 1,39 | -10,2 → -10,4 | 6,6e-4 → 2,4e-4 | 0,00 → 0,00 | 32,6 % → 58,4 % | 534 → 309 | 355 → 172 | 5 534 → 5 896 |
| convergence calme | 1,03 → 0,78 | -12,8 → -18,7 | 1,3e-4 → 9,5e-5 | 0,00 → 0,25 | 69,1 % → 81,0 % | 350 → 174 | 97 → 70 | 14 → 0 |
| convergence tendue | 1,56 → 1,43 | -9,8 → -9,7 | 2,0e-4 → 9,4e-4 | 0,00 → 0,00 | 54,9 % → 80,4 % | 446 → 209 | 167 → 108 | 8 884 → 18 011 |
| bastion calme | 0,88 → 0,99 | -14,8 → -13,9 | 1,9e-5 → 6,4e-6 | 0,25 → 0,25 | 73,6 % → 88,6 % | 230 → 150 | 97 → 124 | 0 → 0 |
| bastion tendue | 1,48 → 1,57 | -9,2 → -8,1 | 4,3e-4 → 5,9e-4 | 0,00 → 0,00 | 73,1 % → 68,1 % | 236 → 238 | 97 → 129 | 25 824 → 71 695 |
| prefecture calme | 0,92 → 0,92 | -12,6 → -16,0 | 5,7e-4 → 2,4e-4 | 0,20 → 0,00 | 77,3 % → 65,6 % | 193 → 249 | 75 → 118 | 0 → 0 |
| prefecture tendue | 1,51 → 1,39 | -7,8 → -10,0 | 4,2e-3 → 6,8e-4 | 0,00 → 0,10 | 69,9 % → 56,9 % | 240 → 316 | 70 → 140 | 37 325 → 7 979 |

La composante continue baisse partout (au pire 6,8e-4 après, contre 4,2e-3 avant). Les silences de 0,20 à
0,25 s sont voulus : ils tombent dans les sections calmes (Convergence, attente de La Préfecture, veille du
Bastion). Le mix est collectivement plus grave : centroïde calme ~305 → ~188 Hz, tendu ~364 → ~268 Hz. La
Préfecture fait exception et ressort plus claire que l'ancienne (médiane 75/70 → 118/140 Hz, centroïde
193/240 → 249/316 Hz) ; le morceau complet correspond à son plan, il n'a pas été réécrit.

### Énergie par bande (%, avant → après)

| morceau / section | 0 Hz | 60 | 120 | 250 | 500 | 1k | 2k | 4k | 8k |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| titre calme | 4,8→2,5 | 12,9→37,8 | 23,6→44,2 | 33,4→12,7 | 16,8→2,4 | 7,0→0,3 | 1,2→0,1 | 0,3→0,0 | 0,1→0,0 |
| titre tendue | 6,5→10,5 | 10,7→23,5 | 15,4→24,4 | 35,9→23,6 | 20,8→14,6 | 8,1→2,6 | 1,6→0,6 | 0,8→0,1 | 0,2→0,0 |
| convergence calme | 11,8→37,5 | 46,6→32,3 | 10,7→11,3 | 12,0→12,3 | 11,1→5,7 | 4,5→0,6 | 2,9→0,2 | 0,4→0,1 | 0,1→0,0 |
| convergence tendue | 8,3→18,2 | 37,2→38,7 | 9,4→23,5 | 16,5→9,3 | 17,2→8,0 | 7,6→1,8 | 3,3→0,4 | 0,4→0,1 | 0,1→0,0 |
| bastion calme | 34,7→21,6 | 22,0→28,0 | 16,9→39,0 | 18,0→8,9 | 5,5→1,9 | 1,4→0,3 | 1,2→0,3 | 0,3→0,1 | 0,0→0,0 |
| bastion tendue | 24,3→18,3 | 31,3→25,2 | 17,5→24,6 | 17,7→21,2 | 6,2→8,3 | 1,8→1,7 | 1,0→0,6 | 0,2→0,1 | 0,0→0,0 |
| prefecture calme | 45,2→37,8 | 26,9→14,0 | 5,2→13,8 | 13,5→22,9 | 6,5→9,0 | 2,2→1,9 | 0,5→0,5 | 0,0→0,1 | 0,0→0,0 |
| prefecture tendue | 47,8→33,4 | 16,2→12,2 | 5,9→11,3 | 16,2→21,5 | 10,4→17,7 | 2,5→3,1 | 0,8→0,8 | 0,1→0,1 | 0,0→0,0 |

### Taille et préchauffage

| | avant | après |
|---|---:|---:|
| titre | 402 726 o, 8 motifs, 14 échantillons | 585 530 o, 12 motifs, 19 échantillons |
| convergence | 350 816 o, 8 motifs, 15 échantillons | 429 354 o, 12 motifs, 14 échantillons |
| bastion | 463 748 o, 8 motifs, 13 échantillons | 530 810 o, 12 motifs, 14 échantillons |
| prefecture | 352 218 o, 8 motifs, 13 échantillons | 359 232 o, 12 motifs, 15 échantillons |
| préchauffage, min / médiane | 471,0 / 502,0 ms | 808,7 / 872,0 ms |

Le préchauffage des quatre modules passe de 471 à 809 ms au minimum (médiane 502 → 872 ms), soit un
rapport de 1,72 (médiane 1,74) : il n'a pas doublé. Par morceau (médiane) : titre 160,8 → 474,9 ms
(×2,95, plus de variantes de batterie à préparer), Convergence 121,4 → 159,5, Bastion 130,9 → 99,0,
Préfecture 98,0 → 139,6. Les mesures absolues restent sensibles à la charge (load average ~5,5 au moment
du relevé) ; c'est le rapport, répété, qui est retenu.
