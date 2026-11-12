#!/usr/bin/env python3
"""Le jeu assemblé dans un navigateur sans WebGL 2 (getContext('webgl2') rend null) : le message de refus doit venir.
Chrome sans écran, piloté par tube (--remote-debugging-pipe : aucun port), réseau coupé ; rend echec.png et resultats.json
(écran, moteur absent, texte affiché, journal de la console).
    python3 Jeu/verifications/sans-webgl2.py Jeu/dist/point-de-rupture.html SORTIE_DIR"""
import base64, fcntl, json, os, pathlib, subprocess, sys, time
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
page, sortie = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2])
sortie.mkdir(parents=True, exist_ok=True)
r_cmd, w_cmd = os.pipe(); r_res, w_res = os.pipe()
hc, hr = fcntl.fcntl(r_cmd, fcntl.F_DUPFD, 20), fcntl.fcntl(w_res, fcntl.F_DUPFD, 21)
def relier():
    os.dup2(hc, 3, inheritable=True); os.dup2(hr, 4, inheritable=True)
chrome = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-pipe', f'--user-data-dir={sortie / "profil"}', '--no-first-run',
                           '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--hide-scrollbars', '--use-angle=metal', 'about:blank'],
                          preexec_fn=relier, close_fds=False, stdout=open(sortie / 'chrome.log', 'wb'), stderr=subprocess.STDOUT)
for fd in (r_cmd, w_res, hc, hr):
    os.close(fd)
tampon, numero, journal = b'', 0, []
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
            p = r.get('params', {})
            if r.get('method') == 'Runtime.consoleAPICalled':
                journal.append((p.get('type'), ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))[:400]))
            elif r.get('method') == 'Runtime.exceptionThrown':
                d = p.get('exceptionDetails', {})
                journal.append(('exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:600]))
        tampon += os.read(r_res, 1 << 20)
    raise TimeoutError(methode)
def evaluer(expression):
    r = envoyer('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True}, session)
    return r['result'].get('value')
res = {}
try:
    cibles = envoyer('Target.getTargets')['targetInfos']
    session = envoyer('Target.attachToTarget', {'targetId': next(t for t in cibles if t['type'] == 'page')['targetId'], 'flatten': True})['sessionId']
    for m in ('Page.enable', 'Runtime.enable'):
        envoyer(m, session=session)
    envoyer('Network.enable', session=session)
    envoyer('Network.setBlockedURLs', {'urls': ['*fonts.googleapis.com*', '*fonts.gstatic.com*', 'http*://*']}, session)
    envoyer('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False}, session)
    envoyer('Page.addScriptToEvaluateOnNewDocument', {'source': "(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; })();"}, session)
    envoyer('Page.navigate', {'url': page.as_uri()}, session)
    fin = time.time() + 60
    while time.time() < fin:
        try:
            if evaluer("PDR.page && PDR.page.ui.ecran === 'echec'"):
                break
        except Exception:
            pass
        time.sleep(0.3)
    time.sleep(0.5)
    res = evaluer("({ ecran: PDR.page.ui.ecran, moteur: PDR.page.renderer === null, texte: (document.querySelector('#echec, [data-ecran=\"echec\"]') || document.body).innerText.replace(/\\s+/g, ' ').slice(0, 400) })")
    (sortie / 'echec.png').write_bytes(base64.b64decode(envoyer('Page.captureScreenshot', {'format': 'png'}, session)['data']))
finally:
    res = dict(res or {}, journal=journal[-10:])
    (sortie / 'resultats.json').write_text(json.dumps(res, ensure_ascii=False, indent=1))
    try:
        envoyer('Browser.close', delai=5)
    except Exception:
        pass
    try:
        chrome.wait(timeout=30)
    except subprocess.TimeoutExpired:
        chrome.kill()
print(json.dumps(res, ensure_ascii=False, indent=1))
