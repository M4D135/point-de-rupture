#!/usr/bin/env python3
"""Verification de l'etape A1 de Point de rupture, en une commande.

    python3 Outils/verifier.py                  sources, compilation, tests, cent relectures au condense attendu
    python3 Outils/verifier.py --sans-compiler  la meme chose sur les binaires deja compiles
    python3 Outils/verifier.py --modele         en plus : les cent parties comparees au modele Python (deux minutes)
    python3 Outils/verifier.py --mesures 5      en plus : chaque duree relevee cinq fois, minimum et mediane

Le moteur est cherche dans la variable d'environnement PDR_UNREAL, sinon dans /Users/Shared/Epic Games/UE_5.8.
Essaye sur Mac seulement. Code de sortie : 0 si tout est bon, 1 sinon.

Sur un portable, une mise en veille pendant les mesures les fausse : les lancer sous caffeinate,
    caffeinate -i python3 Outils/verifier.py --mesures 5
"""
import argparse
import os
import pathlib
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

PROJET = pathlib.Path(__file__).resolve().parent.parent
FICHIER_PROJET = PROJET / 'PointDeRupture.uproject'
MODELE = PROJET / 'Outils' / 'modele' / 'modele_a1.py'

# Critere A1 : cent relectures distinctes de 10 000 iterations, graines 1 a 100.
PARTIES = 100
ITERATIONS = 10000
# Condense de ces cent parties, calcule par le modele seul : python3 Outils/modele/modele_a1.py condense 10000 1 100
CONDENSE_ATTENDU = '9565f56e1f910d8d'

# Le noyau de simulation ne calcule qu'en entiers et ne lit ni horloge ni fichier.
INTERDITS = ('float', 'double', 'FMath', 'FPlatformTime', 'FDateTime', 'IFileManager', 'FFileHelper', 'FPlatformProcess', 'rand', 'srand')

# Options du moteur pour une execution sans affichage ni question, et sans ecoute sur le reseau.
# -notraceserver : sans elle, chaque demarrage du moteur lance un serveur de traces (UnrealTraceServer) qui reste
#                  en fond apres la commande et ecoute sur les ports 1981 et 1989 de toutes les interfaces reseau.
# -notracethreading : sans elle, le moteur ouvre lui-meme le port 1985 (commande des traces) sur toutes les interfaces.
# Le serveur de stockage (zenserver, port 8558) est limite a cette machine par Config/DefaultEngine.ini.
OPTIONS_MOTEUR = ['-nullrhi', '-unattended', '-nosplash', '-nopause', '-stdout', '-notraceserver', '-notracethreading']

# Durees maximales, en secondes : une commande qui les depasse est arretee et comptee en echec.
DELAI_COMPILATION = 3600
DELAI_EXECUTION = 1800


def moteur():
    return pathlib.Path(os.environ.get('PDR_UNREAL', '/Users/Shared/Epic Games/UE_5.8'))


def sans_commentaires(texte):
    texte = re.sub(r'/\*.*?\*/', ' ', texte, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', texte)


def controler_sources():
    """Rend la liste des ecarts : mots interdits dans le noyau, caracteres hors ASCII dans les sources."""
    ecarts = []
    for fichier in sorted((PROJET / 'Source').rglob('*')):
        if fichier.suffix not in ('.h', '.cpp', '.cs'):
            continue
        texte = fichier.read_text(encoding='utf-8')
        relatif = fichier.relative_to(PROJET)
        for numero, ligne in enumerate(texte.split('\n'), 1):
            if any(ord(c) > 127 for c in ligne):
                ecarts.append('%s:%d : caractere hors ASCII' % (relatif, numero))
        if 'PdrSim' in fichier.parts:
            code = sans_commentaires(texte)
            for mot in INTERDITS:
                if re.search(r'\b%s\b' % mot, code):
                    ecarts.append('%s : mot interdit dans le noyau : %s' % (relatif, mot))
    return ecarts


def ecoute_coupee():
    """Vrai si le reglage qui empeche l'outil de compilation d'ouvrir le port 1345 sur le reseau est en place.

    Il vit dans Saved/, dossier que l'on vide parfois ; le depot le suit par exception (.gitignore).
    Sa disparition doit se voir.
    """
    reglage = PROJET / 'Saved' / 'UnrealBuildTool' / 'BuildConfiguration.xml'
    if not reglage.is_file():
        return False
    return re.search(r'<bDisableRemote>\s*true\s*</bDisableRemote>', reglage.read_text(encoding='utf-8')) is not None


def serveurs_de_traces():
    """Numeros des processus UnrealTraceServer en cours. Chacun ecoute sur les ports 1981 et 1989 de toutes les interfaces."""
    if sys.platform.startswith('win'):
        return set()
    return set(subprocess.run(['pgrep', '-x', 'UnrealTraceServer'], capture_output=True, text=True).stdout.split())


def lancer(commande, delai):
    """Lance une commande. Rend (code de sortie, sortie, duree) ; le code vaut None si le delai est depasse.

    La sortie passe par un fichier et non par un tube : un processus de fond lance par la commande herite de sa
    sortie, et garderait le tube ouvert apres elle. La lecture attendrait alors sa fin, sans limite.
    """
    with tempfile.TemporaryFile() as sortie:
        debut = time.monotonic()
        try:
            code = subprocess.run(commande, stdin=subprocess.DEVNULL, stdout=sortie, stderr=subprocess.STDOUT, timeout=delai).returncode
        except subprocess.TimeoutExpired:
            code = None
        duree = time.monotonic() - debut
        sortie.seek(0)
        return code, sortie.read().decode('utf-8', errors='replace'), duree


def compiler():
    if sys.platform == 'darwin':
        commande = [str(moteur() / 'Engine/Build/BatchFiles/Mac/Build.sh'), 'PointDeRuptureEditor', 'Mac']
    elif sys.platform.startswith('win'):
        commande = [str(moteur() / 'Engine/Build/BatchFiles/Build.bat'), 'PointDeRuptureEditor', 'Win64']
    else:
        commande = [str(moteur() / 'Engine/Build/BatchFiles/Linux/Build.sh'), 'PointDeRuptureEditor', 'Linux']
    # -UBADisableRemote : aucune ecoute reseau pendant cette compilation, meme si le reglage du projet a disparu.
    commande += ['Development', '-project=%s' % FICHIER_PROJET, '-waitmutex', '-UBADisableRemote']
    code, sortie, duree = lancer(commande, DELAI_COMPILATION)
    avertissements = [l for l in sortie.split('\n') if re.search(r'\b(warning|error)\b', l)]
    ecoutes = [l for l in sortie.split('\n') if 'Listening on' in l]
    if code is None:
        avertissements.append('compilation arretee apres %d s' % DELAI_COMPILATION)
    return code == 0 and not avertissements and not ecoutes, duree, avertissements + ecoutes


def executer(arguments):
    """Lance l'executeur sans affichage. Rend (code de sortie, lignes PDR_ en dictionnaires, duree de la commande)."""
    if sys.platform == 'darwin':
        binaire = moteur() / 'Engine/Binaries/Mac/UnrealEditor-Cmd'
    elif sys.platform.startswith('win'):
        binaire = moteur() / 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
    else:
        binaire = moteur() / 'Engine/Binaries/Linux/UnrealEditor-Cmd'
    commande = [str(binaire), str(FICHIER_PROJET), '-run=PdrSim'] + arguments + OPTIONS_MOTEUR
    code, sortie, duree = lancer(commande, DELAI_EXECUTION)
    lignes = {}
    echecs = []
    if code is None:
        code = -1
        echecs.append('execution arretee apres %d s' % DELAI_EXECUTION)
    for ligne in sortie.split('\n'):
        trouve = re.search(r'LogPdrOutils: (Display|Error): (PDR_\w+)(.*)', ligne)
        # En fin d'execution, le moteur repete les erreurs sous LogInit : elles ne sont pas comptees deux fois.
        if not trouve or 'LogInit' in ligne:
            continue
        nom, reste = trouve.group(2), trouve.group(3).strip()
        if trouve.group(1) == 'Error':
            echecs.append('%s %s' % (nom, reste))
        else:
            lignes[nom] = dict(champ.split('=', 1) for champ in reste.split(' ') if '=' in champ) or {'texte': reste}
    return code, lignes, echecs, duree


def resume(valeurs):
    return 'minimum %.3f, mediane %.3f, sur %d' % (min(valeurs), statistics.median(valeurs), len(valeurs))


def principal():
    lecteur = argparse.ArgumentParser(description='Verification de l\'etape A1.')
    lecteur.add_argument('--sans-compiler', action='store_true')
    lecteur.add_argument('--modele', action='store_true')
    lecteur.add_argument('--mesures', type=int, default=0)
    options = lecteur.parse_args()
    bon = True

    ecarts = controler_sources()
    print('SOURCES   %s' % ('conformes' if not ecarts else 'ECARTS'))
    for ecart in ecarts:
        print('          %s' % ecart)
    bon = bon and not ecarts

    coupee = ecoute_coupee()
    print('RESEAU    %s' % ('ecoute de l\'outil de compilation coupee pour ce projet' if coupee
                            else 'ECART : Saved/UnrealBuildTool/BuildConfiguration.xml ne coupe plus l\'ecoute du port 1345 (bDisableRemote)'))
    bon = bon and coupee

    traces_avant = serveurs_de_traces()
    if traces_avant:
        print('          note : un serveur de traces d\'Unreal tournait deja (processus %s), ports 1981 et 1989 ouverts sur le reseau'
              % ', '.join(sorted(traces_avant)))

    if not options.sans_compiler:
        reussie, duree, remarques = compiler()
        print('COMPILER  %s en %.1f s' % ('reussie, sans avertissement ni ecoute reseau' if reussie else 'ECHEC', duree))
        for remarque in remarques[:20]:
            print('          %s' % remarque.strip())
        bon = bon and reussie
        if not reussie:
            return 1

    dossier = tempfile.mkdtemp(prefix='pdr-parties-') if options.modele else None
    try:
        arguments = ['-tests', '-boucle=24000', '-relectures=%d' % PARTIES, '-iterations=%d' % ITERATIONS, '-attendu=%s' % CONDENSE_ATTENDU]
        if dossier:
            arguments.append('-dossier=%s' % dossier)
        code, lignes, echecs, duree = executer(arguments)
        tests = lignes.get('PDR_TESTS', {})
        boucle = lignes.get('PDR_BOUCLE', {})
        relectures = lignes.get('PDR_RELECTURES', {})
        print('TESTS     %s verifications, %s echecs, %s ms' % (tests.get('verifications', '?'), tests.get('echecs', '?'), tests.get('duree_ms', '?')))
        print('BOUCLE    %s iterations a vide en %s ms' % (boucle.get('iterations', '?'), boucle.get('duree_ms', '?')))
        print('RELIRE    %s parties de %s iterations, %s conformes, %s distinctes, condense %s (attendu %s)' % (
            relectures.get('parties', '?'), relectures.get('iterations', '?'), relectures.get('conformes', '?'),
            relectures.get('distinctes', '?'), relectures.get('condense', '?'), CONDENSE_ATTENDU))
        print('COMMANDE  code de sortie %d, %.1f s demarrage du moteur compris' % (code, duree))
        for echec in echecs:
            print('          %s' % echec)
        # Criteres ecrits de l'etape A1 : relectures conformes et reproductibles, boucle vide sous la seconde, suite sous la minute.
        criteres = (
            code == 0 and tests.get('echecs') == '0' and relectures.get('conformes') == str(PARTIES)
            and relectures.get('distinctes') == str(PARTIES) and relectures.get('condense') == CONDENSE_ATTENDU
            and float(boucle.get('duree_ms', '1e9')) < 1000.0 and float(tests.get('duree_ms', '1e9')) < 60000.0)
        bon = bon and criteres

        if dossier:
            debut = time.monotonic()
            modele = subprocess.run([sys.executable, '-B', str(MODELE), 'comparer', dossier, str(ITERATIONS), '1', str(PARTIES)], capture_output=True, text=True)
            derniere = modele.stdout.strip().split('\n')[-1] if modele.stdout.strip() else modele.stderr.strip()
            print('MODELE    %s, en %.0f s' % (derniere, time.monotonic() - debut))
            bon = bon and modele.returncode == 0
    finally:
        if dossier:
            shutil.rmtree(dossier, ignore_errors=True)

    if options.mesures > 0:
        releves = {}

        def noter(nom, valeur):
            releves.setdefault(nom, []).append(float(valeur))

        for _ in range(options.mesures):
            code, lignes, echecs, duree = executer(['-tests', '-boucle=24000', '-charge=24000', '-file=100000',
                                                    '-relectures=%d' % PARTIES, '-iterations=%d' % ITERATIONS, '-attendu=%s' % CONDENSE_ATTENDU])
            if code != 0:
                print('MESURE    execution en echec : %s' % '; '.join(echecs))
                bon = False
                break
            noter('commande complete, en secondes', duree)
            noter('suite de tests, en ms', lignes['PDR_TESTS']['duree_ms'])
            noter('24 000 iterations a vide, en ms', lignes['PDR_BOUCLE']['duree_ms'])
            noter('regime charge, en microsecondes par iteration', lignes['PDR_CHARGE']['us_par_iteration'])
            noter('regime charge, en pour cent du budget', lignes['PDR_CHARGE']['budget_pct'])
            noter('file longue, avance en ms', lignes['PDR_FILE']['avance_ms'])
            noter('cent parties jouees et rejouees, en ms', lignes['PDR_RELECTURES']['duree_ms'])
            for effectif in (48, 200, 4096):
                code, lignes, echecs, duree = executer(['-boucle=24000', '-escouades=%d' % effectif])
                if code != 0:
                    print('MESURE    execution en echec : %s' % '; '.join(echecs))
                    bon = False
                    continue
                noter('24 000 iterations, %d escouades en marche, en ms' % effectif, lignes['PDR_BOUCLE']['duree_ms'])
        for nom, valeurs in releves.items():
            print('MESURE    %s : %s' % (nom, resume(valeurs)))

    traces_lancees = serveurs_de_traces() - traces_avant
    if traces_lancees:
        print('RESEAU    ECART : un serveur de traces d\'Unreal a ete lance pendant la verification (processus %s), ports 1981 et 1989 ouverts'
              % ', '.join(sorted(traces_lancees)))
        bon = False

    print('RESULTAT  %s' % ('REUSSI' if bon else 'ECHEC'))
    return 0 if bon else 1


if __name__ == '__main__':
    sys.exit(principal())
