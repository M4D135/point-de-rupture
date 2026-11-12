#!/usr/bin/env python3
"""Vues du décor d'une ville dans Chrome sans écran, piloté par tube (ni port ni réseau) : la page assemblée, l'écran
de préparation (la ville d'accueil reste derrière, sans démo ni partie), interface cachée, caméra posée à la main.
    python3 Jeu/outils/plans/vues.py Jeu/dist/point-de-rupture.html SORTIE_DIR EFFECTIFS Jeu/outils/plans/vues.json
VUES.json : [[nom, x, z, D, lacet], …] ; lacet en radians (0 regarde le nord, π/2 l'est). Les neuf premières vues de
vues.json sont celles de la comparaison avant / après du lot L2 (0.3).
Env : LARGEUR, HAUTEUR, MOBILE=1 ; LIBRE=1 retire la limite d'images (mesure du débit réel du GPU) ; PARTIE=1 lance
une partie (ses EFFECTIFS unités, IA contre IA) avant les vues : la ville d'accueil n'a que le décor fixe, les
cassables, la foule et les effets ne se dessinent que dans une partie. Chaque vue rend ses images/s sur 3 s."""
import base64
import fcntl
import json
import os
import pathlib
import subprocess
import sys
import time

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
page, sortie = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2])
EFFECTIFS = int(sys.argv[3]) if len(sys.argv) > 3 else 100000
VUES = json.loads(pathlib.Path(sys.argv[4]).read_text()) if len(sys.argv) > 4 else []
LIBRE = os.environ.get('LIBRE') == '1'
sortie.mkdir(parents=True, exist_ok=True)
profil = sortie / 'profil'

r_cmd, w_cmd = os.pipe()
r_res, w_res = os.pipe()
haut_cmd, haut_res = fcntl.fcntl(r_cmd, fcntl.F_DUPFD, 20), fcntl.fcntl(w_res, fcntl.F_DUPFD, 21)


def relier():
    os.dup2(haut_cmd, 3, inheritable=True)
    os.dup2(haut_res, 4, inheritable=True)


options = [CHROME, '--headless=new', '--remote-debugging-pipe', f'--user-data-dir={profil}', '--no-first-run',
           '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--hide-scrollbars',
           '--use-angle=metal', '--autoplay-policy=no-user-gesture-required']
if LIBRE:
    options += ['--disable-gpu-vsync', '--disable-frame-rate-limit']
chrome = subprocess.Popen(options + ['about:blank'], preexec_fn=relier, close_fds=False,
                          stdout=open(sortie / 'chrome.log', 'wb'), stderr=subprocess.STDOUT)
for fd in (r_cmd, w_res, haut_cmd, haut_res):
    os.close(fd)
tampon = b''
numero = 0
journal = []


def lire_evenement(reponse):
    m = reponse.get('method')
    p = reponse.get('params', {})
    if m == 'Runtime.consoleAPICalled':
        texte = ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))
        journal.append((p.get('type'), texte[:800]))
    elif m == 'Runtime.exceptionThrown':
        d = p.get('exceptionDetails', {})
        journal.append(('exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:1200]))
    elif m == 'Log.entryAdded':
        e = p.get('entry', {})
        if e.get('level') in ('error', 'warning'):
            journal.append(('log-' + e.get('level'), (e.get('text', '') + ' ' + e.get('url', ''))[:400]))


def envoyer(methode, params=None, session=None, delai=60):
    global numero, tampon
    numero += 1
    message = {'id': numero, 'method': methode, 'params': params or {}}
    if session:
        message['sessionId'] = session
    os.write(w_cmd, json.dumps(message).encode() + b'\0')
    fin = time.time() + delai
    while time.time() < fin:
        while b'\0' in tampon:
            brut, tampon = tampon.split(b'\0', 1)
            reponse = json.loads(brut)
            if reponse.get('id') == numero:
                if 'error' in reponse:
                    raise RuntimeError(f'{methode}: {reponse["error"]}')
                return reponse.get('result', {})
            lire_evenement(reponse)
        tampon += os.read(r_res, 1 << 20)
    raise TimeoutError(methode)


def evaluer(expression, delai=60):
    r = envoyer('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True}, session, delai)
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:800])
    return r['result'].get('value')


def attendre(condition, delai, pas=0.25):
    fin = time.time() + delai
    while time.time() < fin:
        try:
            if evaluer(condition):
                return True
        except RuntimeError:
            pass
        time.sleep(pas)
    return False


def capture(nom):
    data = envoyer('Page.captureScreenshot', {'format': 'png'}, session)['data']
    (sortie / nom).write_bytes(base64.b64decode(data))


MESURE = '''new Promise(ok => { let n = 0, t0 = performance.now(), lent = 0, prec = t0, pire = 0;
  const f = t => { n++; const d = t - prec; if (d > 25) lent++; if (d > pire) pire = d; prec = t;
    if (t - t0 < 3000) requestAnimationFrame(f);
    else { const s = PDR.page.renderer.stats;
      ok({ ips: +(n * 1000 / (t - t0)).toFixed(1), lentes: lent, pireMs: +pire.toFixed(1), appels: s.drawCalls, triangles: s.triangles }); } };
  requestAnimationFrame(f); })'''

resultats = {'effectifs': EFFECTIFS, 'libre': LIBRE, 'vues': {}}
try:
    cibles = envoyer('Target.getTargets')['targetInfos']
    onglet = next(t for t in cibles if t['type'] == 'page')
    session = envoyer('Target.attachToTarget', {'targetId': onglet['targetId'], 'flatten': True})['sessionId']
    for m in ('Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'):
        envoyer(m, session=session)
    envoyer('Network.setBlockedURLs', {'urls': ['*fonts.googleapis.com*', '*fonts.gstatic.com*', 'http*://*']}, session)
    L, H, MOB = int(os.environ.get('LARGEUR', 1440)), int(os.environ.get('HAUTEUR', 900)), os.environ.get('MOBILE') == '1'
    envoyer('Emulation.setDeviceMetricsOverride', {'width': L, 'height': H, 'deviceScaleFactor': 3 if MOB else 1, 'mobile': MOB}, session)
    reglages = {'partie': {'effectifs': EFFECTIFS, 'ville': 'marseille'}}
    envoyer('Page.addScriptToEvaluateOnNewDocument', {'source': f"try {{ localStorage.setItem('pdr.reglages', JSON.stringify({json.dumps(reglages)})); }} catch (e) {{}}"}, session)
    t0 = time.time()
    envoyer('Page.navigate', {'url': page.as_uri()}, session)
    ok = attendre("PDR.page && PDR.page.ui.ecran === 'titre'", 120)
    resultats['titre_s'] = round(time.time() - t0, 2) if ok else None
    evaluer("document.getElementById('titre-jouer').click(), true")
    attendre("PDR.page.ui.ecran === 'preparation'", 5)
    resultats['ville'] = evaluer("(v => ({ nom: v.nom, ilots: v.ilots, objets: v.objets.length, ms: v.mesures && v.mesures.ms.total, cassables: v.sites.cassables.length }))(PDR.page.monde.ville)")
    if os.environ.get('PARTIE') == '1':
        evaluer("document.getElementById('prep-lancer').click(), true")
        resultats['partie'] = attendre("PDR.page.ui.ecran === 'partie'", 120)
        time.sleep(4)
    # L'interface s'efface : il ne reste que la scène.
    evaluer("""(() => { const s = document.createElement('style');
      s.textContent = '#jeu > :not(canvas) { visibility: hidden !important; }'; document.head.appendChild(s); return true; })()""")
    for nom, x, z, D, lacet in VUES:
        evaluer(f"PDR.page.camera.placer({x}, {z}, {D}, {lacet}), true")
        time.sleep(1.2)
        capture(f'{nom}.png')
        resultats['vues'][nom] = evaluer(MESURE, 30)
finally:
    resultats['journal'] = journal[-40:]
    (sortie / 'resultats.json').write_text(json.dumps(resultats, ensure_ascii=False, indent=1))
    try:
        envoyer('Browser.close', delai=5)
    except Exception:
        pass
    chrome.wait(timeout=10)
print(json.dumps(resultats, ensure_ascii=False, indent=1)[:6000])
