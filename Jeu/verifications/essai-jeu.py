#!/usr/bin/env python3
"""Essai du jeu assemblé dans Chrome sans écran, piloté par tube (--remote-debugging-pipe), sans port ni réseau.
    python3 essai-jeu.py PAGE.html SORTIE_DIR [effectifs]
Étapes : chargement → titre → démo seule après 5 s → geste (retour au titre) → préparation → partie ; captures,
images/s, ms par itération, erreurs de la console."""
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
VILLE = sys.argv[4] if len(sys.argv) > 4 else ''
sortie.mkdir(parents=True, exist_ok=True)
profil = sortie / 'profil'

r_cmd, w_cmd = os.pipe()
r_res, w_res = os.pipe()
haut_cmd, haut_res = fcntl.fcntl(r_cmd, fcntl.F_DUPFD, 20), fcntl.fcntl(w_res, fcntl.F_DUPFD, 21)


def relier():
    os.dup2(haut_cmd, 3, inheritable=True)
    os.dup2(haut_res, 4, inheritable=True)


chrome = subprocess.Popen(
    [CHROME, '--headless=new', '--remote-debugging-pipe', f'--user-data-dir={profil}', '--no-first-run',
     '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--hide-scrollbars',
     '--use-angle=metal', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
    preexec_fn=relier, close_fds=False, stdout=open(sortie / 'chrome.log', 'wb'), stderr=subprocess.STDOUT)
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


def clic(x, y, bouton='left'):
    for t in ('mousePressed', 'mouseReleased'):
        envoyer('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': bouton, 'clickCount': 1}, session)


MESURE = '''new Promise(ok => { let n = 0, t0 = performance.now(), lent = 0, prec = t0, pire = 0, mPrec = null, sims = [];
  const f = t => { n++; const d = t - prec; if (d > 25) lent++; if (d > pire) pire = d; prec = t;
    const mm = PDR.page.mesure; if (mm && mm !== mPrec) { mPrec = mm; sims.push(mm.msIteration); }
    if (t - t0 < 5000) requestAnimationFrame(f);
    else { const g = PDR.page, s = g.renderer.stats, j = g.jeu, m = g.mesure;
      ok({ ips: +(n * 1000 / (t - t0)).toFixed(1), lentes: lent, pireMs: +pire.toFixed(1), ecran: g.ui.ecran,
        appels: s.drawCalls, triangles: s.triangles, msaa: s.msaa, ombres: s.shadows, eclat: s.bloom,
        foule: j ? j.foule.mesure : null, decor: j ? { instances: j.decor.mesure.instances, msEtat: j.decor.mesure.msEtat, msCadre: j.decor.mesure.msCadre } : null,
        sim: m, simMoy: sims.length ? +(sims.reduce((x, y) => x + y, 0) / sims.length).toFixed(1) : null,
        simP95: sims.length ? +sims.slice().sort((x, y) => x - y)[Math.floor(sims.length * .95)].toFixed(1) : null, etats: sims.length,
        ville: g.monde && g.monde.ville.nom, carte: document.getElementById('jeu').dataset.carte || '' }); } };
  requestAnimationFrame(f); })'''

resultats = {'effectifs': EFFECTIFS}
try:
    cibles = envoyer('Target.getTargets')['targetInfos']
    onglet = next(t for t in cibles if t['type'] == 'page')
    session = envoyer('Target.attachToTarget', {'targetId': onglet['targetId'], 'flatten': True})['sessionId']
    for m in ('Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'):
        envoyer(m, session=session)
    # Hors réseau : les polices de Google ne sont pas chargées (repli système), rien ne sort de la machine.
    envoyer('Network.setBlockedURLs', {'urls': ['*fonts.googleapis.com*', '*fonts.gstatic.com*', 'http*://*']}, session)
    L, H, MOB = int(os.environ.get('LARGEUR', 1440)), int(os.environ.get('HAUTEUR', 900)), os.environ.get('MOBILE') == '1'
    envoyer('Emulation.setDeviceMetricsOverride', {'width': L, 'height': H, 'deviceScaleFactor': 3 if MOB else 1, 'mobile': MOB}, session)
    if MOB:
        envoyer('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5}, session)
    reglages = {'partie': {'effectifs': EFFECTIFS}}
    if VILLE:
        reglages['partie']['ville'] = VILLE
    envoyer('Page.addScriptToEvaluateOnNewDocument', {'source': f"try {{ localStorage.setItem('pdr.reglages', JSON.stringify({json.dumps(reglages)})); }} catch (e) {{}}"}, session)
    t0 = time.time()
    envoyer('Page.navigate', {'url': page.as_uri()}, session)
    ok = attendre("PDR.page && PDR.page.ui.ecran === 'titre'", 90)
    resultats['titre_s'] = round(time.time() - t0, 2) if ok else None
    time.sleep(1.0)
    capture('1-titre.png')
    resultats['titre'] = evaluer("({ ecran: PDR.page.ui.ecran, ville: PDR.page.monde && PDR.page.monde.ville.nom, carte: document.getElementById('jeu').dataset.carte || '' })")
    t1 = time.time()
    ok = attendre("PDR.page.ui.ecran === 'demo'", 40)
    resultats['demo_apres_s'] = round(time.time() - t1, 2) if ok else None
    time.sleep(7)
    capture('2-demo.png')
    resultats['demo'] = evaluer(MESURE, 30)
    time.sleep(5)
    capture('3-demo-plus-tard.png')
    resultats['demo_plan'] = evaluer("(r => r ? { actif: r.actif, plan: r.plan && { sorte: r.plan.sorte, D: Math.round(r.plan.D) } } : null)(PDR.page.ui.realisateur)")
    # Un geste : la démo s'arrête, l'écran titre revient.
    clic(700, 450)
    ok = attendre("PDR.page.ui.ecran === 'titre'", 10)
    resultats['retour_titre'] = ok
    time.sleep(0.8)
    evaluer("document.getElementById('titre-jouer').click(), true")
    attendre("PDR.page.ui.ecran === 'preparation'", 5)
    time.sleep(0.6)
    capture('4-preparation.png')
    t2 = time.time()
    evaluer("document.getElementById('prep-lancer').click(), true")
    ok = attendre("PDR.page.ui.ecran === 'partie'", 90)
    resultats['partie_s'] = round(time.time() - t2, 2) if ok else None
    time.sleep(4)
    capture('5-partie.png')
    resultats['partie'] = evaluer(MESURE, 30)
    # Sélection au cadre autour du QG du joueur, puis un ordre au clic droit un peu plus loin.
    evaluer("""(() => { const g = PDR.page; window.__ordres = 0; const h = g.hote, c = h.commandes.bind(h);
      h.commandes = l => { window.__ordres += l.length; return c(l); }; return true; })()""")
    for t, x, y in (('mousePressed', 560, 330), ('mouseMoved', 700, 420), ('mouseMoved', 880, 570), ('mouseReleased', 880, 570)):
        envoyer('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'buttons': 1 if t != 'mouseReleased' else 0, 'clickCount': 1}, session)
        time.sleep(0.05)
    time.sleep(0.3)
    resultats['selection'] = evaluer("PDR.page.ui.commandes.selection.n")
    clic(1000, 300, 'right')
    time.sleep(0.6)
    resultats['ordres_envoyes'] = evaluer("window.__ordres")
    time.sleep(3)
    capture('6-partie-ordre.png')
    resultats['partie_apres_ordre'] = evaluer(MESURE, 30)
finally:
    resultats['journal'] = journal[-60:]
    (sortie / 'resultats.json').write_text(json.dumps(resultats, ensure_ascii=False, indent=1))
    try:
        envoyer('Browser.close', delai=5)
    except Exception:
        pass
    chrome.wait(timeout=10)
print(json.dumps(resultats, ensure_ascii=False, indent=1)[:6000])
