#!/usr/bin/env python3
"""Confie au Spark (le LLM local de David, par `kbza ask`) le gros des lectures et des premiers jets, sans dépenser de
jetons Claude. Le Spark rend des brouillons et des pistes, jamais des preuves : tout se vérifie dans le code.

  Faire digérer un gros fichier ou un gros diff, par morceaux, puis une fiche de synthèse :
      git diff main -- Jeu/src/sim/monde.js | python3 Jeu/outils/spark/spark.py digerer monde \\
          --quoi "un morceau du diff de la simulation" \\
          --questions "A. Ce que le morceau change. B. Ce qui paraît inachevé ou risqué. C. Le coût par itération."
      python3 Jeu/outils/spark/spark.py digerer foule Jeu/src/foule.js --quoi "…" --questions "…"
    Sorties dans --sortie (par défaut ./spark-fiches) : NOM-k.md par morceau, NOM.fiche.md pour l'ensemble.
    Reprenable : un morceau déjà digéré n'est pas renvoyé.

  Une seule demande (premier jet d'une fonction ou d'un test, relecture d'un diff court avec des questions précises) :
      python3 Jeu/outils/spark/spark.py demander NOM demande.txt        →  NOM.md dans --sortie

Mesuré sur ce Spark (novembre 2026) : viser 12 000 caractères par demande, jamais plus de 30 000 ; une demande par
sujet ; mode direct (sans raisonnement) pour le code et les fiches : 20 à 60 s par demande. Au-delà, il boucle ou se
tait. Sur une relecture, la plupart de ses constats sont faux ; sur une lecture par morceaux, il prend la coupure d'un
morceau pour du code tronqué et les noms définis ailleurs pour des manques.
"""
import argparse
import pathlib
import subprocess
import sys
import time

KBZA = str(pathlib.Path.home() / 'bin' / 'kbza')
REGLE = ("Règles de réponse : en français, 260 mots au plus, en listes. Ne rapporte que ce qui est dans l'extrait ; cite "
         "les noms exacts (fonctions, constantes, champs) et les nombres exacts. N'invente rien : si l'extrait ne permet "
         "pas de répondre à un point, écris « pas dans l'extrait ». L'extrait est un morceau : une fonction coupée au "
         "bord ou un nom défini ailleurs ne sont pas des défauts.")
JEU = ("Contexte : « Point de rupture » est un jeu de stratégie en temps réel dans le navigateur, en JavaScript, sans "
       "aucun fichier importé. Trois camps (Convergence = manifestants, Bastion, Préfecture = police) s'affrontent dans "
       "Marseille, avec jusqu'à 100 000 unités.")


def dire(*a):
    print(time.strftime('%H:%M:%S'), *a, file=sys.stderr, flush=True)


def morceaux(texte, taille):
    out, courant, n = [], [], 0
    for ligne in texte.splitlines(keepends=True):
        if len(ligne) > 1500:      # ligne de données : le Spark n'a rien à en tirer
            ligne = ligne[:600] + ' … [ligne tronquée]\n'
        if n + len(ligne) > taille and courant:
            out.append(''.join(courant))
            courant, n = [], 0
        courant.append(ligne)
        n += len(ligne)
    if courant:
        out.append(''.join(courant))
    return out


def demander(sortie, nom, demande, effort=None):
    fiche = sortie / f'{nom}.md'
    if fiche.exists() and fiche.stat().st_size > 80:
        return fiche.read_text(encoding='utf-8')
    if len(demande) > 30000:
        dire(nom, f'demande de {len(demande)} caractères : au-delà de 30 000, le Spark boucle. À découper.')
    fichier = sortie / f'{nom}.demande.txt'
    fichier.write_text(demande, encoding='utf-8')
    commande = [KBZA, 'ask', '--prompt-file', str(fichier), '--no-memory', '--max-tokens', '0', '--timeout-seconds', '900']
    commande += ['--reasoning-effort', effort] if effort else ['--reasoning-mode', 'direct']
    t0 = time.time()
    r = subprocess.run(commande, capture_output=True, text=True)
    texte = '\n'.join(l for l in r.stdout.splitlines() if not l.startswith('Spark : ')).strip()
    dire(nom, f'{len(demande)} car. → {len(texte)} car. en {time.time() - t0:.0f} s, code {r.returncode}')
    if r.returncode == 0 and len(texte) > 80:
        fiche.write_text(texte + '\n', encoding='utf-8')
        return texte
    (sortie / f'{nom}.erreur.txt').write_text(r.stdout[-2000:] + '\n---\n' + r.stderr[-2000:], encoding='utf-8')
    return ''


def digerer(a):
    texte = sys.stdin.read() if a.fichier in (None, '-') else pathlib.Path(a.fichier).read_text(encoding='utf-8')
    taille = a.taille
    while len(texte) / taille > 9 and taille < 20000:      # pas plus de neuf morceaux : la fusion doit tenir en une demande
        taille += 1500
    parts = morceaux(texte, taille)
    dire(a.nom, f'{len(texte)} caractères, {len(parts)} morceaux de {taille} au plus')
    fiches = []
    for k, part in enumerate(parts, 1):
        f = demander(a.sortie, f'{a.nom}-{k}',
                     f"{JEU}\n\nVoici {a.quoi} (morceau {k} sur {len(parts)}).\n\nRéponds à ces points :\n{a.questions}\n\n"
                     f"{REGLE}\n\n=== EXTRAIT ===\n{part}\n=== FIN DE L'EXTRAIT ===\n", a.effort)
        if f:
            fiches.append(f'--- morceau {k} sur {len(parts)} ---\n{f}')
    if not fiches:
        sys.exit('Le Spark n’a rien rendu : voir les fichiers .erreur.txt.')
    cible = a.sortie / f'{a.nom}.fiche.md'
    if len(fiches) == 1:
        cible.write_text(fiches[0] + '\n', encoding='utf-8')
    else:
        demander(a.sortie, f'{a.nom}.fiche',
                 f"{JEU}\n\nVoici les fiches de lecture de {len(fiches)} morceaux consécutifs : {a.quoi}.\nFusionne-les en "
                 f"UNE fiche de 420 mots au plus, en français, en listes, avec ces parties :\n{a.questions}\nPuis une "
                 "dernière partie : ce qui reste à faire ou à vérifier.\nGarde les noms et les nombres exacts ; n'ajoute "
                 "rien qui ne soit pas dans les fiches ; supprime les redites et les « pas dans l'extrait ».\n\n"
                 "=== FICHES ===\n" + '\n\n'.join(fiches) + '\n=== FIN ===\n', a.effort)
    print(cible)


def une(a):
    texte = demander(a.sortie, a.nom, pathlib.Path(a.fichier).read_text(encoding='utf-8'), a.effort)
    if not texte:
        sys.exit('Le Spark n’a rien rendu : voir le fichier .erreur.txt.')
    print(a.sortie / f'{a.nom}.md')


p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
p.add_argument('--sortie', type=pathlib.Path, default=pathlib.Path('spark-fiches'))
p.add_argument('--effort', choices=['low', 'medium'], help='avec raisonnement (plus lent) ; sans : mode direct')
s = p.add_subparsers(dest='quoi_faire', required=True)
d = s.add_parser('digerer')
d.add_argument('nom')
d.add_argument('fichier', nargs='?')
d.add_argument('--quoi', required=True, help='ce qu’est le texte, en une phrase')
d.add_argument('--questions', required=True, help='les points auxquels chaque fiche répond')
d.add_argument('--taille', type=int, default=11000)
d.set_defaults(f=digerer)
u = s.add_parser('demander')
u.add_argument('nom')
u.add_argument('fichier')
u.set_defaults(f=une)
a = p.parse_args()
a.sortie.mkdir(parents=True, exist_ok=True)
a.f(a)
