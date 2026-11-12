#!/usr/bin/env python3
"""Charge le Spark sans Claude : la fin de L9 (fiches écrites), puis chaque lot restant de la 0.3, dont le Spark écrit
lui-même les fiches à partir de Jeu/PLAN.md, menées par chaine.py avec toutes les suites en filet. Décisions de David du
13/11/2026 : « tu dois utiliser zéro tokens, full spark », « charge le spark au max et met toi en pause ». Un seul
passage, sans timer ; les commits restent sur la branche de l'arbre, à relire avant toute intégration.
  cd <arbre de v03-feu-sim> && python3 /…/Jeu/outils/spark/autonome.py --sortie DOSSIER"""
import argparse, pathlib, re, subprocess, time

OUTILS = pathlib.Path(__file__).resolve().parent
MAIN = OUTILS.parents[2]
KBZA = str(pathlib.Path.home() / 'bin' / 'kbza')
SUITES = f'bash {OUTILS}/suites.sh'
L9 = MAIN / 'Jeu/outils/spark/fiches/l9'
FIN_L9 = ['l9-05b-trigo', 'l9-06-branchement', 'l9-07-protocole', 'l9-10-monde-branchement', 'l9-11-monde-etat',
          'l9-12-monde-lance', 'l9-13-monde-jet', 'l9-14-monde-recul', 'l9-15-ia-pompiers', 'l9-16-tests']
D12 = ("Décision de David du 13/11/2026, mot pour mot : « casser la base d'ou sont generées les troupes mais prend beaucoup "
       "de temps ». La base d'un camp (son QG et ses avant-postes, d'où sortent ses troupes) doit tomber nettement plus vite "
       "quand l'ennemi l'attaque : trouve dans Jeu/src/sim/monde.js et Jeu/src/sim/regles.js ce qui fait tomber une base "
       "(points de structure, occupation, reprise, déroute) et divise ce temps par trois environ, sans rien changer d'autre ; "
       "mets à jour les vérifications de Jeu/verifications/sim.test.mjs qui en dépendent.")
LOTS = [('D12', None, D12, ['Jeu/src/sim/monde.js', 'Jeu/src/sim/regles.js']), ('L4', '### L4', '', []),
        ('L5b', '### L5b', '', []), ('L3', '### L3', '', []), ('L6', '### L6', '', []), ('L7', '### L7', '', []),
        ('L8', '### L8', '', [])]
FORMAT = """Tu découpes un lot de travail du jeu « Point de rupture » (RTS de navigateur en JavaScript ; simulation déterministe
dans Jeu/src/sim, rendu, son et interface dans Jeu/src) en fiches pour une chaîne qui fait coder un modèle fiche par fiche.
Le modèle qui code ne voit QUE les extraits que la fiche désigne. Format exact d'une fiche :
Titre: <lot> : <ce que fait la fiche, une ligne>
Fichiers: <désignations séparées par « ; »>
Tests: <commandes séparées par « ; »>
---
<la tâche : quoi changer, dans quel fichier, quelles fonctions, quels noms, quelles valeurs ; précise, complète, rien à deviner>
Désignations : `chemin` (fichier entier : seulement s'il est court ou neuf), `chemin:a-b` (lignes a à b), `chemin:/motif/+N`
(N lignes à partir de la première ligne qui contient le motif). Un motif est copié EXACTEMENT d'une ligne de la carte du
code ci-dessous, sans « ; ». Les chemins partent de la racine du dépôt (Jeu/src/…).
Règles : de 3 à 8 fiches, dans l'ordre où elles s'appliquent ; une fiche = un changement cohérent sur 1 à 3 fichiers ;
120 lignes d'extraits au plus par fiche ; dans Jeu/src/sim, ni Math.random, ni Date, ni Math.sin/cos/tan/atan/hypot/pow/
exp/log, ni ** ; les Tests nomment les suites concernées (node Jeu/verifications/<nom>.test.mjs) ; la chaîne ajoute
d'elle-même toutes les suites et la construction de la page. Ne refais pas ce qui existe déjà (la carte et le suivi le
montrent). Rends uniquement les fiches, chacune précédée d'une ligne `=== FICHE <nn>-<nom-court> ===`.
"""
DEF = re.compile(r'^\s{0,8}(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:\(|function|\w+\s*=>|\{)|class\s+\w+|PDR\.\w+\s*=)')


def dire(*a):
    print(time.strftime('%d/%m %H:%M:%S'), *a, flush=True)


def carte(fichiers, limite=7000):
    morceaux = []
    for f in fichiers:
        p = pathlib.Path(f)
        if not p.is_file():
            continue
        lignes = [f'{k}: {l.strip()[:110]}' for k, l in enumerate(p.read_text(encoding='utf-8').splitlines(), 1) if DEF.match(l)]
        morceaux.append(f'### {f} ({sum(1 for _ in p.open(encoding="utf-8"))} lignes)\n' + '\n'.join(lignes[:70]))
    return '\n'.join(morceaux)[:limite]


def section(titre):
    lignes, dedans, garde = (MAIN / 'Jeu/PLAN.md').read_text(encoding='utf-8').splitlines(), False, []
    for l in lignes:
        if l.startswith(titre + ' '):
            dedans = True
        elif dedans and (l.startswith('### ') or l.startswith('## ')):
            break
        if dedans:
            garde.append(l)
    return '\n'.join(garde)


def chaine(fiches, sortie, *options):
    return subprocess.run(['python3', str(OUTILS / 'chaine.py'), *map(str, fiches), *options, '--sortie', str(sortie)]).returncode


def lot(nom, titre, texte, fichiers, sortie):
    if nom == 'L3' and subprocess.run(['git', 'merge', '--no-edit', 'v03-musique']).returncode:
        subprocess.run(['git', 'merge', '--abort'])
        dire('L3 : la fusion de v03-musique bute, lot sauté')
        return
    texte = texte or section(titre)
    suivi = '\n'.join(l for l in (MAIN / 'Jeu/PLAN.md').read_text(encoding='utf-8').splitlines() if l.startswith(f'| {nom} '))
    cites = sorted(set(re.findall(r'(?:Jeu/)?src/[\w/.-]+\.m?js', texte)))
    fichiers = fichiers + ['Jeu/' + c if not c.startswith('Jeu/') else c for c in cites]
    suites = ' '.join(sorted(p.name for p in pathlib.Path('Jeu/verifications').glob('*.test.mjs')))
    demande = (FORMAT + f'\n## Le lot {nom}\n{texte}\n\n## Son suivi\n{suivi or "(rien)"}\n\n## Les suites\n{suites}\n\n'
               f'## La carte du code (définitions, avec leurs numéros de ligne)\n{carte(fichiers)}\n')
    d = sortie / nom
    d.mkdir(parents=True, exist_ok=True)
    (d / 'plan.demande.txt').write_text(demande, encoding='utf-8')
    r = subprocess.run([KBZA, 'ask', '--prompt-file', str(d / 'plan.demande.txt'), '--no-memory', '--max-tokens', '0',
                        '--timeout-seconds', '1500', '--reasoning-effort', 'low'], capture_output=True, text=True)
    rep = '\n'.join(l for l in r.stdout.splitlines() if not l.startswith('Spark : '))
    (d / 'plan.reponse.md').write_text(rep, encoding='utf-8')
    parts = re.split(r'^=== FICHE (.+?) ===\s*$', rep, flags=re.M)
    fiches = []
    for k in range(1, len(parts) - 1, 2):
        corps = parts[k + 1].strip().strip('`').strip()
        if not corps.startswith('Titre:') or '\n---\n' not in corps:
            continue
        tete, _, reste = corps.partition('\n---\n')
        tete = re.sub(r'^Tests:(.*)$', lambda m: f'Tests:{m[1]} ; {SUITES}', tete, flags=re.M) if 'Tests:' in tete else tete + f'\nTests: {SUITES}'
        f = d / (re.sub(r'[^\w-]', '-', parts[k].strip())[:40] + '.md')
        f.write_text(tete + '\n---\n' + reste + '\n', encoding='utf-8')
        fiches.append(f)
    dire(f'{nom} : {len(fiches)} fiche(s) écrite(s) par le Spark')
    rouges = 0
    for f in fiches:
        code = chaine([f], sortie / 'chaine')
        rouges = rouges + 1 if code else 0
        dire(f'{nom} : {f.stem} {"rouge" if code else "vert"}')
        if rouges >= 2:
            dire(f'{nom} : deux fiches rouges de suite, fin du lot')
            break


p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
p.add_argument('--sortie', type=pathlib.Path, required=True)
a = p.parse_args()
a.sortie.mkdir(parents=True, exist_ok=True)
base = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
dire('départ sur', base[:7])
dire('fin de L9 :', 'vert' if chaine([L9 / f'{n}.md' for n in FIN_L9], a.sortie / 'chaine', '--arret') == 0 else 'rouge')
for nom, titre, texte, fichiers in LOTS:
    try:
        lot(nom, titre, texte, fichiers, a.sortie)
    except Exception as e:  # un lot qui casse n'arrête pas les suivants
        dire(f'{nom} : erreur {e!r}')
log = subprocess.run(['git', 'log', '--oneline', f'{base}..HEAD'], capture_output=True, text=True).stdout
(a.sortie / 'BILAN.md').write_text(f'# Pilote autonome : bilan du {time.strftime("%d/%m/%Y %H:%M")}\n\n## Commits\n{log}\n', encoding='utf-8')
dire('fin ; bilan dans', a.sortie / 'BILAN.md')
