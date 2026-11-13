#!/usr/bin/env python3
"""Construit l'essai en une seule page HTML, sans dépendance ni fichier de décor, à la manière de FERRO (tools/build.py).

    python3 Jeu/construire.py

Écrit :
  Jeu/dist/point-de-rupture.html  la page complète, à ouvrir telle quelle dans un navigateur ; c'est elle qui est mise en
                                  ligne (Jeu/deposer.sh), sans police chargée d'ailleurs ;
  Jeu/dist/artefact.html          le même contenu sans l'enveloppe <html>, pour la publication en artefact ;
  Jeu/SIZE.json                   tailles brute et compressée, empreinte, taille de chaque source.
"""
import gzip
import hashlib
import json
import pathlib
import re

ICI = pathlib.Path(__file__).resolve().parent
SRC = ICI / 'src'
DIST = ICI / 'dist'
# Chaque script a un rôle :
#   page        exécuté dans la page ;
#   partage     exécuté dans la page et recopié dans le travailleur de simulation (data-travailleur) ;
#   simulation  recopié dans le travailleur seulement : posé en text/plain, donc inerte dans la page, sauf si le
#               navigateur refuse le travailleur et que hote.js fait tourner la simulation sur le fil principal.
# Le travailleur reçoit les scripts « partage » et « simulation » dans l'ordre de cette liste.
MODULES = [
    ('moteur/renderer.js', 'page'),
    ('sim/regles.js', 'partage'),
    ('sim/protocole.js', 'partage'),
    ('ville.js', 'partage'),
    ('villes/marseille.js', 'partage'),
    ('ville-reelle.js', 'partage'),
    ('sim/nav.js', 'simulation'),
    ('sim/immeubles.js', 'simulation'),
    ('sim/monde.js', 'simulation'),
    ('sim/ia.js', 'simulation'),
    ('sim/travailleur.js', 'simulation'),
    ('foule.js', 'page'),
    ('decor.js', 'page'),
    ('camera.js', 'page'),
    ('moteur/audio.js', 'page'),
    ('moteur/musique.js', 'page'),
    ('son.js', 'page'),
    ('interface/reglages.js', 'page'),
    ('interface/titre.js', 'page'),
    ('interface/hud.js', 'page'),
    ('interface/minicarte.js', 'page'),
    ('interface/commandes.js', 'page'),
    ('hote.js', 'page'),
    ('jeu.js', 'page'),
]
OUVERTURE = {
    'page': '<script>',
    'partage': '<script data-travailleur>',
    'simulation': '<script type="text/plain" data-travailleur>',
}
VERSION = 'essai-0.3e'        # chaque page mise en ligne a la sienne ; l'écran titre l'affiche (« V0.3e »)
EDITION = '03 / MARSEILLE'    # le nom de l'étape, à gauche de la version sur l'écran titre
BUDGET = 3_000_000     # octets : la page reste bien sous la limite des artefacts (16 Mo)
# La page servie en ligne ne charge rien d'ailleurs : sans les polices de Google, le style se rabat sur celles du système.
POLICES = re.compile(r'^<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">\n', re.M)
ICONE = ('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E'
         '%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230b0e12\'/%3E%3Ccircle cx=\'9.5\' cy=\'20\' r=\'4.5\' fill=\'%23e6452f\'/%3E'
         '%3Ccircle cx=\'16\' cy=\'10.5\' r=\'4.5\' fill=\'%23eda326\'/%3E%3Ccircle cx=\'22.5\' cy=\'20\' r=\'4.5\' fill=\'%234d86f0\'/%3E%3C/svg%3E">\n')


def main():
    gabarit = (SRC / 'index.html').read_text(encoding='utf-8')
    style = (SRC / 'style.css').read_text(encoding='utf-8')
    sources = {nom: (SRC / nom).read_text(encoding='utf-8') for nom, _ in MODULES}
    for nom, code in sources.items():
        if '</script' in code.lower():
            raise SystemExit(f'{nom} contient « </script » : la page serait coupée')
    if gabarit.count('/*STYLE*/') != 1 or gabarit.count('<!--MODULES-->') != 1:
        raise SystemExit('index.html doit contenir une fois /*STYLE*/ et une fois <!--MODULES-->')
    # La version et l'édition s'écrivent ici, comme dans METAL : l'écran titre ne peut plus en afficher une ancienne.
    if '__VERSION_JEU__' not in gabarit or gabarit.count('__EDITION_JEU__') != 1:
        raise SystemExit('index.html doit contenir __VERSION_JEU__ et, une fois, __EDITION_JEU__')
    gabarit = gabarit.replace('__VERSION_JEU__', VERSION.removeprefix('essai-')).replace('__EDITION_JEU__', EDITION)

    scripts = '\n'.join(f'{OUVERTURE[role]}\n// ---- {nom} ----\n{sources[nom]}</script>' for nom, role in MODULES)
    fragment = gabarit.replace('/*STYLE*/', style.rstrip('\n')).replace('<!--MODULES-->', scripts)
    autonome, remplacements = POLICES.subn('', fragment)
    if remplacements != 1:
        raise SystemExit('index.html doit charger ses polices par une seule ligne <link> vers fonts.googleapis.com')
    page = ('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="robots" content="noindex">\n' + ICONE +
            '</head>\n<body>\n' + autonome + '</body>\n</html>\n')

    octets = page.encode('utf-8')
    if len(octets) > BUDGET:
        raise SystemExit(f'page de {len(octets)} octets, au-delà du budget de {BUDGET}')
    DIST.mkdir(exist_ok=True)
    (DIST / 'point-de-rupture.html').write_bytes(octets)
    (DIST / 'artefact.html').write_text(fragment, encoding='utf-8')

    taille = {
        'version': VERSION,
        'raw': len(octets),
        'gzip': len(gzip.compress(octets, 9, mtime=0)),
        'sha256': hashlib.sha256(octets).hexdigest(),
        'sources': {nom: len(code.encode('utf-8')) for nom, code in {**sources, 'index.html': gabarit, 'style.css': style}.items()},
    }
    (ICI / 'SIZE.json').write_text(json.dumps(taille, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"CONSTRUIT  {DIST / 'point-de-rupture.html'}  {taille['raw']} octets, {taille['gzip']} compressés, sha256 {taille['sha256'][:16]}")


if __name__ == '__main__':
    main()
