/* METAL — original four-channel ProTracker music, including mathematical PCM.
 * No recordings, imported modules, instrument banks or external dependencies.
 * MOD layout/periods: https://www.aes.id.au/modformat.html
 */
(function (G) {
  'use strict';
  const {sin,exp,tanh,floor,abs,min,max,round,ceil,sign,imul,pow}=Math;
  const CLOCK=7093789.2,RATE=CLOCK/856,TAU=Math.PI*2,MAX_VOICES=28;
  const PERIODS=[856,808,762,720,678,640,604,570,538,508,480,453,428,404,381,360,339,320,302,285,269,254,240,226,214,202,190,180,170,160,151,143,135,127,120,113];
  const SONGS=[
    {title:'Fer noir',moduleTitle:'METAL I - FER NOIR',style:'Doom industriel',bpm:100,root:38},
    {title:'Fracture',moduleTitle:'METAL II - FRACTURE',style:'Thrash',bpm:170,root:40},
    {title:'Veille des cendres',moduleTitle:'METAL III - CENDRES',style:'Métal mélodique sombre',bpm:145,root:40}
  ];
  // An independent, original menu composition. Its symbolic key never changes
  // the meaning (or the PCM/score) of the three historical world indices.
  const TITLE_SONG={title:'Furie d’acier',moduleTitle:'METAL - FURIE ACIER',style:'Thrash metal',bpm:212,root:38};
  const TITLE_ORDERS=[0,1,2,1,3,4,5,2,6,4,1,7];
  const WORLD_ORDERS=[[0,1,2,1,3,1,4,5],[0,1,2,1,3,4,1,5],[0,1,2,3,1,4,2,5]];
  let instrumentBank=null,titleBank=null,percussionBank=null,tensionSample=null;
  const modules=new Map(),cueModules=new Map(),cueBanks=new Map(),clamp=(x,a,b)=>max(a,min(b,x)),stageOf=x=>x==='title'?'title':clamp(floor(Number(x)||0),0,2),songOf=x=>x==='title'?TITLE_SONG:SONGS[x];
  const period=midi=>PERIODS[clamp(round(midi)-36,0,35)];
  // MIX-10 : le module sans graine joue les 8 positions ecrites ; un module varie
  // ajoute VARIATION_CYCLES cycles de 6 positions. 5 cycles portent la boucle de
  // 271 s (170 bpm) a 461 s (100 bpm), la plage que l'audit annoncait.
  const VARIATION_CYCLES = 5, BASE_POSITIONS = 8, LOOP_POSITIONS = BASE_POSITIONS * (1 + VARIATION_CYCLES);
  function random(seed){return ()=>{seed=(imul(seed,1664525)+1013904223)|0;return (seed>>>0)/2147483648-1;};}
  function pcm(data,peak=.84){
    let peakValue=0;for(const v of data)peakValue=max(peakValue,abs(v));
    const out=new Int8Array((data.length+1)&~1),gain=peak*127/(peakValue||1);
    for(let i=2;i<data.length;i++)out[i]=clamp(round(data[i]*gain),-127,127);
    // The first word is reserved by old Amiga replay routines.
    return out;
  }
  function strings(kind,intervals,seconds,seed){
    const rand=random(seed),length=ceil(seconds*RATE),out=new Float32Array(length),thrash=kind.startsWith('thrash'),bass=kind==='bass',lead=kind==='lead'||kind==='thrashLead',palm=kind==='palm'||kind==='thrashPalm';
    // A picked string has moving partials, a noisy contact and a short body
    // resonance. Two separately detuned courses drive the amplifier together;
    // distorting a finished sine chord only produces a flat organ-like buzz.
    const fundamental=bass?65.4064:130.8128,voices=intervals.flatMap((semitones,index)=>Array.from({length:bass?1:2},(_,course)=>{
      const frequency=fundamental*pow(2,semitones/12)*(1+(course?1:-1)*(.0014+index*.0004));
      const partials=Array.from({length:min(bass?12:22,floor(RATE*.45/frequency))},(_,h)=>{
        const n=h+1,omega=TAU*frequency*n*Math.sqrt(1+.000035*n*n)/RATE,phase=rand()*.08;
        return {s:sin(phase),c:Math.cos(phase),ds:sin(omega),dc:Math.cos(omega),a:sin(n*.43)/pow(n,bass?1.3:.81),decay:exp(-(.5+h*(palm?.43:.075))/RATE)};
      });return {partials,weight:index===0?1:index===1?.74:.42,delay:(index*1.3+course*.7)/1000};
    }));
    let low=0,body=0,dc=0,pickLow=0;
    for(let i=0;i<length;i++){
      const t=i/RATE;let sum=0;
      for(const v of voices){
        const u=t-v.delay;if(u<0)continue;
        let string=0;for(let h=0;h<v.partials.length;h++){
          const p=v.partials[h],next=p.s*p.dc+p.c*p.ds;p.c=p.c*p.dc-p.s*p.ds;p.s=next;p.a*=p.decay;
          string+=p.s*p.a;
        }
        sum+=string*v.weight*min(1,u/.0018);
      }
      const pick=rand();pickLow+=.2*(pick-pickLow);
      const envelope=palm?exp(-t*12)*(1+.38*exp(-t*55)):exp(-t*(bass?2:lead?.85:1.35));
      const contact=(pick-pickLow)*exp(-t*(palm?90:160))*(bass?.035:thrash?.30:.22),drive=bass?1.7:thrash?5.2:lead?2.9:4.1;
      const amp=tanh((sum*.43+contact)*drive),asymmetric=tanh(amp*1.7+.12)-tanh(.12);
      low+=(bass?.46:.78)*(asymmetric-low);body+=.16*(low-body);dc+=.014*(low-dc);
      const thump=palm?sin(TAU*fundamental*t)*exp(-t*21)*.22:0;
      out[i]=(bass?low*.58+body*.38:low*.91-body*.2-dc*.71+thump)*envelope*min(1,(length-i)/120);
    }
    return pcm(out,bass?.78:.88);
  }
  function drumHit(kind,seed){
    const duration={kick:.32,snare:.27,hat:.10,open:.34,crash:1.25,tom:.32,ride:.29,gong:1.9,timpani:.9}[kind],out=new Float32Array(ceil(duration*RATE)),rand=random(seed);
    let low=0,phase=0;
    for(let i=0;i<out.length;i++){
      const t=i/RATE,noise=rand();low+=.24*(noise-low);const high=noise-low;let v=0;
      if(kind==='kick'){
        phase+=TAU*(48+150*exp(-t*48))/RATE;
        v=sin(phase)*exp(-t*12)+sin(phase*2)*.21*exp(-t*24)+high*.48*exp(-t*125);
      }else if(kind==='snare')v=(high*.88+noise*.15)*exp(-t*14)+(sin(t*TAU*177)*.43+sin(t*TAU*331)*.17)*exp(-t*23);
      else if(kind==='tom'){phase+=TAU*(105+63*exp(-t*15))/RATE;v=sin(phase)*exp(-t*12)+high*.10*exp(-t*30);}
      // MUS-02: the announcement layer needs tuned metal and a kettle drum,
      // not a cymbal. Both are new waveforms, never a re-pitch of the kit.
      else if(kind==='gong'){phase+=TAU*(92+34*exp(-t*7))/RATE;v=sin(phase)*exp(-t*3.1)+sin(phase*2.71)*.24*exp(-t*5.2)+sin(phase*5.13)*.09*exp(-t*8)+high*.05*exp(-t*38);}
      else if(kind==='timpani'){phase+=TAU*(118+52*exp(-t*11))/RATE;v=sin(phase)*exp(-t*6.5)+sin(phase*1.62)*.17*exp(-t*11)+high*.10*exp(-t*55);}
      else{
        const metal=(sign(sin(t*TAU*1237))+sign(sin(t*TAU*1871))+sign(sin(t*TAU*2819)))/3;
        const decay=kind==='hat'?48:kind==='open'?15:kind==='ride'?17:4.3;
        v=(high*.7+metal*.3)*exp(-t*decay)*(kind==='crash'?.37:.21);
      }
      out[i]=tanh(v*1.3)*min(1,i/8)*min(1,(out.length-i)/70);
    }
    return out;
  }
  function drumBar(stage,variant,hits){
    const beat=60/SONGS[stage].bpm,step=beat/4,out=new Float32Array(ceil((beat*4+.25)*RATE));
    function hit(kind,row,velocity=1){const at=round(row*step*RATE),data=hits[kind];for(let i=0;i<data.length&&at+i<out.length;i++)out[at+i]+=data[i]*velocity;}
    const fill=variant===3||variant===7,open=variant===2||variant===6;
    if(variant===4){
      // A real stop/drop, including space after the downbeat, not merely a
      // lower master gain over the same incessant drum loop.
      hit('kick',0,1.1);hit('crash',0,.55);hit('snare',8,.9);hit('kick',10,.82);hit('kick',14,.95);
      for(const r of [2,6,10,14])hit('hat',r,.44);
    }else if(variant===5){
      for(const r of [0,6,8,11,14])hit('kick',r,.9);
      for(const r of [4,12,13,14,15,15.5])hit('snare',r,.48+r*.025);
      for(let r=0;r<16;r+=2)hit('hat',r,.45);hit('tom',15,.7);
    }else
    if(stage===0){
      for(const r of (variant%2?[0,3,6,8,11,14]:[0,6,10,14]))hit('kick',r,.94);
      for(const r of (open?[8]:[4,12]))hit('snare',r,.76);
      for(let r=0;r<16;r+=2)hit(open?'ride':'hat',r,r%4?.66:.88);
    }else if(stage===1){
      for(const r of (open?[0,2,6,8,10,14]:[0,1,3,6,7,8,10,11,14,15]))hit('kick',r,r%4===0?1:.84);
      hit('snare',4,.83);hit('snare',12,.89);
      for(let r=0;r<16;r+=2)hit(open?'ride':'hat',r,r%4?.70:.95);
      if(variant%2){hit('kick',5,.78);hit('kick',13,.82);}
    }else{
      for(const r of [0,2,3,6,8,10,11,14])hit('kick',r,r%4?.80:.97);
      hit('snare',4,.80);hit('snare',12,.85);
      for(let r=0;r<16;r+=2)hit(open?'ride':'hat',r,r%4?.73:.94);
      if(variant%2)hit('open',15,.65);
    }
    if(variant===0||variant===6)hit('crash',0,.68);
    if(fill){hit('snare',13,.60);hit('tom',14,.73);hit('snare',14.5,.70);hit('tom',15,.81);hit('snare',15.5,.64);}
    for(let i=0;i<out.length;i++)out[i]=tanh(out[i]*1.25)*min(1,(out.length-i)/110);
    return pcm(out,.91);
  }
  function titleDrumBar(variant,hits){
    const beat=60/TITLE_SONG.bpm,step=beat/4,out=new Float32Array(ceil((beat*4+.25)*RATE));
    function hit(kind,row,velocity=1){const at=round(row*step*RATE),data=hits[kind];for(let i=0;i<data.length&&at+i<out.length;i++)out[at+i]+=data[i]*velocity;}
    // Separate picked accents and alternating kick strokes keep the double
    // bass readable. The stop section really leaves space before its answer.
    const kickRows=variant===4?[0,1,6,7,10,14]:variant===5?[0,2,3,6,8,10,11,14]:
      variant===2||variant===6?Array.from({length:16},(_,i)=>i):variant===1?[0,1,3,5,6,7,8,9,11,13,14,15]:[0,1,2,3,6,7,8,9,10,11,14,15];
    for(const row of kickRows)hit('kick',row,row%4===0?1.03:row%2?.77:.9);
    for(const row of (variant===4?[8]:[4,12]))hit('snare',row,.95);
    if(variant===4){for(const row of [0,4,8,12])hit('ride',row,.53);hit('crash',0,.52);}
    else for(let row=0;row<16;row+=2)hit(variant===2||variant===6?'ride':'hat',row,row%4?.60:.84);
    if(variant===0||variant===6)hit('crash',0,.68);
    if(variant===1)hit('open',15,.52);
    if(variant===3||variant===7){
      for(const row of [12.5,13,13.5])hit('snare',row,.55+(row-12)*.15);
      for(const row of [14,14.5,15])hit('tom',row,.8);
      hit('snare',15.5,.73);
    }else if(variant===5){
      for(const row of [10,11,12,13,14,15])hit('snare',row,.35+(row-10)*.08);
      hit('tom',15.5,.85);
    }
    for(let i=0;i<out.length;i++)out[i]=tanh(out[i]*1.15)*min(1,(out.length-i)/110);
    return pcm(out,.89);
  }
  function compose(stage,samples,seed){
    const song=SONGS[stage],patterns=Array.from({length:6},()=>new Uint8Array(1024));
    // Four-bar phrases: opening impact, riff, answer, breakdown, climax, turn.
    // The third channel leaves holes for the rhythm section, then answers it.
    const orders=stage===0?[0,1,2,1,3,1,4,5]:stage===1?[0,1,2,1,3,4,1,5]:[0,1,2,3,1,4,2,5],base=orders.slice();
    function put(pattern,row,channel,sample,midi,effect=0,param=0){
      const pitch=midi===null?0:period(midi),at=(row*4+channel)*4,p=patterns[pattern];
      p[at]=(sample&240)|(pitch>>8);p[at+1]=pitch&255;p[at+2]=((sample&15)<<4)|effect;p[at+3]=param;
    }
    const roots=stage===0?[[0,0,1,-2],[0,0,3,1],[0,5,1,0],[0,1,6,0],[0,3,1,5],[0,1,-2,0]]:
      stage===1?[[0,0,1,6],[0,0,3,1],[3,1,0,0],[0,6,1,0],[0,3,1,5],[0,1,3,0]]:
      [[0,0,-2,1],[0,-2,3,1],[0,3,-2,5],[0,1,-2,0],[0,3,5,1],[3,1,-2,0]];
    const doom=[[[0,0,2],[3,0,1],[6,0,1],[8,0,1],[11,1,1],[14,-2,2]],
      [[0,0,1],[2,0,1],[6,3,2],[8,0,1],[11,0,1],[14,1,2]]];
    const thrash=[[[0,0,1],[1,0,1],[3,0,1],[4,1,1],[6,0,1],[7,0,1],[8,0,1],[10,3,1],[11,0,1],[12,0,1],[14,1,1],[15,0,1]],
      [[0,0,1],[2,0,1],[3,0,1],[4,3,2],[6,0,1],[7,0,1],[8,0,1],[9,0,1],[11,1,1],[12,0,1],[14,6,1],[15,1,1]]];
    const gallop=[[0,0,2],[2,0,1],[3,0,1],[4,0,1],[6,0,1],[7,0,1],[8,0,2],[10,0,1],[11,0,1],[12,1,2],[14,0,1],[15,0,1]];
    const breakRiff=[[0,0,2],[6,0,1],[8,1,2],[14,0,1]];
    const melodies=[[62,65,63,62,68,65,63,60],[64,65,70,67,65,64,62,64],[64,67,65,71,69,67,65,62]];
    for(let p=0;p<6;p++)for(let bar=0;bar<4;bar++){
      const start=bar*16,root=song.root+roots[p][bar],drop=p===3;
      let riff=drop?breakRiff:stage===0?doom[(p+bar)%2]:stage===1?thrash[(p+bar)%2]:gallop;
      if(p===0&&bar===0)riff=stage===0?[[0,0,2],[8,0,1],[11,0,1],[14,1,2]]:riff;
      for(const [r,offset,sample] of riff){
        const note=clamp(root+offset,36,59),accent=r%4===0;
        put(p,start+r,0,sample,note,12,sample===2?56:accent?59:48);
        if(stage!==1||r%2===0||r===15)put(p,start+r,1,4,note,12,accent?53:45);
      }
      if(drop){
        for(const r of [3,11]){put(p,start+r,0,0,null,12,0);put(p,start+r,1,0,null,12,0);}
        put(p,start,2,15,clamp(root+12,36,71),12,bar%2?31:24);
        put(p,start+10,2,0,null,12,0);
      }else if(p===0||p===1){
        // Short unison answers provide size without a constant bright solo.
        if(bar%2||p===0&&bar===0){put(p,start,2,2,clamp(root,36,71),12,35);put(p,start+3,2,0,null,12,0);}
        if(bar%2)put(p,start+12,2,3,clamp(root+19,36,71),12,31);
      }else if(stage===2){
        for(let r=0;r<16;r+=4){
          const index=(bar*3+r/4+p)%8,midi=melodies[stage][index],degree=(midi-song.root+120)%12;
          // Diatonic thirds in E Phrygian: E–G / F–A / G–B / A–C /
          // B–D / C–E / D–F. The bass remains dark; harmony is intentional.
          put(p,start+r,2,[1,3,8].includes(degree)?6:5,midi,12,r===0?41:34);
        }
      }else if(p===4||p===5){
        for(const r of [0,6,8,14]){const index=(bar*2+(r>>2)+p)%8;put(p,start+r,2,3,melodies[stage][index],12,r===0?38:31);}
      }else{
        put(p,start+4,2,2,clamp(root+12,36,71),12,34);put(p,start+7,2,0,null,12,0);
        put(p,start+12,2,3,clamp(root+18,36,71),12,29);
      }
      const kit=drop?(bar===3?5:4):bar===3?(p===5?7:3):p===4?6:(p+bar)%3;
      put(p,start,3,7+kit,48,12,drop?56:61);
      if(p===5&&bar===3){for(const ch of [0,1,2])put(p,start+15,ch,0,null,12,0);}
    }
    for(let p=0;p<patterns.length;p++){
      patterns[p][2]=(patterns[p][2]&240)|15;patterns[p][3]=6;
      patterns[p][14]=(patterns[p][14]&240)|15;patterns[p][15]=song.bpm;
    }
    // MIX-10 (lot 11b T7) : la boucle ne se rejoue plus a l'identique. Le premier
    // cycle reste l'arrangement ecrit ; les cycles suivants viennent d'une graine,
    // et seulement quand une graine est donnee. Sans graine, ce bloc ne s'execute
    // pas et le module rendu est octet pour octet celui d'aujourd'hui.
    if (seed !== undefined) {
      const rnd = random((seed | 0) * 7919 + stage + 1), pick = n => floor((rnd() + 1) * .5 * n) % n;
      for (let c = 0; c < VARIATION_CYCLES; c++) {
        // deux positions echangees parmi 1 a 5 : l'entree et la chute restent ancrees
        const o = base.slice(), i = 1 + pick(5), j = 1 + pick(5); [o[i], o[j]] = [o[j], o[i]];
        for (const b of o) {
          const q = patterns[b].slice();
          // MIX-V3 : une fois sur deux, les motifs 1 a 4 echangent deux mesures
          // (blocs de 16 lignes) sur les canaux 0 a 2, ceux des guitares.
          if (b >= 1 && b <= 4 && !pick(2)) {
            const r1 = pick(4) * 16, r2 = pick(4) * 16;
            if (r1 !== r2) for (let row = 0; row < 16; row++) for (let byte = 0; byte < 12; byte++) {
              const a = (r1 + row) * 16 + byte, z = (r2 + row) * 16 + byte, t = q[a]; q[a] = q[z]; q[z] = t;
            }
          }
          // MIX-10 : la batterie prend une caisse par mesure dans la famille, et le
          // 3e canal se tait une fois sur trois sur sa reponse, jamais sur la rupture.
          const mute = b !== 3 && !pick(3);
          for (let row = 0; row < 64; row++) {
            const d = row * 16 + 12, l = row * 16 + 8, k = (q[d + 2] >> 4) - 7;
            if (row % 16 === 0 && q[d + 1]) q[d + 2] = (7 + (k < 3 ? pick(3) : k === 6 ? 6 - 4 * pick(2) : k) << 4) | 12;
            if (mute && (q[l] & 15 | q[l + 1])) { q[l] = q[l + 1] = q[l + 3] = 0; q[l + 2] = 12; }
          }
          orders.push(patterns.push(q) - 1);
        }
      }
    }
    return {title:song.moduleTitle,patterns,orders,samples};
  }
  function composeTitle(samples){
    const patterns=Array.from({length:8},()=>new Uint8Array(1024));
    function put(p,row,ch,sample,midi,effect=12,param=54){
      const pitch=midi===null?0:period(midi),at=(row*4+ch)*4,bytes=patterns[p];
      bytes[at]=(sample&240)|(pitch>>8);bytes[at+1]=pitch&255;bytes[at+2]=((sample&15)<<4)|effect;bytes[at+3]=param;
    }
    // Original asymmetric 3+3+2 answers over a low pedal, not a transcription
    // of a recording. Repeated notes are new picked attacks, never a held pad.
    const riffs=[
      [[0,0,2],[2,0,1],[3,0,1],[5,3,1],[6,0,1],[7,0,1],[8,5,2],[10,0,1],[11,0,1],[13,1,1],[14,0,1],[15,0,1]],
      [[0,0,1],[1,0,1],[3,0,1],[4,3,2],[6,0,1],[7,0,1],[8,0,1],[10,5,1],[11,0,1],[12,1,2],[14,0,1],[15,0,1]],
      [[0,0,2],[1,0,1],[2,0,1],[3,0,1],[4,7,1],[5,0,1],[6,3,1],[7,0,1],[8,0,2],[10,6,1],[11,5,1],[12,0,1],[13,0,1],[14,1,1],[15,3,1]],
      [[0,0,2],[6,0,1],[7,0,1],[10,3,2],[14,1,1]],
      [[0,0,2],[1,0,1],[2,0,1],[3,0,1],[4,0,1],[5,0,1],[6,5,2],[8,0,1],[9,0,1],[10,0,1],[11,0,1],[12,3,2],[14,1,1],[15,0,1]],
      [[0,0,2],[2,0,1],[3,0,1],[4,0,1],[6,3,1],[7,0,1],[8,0,2],[10,0,1],[11,0,1],[12,5,1],[14,1,1],[15,0,1]],
      [[0,0,2],[3,0,1],[4,1,2],[6,0,1],[7,0,1],[8,5,2],[10,0,1],[11,0,1],[12,3,2],[14,0,1],[15,1,1]],
      [[0,0,2],[1,0,1],[3,0,1],[4,5,2],[6,0,1],[7,0,1],[8,3,2],[10,0,1],[11,0,1],[12,1,2],[14,0,1]]
    ];
    const shifts=[[0,0,3,1],[0,0,5,3],[0,3,1,0],[0,0,1,3],[0,0,3,5],[0,3,5,1],[5,3,1,0],[0,3,1,0]];
    const solo=[62,65,69,67,64,65,70,69,67,62,64,61,65,64,60,62];
    for(let p=0;p<8;p++)for(let bar=0;bar<4;bar++){
      const start=bar*16,root=TITLE_SONG.root+shifts[p][bar],drop=p===3,riff=riffs[p];
      for(const [r,offset,sample] of riff){
        const midi=root+offset,accent=r%4===0;
        put(p,start+r,0,sample,midi,12,sample===2?57:accent?60:49);
        if(drop||r%2===0||r===15)put(p,start+r,1,4,midi,12,accent?52:43);
        if(p!==5&&p!==6)put(p,start+r,2,sample===1?16:17,midi,12,sample===2?42:accent?40:33);
      }
      if(drop){
        for(const r of [3,9,13])for(const ch of [0,1,2])put(p,start+r,ch,0,null,12,0);
        put(p,start+10,2,15,root+12,12,26);
      }else if(p===5){
        for(let r=0;r<16;r+=2)put(p,start+r,2,3,solo[(bar*5+r/2)%solo.length],12,r%4?34:41);
        // Brief articulated holes at phrase ends prevent an endless solo bed.
        if(bar%2)put(p,start+15,2,0,null,12,0);
      }else if(p===6){
        for(const r of [0,3,6,8,11,14])put(p,start+r,2,r===8?2:3,root+12+[0,7,3,10,5,1][[0,3,6,8,11,14].indexOf(r)],12,r===0?40:32);
      }
      const kit=drop?(bar===3?5:4):bar===3?(p===7?7:3):p===4?6:p===2?2:(p+bar)%2;
      put(p,start,3,7+kit,48,12,61);
      if(p===7&&bar===3)for(const ch of [0,1,2])put(p,start+15,ch,0,null,12,0);
    }
    for(const p of patterns){p[2]=(p[2]&240)|15;p[3]=6;p[14]=(p[14]&240)|15;p[15]=TITLE_SONG.bpm;}
    return {title:TITLE_SONG.moduleTitle,patterns,orders:TITLE_ORDERS,samples};
  }
  // -------------------------------------------------------------------------
  // MUS-02 — adaptive repertoire. Fast thrash and heavy doom, written as
  // processes (tempo, palm-muting, thirds, double kick), never as a
  // transcription, and synthesized by the same code as everything else. The
  // three historical world modules and the title thrash above are untouched,
  // byte for byte: this section only adds.
  //
  // Every cue is a five-track score: 0 rhythm guitar, 1 bass, 2 lead, 3 drums,
  // 4 announcement percussion. Those five tracks are exactly the five vertical
  // layers FImuse moves in and out on a bar boundary.
  // -------------------------------------------------------------------------
  const TRACKS=['rhythm','bass','lead','drums','announce'];
  const LAYER_FLOOR={rhythm:0,bass:0,drums:0,lead:.35,announce:.7};
  const KIT_KINDS=['kick','snare','hat','open','crash','tom','ride','gong','timpani'];
  function kitHits(){
    // Same seeds as the historical kit, so the shared hits are the same PCM.
    if(!percussionBank)percussionBank={};
    for(let i=0;i<KIT_KINDS.length;i++)if(!percussionBank[KIT_KINDS[i]])percussionBank[KIT_KINDS[i]]=drumHit(KIT_KINDS[i],907+i*113);
    return percussionBank;
  }
  // Grooves are drum processes per style. `variant` selects the bar flavour:
  // 0 and 6 open with a crash, 3 and 7 fill, 4 is a real stop, 5 a snare roll.
  function cueBar(style,bpm,variant,hits){
    const beat=60/bpm,step=beat/4,out=new Float32Array(ceil((beat*4+.25)*RATE));
    function hit(kind,row,velocity=1){const at=round(row*step*RATE),data=hits[kind];if(!data)return;for(let i=0;i<data.length&&at+i<out.length;i++)out[at+i]+=data[i]*velocity;}
    const fill=variant===3||variant===7,open=variant===2||variant===6,roll=variant===5,stop=variant===4;
    const rows=(a,b)=>{for(const r of a)hit(b,typeof r==='object'?r[0]:r,typeof r==='object'?r[1]:1);};
    if(stop){
      rows([[0,1.05],[10,.85],[14,.95]],'kick');rows([8],'snare');rows([0,4,8,12],'ride');hit('crash',0,.5);
    }else if(roll){
      rows([0,6,8,11,14],'kick');for(let r=8;r<16;r++)hit('snare',r,.34+(r-8)*.055);rows([0,4],'hat');hit('tom',15,.8);
    }else if(style==='thrash'||style==='blast'){
      const sixteenth=style==='thrash'&&variant%2===0||style==='blast';
      const kicks=sixteenth?Array.from({length:16},(_,i)=>[i,i%4===0?1:i%2?.72:.88]):[[0,1],[1,.86],[3,.8],[6,.95],[7,.8],[8,1],[10,.82],[11,.8],[14,.95],[15,.8]];
      rows(kicks,'kick');rows(open?[8]:[4,12],'snare');for(const r of (open?[0,4,8,12]:[0,2,4,6,8,10,12,14]))hit(open?'ride':'hat',r,open?.62:.5);
    }else if(style==='charge'){
      rows([[0,1],[2,.84],[3,.84],[6,.95],[8,1],[10,.84],[11,.84],[14,.95]],'kick');rows([[4,.85],[12,.9]],'snare');
      for(const r of [0,2,4,6,8,10,12,14])hit(open?'ride':'hat',r,r%4?.6:.86);
    }else if(style==='doom'){
      rows([[0,1.05],[6,.9],[10,.95]],'kick');rows([[8,.8]],'snare');
      for(const r of [0,4,8,12])hit(open?'ride':'hat',r,r%4?.5:.72);
    }else if(style==='dirge'){
      rows([[0,1.05]],'kick');rows([[8,.72]],'snare');for(const r of [0,8])hit('ride',r,.5);
    }else{
      rows([[0,1],[8,.95],[11,.8]],'kick');rows([[4,.85],[12,.88]],'snare');
      for(const r of [0,2,4,6,8,10,12,14])hit(open?'ride':'hat',r,r%4?.58:.82);
    }
    if(variant===0||variant===6)hit('crash',0,.66);
    if(fill){hit('snare',13,.6);hit('tom',14,.74);hit('snare',14.5,.7);hit('tom',15,.82);hit('snare',15.5,.64);}
    for(let i=0;i<out.length;i++)out[i]=tanh(out[i]*1.25)*min(1,(out.length-i)/110);
    return pcm(out,.9);
  }
  // Announcement percussion: a tuned gong and a kettle drum answer an event,
  // on the bar, over whatever the rest of the band is doing.
  function announceBar(style,bpm,variant,hits){
    const beat=60/bpm,step=beat/4,out=new Float32Array(ceil((beat*4+.3)*RATE));
    function hit(kind,row,velocity=1){const at=round(row*step*RATE),data=hits[kind];if(!data)return;for(let i=0;i<data.length&&at+i<out.length;i++)out[at+i]+=data[i]*velocity;}
    if(variant===0){hit('gong',0,.95);hit('crash',0,.4);}
    else if(variant===1){hit('timpani',0,.9);hit('timpani',4,.82);hit('timpani',8,.95);hit('timpani',12,.7);hit('gong',8,.5);}
    else if(variant===2){for(let r=8;r<16;r++)hit('tom',r,.3+(r-8)*.05);hit('crash',0,.55);hit('gong',14,.7);}
    else if(variant===3){hit('gong',0,.8);hit('timpani',10,.85);hit('timpani',14,.9);}
    else if(variant===4){hit('timpani',0,.95);hit('gong',8,.85);hit('crash',8,.42);}
    else if(variant===5){for(let r=0;r<16;r+=2)hit('timpani',r,.55+(r%8===0?.25:0));}
    else if(variant===6){hit('gong',0,1);hit('timpani',6,.8);hit('tom',12,.7);hit('crash',0,.5);}
    else{hit('timpani',0,.85);hit('timpani',2,.7);hit('gong',8,.9);hit('snare',14,.6);hit('snare',15,.7);}
    for(let i=0;i<out.length;i++)out[i]=tanh(out[i]*1.2)*min(1,(out.length-i)/120);
    return pcm(out,.86);
  }
  // Riff cells per style: rows, fret offset and instrument (1 palm-muted,
  // 2 open power chord). Thrash picks sixteenths, doom lets the notes ring.
  const RIFFS={
    thrash:[[[0,0,1],[1,0,1],[2,0,1],[3,0,1],[4,1,1],[6,0,1],[7,0,1],[8,0,1],[9,0,1],[10,3,1],[11,0,1],[12,1,1],[14,6,1],[15,0,1]],
      [[0,0,2],[2,0,1],[3,0,1],[4,0,1],[6,1,1],[7,0,1],[8,0,2],[10,0,1],[11,0,1],[12,3,1],[14,1,2],[15,0,1]]],
    charge:[[[0,0,2],[2,0,1],[3,0,1],[4,0,1],[6,0,1],[7,0,1],[8,0,2],[10,0,1],[11,0,1],[12,1,2],[14,0,1],[15,0,1]],
      [[0,0,1],[1,0,1],[3,0,1],[4,1,1],[6,0,1],[7,0,1],[8,0,1],[10,3,1],[11,0,1],[12,0,1],[14,1,1],[15,0,1]]],
    blast:[[[0,0,1],[1,0,1],[2,0,1],[3,0,1],[4,0,1],[5,0,1],[6,0,1],[7,0,1],[8,0,2],[9,0,1],[10,0,1],[11,0,1],[12,1,1],[13,0,1],[14,0,1],[15,0,1]],
      [[0,0,2],[2,0,1],[3,0,1],[4,0,1],[6,1,1],[7,0,1],[8,0,1],[10,0,1],[11,0,1],[12,0,1],[14,3,1],[15,0,1]]],
    doom:[[[0,0,2],[6,0,1],[10,0,1],[14,1,1]],[[0,0,2],[4,0,1],[8,0,1],[11,3,1],[14,0,1]]],
    dirge:[[[0,0,2],[8,0,1]],[[0,0,2],[6,0,1],[12,1,1]]],
    rock:[[[0,0,2],[3,0,1],[6,0,1],[8,0,2],[11,0,1],[14,1,1]],[[0,0,1],[2,0,1],[4,1,1],[6,0,1],[8,0,2],[12,0,1],[14,3,1]]]
  };
  // Lead answers: diatonic thirds of the dark mode, never a parallel shift.
  const LEADS={
    thrash:[[64,67,65,64,70,67,65,62],[64,65,70,67,64,62,65,67],[62,65,68,65,64,67,71,68]],
    doom:[[52,55,53,52,58,55,53,50],[53,55,60,58,55,53,52,55]],
    rock:[[60,63,65,63,60,67,65,63],[62,65,67,65,62,69,67,65]]
  };
  const CUE_DEFS={
    calm:{title:'Veille basse',moduleTitle:'METAL - VEILLE BASSE',style:'Doom lent',bpm:72,root:36,groove:'dirge',lead:'doom',
      form:['pad','pad','answer','pad'],shifts:[[0,0,3,1],[0,0,1,-2],[0,3,1,0],[0,1,5,0]],layers:['bass','rhythm','lead','drums'],
      announce:[1,3],intensity:.1},
    doom1:{title:'Chape de fer',moduleTitle:'METAL - CHAPE DE FER',style:'Doom lourd',bpm:62,root:35,groove:'doom',lead:'doom',
      form:['riff','riff','answer','riff','break','riff','turn','riff'],shifts:[[0,0,1,-2],[0,0,3,1],[0,5,1,0],[0,1,6,0],[0,3,1,5],[0,1,-2,0],[0,3,5,1],[0,0,1,3]],
      layers:['rhythm','bass','lead','drums'],announce:[0,4],intensity:.3},
    doom2:{title:'Puits de sel',moduleTitle:'METAL - PUITS DE SEL',style:'Doom pesant',bpm:54,root:34,groove:'doom',lead:'doom',
      form:['riff','answer','riff','break','riff','turn','riff','riff'],shifts:[[0,0,-2,1],[0,-2,3,1],[0,3,-2,5],[0,1,-2,0],[0,3,5,1],[3,1,-2,0],[0,0,1,5],[0,5,3,1]],
      layers:['rhythm','bass','lead','drums'],announce:[3,6],intensity:.35},
    thrash1:{title:'Rouille vive',moduleTitle:'METAL - ROUILLE VIVE',style:'Thrash',bpm:196,root:38,groove:'thrash',lead:'thrash',
      form:['riff','riff','answer','riff','climax','riff','turn','riff'],shifts:[[0,0,1,6],[0,0,3,1],[3,1,0,0],[0,6,1,0],[0,3,1,5],[0,1,3,0],[0,5,1,3],[0,0,6,1]],
      layers:['rhythm','bass','lead','drums'],announce:[0,2],intensity:.55},
    thrash2:{title:'Scie noire',moduleTitle:'METAL - SCIE NOIRE',style:'Thrash rapide',bpm:208,root:39,groove:'charge',lead:'thrash',
      form:['riff','riff','climax','riff','answer','riff','turn','climax'],shifts:[[0,0,3,1],[0,3,1,0],[0,0,5,3],[0,1,6,0],[0,0,1,3],[0,5,3,1],[0,0,1,-2],[0,3,5,1]],
      layers:['rhythm','bass','lead','drums'],announce:[1,6],intensity:.6},
    combat:{title:'Meute',moduleTitle:'METAL - MEUTE',style:'Thrash rapide',bpm:214,root:40,groove:'thrash',lead:'thrash',
      form:['riff','riff','climax','answer','riff','turn','climax','riff'],shifts:[[0,0,1,3],[0,3,1,0],[0,0,5,1],[3,1,0,0],[0,6,1,0],[0,3,1,5],[0,0,3,6],[0,1,-2,0]],
      layers:['rhythm','bass','lead','drums','announce'],announce:[0,1,2,4],intensity:.8},
    boss:{title:'Colosse',moduleTitle:'METAL - COLOSSE',style:'Groove lourd',bpm:152,root:36,groove:'charge',lead:'doom',
      form:['riff','riff','break','answer','riff','climax','turn','riff'],shifts:[[0,0,1,-2],[0,0,3,5],[0,6,1,0],[0,3,1,0],[0,0,5,3],[0,1,6,0],[0,3,-2,1],[0,0,1,3]],
      layers:['rhythm','bass','lead','drums','announce'],announce:[0,1,3,4,6],intensity:.9},
    victory:{title:'Acier tenu',moduleTitle:'METAL - ACIER TENU',style:'Métal héroïque',bpm:128,root:40,groove:'rock',lead:'rock',
      form:['intro','riff','answer','climax','riff','climax'],shifts:[[0,0,3,5],[0,0,1,3],[0,4,1,0],[0,0,7,3],[0,3,1,0],[0,0,5,7]],
      layers:['rhythm','bass','lead','drums','announce'],announce:[0,4,6],intensity:.7}
  };
  const CUE_IDS=Object.keys(CUE_DEFS);
  const TRANSITIONS=[['fill','fill',1],['roll','roll',2],['bridge','bridge',2]];
  function cueInstrument(id,index){
    // Per-cue guitars: new pick attacks from new seeds, so no two cues share a
    // strum, and none of them borrows the historical world bank.
    const key=id+'#'+index;
    if(!cueBanks.has(key)){
      const spec=[['MTL ADAPT PALM','thrashPalm',[0,7,12],.26],['MTL ADAPT POWER','thrashOpen',[0,7,12],1.25],
        ['MTL ADAPT LEAD','thrashLead',[0],1.0],['MTL ADAPT THIRD','lead',[0,3],1.4]][index];
      cueBanks.set(key,{name:spec[0],volume:index===2?40:56,pcm:strings(spec[1],spec[2],spec[3],7001+index*337+CUE_IDS.indexOf(id)*97)});
    }
    return cueBanks.get(key);
  }
  function composeCue(id,def,samples){
    const kinds=Array.from(new Set(def.form.concat(['fill','roll','bridge']))),patternOf=new Map(kinds.map((k,i)=>[k,i]));
    const patterns=kinds.map(()=>new Uint8Array(64*TRACKS.length*4)),shiftOf={};
    def.form.forEach((kind,i)=>{if(!(kind in shiftOf))shiftOf[kind]=def.shifts[i%def.shifts.length];});
    function put(pattern,row,track,sample,midi,effect=12,param=52){
      const pitch=midi===null?0:period(clamp(midi,36,79)),at=(row*TRACKS.length+track)*4,p=patterns[pattern];
      p[at]=(sample&240)|(pitch>>8);p[at+1]=pitch&255;p[at+2]=((sample&15)<<4)|effect;p[at+3]=param;
    }
    // Sample numbers: 1..6 the shared synthesized instruments, 7..14 the baked
    // drum bars of this groove, 15 the tritone texture, 16..23 the baked
    // announcement bars, 24..27 this cue's own guitars.
    const PALM=24,POWER=25,SOLO=26,THIRD=27,BASS=4;
    for(const kind of kinds){
      const pattern=patternOf.get(kind),join=kind==='fill'||kind==='roll'||kind==='bridge';
      for(let bar=0;bar<4;bar++){
        const start=bar*16,drop=kind==='break',half=kind==='bridge';
        const root=def.root+(join?0:(shiftOf[kind]||[0,0,0,0])[bar]);
        const cells=drop?RIFFS.doom[1]:(RIFFS[def.groove]||RIFFS.rock)[(bar+kind.length)%2];
        const announce=16+(def.announce[(bar+pattern)%def.announce.length]%8);
        if(join){
          // Written joins: a rising run over the roll, never a random fade.
          const step=half?2:1;
          for(let r=0;r<16;r+=step)put(pattern,start+r,2,SOLO,clamp(root+12+(r/step|0)+bar*2,36,79),12,26+(r%4)*3);
          put(pattern,start,3,7+(rollBar(kind,bar)),48,12,58);
          put(pattern,start,4,announce,48,12,56);
        }else if(kind==='bridge'){
          put(pattern,start,0,POWER,clamp(root,36,59),12,50);put(pattern,start+8,0,0,null,12,0);
          put(pattern,start,1,BASS,clamp(root-12,36,59),12,46);
          put(pattern,start,2,SOLO,clamp(root+6,36,79),12,30);
          put(pattern,start,4,announce,48,12,54);
        }else{
          for(const [r,offset,sample] of cells){
            const note=clamp(root+offset,36,59),accent=r%4===0;
            put(pattern,start+r,0,sample===2?POWER:PALM,note,12,sample===2?56:accent?58:47);
            if(def.groove==='doom'||def.groove==='dirge'||r%2===0||r===15)put(pattern,start+r,1,BASS,clamp(note-12,36,59),12,accent?52:44);
          }
          if(kind==='answer'||kind==='climax'||kind==='intro'){
            const line=LEADS[def.lead]?LEADS[def.lead][(bar+pattern)%LEADS[def.lead].length]:LEADS.rock[(bar+pattern)%LEADS.rock.length];
            for(let r=0;r<16;r+=2){const index=(bar*4+r/2)%line.length;put(pattern,start+r,2,index%3===1?THIRD:SOLO,clamp(line[index]+(kind==='climax'?7:0),36,79),12,r===0?40:32);}
            if(bar%2)put(pattern,start+15,2,0,null,12,0);
          }else if(kind==='turn'){
            put(pattern,start+4,2,SOLO,clamp(root+12,36,79),12,34);put(pattern,start+7,2,0,null,12,0);
            put(pattern,start+12,2,THIRD,clamp(root+15,36,79),12,30);
          }else if(kind==='pad'){
            for(let r=0;r<16;r+=4)put(pattern,start+r,2,SOLO,clamp(root+12+(r/4%3)*3,36,79),12,r===0?26:20);
          }
          if(drop)for(const r of [3,7,11,15])for(const track of [0,1,2])put(pattern,start+r,track,0,null,12,0);
          const kit=drop?4:bar===3?3:(bar+pattern)%2;
          put(pattern,start,3,7+kit,48,12,60);
          if(def.layers.includes('announce')&&bar%2===1)put(pattern,start,4,announce,48,12,52);
        }
        if(kind==='fill'&&bar===3)for(const track of [0,1,2])put(pattern,start+15,track,0,null,12,0);
      }
      const p=patterns[pattern];p[2]=(p[2]&240)|15;p[3]=6;p[14]=(p[14]&240)|15;p[15]=def.bpm;
    }
    const segments=Object.create(null);
    def.form.forEach((kind,i)=>{segments['s'+i]={pattern:patternOf.get(kind),bars:4,layers:def.layers.slice()};});
    for(const [name,,bars] of TRANSITIONS)segments['t'+name]={pattern:patternOf.get(name),bars,layers:['drums','announce','lead']};
    const bytes=new Uint8Array(patterns.reduce((n,p)=>n+p.length,0));
    let at=0;for(const p of patterns){bytes.set(p,at);at+=p.length;}
    return {title:def.moduleTitle,bpm:def.bpm,speed:6,channels:TRACKS.length,stride:TRACKS.length*4,header:0,
      bytes,patterns,segments,order:def.form.map((_,i)=>'s'+i),samples};
  }
  // A join gets its own drum bar: a roll for the roll, a stop for the bridge.
  function rollBar(kind,bar){return kind==='roll'?5:kind==='bridge'?4:bar===3?3:(bar+1)%2;}
  function cueSteps(id){
    id=String(id);if(cueModules.has(id))return null;
    const def=CUE_DEFS[id];if(!def)return null;
    const built={samples:Array.from({length:6},(_,i)=>instrument(i)),score:null};
    const phases=[];
    for(let i=0;i<6;i++)phases.push(function instrumentPhase(){built.samples[i]=instrument(i);});
    for(let i=0;i<4;i++)phases.push(function guitarPhase(){built.samples[23+i]=cueInstrument(id,i);});
    for(let i=0;i<8;i++){const bar=i;phases.push(function kitBar(){built.samples[6+bar]={name:'MTL ADAPT '+def.bpm+' '+String.fromCharCode(65+bar),volume:60,pcm:cueBar(def.groove,def.bpm,bar,kitHits())};});}
    phases.push(function tensionPhase(){if(!tensionSample)tensionSample={name:'MTL TRITONE SCRAPE',volume:32,pcm:strings('open',[0,6,12],1.85,4101)};built.samples[14]=tensionSample;});
    for(let i=0;i<8;i++){const bar=i;phases.push(function announceBarPhase(){built.samples[15+bar]={name:'MTL ANNOUNCE '+def.bpm+' '+String.fromCharCode(65+bar),volume:56,pcm:announceBar(def.groove,def.bpm,bar,kitHits())};});}
    phases.push(function composePhase(){cueModules.set(id,composeCue(id,def,built.samples));});
    return {phases};
  }
  function cueFor(id){
    id=String(id);
    if(!cueModules.has(id)){const steps=cueSteps(id);if(!steps)return null;for(const phase of steps.phases)phase();}
    return cueModules.get(id);
  }
  function cueBytes(id){const score=cueFor(id);return score?score.patterns.reduce((n,p)=>n+p.length,0):0;}
  function isCue(id){return Object.prototype.hasOwnProperty.call(CUE_DEFS,String(id));}
  function cueTrack(id){const def=CUE_DEFS[String(id)];return {title:def.title,bpm:def.bpm,style:def.style,duration:def.form.length*16*60/def.bpm,channels:TRACKS.length};}
  function cueLayerMin(id){const def=CUE_DEFS[String(id)],min={};for(const track of TRACKS)min[track]=LAYER_FLOOR[track];if(def.intensity!==undefined)min.lead=Math.max(0,Math.min(.9,def.intensity-.35));return min;}
  function serialize(score){
    const size=1084+score.patterns.length*1024+score.samples.reduce((n,s)=>n+s.pcm.length,0),bytes=new Uint8Array(size);
    const word=(at,v)=>{bytes[at]=v>>8;bytes[at+1]=v&255;},text=(at,s,n)=>{for(let i=0;i<min(n,s.length);i++)bytes[at+i]=s.charCodeAt(i)&127;};
    text(0,score.title,20);
    for(let i=0;i<31;i++){
      const at=20+i*30,s=score.samples[i];
      if(s){text(at,s.name,22);word(at+22,s.pcm.length/2);bytes[at+25]=s.volume;}
      else if(i===28)text(at,'#ORIGINAL SYNTH MUSIC',22);else if(i===29)text(at,'#ALL PCM MADE BY CODE',22);
      word(at+28,1);
    }
    bytes[950]=score.orders.length;bytes[951]=0;bytes.set(score.orders,952);text(1080,'M.K.',4);
    let offset=1084;for(const p of score.patterns){bytes.set(p,offset);offset+=p.length;}
    for(const s of score.samples){bytes.set(new Uint8Array(s.pcm.buffer,s.pcm.byteOffset,s.pcm.length),offset);offset+=s.pcm.length;}
    return bytes;
  }
  function decode(bytes){
    const order=Array.from(bytes.slice(952,952+bytes[950])),count=max(...order)+1,samples=[];let offset=1084+count*1024;
    for(let i=0;i<31;i++){
      const at=20+i*30,length=((bytes[at+22]<<8)|bytes[at+23])*2;
      samples.push({pcm:new Int8Array(bytes.buffer,bytes.byteOffset+offset,length),volume:bytes[at+25]});offset+=length;
    }
    return {bytes,order,samples,bpm:bytes[1099],speed:bytes[1087]};
  }
  const INSTRUMENTS=[
    ['MTL PALM POWER',58,'palm',[0,7,12],.29,313],
    ['MTL OPEN POWER',56,'open',[0,7,12],1.7,691],
    ['MTL LEAD',40,'lead',[0],1.5,1281],
    ['MTL BASS',52,'bass',[0,12],.95,701],
    ['MTL MINOR THIRD',40,'lead',[0,3],1.5,1901],
    ['MTL MAJOR THIRD',40,'lead',[0,4],1.5,2171]
  ];
  function instrument(index){
    if(!instrumentBank)instrumentBank=[];
    if(!instrumentBank[index]){const [name,volume,kind,notes,seconds,seed]=INSTRUMENTS[index];instrumentBank[index]={name,volume,pcm:strings(kind,notes,seconds,seed)};}
    return instrumentBank[index];
  }
  function titleInstrument(index){
    if(!titleBank)titleBank=[];
    if(!titleBank[index]){
      const settings=[['MTL THRASH PALM','thrashPalm',[0,7,12],.27,5917],['MTL THRASH POWER','thrashOpen',[0,7,12],1.3,6043],['MTL THRASH LEAD','thrashLead',[0],1.05,6269],['MTL THRASH PALM R','thrashPalm',[0,7,12],.27,6421],['MTL THRASH POWER R','thrashOpen',[0,7,12],1.3,6653]][index];
      const [name,kind,notes,seconds,seed]=settings;
      titleBank[index]={name,volume:index===2?39:57,pcm:strings(kind,notes,seconds,seed)};
    }
    return titleBank[index];
  }
  // A score key is '0','1','2','title' for the historical modules and a name
  // for the adaptive cues. Descriptors are built without synthesizing: the
  // director only needs the shape of the arrangement, never its PCM.
  function keyOf(value){return isCue(value)?String(value):value==='title'?'title':String(stageOf(value));}
  const LEGACY_LAYERS=['rhythm','bass','lead','drums'];
  // The historical modules carry no written join of their own, and their
  // exported bytes must stay untouched. The join is therefore appended to the
  // score the player reads, never to the module: one bar of roll under a
  // rising lead, built from the kit bars and the lead instrument the module
  // already owns.
  function legacyJoin(bpm){
    const p=new Uint8Array(1024);
    function put(row,channel,sample,midi,effect,param){
      const pitch=midi===null?0:period(clamp(midi,36,79)),at=(row*4+channel)*4;
      p[at]=(sample&240)|(pitch>>8);p[at+1]=pitch&255;p[at+2]=((sample&15)<<4)|effect;p[at+3]=param;
    }
    put(0,3,12,48,12,62);
    for(let r=0;r<16;r+=2)put(r,2,3,clamp(52+(r>>1),36,79),12,28+(r%4)*2);
    p[2]=(p[2]&240)|15;p[3]=6;p[14]=(p[14]&240)|15;p[15]=bpm;
    return p;
  }
  function legacyDescriptor(key,seed){
    const title=key==='title',orders=title?TITLE_ORDERS:seed===undefined?WORLD_ORDERS[Number(key)]:Array(LOOP_POSITIONS).fill(0),song=title?TITLE_SONG:SONGS[Number(key)];
    const segments=Object.create(null);
    orders.forEach((p,k)=>{segments['s'+k]={bars:4,layers:LEGACY_LAYERS.slice()};});
    segments.tfill={bars:1,layers:['drums','lead']};
    const layerMin={};for(const track of TRACKS)layerMin[track]=LAYER_FLOOR[track];
    layerMin.announce=1.1;
    return {bpm:song.bpm,entry:'s0',order:orders.map((_,k)=>'s'+k),segments,layerMin,
      transitions:[{from:'*',to:'*',kind:'fill',segment:'tfill',bars:1}]};
  }
  function cueDescriptor(id){
    const def=CUE_DEFS[String(id)],segments=Object.create(null);
    def.form.forEach((kind,i)=>{segments['s'+i]={bars:4,layers:def.layers.slice()};});
    for(const [name,,bars] of TRANSITIONS)segments['t'+name]={bars,layers:['drums','announce','lead']};
    return {bpm:def.bpm,entry:'s0',order:def.form.map((_,i)=>'s'+i),segments,layerMin:cueLayerMin(id),
      transitions:[{from:'*',to:'*',kind:'fill',segment:'tfill',bars:1},{from:'*',to:'*',kind:'bridge',segment:'tbridge',bars:2}]};
  }
  const ALL_KEYS=['0','1','2','title'].concat(CUE_IDS);
  function descriptorTable(seed){
    const cues=Object.create(null);
    for(const key of ALL_KEYS)cues[key]=key==='0'||key==='1'||key==='2'||key==='title'?legacyDescriptor(key,seed):cueDescriptor(key);
    return cues;
  }
  function legacyScore(key,seed){
    const module=moduleFor(key==='title'?'title':Number(key),seed),segments=Object.create(null);
    module.order.forEach((p,k)=>{segments['s'+k]={pattern:p,bars:4,layers:LEGACY_LAYERS.slice()};});
    const join=Math.max.apply(null,module.order)+1;
    segments.tfill={pattern:join,bars:1,layers:['drums','lead']};
    // The player reads the module bytes plus the appended join bar; the module
    // itself, and therefore getModule(), is never modified.
    const bytes=new Uint8Array(module.bytes.length+1024);
    bytes.set(module.bytes,0);bytes.set(legacyJoin(module.bpm),1084+join*1024);
    return {title:module.title,bpm:module.bpm,speed:module.speed,channels:4,stride:16,header:1084,bytes,
      segments,order:module.order.map((_,k)=>'s'+k),samples:module.samples};
  }
  const scoreCache=new Map();
  function scoreOf(key,seed){
    const id=isCue(key)||key==='title'||seed===undefined?key:key+'/'+seed;
    if(scoreCache.has(id))return scoreCache.get(id);
    const score=isCue(key)?cueFor(key):legacyScore(key,seed);
    if(id!==key)for(const old of scoreCache.keys())if(old!==key&&old.startsWith(key+'/'))scoreCache.delete(old);
    scoreCache.set(id,score);return score;
  }
  // Without FImuse (a host that ships music.js alone) the player still needs a
  // transport: a plain cyclic walk of the order, all layers open.
  function fallbackDirector(options){
    const cues=options.cues||{};
    let id=cues[options.cue]!==undefined?options.cue:Object.keys(cues)[0],position=0,bar=0,pending=null,quantized=0;
    const stats={barIndex:0,switches:0,transitions:0,ignored:0,layerChanges:0,pending:'',transition:''};
    return {
      nextBar(){
        if(pending){id=pending;pending=null;position=0;bar=0;stats.pending='';stats.switches++;}
        const cue=cues[id],name=cue.order[position],segment=cue.segments[name];
        const layers=(segment.layers||[]).filter(layer=>(cue.layerMin[layer]||0)<=quantized);
        const out={cue:id,segment:name,bar,bars:segment.bars,index:stats.barIndex,layers,transition:null,tempo:cue.bpm,intensity:quantized,pending:pending||''};
        // The plain transport still has to walk the form: bar, then segment.
        if(bar+1>=segment.bars){bar=0;position=(position+1)%cue.order.length;}else bar++;
        stats.barIndex++;
        return out;
      },
      request(target,meta){
        const info=meta||{};if(!cues[target])return false;
        if(!info.force&&(target===id||pending===target))return false;
        pending=target;stats.pending=target;return true;
      },
      setIntensity(value){const next=Math.max(0,Math.min(1,Number(value)||0));if(next===quantized)return false;quantized=next;stats.layerChanges++;return true;},
      realign(){bar=0;},
      state(){const cue=cues[id],name=cue.order[position];return {cue:id,segment:name,bar,bars:cue.segments[name].bars,barIndex:stats.barIndex,intensity:quantized,pending:pending||'',transition:'',layers:[]};},
      stats,reset(target){id=cues[target]?target:id;position=0;bar=0;pending=null;stats.pending='';stats.barIndex=0;}
    };
  }
  function cacheKey(value,seed){const key=keyOf(value);return isCue(key)||key==='title'||seed===undefined?key:key+'/'+seed;}
  function cloneData(value,seen=new Map()){
    if(!value||typeof value!=='object')return value;if(seen.has(value))return seen.get(value);
    if(ArrayBuffer.isView(value)){const copy=new value.constructor(value);seen.set(value,copy);return copy;}
    const copy=Array.isArray(value)?[]:{};seen.set(value,copy);for(const key of Object.keys(value))copy[key]=cloneData(value[key],seen);return copy;
  }
  function prepared(value,seed){
    const key=keyOf(value);if(isCue(key)||key==='title')seed=undefined;
    return cloneData({key,seed,score:scoreOf(key,seed),module:isCue(key)?null:moduleFor(key==='title'?'title':Number(key),seed)});
  }
  function adoptPrepared(packet){
    if(!packet||keyOf(packet.key)!==packet.key||packet.seed!==undefined&&!Number.isFinite(packet.seed))return false;
    const key=packet.key,score=packet.score,id=cacheKey(key,packet.seed);
    const samplesOK=q=>q&&Array.isArray(q.samples)&&q.samples.length<=31&&q.samples.every(v=>v&&v.pcm instanceof Int8Array&&v.pcm.length<=131072&&Number.isFinite(v.volume));
    if(!samplesOK(score)||!(score.bytes instanceof Uint8Array)||score.bytes.length>1048576||!Number.isFinite(score.bpm)||score.bpm<30||score.bpm>255||![4,5].includes(score.channels)||!Array.isArray(score.order)||!score.order.length||!score.segments)return false;
    for(const name of score.order){const q=score.segments[name];if(!q||!Number.isInteger(q.pattern)||q.pattern<0||q.pattern*64*score.channels*4>=score.bytes.length||!Number.isInteger(q.bars)||q.bars<1)return false;}
    if(!isCue(key)&&(!samplesOK(packet.module)||!(packet.module.bytes instanceof Uint8Array)||packet.module.bytes.length<1084||!Array.isArray(packet.module.order)))return false;
    if(id!==key)for(const old of scoreCache.keys())if(old!==key&&old.startsWith(key+'/'))scoreCache.delete(old);
    scoreCache.set(id,score);
    if(isCue(key))cueModules.set(key,score);
    else{const stage=key==='title'?'title':Number(key),mk=packet.seed===undefined?stage:stage+'/'+packet.seed;
      if(mk!==stage)for(const old of modules.keys())if(old!==stage&&String(old).startsWith(stage+'/'))modules.delete(old);
      modules.set(mk,packet.module);}
    return true;
  }
  let preparation=Promise.resolve(),preparer=null;const preparing=new Map();
  function setPreparer(fn){preparer=typeof fn==='function'?fn:null;}
  function warmup(value,seed){
    const key=keyOf(value),cue=isCue(key);if(cue||key==='title')seed=undefined;
    const id=cacheKey(key,seed),stage=key==='title'?'title':Number(key),mk=seed===undefined?stage:stage+'/'+seed;
    const info=()=>({...getTrack(key,seed),bytes:cue?cueBytes(key):moduleFor(stage,seed).bytes.length});
    if(cue?cueModules.has(key):modules.has(mk))return Promise.resolve(info());
    if(preparing.has(id))return preparing.get(id);
    const pause=()=>new Promise(resolve=>typeof G.setTimeout==='function'?G.setTimeout(resolve,0):resolve());
    const task=preparation.then(async()=>{
      if(preparer)try{const packet=await preparer(key,seed);if(packet&&adoptPrepared(packet))return info();}catch{}
      // The fallback retains yielding instrument phases and the same score.
      for(let i=0;i<6;i++)if(!instrumentBank?.[i]){await pause();instrument(i);}
      if(key==='title')for(let i=0;i<5;i++)if(!titleBank?.[i]){await pause();titleInstrument(i);}
      if(!tensionSample){await pause();tensionSample={name:'MTL TRITONE SCRAPE',volume:32,pcm:strings('open',[0,6,12],1.85,4101)};}
      const steps=cue?cueSteps(key):moduleSteps(stage,seed);
      if(steps)for(const phase of steps.phases){await pause();phase();}
      await pause();return info();
    });
    preparing.set(id,task);preparation=task.catch(()=>{});
    task.then(()=>preparing.delete(id),()=>preparing.delete(id));return task;
  }
  function moduleSteps(stage,seed){
    // LOAD-13: the expensive phases of a module — drum kit, compose, serialize,
    // decode — are separate resumable sub-tasks, so warmup can yield between them
    // and a loading screen paints inside the budget. The kit is itself cut per
    // bar: eight bars and a crash sample in one block were the last slice that
    // no audio budget could cover (19 to 22 ms on the title). `phases` is the
    // fine-grained list warmup walks; kit/compose/serialize/decode stay the
    // coarse API moduleFor uses, and run exactly the same calls in order.
    // Running them back to back is exactly what moduleFor always did.
    stage=stageOf(stage);const key=seed===undefined?stage:stage+'/'+seed;if(modules.has(key))return null;
    const title=stage==='title',song=songOf(stage),built={title,samples:Array.from({length:6},(_,i)=>title&&i<3?titleInstrument(i):instrument(i)),score:null,bytes:null};
    const kitPhases=[];
    for(const [i,kind] of ['kick','snare','hat','open','crash','tom','ride'].entries())kitPhases.push(function kitDrum(){
      if(!percussionBank)percussionBank={};
      if(!percussionBank[kind])percussionBank[kind]=drumHit(kind,907+i*113);
    });
    for(let i=0;i<8;i++){const bar=i;kitPhases.push(function kitBar(){built.samples.push({name:'MTL KIT '+song.bpm+' '+String.fromCharCode(65+bar),volume:60,pcm:title?titleDrumBar(bar,percussionBank):drumBar(stage,bar,percussionBank)});});}
    kitPhases.push(function kitExtras(){
      if(!tensionSample)tensionSample={name:'MTL TRITONE SCRAPE',volume:32,pcm:strings('open',[0,6,12],1.85,4101)};
      built.samples.push(tensionSample);
      if(title)built.samples.push(titleInstrument(3),titleInstrument(4));
    });
    const composePhase=function(){built.score=title?composeTitle(built.samples):compose(stage,built.samples,seed);};
    const serializePhase=function(){built.bytes=serialize(built.score);};
    const decodePhase=function(){if(modules.has(key))return;
      // un seul module varie par morceau en memoire (225 a 300 Ko) : on evicte les
      // graines precedentes du meme morceau, jamais le module sans graine.
      if(key!==stage)for(const k of modules.keys())if(k!==stage&&String(k).indexOf(stage+'/')===0)modules.delete(k);
      modules.set(key,decode(built.bytes));};
    return {
      kit(){for(const phase of kitPhases)phase();},
      compose(){composePhase();},
      serialize(){serializePhase();},
      decode(){decodePhase();},
      phases:kitPhases.concat([composePhase,serializePhase,decodePhase])
    };
  }
  function moduleFor(stage,seed){
    stage=stageOf(stage);
    const steps=moduleSteps(stage,seed);
    if(steps){steps.kit();steps.compose();steps.serialize();steps.decode();}
    return modules.get(seed===undefined?stage:stage+'/'+seed);
  }
  function getModule(value,seed){
    if(isCue(value)){
      // Adaptive cues have no MOD container: the exported bytes are their
      // concatenated five-track pattern tables, which is what the tracker reads.
      const score=cueFor(String(value)),total=score.patterns.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);
      let at=0;for(const p of score.patterns){out.set(p,at);at+=p.length;}return out;
    }
    return moduleFor(value==='title'?'title':stageOf(value),seed).bytes.slice();
  }
  function getTrack(value,seed){
    if(isCue(value))return cueTrack(String(value));
    const stage=value==='title'?'title':stageOf(value),song=songOf(stage);
    return {title:song.title,bpm:song.bpm,style:song.style,duration:(stage==='title'?TITLE_ORDERS.length*960:(seed===undefined?BASE_POSITIONS:LOOP_POSITIONS)*960)/song.bpm,channels:4};
  }
  function create(ctx,output){
    let key='0',seed,threat=0,volume=.4,playing=false,disposed=false,score=null,bpm=125,speed=6;
    let rowInBar=0,nextTime=null,plan=null,planSegment=null;
    const voices=new Set(),buffers=new Map(),nodes=[],tracks=[],stats={activeVoices:0,peakVoices:0,scheduledRows:0,scheduledNotes:0,resyncs:0,playing:false,stage:0,order:0,row:0,tempo:100,cue:'0',bar:0,layers:'',transition:''};
    const events=Array.from({length:TRACKS.length},()=>({sample:0,pitch:0,effect:0,param:0}));
    const ready=!!(ctx&&output&&ctx.createBuffer&&ctx.createBufferSource&&ctx.createGain),remember=n=>(nodes.push(n),n);
    // MIX-11: un contexte hors ligne (OfflineAudioContext) na jamais dhorloge ni
    // de peripherique a attendre : il est « en cours » des la creation, ce qui
    // laisse le banc rendre le meme morceau que le jeu. Un AudioContext normal
    // na pas de startRendering et garde donc la meme regle quavant.
    const offline=!!(ctx&&typeof ctx.startRendering==='function');
    const master=ready?remember(ctx.createGain()):null;
    if(master){master.gain.value=0;master.connect(output);for(let i=0;i<TRACKS.length;i++){
      const gain=remember(ctx.createGain()),pan=remember(ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain());
      if(pan.pan)pan.pan.value=[-.32,-.06,.32,.06,0][i];gain.connect(pan);pan.connect(master);
      tracks.push({gain,voice:null,sample:0,period:428,volume:64});
    }
    // MUS-02: one layer gate per track, between the note envelope and the
    // track fader. A layer enters or leaves on the bar without ever rewriting
    // the mix levels the mixer owns, and without cutting a note mid-ring.
    for(const t of tracks){t.gate=remember(ctx.createGain());t.gate.gain.value=1;t.gate.connect(t.gain);}
    }
    let cueTable=descriptorTable();
    let director=(G.FImuse?G.FImuse:{create:fallbackDirector}).create({cues:cueTable,cue:key,intensityStep:.05});
    function cleanup(v){if(!voices.delete(v))return;for(const n of [v.source,v.gain])try{n.disconnect();}catch(_){}if(tracks[v.track]?.voice===v)tracks[v.track].voice=null;stats.activeVoices=voices.size;}
    function stopAll(immediate=false){
      if(!ready)return;const now=ctx.currentTime;
      for(const v of voices){
        try{v.gain.gain.cancelScheduledValues(now);v.gain.gain.setTargetAtTime(.0001,now,.003);v.source.stop(now+(immediate?0:.015));}catch(_){}
        v.end=now+(immediate?0:.015);if(immediate)cleanup(v);
      }
      for(const t of tracks){t.voice=null;t.sample=0;t.volume=64;}
    }
    function mix(){if(!ready||disposed)return;const now=ctx.currentTime,levels=key==='title'?[.86,.72,.52,.93,.9]:[.94+threat*.04,.78,.30+threat*.22,.95+threat*.08,.9];tracks.forEach((t,i)=>t.gain.gain.setTargetAtTime(levels[i],now,.07));}
    function level(){if(!master||disposed)return;const now=ctx.currentTime;master.gain.cancelScheduledValues(now);master.gain.setTargetAtTime(playing?volume:0,now,.012);}
    // RESTE-09: la ligne à lire est calculée une fois par mesure, pas par
    // ligne : la table, le motif et la mesure ne changent qu'au bord de mesure.
    let rowBase=0,stride=16,channels=4,bytes=null,slot=0;
    function load(){if(score)return;score=scoreOf(key,seed);bpm=score.bpm;speed=score.speed;stats.tempo=bpm;stride=score.stride;channels=score.channels;bytes=score.bytes;slot=slotOf(key);}
    // Les tampons d'instruments sont partagés par pièce et par numéro : la clé
    // reste un nombre, une concaténation par note se paierait à chaque note.
    const slots=new Map();
    function slotOf(value){
      let at=slots.get(value);
      if(at===undefined){const cue=CUE_IDS.indexOf(value);at=(cue>=0?4+cue:value==='title'?3:Number(value))*32;slots.set(value,at);}
      return at;
    }
    function buffer(sample,whichKey=key,whichSeed=seed){
      const cacheKey=(whichKey===key?slot:slotOf(whichKey))+sample;
      if(buffers.has(cacheKey))return buffers.get(cacheKey);
      const source=whichKey===key&&score?score:scoreOf(whichKey,whichSeed),data=source.samples[sample-1].pcm,b=ctx.createBuffer(1,data.length,RATE),channel=b.getChannelData(0);for(let i=0;i<data.length;i++)channel[i]=data[i]/128;
      buffers.set(cacheKey,b);return b;
    }
    function note(track,sample,pitch,time){
      const t=tracks[track],instrument=score.samples[sample-1];if(!instrument||instrument.pcm.length<4)return;
      if(t.voice&&t.voice.end>time){const old=t.voice;old.gain.gain.setTargetAtTime(.0001,time,.0015);try{old.source.stop(time+.008);}catch(_){}old.end=time+.008;}
      if(voices.size>=MAX_VOICES)return;
      const source=ctx.createBufferSource(),gain=ctx.createGain(),b=buffer(sample),rate=428/pitch,end=time+b.duration/rate;
      source.buffer=b;source.playbackRate.setValueAtTime(rate,time);gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(t.volume/64,time+.0015);
      source.connect(gain);gain.connect(t.gate);
      const v={source,gain,track,end};voices.add(v);t.voice=v;source.onended=()=>cleanup(v);source.start(time);source.stop(end+.001);
      stats.scheduledNotes++;stats.activeVoices=voices.size;stats.peakVoices=max(stats.peakVoices,voices.size);
    }
    function applyCue(next){
      if(next===key)return;
      key=next;score=null;rowInBar=0;load();
      stats.stage=key==='title'?'title':(isCue(key)?key:Number(key));stats.cue=key;mix();
    }
    // The bar is the unit of synchronization: the director is asked exactly
    // once per bar, immediately before that bar is scheduled, so a layer move
    // or a written join always lands on the bar line and never mid-note.
    function startBar(time){
      plan=director.nextBar();
      if(plan.cue!==key)applyCue(plan.cue);
      planSegment=score.segments[plan.segment]||score.segments[score.order[0]];
      rowBase=score.header+(planSegment.pattern*64+plan.bar*16)*stride;
      for(let i=0;i<tracks.length;i++)tracks[i].gate.gain.setTargetAtTime(plan.layers.indexOf(TRACKS[i])>=0?1:0,time,.012);
      stats.bar=plan.bar;stats.layers=plan.layers.join(',');stats.transition=plan.transition||'';
    }
    function schedule(time){
      if(rowInBar===0)startBar(time);
      const base=rowBase+rowInBar*stride;
      // RESTE-09: the channel records of a row are allocated once per instance
      // and refilled, so a scheduled row allocates nothing.
      for(let channel=0;channel<channels;channel++){
        const at=base+channel*4,a=bytes[at],b=bytes[at+1],c=bytes[at+2],param=bytes[at+3],e=events[channel];
        e.sample=(a&240)|(c>>4);e.pitch=((a&15)<<8)|b;e.effect=c&15;e.param=param;
        if(e.effect===15&&param){if(param<32)speed=param;else bpm=param;}
      }
      for(let i=0;i<channels;i++){
        const e=events[i],t=tracks[i];if(e.sample){t.sample=e.sample;t.volume=score.samples[e.sample-1].volume;}
        if(e.effect===12)t.volume=min(64,e.param);
        if(e.pitch){t.period=e.pitch;note(i,t.sample,e.pitch,time);}
        else if(e.effect===12&&t.voice)t.voice.gain.gain.setTargetAtTime(t.volume/64,time,.002);
      }
      stats.order=planSegment.pattern;stats.row=plan.bar*16+rowInBar;stats.tempo=bpm;stats.scheduledRows++;
      rowInBar++;if(rowInBar===16)rowInBar=0;
      return 2.5*speed/bpm;
    }
    function tick(){
      if(!ready||disposed||!playing||volume<=0||(!offline&&ctx.state!=='running'))return;
      load();const now=ctx.currentTime;
      // RESTE-09: deleting the current entry of a Set during for…of is defined
      // and keeps insertion order, so the same voices are cleaned in the same
      // order with no per-frame array allocation.
      for(const v of voices)if(v.end<now-.02)cleanup(v);
      if(nextTime===null||nextTime<now-.20){if(nextTime!==null){stopAll();rowInBar=0;stats.resyncs++;}nextTime=now+.035;}
      let count=0;while(nextTime<now+.28&&count++<6){const at=max(now+.002,nextTime);nextTime+=schedule(at);}
    }
    mix();
    return {
      setStage(value,nextSeed){
        if(disposed)return;const next=keyOf(value);if(next===key&&nextSeed===seed)return;
        if(nextSeed!==seed){seed=nextSeed;cueTable=descriptorTable(seed);director=(G.FImuse?G.FImuse:{create:fallbackDirector}).create({cues:cueTable,cue:next,intensityStep:.05});director.setIntensity(threat);}
        stopAll();key=next;score=null;plan=null;planSegment=null;rowInBar=0;nextTime=null;
        stats.stage=next==='title'?'title':isCue(next)?next:Number(next);stats.cue=next;director.reset(key);mix();
      },
      // MUS-02/MUS-04: an in-game event asks for another piece. The transport
      // is never restarted: FImuse finishes the bar, then the segment, then
      // plays the written join, then enters the target.
      setCue(value,meta){
        if(disposed||value===null||value===undefined)return false;
        // Unlike setStage, which keeps its historical clamping, an event request
        // must name a real piece: a typo is refused instead of falling back to
        // the first world song.
        const next=String(value);if(!cueTable[next])return false;
        const info=meta||{};
        if(next===key&&!info.force)return false;
        return director.request(next,{urgent:!!info.urgent,force:!!info.force,key:info.key||next});
      },
      cueState(){return director.state();},
      setThreat(value){const next=clamp(Number(value)||0,0,1);if(disposed||abs(next-threat)<.01)return;threat=next;director.setIntensity(next);mix();},
      setVolume(value){if(disposed)return;const next=clamp(Number(value)||0,0,1);if(next===volume)return;volume=next;if(!volume){stopAll();nextTime=null;rowInBar=0;}level();},
      setPlaying(value){if(disposed||playing===!!value)return;playing=!!value;stats.playing=playing;if(!playing){stopAll();rowInBar=0;}else if(director.realign)director.realign();nextTime=null;level();},
      prepare(value=key,nextSeed=seed){
        if(!ready||disposed)return false;const next=keyOf(value),score=scoreOf(next,nextSeed);
        // Three world banks plus the independent title bank, retained across changes.
        // Loading a future bank does not seek, switch stage or start any notes.
        for(let i=0;i<score.samples.length;i++)if(score.samples[i]&&score.samples[i].pcm.length>2)buffer(i+1,next,nextSeed);
        return true;
      },
      async prepareAsync(value=key,nextSeed=seed){
        if(!ready||disposed)return false;const next=keyOf(value),score=scoreOf(next,nextSeed);
        for(let i=0;i<score.samples.length;i++)if(score.samples[i]?.pcm.length>2){
          if(disposed)return false;buffer(i+1,next,nextSeed);
          if(typeof G.setTimeout==='function')await new Promise(resolve=>G.setTimeout(resolve,0));
        }
        return !disposed;
      },
      tick,getModule,getTrack,stats,
      dispose(){if(disposed)return;stopAll(true);disposed=true;playing=false;stats.playing=false;buffers.clear();for(const n of nodes)try{n.disconnect();}catch(_){}nodes.length=0;}
    };
  }
  G.FMusic={create,getModule,getTrack,warmup,prepared,adoptPrepared,setPreparer,isCue,cueIds:()=>CUE_IDS.slice(),cueDescriptor,descriptorTable};
})(typeof window!=='undefined'?window:globalThis);