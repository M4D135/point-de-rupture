#!/usr/bin/env python3
"""Essai de la page autour du jeu, dans Chrome sans écran piloté par tube (--remote-debugging-pipe : aucun port), réseau
coupé, profil dans le dossier de sortie :
  - le son : rien ne joue avant un geste ; après un clic sur le titre, le contexte audio tourne et la musique avance ;
  - les réglages : Anticrénelage, Ombres et Éclat basculent, le moteur suit, et ils restent après un rechargement ;
  - l'export de la musique rend un module ProTracker valide (« M.K. » à l'octet 1080, 31 instruments) ;
  - le crédit OpenStreetMap est affiché sur l'écran titre.
Rend resultats.json (avec le journal de la console) et deux captures.
    python3 Jeu/verifications/essai-page.py Jeu/dist/point-de-rupture.html SORTIE_DIR"""
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
sortie.mkdir(parents=True, exist_ok=True)

r_cmd, w_cmd = os.pipe()
r_res, w_res = os.pipe()
haut_cmd, haut_res = fcntl.fcntl(r_cmd, fcntl.F_DUPFD, 20), fcntl.fcntl(w_res, fcntl.F_DUPFD, 21)


def relier():
    os.dup2(haut_cmd, 3, inheritable=True)
    os.dup2(haut_res, 4, inheritable=True)


# Sans --autoplay-policy : le navigateur garde sa règle, l'audio n'ouvre qu'après un geste.
chrome = subprocess.Popen(
    [CHROME, '--headless=new', '--remote-debugging-pipe', f'--user-data-dir={sortie / "profil"}', '--no-first-run',
     '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--hide-scrollbars',
     '--use-angle=metal', 'about:blank'],
    preexec_fn=relier, close_fds=False, stdout=open(sortie / 'chrome.log', 'wb'), stderr=subprocess.STDOUT)
for fd in (r_cmd, w_res, haut_cmd, haut_res):
    os.close(fd)
tampon, numero, journal = b'', 0, []


def lire_evenement(r):
    m, p = r.get('method'), r.get('params', {})
    if m == 'Runtime.consoleAPICalled':
        journal.append((p.get('type'), ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))[:800]))
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
    m = {'id': numero, 'method': methode, 'params': params or {}}
    if session:
        m['sessionId'] = session
    os.write(w_cmd, json.dumps(m).encode() + b'\0')
    fin = time.time() + delai
    while time.time() < fin:
        while b'\0' in tampon:
            brut, tampon = tampon.split(b'\0', 1)
            r = json.loads(brut)
            if r.get('id') == numero:
                if 'error' in r:
                    raise RuntimeError(f'{methode}: {r["error"]}')
                return r.get('result', {})
            lire_evenement(r)
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
    (sortie / nom).write_bytes(base64.b64decode(envoyer('Page.captureScreenshot', {'format': 'png'}, session)['data']))


def clic(x, y):
    for t in ('mousePressed', 'mouseReleased'):
        envoyer('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1}, session)


MOTEUR = "(s => ({ msaa: s.msaa, ombres: s.shadows, eclat: s.bloom }))(PDR.page.renderer.stats)"
BOUTONS = "Object.fromEntries(['anticrenelage', 'ombres', 'eclat'].map(k => [k, document.querySelector('[data-bascule=\"' + k + '\"] strong').textContent]))"
STOCKE = "(() => { try { const r = JSON.parse(localStorage.getItem('pdr.reglages') || '{}'); return { anticrenelage: r.anticrenelage, ombres: r.ombres, eclat: r.eclat }; } catch (e) { return null; } })()"

res = {}
try:
    cibles = envoyer('Target.getTargets')['targetInfos']
    session = envoyer('Target.attachToTarget', {'targetId': next(t for t in cibles if t['type'] == 'page')['targetId'], 'flatten': True})['sessionId']
    for m in ('Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'):
        envoyer(m, session=session)
    envoyer('Network.setBlockedURLs', {'urls': ['*fonts.googleapis.com*', '*fonts.gstatic.com*', 'http*://*']}, session)
    envoyer('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False}, session)
    # L'export passe par un lien de téléchargement : on garde le Blob au lieu de l'enregistrer.
    envoyer('Page.addScriptToEvaluateOnNewDocument', {'source': "(() => { const c = URL.createObjectURL; window.__blobs = []; URL.createObjectURL = function (b) { window.__blobs.push(b); return c.call(URL, b); }; HTMLAnchorElement.prototype.click = function () { window.__telecharge = this.download; }; const A = window.AudioContext; window.__contextes = []; window.AudioContext = class extends A { constructor(...a) { super(...a); window.__contextes.push(this); } }; })();"}, session)
    envoyer('Page.navigate', {'url': page.as_uri()}, session)
    res['titre'] = attendre("PDR.page && PDR.page.ui.ecran === 'titre'", 90)
    time.sleep(0.5)
    res['avant_geste'] = evaluer("({ contextes: window.__contextes.map(c => c.state), musique: PDR.page.son && PDR.page.son.stats.musique ? PDR.page.son.stats.musique.rangees : null })")
    res['credit'] = evaluer("(e => e ? { texte: e.innerText.trim(), visible: !!(e.offsetWidth && e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden' } : null)(document.querySelector('.titre-credit'))")
    r = evaluer("(b => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 }))(document.getElementById('titre-jeu').getBoundingClientRect())")
    clic(r['x'], r['y'])
    time.sleep(3)
    a = evaluer("(s => ({ audio: s.stats.audio, musique: s.stats.musique }))(PDR.page.son)")
    time.sleep(2)
    b = evaluer("(s => ({ audio: s.stats.audio, musique: s.stats.musique }))(PDR.page.son)")
    res['apres_geste'] = {'contextes': evaluer("window.__contextes.map(c => c.state)"), 'audio': b['audio'], 'musique': b['musique'],
                          'rangees_en_2s': (b['musique'] or {}).get('rangees', 0) - (a['musique'] or {}).get('rangees', 0),
                          'ecran': evaluer('PDR.page.ui.ecran')}
    capture('1-titre.png')
    # Réglages : ouverture depuis le titre, onglet Image, trois bascules.
    evaluer("document.getElementById('titre-reglages').click(), true")
    time.sleep(0.6)
    res['avant_bascules'] = {'moteur': evaluer(MOTEUR), 'boutons': evaluer(BOUTONS)}
    for k in ('anticrenelage', 'ombres', 'eclat'):
        evaluer(f"document.querySelector('[data-bascule=\"{k}\"]').click(), true")
        time.sleep(0.3)
    time.sleep(0.6)
    res['apres_bascules'] = {'moteur': evaluer(MOTEUR), 'boutons': evaluer(BOUTONS), 'stocke': evaluer(STOCKE)}
    capture('2-reglages.png')
    # Export de la musique.
    evaluer("document.querySelector('[data-action=\"exporter-musique\"]').click(), true")
    time.sleep(1.0)
    res['export'] = evaluer("""(async () => { const b = window.__blobs[window.__blobs.length - 1]; if (!b) return null;
      const o = new Uint8Array(await b.arrayBuffer()), t = (i, n) => String.fromCharCode(...o.slice(i, i + n));
      const longueur = o[950], motifs = Math.max(...o.slice(952, 952 + 128)) + 1;
      let echantillons = 0; for (let i = 0; i < 31; i++) echantillons += ((o[20 + 30 * i + 22] << 8) | o[20 + 30 * i + 23]) * 2;
      return { nom: window.__telecharge, type: b.type, octets: o.length, signature: t(1080, 4), titre: t(0, 20).replace(/\\0+$/, ''),
        longueur, motifs, attendu: 1084 + motifs * 1024 + echantillons }; })()""")
    # Rechargement : les bascules restent.
    envoyer('Page.reload', {}, session)
    time.sleep(1)
    attendre("PDR.page && PDR.page.ui.ecran === 'titre'", 90)
    time.sleep(1)
    res['apres_rechargement'] = {'moteur': evaluer(MOTEUR), 'boutons': evaluer(BOUTONS), 'stocke': evaluer(STOCKE)}
    # Remise des défauts, pour ne rien laisser dans le profil.
    evaluer("(() => { try { const r = JSON.parse(localStorage.getItem('pdr.reglages')); r.anticrenelage = r.ombres = r.eclat = true; localStorage.setItem('pdr.reglages', JSON.stringify(r)); } catch (e) {} return true; })()")
finally:
    res['journal'] = journal[-40:]
    (sortie / 'resultats.json').write_text(json.dumps(res, ensure_ascii=False, indent=1))
    try:
        envoyer('Browser.close', delai=5)
    except Exception:
        pass
    try:
        chrome.wait(timeout=30)
    except subprocess.TimeoutExpired:
        chrome.kill()
print(json.dumps(res, ensure_ascii=False, indent=1)[:6000])
