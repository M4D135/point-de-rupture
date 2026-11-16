/* FERRO — procedural crowd, instance selection and drawing. Host styles are injected per profile. */
(function(G){
function createProfile(options={}) {
 const PDR={regles:options.rules};const human=options.human;
  'use strict';

  const LARGEUR = 1024, CAPACITE = 262144, LIGNES = CAPACITE / LARGEUR;
  const ECHELLE = options.scale??1.0; // RADE : taille humaine au sol                    // figurines grandies d'un tiers, pour rester lisibles vue de haut
  const TYPES = 13, NIVEAUX = 2, SEAUX = TYPES * NIVEAUX;
  const SEUIL_DETAIL = 52;                // pixels : au-delà, le maillage détaillé
  const DEFAUT_PLAFOND = 12000, DEFAUT_SEUIL = 7;
  // Hauteur d'une unité, en mètres, échelle comprise : taille projetée des points et seuil des figurines.
  const HAUTEURS = Object.freeze(options.heights||[1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 4.3]);
  // Os du squelette. Le pivot de chaque os est dans le shader (PIV_*), en mètres avant l'échelle.
  const OS = Object.freeze({ CORPS: 0, TETE: 1, BRAS_G: 2, BRAS_D: 3, JAMBE_G: 4, JAMBE_D: 5, PORTE: 6, OUTIL: 7, BOUCLIER: 8,
    VEHICULE: 9, TOURELLE: 10, ANNEAU: 11, BANDEROLE: 12, POUTRE: 13, CUIVRE: 14, TAMBOUR: 15 });
  // Teintes : la couleur de chaque partie est tirée dans le shader, par unité.
  const TEINTE = Object.freeze({ PEAU: 0, HAUT: 1, BAS: 2, CAMP: 3, SOMBRE: 4, METAL: 5, SAC: 6, CLAIR: 7, VERRE: 8, BOIS: 9,
    BLANC: 10, LUMIERE: 11, CHEVEUX: 12, CASQUE: 13, DORE: 14, FOULARD: 15 });
  const MATIERE = Object.freeze({ TISSU: 0, LAQUE: 1, METAL: 2, PEAU: 3, VERRE: 4, EMISSIF: 5 });
  const SOMMET = 36;                      // octets : position 3 × f32, normale 3 × f32, uv 2 × f32, infos 4 × u8

  /** Décode un code d'unité (regles.coder), comme le shader. */
  function decoder(code) {
    const c = code | 0;
    return { faction: c & 3, type: (c >>> 2) & 15, etat: (c >>> 6) & 15, niveau: (c >>> 10) & 63, drapeaux: (c >>> 16) & 255 };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Maillages : un par type et par niveau de détail, dans un seul tampon. Pur : testé sous Node.
  // ---------------------------------------------------------------------------------------------------------------

  function constructeur() {
    const f = [], b = [], idx = [];
    let os = 0, teinte = 0, matiere = 0, motif = 0;
    const regler = (o, t, m = MATIERE.TISSU, mo = 0) => { os = o; teinte = t; matiere = m; motif = mo; };
    function sommet(p, n, uv) {
      f.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]);
      b.push(os, teinte, matiere, motif);
      return b.length / 4 - 1;
    }
    const pos = i => [f[i * 8], f[i * 8 + 1], f[i * 8 + 2]];
    /** Triangle tourné vers la normale voulue (sens trigonométrique vu de dehors, comme FERRO). */
    function triangle(a, c, d, n) {
      const pa = pos(a), pc = pos(c), pd = pos(d);
      const u = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]], v = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]];
      const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (x[0] * n[0] + x[1] * n[1] + x[2] * n[2] < 0) idx.push(a, d, c); else idx.push(a, c, d);
    }
    // Rotation Rz · Ry · Rx du moteur, puis translation.
    function transformer(p, r, c) {
      let [x, y, z] = p;
      if (r) {
        const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
        [y, z] = [cx * y - sx * z, sx * y + cx * z];
        [x, z] = [cy * x + sy * z, -sy * x + cy * z];
        [x, y] = [cz * x - sz * y, sz * x + cz * y];
      }
      return c ? [x + c[0], y + c[1], z + c[2]] : [x, y, z];
    }
    const unite = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    /** Boîte centrée en c, tailles s, rotation r ; effile : [kx, kz] du dessus par rapport au dessous (torse). */
    function boite(c, s, r = null, effile = null) {
      const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2, kx = effile ? effile[0] : 1, kz = effile ? effile[1] : 1;
      const coin = (i, j, k) => transformer([i * hx * (j > 0 ? kx : 1), j * hy, k * hz * (j > 0 ? kz : 1)], r, c);
      const faces = [
        [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]],
        [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]],
        [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]], [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]],
      ];
      const centre = transformer([0, 0, 0], r, c);
      for (const q of faces) {
        const p = q.map(([i, j, k]) => coin(i, j, k));
        const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
        let n = unite([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
        const m = [(p[0][0] + p[2][0]) / 2 - centre[0], (p[0][1] + p[2][1]) / 2 - centre[1], (p[0][2] + p[2][2]) / 2 - centre[2]];
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) n = [-n[0], -n[1], -n[2]];
        const s0 = sommet(p[0], n, [0, 0]), s1 = sommet(p[1], n, [1, 0]), s2 = sommet(p[2], n, [1, 1]), s3 = sommet(p[3], n, [0, 1]);
        triangle(s0, s1, s2, n); triangle(s0, s2, s3, n);
      }
    }
    /** Cylindre d'axe y (rotation r pour le coucher), rayon rx et rz, hauteur h ; couvercles en teinte tc si donnée. */
    function cylindre(c, rx, rz, h, cotes, r = null, tc = null) {
      const haut = [], bas = [];
      for (let i = 0; i <= cotes; i++) {
        const a = (i / cotes) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const n = unite(transformer([ca / rx, 0, sa / rz], r, null));
        haut.push(sommet(transformer([ca * rx, h / 2, sa * rz], r, c), n, [i / cotes, 1]));
        bas.push(sommet(transformer([ca * rx, -h / 2, sa * rz], r, c), n, [i / cotes, 0]));
      }
      for (let i = 0; i < cotes; i++) {
        const n = unite(transformer([Math.cos((i + .5) / cotes * Math.PI * 2), 0, Math.sin((i + .5) / cotes * Math.PI * 2)], r, null));
        triangle(bas[i], bas[i + 1], haut[i + 1], n); triangle(bas[i], haut[i + 1], haut[i], n);
      }
      const t0 = teinte;
      if (tc !== null) teinte = tc;
      for (const y of [1, -1]) {
        const n = unite(transformer([0, y, 0], r, null)), centre = sommet(transformer([0, y * h / 2, 0], r, c), n, [.5, .5]), bord = [];
        for (let i = 0; i <= cotes; i++) {
          const a = (i / cotes) * Math.PI * 2;
          bord.push(sommet(transformer([Math.cos(a) * rx, y * h / 2, Math.sin(a) * rz], r, c), n, [.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5]));
        }
        for (let i = 0; i < cotes; i++) triangle(centre, bord[i], bord[i + 1], n);
      }
      teinte = t0;
    }
    /** Ellipsoïde de rayons r ; calotte : fraction de la hauteur gardée depuis le haut (1 : entière). */
    function sphere(c, r, lon, lat, calotte = 1) {
      const lignes = [];
      const vmax = Math.PI * calotte;
      for (let j = 0; j <= lat; j++) {
        const v = (j / lat) * vmax, ligne = [];
        for (let i = 0; i <= lon; i++) {
          const u = (i / lon) * Math.PI * 2;
          const e = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
          ligne.push(sommet([c[0] + e[0] * r[0], c[1] + e[1] * r[1], c[2] + e[2] * r[2]], unite([e[0] / r[0], e[1] / r[1], e[2] / r[2]]), [i / lon, j / lat]));
        }
        lignes.push(ligne);
      }
      for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
        const a = lignes[j][i], b2 = lignes[j][i + 1], c2 = lignes[j + 1][i + 1], d = lignes[j + 1][i];
        const pa = pos(a), pc = pos(c2), m = [(pa[0] + pc[0]) / 2 - c[0], (pa[1] + pc[1]) / 2 - c[1], (pa[2] + pc[2]) / 2 - c[2]];
        if (j > 0) triangle(a, b2, c2, m);
        if (j < lat - 1 || calotte < 1) triangle(a, c2, d, m);
      }
      if (calotte < 1) {   // fond plat de la calotte
        const y = c[1] + Math.cos(vmax) * r[1], n = [0, -1, 0], centre = sommet([c[0], y, c[2]], n, [.5, .5]), bord = lignes[lat];
        for (let i = 0; i < lon; i++) triangle(centre, bord[i + 1], bord[i], n);
      }
    }
    /** Anneau plat au sol, tourné vers le haut. */
    function anneau(y, r0, r1, segments) {
      const n = [0, 1, 0], dedans = [], dehors = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        dedans.push(sommet([ca * r0, y, sa * r0], n, [i / segments, 0]));
        dehors.push(sommet([ca * r1, y, sa * r1], n, [i / segments, 1]));
      }
      for (let i = 0; i < segments; i++) { triangle(dedans[i], dehors[i], dehors[i + 1], n); triangle(dedans[i], dehors[i + 1], dedans[i + 1], n); }
    }
    // Smooth garment profile: [height, half-width, half-depth], with connected rings.
    function profil(x,z,rings,n){const rows=[];for(let j=0;j<rings.length;j++){const [y,rx,rz]=rings[j],row=[];for(let i=0;i<=n;i++){const a=i*Math.PI*2/n,ca=Math.cos(a),sa=Math.sin(a);const before=rings[Math.max(0,j-1)],after=rings[Math.min(rings.length-1,j+1)],dy=after[0]-before[0]||1,ny=-((after[1]-before[1])*ca*ca+(after[2]-before[2])*sa*sa)/dy;row.push(sommet([x+rx*ca,y,z+rz*sa],unite([ca,ny,sa]),[i/n,j/(rings.length-1)]));}rows.push(row);}for(let j=0;j<rows.length-1;j++)for(let i=0;i<n;i++){const a=(i+.5)*Math.PI*2/n,norm=[Math.cos(a),0,Math.sin(a)];triangle(rows[j][i],rows[j][i+1],rows[j+1][i+1],norm);triangle(rows[j][i],rows[j+1][i+1],rows[j+1][i],norm);}for(const j of [0,rings.length-1]){const normal=[0,j?1:-1,0],mid=sommet([x,rings[j][0],z],normal,[.5,.5]);for(let i=0;i<n;i++)triangle(mid,rows[j][i],rows[j][i+1],normal);}}
    function corps(data,feminine=false){const start=b.length/4;for(let i=0;i<data.positions.length;i++){const [a,second,weight]=data.bones[i],t=data.materials[i];regler(a,t,t===0?MATIERE.PEAU:MATIERE.TISSU,32);const p=data.positions[i].slice(),n=data.normals[i].slice();if(human?.fit){const fitted=human.fit(p,n,feminine);for(let k=0;k<3;k++){p[k]=fitted.p[k];n[k]=fitted.n[k];}}sommet(p,unite(n),[second,weight]);}for(const i of data.indices)idx.push(start+i);}
    function maillage(data){const start=b.length/4;for(let i=0;i<data.positions.length;i++)sommet(data.positions[i],data.normals[i],[0,0]);for(const i of data.indices)idx.push(start+i);}
    return { f, b, idx, regler, boite, cylindre, sphere, anneau, profil, maillage, corps, get sommets() { return b.length / 4; } };
  }

  // Everyday clothing variants are chosen by civilian identity, never by faction or aggression.
  function tenue(m,t,detail){const R=m.regler,T=TEINTE,veil=t===5||t===7,feminine=[2,5,7,9].includes(t),street=[0,3,8].includes(t);
   if(veil&&human){R(OS.TETE,T.FOULARD);m.maillage(human.scarf);if(human.scarfDrape){R(OS.CORPS,T.FOULARD);m.maillage(human.scarfDrape);}}
   // Clothing follows the continuous skinned body; no rigid torso sleeve.
   if(street){R(OS.TETE,T.SAC);m.sphere([0,1.80,-.005],[.105,.062,.106],detail?20:8,detail?8:4,.6);m.boite([0,1.788,.123],[.17,.012,.13]);R(OS.CORPS,T.SOMBRE);m.boite([.015,1.25,.16],[.024,.52,.018],[0,0,-.55]);m.boite([.14,1.055,.18],[.155,.18,.075]);if(detail){R(OS.CORPS,T.METAL,MATIERE.METAL);m.boite([.14,1.11,.221],[.12,.007,.006]);R(OS.CORPS,T.SAC);m.boite([.14,1.032,.22],[.12,.07,.009]);}}
  }
  // RADE civilians: rounded anatomy, articulated knees/elbows, faces and ten outfits.
  function humain(m,t,detail){
    const R=m.regler,T=TEINTE,M=MATIERE,lon=detail?12:7,lat=detail?8:4;
    if(detail&&human?.body){
      const face=human.headFor(t%3);m.corps(human.body,[2,5,7,9].includes(t));R(OS.TETE,T.PEAU,M.PEAU);m.maillage(face.head);if(t!==5&&t!==7){R(OS.TETE,T.CHEVEUX);m.maillage(face.hair);}
      for(const eye of face.head.eyes){R(OS.TETE,T.BLANC);m.sphere(eye,[.009,.0045,.004],12,8);R(OS.TETE,T.SOMBRE);m.sphere([eye[0],eye[1],eye[2]+.005],[.0025,.0025,.0015],10,6);}for(const brow of face.head.brows){R(OS.TETE,T.CHEVEUX);m.sphere(brow,[.015,.002,.003],8,4);}
      if(!human.body.feet)for(const [os,x]of [[16,-.105],[17,.105]]){R(os,T.SOMBRE);m.profil(x,.035,[[.022,.055,.111],[.047,.059,.124],[.086,.052,.112],[.142,.043,.052]],16);R(os,T.CLAIR);m.profil(x,.035,[[.015,.056,.116],[.032,.060,.125]],16);}
      R(OS.CORPS,T.SOMBRE);m.boite([0,1.035,.095],[.30,.027,.022]);R(OS.CORPS,T.METAL,M.METAL);m.boite([0,1.035,.112],[.038,.025,.006]);tenue(m,t,detail);return;
    }
    const wide=t===6?1.14:t===5?.88:1,short=t===1||t===8,dress=t===5;
    const sph=(p,r)=>m.sphere(p,r,lon,lat),oval=(p,r)=>sph(p,r);
    for(const [o,k,x]of [[OS.JAMBE_G,16,-.10],[OS.JAMBE_D,17,.10]]){
      R(o,T.BAS);m.profil(x,0,[[.48,.071,.078],[.62,.084,.093],[.83,.098*wide,.109],[1.02,.095*wide,.10]],lon);
      R(k,T.BAS);m.profil(x,0,[[.08,.064,.074],[.27,.071,.081],[.46,.077,.085],[.56,.074,.083]],lon);
      R(k+4,T.SOMBRE);m.profil(x,.045,[[.022,.055,.111],[.047,.059,.124],[.086,.052,.112],[.142,.043,.052]],lon);
      if(detail){R(k+4,T.BLANC);m.boite([x,.025,.045],[.118,.018,.25]);R(k+4,T.CLAIR);for(let j=0;j<3;j++)m.boite([x,.113,.055+j*.018],[.065,.006,.007]);}
    }
    R(OS.CORPS,T.BAS);m.profil(0,0,[[.88,.175*wide,.12],[1.04,.19*wide,.13]],lon);
    R(OS.CORPS,T.HAUT);m.profil(0,0,[[1.015,.18*wide,.13],[1.12,.18*wide,.14],[1.32,.205*wide,.142],[1.44,.21*wide,.12],[1.50,.075,.07]],lon);
    if(dress){R(OS.CORPS,T.HAUT);m.boite([0,.88,0],[.49,.42,.31],null,[.7,.8]);}
    if(t===3||t===9){R(OS.CORPS,T.HAUT);m.boite([0,1.03,0],[.40*wide,.40,.26],null,[1.03,1]);}
    const anatomical=detail&&human;
    R(OS.TETE,T.PEAU,M.PEAU);
    if(anatomical)m.maillage(human.head);else{m.cylindre([0,1.515,0],.061,.061,.13,lon);oval([0,1.676,.005],[.108,.151,.106]);oval([0,1.605,.026],[.081,.068,.080]);}
    for(const [o,fore,x]of [[OS.BRAS_G,18,-.255*wide],[OS.BRAS_D,19,.255*wide]]){
      R(o,T.HAUT);m.profil(x,0,[[1.18,.061,.069],[1.32,.077,.087],[1.43,.079,.085],[1.46,.05,.06]],lon);oval([x*.79,1.43,0],[.086,.075,.085]);
      R(fore,short?T.PEAU:T.HAUT,short?M.PEAU:M.TISSU);m.profil(x,.012,[[.94,.046,.052],[1.04,.051,.060],[1.16,.061,.067],[1.23,.060,.068]],lon);
      R(fore,T.PEAU,M.PEAU);oval([x,.88,.015],[.045,.065,.034]);
      if(detail){oval([x+(x>0?-.044:.044),.91,.033],[.019,.038,.022]);R(fore,T.SOMBRE);m.cylindre([x,.952,.013],.059,.066,.025,lon);}
    }
    if(detail){
      for(const eye of human.head.eyes){R(OS.TETE,T.BLANC);oval(eye,[.009,.0045,.004]);R(OS.TETE,T.SOMBRE);oval([eye[0],eye[1],eye[2]+.005],[.0025,.0025,.0015]);}
      R(OS.CORPS,T.SOMBRE);m.boite([0,1.015,.12],[.32*wide,.035,.035]);R(OS.CORPS,T.METAL,M.METAL);m.boite([0,1.015,.144],[.045,.027,.009]);
      if(t!==1&&t!==5){R(OS.CORPS,T.CLAIR);m.boite([0,1.272,.133],[.014,.40,.008]);R(OS.CORPS,T.SAC);for(const x of [-.12,.12])m.boite([x,1.13,.125],[.105,.035,.016]);}
      if(t===1){R(OS.CORPS,T.BLANC);for(let j=0;j<5;j++)m.boite([0,1.16+j*.053,.13],[.34,.013,.012]);}
      if(t===9){R(OS.CORPS,T.BLANC);m.boite([0,1.39,.134],[.10,.16,.015]);R(OS.CORPS,T.SOMBRE);m.boite([0,1.35,.15],[.027,.17,.012]);}
    }
    R(OS.TETE,T.CHEVEUX);if(anatomical)m.maillage(human.hair);else m.sphere([0,1.731,-.011],[.114,.103,.112],lon,lat,.54);
    if(t===5||t===7){oval([0,1.62,-.095],[.127,.17,.055]);if(t===7)oval([0,1.705,-.153],[.06,.065,.07]);}
    if(t===2){R(OS.TETE,T.HAUT);oval([0,1.68,-.09],[.145,.178,.105]);R(OS.CORPS,T.HAUT);oval([0,1.49,-.06],[.14,.08,.11]);}
    if(t===8){R(OS.TETE,T.SAC);m.sphere([0,1.75,0],[.127,.073,.125],lon,lat,.6);m.boite([0,1.768,.13],[.19,.015,.13]);}
    if(t===0||t===4){R(OS.CORPS,T.SAC);oval([0,1.27,-.17],[.15,.20,.095]);R(OS.CORPS,T.SOMBRE);for(const x of [-.13,.13])m.boite([x,1.29,.11],[.035,.37,.025]);}
    if(t===6&&detail){R(OS.TETE,T.SOMBRE);for(const x of [-.048,.048])m.boite([x,1.698,.122],[.073,.036,.014]);m.boite([0,1.702,.123],[.032,.008,.013]);}
    tenue(m,t,detail);
  }

  // Motards : la moto et son pilote assis d'un bloc.
  function motard(m, detail) {
    const R = m.regler, T = TEINTE, M = MATIERE, cotes = detail ? 10 : 6;
    R(OS.VEHICULE, T.SOMBRE);
    for (const z of [-.68, .72]) m.cylindre([0, .33, z], .33, .33, .13, cotes, [0, 0, Math.PI / 2], T.METAL);
    R(OS.VEHICULE, T.CAMP, M.LAQUE); m.boite([0, .68, .1], [.26, .3, .78]);
    R(OS.VEHICULE, T.SOMBRE); m.boite([0, .84, -.32], [.26, .09, .52]);
    R(OS.VEHICULE, T.METAL, M.METAL); m.boite([0, .72, .6], [.06, .62, .06], [-.35, 0, 0]);
    m.boite([0, 1.04, .52], [.62, .04, .04]);
    R(OS.VEHICULE, T.LUMIERE, M.EMISSIF); m.boite([0, .92, .74], [.13, .1, .05]);
    // Pilote, assis, bras vers le guidon.
    R(OS.CORPS, T.BAS);
    for (const x of [-.12, .12]) { m.boite([x, .92, -.05], [.15, .15, .5]); m.boite([x, .6, .18], [.14, .5, .15]); }
    R(OS.CORPS, T.HAUT); m.boite([0, 1.22, -.14], [.4, .52, .25], [.32, 0, 0], [1.15, 1.04]);
    for (const x of [-.26, .26]) m.boite([x, 1.16, .2], [.11, .11, .52], [-.25, 0, 0]);
    R(OS.CORPS, T.CAMP, M.LAQUE); m.sphere([0, 1.62, .02], [.16, .16, .17], cotes, detail ? 5 : 3);
    if (detail) { R(OS.CORPS, T.VERRE, M.VERRE); m.boite([0, 1.6, .16], [.22, .1, .03]); }
    R(OS.ANNEAU, T.CAMP, M.EMISSIF); m.anneau(.04, 1.0, 1.18, detail ? 24 : 12);
  }

  // Canon à eau : un camion sans insigne, une tourelle, une rampe lumineuse aux couleurs du camp.
  function camion(m, detail) {
    const R = m.regler, T = TEINTE, M = MATIERE, cotes = detail ? 10 : 6;
    R(OS.VEHICULE, T.SOMBRE); m.boite([0, .78, -.2], [2.3, .42, 5.8]);
    for (const z of detail ? [-2.0, -.75, 1.9] : [-1.4, 1.9]) for (const x of [-1.05, 1.05]) m.cylindre([x, .5, z], .5, .5, .36, cotes, [0, 0, Math.PI / 2], T.METAL);
    R(OS.VEHICULE, T.CAMP, M.LAQUE); m.boite([0, 1.78, 1.95], [2.36, 1.62, 1.7]);
    R(OS.VEHICULE, T.VERRE, M.VERRE); m.boite([0, 2.12, 2.81], [2.1, .68, .05]);
    if (detail) { m.boite([1.19, 2.1, 1.95], [.04, .6, 1.1]); m.boite([-1.19, 2.1, 1.95], [.04, .6, 1.1]); }
    R(OS.VEHICULE, T.BLANC, M.LAQUE); m.boite([0, 1.95, -1.0], [2.36, 1.95, 3.7]);
    if (detail) { R(OS.VEHICULE, T.CAMP, M.LAQUE); m.boite([0, 1.5, -1.0], [2.4, .22, 3.72]); }
    R(OS.VEHICULE, T.LUMIERE, M.EMISSIF); m.boite([0, 2.66, 2.1], [1.3, .12, .26]);
    R(OS.TOURELLE, T.METAL, M.METAL); m.cylindre([0, 3.12, .6], .36, .36, .36, cotes);
    m.boite([0, 3.24, 1.25], [.15, .15, 1.2]);
    R(OS.ANNEAU, T.CAMP, M.EMISSIF); m.anneau(.04, 3.55, 3.8, detail ? 32 : 16);
  }

  /** Tous les maillages : sommets entrelacés (SOMMET octets), indices 16 bits, plage de chaque seau type × 2 + niveau. */
  function defaultMeshes() {
    const m = constructeur(), plages = [];
    for (let t = 0; t < TYPES; t++) for (let niveau = 0; niveau < NIVEAUX; niveau++) {
      const premier = m.idx.length, base = m.sommets, detail = niveau === 0;
      if (t === 11) motard(m, detail); else if (t === 12) camion(m, detail); else humain(m, t, detail);
      plages.push({ type: t, niveau, premier, compte: m.idx.length - premier, sommets: m.sommets - base });
    }

    const n = m.sommets, tampon = new ArrayBuffer(n * SOMMET), fl = new Float32Array(tampon), u8 = new Uint8Array(tampon);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) fl[i * 9 + k] = m.f[i * 8 + k];
      for (let k = 0; k < 4; k++) u8[i * SOMMET + 32 + k] = m.b[i * 4 + k];
    }
    return { sommets: tampon, nombre: n, indices: Uint32Array.from(m.idx), plages: Object.freeze(plages), SOMMET };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Liste des proches : faite par le CPU à chaque état, sans allocation. Pur : testé sous Node.
  // ---------------------------------------------------------------------------------------------------------------

  /** Axes de la caméra comme cameraAxes du moteur (roulis nul). */
  function axesCamera(vue) {
    if (vue.axes) return vue.axes;
    const cy = Math.cos(vue.yaw || 0), sy = Math.sin(vue.yaw || 0), cp = Math.cos(vue.pitch || 0), sp = Math.sin(vue.pitch || 0);
    return { right: [cy, 0, sy], up: [-sy * sp, cp, cy * sp], forward: [sy * cp, sp, -cy * cp] };
  }

  function creerListeur(plafond = DEFAUT_PLAFOND) {
    plafond = Math.max(0, Math.min(CAPACITE, plafond | 0));
    const liste = new Uint32Array(Math.max(1, plafond));
    const candidats = new Int32Array(CAPACITE), tailles = new Float32Array(CAPACITE), cases = new Uint8Array(CAPACITE);
    const histo = new Int32Array(64), debut = new Int32Array(SEAUX), compte = new Int32Array(SEAUX), curseur = new Int32Array(SEAUX);
    const resultat = { liste, debut, compte, total: 0, candidats: 0, seuil: 0 };
    /**
     * f32 : [x, z, cap, code] × n. vue : { pos, axes | yaw + pitch, fov (degrés), near } ; image : { largeur, hauteur } en
     * pixels ; reglage : { seuil (px), brouillard : null ou { voile, nx, nz, x0, z0, cellule, joueur, allie } }.
     * Rend resultat : liste d'emplacements rangés par seau (type × 2 + niveau), debut et compte de chaque seau.
     */
    function lister(f32, n, vue, image, reglage) {
      n = Math.max(0, Math.min(CAPACITE, n | 0, (f32.length / 4) | 0));
      const seuil = Math.max(.5, reglage.seuil || DEFAUT_SEUIL), b = reglage.brouillard || null;
      const ax = axesCamera(vue), fw = ax.forward, rt = ax.right, up = ax.up, e = vue.pos;
      const tanV = Math.tan(((vue.fov || 42) * Math.PI) / 360), tanH = tanV * (image.largeur / Math.max(1, image.hauteur));
      const focale = image.hauteur / (2 * tanV), proche = Math.max(.05, vue.near || .05);
      const f0 = fw[0], f1 = fw[1], f2 = fw[2], r0 = rt[0], r1 = rt[1], r2 = rt[2], u0 = up[0], u1 = up[1], u2 = up[2];
      const ex = e[0], ey = e[1], ez = e[2];
      const voile = b && b.voile, vnx = b ? b.nx | 0 : 0, vnz = b ? b.nz | 0 : 0, vix = b ? 1 / b.cellule : 0, vx0 = b ? b.x0 : 0, vz0 = b ? b.z0 : 0;
      const joueur = b ? b.joueur : -1, allie = b ? b.allie : -1;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const o = i << 2, code = f32[o + 3] | 0, faction = code & 3;
        if (faction === 3) continue;
        const x = f32[o], z = f32[o + 1], dx = x - ex, dy = 1.2 - ey, dz = z - ez;
        const prof = dx * f0 + dy * f1 + dz * f2;
        if (prof < proche) continue;
        const taille = HAUTEURS[(code >>> 2) & 15] * focale / prof;
        if (taille < seuil) continue;
        // Marge : la demi-longueur d'un camion, échelle comprise.
        if (Math.abs(dx * r0 + dy * r1 + dz * r2) > prof * tanH + 4 || Math.abs(dx * u0 + dy * u1 + dz * u2) > prof * tanV + 4) continue;
        if (voile && faction !== joueur && faction !== allie) {
          const cx = ((x - vx0) * vix) | 0, cz = ((z - vz0) * vix) | 0;
          if (cx < 0 || cz < 0 || cx >= vnx || cz >= vnz || voile[cx + cz * vnx] < 90) continue;
        }
        candidats[k] = i; tailles[k] = taille; k++;
      }
      resultat.candidats = k;
      // Plafond : on garde les plus grandes tailles projetées (histogramme logarithmique, sans tri).
      let garder = k, seuilCase = -1, resteCase = 0;
      if (k > plafond) {
        histo.fill(0);
        for (let j = 0; j < k; j++) {
          const c = Math.min(63, Math.max(0, (Math.log2(tailles[j] / seuil) * 10) | 0));
          cases[j] = c; histo[c]++;
        }
        let acc = 0, c = 63;
        while (c >= 0 && acc + histo[c] <= plafond) { acc += histo[c]; c--; }
        seuilCase = c; resteCase = plafond - acc; garder = plafond;
        resultat.seuil = seuil * Math.pow(2, (c + 1) / 10);
      } else resultat.seuil = seuil;
      // Rangement par seau : comptage, puis placement.
      compte.fill(0);
      for (let j = 0; j < k; j++) {
        if (seuilCase >= 0) { const c = cases[j]; if (c < seuilCase || (c === seuilCase && resteCase <= 0)) { candidats[j] = -1; continue; } if (c === seuilCase) resteCase--; }
        const i = candidats[j], t = ((f32[(i << 2) + 3] | 0) >>> 2) & 15;
        compte[t * 2 + (tailles[j] >= SEUIL_DETAIL ? 0 : 1)]++;
      }
      let somme = 0;
      for (let s = 0; s < SEAUX; s++) { debut[s] = somme; curseur[s] = somme; somme += compte[s]; }
      for (let j = 0; j < k; j++) {
        const i = candidats[j];
        if (i < 0) continue;
        const t = ((f32[(i << 2) + 3] | 0) >>> 2) & 15;
        liste[curseur[t * 2 + (tailles[j] >= SEUIL_DETAIL ? 0 : 1)]++] = i;
      }
      resultat.total = Math.min(somme, garder);
      return resultat;
    }
    return { lister, resultat, plafond };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Shaders.
  // ---------------------------------------------------------------------------------------------------------------

  let COMMUN = `
  uniform highp sampler2D uCour;
  uniform highp sampler2D uPrec;
  uniform highp sampler2D uLocomotion;
  uniform float uDistanceGait;
  uniform highp usampler2D uMarques;
  uniform sampler2D uVoileF;
  uniform sampler2D uSol;
  uniform vec4 uVoileZoneF;
  uniform vec4 uSolZone;
  uniform vec4 uReglages;
  uniform ivec4 uCamps;
  uniform vec3 uFactions[3];
  struct Unite { vec2 xz; float cap; uint faction; uint type; uint etat; uint niveau; uint drapeaux; uint marques; float vitesse; vec2 gait; bool cachee; uint h; };
  uint hache(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
  Unite lireUnite(int id){
    Unite u;ivec2 t=ivec2(id&1023,id>>10);
    vec4 c=texelFetch(uCour,t,0);
    uint code=uint(c.w+.5);
    u.faction=code&3u;u.type=(code>>2)&15u;u.etat=(code>>6)&15u;u.niveau=(code>>10)&63u;u.drapeaux=(code>>16)&255u;
    u.gait=vec2(-1.,0.);if(uDistanceGait>.5){vec4 g=texelFetch(uLocomotion,t,0);u.gait=vec2(mix(g.x,g.y,uReglages.x),mix(g.z,g.w,uReglages.x));}
    u.marques=texelFetch(uMarques,t,0).r;u.xz=c.xy;u.cap=c.z;u.vitesse=0.;u.cachee=u.faction==3u;u.h=hache(uint(id));
    if(id<uCamps.z){
      vec4 p=texelFetch(uPrec,t,0);
      uint pc=uint(p.w+.5);vec2 d=c.xy-p.xy;
      // Même camp, même type, pas de saut : l'emplacement n'a pas changé d'occupant.
      if((pc&63u)==(code&63u)&&dot(d,d)<64.){
        u.xz=p.xy+d*uReglages.x;
        float a=c.z-p.z;a-=6.2831853*floor((a+3.1415927)/6.2831853);
        u.cap=p.z+a*uReglages.x;u.vitesse=length(d)*uReglages.w;
      }
    }
    if(!u.cachee&&uReglages.z>.5&&int(u.faction)!=uCamps.x&&int(u.faction)!=uCamps.y)
      u.cachee=texture(uVoileF,(u.xz-uVoileZoneF.xy)*uVoileZoneF.zw).r<.35;
    return u;
  }
  float solSous(vec2 xz){return texture(uSol,(xz-uSolZone.xy)*uSolZone.zw).r*2.55;}
  const vec3 HAUTS[16]=vec3[16](vec3(.84,.22,.16),vec3(.20,.20,.22),vec3(.66,.17,.13),vec3(.34,.31,.33),
    vec3(.90,.58,.12),vec3(.30,.29,.27),vec3(.80,.50,.10),vec3(.42,.40,.36),
    vec3(.10,.15,.30),vec3(.12,.17,.33),vec3(.16,.20,.36),vec3(.09,.12,.24),
    vec3(.12,.12,.13),vec3(.18,.17,.18),vec3(.25,.10,.09),vec3(.14,.14,.16));
  vec3 haut(Unite u){uint k=(u.h>>4)&3u;return HAUTS[(u.h>>4)&15u];}
  // Un Cortège sur huit porte la banderole, un Piquet sur huit la pancarte (David, 12/11/2026 : « trop de pancartes »).
  bool porteur(Unite u){return (u.type==1u||u.type==5u)&&((u.h>>20)&7u)==0u;}`;

  let FIGURINE_VS = `#version 300 es
  precision highp float;precision highp int;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormale;
  layout(location=2) in vec2 aUV;
  layout(location=3) in uvec4 aInfo;
  layout(location=4) in uint aUnite;
  uniform mat4 uVP;
  ${'/*COMMUN*/'}
  #ifndef OMBRE
  out vec3 vMonde;out vec3 vNormale;out vec2 vUV;
  flat out vec3 vBase;flat out vec4 vMatiere;flat out vec3 vMotif;flat out uint vFaction;
  #endif
  const vec3 PIV_HANCHES=vec3(0.,.95,0.),PIV_COU=vec3(0.,1.52,0.),PIV_JAMBE_G=vec3(-.105,.97,0.),PIV_JAMBE_D=vec3(.105,.97,0.);
  const vec3 PIV_BRAS_G=vec3(-.235,1.43,0.),PIV_BRAS_D=vec3(.235,1.43,0.),PIV_BANDEROLE=vec3(.27,1.85,.05),PIV_TOURELLE=vec3(0.,3.12,.6);
  struct Pose{float jg;float jd;float bg;float bd;float torse;float tete;float haut;float roulis;float tourelle;float bouclier;float banderole;float poutre;float kg;float kd;float fg;float fd;};
  ${human?.gaitGLSL||'vec4 humanGait(float phase,float amount){float a=sin(phase)*.30*amount;return vec4(a,-max(0.,a)*1.25,0.,0.);}'}
  vec3 tourneX(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,v.y*c+v.z*s,-v.y*s+v.z*c);}
  void tourner(inout vec3 p,inout vec3 n,vec3 pivot,float a){p=pivot+tourneX(p-pivot,a);n=tourneX(n,a);}
  Pose poser(Unite u,bool cuivre){
    Pose q=Pose(0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.);
    float t=uReglages.y,ph=float(u.h&1023u)*.0061419;
    uint e=u.etat;bool court=e==8u;bool marche=u.gait.x>=0.?u.gait.y>.001:u.vitesse>.25||e==1u||court;
    float amp=court?.65:.32*clamp(max(u.vitesse,e==1u?1.1:0.)/1.4,0.,1.);
    float w=t*(court?1.55:.85)*6.2831853+ph,s=sin(w);
    if(marche&&(e<2u||e==8u)){float cadence=court?2.2:1.1,amount=clamp(u.vitesse/(1.153846*cadence),0.,1.2),phase=t*cadence*6.28318530718+ph;if(u.gait.x>=0.){phase=u.gait.x;amount=u.gait.y;}vec4 left=humanGait(phase,amount),right=humanGait(phase+3.14159265359,amount);q.jg=left.x;q.jd=right.x;q.kg=left.y;q.kd=right.y;q.fg=left.z;q.fd=right.z;q.haut=left.w;q.bg=-sin(phase)*.23*amount;q.bd=-q.bg;q.torse=court?.12:.012*sin(phase);}
    else if(marche){q.jg=amp*s;q.jd=-amp*s;q.bg=-amp*.8*s;q.bd=amp*.8*s;}
    else{q.torse=.025*sin(t*1.3+ph);q.bg=.05*sin(t*1.1+ph);q.bd=-q.bg;q.tete=.06*sin(t*.7+ph*1.7);}
    if(e==2u){float k=.5+.5*sin(t*7.5+ph);q.bd=1.25+.45*k;q.bg=1.05+.4*(1.-k);q.torse=.1+.18*k;if(!marche){q.jg=.3;q.jd=-.22;}}
    else if(e==3u){float k=.5+.5*sin(t*5.+ph);q.torse=.78;q.bg=.55+.5*k;q.bd=.55+.5*(1.-k);q.jg=q.jd=.15;q.haut=-.06;q.tete=-.3;}
    else if(e==4u){q.bg=q.bd=.95;}
    else if(e==5u){float k=.5+.5*sin(t*4.2+ph);q.bg=q.bd=.4+1.5*k;q.torse=.35-.25*k;q.haut=-.05*(1.-k);}
    else if(e==6u){float k=.5+.5*sin(t*3.6+ph);q.bg=q.bd=1.25;q.torse=-.15-.2*k;q.jg=.35;q.jd=-.1;}
    else if(e==7u){float k=max(0.,sin(t*6.2+ph));q.jd=-.2+1.35*k*k;q.jg=0.;q.bg=-.4;q.bd=.5;q.torse=-.08*k;}
    else if(e==9u){q.jg=.28;q.jd=-.28;q.bg=q.bd=.55;q.haut=-.07;q.torse=.12;}
    else if(e==10u){q.jg=q.jd=1.5;q.haut=-.62;q.torse=-.22+.05*sin(t*2.+ph);q.bg=q.bd=.8+.08*sin(t*1.7+ph);q.tete=.3+.1*sin(t*2.6+ph);}
    else if(e==11u){float k=.5+.5*sin(t*3.+ph);q.bd=.6+2.1*k;q.bg=1.;}
    if((u.drapeaux&1u)!=0u&&(e<2u||e==4u||e==8u))q.bg=q.bd=.95;
    if(false){
      if(porteur(u)){q.bd=2.85+.08*sin(t*1.7+ph);q.banderole=.12*sin(t*2.3+ph);if(u.type==5u)q.bg=marche?q.bg:.3;}
      if(u.type==6u||u.type==10u){bool leve=(u.drapeaux&8u)!=0u||e==9u||e==2u;q.bouclier=leve?0.:-.35;q.bg=leve?1.05:.3;}
      if(u.type==7u){q.bg=q.bd=.95;q.poutre=(e==6u||e==2u||e==7u)?.38*max(0.,sin(t*5.+ph)):0.;}
      if(u.type==3u){if(cuivre){q.bg=q.bd=1.35;q.torse+=.05*sin(t*3.+ph);}else{q.bd=1.+.5*abs(sin(t*8.+ph));q.bg=1.+.5*abs(sin(t*8.+ph+1.57));}}
    }
    if(u.type==11u||u.type==12u){
      q.jg=q.jd=q.bg=q.bd=q.tete=0.;q.torse=u.type==11u?.06*clamp(u.vitesse/8.,0.,1.):0.;
      q.haut=marche?.015*sin(t*13.+ph):0.;
      if(u.type==12u&&e==11u)q.tourelle=.1+.12*sin(t*2.+ph);
      if(e==10u){q.roulis=u.type==11u?1.25:.05;q.haut=u.type==11u?-.05:-.08;}
    }
    if((u.drapeaux&2u)!=0u)q.torse-=.22;
    if(!(marche&&(e<2u||e==8u))){q.kg=-max(0.,q.jg)*1.25;q.kd=-max(0.,q.jd)*1.25;}
    return q;
  }
  void poserOs(inout vec3 p,inout vec3 n,uint os,Pose q){
    if(os==20u||os==21u){bool left=os==20u;float a=left?q.jg:q.jd;float x=left?-.105:.105;tourner(p,n,vec3(x,.145,0.),left?q.fg:q.fd);tourner(p,n,vec3(x,.52,0.),left?q.kg:q.kd);tourner(p,n,left?PIV_JAMBE_G:PIV_JAMBE_D,a);}
    else if(os==16u||os==17u){float a=os==16u?q.jg:q.jd;vec3 knee=vec3(os==16u?-.105:.105,.52,0.);tourner(p,n,knee,os==16u?q.kg:q.kd);tourner(p,n,os==16u?PIV_JAMBE_G:PIV_JAMBE_D,a);}
    else if(os==18u||os==19u){float a=os==18u?q.bg:q.bd;vec3 elbow=vec3(os==18u?-.255:.255,1.19,0.);tourner(p,n,elbow,.13+max(0.,a)*.4);tourner(p,n,os==18u?PIV_BRAS_G:PIV_BRAS_D,a);}
    else if(os==4u)tourner(p,n,PIV_JAMBE_G,q.jg);
    else if(os==5u)tourner(p,n,PIV_JAMBE_D,q.jd);
    else if(os==2u)tourner(p,n,PIV_BRAS_G,q.bg);
    else if(os==3u||os==7u)tourner(p,n,PIV_BRAS_D,q.bd);
    else if(os==8u)tourner(p,n,PIV_BRAS_G,q.bouclier);
    else if(os==12u)tourner(p,n,PIV_BANDEROLE,-q.banderole);
    else if(os==13u)p.z+=q.poutre;
    else if(os==1u||os==14u)tourner(p,n,PIV_COU,-q.tete);
    else if(os==10u)tourner(p,n,PIV_TOURELLE,-q.tourelle);
    if(os!=4u&&os!=5u&&os!=16u&&os!=17u&&os!=20u&&os!=21u&&os!=9u&&os!=10u&&os!=11u)tourner(p,n,PIV_HANCHES,-q.torse);
  }
  void main(){
    Unite u=lireUnite(int(aUnite));
    uint os=aInfo.x;bool cuivre=(u.h&1u)==1u;
    bool cache=u.cachee;
    if(os==6u&&(u.drapeaux&1u)==0u&&u.etat!=4u)cache=true;
    if(os==12u&&!porteur(u))cache=true;
    #ifdef OMBRE
    if(os==11u)cache=true;
    #else
    if(os==11u&&(u.marques&1u)==0u)cache=true;
    #endif
    if(u.type==3u&&(os==14u?!cuivre:(os==15u||os==7u)&&cuivre))cache=true;
    if(cache){gl_Position=vec4(0.,0.,3.,1.);
      #ifndef OMBRE
      vMonde=vNormale=vec3(0.);vUV=vec2(0.);vBase=vMotif=vec3(0.);vMatiere=vec4(0.);vFaction=0u;
      #endif
      return;}
    Pose q=poser(u,cuivre);
    vec3 p=aPosition,n=aNormale;
    poserOs(p,n,os,q);
    if((aInfo.w&32u)!=0u){vec3 bp=aPosition,bn=aNormale;poserOs(bp,bn,uint(aUV.x+.5),q);p=mix(p,bp,aUV.y);n=normalize(mix(n,bn,aUV.y));}
    if(os!=11u){
      if(q.roulis!=0.){float c=cos(q.roulis),s=sin(q.roulis);p=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);n=vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);}
      p.y+=q.haut;
    }
    float height=.94+float((u.h>>22)&7u)*.017,width=.92+float((u.h>>25)&7u)*.022;p*=vec3(width,height,1.);n=normalize(n/vec3(width,height,1.));
    float c=cos(u.cap),s=sin(u.cap);p*=${ECHELLE.toFixed(2)};
    vec3 monde=vec3(u.xz.x+c*p.x+s*p.z,solSous(u.xz)+p.y,u.xz.y-s*p.x+c*p.z);
    gl_Position=uVP*vec4(monde,1.);
    #ifndef OMBRE
    vMonde=monde;vNormale=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);vUV=aUV;vFaction=u.faction;
    // Teinte de la partie, tirée pour l'unité.
    uint tt=aInfo.y,h=u.h;vec3 camp=uFactions[u.faction],b;
    if(tt==0u){const vec3 P[8]=vec3[8](vec3(.28,.17,.12),vec3(.37,.23,.16),vec3(.45,.29,.20),vec3(.51,.34,.23),vec3(.60,.41,.29),vec3(.66,.46,.32),vec3(.79,.60,.46),vec3(.87,.70,.57));b=P[(h>>8)&7u];}
    else if(tt==1u)b=haut(u);
    else if(tt==2u){const vec3 P[4]=vec3[4](vec3(.15,.17,.23),vec3(.22,.21,.22),vec3(.30,.27,.22),vec3(.11,.12,.16));b=P[(h>>10)&3u];}
    else if(tt==3u)b=camp;
    else if(tt==4u)b=vec3(.06,.06,.065);
    else if(tt==5u)b=vec3(.55,.57,.6);
    else if(tt==6u){const vec3 P[4]=vec3[4](vec3(.14,.14,.15),vec3(.30,.24,.16),vec3(.20,.26,.22),vec3(.35,.12,.10));b=P[(h>>12)&3u];}
    else if(tt==7u)b=mix(camp,vec3(1.),.55);
    else if(tt==8u)b=vec3(.10,.13,.17);
    else if(tt==9u)b=vec3(.46,.33,.20);
    else if(tt==10u)b=vec3(.86,.86,.83);
    else if(tt==11u)b=mix(camp,vec3(1.),.35);
    else if(tt==12u){const vec3 P[4]=vec3[4](vec3(.10,.08,.07),vec3(.30,.20,.12),vec3(.55,.42,.25),vec3(.16,.15,.15));b=P[(h>>14)&3u];}
    else if(tt==13u)b=u.faction==1u?vec3(.95,.72,.18):u.faction==2u?vec3(.13,.22,.48):camp;
    else if(tt==15u)b=((h>>12)&1u)==0u?vec3(.09,.12,.17):vec3(.30,.14,.12);
    else b=vec3(.80,.62,.25);
    uint mat=aInfo.z;
    vMatiere=mat==1u?vec4(.22,.35,0.,0.):mat==2u?vec4(.38,.75,0.,0.):mat==3u?vec4(.7,0.,0.,0.):mat==4u?vec4(.1,.5,0.,0.):mat==5u?vec4(.5,0.,1.6,0.):vec4(.92,0.,0.,0.);
    vMatiere.w=float(aInfo.w&31u);vMotif=tt==10u||tt==9u?camp:mix(camp,vec3(1.),.6);
    // Cohésion basse : plus sombre. Sélection : plus clair. Touché : un éclair blanc. Colère du Bastion : le visage rougit.
    if(mat!=5u)b*=.5+.5*smoothstep(0.,34.,float(u.niveau));
    if((u.marques&1u)!=0u&&mat!=5u)b=mix(b,b*1.3+.05,.7);
    if((u.drapeaux&2u)!=0u){float k=.5+.5*sin(uReglages.y*38.);b=mix(b,vec3(1.,.97,.9),.5*k);vMatiere.z+=.45*k;}
    if((u.drapeaux&4u)!=0u&&tt==0u)b=mix(b,vec3(.9,.2,.12),.3+.15*sin(uReglages.y*6.));
    vBase=b;
    #endif
  }`;

  let FIGURINE_FS = `#version 300 es
  precision highp float;precision highp int;
  ${'/*PDR*/'}
  in vec3 vMonde;in vec3 vNormale;in vec2 vUV;
  flat in vec3 vBase;flat in vec4 vMatiere;flat in vec3 vMotif;flat in uint vFaction;
  out vec4 fragColor;
  float motif(vec2 uv,uint f){
    vec2 q=uv*2.-1.;float d;
    if(f==0u)d=length(q)-.55;
    else if(f==1u)d=max(abs(q.x),abs(q.y))-.48;
    else d=abs(q.y-.35+abs(q.x)*.9)-.2;
    float aa=max(fwidth(d),.02);
    return 1.-smoothstep(-aa,aa,d);
  }
  void main(){
    vec3 n=normalize(vNormale),base=vBase;
    if(vMatiere.w>.5)base=mix(base,vMotif,motif(vUV,vFaction));
    float ombre=pdrOmbreSoleil(vMonde,n);
    fragColor=vec4(pdrFinir(pdrEclairer(base,n,vMonde,vMatiere.x,vMatiere.y,vMatiere.z,ombre),vMonde),0.);
  }`;

  let OMBRE_FS = `#version 300 es
  precision highp float;
  void main(){}`;

  let POINT_VS = `#version 300 es
  precision highp float;precision highp int;
  uniform mat4 uVP;
  uniform vec4 uPoints;
  uniform vec3 uOeilF;
  ${'/*COMMUN*/'}
  out vec3 vMonde;flat out vec3 vBase;flat out float vTaille;flat out float vSelection;flat out float vEmission;flat out vec3 vVersOeil;
  const float HAUTEURS[13]=float[13](${HAUTEURS.map(h => h.toFixed(2)).join(',')});
  void main(){
    Unite u=lireUnite(gl_VertexID);
    if(u.cachee||(u.marques&2u)!=0u){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vMonde=vBase=vVersOeil=vec3(0.);vTaille=vSelection=vEmission=0.;return;}
    float h=HAUTEURS[u.type];if(u.etat==10u)h*=.55;
    vec3 monde=vec3(u.xz.x,solSous(u.xz)+h*.5,u.xz.y);
    vec4 clip=uVP*vec4(monde,1.);
    gl_Position=clip;
    float taille=clamp(h*uPoints.x/max(clip.w,.1)*1.08,uPoints.y,uPoints.z);
    gl_PointSize=taille;vTaille=taille;vMonde=monde;vVersOeil=normalize(uOeilF-monde);
    vec3 b=mix(uFactions[u.faction],haut(u),.28);
    b*=.5+.5*smoothstep(0.,34.,float(u.niveau));
    vSelection=float(u.marques&1u);vEmission=.12;
    if((u.drapeaux&2u)!=0u){float k=.5+.5*sin(uReglages.y*38.);b=mix(b,vec3(1.,.97,.9),.5*k);vEmission+=.4*k;}
    vBase=b;
  }`;

  let POINT_FS = `#version 300 es
  precision highp float;precision highp int;
  ${'/*PDR*/'}
  uniform vec3 uDroiteF;
  in vec3 vMonde;flat in vec3 vBase;flat in float vTaille;flat in float vSelection;flat in float vEmission;flat in vec3 vVersOeil;
  out vec4 fragColor;
  void main(){
    vec2 q=gl_PointCoord*2.-1.;
    vec3 base=vBase;float bord=0.;
    if(vTaille>3.5){
      // Un pion : la tête en haut, le corps évasé vers le bas.
      float tete=length(vec2(q.x,q.y+.5))-.36;
      float corps=max(abs(q.x)-(.3+.3*clamp((q.y+.1)*.9,0.,1.)),abs(q.y-.42)-.58);
      float d=min(tete,corps);
      if(d>0.)discard;
      bord=smoothstep(-.22,0.,d);
      base*=1.-bord*.35;
      if(vSelection>.5&&bord>.55)base=vec3(1.,.98,.9);
    }else if(vSelection>.5)base=mix(base,vec3(1.,.98,.9),.5);
    vec3 n=normalize(uDroiteF*q.x*.7+vec3(0.,.42-q.y*.35,0.)+vVersOeil*.8);
    float ombre=pdrOmbreSoleil(vMonde,vec3(0.,1.,0.));
    fragColor=vec4(pdrFinir(pdrEclairer(base,n,vMonde,.9,0.,vEmission+vSelection*.35,ombre),vMonde),1.);
  }`;

  // ---------------------------------------------------------------------------------------------------------------
  // La foule.
  // ---------------------------------------------------------------------------------------------------------------

  if(options.shaders){[COMMUN,FIGURINE_VS,FIGURINE_FS,OMBRE_FS,POINT_VS,POINT_FS]=[options.shaders.COMMUN??COMMUN,options.shaders.FIGURINE_VS??FIGURINE_VS,options.shaders.FIGURINE_FS??FIGURINE_FS,options.shaders.OMBRE_FS??OMBRE_FS,options.shaders.POINT_VS??POINT_VS,options.shaders.POINT_FS??POINT_FS];}
  function construireMaillages(){const m=options.buildMeshes?options.buildMeshes():defaultMeshes();return m.indices.BYTES_PER_ELEMENT===4?m:{...m,indices:Uint32Array.from(m.indices)};}
  function creerFoule(renderer, options = {}) {
    if(renderer?.gpu){
      if(!G.FCrowdWebGPU)throw new Error('foule : backend WebGPU non chargé');
      return G.FCrowdWebGPU.creer(renderer,{...options,profile:PDR.foule});
    }
    const gl = renderer && renderer.gl, pdr = renderer && renderer.pdr;
    if (!gl || !pdr) throw new Error('foule : le moteur doit tourner en WebGL 2 avec ses points d’accroche PDR');
    const ville = options.ville || null;
    const plafond = options.plafond === undefined ? DEFAUT_PLAFOND : options.plafond;
    let seuil = options.seuil || DEFAUT_SEUIL;
    const regles = PDR.regles;
    const couleursCamps = new Float32Array(9);
    for (let f = 0; f < 3; f++) {
      const c = regles ? regles.FACTIONS[f].couleur : [[.9, .27, .19], [.93, .64, .15], [.22, .45, .9]][f];
      couleursCamps.set(c, f * 3);
    }
    const maillages = construireMaillages();
    const listeur = creerListeur(plafond);
    // Copies CPU des deux derniers états (pour un contexte restauré, et pour le jeu : sélection, minicarte).
    let cour = new Float32Array(CAPACITE * 4), prec = new Float32Array(CAPACITE * 4), nCour = 0, nPrec = 0;
    const marques = new Uint8Array(CAPACITE), locomotion = new Float32Array(CAPACITE*4);let distanceGait=false;
    const selection = new Int32Array(CAPACITE);
    let nSelection = 0, marquesSales = true, lignesMarques = 0;
    let voileCpu = null, voileGeo = null, voileTaille = 0;
    const reglage = { joueur: -1, allie: -1, brouillard: false };
    const brouillardListe = { voile: null, nx: 0, nz: 0, x0: 0, z0: 0, cellule: 8, joueur: -1, allie: -1 };
    const zoneVoile = new Float32Array([0, 0, 1, 1]), zoneSol = new Float32Array([0, 0, 1, 1]);
    // Réception : intervalle moyen entre états, heure du dernier.
    let tRecu = -1, intervalle = 50, listeFaite = -1e9, derniereVue = null, vueListe = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    let alpha = 1, temps = 0;
    const image = { largeur: 1, hauteur: 1 };
    const mesure = { n: 0, proches: 0, candidats: 0, seuil: 0, listeMs: 0, envoiMs: 0, appels: 0, triangles: 0, pointsDessines: 0 };
    const compteRendu = { appels: 0, triangles: 0, instances: 0 };
    let res = null, generation = -1, gpuCour = 0;
    const tailleMax = Math.max(2, Math.min(64, (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1]));

    // Hauteur du sol en cm, au mètre près (ou plus grossier pour une très grande ville), lue une fois.
    let sol = null, solNx = 1, solNz = 1;
    if (ville && typeof ville.sol === 'function' && ville.etendue) {
      const e = ville.etendue, cellule = Math.max(1, Math.max(e.x1 - e.x0, e.z1 - e.z0) / 1024);
      solNx = Math.max(1, Math.ceil((e.x1 - e.x0) / cellule)); solNz = Math.max(1, Math.ceil((e.z1 - e.z0) / cellule));
      sol = new Uint8Array(solNx * solNz);
      for (let j = 0; j < solNz; j++) for (let i = 0; i < solNx; i++) {
        sol[i + j * solNx] = Math.max(0, Math.min(255, Math.round(ville.sol(e.x0 + (i + .5) * cellule, e.z0 + (j + .5) * cellule) * 100)));
      }
      zoneSol.set([e.x0, e.z0, 1 / (solNx * cellule), 1 / (solNz * cellule)]);
    }

    // Les envois passent par l'unité de texture 10, que le moteur n'emploie pas : ses liaisons restent intactes.
    function lierEnvoi(t) { gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, t); }
    function finEnvoi() { gl.activeTexture(gl.TEXTURE0); }
    function textureVide(format, interne, type, w, h, filtre) {
      const t = gl.createTexture();
      lierEnvoi(t);
      gl.texImage2D(gl.TEXTURE_2D, 0, interne, w, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtre); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtre);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function uniformes(p, noms) { const u = {}; for (const n of noms) u[n] = gl.getUniformLocation(p, n); return u; }
    const COMMUNS = ['uLocomotion','uDistanceGait','uCour', 'uPrec', 'uMarques', 'uVoileF', 'uSol', 'uVoileZoneF', 'uSolZone', 'uReglages', 'uCamps', 'uFactions', 'uVP'];

    function creerRessources() {
      const vs = FIGURINE_VS.replace('/*COMMUN*/', COMMUN), ps = POINT_VS.replace('/*COMMUN*/', COMMUN);
      const r = {};
      r.figurine = pdr.programme(vs, FIGURINE_FS.replace('/*PDR*/', pdr.glsl));
      r.ombre = pdr.programme(vs.replace('precision highp int;', 'precision highp int;\n  #define OMBRE 1'), OMBRE_FS);
      r.points = pdr.programme(ps, POINT_FS.replace('/*PDR*/', pdr.glsl));
      r.uFig = uniformes(r.figurine, COMMUNS); r.uOmb = uniformes(r.ombre, COMMUNS);
      r.uPts = uniformes(r.points, COMMUNS.concat(['uPoints', 'uOeilF', 'uDroiteF']));
      r.eclairerFig = pdr.lier(r.figurine); r.eclairerPts = pdr.lier(r.points);
      // Maillages et instances.
      r.vao = gl.createVertexArray(); gl.bindVertexArray(r.vao);
      r.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, r.vbo); gl.bufferData(gl.ARRAY_BUFFER, maillages.sommets, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, SOMMET, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, SOMMET, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, SOMMET, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, SOMMET, 32);
      r.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, maillages.indices, gl.STATIC_DRAW);
      r.instances = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, r.instances);
      gl.bufferData(gl.ARRAY_BUFFER, listeur.resultat.liste.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_INT, 4, 0); gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
      r.vaoPoints = gl.createVertexArray();
      // Textures : deux états, marques, voile, sol.
      r.etats = [0, 1].map(() => textureVide(gl.RGBA, gl.RGBA32F, gl.FLOAT, LARGEUR, LIGNES, gl.NEAREST));
      r.locomotion = textureVide(gl.RGBA, gl.RGBA32F, gl.FLOAT, LARGEUR, LIGNES, gl.NEAREST);
      r.marques = textureVide(gl.RED_INTEGER, gl.R8UI, gl.UNSIGNED_BYTE, LARGEUR, LIGNES, gl.NEAREST);
      r.voile = textureVide(gl.RED, gl.R8, gl.UNSIGNED_BYTE, 1, 1, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
      r.sol = textureVide(gl.RED, gl.R8, gl.UNSIGNED_BYTE, sol ? solNx : 1, sol ? solNz : 1, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, sol ? solNx : 1, sol ? solNz : 1, 0, gl.RED, gl.UNSIGNED_BYTE, sol || new Uint8Array([0]));
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      finEnvoi(); gl.bindBuffer(gl.ARRAY_BUFFER, null);
      res = r; generation = pdr.generation; voileTaille = 0;
      // Après une perte de contexte : tout ce que le CPU garde repart.
      envoyerEtat(prec, nPrec, 1 - gpuCour); envoyerEtat(cour, nCour, gpuCour);
      if(distanceGait)envoyerLocomotion();
      if (voileCpu) envoyerVoile();
      marquesSales = true; lignesMarques = LIGNES;
    }
    function pret() {
      if (gl.isContextLost && gl.isContextLost()) return false;
      if (!res || generation !== pdr.generation) creerRessources();
      return true;
    }

    function envoyerEtat(f32, n, quelle) {
      if (!res || !n) return;
      lierEnvoi(res.etats[quelle]);
      const lignes = n >>> 10, reste = n & 1023;
      if (lignes) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LARGEUR, lignes, gl.RGBA, gl.FLOAT, f32, 0);
      if (reste) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, lignes, reste, 1, gl.RGBA, gl.FLOAT, f32, lignes * LARGEUR * 4);
      finEnvoi();
    }
    function envoyerLocomotion(){
      if(!res||!nCour||!distanceGait)return;lierEnvoi(res.locomotion);
      const rows=nCour>>>10,rest=nCour&1023;
      if(rows)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,LARGEUR,rows,gl.RGBA,gl.FLOAT,locomotion,0);
      if(rest)gl.texSubImage2D(gl.TEXTURE_2D,0,0,rows,rest,1,gl.RGBA,gl.FLOAT,locomotion,rows*LARGEUR*4);
      finEnvoi();
    }
    function envoyerVoile() {
      if (!res || !voileCpu) return;
      lierEnvoi(res.voile);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (voileTaille !== voileCpu.length) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, voileGeo.nx, voileGeo.nz, 0, gl.RED, gl.UNSIGNED_BYTE, voileCpu); voileTaille = voileCpu.length; }
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, voileGeo.nx, voileGeo.nz, gl.RED, gl.UNSIGNED_BYTE, voileCpu);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      finEnvoi();
    }

    /** Refait la liste des figurines avec la dernière vue, met à jour les marques (bit 1) et l'envoie au GPU. */
    function refaireListe(maintenant) {
      if (!derniereVue) return;
      const t0 = performance.now(), r = listeur.resultat, liste = r.liste;
      for (let k = 0; k < r.total; k++) marques[liste[k]] &= 0xFD;
      const b = reglage.brouillard && voileCpu ? brouillardListe : null;
      if (b) { b.voile = voileCpu; b.nx = voileGeo.nx; b.nz = voileGeo.nz; b.x0 = voileGeo.x0; b.z0 = voileGeo.z0; b.cellule = voileGeo.cellule; b.joueur = reglage.joueur; b.allie = reglage.allie; }
      image.largeur = gl.drawingBufferWidth || 1; image.hauteur = gl.drawingBufferHeight || 1;
      listeur.lister(cour, nCour, derniereVue, image, { seuil, brouillard: b });
      for (let k = 0; k < r.total; k++) marques[liste[k]] |= 2;
      marquesSales = true; lignesMarques = Math.max(lignesMarques, (Math.max(nCour, nPrec) + LARGEUR - 1) >>> 10);
      if (res && r.total) { gl.bindBuffer(gl.ARRAY_BUFFER, res.instances); gl.bufferSubData(gl.ARRAY_BUFFER, 0, liste, 0, r.total); gl.bindBuffer(gl.ARRAY_BUFFER, null); }
      const p = derniereVue.pos;
      vueListe.x = p[0]; vueListe.y = p[1]; vueListe.z = p[2]; vueListe.yaw = derniereVue.yaw || 0; vueListe.pitch = derniereVue.pitch || 0;
      listeFaite = maintenant;
      mesure.proches = r.total; mesure.candidats = r.candidats; mesure.seuil = r.seuil; mesure.listeMs = performance.now() - t0;
    }

    function recevoir(f32, n, gait) {
      n = Math.max(0, Math.min(CAPACITE, n | 0, (f32.length / 4) | 0));
      const t0 = performance.now();
      const tmp = prec; prec = cour; cour = tmp; nPrec = nCour; nCour = n;
      cour.set(n === f32.length / 4 ? f32 : f32.subarray(0, n * 4));
      distanceGait=!!(gait&&gait.length>=n*4);if(distanceGait)locomotion.set(gait.subarray(0,n*4));
      if (tRecu >= 0) intervalle += (Math.max(8, Math.min(250, t0 - tRecu)) - intervalle) * .25;
      tRecu = t0;
      if (pret()) { gpuCour = 1 - gpuCour; envoyerEtat(cour, nCour, gpuCour);envoyerLocomotion(); }
      mesure.n = n; mesure.envoiMs = performance.now() - t0;
      refaireListe(t0);
    }

    function regler(o = {}) {
      if (o.joueur !== undefined) reglage.joueur = o.joueur | 0;
      if (o.allie !== undefined) reglage.allie = o.allie === null ? -1 : o.allie | 0;
      if (o.brouillard !== undefined) reglage.brouillard = !!o.brouillard;
      if (o.seuil) seuil = Math.max(1, +o.seuil);
      listeFaite = -1e9;
    }

    function voile(u8, geo) {
      if (!u8 || !geo) { voileCpu = null; voileGeo = null; api.fxVoile = null; return; }
      if (!voileCpu || voileCpu.length !== u8.length) voileCpu = new Uint8Array(u8.length);
      voileCpu.set(u8); voileGeo = { nx: geo.nx | 0, nz: geo.nz | 0, x0: +geo.x0, z0: +geo.z0, cellule: +geo.cellule || 8 };
      const largeur = voileGeo.nx * voileGeo.cellule, profondeur = voileGeo.nz * voileGeo.cellule;
      zoneVoile.set([voileGeo.x0, voileGeo.z0, 1 / largeur, 1 / profondeur]);
      if (pret()) envoyerVoile();
      if (!api.fxVoile) api.fxVoile = { texture: null, origine: [0, 0], taille: [1, 1], force: .62 };
      const fv = api.fxVoile;
      fv.texture = res ? res.voile : null; fv.origine[0] = voileGeo.x0; fv.origine[1] = voileGeo.z0; fv.taille[0] = largeur; fv.taille[1] = profondeur;
    }

    function selectionner(ids, n) {
      n = n === undefined ? ids.length : Math.min(n, ids.length);
      for (let k = 0; k < nSelection; k++) marques[selection[k]] &= 0xFE;
      nSelection = 0;
      for (let k = 0; k < n; k++) {
        const i = ids[k] | 0;
        if (i < 0 || i >= CAPACITE || (marques[i] & 1)) continue;
        marques[i] |= 1; selection[nSelection++] = i;
      }
      marquesSales = true; lignesMarques = LIGNES;
    }

    function cadre(vue, t, alphaImpose) {
      temps = t || 0;
      derniereVue = vue;
      const maintenant = performance.now();
      alpha = alphaImpose === undefined || alphaImpose === null
        ? (tRecu < 0 ? 1 : Math.max(0, Math.min(1, (maintenant - tRecu) / intervalle))) : Math.max(0, Math.min(1, alphaImpose));
      if (!pret()) return api.fx;
      // Une caméra qui a beaucoup bougé depuis la dernière liste la fait refaire sans attendre l'état suivant.
      if (nCour && maintenant - listeFaite > 30) {
        const p = vue.pos, D = Math.max(20, p[1]);
        const bouge = Math.hypot(p[0] - vueListe.x, p[2] - vueListe.z) > D * .08 || Math.abs(p[1] - vueListe.y) > D * .06
          || Math.abs((vue.yaw || 0) - vueListe.yaw) > .05 || Math.abs((vue.pitch || 0) - vueListe.pitch) > .03;
        if (bouge || maintenant - listeFaite > 400) refaireListe(maintenant);
      }
      if (marquesSales && lignesMarques) {
        lierEnvoi(res.marques);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LARGEUR, Math.min(LIGNES, lignesMarques), gl.RED_INTEGER, gl.UNSIGNED_BYTE, marques, 0);
        finEnvoi();
        marquesSales = false; lignesMarques = (Math.max(nCour, nPrec) + LARGEUR - 1) >>> 10;
      }
      if (api.fxVoile) api.fxVoile.texture = res.voile;
      return api.fx;
    }

    // Textures sur les unités 5 à 9 : le moteur garde l'atlas d'ombre sur la 2 et le voile du monde sur la 4.
    function lierCommun(u, vp) {
      gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,res.locomotion);gl.uniform1i(u.uLocomotion,10);gl.uniform1f(u.uDistanceGait,distanceGait?1:0);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, res.etats[gpuCour]);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, res.etats[1 - gpuCour]);
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, res.marques);
      gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, res.voile);
      gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, res.sol);
      gl.uniform1i(u.uCour, 5); gl.uniform1i(u.uPrec, 6); gl.uniform1i(u.uMarques, 7); gl.uniform1i(u.uVoileF, 8); gl.uniform1i(u.uSol, 9);
      gl.uniform4fv(u.uVoileZoneF, zoneVoile); gl.uniform4fv(u.uSolZone, zoneSol);
      gl.uniform4f(u.uReglages, alpha, temps, reglage.brouillard && voileCpu ? 1 : 0, 1000 / intervalle);
      gl.uniform4i(u.uCamps, reglage.joueur, reglage.allie, nPrec, nCour);
      gl.uniform3fv(u.uFactions, couleursCamps); gl.uniformMatrix4fv(u.uVP, false, vp);
    }
    function dessinerFigurines() {
      const r = listeur.resultat, plages = maillages.plages;
      gl.bindVertexArray(res.vao); gl.bindBuffer(gl.ARRAY_BUFFER, res.instances);
      let appels = 0, triangles = 0;
      for (let s = 0; s < SEAUX; s++) {
        const nombre = r.compte[s];
        if (!nombre) continue;
        gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_INT, 4, r.debut[s] * 4);
        const p = plages[s];
        gl.drawElementsInstanced(gl.TRIANGLES, p.compte, gl.UNSIGNED_INT, p.premier * 4, nombre);
        appels++; triangles += p.compte / 3 * nombre;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      compteRendu.appels = appels; compteRendu.triangles = triangles; compteRendu.instances = r.total;
      return compteRendu;
    }

    const fx = {
      /** Passe d'ombre du soleil : cadre de l'atlas déjà lié, biais du moteur actif. */
      ombre(gl2, lumiere) {
        if (!res || !nCour || !listeur.resultat.total) return null;
        gl.useProgram(res.ombre);
        lierCommun(res.uOmb, lumiere.matrice);
        gl.enable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST);
        const r = dessinerFigurines();
        gl.bindVertexArray(null);
        return r;
      },
      /** Passe couleur, dans la cible du moteur (MSAA) : figurines puis points. */
      couleur(gl2, vue) {
        if (!res || !nCour) { mesure.appels = mesure.triangles = mesure.pointsDessines = 0; return null; }
        gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
        let appels = 0, triangles = 0, instances = 0;
        if (listeur.resultat.total) {
          gl.useProgram(res.figurine);
          lierCommun(res.uFig, vue.vp); res.eclairerFig(vue);
          const r = dessinerFigurines();
          appels += r.appels; triangles += r.triangles; instances += r.instances;
        }
        gl.useProgram(res.points);
        lierCommun(res.uPts, vue.vp); res.eclairerPts(vue);
        gl.uniform4f(res.uPts.uPoints, vue.focale, 1.6, tailleMax, 0);
        gl.uniform3fv(res.uPts.uOeilF, vue.oeil); gl.uniform3fv(res.uPts.uDroiteF, vue.droite);
        gl.bindVertexArray(res.vaoPoints);
        gl.drawArrays(gl.POINTS, 0, nCour);
        gl.bindVertexArray(null);
        appels++; instances += nCour - listeur.resultat.total;
        mesure.appels = appels; mesure.triangles = triangles; mesure.pointsDessines = nCour - listeur.resultat.total;
        compteRendu.appels = appels; compteRendu.triangles = triangles; compteRendu.instances = instances;
        return compteRendu;
      },
    };

    function liberer() {
      if (!res) return;
      for (const p of [res.figurine, res.ombre, res.points]) gl.deleteProgram(p);
      for (const b of [res.vbo, res.ibo, res.instances]) gl.deleteBuffer(b);
      for (const t of [res.etats[0], res.etats[1], res.marques, res.voile, res.sol, res.locomotion]) gl.deleteTexture(t);
      gl.deleteVertexArray(res.vao); gl.deleteVertexArray(res.vaoPoints);
      res = null;
    }

    const api = {
      recevoir, regler, voile, selectionner, cadre, liberer, fx, fxVoile: null, mesure,
      get etat() { return { cour, prec, n: nCour, nPrec, alpha }; },
      get selection() { return nSelection; },
      listeur, maillages, ECHELLE,
    };
    pret();
    return api;
  }

  PDR.foule = Object.freeze({ rules:PDR.regles,webgpuPrograms:options.webgpuPrograms,customShaders:!!options.shaders,creerFoule, construireMaillages, creerListeur, decoder, axesCamera, HAUTEURS, OS, TEINTE, MATIERE,
    ECHELLE, CAPACITE, LARGEUR, SEUIL_DETAIL, SOMMET,
    shaderSources(glsl){const vs=FIGURINE_VS.replace('/*COMMUN*/',COMMUN),ps=POINT_VS.replace('/*COMMUN*/',COMMUN);return {
      crowd:{vertex:vs,fragment:FIGURINE_FS.replace('/*PDR*/',glsl)},
      crowdShadow:{vertex:vs.replace('precision highp int;','precision highp int;\n#define OMBRE 1'),fragment:OMBRE_FS},
      crowdPoint:{vertex:ps,fragment:POINT_FS.replace('/*PDR*/',glsl)},
      // WebGPU has no programmable point size. Expand the same procedural
      // impostor to a six-vertex screen-space quad; retain its fragment shape.
      crowdPointGPU:{vertex:ps.replace('out vec3 vMonde;', 'uniform vec2 uPointResolution;\nout vec2 vPointCoord;\nout vec3 vMonde;')
        .replace('lireUnite(gl_VertexID)','lireUnite(gl_InstanceID)')
        .replace('gl_PointSize=1.;','vPointCoord=vec2(0.);')
        .replace('gl_PointSize=taille;', 'const vec2 corners[6]=vec2[6](vec2(-1.,-1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(1.,1.));vec2 corner=corners[gl_VertexID];vPointCoord=corner*.5+.5;gl_Position.xy+=vec2(corner.x,-corner.y)*taille/uPointResolution*clip.w;'),
        fragment:POINT_FS.replace('/*PDR*/',glsl).replace('in vec3 vMonde;', 'in vec2 vPointCoord;\nin vec3 vMonde;').replace('gl_PointCoord','vPointCoord')}
    };} });
return PDR.foule;
}
G.FCrowd=Object.freeze({createProfile});
})(globalThis);
