#!/usr/bin/env python3
"""Chaîne du Spark : une tâche de code menée de bout en bout par le LLM local de David, sans jetons Claude.

David, 12 novembre 2026 : « go full spark pour economiser tes tokens ». Claude écrit des fiches de tâche courtes et
vérifie à la fin ; la chaîne fait le reste, tour par tour :
  1. demande au Spark (`kbza ask`, mode direct, sans mémoire) des blocs de remplacement AVANT / APRÈS, à partir de la
     tâche et des extraits de code qu'elle désigne ;
  2. applique les blocs (copie exacte, sinon même suite de lignes au retrait près ; un bloc ambigu est refusé) ;
  3. contrôle la syntaxe des fichiers touchés (`node --check`) et lance les tests de la tâche ;
  4. vert : committe les fichiers touchés ; rouge : remet l'arbre comme avant et renvoie au Spark l'échec et sa réponse,
     jusqu'à --tours tours.

    python3 Jeu/outils/spark/chaine.py TACHE.md [TACHE2.md …] [--tours 4] [--sortie DOSSIER] [--essai] [--sans-commit]

Une fiche de tâche :
    Titre: Les quatre sortes de L2 dans SORTES_CASSABLES
    Fichiers: Jeu/src/sim/regles.js:/SORTES_CASSABLES/+40, Jeu/src/sim/monde.js:1200-1260
    Tests: node Jeu/verifications/sim.test.mjs ; node Jeu/verifications/regles.test.mjs
    ---
    Ce qu'il faut faire, précisément : où, quoi, quels nombres, ce qu'il ne faut pas toucher.

`Tests:` sépare ses commandes par « ; » (une virgule peut figurer dans une commande). `Fichiers:` désigne les extraits envoyés (chemin entier, `chemin:a-b` en lignes, ou `chemin:/motif/+N` : N lignes à
partir de la première qui contient le motif). Le Spark ne voit que ces extraits : viser 12 000 caractères de demande,
jamais plus de 30 000 (mesuré en novembre 2026 ; au-delà il boucle ou se tait). Tout ce qu'il rend reste un brouillon :
les tests de la fiche et la relecture finale de Claude décident.
"""
import argparse
import pathlib
import re
import subprocess
import sys
import time

KBZA = str(pathlib.Path.home() / 'bin' / 'kbza')
RACINE = pathlib.Path(subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True,
                                     check=True).stdout.strip())
REGLE = """Tu modifies le code d'un jeu de navigateur en JavaScript, « Point de rupture » (RTS, simulation déterministe).
Réponds UNIQUEMENT par des blocs de remplacement, puis une dernière ligne « RÉSUMÉ : » suivie d'une phrase en français.
Un bloc, à reproduire exactement :
FICHIER: chemin/du/fichier.js
<<<<<<< AVANT
lignes copiées telles quelles depuis l'extrait, retrait compris (2 à 12 lignes, assez pour n'apparaître qu'une fois)
=======
les mêmes lignes après ta modification
>>>>>>> APRÈS
Pour ajouter du code, prends pour AVANT les lignes qui précèdent l'endroit et répète-les en tête de APRÈS. Pour un
fichier neuf, laisse AVANT vide. Plusieurs blocs sont permis, un par endroit.
Règles : ne touche qu'aux fichiers et endroits que la tâche nomme ; garde le style du fichier (retrait, noms et
commentaires en français) ; dans la simulation, ni Math.random, ni Date.now, ni performance.now (déterminisme), pas
d'allocation dans les boucles par unité ; ne réécris jamais un fichier entier ; aucun texte hors des blocs et du RÉSUMÉ.
"""
BLOC = re.compile(r'FICHIER:\s*`?(?P<f>[^\n`]+?)`?\s*\n<<<<<<< AVANT[^\n]*\n(?P<a>.*?)^=======[^\n]*\n(?P<b>.*?)'
                  r'^>>>>>>> APR[ÈE]S', re.M | re.S)


def dire(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def lire_fiche(chemin):
    tete, _, corps = chemin.read_text(encoding='utf-8').partition('\n---\n')
    champs = {}
    for ligne in tete.splitlines():
        if ':' in ligne:
            k, _, v = ligne.partition(':')
            champs[k.strip().lower()] = v.strip()
    return {'titre': champs.get('titre', chemin.stem), 'fichiers': [x.strip() for x in champs.get('fichiers', '').split(',') if x.strip()],
            'tests': [x.strip() for x in champs.get('tests', '').split(';') if x.strip()], 'texte': corps.strip()}


def extrait(designation):
    m = re.fullmatch(r'(?P<p>[^:]+)(?::(?:(?P<a>\d+)-(?P<b>\d+)|/(?P<motif>.+)/\+(?P<n>\d+)))?', designation)
    if not m:
        raise SystemExit(f'désignation illisible : {designation}')
    chemin = RACINE / m['p']
    if not chemin.exists():
        return f'=== {m["p"]} (fichier neuf) ===\n'
    lignes = chemin.read_text(encoding='utf-8').splitlines()
    if m['a']:
        a, b = int(m['a']), min(int(m['b']), len(lignes))
    elif m['motif']:
        debut = next((k for k, l in enumerate(lignes) if m['motif'] in l), None)
        if debut is None:
            raise SystemExit(f'motif introuvable dans {m["p"]} : {m["motif"]}')
        a, b = debut + 1, min(debut + int(m['n']), len(lignes))
    else:
        a, b = 1, len(lignes)
    return f'=== {m["p"]}, lignes {a} à {b} sur {len(lignes)} ===\n' + '\n'.join(lignes[a - 1:b]) + '\n=== fin de l\'extrait ===\n'


def demander(demande, fichier):
    fichier.write_text(demande, encoding='utf-8')
    commande = [KBZA, 'ask', '--prompt-file', str(fichier), '--no-memory', '--max-tokens', '0',
                '--timeout-seconds', '900', '--reasoning-mode', 'direct']
    t0 = time.time()
    r = subprocess.run(commande, capture_output=True, text=True)
    texte = '\n'.join(l for l in r.stdout.splitlines() if not l.startswith('Spark : ')).strip()
    return texte, r.returncode, time.time() - t0, r.stderr[-1500:]


def nettoyer(t):
    lignes = t.split('\n')
    while lignes and lignes[0].strip().startswith('```'):
        lignes.pop(0)
    while len(lignes) > 1 and lignes[-2].strip().startswith('```'):
        lignes.pop(-2)
    return '\n'.join(lignes)


def appliquer(blocs):
    """Applique les blocs ; rend (fichiers touchés, fichiers créés, erreurs). Rien n'est écrit si un bloc échoue."""
    contenus, crees, erreurs = {}, set(), []
    for k, (f, avant, apres) in enumerate(blocs, 1):
        chemin = RACINE / f
        if f not in contenus:
            contenus[f] = chemin.read_text(encoding='utf-8') if chemin.exists() else None
        texte = contenus[f]
        if texte is None:
            if avant.strip():
                erreurs.append(f'bloc {k} ({f}) : le fichier n\'existe pas et AVANT n\'est pas vide')
                continue
            contenus[f] = apres
            crees.add(f)
            continue
        if not avant.strip():
            erreurs.append(f'bloc {k} ({f}) : AVANT vide sur un fichier existant')
            continue
        n = texte.count(avant)
        if n == 1:
            contenus[f] = texte.replace(avant, apres, 1)
            continue
        if n > 1:
            erreurs.append(f'bloc {k} ({f}) : AVANT apparaît {n} fois ; prends plus de lignes')
            continue
        # Même suite de lignes, au retrait et aux espaces de fin près.
        lf, la = texte.split('\n'), [l.strip() for l in avant.rstrip('\n').split('\n')]
        places = [i for i in range(len(lf) - len(la) + 1) if all(lf[i + j].strip() == la[j] for j in range(len(la)))]
        if len(places) == 1:
            i = places[0]
            contenus[f] = '\n'.join(lf[:i] + apres.rstrip('\n').split('\n') + lf[i + len(la):])
        else:
            erreurs.append(f'bloc {k} ({f}) : AVANT introuvable dans le fichier (ni tel quel, ni au retrait près)'
                           if not places else f'bloc {k} ({f}) : AVANT ambigu ({len(places)} endroits)')
    if erreurs:
        return [], [], erreurs
    for f, t in contenus.items():
        (RACINE / f).parent.mkdir(parents=True, exist_ok=True)
        (RACINE / f).write_text(t, encoding='utf-8')
    return list(contenus), sorted(crees), []


def remettre(touches, crees):
    garde = [f for f in touches if f not in crees]
    if garde:
        subprocess.run(['git', 'checkout', '--'] + garde, cwd=RACINE, check=False)
    for f in crees:
        (RACINE / f).unlink(missing_ok=True)


def verifier(touches, tests):
    for f in touches:
        if f.endswith(('.js', '.mjs')):
            r = subprocess.run(['node', '--check', f], cwd=RACINE, capture_output=True, text=True)
            if r.returncode:
                return f'syntaxe de {f} :\n' + (r.stderr or r.stdout)[-1500:]
    for t in tests:
        try:
            r = subprocess.run(t, shell=True, cwd=RACINE, capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            return f'{t} : plus de 15 minutes, arrêté'
        if r.returncode:
            return f'{t} : échec (code {r.returncode})\n' + '\n'.join((r.stdout + r.stderr).splitlines()[-40:])
    return ''


def mener(fiche_chemin, a):
    fiche = lire_fiche(fiche_chemin)
    nom = fiche_chemin.stem
    sortie = a.sortie
    sortie.mkdir(parents=True, exist_ok=True)
    journal = sortie / f'{nom}.journal.md'
    lignes_journal = [f'# {fiche["titre"]}\n']
    sale = subprocess.run(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=RACINE, capture_output=True,
                          text=True).stdout.strip()
    if sale and not a.essai:
        dire(nom, 'arbre de travail modifié : la chaîne ne part que d\'un arbre propre')
        return False, 'arbre modifié'
    base = REGLE + '\n## La tâche\n' + fiche['texte'] + '\n\n## Les extraits (le Spark ne voit que ceux-ci)\n' + \
        '\n'.join(extrait(d) for d in fiche['fichiers'])
    reponse, echec = '', ''
    for tour in range(1, a.tours + 1):
        demande = base
        if echec:
            reste = 29000 - len(base) - len(echec) - 400
            demande += (f'\n## Ta réponse précédente a échoué ; corrige-la (les fichiers sont revenus à l\'état des '
                        f'extraits)\n{echec}\n\n### Ta réponse précédente\n{reponse[:max(reste, 0)]}\n')
        if len(demande) > 30000:
            dire(nom, f'tour {tour} : demande de {len(demande)} caractères, au-delà de 30 000 : fiche à resserrer')
            lignes_journal.append(f'- tour {tour} : demande trop longue ({len(demande)} car.)')
            break
        if a.essai:
            dire(nom, f'essai : demande de {len(demande)} caractères, {len(fiche["fichiers"])} extraits, tests {fiche["tests"]}')
            (sortie / f'{nom}-1.demande.txt').write_text(demande, encoding='utf-8')
            return True, 'essai'
        reponse, code, duree, err = demander(demande, sortie / f'{nom}-{tour}.demande.txt')
        (sortie / f'{nom}-{tour}.reponse.md').write_text(reponse + '\n', encoding='utf-8')
        blocs = [(m['f'].strip(), nettoyer(m['a']), nettoyer(m['b'])) for m in BLOC.finditer(reponse)]
        resume = next((l.split(':', 1)[1].strip() for l in reponse.splitlines() if l.upper().startswith(('RÉSUMÉ', 'RESUME'))), '')
        dire(nom, f'tour {tour} : {len(demande)} car. → {len(reponse)} car. en {duree:.0f} s, {len(blocs)} bloc(s)')
        if code or not blocs:
            echec = (f'aucun bloc lisible dans ta réponse (code {code}) ; respecte exactement le format FICHIER / '
                     f'<<<<<<< AVANT / ======= / >>>>>>> APRÈS') + (f'\n{err}' if code else '')
            lignes_journal.append(f'- tour {tour} : aucun bloc ({duree:.0f} s, code {code})')
            continue
        touches, crees, erreurs = appliquer(blocs)
        if erreurs:
            echec = 'blocs refusés :\n' + '\n'.join(erreurs)
            lignes_journal.append(f'- tour {tour} : ' + ' ; '.join(erreurs))
            dire(nom, f'tour {tour} : ' + ' ; '.join(erreurs))
            continue
        echec = verifier(touches, fiche['tests'])
        if echec:
            lignes_journal.append(f'- tour {tour} : appliqué ({", ".join(touches)}), rouge : {echec.splitlines()[0]}')
            dire(nom, f'tour {tour} : rouge : {echec.splitlines()[0]}')
            remettre(touches, crees)
            continue
        lignes_journal.append(f'- tour {tour} : vert ({", ".join(touches)}) ; {resume}')
        dire(nom, f'tour {tour} : vert, {", ".join(touches)}')
        if not a.sans_commit:
            subprocess.run(['git', 'add', '--'] + touches, cwd=RACINE, check=True)
            message = (f'Spark : {fiche["titre"]}\n\n{resume}\nChaîne du Spark (Jeu/outils/spark/chaine.py), tour {tour} ; '
                       f'tests : {", ".join(fiche["tests"]) or "syntaxe seule"}.\n\n'
                       'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
            subprocess.run(['git', 'commit', '-q', '-m', message], cwd=RACINE, check=True)
            commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=RACINE, capture_output=True,
                                    text=True).stdout.strip()
            lignes_journal.append(f'- commit {commit}')
        journal.write_text('\n'.join(lignes_journal) + '\n', encoding='utf-8')
        return True, f'vert au tour {tour}'
    journal.write_text('\n'.join(lignes_journal) + '\n', encoding='utf-8')
    return False, f'échec après {a.tours} tours'


p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
p.add_argument('fiches', nargs='+', type=pathlib.Path)
p.add_argument('--tours', type=int, default=4)
p.add_argument('--sortie', type=pathlib.Path, default=pathlib.Path('spark-chaine'))
p.add_argument('--essai', action='store_true', help='construit les demandes sans appeler le Spark')
p.add_argument('--sans-commit', action='store_true')
a = p.parse_args()
bilan = []
for f in a.fiches:
    ok, quoi = mener(f.resolve(), a)
    bilan.append(f'{"VERT " if ok else "ROUGE"} {f.stem} : {quoi}')
print('\n'.join(['', 'BILAN DE LA CHAÎNE'] + bilan), flush=True)
sys.exit(0 if all(b.startswith('VERT') for b in bilan) else 1)
