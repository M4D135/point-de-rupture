/* METAL: original procedural audio. No imported recordings or external assets. */
(function (window) {
  'use strict';
  var materials = {
    metal: {duration:.28,cut:3600,grain:.026,noise:.32,modes:[[393,.17,.34],[711,.11,.22],[1173,.085,.18],[1937,.055,.10],[3181,.035,.06]]},
    stone: {duration:.18,cut:2300,grain:.022,noise:.92,modes:[[241,.023,.23],[517,.015,.12],[1103,.010,.06]]},
    wood: {duration:.17,cut:1700,grain:.016,noise:.58,modes:[[183,.045,.37],[419,.025,.21],[937,.012,.10]]},
    glass: {duration:.32,cut:6500,grain:.010,noise:.24,modes:[[2137,.095,.28],[3371,.073,.26],[5219,.051,.20],[7411,.033,.13]]},
    dirt: {duration:.15,cut:1100,grain:.031,noise:1.05,modes:[]}
  };
  var effectNames = ['pistol','smg','shotgun','rocket','grenade','explosion','steam','body','swish','click'];
  Object.keys(materials).forEach(function (m) { ['impact','break','land','step'].forEach(function (a) { effectNames.push(a+':'+m); }); });
  ['fan','piston','reactor','lift'].forEach(function (m) { effectNames.push('motor:'+m); });

  // Original PCM, generated once before play. Short noise
  // impulses excite damped, inharmonic material modes. These are not pitch
  // sweeps; every shot contains its crack, body and mechanical action in one
  // voice. Two seeded variants avoid identical automatic-fire transients.
  // The pure renderer is exposed for offline waveform/peak/duration checks.
  // LOAD-13: the renderer is resumable. step(n) advances n samples and keeps
  // the filter state, so warmBank can slice a heavy effect across loading
  // frames without changing one sample; synthesize runs the same renderer to
  // its end and therefore returns exactly the same Float32Array.
  function synthJob(name, variant, sampleRate) {
    var exp=Math.exp,sin=Math.sin,abs=Math.abs,max=Math.max,min=Math.min,PI=Math.PI;
    var rate = max(8000,min(48000,Number(sampleRate)||22050)), split=name.split(':'), action=split[0], material=materials[split[1]], motor=action==='motor';
    if (effectNames.indexOf(name)<0) throw new Error('Unknown procedural sound: '+name);
    var seed = (0x42a39f ^ Math.imul((variant|0)+1,0x9e3779b9))>>>0;
    for (var h=0;h<name.length;h++) seed=(Math.imul(seed,33)^name.charCodeAt(h))>>>0;
    function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    var tune=.975+rand()*.05, duration=motor?.8:material?(action==='break'?material.duration+(.33+(split[1]==='glass'?.10:0)):action==='step'?.17:action==='land'?material.duration+.07:material.duration):({pistol:.165,smg:.105,shotgun:.32,rocket:.41,grenade:.29,explosion:.86,steam:.36,body:.16,swish:.14,click:.07}[name]);
    var out=new Float32Array(Math.ceil(duration*rate)), low=0, soft=0, previous=0, highpass=0, peak=0;
    var cutoff=material?material.cut:motor?1800:1900, alpha=1-exp(-2*PI*min(rate*.35,cutoff)/rate), slow=1-exp(-2*PI*460/rate);
    var starts=[0], weights=[1];
    if(material&&(action==='break'||action==='land')){
      var count=action==='break'?7:3;
      for(var b=1;b<count;b++){starts.push(action==='land'?b*.052+rand()*.009:[0,.022,.054,.096,.16,.25,.38][b]+rand()*.012);weights.push((action==='land'?.32:.64)*exp(-b*(action==='land'?.5:.24)));}
    }
    var i=0, sealed=false;
    return {
      total: out.length,
      step: function (count) {
        var end=min(out.length,i+(count>0?count:out.length));
        for(;i<end;i++){
      var t=i/rate,white=rand()*2-1;low+=alpha*(white-low);soft+=slow*(white-soft);
      var bright=white-low,band=low-soft,x=0,u,j;
      if(material){
        for(var k=0;k<starts.length;k++){
          u=t-starts[k];if(u<0)continue;
          var decay=action==='step'?.019:material.grain, color=split[1]==='glass'?bright*.75+band:split[1]==='dirt'?soft*.7+band*.7:low;
          x+=weights[k]*material.noise*color*exp(-u/decay);
          for(j=0;j<material.modes.length;j++){
            var mode=material.modes[j],frequency=min(rate*.4,mode[0]*tune*(action==='step'?.82:1));
            x+=weights[k]*mode[2]*(action==='step'?.24:1)*sin(2*PI*frequency*u)*exp(-u/(mode[1]*(action==='step'?.42:1)));
          }
          if(action==='break')x+=weights[k]*band*.27*exp(-u/.050);
        }
        if(action==='step')x+=.38*sin(2*PI*128*t)*exp(-t/.017)+soft*.6*exp(-max(0,t-.035)/.023)*(t>.035?1:0);
      }else if(motor){
        // Only a real nearby machine opens these gains. Filtered friction and
        // cyclic load give a location, without the old room-wide bass chord.
        var cycle=t/.8,kind=split[1];
        if(kind==='fan')x=band*(.38+.08*sin(2*PI*8*cycle))+soft*.10;
        else if(kind==='piston'){u=t%.4;x=(band*.65+soft*.45)*exp(-u/.075)+.10*sin(2*PI*152.5*t)*exp(-u/.045);}
        else if(kind==='reactor')x=band*(.26+.14*Math.pow(sin(2*PI*19*cycle),2))+soft*.11;
        else x=band*.30+soft*.19+.035*sin(2*PI*237.5*t)*(1+.3*sin(2*PI*7*cycle));
      }else if(name==='pistol'||name==='smg'||name==='shotgun'){
        var pistol=name==='pistol',shotgun=name==='shotgun',body=pistol?166:shotgun?119:205,tail=pistol?.025:shotgun?.052:.017;
        x=(bright*.70+band*.7)*exp(-t/(shotgun?.013:pistol?.006:.0045));
        x+=(soft*1.7+.30*sin(2*PI*body*t*tune))*exp(-t/tail);
        if(shotgun)for(j=1;j<4;j++){u=t-j*.0027;if(u>=0)x+=.25*bright*exp(-u/.006);}
        u=t-(shotgun?.18:pistol?.044:.025);
        if(u>=0)x+=(band*.34+.07*sin(2*PI*(shotgun?613:1287)*u))*exp(-u/(shotgun?.023:.006));
      }else if(name==='rocket'){
        x=(band*.92+soft*.45)*(1-exp(-t/.004))*exp(-t/.108)+bright*.45*exp(-t/.004);
        x+=.16*sin(2*PI*132*t)*exp(-t/.037);
      }else if(name==='grenade'){
        x=(soft*1.4+band*.45)*exp(-t/.043)+.46*sin(2*PI*109*t)*exp(-t/.041);
        x+=.20*sin(2*PI*317*t)*exp(-t/.026)+bright*.5*exp(-t/.004);
        u=t-.065;if(u>=0)x+=(band*.38+.08*sin(2*PI*947*u))*exp(-u/.012);
      }else if(name==='explosion'){
        x=bright*.9*exp(-t/.007)+soft*2.7*exp(-t/.115)+band*.7*exp(-t/.17);
        x+=.24*sin(2*PI*96*t)*exp(-t/.052);
        for(j=1;j<5;j++){u=t-[0,.064,.15,.28,.43][j];if(u>=0)x+=band*(.24/j)*exp(-u/.033);}
      }else if(name==='steam')x=(band*.65+bright*.25)*(1-exp(-t/.002))*exp(-t/.075)+soft*.18*exp(-t/.018);
      else if(name==='body')x=(soft*1.2+.20*sin(2*PI*142*t))*exp(-t/.026)+band*.15*exp(-t/.009);
      else if(name==='swish')x=band*Math.pow(sin(PI*t/duration),2)*.7;
      else x=(band*.8+bright*.3+.11*sin(2*PI*731*t))*exp(-t/.008);
      // Remove DC/subsonic drift, make both ends exactly zero, preserve the
      // natural crest factor. No clipping/normalization runs during combat.
      highpass=.991*(highpass+x-previous);previous=x;
      var fade=min(1,t/(motor?.006:.00045),(duration-t)/.009);out[i]=highpass*max(0,fade);peak=max(peak,abs(out[i]));
        }
        return i>=out.length;
      },
      // Same normalization as the synchronous path, applied once, after the
      // last sample: crest factor and both zero ends are unchanged.
      seal: function () {
        if(sealed)return out; sealed=true;
        var normal=peak>0?.84/peak:0;
        for(var k=0;k<out.length;k++)out[k]*=normal;
        out[0]=0;out[out.length-1]=0;return out;
      }
    };
  }
  function synthesize(name, variant, sampleRate) { var job=synthJob(name,variant,sampleRate); job.step(0); return job.seal(); }
  // FEEL-06 / MIX-01: parametric layered report for a game's recipe table.
  // Crack [gain, ms], pitched thump {f0,f1,tp,ta,g}, saturated two-pole noise
  // body {cut,tb,g,drive}, mechanism clicks [[s,gain,Hz]], short room {tr,g},
  // then a rate-aware 25 Hz DC blocker and gentle density saturation. Every
  // number comes from the game; this knows no weapon. Seeded by name+variant.
  var ROOM_TAPS=[[.011,.34],[.017,.27],[.023,.21],[.031,.15],[.043,.10]];
  // Resumable form of the layered report, same interface as synthJob: {total,
  // step(count), seal()}. A game recipe built by FAudio.recipe is therefore
  // cuttable like an engine effect, so LOAD-13 can bound it inside the slice.
  // The sample loop, the LCG and the normalization are byte for byte those of
  // the one-shot layered() below: step(64) four times seals the same
  // Float32Array as step(0).
  function layeredJob(name,spec,variant,sampleRate){
    var exp=Math.exp,sin=Math.sin,tanh=Math.tanh,min=Math.min,PI=Math.PI,s=spec||{},key=String(name);
    var rate=Math.max(8000,min(48000,Number(sampleRate)||22050)),seed=(0x5eed^Math.imul((variant|0)+1,0x9e3779b9))>>>0;
    for(var h=0;h<key.length;h++)seed=(Math.imul(seed,33)^key.charCodeAt(h))>>>0;
    function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;}
    function one(f){return 1-exp(-2*PI*f/rate);}
    var n=Math.max(0,Math.ceil(Number(s.dur)*rate))||0,out=new Float32Array(n),tune=1+(rnd()*.03);
    var c=s.crack,th=s.thump,b=s.body,room=s.room,mech=[],taps=[],hist=room?new Float32Array(n):null,i=0,k,m,u,sealed=false;
    (s.mech||[]).forEach(function(q){mech.push([q[0],q[1],q[2],one(q[2]*1.4),one(q[2]*.7)]);});
    if(room)ROOM_TAPS.forEach(function(q){taps.push([Math.round(q[0]*rate),q[1]]);});
    var crackPole=one(2500),crackTau=c?c[1]/1000:1,bodyPole=b?one(b.cut):0,bodyNorm=b?tanh(b.drive):1,roomPole=one(900),dcR=exp(-2*PI*25/rate),density=tanh(1.25);
    var hp=0,phase=0,lp1=0,lp2=0,bandA=0,bandB=0,roomLp=0,dcx=0,dcy=0;
    return {
      total: n,
      step: function (count) {
        var end=min(n,i+(count>0?count:n));
        for(;i<end;i++){
      var t=i/rate,w=rnd(),x=0,clicks=0;
      if(c){hp+=crackPole*(w-hp);x=(w-hp)*c[0]*exp(-t/crackTau);}
      if(th){phase+=2*PI*((th.f1+(th.f0-th.f1)*exp(-t/th.tp))*tune)/rate;x+=sin(phase)*th.g*min(1,t/.0006)*exp(-t/th.ta);}
      if(b){lp1+=bodyPole*(w-lp1);lp2+=bodyPole*(lp1-lp2);x+=tanh(lp2*3.2*b.g*exp(-t/b.tb)*b.drive)/bodyNorm;}
      for(k=0;k<mech.length;k++){m=mech[k];u=t-m[0];if(u>=0&&u<.06){bandA+=m[3]*(w-bandA);bandB+=m[4]*(bandA-bandB);clicks+=((bandA-bandB)*2.2*exp(-u/.004)+.35*sin(2*PI*m[2]*u)*exp(-u/.011))*m[1];}}
      x+=clicks;
      if(room){hist[i]=x;for(k=0;k<taps.length;k++)if(i>=taps[k][0])x+=hist[i-taps[k][0]]*taps[k][1]*room.g*2.2;roomLp+=roomPole*(w-roomLp);x+=roomLp*room.g*1.6*exp(-t/room.tr)*min(1,t/.012);}
      dcy=x-dcx+dcR*dcy;dcx=x;out[i]=tanh(dcy*1.25)/density;
        }
        return i>=n;
      },
      seal: function () {
        if(sealed)return out; sealed=true;
        var fade=Math.round((Number.isFinite(s.fade)?s.fade:.012)*rate),peak=0,j;
        for(j=0;j<fade&&j<n;j++)out[n-1-j]*=j/fade;
        for(j=0;j<n;j++)peak=Math.max(peak,Math.abs(out[j]));
        var gain=peak>0?.84/peak:0;for(j=0;j<n;j++)out[j]*=gain;
        if(n){out[0]=0;out[n-1]=0;}return out;
      }
    };
  }
  function layered(name,spec,variant,sampleRate){var job=layeredJob(name,spec,variant,sampleRate);job.step(0);return job.seal();}
  // A recipe table only replaces built-in names. Output that throws, is empty
  // or not finite falls back to the v0.2 recipe: without a table, PCM is v0.2.
  function tablePCM(recipes,name,variant,sampleRate){
    var r=recipes&&effectNames.indexOf(name)>=0&&Object.prototype.hasOwnProperty.call(recipes,name)?recipes[name]:null,data=null;
    if(!r||typeof r.synth!=='function')return null;
    try{data=r.synth(variant|0,Math.max(8000,Math.min(48000,Number(sampleRate)||22050)));}catch(_){return null;}
    if(!data||!(data.length>0))return null;
    for(var i=0;i<data.length;i++)if(!Number.isFinite(data[i]))return null;
    return data;
  }
  // MIX-02 : le rattrapage automatique du DynamicsCompressor de Chromium. Le
  // nœud remonte tout de (1/courbe(0 dBFS))^0,6, un gain que le code ne nomme
  // jamais et qui change dès qu'on touche au seuil, au genou ou au ratio. La
  // courbe de genou est T + (1 - e^(-k(x-T)))/k, k trouvé par 15 bissections
  // géométriques entre 0,1 et 10 000 pour que la pente en dB prise entre x et
  // 1,001x à l'entrée du genou vaille 1/ratio. Reproduit au centième les quatre
  // couples rendus par le banc (job=calib) : 3,731 / 4,547 / 2,557 / 3,531 dB.
  function makeupDb(threshold, knee, ratio) {
    var t = Number(threshold); if (!Number.isFinite(t)) t = 0;
    var g = Math.max(0, Number(knee) || 0), r = Math.max(1, Number(ratio) || 1);
    var T = Math.pow(10, t / 20), xk = Math.pow(10, (t + g) / 20), LOG1001 = Math.log(1.001);
    function curve(x, k) { return x < T ? x : T + (1 - Math.exp(-k * (x - T))) / k; }
    function slope(k) { return Math.log(curve(1.001 * xk, k) / curve(xk, k)) / LOG1001; }
    var target = 1 / r, lo = 0.1, hi = 10000, i, k;
    for (i = 0; i < 15; i++) { k = Math.sqrt(lo * hi); if (slope(k) > target) lo = k; else hi = k; }
    k = Math.sqrt(lo * hi);
    var y1 = t + g > 0 ? curve(1, k) : Math.pow(10, (20 * Math.log10(curve(xk, k)) - (t + g) / r) / 20);
    return -0.6 * 20 * Math.log10(y1);
  }
  // Le rattrapage de référence : celui de la chaîne v0.2 (-19 / genou 18 / 5:1),
  // seul repère fixe commun aux trois jeux. level:'fixe' ramène le niveau des
  // sons faibles à ce qu'il était avec cette chaîne-là.
  var MAKEUP_REFERENCE = makeupDb(-19, 18, 5);
  window.FAudio = {
    synthesize: function (name, variant, sampleRate, recipes) { return tablePCM(recipes,name,variant,sampleRate)||synthesize(name,variant,sampleRate); },
    recipe: function (name, spec) { return {variants:spec&&spec.variants===1?1:2,synth:function(variant,rate){return layered(name,spec,variant,rate);},job:function(variant,rate){return layeredJob(name,spec,variant,rate);}}; },
    effectNames: effectNames.slice(),
    makeupDb: makeupDb,
    create: function (options) {
      options=options||{};
      var recipes = Object.create(null), table = options && options.recipes;
      if (table) Object.keys(table).forEach(function (name) { var r = table[name]; if (r && typeof r.synth === 'function' && effectNames.indexOf(name) >= 0) recipes[name] = {synth: r.synth, job: typeof r.job === 'function' ? r.job : null, variants: r.variants === 1 ? 1 : 2}; });
      // A game may add its own one-shot names (confirmations, stings). They are
      // prepared with the bank, never during play, and never touch an engine
      // effect name: without them the bank is the built-in one, bit for bit.
      var extras = Object.create(null), extraTable = options && options.extras;
      if (extraTable) Object.keys(extraTable).sort().forEach(function (name) { var r = extraTable[name]; if (r && typeof r.synth === 'function' && name && effectNames.indexOf(name) < 0 && name.indexOf('motor:') !== 0 && name.indexOf(':') < 0) extras[name] = {synth: r.synth, job: typeof r.job === 'function' ? r.job : null, variants: r.variants === 1 ? 1 : 2}; });
      var extraNames = Object.keys(extras);
      // MIX-11: a bench may hand the engine an OfflineAudioContext so the whole
      // mix renders offline, deterministically, with no device and no clock. An
      // injected context is never opened, resumed nor closed by the engine; it
      // reports 'suspended' while rendering, so it counts as live on its own.
      var injected = options && options.context && typeof options.context.createGain === 'function' ? options.context : null;
      var offline = !!(injected && typeof injected.startRendering === 'function');
      // MIX-02 : la chaîne maître peut être réglée par le jeu. Sans option, les
      // valeurs et le comportement d'aujourd'hui, au bit près. Avec
      // chain:{masterGain, compressor:{threshold,knee,ratio,attack,release},
      // level:'auto'|'fixe'}, level:'fixe' ajoute un GainNode APRÈS le
      // compresseur et AVANT l'écrêteur — jamais sur master.gain, qui est avant
      // le compresseur et déplacerait son point de travail.
      // MIX-V1 : les tenues du duck deviennent une classe par famille de cues,
      // avec sa profondeur et son maintien. Sans l'option, rien ne change : les
      // trois expressions régulières et la table de maintien d'aujourd'hui. Un
      // jeu qui la donne remplace, pour les cues qu'elle nomme, la profondeur
      // et/ou le maintien ; fixed:true ignore le niveau du son (cueLevel).
      var duckClasses = null;
      if (options && options.duck && Array.isArray(options.duck.classes)) {
        duckClasses = [];
        options.duck.classes.forEach(function (c) {
          if (!c) return;
          var re = c.cues instanceof RegExp ? c.cues : c.cues && c.cues.length
            ? new RegExp('^(?:' + [].concat(c.cues).join('|') + ')$') : null;
          if (!re) return;
          duckClasses.push({re: re, depth: Number.isFinite(c.depth) ? c.depth : null,
            hold: Number.isFinite(c.hold) ? c.hold : null, fixed: !!c.fixed});
        });
        if (!duckClasses.length) duckClasses = null;
      }
      // MIX-04 : un jeu releve le niveau de ses propres rapports d'armes (option
      // weaponGain), jamais ceux des ennemis ni les autres effets : la table n'est
      // lue que dans les cues du joueur. Sans option, le multiplicateur vaut
      // exactement 1 et le rendu reste identique bit a bit.
      var voiceGain = options && options.weaponGain ? options.weaponGain : null;
      function wg(name) { return voiceGain && Number.isFinite(voiceGain[name]) ? voiceGain[name] : 1; }
      var chain = options && options.chain ? options.chain : null;
      var chainComp = chain && chain.compressor ? chain.compressor : null;
      var chainFixed = !!(chain && chain.level === 'fixe');
      var MASTER_GAIN = chain && Number.isFinite(chain.masterGain) ? chain.masterGain : .65;
      function chainValue(key, fallback) { return chainComp && Number.isFinite(chainComp[key]) ? chainComp[key] : fallback; }
      var ctx = null, master, limiter, guard, chainMakeup, effects, ambience, musicBus, airFilter, airVolume, echoSend, noiseBuffer, steamLevel, steamPan, steamFilter, hiss, air;
      var muted = false, disposed = false, failed = false, threat = 0, pressure = 0, stage = 0, musicCue = '';
      var lastStep = -1, stepSide = 1, lastAlert = -1, lastTouch = -1, touchRun = 0;
      var environment = {}, outside = 0, machinery = 0, machineSide = 0, machineKind = 'lift', machineOccluded = 0, steam = 0, steamSide = 0, steamOccluded = 0, music = null, playing = false, titlePlaying = false;
      var bank = Object.create(null), motors = [], ambientDuckUntil = 0, variation = 0, warming = null, warmTimer = null, warmResolve = null;
      var mix = {master:1,music:.45,effects:1,ambience:1};
      var persistent = [], voices = new Set(), noiseSeed = 0x96f3, fxLast = Object.create(null), targets = new WeakMap();
      // MIX-10 : la graine du morceau, donnee par le jeu, varie la boucle. Sans
      // elle (aucun setStage avec graine), FMusic recoit undefined et joue
      // l'arrangement ecrit, octet pour octet comme avant.
      var musicSeed, priority = 2, cue = '', cueLevel = 1, cueDucked = false, duckUntil = 0, duckDepth = 1, preview = null, previewSerial = 0, api;
      var MUSIC_GAIN = .56, EFFECTS_GAIN = .9, AMBIENCE_GAIN = .7;
      // FEEL-07: how long each weapon cue holds the soundtrack down before the
      // 180 ms release. The heavy reports (pump shell, rocket, grenade) hold
      // 220 ms, the SMG burst only 180 ms, so automatic fire lets the music
      // back between rounds instead of burying it for a whole magazine.
      var DUCK_HOLD = {fracture: .22, rocket: .22, grenade: .22, grenadeLaunch: .22, shot: .18};
      var stats = {musicCue:'',idle:false,voices:0,peakVoices:0,fxSkipped:0,stolenVoices:0,duckGain:MUSIC_GAIN,preview:false,titlePlaying:false,outputCeiling:1,makeupDb:0,pcmBuffers:0,pcmBytes:0,pcmReady:false,windGain:0,machineryGain:0,steamGain:0};
      Object.defineProperty(stats, "activeCues", {enumerable:true,get:function(){var result={};voices.forEach(function(v){result[v.cue]=(result[v.cue]||0)+1;});return result;}});
      function remember(node) { persistent.push(node); return node; }
      function random() {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) | 0;
        return (noiseSeed >>> 0) / 4294967296;
      }
      function clean(entry) {
        entry.nodes.forEach(function (n) { try { n.disconnect(); } catch (_) {} });
        voices.delete(entry);
        stats.voices = voices.size;
      }
      function track(source, nodes, level) {
        var entry = { source: source, nodes: nodes, cue:cue, priority:priority, level:level || 0, preview:preview && preview.id };
        voices.add(entry);
        stats.voices = voices.size; stats.peakVoices = Math.max(stats.peakVoices, voices.size);
        source.onended = function () { clean(entry); };
      }
      function live() {
        // An offline context stays 'suspended' until startRendering() and has no
        // clock to wait for: for the engine it is live from the first call.
        return !!ctx && (offline || ctx.state === 'running');
      }
      function available() {
        return ctx && !disposed && (!muted || preview) && live();
      }
      function reserve(level, bus) {
        if (!available() || titlePlaying && !preview || level <= .0001 || (bus === ambience ? mix.ambience : mix.effects) <= 0) return false;
        // Distant enemies get 32 voices, world interactions 40. The remaining
        // eight slots belong to the player and urgent warnings. A loud nearby
        // cue may replace a quieter lower-priority voice, never the MOD bus.
        var limit = priority < 2 ? 32 : priority === 2 ? 40 : 48;
        if (voices.size >= limit) {
          var candidate = null;
          voices.forEach(function (v) { if (v.priority < priority && (!candidate || v.priority < candidate.priority || v.priority === candidate.priority && v.level < candidate.level)) candidate = v; });
          if (!candidate) { stats.fxSkipped++; return false; }
          try { candidate.source.stop(ctx.currentTime); } catch (_) {}
          clean(candidate); stats.stolenVoices++;
        }
        return true;
      }
      function duckMusic() {
        if (cueDucked || !musicBus || !cue || mix.effects <= 0) return;
        var weapon = /^(shot|fracture|rocket|grenade|grenadeLaunch|melee|hurt)$/.test(cue);
        var strength = weapon ? .35 : /^(boss|horror|metallic|powerCut|alarm|explosion)/.test(cue) ? .38 : /^(empty|weaponPickup|trophy|wave|core|mechanism)$/.test(cue) ? .68 : 1, duckClass = null;
        // MIX-V1 : une classe qui nomme ce cue prend la main sur la profondeur et
        // sur le maintien. Sans l'option duck.classes, duckClass reste nul et le
        // calcul ci-dessous est exactement celui d'aujourd'hui.
        if (duckClasses) for (var di = 0; di < duckClasses.length; di++) if (duckClasses[di].re.test(cue)) { duckClass = duckClasses[di]; break; }
        if (duckClass && duckClass.depth !== null) strength = duckClass.depth;
        if (strength === 1) return;
        // MIX-V2 : un duck de 6,9 dB pour des tirs a 20 % de volume est une perte
        // sèche. La profondeur suit le volume des effets, et a 1 (le defaut) le
        // facteur vaut exactement 1 : le rendu reste identique bit a bit.
        strength = 1 - (1-strength) * (duckClass && duckClass.fixed ? 1 : Math.min(1,Math.max(0,cueLevel)*1.25)) * Math.min(1,mix.effects);
        cueDucked = true;
        var now = ctx.currentTime, hold = DUCK_HOLD[cue] || (weapon ? .14 : strength < .4 ? .28 : .14);
        if (duckClass && duckClass.hold !== null) hold = duckClass.hold;
        ambientDuckUntil = Math.max(ambientDuckUntil,now+.20);
        duckDepth = now < duckUntil ? Math.min(duckDepth, strength) : strength;
        duckUntil = Math.max(duckUntil, now + hold);
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setTargetAtTime(MUSIC_GAIN * duckDepth, now, .006);
        musicBus.gain.setTargetAtTime(MUSIC_GAIN, duckUntil, .18);
        stats.duckGain = MUSIC_GAIN * duckDepth;
      }
      function updateMaster() {
        if (!ctx || !master || disposed) return;
        var now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(muted && !preview ? 0 : MASTER_GAIN * mix.master, now, .025);
        // An audio-clock cutoff guarantees a two-second menu audition even if
        // the UI thread/timers are throttled. Its JS pump is also cancelled.
        if (preview && muted) {
          master.gain.setValueAtTime(MASTER_GAIN * mix.master, Math.max(now,preview.end-.018));
          master.gain.linearRampToValueAtTime(0, preview.end);
        }
      }
      function syncMusic() {
        stats.titlePlaying = titlePlaying;
        if (!music) return;
        // The title is a score selection, never an environmental stage or a
        // running simulation. Keep stage numeric for wind/room calculations.
        // An in-game event may hold an adaptive piece; the sector theme only
        // returns when that hold is released, never on every frame.
        var wanted = titlePlaying ? 'title' : (musicCue || String(stage));
        if (!musicCue || titlePlaying) music.setStage(wanted, titlePlaying ? undefined : musicSeed);
        music.setThreat(titlePlaying ? 0 : Math.max(threat,pressure*.65));
        music.setPlaying(playing || titlePlaying);
        stats.musicCue = titlePlaying ? '' : musicCue;
      }
      function requestMusic(cue, meta) {
        if (!music || disposed || titlePlaying) return false;
        if (cue === null || cue === undefined || cue === '') { musicCue = ''; syncMusic(); return true; }
        var name = String(cue), info = meta || {};
        if (!window.FMusic || !window.FMusic.isCue || !window.FMusic.isCue(name)) return false;
        var accepted = music.setCue(name, {key: info.key || name, urgent: !!info.urgent, force: !!info.force});
        // The hold is kept even when the director ignores a duplicate: the
        // sector theme must not snap back under a piece already requested.
        musicCue = name;
        stats.musicCue = name;
        // The piece is only reached at the next bar line, so its instruments are
        // uploaded here rather than under the first note that needs them.
        if (accepted && music.prepare) music.prepare(name);
        return accepted;
      }
      function effectEvent(name, value, interval) {
        if (!available()) return null;
        var event = value || {}, level = Math.max(0, Math.min(1, Number.isFinite(event.level) ? event.level : 1));
        var previous = fxLast[name], now = ctx.currentTime;
        // Simultaneous distant blasts share a transient; a much nearer/louder
        // event may still replace it. Music is never counted in this budget.
        if (level < .018 || previous && now - previous.time < interval && level <= previous.level * 1.45) { stats.fxSkipped++; return null; }
        fxLast[name] = {time:now,level:level};
        return {level:level,pan:Math.max(-1,Math.min(1,Number(event.pan)||0)),event:event};
      }
      function handEvent(name,value,interval){
        var hand=value&&value.hand,side=hand==='left'?-.22:hand==='right'?.22:0;
        var event=effectEvent(name+':'+(hand==='left'?'left':hand==='right'?'right':'single'),value,interval);
        if(event)event.pan=Math.max(-1,Math.min(1,event.pan+side));
        return event;
      }
      // LOOP-14 / MIX-08: setTargetAtTime is a memoryless exponential, so the
      // same target and time constant sent again draws the same curve. Strict
      // equality only: a threshold leaves an audible error. Setters still apply
      // at once; this memory absorbs tick's repeat in the same frame. Every
      // automation of the persistent ambience parameters goes through here;
      // master and music buses never do (cancelled, scheduled ahead).
      function approach(param, value, time, tau) {
        var last = targets.get(param);
        if (last && last.value === value && last.tau === tau) return;
        param.setTargetAtTime(value, time, tau);
        if (last) { last.value = value; last.tau = tau; } else targets.set(param, {value: value, tau: tau});
      }
      // MIX-07 : une boucle dont la cible de gain est nulle ne doit pas couter de
      // DSP. On la debranche de son filtre et on la rebranche des que la cible
      // remonte. Le BufferSource continue de tourner : rien n'est arrete, relance
      // ni recalcul en phase, et le gain revient par la meme automatisation.
      var links = new Map();
      function loopLink(source, filter, on) {
        if (!source || !filter) return;
        var linked = links.get(source) !== false;
        if (on === linked) return;
        try { if (on) source.connect(filter); else source.disconnect(filter); } catch (err) {}
        links.set(source, on);
      }
      function updateSteam() {
        if (!ctx || !steamLevel || disposed) return;
        var audible=playing&&available()&&mix.ambience>0,mask=ctx.currentTime<ambientDuckUntil?.55:1;
        stats.steamGain=audible?steam*.055*mask:0;
        approach(steamLevel.gain, stats.steamGain, ctx.currentTime, steam ? .06 : .018);
        loopLink(hiss, steamFilter, stats.steamGain > 0);
        if (steamPan.pan) approach(steamPan.pan, steamSide, ctx.currentTime, .12);
        approach(steamFilter.frequency, 1950-steamOccluded*1250, ctx.currentTime, .12);
      }
      function updateMachinery() {
        if(!ctx||disposed)return;
        var audible=playing&&available()&&mix.ambience>0,mask=ctx.currentTime<ambientDuckUntil?.55:1;
        stats.machineryGain=audible?machinery*.075*mask:0;
        motors.forEach(function(m){
          var target=m.kind===machineKind?stats.machineryGain:0;
          approach(m.gain.gain,target,ctx.currentTime,.055);
          loopLink(m.source,m.filter,target>0);
          if(m.pan.pan)approach(m.pan.pan,machineSide,ctx.currentTime,.09);
          approach(m.filter.frequency,4200-machineOccluded*3400,ctx.currentTime,.12);
        });
      }
      function horrorCue(kind,value) {
        if (!playing) return;
        var event=value||{},intensity=Math.max(0,Math.min(1,Number.isFinite(event.intensity)?event.intensity:.75));
        var e=effectEvent('horror:'+kind,{level:(Number.isFinite(event.level)?event.level:1)*intensity,pan:event.pan},.5);
        if (!e) return; var g=e.level,tier=Math.max(0,Math.min(4,Number(event.tier)||0)),tune=1+tier*.025;
        if (kind==='metallicSlam') {
          pcm('impact:metal',.40*g,e.pan,event,.78);pcm('break:metal',.19*g,e.pan,event,.94);
        } else if (kind==='blackout') {
          pcm('click',.20*g,e.pan,event,.74);pcm('steam',.095*g,e.pan,event,1.3);
        } else if (kind==='alarm') {
          for(var i=0;i<2;i++){tone(340*tune,450*tune,.24,.055*g,'triangle',i*.34,e.pan,1250);tone(680*tune,880*tune,.15,.018*g,'sine',i*.34+.025,e.pan);}
        } else if (kind==='ambush') {
          pcm('impact:stone',.32*g,e.pan,event,.85);pcm('break:metal',.19*g,e.pan,event,1.08);
        }
      }
      function panNode(value) {
        if (ctx.createStereoPanner) {
          var p = ctx.createStereoPanner();
          p.pan.value = Math.max(-1,Math.min(1,Number(value)||0));
          return p;
        }
        return ctx.createGain();
      }
      function tone(frequency, end, duration, level, shape, offset, pan, cutoff, bus) {
        if (!reserve(level,bus)) return;
        duckMusic();
        var t = ctx.currentTime + (offset || 0), o = ctx.createOscillator();
        var g = ctx.createGain(), p = panNode(pan), nodes = [o, g, p];
        o.type = shape || 'sine';
        o.frequency.setValueAtTime(Math.max(1, frequency), t);
        if (end) o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + Math.min(.005, duration / 6));
        g.gain.exponentialRampToValueAtTime(Math.max(.00011,level*.28), t + duration*.46);
        g.gain.exponentialRampToValueAtTime(.0001, t + duration);
        if (cutoff) {
          var f = ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = .65;
          o.connect(f); f.connect(g); nodes.push(f);
        } else o.connect(g);
        g.connect(p); p.connect(bus || effects);
        track(o, nodes, level);
        o.start(t); o.stop(t + duration + .03);
      }
      function noise(duration, level, frequency, pan, offset, type, bus) {
        if (!reserve(level,bus)) return;
        duckMusic();
        var t = ctx.currentTime + (offset || 0), s = ctx.createBufferSource();
        var f = ctx.createBiquadFilter(), g = ctx.createGain(), p = panNode(pan);
        s.buffer = noiseBuffer;
        f.type = type || 'bandpass'; f.frequency.value = frequency; f.Q.value = .7;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + .004);
        g.gain.exponentialRampToValueAtTime(Math.max(.00011,level*.18), t + duration*.52);
        g.gain.exponentialRampToValueAtTime(.0001, t + duration);
        s.connect(f); f.connect(g); g.connect(p); p.connect(bus || effects);
        track(s, [s, f, g, p], level);
        s.start(t, random() * .7); s.stop(t + duration + .02);
      }
      function pcm(name,level,pan,event,rate,bus,cutoff) {
        if(!reserve(level,bus))return;
        var choices=bank[name];if(!choices)return;
        duckMusic();event=event||{};
        var seed=Number.isFinite(event.seed)?event.seed>>>0:(variation++*2654435761)>>>0;
        var buffer=choices[seed%choices.length],pitch=Math.max(.65,Math.min(1.4,(rate||1)*(1+((seed>>>5)%13-6)*.0025)));
        var source=ctx.createBufferSource(),gain=ctx.createGain(),panorama=panNode(pan),nodes=[source,gain,panorama],t=ctx.currentTime;
        source.buffer=buffer;source.playbackRate.value=pitch;
        var occluded=Math.max(0,Math.min(1,Number(event.occluded)||0)),distance=Math.max(0,Math.min(1,Number.isFinite(event.level)?event.level:1));
        // FEEL-07: an optional ceiling on top of the distance muffle. Enemy fire
        // is asked for at 1.1 kHz so a salvo reads as "over there" and never
        // competes with the player's own report for the same 2-4 kHz space.
        var cut=(occluded>0||distance<.7)?Math.max(650,(4200+distance*9000)*(1-occluded*.88)):Infinity;
        if(Number.isFinite(cutoff))cut=Math.min(cut,cutoff);
        if(Number.isFinite(cut)){var filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.55;filter.frequency.value=cut;source.connect(filter);filter.connect(gain);nodes.push(filter);}else source.connect(gain);
        gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+.0006);
        gain.gain.setValueAtTime(level,t+buffer.duration/pitch-.006);gain.gain.linearRampToValueAtTime(0,t+buffer.duration/pitch);
        gain.connect(panorama);panorama.connect(bus||effects);track(source,nodes,level);
        source.start(t);source.stop(t+buffer.duration/pitch+.005);
      }
      function materialCue(action,value) {
        if(!playing&&!preview)return;
        value=value||{};var kind=materials[value.material]?value.material:'stone',pan=Number(value.pan)||0;
        var e=effectEvent(action+':'+kind+':'+Math.round(pan*3),value,action==='break'?.045:action==='land'?.032:.022);if(!e)return;
        var energy=Number.isFinite(value.energy)?Math.max(0,value.energy):Number.isFinite(value.power)?Math.max(0,value.power)/18:1;
        if(energy<=.001)return;
        var force=Math.min(1.25,.28+Math.sqrt(energy)*.55),mass=Math.max(.15,Math.min(8,Number(value.mass)||1));
        pcm(action+':'+kind,e.level*force*(action==='break'?.36:action==='land'?.15:.22),e.pan,value,Math.max(.74,Math.min(1.18,1.04-Math.log2(mass)*.055)));
      }
      function warmBank(yieldWork,localOnly) {
        if(!ctx||disposed)return Promise.resolve(false);
        if(stats.pcmReady)return Promise.resolve(true);
        function variantsOf(name){var recipe=recipes[name]||extras[name];return recipe?recipe.variants:name.indexOf('motor:')===0?1:2;}
        function recipeData(name,variant){
          var recipe=recipes[name]||extras[name];
          if(recipe){var data=null;try{data=recipe.synth(variant|0,22050);}catch(_){}
            if(data&&data.length>0){for(var i=0;i<data.length;i++)if(!Number.isFinite(data[i])){data=null;break;}
              if(data)return data;}}
          return synthesize(name,variant,22050);
        }
        function bufferFor(name,data){
          var buffer=ctx.createBuffer(1,data.length,22050);
          buffer.getChannelData(0).set(data);bank[name].push(buffer);stats.pcmBuffers++;stats.pcmBytes+=data.byteLength;
        }
        function build(name){
          if(bank[name]||!ctx||disposed)return;
          bank[name]=[];
          for(var v=0;v<variantsOf(name);v++)bufferFor(name,recipeData(name,v));
        }
        function finish(){
          if(!ctx||disposed)return false;
          motors.forEach(function(m){if(m.source)return;var source=remember(ctx.createBufferSource());source.buffer=bank['motor:'+m.kind][0];source.loop=true;source.connect(m.filter);source.start();m.source=source;});
          stats.pcmReady=true;return true;
        }
        // Loading yields between small batches. A legacy caller which starts
        // play without prepare gets the same complete bank before play begins.
        var bankNames = extraNames.length ? effectNames.concat(extraNames) : effectNames;
        if(!yieldWork||typeof setTimeout!=='function'){bankNames.forEach(build);return Promise.resolve(finish());}
        if(warming)return warming;
        if(!localOnly&&typeof options.preparePCM==='function'){
          warming=(async function(){
            for(var name of bankNames)for(var variant=0;variant<variantsOf(name);variant++){
              if(disposed||!ctx)return false;if(bank[name]&&bank[name].length>variant)continue;
              var data=await options.preparePCM(name,variant);
              if(disposed||!ctx)return false;
              if(!data||!(data instanceof Float32Array)||!data.length||data.length>220500)throw new Error('Unprepared PCM');
              for(var i=0;i<data.length;i++)if(!Number.isFinite(data[i]))throw new Error('Invalid PCM');
              if(!bank[name])bank[name]=[];bufferFor(name,data);
            }
            return finish();
          })().catch(function(){warming=null;return disposed?false:warmBank(true,true);});
          return warming;
        }
        // LOAD-13: the loading screen yields on a time budget, never on an
        // effect count. One unit of work is one variant, and the built-in
        // renderer is resumable, so even the heaviest break stops inside the
        // budget and resumes on the next slice; an opaque recipe from a game
        // cannot be cut, so it always opens a fresh slice. Without a clock
        // (test rigs, cold realms) the same queue advances one variant per
        // slice, deterministically: no slice count depends on time there.
        // The bank stays bit for bit the synchronous one.
        var SLICE_MS=8,BLOCK=256,BLOCK_TARGET_MS=1.5,BLOCK_MIN=16,SLICE_MARGIN_MS=.6,jobs=[],index=0,cost=Object.create(null),peakCost=Object.create(null),worst=0;
        for(var ni=0;ni<bankNames.length;ni++){var jobName=bankNames[ni];var jobRecipe=recipes[jobName]||extras[jobName]||null;for(var jobVariant=0;jobVariant<variantsOf(jobName);jobVariant++)jobs.push({name:jobName,variant:jobVariant,recipe:jobRecipe,opaque:!!(jobRecipe&&typeof jobRecipe.job!=='function'),renderer:null,total:0,opened:false,blockMs:0,ms:0,block:BLOCK,per:0,done:0});}
        var clock=typeof performance==='object'&&performance&&typeof performance.now==='function'?function(){return performance.now();}:null;
        function open(job){job.opened=true;if(job.opaque)return;
          // A recipe built by FAudio.recipe carries its own resumable renderer,
          // so a game's weapon is cuttable exactly like an engine effect.
          job.renderer=job.recipe?job.recipe.job(job.variant,22050):synthJob(job.name,job.variant,22050);
          job.total=job.renderer.total;
          // The first block of a job used to run unconditionally at 256 samples, which
          // cost up to 19 ms on the heaviest break. Size it from a measured cost instead:
          // the variant already rendered for this name, else the worst rate seen so far.
          // Nothing is known yet (first job of the bank) → BLOCK_MIN, never BLOCK: the one
          // block no prediction can cover stays at most BLOCK_MIN samples long.
          var seen=cost[job.name],avg=seen!==undefined&&job.total>0?seen/job.total:0;
          // The average rate of the variant already rendered underestimates the peak:
          // a break gets more expensive as its staggered impacts come in. Size from the
          // worst rate ever seen for this name. When nothing is known about the name,
          // nothing is guessed either: the job opens at BLOCK_MIN samples, which is
          // bounded even for the heaviest effect, and the next blocks are sized from
          // this job's own measured rate. Guessing from the global worst is what let
          // rocket#0 and break:metal#0 open a 256-sample block worth 13 to 18 ms.
          var per=Math.max(avg,peakCost[job.name]||0);
          job.block=clock&&per>0?Math.max(BLOCK_MIN,Math.min(BLOCK,Math.floor(BLOCK_TARGET_MS/per))):BLOCK_MIN;
        }
        function predict(job){var seen=cost[job.name];return Math.max(seen!==undefined?seen:0,worst*job.total);}
        function finite(data){if(!data||!(data.length>0))return false;for(var i=0;i<data.length;i++)if(!Number.isFinite(data[i]))return false;return true;}
        function run(job,deadline){
          if(bank[job.name]&&bank[job.name].length>job.variant)return true;
          if(!bank[job.name])bank[job.name]=[];
          var t0=clock?clock():0;
          if(job.opaque){
            bufferFor(job.name,recipeData(job.name,job.variant));
            if(clock){var ms=clock()-t0;if(cost[job.name]===undefined)cost[job.name]=ms;}
            return true;
          }
          for(;;){
            // Predict with the worse of the last block and the job's own worst rate at
            // this block size: a cheap stretch of the envelope must not buy an expensive
            // one, which is what let a single block run 15 ms past the budget.
            if(clock&&job.blockMs>0&&clock()+Math.max(job.blockMs,job.per*job.block)>deadline)return false;
            var b0=clock?clock():0,from=job.done;
            var done=job.renderer.step(job.block);
            job.done=done?job.total:Math.min(job.total,from+job.block);
            if(clock){
              var spent=clock()-b0,did=job.done-from;
              job.ms+=spent;job.blockMs=spent;
              if(did>0){
                var per=spent/did;
                // Running maximum, never an average: the cheap tail of an effect must
                // not re-open a block of 256 samples just before its expensive middle.
                if(per>job.per)job.per=per;
                if(job.per>peakCost[job.name])peakCost[job.name]=job.per;
                job.block=Math.max(BLOCK_MIN,Math.min(BLOCK,Math.floor(BLOCK_TARGET_MS/job.per)));
                if(job.per>worst)worst=job.per;
              }
            }
            if(done)break;
          }
          // The cost of a name is its complete sample time, recorded once, when the job
          // is finished: recorded earlier it came from a partial run and sized the next
          // variant's first block far too large.
          if(clock&&cost[job.name]===undefined)cost[job.name]=job.ms;
          var sealed=job.renderer.seal();
          job.renderer=null;
          // Same fallback as recipeData for a game recipe: bad output falls back to v0.2.
          bufferFor(job.name,job.recipe&&!finite(sealed)?synthesize(job.name,job.variant,22050):sealed);
          return true;
        }
        warming=new Promise(function(resolve){warmResolve=resolve;function pump(){
          warmTimer=null;
          if(!ctx||disposed){warmResolve=null;resolve(false);return;}
          var sliceT0=clock?clock():0,work=false;
          for(;;){
            if(index>=jobs.length)break;
            var job=jobs[index];
            if(!job.opened)open(job);
            if(clock){
              var left=SLICE_MS-(clock()-sliceT0);
              // The slice is bounded by what the browser actually runs: the timer
              // callback, its microtasks, seal() and createBuffer. Keep a margin
              // instead of spending the whole 8 ms on the sample loop.
              if(left<=SLICE_MARGIN_MS)break;
              if(work&&job.opaque&&predict(job)>left)break;
            }else if(work)break;
            if(!run(job,sliceT0+SLICE_MS-SLICE_MARGIN_MS))break;
            index++;work=true;
          }
          if(index<jobs.length)warmTimer=setTimeout(pump,0);else{warmResolve=null;resolve(finish());}
        }pump();});
        return warming;
      }
      function initialize() {
        if (ctx || disposed || failed) return;
        if (!injected) {
          var Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) { failed = true; return; }
        }
        try {
          ctx = injected || new Audio();
          master = remember(ctx.createGain());
          master.gain.value = muted ? 0 : MASTER_GAIN * mix.master;
          limiter = remember(ctx.createDynamicsCompressor());
          // FEEL-07 (MIX-02): -12 dB, knee 6, ratio 3:1, 12 ms in, 120 ms out.
          // The MIX bench decided these values on the four recorded scenes and a
          // 24-round SMG burst: peak stays <= .68 and no sample reaches the .875
          // guard, so nothing saturates. Chrome runs the attack about 6 ms early.
          limiter.threshold.value = chainValue('threshold', -12); limiter.knee.value = chainValue('knee', 6);
          limiter.ratio.value = chainValue('ratio', 3); limiter.attack.value = chainValue('attack', .012); limiter.release.value = chainValue('release', .12);
          stats.makeupDb = makeupDb(limiter.threshold.value, limiter.knee.value, limiter.ratio.value);
          if (chainFixed) { chainMakeup = remember(ctx.createGain()); chainMakeup.gain.value = Math.pow(10, (MAKEUP_REFERENCE - stats.makeupDb) / 20); }
          // The existing compressor/mix stays intact. This final soft ceiling
          // is exactly linear below .875 and mathematically bounded above it,
          // including coincident rockets, debris and the MOD soundtrack.
          guard = remember(ctx.createWaveShaper()); var curve = new Float32Array(2049);
          for (var ci = 0; ci < curve.length; ci++) {
            var input = ci / 1024 - 1, magnitude = Math.abs(input);
            curve[ci] = Math.sign(input) * (magnitude <= .875 ? magnitude : .875 + .095 * (1 - Math.exp(-(magnitude - .875) / .095)));
          }
          guard.curve = curve; guard.oversample = 'none'; stats.outputCeiling = curve[curve.length-1];
          master.connect(limiter); limiter.connect(guard); guard.connect(ctx.destination);
          // level:'fixe' : après le compresseur, avant l'écrêteur (voir plus haut).
          if (chainMakeup) { limiter.disconnect(); limiter.connect(chainMakeup); chainMakeup.connect(guard); }
          effects = remember(ctx.createGain()); effects.gain.value = EFFECTS_GAIN * mix.effects; effects.connect(master);
          ambience = remember(ctx.createGain()); ambience.gain.value = AMBIENCE_GAIN * mix.ambience; ambience.connect(master);
          musicBus = remember(ctx.createGain()); musicBus.gain.value = MUSIC_GAIN; musicBus.connect(master);

          // A short, dark room reflection. Open sky gets almost no return;
          // repeated automatic fire must not build a second blanket of noise.
          var send = remember(ctx.createGain()), delay = remember(ctx.createDelay(.5));
          echoSend = send;
          var damping = remember(ctx.createBiquadFilter()), feedback = remember(ctx.createGain());
          send.gain.value = .09; delay.delayTime.value = .117;
          damping.type = 'lowpass'; damping.frequency.value = 1450; feedback.gain.value = .14;
          effects.connect(send); send.connect(delay); delay.connect(damping);
          damping.connect(master); damping.connect(feedback); feedback.connect(delay);

          noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
          var data = noiseBuffer.getChannelData(0), smooth = 0;
          for (var i = 0; i < data.length; i++) {
            var white = random() * 2 - 1;
            smooth = smooth * .96 + white * .04;
            data[i] = white * .64 + smooth * .55;
          }
          hiss = remember(ctx.createBufferSource());steamFilter = remember(ctx.createBiquadFilter());
          steamLevel = remember(ctx.createGain()); steamPan = remember(panNode(0));
          hiss.buffer = noiseBuffer; hiss.loop = true; steamFilter.type = 'bandpass'; steamFilter.frequency.value = 1950; steamFilter.Q.value = .6; steamLevel.gain.value = 0;
          hiss.connect(steamFilter); steamFilter.connect(steamLevel); steamLevel.connect(steamPan); steamPan.connect(ambience); hiss.start();
          air = remember(ctx.createBufferSource()); airVolume = remember(ctx.createGain());
          airFilter = remember(ctx.createBiquadFilter());
          air.buffer = noiseBuffer; air.loop = true;
          airFilter.type = 'bandpass'; airFilter.frequency.value = 780; airFilter.Q.value = .55;
          airVolume.gain.value = 0;
          air.connect(airFilter); airFilter.connect(airVolume); airVolume.connect(ambience); air.start();

          ['fan','piston','reactor','lift'].forEach(function(kind){
            var gain=remember(ctx.createGain()),filter=remember(ctx.createBiquadFilter()),pan=remember(panNode(0));
            gain.gain.value=0;filter.type='lowpass';filter.frequency.value=4200;filter.Q.value=.55;
            filter.connect(gain);gain.connect(pan);pan.connect(ambience);motors.push({kind:kind,source:null,gain:gain,filter:filter,pan:pan});
          });
          if (window.FMusic) { music = FMusic.create(ctx, musicBus); music.setVolume(mix.music); syncMusic(); }
          if(playing)warmBank(false);
        } catch (_) {
          failed = true;
          if (ctx && !injected) { try { ctx.close().catch(function () {}); } catch (_) {} }
          ctx = null;
        }
      }
      // MIX-V4 : au repos, le contexte audio ne doit plus rien couter. Apres 1,5 s
      // sans rien a dire — le temps que les queues trainantes s'eteignent —, on le
      // suspend ; le reveil est la promesse de resume(), asynchrone par nature.
      // Ni start() ni testMix() ne laissent le contexte endormi.
      var idle = false, idleTimer = null;
      function clearIdle() { if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; } }
      function setIdle(value) {
        var next = !!value;
        if (!next) { clearIdle(); if (idle) { idle = false; stats.idle = false; resume(); } return; }
        if (idle || idleTimer !== null) return;
        idle = true; stats.idle = true;
        idleTimer = setTimeout(function () {
          idleTimer = null;
          if (idle && !disposed && !offline && ctx) { try { ctx.suspend().catch(function () {}); } catch (_) {} }
        }, 1500);
      }
      function resume() {
        initialize();
        clearIdle(); idle = false; stats.idle = false;
        if (!ctx || disposed || offline) return Promise.resolve();
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
          try { return ctx.resume().catch(function () {}); } catch (_) {}
        }
        return Promise.resolve();
      }
      function tick() {
        // Tracker scheduling has its own bounded voices; gunfire never starves it.
        if (music) music.tick();
        updateSteam();
        updateMachinery();
        if (!available()) return;
        var now = ctx.currentTime;
        var active = playing;
        if (now >= duckUntil + 1) stats.duckGain = MUSIC_GAIN;
        // No indoor bed and no synthetic birds or ominous bass chord. Wind
        // follows the exterior exposure and has long, genuinely silent gaps.
        var wind=Math.max(0,Math.min(2,Number.isFinite(environment.wind)?environment.wind:1));
        var gust=Math.max(0,Math.min(1,(Math.sin(now*.19+1.2)+.28*Math.sin(now*.53)-.28)*1.25));
        var mask=(1-Math.max(threat,pressure)*.45)*(now<ambientDuckUntil?.55:1);
        approach(airFilter.frequency,780+stage*180+(environment.biome==='woodland'?-100:0),now,.4);
        stats.windGain=active&&mix.ambience>0?outside*wind*gust*.020*mask:0;
        approach(airVolume.gain,stats.windGain,now,stats.windGain?.22:.045);
        loopLink(air,airFilter,stats.windGain>0);
        approach(echoSend.gain,.09-outside*.08,now,.45);

      }
      function cancelTestMix() {
        previewSerial++;
        var previous = preview;
        if (!previous) return;
        preview = null; stats.preview = false;
        if (previous.timer !== null) clearTimeout(previous.timer);
        for (var entry of Array.from(voices)) if (entry.preview === previous.id) { try { entry.source.stop(); } catch (_) {} clean(entry); }
        syncMusic();
        if (musicBus && ctx) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(MUSIC_GAIN,ctx.currentTime,.03); }
        duckUntil = 0; duckDepth = 1; stats.duckGain = MUSIC_GAIN;
        updateMaster();
        if (ctx && !playing) {approach(airVolume.gain,0,ctx.currentTime,.018);stats.windGain=0;updateSteam();updateMachinery();}
      }
      function testMix(options) {
        cancelTestMix();
        var serial = ++previewSerial;
        if (disposed || options && options.muted || mix.master <= 0 || typeof setTimeout !== 'function') return Promise.resolve(false);
        return resume().then(function () {
          if (!ctx || disposed || serial !== previewSerial || !live()) return false;
          warmBank(false);
          var start = ctx.currentTime, audition = {id:serial,end:start+2,timer:null,index:0};
          preview = audition; stats.preview = true; updateMaster();
          if (music) music.setPlaying(true);
          // These use the real buses, samples and cue methods. Volume sliders,
          // including an intentionally silent effects/ambience/music bus, hold.
          var events = [
            {at:0,run:function(){noise(.75,.035,1100,-.35,0,'bandpass',ambience);}},
            {at:.25,run:function(){api.shot({weapon:4});}},
            {at:.55,run:function(){api.shot();}},
            {at:.9,run:function(){api.materialBreak({material:'stone',level:.8,seed:9});}},
            {at:1.45,run:function(){api.ammoPickup();}}
          ];
          function pump() {
            if (preview !== audition || disposed) return;
            if (ctx.currentTime >= audition.end || !live()) { cancelTestMix(); return; }
            while (audition.index < events.length && ctx.currentTime-start >= events[audition.index].at) events[audition.index++].run();
            tick(); audition.timer = setTimeout(pump,40);
          }
          pump(); return true;
        });
      }
      api = {
        start: resume,
        resume: resume,
        prepare: function (value, seed) {
          var next=Math.max(0,Math.min(2,Math.floor(Number(value)||0)));
          // The user gesture opens the shared context through start/resume.
          // This method only prepares existing player buffers after pure PCM
          // warmup; it neither opens a device nor changes the active score.
          if (disposed) return Promise.resolve(false);
          var fx=warmBank(true),score=window.FMusic?FMusic.warmup(next,seed):Promise.resolve(false);
          return Promise.all([fx,score]).then(function () {
            if(!ctx||disposed||!stats.pcmReady)return false;
            if(!music)return true;return options.asyncPrepare?music.prepareAsync(next,seed):music.prepare(next,seed);
          });
        },
        prepareCues: async function (values) {
          if(disposed||!window.FMusic)return false;
          for(var value of values){await FMusic.warmup(value);if(disposed)return false;
            if(music){if(options.asyncPrepare)await music.prepareAsync(value);else music.prepare(value);}}
          return !!ctx&&!disposed;
        },
        prepareTitle: function () {
          // Warm only the title instruments. Opening the device still belongs
          // to start/resume in a user gesture; no world effects are synthesized.
          if (disposed || !window.FMusic) return Promise.resolve(false);
          return FMusic.warmup('title').then(function () {
            if(!ctx||!live()||disposed||!music)return false;return options.asyncPrepare?music.prepareAsync('title'):music.prepare('title');
          });
        },
        setTitlePlaying: function (value) {
          var next = !!value && !disposed;
          if (next === titlePlaying) return;
          cancelTestMix();
          if (next && playing) api.setPlaying(false);
          titlePlaying = next;
          if (next) musicCue = '';
          if (next && ctx) {
            // A last combat impact must not duck the first title riff.
            musicBus.gain.cancelScheduledValues(ctx.currentTime);
            musicBus.gain.setTargetAtTime(MUSIC_GAIN,ctx.currentTime,.018);
            duckUntil = 0; duckDepth = 1; ambientDuckUntil = 0; stats.duckGain = MUSIC_GAIN;
            for (var entry of Array.from(voices)) { try { entry.source.stop(); } catch (_) {} clean(entry); }
            approach(airVolume.gain,0,ctx.currentTime,.018); stats.windGain = 0;
            updateSteam(); updateMachinery();
          }
          syncMusic();
        },
        setMuted: function (value) {
          var next = !!value;
          if (next !== muted) cancelTestMix();
          muted = next;
          updateMaster();
          updateSteam();updateMachinery();
          if(muted&&!preview&&ctx&&airVolume){approach(airVolume.gain,0,ctx.currentTime,.018);stats.windGain=0;}
        },
        setThreat: function (value) { threat = Math.max(0, Math.min(1, Number(value) || 0)); if (music) music.setThreat(titlePlaying ? 0 : Math.max(threat,pressure*.65)); },
        // MUS-04: an in-game event asks the adaptive director for another piece.
        // The transport is never restarted by the caller: FImuse finishes the
        // bar, plays the written join and enters the target on the bar line.
        requestMusic: requestMusic,
        releaseMusic: function () { return requestMusic(''); },
        setPressure: function (value) { pressure = Math.max(0,Math.min(1,Number(value)||0)); if (music) music.setThreat(titlePlaying ? 0 : Math.max(threat,pressure*.65)); },
        setStage: function (value, valueSeed) { cancelTestMix(); stage = Math.max(0, Math.min(2, Math.floor(Number(value) || 0))); if (arguments.length > 1) musicSeed = Number.isFinite(valueSeed) ? valueSeed | 0 : undefined; pressure = 0; steam = 0; machinery = 0; musicCue = ''; updateSteam();updateMachinery(); syncMusic(); },
        setPlaying: function (value) { cancelTestMix(); playing = !!value;if(playing){titlePlaying=false;if(ctx)warmBank(false);} updateSteam();updateMachinery(); syncMusic(); if (!playing && ctx && airVolume) {approach(airVolume.gain,0,ctx.currentTime,.018);stats.windGain=0;for(var entry of Array.from(voices)){try{entry.source.stop();}catch(_){}clean(entry);}} },
        setMix: function (value) {
          for (var key in mix) if (Number.isFinite(value && value[key])) mix[key] = Math.max(0, Math.min(1, value[key]));
          if (!ctx || disposed) return;
          updateMaster();
          effects.gain.setTargetAtTime(EFFECTS_GAIN * mix.effects, ctx.currentTime, .025);
          ambience.gain.setTargetAtTime(AMBIENCE_GAIN * mix.ambience, ctx.currentTime, .025);
          updateSteam();updateMachinery();
          if(mix.ambience<=0){approach(airVolume.gain,0,ctx.currentTime,.018);stats.windGain=0;loopLink(air,airFilter,false);}
          if (music) music.setVolume(mix.music);
        },
        setEnvironment: function (value, amount) { environment = value || {}; outside = Math.max(0, Math.min(1, Number(amount) || 0)); },
        setMachinery: function (value, pan, kind, occluded) { machinery = Math.max(0,Math.min(1,Number(value)||0));machineSide=Math.max(-1,Math.min(1,Number(pan)||0));machineKind=['fan','piston','reactor','lift'].indexOf(kind)>=0?kind:'lift';machineOccluded=Math.max(0,Math.min(1,Number(occluded)||0));updateMachinery(); },
        setSteam: function (value, pan, occluded) { steam = Math.max(0,Math.min(1,Number(value)||0)); steamSide = Math.max(-1,Math.min(1,Number(pan)||0));steamOccluded=Math.max(0,Math.min(1,Number(occluded)||0)); updateSteam(); },
        stats: stats,
        // MIX-11: the nodes of the real chain, for the offline bench and the
        // tests only. A game never reads them; nothing here is a public API.
        graph: function () {
          return ctx ? {master: master, limiter: limiter, guard: guard, effects: effects, ambience: ambience, musicBus: musicBus} : null;
        },
        tick: tick,
        setIdle: setIdle,
        testMix: testMix,
        cancelTestMix: cancelTestMix,
        materialImpact: function(value){materialCue('impact',value);},
        materialBreak: function(value){materialCue('break',value);},
        debrisLand: function(value){materialCue('land',value);},
        horror: function (event) { horrorCue(event&&event.kind,event); },
        metallicSlam: function (event) { horrorCue('metallicSlam',event); },
        horrorSting: function (event) { horrorCue('ambush',event); },
        powerCut: function (event) { horrorCue('blackout',event); },
        alarm: function (event) { horrorCue('alarm',event); },
        rocket: function (value) {
          if(!playing&&!preview)return;
          var e = handEvent('rocket',value,.055); if (e)pcm('rocket',.57*e.level*wg('rocket'),e.pan,e.event);
        },
        grenade: function (value) {
          if(!playing&&!preview)return;
          var e = effectEvent('grenade',value,.085); if(e)pcm('grenade',.54*e.level,e.pan,e.event,1.08);
        },
        grenadeLaunch: function(value){
          if(!playing&&!preview)return;
          var e=handEvent('grenadeLaunch',value,.075);if(e)pcm('grenade',.66*e.level,e.pan,e.event);
        },
        explosion: function (value) {
          var e = effectEvent('explosion',value,.095); if (!e) return;
          var kind=e.event.kind,steamBlast=kind==='steam',boss=kind==='boss';
          var size=Math.max(.7,Math.min(1.8,(Number(e.event.radius)||3.5)/3.5*(boss?1.12:1)));
          var power=Math.max(.72,Math.min(1.35,Math.sqrt(Math.max(0,Number(e.event.power)||32)/32)));
          // One non-tonal crack/pressure/debris buffer, without a sustained
          // sub-bass glide. Size stretches the decay; distance removes highs.
          pcm(steamBlast?'steam':'explosion',e.level*power*(steamBlast?.40:.75),e.pan,e.event,1/Math.sqrt(size));
        },
        pipeLeak: function (value) {
          var e = effectEvent('pipeLeak',value,.13); if(e)pcm('steam',.32*e.level,e.pan,e.event);
        },
        creak: function (value) {
          var e = effectEvent('creak',value,.15); if(e)pcm('break:metal',.15*e.level,e.pan,e.event,.78);
        },
        trap: function (value) {
          var e = effectEvent('trap',value,.1); if (!e) return; var g = e.level, kind = e.event.kind;
          if (kind === 'blade') { pcm('swish',.27*g,e.pan,e.event,1.25);pcm('click',.16*g,e.pan,e.event); }
          else if (kind === 'spikes') pcm('impact:metal',.31*g,e.pan,e.event,1.35);
          else { pcm('impact:metal',.29*g,e.pan,e.event,.75);pcm('body',.37*g,e.pan,e.event,.78); }
        },
        bossTell: function (value) {
          var e = effectEvent('bossTell',value,.25); if (!e) return; var g = e.level;
          var kind=e.event.kind;if(kind==='slam'){tone(60,110,1.4,.28*g,'triangle',0,e.pan,400);pcm('body',.22*g,e.pan,e.event,.7);}
          else if(kind==='ring'){tone(110,390,1.3,.27*g,'triangle',0,e.pan,1300);tone(220,780,1.3,.09*g,'sine',0,-e.pan*.3);}
          else if(kind==='rocketZone'){for(var i=0,t=0;i<12&&t<1.5;i++){tone(650,650,.045,.27*g,'sine',t,e.pan,2200);t+=1/(4+i*.8);}}
          else{tone(900,1800,1.35,.25*g,'sine',0,e.pan,2600);pcm('swish',.14*g,e.pan,e.event,.8);}
        },
        weakHit: function(value){var e=effectEvent('weakHit',value,.06);if(e){pcm('impact:metal',.22*e.level,e.pan,e.event,1.4);tone(2600,2100,.08,.15*e.level,'sine',0,e.pan,4000);}},
        bossArmorHit: function(value){var e=effectEvent('bossArmorHit',value,.09);if(e)pcm('body',.09*e.level,e.pan,e.event,.8);},
        enemyPain: function(value){var e=effectEvent('enemyPain',value,.12);if(e)pcm('impact:metal',.12*e.level,e.pan,e.event,.9);},
        bossRoar: function (value) {
          var e = effectEvent('bossRoar',value,.6); if (!e) return; var g = e.level;
          pcm('break:metal',.39*g,e.pan,e.event,.74);pcm('steam',.21*g,e.pan,e.event,.8);
        },
        bossImpact: function (value) {
          var e = effectEvent('bossImpact',value,.12); if (!e) return; var g = e.level;
          pcm('explosion',.58*g,e.pan,e.event,1.12);pcm('impact:stone',.23*g,e.pan,e.event,.85);
        },
        bossDeath: function (value) {
          var e = effectEvent('bossDeath',value,1.4); if (!e) return; var g = e.level;
          pcm('explosion',.62*g,e.pan,e.event,.87);pcm('break:metal',.33*g,e.pan,e.event,.8);
        },
        thunder: function(value){if(!playing||!available())return;var e=effectEvent('thunder',value,1);if(e){pcm('explosion',.55*e.level,e.pan,e.event,.65);noise(2.2,.07*e.level,190,e.pan,.2,'lowpass');}},
        setWeather: function(rain,wind,shelter){if(!available())return;var level=playing?(Math.max(0,rain)*.045+Math.max(0,wind)*.012)*(shelter?.25:1):0;approach(airFilter.frequency,900+Math.max(0,rain)*2400,ctx.currentTime,.25);approach(airVolume.gain,level,ctx.currentTime,.3);stats.windGain=level;},
        policeSiren: function (value) { if(!playing||!available())return;var e=effectEvent('policeSiren',value,.7);if(!e)return;tone(620,980,.35,.10*e.level,'sine',0,e.pan);tone(980,620,.35,.10*e.level,'sine',.36,e.pan); },
        shot: function (value) {
          var pistol=!!value&&value.weapon===4;
          if(!playing&&!preview)return;
          var e=handEvent(pistol?'pistol':'shot',value,pistol?.08:.045);if(!e)return;var g=e.level;
          pcm(pistol?'pistol':'smg',(pistol?.63:.49)*g*wg(pistol?'pistol':'smg'),e.pan,e.event);
        },
        fracture: function (value) {
          if(!playing&&!preview)return;
          var e=handEvent('fracture',value,.075);if(e)pcm('shotgun',.77*e.level*wg('shotgun'),e.pan,e.event);
        },
        pulse: function () {
          if (!available()) return;
          tone(90, 520, .14, .18, 'sine', 0, -.25);
          tone(240, 35, .55, .22, 'triangle', .07, .2, 1600);
          noise(.55, .17, 580, 0, .04, 'lowpass');
          tone(960, 120, .5, .055, 'sine', .06, -.3);
        },
        switchWeapon: function () {
          pcm('click',.14,.10,null,.85);
        },
        dash: function () {
          if (!available()) return;
          pcm('swish',.19,0,null,.9);
        },
        phoneMessage: function () {
          if(!available()||!playing)return;
          tone(880,880,.085,.055,'sine',0,0,2400);
          tone(1174.66,1174.66,.12,.045,'sine',.10,0,2400);
        },
        alerted: function (event) {
          if (!available() || ctx.currentTime - lastAlert < .45) return;
          lastAlert = ctx.currentTime; event = event || {};
          var level = Math.min(1, event.level || 1) * .065, pan = event.pan || 0;
          tone(530, 820, .085, level, 'triangle', 0, pan, 1500);
          tone(1040, 720, .12, level * .55, 'sine', .095, pan, 1800);
        },
        enemyShot: function (event) {
          event = event || {};
          var pan = Math.max(-1,Math.min(1,Number(event.pan)||0)), e = effectEvent('enemyShot:'+Math.round(pan*4),event,.06);
          if (!e || e.level < .055) return;
          // FEEL-07: the enemy fires the player's own report, slowed to .85, closed
          // at 1.1 kHz, without the mechanical click and at level .24, so a salvo
          // reads as "over there" instead of a thinner copy of the player's shot.
          // The mech-free copies come from METAL's extras; without them the v0.2
          // cues keep their own rate and click rather than falling silent.
          var heavy = event.kind === 3, alt = heavy ? 'enemyGrenade' : 'enemySmg';
          pcm(bank[alt] ? alt : (heavy ? 'grenade' : 'smg'), e.level * .24, pan, event, .85, null, 1100);
        },
        bossPhase: function () {
          [0, .18, .36].forEach(function (offset) {
            tone(110, 55, .4, .09, 'sawtooth', offset, 0, 600);
            tone(440, 220, .25, .04, 'triangle', offset, .2, 1200);
          });
        },
        hit: function (value) {
          // FEEL-07: a game's confirmation replaces the v0.2 click. The run of
          // consecutive hits lives here, on the audio clock: nothing enters the
          // simulation and nothing is saved.
          if (extras.touchConfirm) {
            var t = ctx ? ctx.currentTime : 0;
            touchRun = lastTouch < 0 || t - lastTouch > .45 ? 0 : Math.min(6, touchRun + 1);
            lastTouch = t;
            pcm('touchConfirm', .30, Number(value && value.pan) || 0, value, Math.pow(2, touchRun / 12));
            return;
          }
          pcm('click',.12,0,null,1.3);
        },
        hurt: function () {
          pcm('body',.45,0,null,.85);
        },
        kill: function (value) {
          if (extras.killConfirm) { pcm('killConfirm', .45, 0, value, 1); return; }
          pcm('body',.19,0,null,.94);pcm('impact:dirt',.09,0,null);
        },
        pickup: function () {
          tone(659.255, 659.255, .18, .075, 'sine', 0, -.18);
          tone(987.767, 987.767, .25, .065, 'sine', .08, .18);
        },
        ammoPickup: function (value) {
          var e=effectEvent('ammoPickup',value,.08);if(!e)return;
          noise(.045,.10*e.level,2700,e.pan,0,'highpass');
          tone(235,150,.10,.075*e.level,'triangle',.025,e.pan,1400);
          tone(660,880,.14,.055*e.level,'sine',.07,-e.pan*.3,1900);
        },
        weaponPickup: function (value) {
          var e=effectEvent('weaponPickup',value,.2);if(!e)return;
          noise(.09,.13*e.level,1800,e.pan,0,'bandpass');tone(120,52,.21,.13*e.level,'triangle',0,e.pan,900);
          tone(330,440,.23,.075*e.level,'sawtooth',.08,-.16,1200);tone(660,880,.26,.055*e.level,'triangle',.18,.16,1800);
        },
        // A new campaign discovery has one short forged-metal fanfare. It is
        // dispatched only by the discovery event, never by snapshot restore.
        trophy: function (value) {
          if(!playing&&!preview)return;
          var e=effectEvent('trophy',value,1.1);if(!e)return;var g=e.level;
          noise(.095,.13*g,1900,e.pan,0,'bandpass');
          tone(88,55,.24,.12*g,'triangle',0,e.pan,950);
          tone(164.81,164.81,.32,.085*g,'sawtooth',.035,-.12,1400);
          tone(246.94,246.94,.36,.07*g,'sawtooth',.13,.12,1600);
          tone(329.63,329.63,.48,.06*g,'triangle',.25,0,2200);
        },
        heatWarning: function (value) {
          var e=effectEvent('heatWarning:'+((value&&value.hand)||'right'),value,.6);if(!e)return;
          pcm('click',.09*e.level,e.event.hand==='left'?-.2:.2,e.event,.78);
        },
        empty: function (value) {
          var e=effectEvent('empty',value,.18);if(!e)return;
          pcm('click',.24*e.level,e.pan,e.event,1.2);
        },
        melee: function (value) {
          var e=effectEvent('melee',value,.12);if(!e)return;
          pcm('swish',.22*e.level,e.pan,e.event,.94);
          if(e.event.hit)pcm('body',.40*e.level,e.pan,e.event,.9);
        },
        wave: function (value) {
          var e=effectEvent('wave',value,.8);if(!e)return;
          tone(98,58,.55,.11*e.level,'sawtooth',0,-.2,650);noise(.19,.07*e.level,1400,.2,.03,'bandpass');
          tone(294,277,.31,.065*e.level,'triangle',.08,.2,1300);tone(196,185,.46,.055*e.level,'triangle',.12,-.2,1100);
        },
        core: function () {
          [329.627, 440, 659.255].forEach(function (n, i) {
            tone(n, n, .65, .075, 'triangle', i * .13, (i - 1) * .22, 1800);
            tone(n * 2, n * 2, .42, .025, 'sine', i * .13 + .01, 0);
          });
        },
        mechanism: function (event) {
          var e=effectEvent('mechanism',event,.12);if(e){pcm('click',.20*e.level,e.pan,e.event,.78);pcm('impact:metal',.14*e.level,e.pan,e.event,.85);}
        },
        jumpPad: function (event) {
          event = event || {}; var level = (event.level || 1) * (event.actor === 'enemy' ? .06 : .16), pan = event.pan || 0;
          tone(80, 650, .36, level, 'sawtooth', 0, pan, 1200);
          noise(.27, level * .8, 1800, pan, 0, 'bandpass');
          tone(42, 90, .22, level, 'sine', 0, pan);
        },
        land: function (event) {
          event=event||{};var e=effectEvent('land:'+Math.round((event.pan||0)*3),event,.05);if(!e)return;
          var impact=Math.min(1,(Number.isFinite(event.impact)?event.impact:4)/10),kind=materials[event.material]?event.material:event.outdoor?'dirt':'stone';
          pcm('step:'+kind,e.level*impact*(event.actor==='enemy'?.12:.28),e.pan,event,.78);
        },
        liftStart: function (event) {
          var e=effectEvent('liftStart',event,.2);if(e)pcm('impact:metal',.19*e.level,e.pan,e.event,.75);
        },
        liftStop: function (event) {
          var e=effectEvent('liftStop',event,.2);if(e){pcm('click',.19*e.level,e.pan,e.event,.85);pcm('impact:metal',.12*e.level,e.pan,e.event,.95);}
        },
        win: function () {
          [220, 329.627, 440, 523.251, 659.255, 880].forEach(function (n, i) {
            tone(n, n, .9, .085, 'triangle', i * .14, Math.sin(i) * .3, 1900);
          });
        },
        step: function (speed, surface) {
          if (!available() || !playing || !(speed > .2)) return;
          // The measured stride in game.js schedules steps; this only rejects duplicates.
          if (ctx.currentTime - lastStep < .1) return;
          lastStep = ctx.currentTime; stepSide *= -1;
          var weight=Math.max(.4,Math.min(1.15,speed/4.5)),kind=surface&&materials[surface.material]?surface.material:surface&&surface.outdoor?'dirt':'metal';
          pcm('step:'+kind,.13*weight,stepSide*.16,surface,1+(weight-1)*.035);
        },
        dispose: function () {
          clearIdle();
          if (disposed) return;
          cancelTestMix();
          disposed = true;
          titlePlaying = false; stats.titlePlaying = false;
          if(warmTimer!==null)clearTimeout(warmTimer);warmTimer=null;if(warmResolve)warmResolve(false);warmResolve=null;
          if (music) { music.dispose(); music = null; }
          voices.forEach(function (entry) {
            try { entry.source.stop(); } catch (_) {}
            clean(entry);
          });
          persistent.forEach(function (node) {
            try { if (node.stop) node.stop(); } catch (_) {}
            try { node.disconnect(); } catch (_) {}
          });
          persistent.length = 0;
          if (ctx && !injected) { try { ctx.close().catch(function () {}); } catch (_) {} }
          ctx = null; noiseBuffer = null;bank=Object.create(null);motors.length=0;
        }
      };
      // Priority belongs to a cue, not its waveform. A rocket's click, body
      // and exhaust keep the same reservation and cause one short music dip.
      var urgent = /^(shot|fracture|pulse|rocket|grenade|grenadeLaunch|hurt|bossTell|bossRoar|bossImpact|bossDeath|bossPhase|weakHit|horror|metallicSlam|horrorSting|powerCut|alarm|empty|melee|weaponPickup|trophy|wave|core|win)$/;
      var helpers = /^(start|resume|prepare|set|tick|testMix|cancelTestMix|dispose|graph|requestMusic|releaseMusic)/;
      Object.keys(api).forEach(function (name) {
        if (typeof api[name] !== 'function' || helpers.test(name)) return;
        var method = api[name];
        api[name] = function () {
          if (titlePlaying && !preview) return;
          var event = arguments[0], previousPriority=priority, previousCue=cue, previousLevel=cueLevel, previousDucked=cueDucked;
          if (event && typeof event==='object' && Number.isFinite(event.level) && event.level<=.008) return;
          priority = name==='enemyShot'||name==='alerted'||name==='debrisLand'||name==='step' ? 1 : urgent.test(name) ? 3 : 2;
          if ((name==='rocket'||name==='grenade') && event && event.owner !== undefined && event.owner !== 'player') priority=2;
          cue=name;cueLevel=event&&typeof event==='object'&&Number.isFinite(event.level)?Math.max(0,Math.min(1,event.level)):1;
          if(event&&typeof event==='object'&&Number.isFinite(event.intensity))cueLevel*=Math.max(0,Math.min(1,event.intensity));
          cueDucked=false;
          try { return method.apply(api,arguments); }
          finally { priority=previousPriority;cue=previousCue;cueLevel=previousLevel;cueDucked=previousDucked; }
        };
      });
      return api;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
