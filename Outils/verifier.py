#!/usr/bin/env python3
"""Verification de l'etape A1 de Point de rupture, en une commande.

    python3 Outils/verifier.py                  sources, compilation, objets du noyau, tests, cent parties jouees et relues
    python3 Outils/verifier.py --sans-compiler  la meme chose sur les binaires deja compiles
    python3 Outils/verifier.py --modele         en plus : les cent parties comparees au modele Python (deux minutes)
    python3 Outils/verifier.py --mesures 5      en plus : chaque duree relevee cinq fois, minimum et mediane
    python3 Outils/verifier.py --sans-ecoutes   sans le releve des ecoutes reseau, la ou lsof manque

Le moteur est cherche dans la variable d'environnement PDR_UNREAL, sinon dans /Users/Shared/Epic Games/UE_5.8.
Essaye sur Mac seulement. Code de sortie : 0 si tout est bon, 1 sinon.

Sur un portable, une mise en veille pendant les mesures les fausse : les lancer sous caffeinate,
    caffeinate -i python3 Outils/verifier.py --mesures 5
"""
import argparse
import json
import os
import pathlib
import platform
import re
import shutil
import signal
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
# Nombre de verifications de la suite. Un autre nombre est un echec : une partie de la suite n'a pas tourne,
# ou des tests ont ete ajoutes sans que ce nombre, ecrit aussi dans CONTRE-EXPERTISE.md, ait suivi.
VERIFICATIONS_ATTENDUES = 509
# File longue : 100 000 commandes soumises d'avance puis jouees. Une demi-milliseconde avec la file a indice de tete,
# plus de six secondes si l'on revenait au retrait en tete a chaque iteration.
FILE_LONGUE = 100000
AVANCE_FILE_MAX_MS = 100.0

# Le noyau de simulation (Source/PdrSim) ne calcule qu'en entiers et ne lit ni horloge, ni alea du systeme, ni fichier.
# Trois controles se completent. Aucun ne suffit seul.
# 1. Dans ses sources, hors commentaires et chaines : aucun litteral a virgule ou a exposant, aucun de ces mots.
MOTS_INTERDITS = (
    # Nombres a virgule : types, bibliotheque mathematique, types geometriques du moteur.
    r'float|double|FMath|FGenericPlatformMath|FPlatformMath|FVector\w*|FRotator\w*|FQuat\w*|FTransform\w*|FMatrix\w*'
    r'|FLinearColor|FBox\w*|FSphere\w*|FPlane\w*'
    r'|sqrt[fl]?|cbrt[fl]?|pow[fl]?|floor[fl]?|ceil[fl]?|l?l?round[fl]?|trunc[fl]?|fabs[fl]?|hypot[fl]?|fmod[fl]?'
    r'|exp|log|log2|log10|sin|cos|tan|asin|acos|atan|atan2'
    # Horloges et etat de la machine.
    r'|FPlatformTime|FDateTime|FTimespan|FApp|FPlatformMisc|FPlatformTLS|FPlatformProcess'
    r'|time|clock|chrono|gettimeofday|mach_absolute_time'
    # Alea et identifiants tires au sort.
    r'|rand|srand|random|arc4random\w*|random_device|mt19937\w*|FRandomStream|FGuid'
    # Fichiers.
    r'|IFileManager|FFileHelper|IPlatformFile|FPlatformFile\w*|fopen|ifstream|ofstream|fstream'
    # Collections sans ordre garanti, et calcul reparti sur plusieurs fils.
    r'|TMap|TSet|TMultiMap|unordered_map|unordered_set|ParallelFor\w*|FRunnable\w*|AsyncTask|async'
)
MOT_INTERDIT = re.compile(r'(?<![\w])(?:%s)(?![\w])' % MOTS_INTERDITS)
LITTERAL_A_VIRGULE = re.compile(r'(?<![\w.])(?:\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)[fFlL]?(?![\w.])')
# Lignes temoins : a chaque passage, le controle des sources doit refuser les premieres et admettre les secondes.
TEMOINS_REFUSES = (
    'Escouade.Position.X += static_cast<int32>(PasX * 0.5);',
    'const auto Facteur = 1.25;',
    'int32 Degats(int32 Base) { return Base * .5; }',
    'const int32 Pas = Base * 3 / 2e0;',
    'const int64 Distance = static_cast<int64>(sqrt(EcartX * EcartX + EcartY * EcartY));',
    'const float Pas = 1;',
    'FMath::Sqrt(Somme);',
    'FPlatformMath::Sqrt(Carre);',
    'FVector2D::Distance(FVector2D(X0, Y0), FVector2D(X1, Y1));',
    'FPlatformTime::Seconds();',
    'FApp::GetCurrentTime();',
    'std::chrono::steady_clock::now();',
    'FPlatformMisc::NumberOfCores();',
    'FRandomStream Flux(12345);',
    'FGuid::NewGuid();',
    'rand();',
    'IFileManager::Get();',
    'for (const TPair<int32, int32>& Paire : TMap<int32, int32>()) {}',
)
TEMOINS_ADMIS = (
    'const uint64 Melange = 0x9E3779B97F4A7C15ull;',
    '// commentaire : 1.5 mm par iteration, sqrt, float',
    '/* double, FMath::Sqrt(2.0) */ const int32 Deux = 2;',
    'Erreur = FString::Printf(TEXT("vitesse 1.5 : double attendu a l\'iteration %d"), Iteration);',
    'Escouade.Position.X += PasX * 3 / 2;',
    'const int32 Valeur = Tableau[1]; const TCHAR Lettre = TEXT(\'e\');',
)
# 2. Dans ses objets compiles (Mac a processeur ARM seulement) : aucune instruction de calcul, de comparaison ni de
#    conversion a virgule flottante. Seuls les transferts entre registres (fmov sans constante) sont admis.
INSTRUCTION_FLOTTANTE = re.compile(r'^(?:f(?!mov$)[a-z0-9]+|[su]cvtf)$')
# 3. Dans ces memes objets : rien d'appele hors de cette liste. Memoire, chaines, assertions, outillage du C++, et le
#    noyau lui-meme. Un symbole nouveau est a relire a la main avant d'allonger la liste.
SYMBOLES_ADMIS = re.compile(r'''^(?:
      _mem(?:cpy|move|set|cmp) | _bzero
    | ___cxa_\w+ | ___gxx_personality_v0 | __Unwind_Resume | ___stack_chk_(?:fail|guard) | ___dso_handle
    | std::terminate\(\) | operator\ (?:new|delete)(?:\[\])?\(.*\)
    | FMemory::\w+\(.*\) | TSizedHeapAllocator<.* | UE::Core::Private::OnInvalidArrayNum\(.*\)
    | FDebug::\w+\(.*\) | UE::Assert::Private::\w+\(.*\)
    | FString::.* | FModuleInitializerEntry::.*
    | Pdr::.*
)$''', re.X)
SYMBOLE_A_VIRGULE = re.compile(r'\b(?:float|double)\b')
TEMOIN_OBJET_REFUSE = '''#include <cmath>
#include <ctime>
int AvecVirgule(int Base) { return Base * 1.5; }
long AvecRacine(long Valeur) { return static_cast<long>(std::sqrt(static_cast<double>(Valeur))); }
long AvecHorloge() { return static_cast<long>(time(nullptr)); }
'''
TEMOIN_OBJET_ADMIS = '''#include <cstring>
int EntiersSeuls(int A, int B) { return A * 3 / 2 + B; }
void Copie(char* Vers, const char* De, unsigned long Taille) { memmove(Vers, De, Taille); }
'''

# Options du moteur pour une execution sans affichage ni question, et sans ecoute sur le reseau.
# -notraceserver : sans elle, chaque demarrage du moteur lance un serveur de traces (UnrealTraceServer) qui ecoute
#                  sur les ports 1981 et 1989 de toutes les interfaces tant que le moteur existe, et quelques secondes apres.
# -notracethreading : sans elle, le moteur ouvre lui-meme le port 1985 (commande des traces) sur toutes les interfaces.
#                  Avec elle, il ne l'ouvre qu'a la premiere fin d'image : un commandlet n'en joue aucune.
# Le serveur de stockage (zenserver, port 8558) est limite a cette machine par Config/DefaultEngine.ini.
OPTIONS_MOTEUR = ['-nullrhi', '-unattended', '-nosplash', '-nopause', '-stdout', '-notraceserver', '-notracethreading']
# Ce que le moteur ou son serveur de traces ecrivent en ouvrant ces ports : cherche dans la sortie de chaque lancement.
MARQUE_D_ECOUTE = re.compile(r'Control listening on port|Recorder port|Store port|Starting the store')

# Durees maximales, en secondes. Au-dela, la commande et les processus qu'elle a lances sont arretes : c'est un echec.
DELAI_COMPILATION = 3600
DELAI_EXECUTION = 1800

# Processus dont les ecoutes reseau sont relevees pendant la verification : ceux d'Unreal, et dotnet quand il
# fait tourner l'outil de compilation (les autres travaux .NET de la machine ne sont pas concernes).
PROCESSUS_SURVEILLES = re.compile(r'unreal|zenserver|uba|dotnet|shadercompile|crashreportclient', re.I)


def moteur():
    return pathlib.Path(os.environ.get('PDR_UNREAL', '/Users/Shared/Epic Games/UE_5.8'))


# ---------------------------------------------------------------------------------------------------------------------
# Sources

COMMENTAIRE_OU_CHAINE = re.compile(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\\n])*"|(?<![0-9A-Za-z_])\'(?:\\.|[^\'\\\n])+\'', re.S)


def code_seul(texte):
    """Le texte prive de ses commentaires, et dont chaque chaine ou caractere entre apostrophes est vide."""
    return COMMENTAIRE_OU_CHAINE.sub(lambda trouve: ' ' if trouve.group(0)[0] == '/' else '""', texte)


def ecarts_du_noyau(texte):
    """Ce qu'un texte du noyau contient d'interdit : mots et litteraux a virgule, sans doublon, dans l'ordre du texte."""
    code = code_seul(texte)
    trouves = [trouve.group(0) for trouve in MOT_INTERDIT.finditer(code)]
    trouves += ['litteral %s' % trouve.group(0) for trouve in LITTERAL_A_VIRGULE.finditer(code)]
    return list(dict.fromkeys(trouves))


def controler_sources():
    """Rend la liste des ecarts : caracteres hors ASCII dans les sources, mots et litteraux interdits dans le noyau."""
    ecarts = []
    for temoin in TEMOINS_REFUSES:
        if not ecarts_du_noyau(temoin):
            ecarts.append('le controle du noyau ne voit plus la ligne temoin : %s' % temoin)
    for temoin in TEMOINS_ADMIS:
        if ecarts_du_noyau(temoin):
            ecarts.append('le controle du noyau refuse a tort la ligne temoin : %s' % temoin)
    for fichier in sorted((PROJET / 'Source').rglob('*')):
        if fichier.suffix not in ('.h', '.hpp', '.inl', '.cpp', '.cs'):
            continue
        # Un octet illisible devient un caractere de remplacement, hors ASCII lui aussi : il est signale avec sa ligne.
        texte = fichier.read_text(encoding='utf-8', errors='replace')
        relatif = fichier.relative_to(PROJET)
        for numero, ligne in enumerate(texte.split('\n'), 1):
            if any(ord(c) > 127 for c in ligne):
                ecarts.append('%s:%d : caractere hors ASCII' % (relatif, numero))
        if 'PdrSim' in fichier.parts and fichier.suffix != '.cs':
            for interdit in ecarts_du_noyau(texte):
                ecarts.append('%s : interdit dans le noyau : %s' % (relatif, interdit))
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


# ---------------------------------------------------------------------------------------------------------------------
# Binaires

def fichiers_de_dependances():
    return sorted((PROJET / 'Intermediate' / 'Build').glob('*/*/UnrealEditor/Development/*/*.d'))


def lire_dependances(fichier, reels):
    """Chemins reels qu'enumere un fichier de dependances au format de make (cible exclue, blancs proteges rendus).

    Les memes en-tetes du moteur reviennent dans chaque fichier : reels garde chaque chemin deja resolu.
    """
    texte = fichier.read_text(encoding='utf-8', errors='replace').replace('\\\n', ' ')
    chemins = []
    for mot in re.findall(r'(?:\\ |\S)+', texte):
        if mot.endswith(':'):
            continue
        if mot not in reels:
            reels[mot] = os.path.realpath(mot.replace('\\ ', ' '))
        chemins.append(reels[mot])
    return chemins


def etat_des_binaires():
    """Compare les sources du projet aux objets compiles. Rend (objets examines, sources en avance, sources jamais compiles).

    L'outil de compilation d'Unreal ne recompile pas un fichier retouche moins d'une seconde apres la production
    de son objet (tolerance d'Epic pour les copies reseau, Actions/ActionGraph.cs) : une retouche faite juste apres
    une compilation passerait inapercue, et les tests porteraient sur l'ancien code.
    """
    racine = os.path.realpath(PROJET / 'Source') + os.sep
    reels = {}
    examines, en_avance, compiles = 0, set(), set()
    for fichier in fichiers_de_dependances():
        objet = str(fichier)[:-2] + '.o'
        chemins = lire_dependances(fichier, reels)
        nom = os.path.basename(objet)[:-2]
        # Un objet survit a la suppression de son source : il ne compte plus.
        if not os.path.isfile(objet) or not any(os.path.basename(chemin) == nom and os.path.isfile(chemin) for chemin in chemins):
            continue
        examines += 1
        date = os.stat(objet).st_mtime_ns
        for chemin in chemins:
            if not chemin.startswith(racine) or not os.path.isfile(chemin):
                continue
            # Compile seul, ou au sein d'un regroupement de sources du module : dans les deux cas, un objet en depend.
            if chemin.endswith('.cpp'):
                compiles.add(chemin)
            if os.stat(chemin).st_mtime_ns > date:
                en_avance.add(chemin)
    jamais = {str(source) for source in (PROJET / 'Source').rglob('*.cpp') if os.path.realpath(source) not in compiles}
    return examines, en_avance, jamais


def bibliotheques_en_retard():
    """Bibliotheques du projet plus anciennes que l'un de leurs objets, ou introuvables.

    Apres une compilation dont l'edition de liens a echoue, les objets sont neufs mais la bibliotheque est l'ancienne :
    le moteur chargerait l'ancien code, alors que chaque objet est plus recent que ses sources. La liste des modules et
    de leurs bibliotheques est celle que lit le moteur au demarrage (UnrealEditor.modules).
    Rend (bibliotheques examinees, ecarts).
    """
    dossier = PROJET / 'Binaries' / {'darwin': 'Mac', 'win32': 'Win64'}.get(sys.platform, 'Linux')
    manifeste = dossier / 'UnrealEditor.modules'
    if not manifeste.is_file():
        return 0, ['%s introuvable' % manifeste.relative_to(PROJET)]
    try:
        modules = json.loads(manifeste.read_text(encoding='utf-8'))['Modules']
    except (ValueError, KeyError, TypeError):
        return 0, ['%s illisible' % manifeste.relative_to(PROJET)]
    examinees, ecarts = 0, []
    for module, nom in sorted(modules.items()):
        bibliotheque = dossier / nom
        if not bibliotheque.is_file():
            ecarts.append('%s introuvable' % nom)
            continue
        examinees += 1
        date = bibliotheque.stat().st_mtime_ns
        objets = [objet for motif in ('*.o', '*.obj')
                  for objet in (PROJET / 'Intermediate' / 'Build').glob('*/*/UnrealEditor/Development/%s/%s' % (module, motif))]
        recents = sorted(objet.name for objet in objets if objet.stat().st_mtime_ns > date)
        if recents:
            ecarts.append('%s plus ancienne que %s' % (nom, ', '.join(recents)))
    return examinees, ecarts


def regles_retouchees():
    """Fichiers de regles de compilation plus recents que le dernier passage de l'outil de compilation."""
    plans = sorted((PROJET / 'Intermediate' / 'Build').glob('*/*/PointDeRuptureEditor/Development/Makefile.bin'))
    if not plans:
        return []
    date = max(plan.stat().st_mtime_ns for plan in plans)
    regles = [FICHIER_PROJET] + sorted((PROJET / 'Source').rglob('*.Build.cs')) + sorted((PROJET / 'Source').glob('*.Target.cs'))
    return [str(regle.relative_to(PROJET)) for regle in regles if regle.stat().st_mtime_ns > date]


def objets_du_noyau():
    """Objets compiles a partir d'un source de Source/PdrSim, seul ou regroupe avec d'autres sources du module."""
    racine = os.path.realpath(PROJET / 'Source' / 'PdrSim') + os.sep
    reels = {}
    objets = []
    for fichier in fichiers_de_dependances():
        objet = str(fichier)[:-2] + '.o'
        if os.path.isfile(objet) and any(chemin.startswith(racine) and chemin.endswith('.cpp') and os.path.isfile(chemin)
                                         for chemin in lire_dependances(fichier, reels)):
            objets.append(objet)
    return objets


def ecarts_d_un_objet(objet):
    """Instructions a virgule flottante et symboles externes non admis d'un objet compile pour un processeur ARM."""
    ecarts = []
    texte = subprocess.run(['otool', '-tv', objet], capture_output=True, text=True, timeout=300)
    bruts = subprocess.run(['nm', '-u', objet], capture_output=True, text=True, timeout=300)
    symboles = subprocess.run(['c++filt'], input=bruts.stdout, capture_output=True, text=True, timeout=300)
    if texte.returncode != 0 or bruts.returncode != 0 or symboles.returncode != 0 or '(__TEXT,__text) section' not in texte.stdout:
        return ['%s : desassemblage impossible' % os.path.basename(objet)]
    instructions = {}
    for ligne in texte.stdout.split('\n'):
        champs = ligne.split(None, 2)
        if len(champs) < 2 or not re.fullmatch(r'[0-9a-f]{16}', champs[0]):
            continue
        operandes = champs[2] if len(champs) > 2 else ''
        if INSTRUCTION_FLOTTANTE.match(champs[1]) or (champs[1] == 'fmov' and '#' in operandes):
            instructions[champs[1]] = instructions.get(champs[1], 0) + 1
    if instructions:
        ecarts.append('%s : instructions a virgule flottante : %s' % (
            os.path.basename(objet), ', '.join('%s (%d)' % paire for paire in sorted(instructions.items()))))
    for ligne in symboles.stdout.split('\n'):
        symbole = re.sub(r'^\s*U\s+', '', ligne).strip()
        if symbole and (not SYMBOLES_ADMIS.match(symbole) or SYMBOLE_A_VIRGULE.search(symbole)):
            ecarts.append('%s : symbole externe non admis : %s' % (os.path.basename(objet), symbole))
    return ecarts


def controler_objets_du_noyau():
    """Rend (nombre d'objets controles, ecarts), ou (None, raison) quand le controle ne peut pas se faire ici."""
    if sys.platform != 'darwin' or platform.machine() != 'arm64':
        return None, 'controle ecrit pour un Mac a processeur ARM seulement'
    if not all(shutil.which(outil) for outil in ('otool', 'nm', 'c++filt', 'xcrun')):
        return None, 'otool, nm, c++filt ou xcrun introuvable'
    ecarts = []
    # Les temoins d'abord : le controle doit refuser un objet qui calcule a virgule ou lit l'horloge, et admettre l'autre.
    with tempfile.TemporaryDirectory(prefix='pdr-temoins-') as dossier:
        for nom, source, refuse in (('refuse', TEMOIN_OBJET_REFUSE, True), ('admis', TEMOIN_OBJET_ADMIS, False)):
            fichier = os.path.join(dossier, nom + '.cpp')
            objet = os.path.join(dossier, nom + '.o')
            pathlib.Path(fichier).write_text(source, encoding='utf-8')
            compile_ = subprocess.run(['xcrun', 'clang++', '-std=c++20', '-O2', '-c', fichier, '-o', objet], capture_output=True, text=True, timeout=300)
            if compile_.returncode != 0:
                return None, 'compilation des temoins impossible'
            trouves = ecarts_d_un_objet(objet)
            vus = ' '.join(trouves)
            if refuse and not ('instructions a virgule flottante' in vus and '_time' in vus):
                ecarts.append('le controle des objets ne voit plus le temoin : %s' % (vus or 'rien'))
            if not refuse and trouves:
                ecarts.append('le controle des objets refuse a tort le temoin : %s' % vus)
    objets = objets_du_noyau()
    for objet in objets:
        ecarts += ecarts_d_un_objet(objet)
    return len(objets), ecarts


# ---------------------------------------------------------------------------------------------------------------------
# Ecoutes reseau

def chemin_de_lsof():
    for candidat in ('/usr/sbin/lsof', '/usr/bin/lsof'):
        if os.path.exists(candidat):
            return candidat
    return shutil.which('lsof')


def ecoutes_reseau():
    """Prises reseau des processus d'Unreal : ports TCP en ecoute et prises UDP liees.

    Rend deux ensembles de textes 'processus protocole adresse' : celles qui sont ouvertes ailleurs que sur la boucle
    locale, puis toutes. Rend None si le releve n'a pas pu se faire (Windows, lsof absent ou en erreur).
    """
    lsof = None if sys.platform.startswith('win') else chemin_de_lsof()
    if lsof is None:
        return None
    try:
        resultat = subprocess.run([lsof, '+c', '0', '-nP', '-iTCP', '-sTCP:LISTEN', '-iUDP', '-FpcPn'], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    # lsof rend 1 quand il n'a rien a lister, mais aussi pour une option refusee : sa sortie est alors vide et il s'explique.
    if resultat.returncode not in (0, 1) or (resultat.returncode == 1 and not resultat.stdout.strip() and resultat.stderr.strip()):
        return None
    hors_boucle, toutes = set(), set()
    numero = processus = protocole = ''
    surveille = False
    for ligne in resultat.stdout.split('\n'):
        if ligne.startswith('p'):
            numero = ligne[1:]
        elif ligne.startswith('c'):
            processus = ligne[1:]
            surveille = PROCESSUS_SURVEILLES.search(processus) is not None
            if surveille and processus.lower() == 'dotnet':
                surveille = 'UnrealBuildTool' in subprocess.run(['ps', '-o', 'command=', '-p', numero], capture_output=True, text=True).stdout
        elif ligne.startswith('P'):
            protocole = ligne[1:]
        elif ligne.startswith('n') and surveille:
            adresse = ligne[1:]
            # Une prise UDP connectee ('ici->la-bas') n'ecoute pas ; '*:*' n'est liee a rien.
            if adresse == '*:*' or '->' in adresse:
                continue
            prise = '%s %s %s' % (processus, protocole, adresse)
            toutes.add(prise)
            hote = adresse.rsplit(':', 1)[0]
            if not (hote.startswith('127.') or hote in ('[::1]', 'localhost')):
                hors_boucle.add(prise)
    return hors_boucle, toutes


class Releve:
    """Releves des ecoutes reseau faits pendant les commandes, une fois par seconde."""

    def __init__(self):
        self.hors_boucle = set()
        self.toutes = set()
        self.faits = 0
        self.manques = 0

    def relever(self):
        resultat = ecoutes_reseau()
        if resultat is None:
            self.manques += 1
        else:
            self.faits += 1
            self.hors_boucle |= resultat[0]
            self.toutes |= resultat[1]


# ---------------------------------------------------------------------------------------------------------------------
# Commandes

def arreter(processus):
    """Arrete une commande et tout ce qu'elle a lance : le script d'enveloppe de la compilation ne suffit pas."""
    try:
        if os.name == 'posix':
            os.killpg(processus.pid, signal.SIGKILL)
        else:
            subprocess.run(['taskkill', '/T', '/F', '/PID', str(processus.pid)], capture_output=True)
    except (OSError, ProcessLookupError):
        pass
    processus.wait()


def lancer(commande, delai, releve=None):
    """Lance une commande. Rend (code de sortie, sortie, duree) ; le code vaut None si le delai est depasse.

    La sortie passe par un fichier et non par un tube : un processus de fond lance par la commande herite de sa
    sortie, et garderait le tube ouvert apres elle. La lecture attendrait alors sa fin, sans limite.
    La commande a son propre groupe de processus, pour pouvoir l'arreter en entier au delai ou a l'interruption.
    Si un releve est donne, les ecoutes reseau des processus d'Unreal y sont ajoutees chaque seconde.
    """
    with tempfile.TemporaryFile() as sortie:
        debut = time.monotonic()
        processus = subprocess.Popen(commande, stdin=subprocess.DEVNULL, stdout=sortie, stderr=subprocess.STDOUT,
                                     start_new_session=(os.name == 'posix'))
        code = None
        try:
            while True:
                try:
                    code = processus.wait(timeout=1.0)
                    break
                except subprocess.TimeoutExpired:
                    if time.monotonic() - debut > delai:
                        arreter(processus)
                        break
                    if releve is not None:
                        releve.relever()
        except BaseException:
            arreter(processus)
            raise
        duree = time.monotonic() - debut
        if releve is not None:
            releve.relever()
        sortie.seek(0)
        return code, sortie.read().decode('utf-8', errors='replace'), duree


def avertissements_de_l_outil(sortie):
    """Messages de niveau avertissement ou erreur du journal structure de l'outil de compilation.

    Ses propres avertissements arrivent sur la console sans le mot 'warning' : seul ce journal donne leur niveau.
    """
    annonce = re.search(r'^Log file: (.+)$', sortie, re.M)
    if not annonce:
        return ['journal de l\'outil de compilation non annonce : ses avertissements ne sont pas controles']
    journal = pathlib.Path(annonce.group(1).strip()).with_suffix('.json')
    if not journal.is_file():
        return ['journal structure de l\'outil de compilation introuvable : %s' % journal]
    messages = []
    for ligne in journal.read_text(encoding='utf-8', errors='replace').split('\n'):
        try:
            entree = json.loads(ligne)
        except ValueError:
            continue
        if isinstance(entree, dict) and entree.get('level') in ('Warning', 'Error', 'Critical'):
            messages.append('%s : %s' % (entree.get('level'), entree.get('message')))
    return messages


def compiler(releve=None):
    if sys.platform == 'darwin':
        commande = [str(moteur() / 'Engine/Build/BatchFiles/Mac/Build.sh'), 'PointDeRuptureEditor', 'Mac']
    elif sys.platform.startswith('win'):
        commande = [str(moteur() / 'Engine/Build/BatchFiles/Build.bat'), 'PointDeRuptureEditor', 'Win64']
    else:
        commande = [str(moteur() / 'Engine/Build/BatchFiles/Linux/Build.sh'), 'PointDeRuptureEditor', 'Linux']
    # -UBADisableRemote : aucune ecoute reseau pendant cette compilation, meme si le reglage du projet a disparu.
    commande += ['Development', '-project=%s' % FICHIER_PROJET, '-waitmutex', '-UBADisableRemote']
    code, sortie, duree = lancer(commande, DELAI_COMPILATION, releve)
    remarques = [l for l in sortie.split('\n') if re.search(r'\b(warning|error)\b', l, re.I)]
    remarques += [l for l in sortie.split('\n') if 'Listening on' in l]
    if code is None:
        remarques.append('compilation arretee apres %d s' % DELAI_COMPILATION)
    else:
        remarques += [message for message in avertissements_de_l_outil(sortie) if message not in remarques]
    return code == 0 and not remarques, duree, remarques


def executer(arguments, releve=None):
    """Lance l'executeur sans affichage. Rend (code de sortie, lignes PDR_ en dictionnaires, echecs, duree de la commande)."""
    if sys.platform == 'darwin':
        binaire = moteur() / 'Engine/Binaries/Mac/UnrealEditor-Cmd'
    elif sys.platform.startswith('win'):
        binaire = moteur() / 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
    else:
        binaire = moteur() / 'Engine/Binaries/Linux/UnrealEditor-Cmd'
    commande = [str(binaire), str(FICHIER_PROJET), '-run=PdrSim'] + arguments + OPTIONS_MOTEUR
    code, sortie, duree = lancer(commande, DELAI_EXECUTION, releve)
    lignes = {}
    echecs = []
    if code is None:
        code = -1
        echecs.append('execution arretee apres %d s' % DELAI_EXECUTION)
    # Ces lignes ne dependent ni de lsof ni du rythme des releves : elles couvrent aussi les lancements de mesure.
    marques = sorted({ligne.strip()[-120:] for ligne in sortie.split('\n') if MARQUE_D_ECOUTE.search(ligne)})
    if marques:
        code = code or -2
        echecs.append('le moteur a ouvert une ecoute reseau : %s' % ' | '.join(marques[:3]))
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


def nombre(texte, defaut):
    try:
        return float(texte)
    except (TypeError, ValueError):
        return defaut


def principal():
    lecteur = argparse.ArgumentParser(description='Verification de l\'etape A1.')
    lecteur.add_argument('--sans-compiler', action='store_true')
    lecteur.add_argument('--modele', action='store_true')
    lecteur.add_argument('--mesures', type=int, default=0)
    lecteur.add_argument('--sans-ecoutes', action='store_true')
    options = lecteur.parse_args()
    bon = True

    ecarts = controler_sources()
    print('SOURCES   %s' % ('conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule' if not ecarts else 'ECARTS'))
    for ecart in ecarts:
        print('          %s' % ecart)
    bon = bon and not ecarts

    coupee = ecoute_coupee()
    print('RESEAU    %s' % ('ecoute de l\'outil de compilation coupee pour ce projet' if coupee
                            else 'ECART : Saved/UnrealBuildTool/BuildConfiguration.xml ne coupe plus l\'ecoute du port 1345 (bDisableRemote)'))
    bon = bon and coupee

    # Ecoutes reseau : celles qui existaient avant ne viennent pas de cette verification, les autres sont des ecarts.
    releve = None
    avant = (set(), set())
    if not options.sans_ecoutes:
        avant = ecoutes_reseau()
        if avant is None:
            print('RESEAU    ECART : releve des ecoutes impossible (lsof absent ou en erreur) ; --sans-ecoutes pour s\'en passer')
            bon = False
            avant = (set(), set())
        else:
            releve = Releve()
            if avant[0]:
                print('          note : ecoutes d\'Unreal deja ouvertes avant la verification : %s' % ', '.join(sorted(avant[0])))

    if not options.sans_compiler:
        reussie, duree, remarques = compiler(releve)
        print('COMPILER  %s en %.1f s' % ('reussie, sans avertissement ni ecoute reseau' if reussie else 'ECHEC', duree))
        for remarque in remarques[:20]:
            print('          %s' % remarque.strip())
        bon = bon and reussie
        if not reussie:
            return 1

    # Les binaires doivent venir des sources presentes : voir etat_des_binaires.
    examines, en_avance, jamais = etat_des_binaires()
    if en_avance and not options.sans_compiler:
        for source in en_avance:
            os.utime(source)
        reussie, duree, remarques = compiler(releve)
        print('COMPILER  %d fichier(s) retouche(s) trop tot apres la compilation precedente, dates rafraichies : recompilation %s en %.1f s'
              % (len(en_avance), 'reussie' if reussie else 'en ECHEC', duree))
        for remarque in remarques[:20]:
            print('          %s' % remarque.strip())
        bon = bon and reussie
        if not reussie:
            return 1
        examines, en_avance, jamais = etat_des_binaires()
    retouchees = regles_retouchees()
    liees, en_retard = bibliotheques_en_retard()
    relatif = lambda chemins: ', '.join(sorted(os.path.relpath(chemin, PROJET) for chemin in chemins))
    if en_avance or jamais or retouchees or en_retard:
        if en_avance:
            print('BINAIRES  ECART : sources plus recents que leur objet, les tests porteraient sur l\'ancien code : %s' % relatif(en_avance))
        if jamais:
            print('BINAIRES  ECART : sources jamais compiles : %s' % relatif(jamais))
        if retouchees:
            print('BINAIRES  ECART : regles de compilation retouchees depuis la derniere compilation : %s' % ', '.join(retouchees))
        if en_retard:
            print('BINAIRES  ECART : bibliotheques que le moteur chargerait sans les derniers objets (edition de liens manquee) : %s' % '; '.join(en_retard))
        bon = False
    elif examines:
        print('BINAIRES  a jour : %d objets, aucun plus ancien que ses sources ; %d bibliotheques, aucune plus ancienne que ses objets%s' % (
            examines, liees, ' (un source supprime depuis la derniere compilation ne se voit pas sans compiler)' if options.sans_compiler else ''))
    else:
        print('BINAIRES  fraicheur non controlee : aucun fichier de dependances sous Intermediate/Build')

    controles, ecarts_objets = controler_objets_du_noyau()
    if controles is None:
        print('NOYAU     objets compiles non controles : %s' % ecarts_objets)
    elif ecarts_objets or controles == 0:
        print('NOYAU     ECART : %d objets compiles controles' % controles)
        for ecart in ecarts_objets:
            print('          %s' % ecart)
        bon = False
    else:
        print('NOYAU     %d objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions' % controles)

    dossier = tempfile.mkdtemp(prefix='pdr-parties-')
    try:
        # Les cent parties sont jouees et rejouees en memoire, ecrites dans un dossier, puis relues depuis ce dossier.
        arguments = ['-tests', '-boucle=24000', '-file=%d' % FILE_LONGUE, '-relectures=%d' % PARTIES, '-iterations=%d' % ITERATIONS,
                     '-attendu=%s' % CONDENSE_ATTENDU, '-dossier=%s' % dossier, '-relire=%s' % dossier]
        code, lignes, echecs, duree = executer(arguments, releve)
        tests = lignes.get('PDR_TESTS', {})
        boucle = lignes.get('PDR_BOUCLE', {})
        file_longue = lignes.get('PDR_FILE', {})
        relectures = lignes.get('PDR_RELECTURES', {})
        relire = lignes.get('PDR_RELIRE', {})
        print('TESTS     %s verifications (attendu %d), %s echecs, %s ms' % (
            tests.get('verifications', '?'), VERIFICATIONS_ATTENDUES, tests.get('echecs', '?'), tests.get('duree_ms', '?')))
        print('BOUCLE    %s iterations a vide en %s ms' % (boucle.get('iterations', '?'), boucle.get('duree_ms', '?')))
        print('FILE      %s commandes soumises d\'avance, jouees en %s ms (plafond %d ms)' % (
            file_longue.get('commandes', '?'), file_longue.get('avance_ms', '?'), AVANCE_FILE_MAX_MS))
        print('PARTIES   %s parties de %s iterations, %s conformes, %s distinctes, condense %s (attendu %s)' % (
            relectures.get('parties', '?'), relectures.get('iterations', '?'), relectures.get('conformes', '?'),
            relectures.get('distinctes', '?'), relectures.get('condense', '?'), CONDENSE_ATTENDU))
        print('RELIRE    %s fichiers relus, %s conformes, condense %s (attendu %s)' % (
            relire.get('fichiers', '?'), relire.get('conformes', '?'), relire.get('condense', '?'), CONDENSE_ATTENDU))
        print('COMMANDE  code de sortie %d, %.1f s demarrage du moteur compris' % (code, duree))
        for echec in echecs:
            print('          %s' % echec)
        # Criteres ecrits de l'etape A1 : relectures conformes et reproductibles, boucle vide sous la seconde, suite sous la minute.
        criteres = (
            code == 0 and not echecs
            and tests.get('echecs') == '0' and tests.get('verifications') == str(VERIFICATIONS_ATTENDUES)
            and relectures.get('conformes') == str(PARTIES) and relectures.get('distinctes') == str(PARTIES)
            and relectures.get('condense') == CONDENSE_ATTENDU
            and relire.get('fichiers') == str(PARTIES) and relire.get('conformes') == str(PARTIES) and relire.get('condense') == CONDENSE_ATTENDU
            and nombre(boucle.get('duree_ms'), 1e9) < 1000.0 and nombre(tests.get('duree_ms'), 1e9) < 60000.0
            and nombre(file_longue.get('avance_ms'), 1e9) < AVANCE_FILE_MAX_MS)
        bon = bon and criteres

        if options.modele:
            debut = time.monotonic()
            modele = subprocess.run([sys.executable, '-B', str(MODELE), 'comparer', dossier, str(ITERATIONS), '1', str(PARTIES)], capture_output=True, text=True)
            derniere = modele.stdout.strip().split('\n')[-1] if modele.stdout.strip() else modele.stderr.strip()
            print('MODELE    %s, en %.0f s' % (derniere, time.monotonic() - debut))
            bon = bon and modele.returncode == 0
    finally:
        shutil.rmtree(dossier, ignore_errors=True)

    if options.mesures > 0:
        releves = {}

        def noter(nom, valeur):
            releves.setdefault(nom, []).append(float(valeur))

        # Pas de releve des ecoutes pendant les mesures, pour ne pas les troubler : la sortie du moteur est fouillee a la place.
        for _ in range(options.mesures):
            code, lignes, echecs, duree = executer(['-tests', '-boucle=24000', '-charge=24000', '-file=%d' % FILE_LONGUE,
                                                    '-relectures=%d' % PARTIES, '-iterations=%d' % ITERATIONS, '-attendu=%s' % CONDENSE_ATTENDU])
            if code != 0 or echecs:
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
                if code != 0 or echecs:
                    print('MESURE    execution en echec : %s' % '; '.join(echecs))
                    bon = False
                    continue
                noter('24 000 iterations, %d escouades en marche, en ms' % effectif, lignes['PDR_BOUCLE']['duree_ms'])
        for nom, valeurs in releves.items():
            print('MESURE    %s : %s' % (nom, resume(valeurs)))

    if releve is None:
        if options.sans_ecoutes:
            print('RESEAU    ecoutes non relevees, a la demande (--sans-ecoutes)')
    else:
        releve.relever()
        apparues = sorted(releve.hors_boucle - avant[0])
        # Temoin : pendant l'execution, le serveur de stockage du moteur ecoute sur la boucle locale. Ne rien voir du tout,
        # c'est un releve aveugle, pas une machine silencieuse.
        if apparues:
            print('RESEAU    ECART : ecoutes ouvertes pendant la verification : ' + ', '.join(apparues))
            bon = False
        elif releve.manques:
            print('RESEAU    ECART : %d releve(s) des ecoutes manque(s) sur %d' % (releve.manques, releve.manques + releve.faits))
            bon = False
        elif not releve.toutes:
            print('RESEAU    ECART : releve aveugle, aucune prise des processus d\'Unreal vue en %d releves, pas meme en boucle locale' % releve.faits)
            bon = False
        else:
            print('RESEAU    aucune ecoute hors de cette machine en %d releves, pris pendant %s' % (
                releve.faits, 'l\'execution' if options.sans_compiler else 'la compilation et l\'execution'))

    print('RESULTAT  %s' % ('REUSSI' if bon else 'ECHEC'))
    return 0 if bon else 1


if __name__ == '__main__':
    sys.exit(principal())
