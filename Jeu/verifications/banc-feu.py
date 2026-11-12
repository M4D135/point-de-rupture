#!/usr/bin/env python3
"""Banc du feu (lot L5) : le jeu assemblé dans Chrome sans écran, piloté par tube (--remote-debugging-pipe), sans port
ni réseau ; copie étendue de essai-jeu.py.
    python3 banc-feu.py PAGE.html SORTIE_DIR [effectifs] [ville]
1. La démo : les IA lancent cocktails et grenades dès les premières secondes ; captures du réalisateur, puis caméra
   arrêtée au-dessus du foyer le plus entouré, de près et de loin ; mesures avec ces vrais feux.
2. Une partie (joueur 0), simulation en pause, et un faux état injecté au décor (decor.etat) : chaque sorte de
   cassable dans ses quatre états (intact, cassé, en feu, calciné), foyers de chaque sorte et intensité (cocktail au
   sol, objet, barricade, avant-poste, foyer mourant), nuages de gaz à trois densités, vols de bouteilles, grenades et
   pierres relancés en continu, feux éteints (traces de brûlé, vapeur). Captures de près et de loin.
3. Le coût : images/s, images lentes, decor.mesure, instances translucides du moteur, sans feu puis avec 128 foyers
   et 64 nuages à l'écran, de loin et de près ; et le brouillard (un foyer dans une case non vue ne se dessine pas).
BANC=cout : seulement les mesures du 3 (sans la démo ni les captures de la scène), pour comparer deux pages."""
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
VILLE = sys.argv[4] if len(sys.argv) > 4 else 'marseille'
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


MESURE = MESURE.replace("decor: j ? { instances: j.decor.mesure.instances, msEtat: j.decor.mesure.msEtat, msCadre: j.decor.mesure.msCadre } : null",
                        "decor: j ? Object.assign({}, j.decor.mesure) : null, fx: s.fxInstances, lumieres: s.dynamicLights")
# Le décor garde le dernier état reçu : on enveloppe decor.etat pour relire les foyers et nuages de la simulation.
ECOUTE = """(() => { const j = PDR.page.jeu; if (!j || j.decor.__ecoute) return !!j; const d = j.decor, e0 = d.etat;
  window.__feux = null; window.__nuages = null;
  d.etat = e => { if (e && e.feux) window.__feux = Array.from(e.feux); if (e && e.nuages) window.__nuages = Array.from(e.nuages); return e0(e); };
  d.__ecoute = true; return true; })()"""
# Foyer le plus entouré parmi les vrais : [x, z, nombre de foyers à 60 m].
FOYER = """(() => { const f = window.__feux || []; let best = null;
  for (let i = 0; i < f.length; i += 8) { let n = 0; for (let k = 0; k < f.length; k += 8) if (Math.hypot(f[k + 1] - f[i + 1], f[k + 2] - f[i + 2]) < 60) n++;
    if (!best || n > best[2]) best = [f[i + 1], f[i + 2], n]; }
  return best; })()"""
BANC = r"""
window.__banc = (() => {
  const g = PDR.page, j = g.jeu, d = j.decor, ville = g.monde.ville, S = ville.sites, EV = PDR.protocole.EV;
  const cas = S.cassables, e = ville.etendue, cx0 = (e.x0 + e.x1) / 2, cz0 = (e.z0 + e.z1) / 2;
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  // Le lieu le plus proche du centre : une place dégagée pour le sol, les nuages, la barricade et l'avant-poste.
  const lieu = S.lieux.slice().sort((a, b) => dist(a, cx0, cz0) - dist(b, cx0, cz0))[0];
  const etats = new Uint8Array(cas.length), feux = [], nuages = [], structures = [];
  let id = 1;
  const feu = (x, z, rayon, intensite, reste, sorte, cible) => { feux.push(id++, x, z, rayon, intensite, reste, sorte, cible); return id - 1; };
  // Chaque sorte : les quatre exemplaires les plus serrés près du centre, dans les états 0, 1, 2, 3.
  const sortes = {}, vues = {};
  for (let i = 0; i < cas.length; i++) (sortes[cas[i].sorte] = sortes[cas[i].sorte] || []).push(i);
  for (const [nom, liste] of Object.entries(sortes)) {
    // Près d'une place (dégagée), pour que la caméra ne tombe pas dans une rue étroite.
    const place = i => Math.min(...S.lieux.map(l => Math.max(0, dist(cas[i], l.x, l.z) - l.rayon)));
    const tri = liste.slice().sort((a, b) => place(a) - place(b)).slice(0, 40);
    let mieux = null;
    for (const a of tri) {
      const proches = liste.slice().sort((p, q) => dist(cas[p], cas[a].x, cas[a].z) - dist(cas[q], cas[a].x, cas[a].z)).slice(0, 4);
      const etendue = Math.max(...proches.map(p => dist(cas[p], cas[a].x, cas[a].z)));
      if (!mieux || etendue < mieux[1]) mieux = [proches, etendue];
    }
    const [proches] = mieux;
    proches.forEach((i, k) => { etats[i] = k; if (k === 2) feu(cas[i].x, cas[i].z, 3, 1, 20, 1, i); });
    const ou = k => (proches[k] === undefined ? null : [cas[proches[k]].x, cas[proches[k]].z]);
    vues[nom] = { intact: ou(0), casse: ou(1), feu: ou(2), calcine: ou(3), etendue: mieux[1], n: proches.length };
  }
  // La place : trois cocktails au sol (plein, moitié, mourant), une barricade en feu (trois foyers), un avant-poste en feu.
  const L = lieu, r = Math.min(L.rayon, 20);
  feu(L.x - r * 0.5, L.z - r * 0.3, 4, 1, 15, 0, -1); feu(L.x - r * 0.1, L.z - r * 0.55, 4, 0.55, 8, 0, -1); feu(L.x + r * 0.25, L.z - r * 0.5, 4, 0.2, 1.2, 0, -1);
  structures.push({ id: 900, sorte: 'barricade', faction: 0, x: L.x - 9, z: L.z + r * 0.35, x2: L.x + 9, z2: L.z + r * 0.35, pv: 500, pvMax: 600, chantier: false, feu: true });
  for (const u of [-6, 0, 6]) feu(L.x + u, L.z + r * 0.35, 3.2, 1, 25, 2, 900);
  structures.push({ id: 901, sorte: 'avant-poste', faction: 2, x: L.x + r * 0.9 + 6, z: L.z + 4, x2: L.x + r * 0.9 + 6, z2: L.z + 4, pv: 900, pvMax: 1500, chantier: false, feu: true });
  feu(L.x + r * 0.9 + 6, L.z + 4, 6, 1, 25, 3, 901);
  // Nuages de gaz : plein, à moitié, qui se délite.
  nuages.push(1, L.x - r * 0.7, L.z + r * 0.9, 7, 1, 12, 2, L.x, L.z + r * 1.1, 6, 0.5, 6, 3, L.x + r * 0.7, L.z + r * 0.9, 7, 0.2, 2);
  const avantFeux = Float32Array.from(feux), structuresAvant = structures.slice();
  // Vols relancés en continu : bouteilles, grenades, pierres vers la place.
  const vols = () => {
    const ev = [];
    ev.push(EV.MOLOTOV, L.x - 24, L.z - 6, 0, 20, 2, EV.MOLOTOV, L.x - 22, L.z + 4, 0, 18, -6);
    ev.push(EV.LACRYMO, L.x + 26, L.z + 10, 2, -22, 8, EV.LACRYMO, L.x + 24, L.z - 4, 2, -20, 12);
    for (let k = 0; k < 4; k++) ev.push(EV.PIERRE, L.x - 12 + k, L.z - 14, 0, 6 + k * 2, 10);
    d.etat({ evenements: Float32Array.from(ev) });
  };
  // Feux éteints : quatre foyers d'abord présents, puis éteints (deux à l'eau) : traces et vapeur.
  const eteindre = () => {
    const ids = [], f = [...avantFeux];
    for (let k = 0; k < 4; k++) { ids.push(id); f.push(id++, L.x - 14 + k * 9, L.z - r * 1.1, 4, 1, 3, 0, -1); }
    d.etat({ feux: Float32Array.from(f) });
    const ev = [];
    ids.forEach((q, k) => ev.push(EV.FEU_ETEINT, L.x - 14 + k * 9, L.z - r * 1.1, 2, q, k < 2 ? 1 : 0));
    d.etat({ evenements: Float32Array.from(ev), feux: avantFeux });
  };
  let minuteur = null;
  return {
    lieu: { x: L.x, z: L.z, rayon: L.rayon, nom: L.nom }, vues,
    poser() { d.etat({ cassables: etats, structures: structuresAvant, feux: avantFeux, nuages: Float32Array.from(nuages) }); eteindre(); vols();
      clearInterval(minuteur); minuteur = setInterval(vols, 700); return feux.length / 8; },
    vider() { clearInterval(minuteur); d.etat({ cassables: new Uint8Array(cas.length), structures: [], feux: new Float32Array(0), nuages: new Float32Array(0) }); return true; },
    // Charge : 128 foyers (toutes sortes) et 64 nuages répartis dans un carré de côté c autour de (x, z).
    charge(x, z, c) {
      clearInterval(minuteur);
      const f = [], n = [], objets = [];
      for (let i = 0; i < cas.length; i++) if (Math.abs(cas[i].x - x) < c / 2 && Math.abs(cas[i].z - z) < c / 2) objets.push(i);
      const et = new Uint8Array(cas.length);
      for (let k = 0; k < 128; k++) {
        const t = (k * 0.618034) % 1, u = ((k * 0.754877) % 1 - 0.5) * c, v = (t - 0.5) * c;
        if (k % 4 === 1 && objets.length) { const i = objets[(k * 7) % objets.length]; et[i] = 2; f.push(2000 + k, cas[i].x, cas[i].z, 3, 0.6 + 0.4 * t, 20, 1, i); }
        else f.push(2000 + k, x + u, z + v, 4, 0.5 + 0.5 * t, 10, k % 4 === 3 ? 3 : 0, -1);
      }
      for (let k = 0; k < 64; k++) n.push(3000 + k, x + (((k * 0.381966) % 1) - 0.5) * c, z + (((k * 0.5698) % 1) - 0.5) * c, 7, 0.4 + 0.6 * ((k * 0.3) % 1), 8);
      d.etat({ cassables: et, structures: [], feux: Float32Array.from(f), nuages: Float32Array.from(n) });
      minuteur = setInterval(vols, 700);
      return { feux: f.length / 8, nuages: n.length / 6 };
    },
    brouillard(oui) {
      const geo = j.carte.voile;
      d.regler({ brouillard: oui, joueur: 0 });
      d.voile(oui ? new Uint8Array(geo.nx * geo.nz) : null, oui ? geo : null);
      return Object.assign({}, d.mesure);
    },
  };
})();
true
"""

resultats = {'effectifs': EFFECTIFS, 'ville': VILLE}


def uptime():
    return subprocess.run(['uptime'], capture_output=True, text=True).stdout.strip()


def placer(x, z, D, yaw):
    evaluer(f"PDR.page.camera.placer({x}, {z}, {D}, {yaw}), true")


try:
    cibles = envoyer('Target.getTargets')['targetInfos']
    onglet = next(t for t in cibles if t['type'] == 'page')
    session = envoyer('Target.attachToTarget', {'targetId': onglet['targetId'], 'flatten': True})['sessionId']
    for m in ('Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'):
        envoyer(m, session=session)
    envoyer('Network.setBlockedURLs', {'urls': ['*fonts.googleapis.com*', '*fonts.gstatic.com*', 'http*://*']}, session)
    L, H = int(os.environ.get('LARGEUR', 1440)), int(os.environ.get('HAUTEUR', 900))
    envoyer('Emulation.setDeviceMetricsOverride', {'width': L, 'height': H, 'deviceScaleFactor': 1, 'mobile': False}, session)
    reglages = {'partie': {'effectifs': EFFECTIFS, 'ville': VILLE}}
    envoyer('Page.addScriptToEvaluateOnNewDocument', {'source': f"try {{ localStorage.setItem('pdr.reglages', JSON.stringify({json.dumps(reglages)})); }} catch (e) {{}}"}, session)
    envoyer('Page.navigate', {'url': page.as_uri()}, session)
    attendre("PDR.page && PDR.page.ui.ecran === 'titre'", 90)
    COUT = os.environ.get('BANC') == 'cout'
    # ---- 1. La démo, avec ses vrais feux. ----
    attendre("PDR.page.ui.ecran === 'demo'", 5 if COUT else 40)
    attendre("PDR.page.jeu", 30)
    evaluer(ECOUTE)
    time.sleep(0 if COUT else 12)
    if not COUT:
        capture('demo-1-realisateur.png')
        time.sleep(10)
        capture('demo-2-realisateur.png')
    resultats['demo_sim'] = evaluer("PDR.page.mesure")
    foyer = evaluer(FOYER)
    resultats['demo_foyer'] = foyer
    evaluer("PDR.page.ui.realisateur && PDR.page.ui.realisateur.arreter(), true")
    if foyer and not COUT:
        placer(foyer[0], foyer[1], 90, 0.6)
        time.sleep(1.5)
        capture('demo-3-pres.png')
        placer(foyer[0], foyer[1], 300, 0.6)
        time.sleep(1.5)
        capture('demo-4-300m.png')
        placer(foyer[0], foyer[1], 850, 0.6)
        time.sleep(1.5)
        capture('demo-5-loin.png')
    resultats['demo_uptime'] = uptime()
    if not COUT:
        resultats['demo_mesure'] = evaluer(MESURE, 30)
    # ---- 2. Une partie, simulation en pause, faux état. ----
    clic(700, 450)
    attendre("PDR.page.ui.ecran === 'titre'", 10)
    time.sleep(0.8)
    evaluer("document.getElementById('titre-jouer').click(), true")
    attendre("PDR.page.ui.ecran === 'preparation'", 5)
    time.sleep(0.6)
    evaluer("document.getElementById('prep-lancer').click(), true")
    attendre("PDR.page.ui.ecran === 'partie'", 90)
    time.sleep(3)
    evaluer("PDR.page.hote.vitesse(0), true")
    time.sleep(0.5)
    evaluer(BANC)
    evaluer("(j => (j.decor.regler({ brouillard: false }), j.decor.voile(null), j.foule.regler({ joueur: 0, allie: -1, brouillard: false }), j.foule.voile(null), true))(PDR.page.jeu)")
    lieu = evaluer("__banc.lieu")
    resultats['lieu'] = lieu
    # Le coût : sans feu, puis 128 foyers et 64 nuages à l'écran, de loin et de près.
    evaluer("__banc.vider()")
    placer(lieu['x'], lieu['z'], 600, 0.5)
    time.sleep(1.5)
    resultats['cout_uptime'] = uptime()
    resultats['sans_feu_600'] = evaluer(MESURE, 30)
    resultats['charge'] = evaluer(f"__banc.charge({lieu['x']}, {lieu['z']}, 420)")
    time.sleep(1.5)
    capture('charge-600m.png')
    resultats['avec_feux_600'] = evaluer(MESURE, 30)
    placer(lieu['x'], lieu['z'], 160, 0.5)
    time.sleep(1.5)
    capture('charge-160m.png')
    resultats['avec_feux_160'] = evaluer(MESURE, 30)
    evaluer("__banc.vider()")
    time.sleep(1)
    resultats['sans_feu_160'] = evaluer(MESURE, 30)
    if COUT:
        raise SystemExit
    # La scène : chaque sorte dans ses quatre états, la place ; la foule est retirée pour qu'on voie les objets.
    evaluer("PDR.page.jeu.foule.recevoir(new Float32Array(4), 0), true")
    resultats['foyers_poses'] = evaluer("__banc.poser()")
    time.sleep(1.2)
    for D, nom in ((60, 'place-60m'), (130, 'place-130m'), (450, 'place-450m'), (900, 'place-900m')):
        placer(lieu['x'], lieu['z'], D, 0.5)
        time.sleep(1.4)
        capture(nom + '.png')
    vues = evaluer("__banc.vues")
    resultats['vues'] = vues
    for nom, v in vues.items():
        for etat in ('feu', 'calcine'):
            if v.get(etat):
                # Kiosques et conteneurs sont souvent dans des rues étroites : plus haut.
                placer(v[etat][0], v[etat][1], 110 if nom in ('kiosque', 'conteneur') else 50, 0.5)
                time.sleep(1.2)
                capture(f"sorte-{nom}-{etat}.png")
    # Plus tard : les cocktails au sol meurent, les traces restent.
    placer(lieu['x'], lieu['z'], 70, 2.2)
    time.sleep(1.0)
    capture('place-autre-angle.png')
    # Le brouillard : tout est caché (voile nul), puis tout revient.
    time.sleep(0.3)
    resultats['brouillard_cache'] = evaluer("(__banc.brouillard(true), new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => ok(Object.assign({}, PDR.page.jeu.decor.mesure))))))")
    capture('brouillard.png')
    resultats['brouillard_leve'] = evaluer("(__banc.brouillard(false), new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => ok(Object.assign({}, PDR.page.jeu.decor.mesure))))))")
finally:
    resultats['journal'] = journal[-60:]
    (sortie / 'resultats.json').write_text(json.dumps(resultats, ensure_ascii=False, indent=1))
    try:
        envoyer('Browser.close', delai=5)
    except Exception:
        pass
    chrome.wait(timeout=10)
print(json.dumps(resultats, ensure_ascii=False, indent=1)[:9000])
