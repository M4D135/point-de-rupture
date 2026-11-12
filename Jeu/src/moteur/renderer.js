/* FERRO — original WebGL2 renderer. All surfaces and meshes are mathematical. */
/* PDR (origine) : copie de FERRO 0.2 pour Point de rupture (github.com/M4D135/FERRO, étiquette v0.2, commit 248043a).
   Chaque retouche du jeu commence par « PDR » et son nom entre parenthèses ; Jeu/src/moteur/PROVENANCE.md la décrit sous
   ce nom. Tout le reste est le fichier de FERRO, y compris ses lignes « PDR : » ou « BITUME : », reprises des jeux. */
(function () {
  'use strict';
  // BITUME : champ de vision admis de 10 à 110° (FERRO : 40 à 110°), pour la caméra de télévision au téléobjectif.
  const FOV_MIN = 10;

  const VERT = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec4 iPosition;
  layout(location=3) in vec4 iScale;
  layout(location=4) in vec4 iRotation;
  layout(location=5) in vec4 iColor;
  uniform mat4 uViewProjection;
  uniform vec2 uWindTime;
  out vec3 vWorld;
  out vec3 vNormal;
  out vec3 vSurface;
  out vec3 vLocal;
  out vec3 vSurfaceNormal;
  flat out float vMaterial;
  flat out float vEmission;
  flat out float vOverlay;
  flat out float vOutdoor;
  flat out float vObject;
  flat out vec4 vColor;
  void main() {
    vec3 c=cos(iRotation.xyz), s=sin(iRotation.xyz);
    mat3 rx=mat3(1.,0.,0., 0.,c.x,s.x, 0.,-s.x,c.x);
    mat3 ry=mat3(c.y,0.,-s.y, 0.,1.,0., s.y,0.,c.y);
    mat3 rz=mat3(c.z,s.z,0., -s.z,c.z,0., 0.,0.,1.);
    mat3 rotation=rz*ry*rx;
    vWorld=rotation*(aPosition*iScale.xyz)+iPosition.xyz;
    if(iPosition.w>10.5&&iPosition.w<11.5){
      float phase=uWindTime.y*.85+iPosition.x*.37+iPosition.z*.21;
      float bend=(aPosition.y+.5)*uWindTime.x*.055;
      vWorld.x+=sin(phase)*bend;vWorld.z+=cos(phase*.73)*bend*.6;
    }
    vNormal=normalize(rotation*(aNormal/max(abs(iScale.xyz),vec3(.0001))));
    vMaterial=iPosition.w;
    vEmission=iScale.w;
    vOverlay=mod(iRotation.w,2.);
    vOutdoor=mod(floor(iRotation.w*.5),2.);
    vObject=floor(iRotation.w*.25);
    vSurface=vObject>.5?aPosition*iScale.xyz:vWorld;
    vLocal=aPosition;
    vSurfaceNormal=vObject>.5?normalize(aNormal/max(abs(iScale.xyz),vec3(.0001))):vNormal;
    vColor=iColor;
    gl_Position=uViewProjection*vec4(vWorld,1.);
  }`;

  const FRAG = `#version 300 es
  precision highp float;
  in vec3 vWorld;
  in vec3 vNormal;
  in vec3 vSurface;
  in vec3 vLocal;
  in vec3 vSurfaceNormal;
  flat in float vMaterial;
  flat in float vEmission;
  flat in float vOverlay;
  flat in float vOutdoor;
  flat in float vObject;
  flat in vec4 vColor;
  uniform vec3 uEye;
  uniform vec3 uForward;
  uniform vec3 uLightPosition[12];
  uniform vec3 uLightColor[12];
  uniform float uLightRange[12];
  uniform int uLightCount;
  uniform vec2 uResolution;
  uniform vec4 uEffects;
  uniform vec2 uWindTime;
  // Explicit sampler precision keeps 24-bit depth from being quantized into bands.
  uniform highp sampler2D uShadowMap;
  uniform mat4 uShadowMatrix[3];
  uniform vec4 uShadowSettings;
  uniform vec3 uTorchPosition;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec2 uEnvironment;
  // PDR (voile) : voile du brouillard de guerre (fx.voile) : visibilité R8, zone (x0, z0, 1/largeur, 1/profondeur) en mètres, force 0..1.
  uniform sampler2D uVoile;
  uniform vec4 uVoileZone;
  uniform float uVoileForce;
  out vec4 fragColor;
  float hash(vec2 p) {
    vec3 p3=fract(vec3(p.xyx)*.1031);
    p3+=dot(p3,p3.yzx+33.33);
    return fract((p3.x+p3.y)*p3.z);
  }
  float noise(vec2 p) {
    vec2 a=floor(p), b=fract(p); b=b*b*(3.-2.*b);
    return mix(mix(hash(a),hash(a+vec2(1,0)),b.x),
      mix(hash(a+vec2(0,1)),hash(a+vec2(1,1)),b.x),b.y);
  }
  float grid(vec2 uv,float width) {
    vec2 distanceToEdge=min(fract(uv),1.-fract(uv));
    vec2 aa=max(fwidth(uv),vec2(.0001));
    vec2 line=1.-smoothstep(vec2(width),vec2(width)+aa,distanceToEdge);
    return max(line.x,line.y);
  }
  vec3 reliefNormal(vec3 n,float height) {
    vec3 dpdx=dFdx(vWorld), dpdy=dFdy(vWorld);
    vec3 r1=cross(dpdy,n),r2=cross(n,dpdx);
    float determinant=dot(dpdx,r1);
    vec3 gradient=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
    float scale=max(abs(determinant),.000001);
    gradient*=min(1.,scale*.35/max(length(gradient),.000001));
    return normalize(scale*n-gradient);
  }
  vec3 fresnelSchlick(float cosine,vec3 f0){
    float q=1.-clamp(cosine,0.,1.),q2=q*q;
    return f0+(1.-f0)*q2*q2*q;
  }
  vec3 metalHighlight(vec3 n,vec3 view,vec3 l,float roughness,vec3 f0){
    vec3 h=normalize(view+l);
    float nv=max(dot(n,view),.001),nl=max(dot(n,l),0.),nh=max(dot(n,h),0.);
    float a=max(.055,roughness*roughness),a2=a*a,d=nh*nh*(a2-1.)+1.;
    float distribution=a2/max(3.141593*d*d,.00001);
    float k=(roughness+1.)*(roughness+1.)*.125;
    float visibility=1./max(4.*(nv*(1.-k)+k)*(nl*(1.-k)+k),.001);
    return fresnelSchlick(max(dot(view,h),0.),f0)*min(distribution*visibility,12.)*nl;
  }
  float depthSample(vec2 uv,vec2 offset,float depth,vec2 slope) {
    float texel=uShadowSettings.y;
    vec2 tap=uv+offset*texel;
    // The nearest depth texel represents a different point on a sloping surface.
    // Compare against that point on the receiver plane, not the centre depth.
    vec2 centre=(floor(tap/texel)+.5)*texel;
    return step(depth+dot(slope,(centre-uv)*2.),texture(uShadowMap,tap).r);
  }
  float shadow(vec3 n,vec3 l,int slot) {
    if(vOverlay>.5||(slot==0&&uShadowSettings.x<.5)||(slot==1&&uShadowSettings.x<1.5&&uShadowSettings.w<.5)||(slot==2&&uShadowSettings.z<.5))return 1.;
    vec4 projected=uShadowMatrix[slot]*vec4(vWorld+n*.014,1.);
    vec3 p=projected.xyz/projected.w*.5+.5;
    vec3 dx=dFdx(p),dy=dFdy(p);
    float determinant=dx.x*dy.y-dx.y*dy.x;
    vec2 slope=abs(determinant)>.00000000001?vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/determinant:vec2(0.);
    if(projected.w<=0.||p.z<=0.||p.z>=1.||min(p.x,p.y)<=.001||max(p.x,p.y)>=.999)return 1.;
    float bias=slot==1&&uShadowSettings.w>.5?.00014+.00024*(1.-max(dot(n,l),0.)):.00005+.00014*(1.-max(dot(n,l),0.));
    vec2 tile=slot==1?vec2(.5,0.):slot==2?vec2(0.,.5):vec2(0.);
    // PDR : en vue RTS, le soleil occupe tout l'atlas (réglage w = 2).
    vec2 uv=slot==1&&uShadowSettings.w>1.5?p.xy:p.xy*.5+tile;
    float visibility=0.;
    if(slot==1&&uShadowSettings.w>.5){
      // A wider, weighted kernel softens the sun's large world-space texels.
      // Every tap still compares its own receiver-plane depth at full precision.
      visibility=depthSample(uv,vec2(0.),p.z-bias,slope)*4.;
      visibility+=(depthSample(uv,vec2(-1.25,0.),p.z-bias,slope)+depthSample(uv,vec2(1.25,0.),p.z-bias,slope)+depthSample(uv,vec2(0.,-1.25),p.z-bias,slope)+depthSample(uv,vec2(0.,1.25),p.z-bias,slope))*2.;
      visibility+=depthSample(uv,vec2(-1.25,-1.25),p.z-bias,slope)+depthSample(uv,vec2(1.25,-1.25),p.z-bias,slope)+depthSample(uv,vec2(-1.25,1.25),p.z-bias,slope)+depthSample(uv,vec2(1.25,1.25),p.z-bias,slope);
      visibility*=.0625;
    }else{
      visibility+=depthSample(uv,vec2(-.65,-.65),p.z-bias,slope);
      visibility+=depthSample(uv,vec2(.65,-.65),p.z-bias,slope);
      visibility+=depthSample(uv,vec2(-.65,.65),p.z-bias,slope);
      visibility+=depthSample(uv,vec2(.65,.65),p.z-bias,slope);visibility*=.25;
    }
    float edge=min(min(p.x,p.y),min(1.-p.x,1.-p.y));
    float blend=smoothstep(.012,.085,edge)*(slot==1&&uShadowSettings.w>.5?1.:1.-smoothstep(24.,31.,projected.w));
    return mix(1.,mix(.055,1.,visibility),blend);
  }
  void main() {
    vec3 geometricNormal=normalize(vNormal), n=geometricNormal, an=abs(normalize(vSurfaceNormal));
    vec2 uv=an.y>.65?vSurface.xz:(an.x>an.z?vSurface.zy:vSurface.xy);
    float m=vMaterial, emission=vEmission;
    vec3 base=vec3(.105,.135,.15);
    float roughness=.47,metalness=.65,organicHeight=0.,urbanHeight=0.;
    float pixelSpan=max(fwidth(uv).x,fwidth(uv).y);
    float fineDetail=1.-smoothstep(.015,.10,pixelSpan);
    float grain=noise(uv*23.)*.5+mix(.5,noise(uv*71.),fineDetail)*.2;
    float broad=noise(uv*.7);
    // Architectural joints belong to the building, not to moving armour or the weapon.
    float architectural=1.-clamp(vObject,0.,1.);
    float panel=m<7.5?grid(uv*.55,.007)*architectural:0.;
    if (m<.5) {
      base*=.82+grain*.27+broad*.17;
      base*=1.-panel*.38;
      vec2 panelUV=fract(uv*.55);
      float screw=1.-smoothstep(.019,.031,length(panelUV-vec2(.065)));
      screw+=1.-smoothstep(.019,.031,length(panelUV-vec2(.935,.065)));
      base+=screw*.16*architectural;
      float ribs=1.-smoothstep(.02,.03,abs(fract(uv.y*4.)-.5));
      base*=1.-ribs*.085*architectural;
      // Integrate the brushed finish once it becomes smaller than a pixel;
      // distant armour must not turn into bands of bright parallel lines.
      float brushPhase=uv.y*980.+broad*4.;
      float brushFilter=1.-smoothstep(.65,2.8,fwidth(brushPhase));
      float brushing=.5+.5*sin(brushPhase)*brushFilter*fineDetail;
      roughness=.32+.12*brushing+.12*broad;
      float scratch=(1.-smoothstep(.008,.025,abs(fract(uv.y*4.3+noise(vec2(uv.x*1.1,0.))*.4)-.5)))*step(.62,noise(uv*vec2(2.,.25)))*fineDetail;
      base+=vec3(.035,.045,.05)*scratch;
    } else if (m<1.5) {
      base=mix(vec3(.19,.075,.025),vec3(.47,.235,.08),broad*.8+.15);
      base*=.8+grain*.43;
      base*=1.-panel*.43;
      roughness=.37+.34*broad;
      metalness=.82;
    } else if (m<2.5) {
      float tiles=grid(uv*.5,.007)*architectural;
      float variation=mix(broad,hash(floor(uv*.5)),architectural);
      base=mix(vec3(.095,.12,.135),vec3(.17,.19,.20),variation*.6);
      base*=1.-tiles*.43;
      base*=.9+grain*.3;
      vec2 diamond=fract(mat2(.707,-.707,.707,.707)*uv*12.);
      float tread=step(.68,diamond.x)*step(.65,diamond.y);
      base+=tread*.016;
      roughness=.26+.24*broad;
      float oil=smoothstep(.57,.80,noise(uv*.47+19.));
      base*=1.-oil*.24;roughness=mix(roughness,.19,oil);
      float wornEdge=max(0.,grid(uv*.5,.04)*architectural-tiles);
      base+=vec3(.025,.029,.03)*wornEdge*noise(uv*17.);
      metalness=.55;
    } else if (m<3.5) {
      base=vec3(.57,.58,.54)*(.78+grain*.3+broad*.13);
      base*=1.-panel*.22;
      roughness=.85;
      base*=.79+.21*noise(uv*vec2(6.,.19));
      metalness=0.;
    } else if (m<4.5) {
      base=vec3(.025,.74,.77);
      emission+=.72;
      roughness=.2;
      metalness=.3;
    } else if (m<5.5) {
      base=vec3(1.,.42,.06);
      emission+=.68;
      roughness=.28;
      metalness=.3;
    } else if (m<6.5) {
      base=vec3(.68,.055,.025);
      emission+=.18;
      roughness=.4;
      metalness=.4;
    } else if(m<7.5) {
      base=vec3(.065,.075,.085)*(.82+grain*.4);
      roughness=.86;
      metalness=0.;
    } else if(m<8.5) {
      float soil=noise(uv*.6)*.6+noise(uv*3.7)*.4;
      base=mix(vec3(.13,.105,.057),vec3(.16,.24,.075),smoothstep(.3,.7,soil));
      base*=.75+grain*.5;roughness=.95;metalness=0.;
    } else if(m<9.5) {
      float strata=.5+.5*sin(vWorld.y*4.+noise(uv*.9)*8.);
      base=mix(vec3(.23,.24,.22),vec3(.42,.40,.33),broad)*(.8+strata*.17+grain*.15);
      roughness=.91;metalness=0.;
    } else if(m<10.5) {
      vec2 barkUV=vec2(uv.x+sin(uv.y*.8)*.055,uv.y);
      float bark=noise(barkUV*vec2(7.,.72));
      float fibres=noise(barkUV*vec2(39.,1.5));
      vec2 knotCell=floor(barkUV*vec2(1.2,.45)),knot=fract(barkUV*vec2(1.2,.45))-.5;
      knot.x+=.17*sin(knot.y*3.+hash(knotCell)*6.);
      float knotRadius=length(knot*vec2(2.5,1.3));
      float knotMask=(1.-smoothstep(.12,.48,knotRadius))*step(.76,hash(knotCell+4.));
      float knotRings=.5+.5*sin(knotRadius*48.);
      float crevice=smoothstep(.28,.43,bark);
      base=mix(vec3(.045,.025,.013),vec3(.25,.145,.06),bark)*(.60+.40*crevice);
      base*=1.+(fibres-.5)*.30*fineDetail-knotMask*(.16+knotRings*.20)*fineDetail;
      organicHeight=bark*.022+(fibres-.5)*.005*fineDetail-knotMask*.012;
      roughness=.97;metalness=0.;
    } else if(m<11.5) {
      float clump=noise(uv*2.8),leaves=noise(uv*8.)*.7+noise(uv*19.)*.3;
      vec2 leafUV=uv*13.+vec2(clump,noise(uv*2.8+7.))*1.3;
      vec2 leaf=fract(leafUV)-.5;float angle=hash(floor(leafUV))*6.283185;
      leaf=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*leaf;
      float leafShape=1.-smoothstep(.20,.51,length(leaf*vec2(1.1,2.25)));
      float vein=(1.-smoothstep(.012,.045,abs(leaf.y)))*leafShape;
      base=mix(vec3(.025,.075,.022),vec3(.19,.31,.075),leaves)*(.78+clump*.32);
      base*=1.+(leafShape-.4)*.32*fineDetail+vein*.10*fineDetail;
      organicHeight=clump*.014+leafShape*.007*fineDetail;
      roughness=.88;metalness=0.;
    } else if(m<12.5) {
      base=vec3(.035,.12,.15)*(.9+sin(uv.x*9.+uEffects.x)*sin(uv.y*7.-uEffects.x*.7)*.1);
      roughness=.13;metalness=.35;
    } else if(m<13.5) {
      // PDR : façade d'immeuble. Étages, fenêtres en retrait, vitrines du rez-de-chaussée et toit de gravier ;
      // la fraction de la matière (12,55 à 13,45) choisit le rythme des baies.
      float style=clamp((m-12.55)/.9,0.,1.);
      vec3 enduit=vColor.w>.5?vColor.rgb:vec3(.72,.67,.6);
      roughness=.86;metalness=0.;
      if(an.y>.65){
        base=mix(vec3(.15,.15,.155),enduit*.55,.3)*(.82+grain*.26+broad*.14)*(.93+noise(uv*3.1)*.12);
        roughness=.95;
      }else{
        float etage=3.05+.55*fract(style*7.31),pas=2.25+1.35*fract(style*3.17);
        float largeur=.34+.30*fract(style*5.73),hauteur=.42+.22*fract(style*9.11);
        vec2 g=vec2(uv.x/pas,uv.y/etage),cellule=floor(g),f=fract(g),aa=max(fwidth(g),vec2(.0001));
        float haut=step(4.3,uv.y),rez=1.-haut;
        float fenetre=(1.-smoothstep(largeur*.5-aa.x,largeur*.5+aa.x,abs(f.x-.5)))*(1.-smoothstep(hauteur*.5-aa.y,hauteur*.5+aa.y,abs(f.y-.56)))*haut;
        float baie=fract(uv.x/5.4),ab=max(fwidth(uv.x/5.4),.0001);
        float vitrine=(1.-smoothstep(.40-ab,.40+ab,abs(baie-.5)))*smoothstep(.5,.62,uv.y)*(1.-smoothstep(3.2,3.3,uv.y))*rez;
        float bandeau=smoothstep(3.5,3.58,uv.y)*(1.-smoothstep(4.05,4.12,uv.y));
        float corniche=(1.-smoothstep(0.,.06+aa.y,f.y))*haut;
        float h=hash(cellule+floor(style*97.));
        vec3 vitre=mix(vec3(.10,.13,.16),vec3(.33,.41,.49),h*.8+.1);
        vitre=mix(vitre,vec3(.60,.49,.33),step(.94,h)*.55);
        vec3 mur=enduit*(.84+grain*.2+broad*.10);
        mur=mix(mur,mur*1.09,corniche);
        mur=mix(mur,enduit*.5,bandeau);
        float lointain=smoothstep(.3,.75,max(aa.x,aa.y));
        float verre=mix(max(fenetre,vitrine),mix(largeur*hauteur,.32,rez),lointain);
        base=mix(mur,vitre,verre);
        roughness=mix(.86,.12,verre);metalness=mix(0.,.45,verre);
        urbanHeight=-verre*.035;
      }
    } else if(m<14.5) {
      // PDR : asphalte, granulat fin, reprises et fissures.
      vec3 teinte=vColor.w>.5?vColor.rgb:vec3(.2,.2,.21);
      float granulat=mix(.5,noise(uv*95.),fineDetail);
      float reprise=smoothstep(.55,.75,noise(uv*.18+3.));
      float fissure=(1.-smoothstep(0.,.035,abs(noise(uv*.9)-.5)))*step(.55,noise(uv*.23+9.))*fineDetail;
      base=teinte*(.82+granulat*.22+broad*.12)*(1.-reprise*.12)*(1.-fissure*.35);
      roughness=.9;metalness=0.;
      urbanHeight=granulat*.006-fissure*.01;
    } else if(m<15.5) {
      // PDR : dallage de pierre, appareil à joints décalés.
      vec3 teinte=vColor.w>.5?vColor.rgb:vec3(.7,.67,.6);
      vec2 d=uv*1.3,rang=vec2(d.x+.5*mod(floor(d.y),2.),d.y);
      float joint=grid(rang,.035),pierre=hash(floor(rang));
      base=teinte*(.86+pierre*.16+grain*.12)*(1.-joint*.3);
      roughness=.82;metalness=0.;
      urbanHeight=(1.-joint)*.006;
    } else if(m<17.5) {
      // PDR : peinture laquée des véhicules et des boucliers.
      base=(vColor.w>.5?vColor.rgb:vec3(.5))*(.94+grain*.06);
      roughness=.22;metalness=.35;
    } else {
      // PDR : tissu et peau des figurines.
      base=(vColor.w>.5?vColor.rgb:vec3(.5))*(.9+grain*.14);
      roughness=.92;metalness=0.;
    }
    if(vColor.w>.5&&m<12.5){
      vec3 tint=vColor.rgb*(.88+grain*.2)*(1.-panel*.12)*(m<3.5?.65:1.);
      base=m>7.5?base*.35+tint*.65:tint;
    }
    if(vObject>.5&&m<2.5){
      // Local edge wear survives instance tinting and follows the moving plate.
      // It cannot bring the architecture's world-space panel grid onto a gun.
      vec2 localUV=an.y>.65?vLocal.xz:(an.x>an.z?vLocal.zy:vLocal.xy);
      float edgeDistance=.5-max(abs(localUV.x),abs(localUV.y));
      float wear=(1.-smoothstep(.008,.025+fwidth(edgeDistance),edgeDistance))*(.52+.48*broad);
      float scuff=(1.-smoothstep(.015,.055,abs(sin(uv.y*173.+grain*11.))))*smoothstep(.52,.74,broad)*fineDetail;
      base*=.82+.24*broad+.14*grain;
      base=mix(base,base*1.28+vec3(.055,.065,.07),wear*.7);
      base+=vec3(.04,.045,.048)*scuff;
      roughness=mix(roughness,.21,wear*.82);
    }
    float height=(1.-panel)*.012+grain*.003*fineDetail;
    if(m>1.5&&m<2.5){
      vec2 treadUV=mat2(.707,-.707,.707,.707)*uv*12.;
      float tread=(1.-smoothstep(.26,.34,abs(fract(treadUV.x)-.5)))*(1.-smoothstep(.08,.16,abs(fract(treadUV.y)-.5)));
      height=(1.-grid(uv*.5,.007)*architectural)*.006+tread*.0018*fineDetail;
    }
    if(m<3.5)n=reliefNormal(n,height);
    if(m>7.5&&m<9.5)n=reliefNormal(n,(noise(uv*7.)-.5)*.009*fineDetail);
    if(m>9.5&&m<11.5)n=reliefNormal(n,organicHeight*fineDetail);
    if(m>12.5&&m<15.5)n=reliefNormal(n,urbanHeight*fineDetail);
    // Pixel-scale normal variation broadens highlights instead of shimmering.
    vec3 ndx=dFdx(n),ndy=dFdy(n);
    roughness=min(.98,sqrt(roughness*roughness+min(.16,max(dot(ndx,ndx),dot(ndy,ndy))*.28)));
    vec3 view=normalize(uEye-vWorld);
    float distanceToEye=length(uEye-vWorld);
    vec3 light=vec3(.075,.10,.12)*(.72+.28*n.y);
    light+=vec3(.075,.09,.09)*max(dot(n,normalize(vec3(-.45,.85,.35))),0.);
    light*=1.-panel*.18;
    float outdoors=clamp(vOutdoor,0.,1.)*uEnvironment.x;
    light=mix(light,uAmbient*(.72+.28*max(n.y,0.)),outdoors);
    vec3 f0=mix(vec3(.04),clamp(base,vec3(.025),vec3(.92)),metalness);
    vec3 specular=vec3(0.);
    for(int i=0;i<12;i++) {
      if(i>=uLightCount) break;
      vec3 toLight=uLightPosition[i]-vWorld;
      float d=length(toLight);
      vec3 l=toLight/max(d,.001);
      float attenuation=(i<2?.27:.13)/(1.+d*d*.26);
      if(uLightRange[i]>0.)attenuation*=1.-smoothstep(uLightRange[i]*.35,uLightRange[i],d);
      float diffuse=max(dot(n,l),0.);
      float visibility=i==0?shadow(geometricNormal,l,0):i==1&&uEnvironment.x<.5?shadow(geometricNormal,l,1):1.;
      light+=uLightColor[i]*attenuation*(diffuse*visibility+.035);
      specular+=uLightColor[i]*attenuation*visibility*metalHighlight(n,view,l,roughness,f0)*2.4;
    }
    float sunlight=outdoors>.5?shadow(geometricNormal,uSunDirection,1):0.;
    float leafBack=m>10.5&&m<11.5?max(dot(-n,uSunDirection),0.)*.24:0.;
    light+=uSunColor*(max(dot(n,uSunDirection),0.)+leafBack)*sunlight;
    specular+=uSunColor*sunlight*metalHighlight(n,view,uSunDirection,roughness,f0);
    vec3 torchVector=uTorchPosition-vWorld;
    float torchDistance=length(torchVector);
    vec3 torchDirection=normalize(torchVector);
    float cone=smoothstep(.59,.96,dot(-torchDirection,uForward));
    float torch=cone/(1.+torchDistance*torchDistance*.045)*shadow(geometricNormal,torchDirection,2);
    light+=vec3(.44,.52,.56)*torch*max(dot(n,torchDirection),0.);
    specular+=vec3(.44,.52,.56)*torch*metalHighlight(n,view,torchDirection,roughness,f0)*1.5;
    vec3 muzzleVector=uTorchPosition+uForward*.8-vWorld;
    float muzzleDistance=length(muzzleVector),muzzlePower=uEffects.y*2.2/(1.+muzzleDistance*muzzleDistance*.14);
    vec3 muzzleDirection=muzzleVector/max(muzzleDistance,.001);
    light+=vec3(1.,.48,.12)*muzzlePower*(.22+.78*max(dot(n,muzzleDirection),0.));
    specular+=vec3(1.,.48,.12)*muzzlePower*metalHighlight(n,view,muzzleDirection,roughness,f0);
    if(vOverlay>.5) light+=vec3(.18,.22,.25);
    vec3 color=base*light+specular;
    // Analytic environment reflection: the biome's sky/ground hemisphere and
    // a soft indoor ceiling. This is intentionally not a scene-mirror pass.
    vec3 reflected=reflect(-view,n);
    vec3 sky=mix(uSkyBottom,uSkyTop,smoothstep(0.,1.,reflected.y));
    if(outdoors>.5&&roughness<.65&&metalness>.25){
      vec2 cloudUV=reflected.xz/max(.13,reflected.y+.18)*1.8+vec2(uWindTime.y*.006*uWindTime.x,0.);
      // One broad procedural lobe, filtered by roughness; no cubemap pass.
      float field=noise(cloudUV)*.8+.2;
      float cloud=smoothstep(.49-roughness*.08,.73+roughness*.08,field)*smoothstep(-.01,.24,reflected.y);
      float sun=max(0.,dot(reflected,uSunDirection));
      vec3 cloudColor=mix(uSkyBottom,vec3(1.12,1.10,1.01),.62)+uSunColor*pow(sun,6.)*.12;
      sky=mix(sky,cloudColor,cloud*.66);
      sky+=uSunColor*pow(sun,mix(48.,10.,roughness))*.16;
    }
    vec3 outside=mix(uAmbient*.20,sky,smoothstep(-.16,.18,reflected.y));
    vec3 inside=mix(vec3(.02,.03,.035),vec3(.18,.24,.27),smoothstep(-.45,.75,reflected.y));
    vec3 environmentReflection=mix(inside,outside,outdoors);
    environmentReflection=mix(environmentReflection,uAmbient*.85,roughness*roughness*.8);
    float nv=max(dot(n,view),0.),grazing=pow(1.-nv,5.);
    vec3 environmentFresnel=f0+(max(vec3(1.-roughness),f0)-f0)*grazing;
    color+=environmentReflection*environmentFresnel*(.18+1.3*(1.-roughness)*(1.-roughness))*(.5+metalness*2.5);
    float pulse=.94+.06*sin(uEffects.x*2.2+vWorld.y*3.);
    color+=base*emission*pulse*1.55;
    vec3 fogColor=mix(vec3(.009,.018,.024),uFogColor,outdoors);
    float fog=1.-exp(-distanceToEye*mix(.014+.008*exp(-max(vWorld.y,0.)*.7),uEnvironment.y,outdoors));
    if(vOverlay>.5) fog=0.;
    color=mix(color,fogColor,min(fog,.86));
    color=color/(color+vec3(.76));
    color=pow(max(color,vec3(0.)),vec3(.4545));
    // PDR (voile) : hors de la vue du joueur, le dehors s'assombrit et perd ses couleurs ; à force 0, rien ne change.
    if(uVoileForce>0.&&outdoors>.5){
      float seen=texture(uVoile,(vWorld.xz-uVoileZone.xy)*uVoileZone.zw).r;
      vec3 dull=vec3(dot(color,vec3(.299,.587,.114)))*vec3(.93,.97,1.04);
      color=mix(color,mix(color,dull,.6)*.42,uVoileForce*(1.-seen));
    }
    vec2 screen=gl_FragCoord.xy/uResolution;
    float vignette=pow(max(0.,16.*screen.x*screen.y*(1.-screen.x)*(1.-screen.y)),.13);
    color*=mix(.59,1.,vignette);
    float hurt=uEffects.z*(1.-vignette*.65);
    color=mix(color,vec3(.64,.035,.015),clamp(hurt*.68,0.,.6));
    float waveRadius=(1.-clamp(uEffects.w,0.,1.))*.8;
    float wave=exp(-abs(length((screen-.5)*vec2(uResolution.x/uResolution.y,1.))-waveRadius)*85.)*uEffects.w;
    color+=vec3(.03,.27,.23)*wave;
    fragColor=vec4(color,1.);
  }`;

  // A separate translucent pass keeps smoke/steam out of depth atlases and
  // leaves the established opaque material shader unchanged.
  const FX_VERT=VERT.replace('vWorld=rotation*(aPosition*iScale.xyz)+iPosition.xyz;',`
    vec3 particlePosition=aPosition;
    if(iPosition.w>=20.){
      float radial=length(aPosition.xz);
      float side=clamp((radial-.37)/.13,0.,1.);
      float inner=clamp(iPosition.w-20.,0.,.999);
      particlePosition.xz*=mix(inner*.5,.5,side)/max(radial,.0001);
    }
    vWorld=rotation*(particlePosition*iScale.xyz)+iPosition.xyz;`)
    // PDR (grain) : le grain des fumées et des flammes est pris à l'échelle d'une particule de 2,6 m au plus ; au-delà
    // (colonnes de fumée, nuages de gaz vus de 300 à 900 m), il ne tombe plus sous le pixel en semis de points.
    .replace('vSurface=vObject>.5?aPosition*iScale.xyz:vWorld;','vSurface=(vObject>.5?aPosition*iScale.xyz:vWorld)*min(1.,2.6/max(max(abs(iScale.x),abs(iScale.y)),max(abs(iScale.z),.001)));');
  const FX_FRAG=`#version 300 es
  precision highp float;
  in vec3 vWorld;
  in vec3 vNormal;
  in vec3 vSurface;
  in vec3 vLocal;
  flat in float vMaterial;
  flat in float vEmission;
  flat in float vOutdoor;
  flat in vec4 vColor;
  uniform vec3 uEye;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform vec2 uEnvironment;
  uniform float uTime;
  out vec4 fragColor;
  float noise(vec3 p){
    return .5+.18*sin(p.x*3.7+p.y*2.1+uTime*.65)+.16*sin(p.y*4.9-p.z*3.1-uTime*.41)+.12*sin(p.z*7.1+p.x*4.3);
  }
  void main(){
    vec3 toEye=uEye-vWorld;
    float distanceToEye=max(length(toEye),.001);
    // Ground telegraphs must stay readable at grazing player-eye angles.
    // Only cosmetic volumes soften toward their silhouette.
    float edge=vMaterial>=15.5?1.:pow(max(dot(normalize(vNormal),toEye/distanceToEye),0.),.65);
    float grain=clamp(noise(vSurface),.1,1.);
    bool fire=vMaterial>13.5&&vMaterial<14.5,smoke=vMaterial>14.5&&vMaterial<15.5,spark=vMaterial>16.5&&vMaterial<17.5;
    float heat=fire?smoothstep(.22,.83,noise(vSurface*vec3(1.65,.72,1.65)-vec3(0.,uTime*2.7,0.))):0.;
    float alpha=clamp(vColor.a*edge*(.58+grain*.42)*(fire?mix(.28,1.,heat):1.),0.,.94);
    if(smoke){
      vec3 flow=vSurface*vec3(.91,.65,.91)-vec3(0.,uTime*.30,0.);
      float billow=noise(flow)*.66+noise(flow*2.1+vec3(7.,3.,11.))*.34;
      alpha*=smoothstep(.16,.76,billow);
    }
    if(spark)alpha*=.30+.70*smoothstep(-.5,.18,vLocal.y);
    if(alpha<.004)discard;
    vec3 color=vColor.rgb*(uAmbient*.65+vec3(.34)+max(vEmission,0.)*1.25);
    if(fire){
      vec3 temperature=mix(vec3(.72,.025,.002),vec3(1.8,.23,.008),smoothstep(.10,.65,heat));
      temperature=mix(temperature,vec3(2.7,1.45,.23),smoothstep(.60,1.,heat));
      color=temperature*(.55+max(vEmission,0.)*.45)*(.7+grain*.3);
    }
    if(smoke)color*=.74+.40*grain;
    if(spark)color=mix(vec3(1.3,.10,.005),vec3(2.6,1.7,.52),smoothstep(-.25,.42,vLocal.y))*(.5+vEmission*.45);
    float fog=1.-exp(-distanceToEye*mix(.018,uEnvironment.y,clamp(vOutdoor,0.,1.)));
    color=mix(color,uFogColor,min(.86,fog));
    color=pow(max(color/(color+vec3(.76)),vec3(0.)),vec3(.4545));
    fragColor=vec4(color,alpha);
  }`;

  const DEPTH_FRAG=`#version 300 es
  precision highp float;
  void main() {}`;
  const POST_VERT=`#version 300 es
  precision highp float;
  out vec2 vUV;
  void main(){
    vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
    vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);
  }`;
  const SKY_FRAG=`#version 300 es
  precision highp float;
  in vec2 vUV;
  uniform vec3 uSkyRight;
  uniform vec3 uSkyUp;
  uniform vec3 uSkyForward;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uSkyFog;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec2 uSkyFov;
  uniform vec2 uSkyMotion;
  out vec4 fragColor;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 a=floor(p),b=fract(p);b=b*b*(3.-2.*b);
    return mix(mix(hash(a),hash(a+vec2(1.,0.)),b.x),mix(hash(a+vec2(0.,1.)),hash(a+vec2(1.)),b.x),b.y);
  }
  float cloud(vec2 p){return noise(p)*.52+noise(p*2.03+11.)*.28+noise(p*4.17)*.14+noise(p*8.1)*.06;}
  void main(){
    vec2 uv=vUV*2.-1.;
    vec3 ray=normalize(uSkyForward+uSkyRight*uv.x*uSkyFov.x+uSkyUp*uv.y*uSkyFov.y);
    float elevation=clamp(ray.y,0.,1.);
    vec3 color=mix(uSkyBottom,uSkyTop,pow(elevation,.55));
    float sun=max(0.,dot(ray,uSunDirection));
    color+=uSunColor*(pow(sun,48.)*.20+pow(sun,650.)*.65+smoothstep(.99925,.99965,sun)*2.8);
    vec2 cloudUV=ray.xz/max(.13,ray.y+.18)*1.8+vec2(uSkyMotion.x*.006*uSkyMotion.y,0.);
    float clouds=smoothstep(.49,.73,cloud(cloudUV))*smoothstep(-.01,.24,ray.y);
    vec3 cloudColor=mix(uSkyBottom,vec3(1.12,1.10,1.01),.62)+uSunColor*pow(sun,6.)*.12;
    color=mix(color,cloudColor,clouds*.66);
    // Two distant ridgelines close the horizon without a flat, fog-coloured void.
    float angle=atan(ray.z,ray.x);
    float ridge=.018+noise(vec2(angle*5.,1.7))*.075+noise(vec2(angle*13.,4.))*.025;
    color=mix(color,mix(uSkyFog,uSkyBottom,.43),1.-smoothstep(ridge-.003,ridge+.003,ray.y));
    float nearRidge=-.025+noise(vec2(angle*7.+25.,2.8))*.065;
    color=mix(color,uSkyFog*.80,1.-smoothstep(nearRidge-.002,nearRidge+.002,ray.y));
    color=color/(color+vec3(.76));color=pow(max(color,vec3(0.)),vec3(.4545));
    float vignette=pow(max(0.,16.*vUV.x*vUV.y*(1.-vUV.x)*(1.-vUV.y)),.13);
    fragColor=vec4(color*mix(.76,1.,vignette),1.);
  }`;
  const POST_FRAG=`#version 300 es
  precision highp float;
  in vec2 vUV;
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform vec2 uTexel;
  uniform int uPass;
  out vec4 fragColor;
  vec3 bright(vec2 uv){
    vec3 c=texture(uScene,uv).rgb;
    return c*smoothstep(.56,.86,max(max(c.r,c.g),c.b));
  }
  void main(){
    if(uPass==0){
      vec3 c=bright(vUV+uTexel*vec2(-1,-1))+bright(vUV+uTexel*vec2(1,-1));
      c+=bright(vUV+uTexel*vec2(-1,1))+bright(vUV+uTexel*vec2(1,1));
      fragColor=vec4(c*.25,1.);return;
    }
    vec2 axis=uPass==1?vec2(uTexel.x,0.):vec2(0.,uTexel.y);
    vec3 c=texture(uBloom,vUV).rgb*.227027;
    c+=texture(uBloom,vUV+axis*1.384615).rgb*.316216;
    c+=texture(uBloom,vUV-axis*1.384615).rgb*.316216;
    c+=texture(uBloom,vUV+axis*3.230769).rgb*.070270;
    c+=texture(uBloom,vUV-axis*3.230769).rgb*.070270;
    if(uPass==2)c=texture(uScene,vUV).rgb+c*.28;
    fragColor=vec4(c,1.);
  }`;

  // PDR (éclairage) : bibliothèque d'éclairage pour les shaders du jeu (la foule sur le GPU). Ce sont les formules du shader
  // du monde, pour une surface du dehors : ambiance, soleil et son ombre (même atlas, même noyau, même biais), lampes de
  // passage, reflet du ciel, émission, puis brouillard, tonemap, gamma et vignettage. Le shader du monde n'en dépend pas :
  // son code reste celui de FERRO. À insérer après « precision highp float; ». Uniformes posées par renderer.pdr.lier.
  // Deux apports de METAL 0.8 au shader du monde n'y sont pas, pour que la foule garde son image et son coût : la rugosité
  // élargie là où la normale varie d'un pixel à l'autre, et le reflet des nuages sur les surfaces lisses. Le vignettage
  // (0,59 ici, comme dans FRAG) suit le réglage de création : create le remplace comme worldFragment (pdrGlsl).
  const PDR_GLSL=`
  uniform highp sampler2D uPdrOmbre;
  uniform mat4 uPdrMatriceOmbre;
  uniform vec4 uPdrOmbreReglages;
  uniform vec3 uPdrOeil;
  uniform vec3 uPdrSoleil;
  uniform vec3 uPdrCouleurSoleil;
  uniform vec3 uPdrAmbiance;
  uniform vec3 uPdrBrouillard;
  uniform vec3 uPdrCielHaut;
  uniform vec3 uPdrCielBas;
  uniform vec4 uPdrEnvironnement;
  uniform vec2 uPdrResolution;
  uniform vec3 uPdrLumierePosition[12];
  uniform vec3 uPdrLumiereCouleur[12];
  uniform float uPdrLumierePortee[12];
  uniform int uPdrLumieres;
  float pdrEchantillon(vec2 uv,vec2 decalage,float profondeur,vec2 pente){
    float texel=uPdrOmbreReglages.y;
    vec2 tap=uv+decalage*texel,centre=(floor(tap/texel)+.5)*texel;
    return step(profondeur+dot(pente,(centre-uv)*2.),texture(uPdrOmbre,tap).r);
  }
  float pdrOmbreSoleil(vec3 monde,vec3 n){
    if(uPdrOmbreReglages.x<.5)return 1.;
    vec4 projete=uPdrMatriceOmbre*vec4(monde+n*.014,1.);
    vec3 p=projete.xyz/projete.w*.5+.5;
    vec3 dx=dFdx(p),dy=dFdy(p);
    float determinant=dx.x*dy.y-dx.y*dy.x;
    vec2 pente=abs(determinant)>.00000000001?vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/determinant:vec2(0.);
    if(projete.w<=0.||p.z<=0.||p.z>=1.||min(p.x,p.y)<=.001||max(p.x,p.y)>=.999)return 1.;
    float biais=.00014+.00024*(1.-max(dot(n,uPdrSoleil),0.)),z=p.z-biais;
    vec2 uv=uPdrOmbreReglages.z>.5?p.xy:p.xy*.5+vec2(.5,0.);
    float v=pdrEchantillon(uv,vec2(0.),z,pente)*4.;
    v+=(pdrEchantillon(uv,vec2(-1.25,0.),z,pente)+pdrEchantillon(uv,vec2(1.25,0.),z,pente)+pdrEchantillon(uv,vec2(0.,-1.25),z,pente)+pdrEchantillon(uv,vec2(0.,1.25),z,pente))*2.;
    v+=pdrEchantillon(uv,vec2(-1.25,-1.25),z,pente)+pdrEchantillon(uv,vec2(1.25,-1.25),z,pente)+pdrEchantillon(uv,vec2(-1.25,1.25),z,pente)+pdrEchantillon(uv,vec2(1.25,1.25),z,pente);
    v*=.0625;
    float bord=min(min(p.x,p.y),min(1.-p.x,1.-p.y));
    return mix(1.,mix(.055,1.,v),smoothstep(.012,.085,bord));
  }
  vec3 pdrFresnel(float c,vec3 f0){float q=1.-clamp(c,0.,1.),q2=q*q;return f0+(1.-f0)*q2*q2*q;}
  vec3 pdrReflet(vec3 n,vec3 vue,vec3 l,float rugosite,vec3 f0){
    vec3 h=normalize(vue+l);
    float nv=max(dot(n,vue),.001),nl=max(dot(n,l),0.),nh=max(dot(n,h),0.);
    float a=max(.055,rugosite*rugosite),a2=a*a,d=nh*nh*(a2-1.)+1.;
    float k=(rugosite+1.)*(rugosite+1.)*.125;
    return pdrFresnel(max(dot(vue,h),0.),f0)*min(a2/max(3.141593*d*d,.00001)/max(4.*(nv*(1.-k)+k)*(nl*(1.-k)+k),.001),12.)*nl;
  }
  /** Couleur linéaire, avant brouillard et tonemap, d'une surface du dehors ; ombre : visibilité du soleil (pdrOmbreSoleil). */
  vec3 pdrEclairer(vec3 base,vec3 n,vec3 monde,float rugosite,float metal,float emission,float ombre){
    vec3 vue=normalize(uPdrOeil-monde),f0=mix(vec3(.04),clamp(base,vec3(.025),vec3(.92)),metal);
    vec3 lumiere=uPdrAmbiance*(.72+.28*max(n.y,0.)),reflet=vec3(0.);
    for(int i=0;i<12;i++){
      if(i>=uPdrLumieres)break;
      vec3 versLumiere=uPdrLumierePosition[i]-monde;
      float d=length(versLumiere);
      vec3 l=versLumiere/max(d,.001);
      float attenuation=(i<2?.27:.13)/(1.+d*d*.26);
      if(uPdrLumierePortee[i]>0.)attenuation*=1.-smoothstep(uPdrLumierePortee[i]*.35,uPdrLumierePortee[i],d);
      lumiere+=uPdrLumiereCouleur[i]*attenuation*(max(dot(n,l),0.)+.035);
      reflet+=uPdrLumiereCouleur[i]*attenuation*pdrReflet(n,vue,l,rugosite,f0)*2.4;
    }
    lumiere+=uPdrCouleurSoleil*max(dot(n,uPdrSoleil),0.)*ombre;
    reflet+=uPdrCouleurSoleil*ombre*pdrReflet(n,vue,uPdrSoleil,rugosite,f0);
    vec3 couleur=base*lumiere+reflet;
    vec3 r=reflect(-vue,n),ciel=mix(uPdrCielBas,uPdrCielHaut,smoothstep(0.,1.,r.y));
    vec3 milieu=mix(mix(uPdrAmbiance*.20,ciel,smoothstep(-.16,.18,r.y)),uPdrAmbiance*.85,rugosite*rugosite*.8);
    float rasant=pow(1.-max(dot(n,vue),0.),5.);
    couleur+=milieu*(f0+(max(vec3(1.-rugosite),f0)-f0)*rasant)*(.18+1.3*(1.-rugosite)*(1.-rugosite))*(.5+metal*2.5);
    return couleur+base*emission*(.94+.06*sin(uPdrEnvironnement.z*2.2+monde.y*3.))*1.55;
  }
  /** Brouillard, tonemap, gamma et vignettage du monde : la sortie est celle de la cible de scène (RGBA8, avant le halo). */
  vec3 pdrFinir(vec3 couleur,vec3 monde){
    float brume=1.-exp(-length(uPdrOeil-monde)*uPdrEnvironnement.y);
    couleur=mix(couleur,uPdrBrouillard,min(brume,.86));
    couleur=pow(max(couleur/(couleur+vec3(.76)),vec3(0.)),vec3(.4545));
    vec2 ecran=gl_FragCoord.xy/uPdrResolution;
    return couleur*mix(.59,1.,pow(max(0.,16.*ecran.x*ecran.y*(1.-ecran.x)*(1.-ecran.y)),.13));
  }`;
  // Les valeurs que le shader du monde prend sans atmosphère (setWorld sans environnement).
  const PDR_INDOOR=Object.freeze({sunDirection:[.4,.8,.3],sunColor:[0,0,0],ambient:[.075,.10,.12],fog:[.009,.018,.024],fogDensity:.014,skyTop:[.05,.08,.10],skyBottom:[.16,.20,.22]});
  // Uniformes de la bibliothèque, dans l'ordre où renderer.pdr.lier les pose. uPdrEnvironnement : x dehors (toujours 1),
  // y densité du brouillard, z temps (s), w inutilisé.
  const PDR_UNIFORMS=['uPdrOmbre','uPdrMatriceOmbre','uPdrOmbreReglages','uPdrOeil','uPdrSoleil','uPdrCouleurSoleil','uPdrAmbiance',
    'uPdrBrouillard','uPdrCielHaut','uPdrCielBas','uPdrEnvironnement','uPdrResolution','uPdrLumierePosition','uPdrLumiereCouleur',
    'uPdrLumierePortee','uPdrLumieres'];

  // A closed, asymmetric crown shared with collision raycasts. Its canonical
  // 72 triangles are smaller than the old GPU sphere and remain identical in
  // every quality mode: a visual hollow never turns into a hidden solid box.
  const FOLIAGE=(()=>{
    const points=[[.018,.5,-.012]],faces=[],sides=12;
    for(let j=1;j<4;j++)for(let i=0;i<sides;i++){
      const u=i*Math.PI*2/sides,v=j*Math.PI/4;
      const radius=.5*Math.pow(Math.sin(v),.88)*(.79+.16*Math.cos(u*3)+.055*Math.sin(u*5+.7));
      const angle=u+.045*Math.sin(u*2+1);
      // Parallel, irregular rings keep the connecting quadrilaterals planar.
      // Canvas can merge each triangle pair without changing a single pixel
      // of silhouette or the canonical geometry used by rays and GPU shadows.
      points.push([Math.cos(angle)*radius+.024*Math.cos(v),.5*Math.cos(v),Math.sin(angle)*radius-.018*Math.cos(v)]);
    }
    points.push([-.025,-.5,.015]);
    // Keep exactly the existing p/s/r envelope, without widening the trunk's
    // physical footprint or the spatial index bounds of a replaced canopy.
    for(let axis=0;axis<3;axis++){
      const lo=Math.min(...points.map(p=>p[axis])),hi=Math.max(...points.map(p=>p[axis]));
      for(const p of points)p[axis]=(p[axis]-lo)/(hi-lo)-.5;
    }
    const ring=(j,i)=>1+j*sides+(i+sides)%sides;
    for(let i=0;i<sides;i++){
      faces.push([0,ring(0,i+1),ring(0,i)]);
      for(let j=0;j<2;j++)faces.push([ring(j,i),ring(j,i+1),ring(j+1,i+1)],[ring(j,i),ring(j+1,i+1),ring(j+1,i)]);
      faces.push([points.length-1,ring(2,i),ring(2,i+1)]);
    }
    const normals=points.map(()=>[0,0,0]);
    for(const face of faces){
      const [a,b,c]=face.map(i=>points[i]),ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
      let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      if(n.reduce((sum,v,k)=>sum+v*(a[k]+b[k]+c[k]),0)<0){[face[1],face[2]]=[face[2],face[1]];n=n.map(v=>-v);}
      for(const i of face)for(let k=0;k<3;k++)normals[i][k]+=n[k];
    }
    for(const n of normals){const length=Math.hypot(...n)||1;for(let k=0;k<3;k++)n[k]/=length;Object.freeze(n);}
    points.forEach(Object.freeze);faces.forEach(Object.freeze);
    const triangles=Object.freeze(faces.map(face=>Object.freeze(face.map(i=>points[i]))));
    return Object.freeze({points:Object.freeze(points),faces:Object.freeze(faces),normals:Object.freeze(normals),triangles});
  })();
  function foliageTriangles(){return FOLIAGE.triangles;}
  const names = ['box','sphere','cylinder','octa','ring','bevel','foliage'];
  function geometry(low) {
    const data=[], indices=[], ranges={};
    function vertex(p,n) {const i=data.length/6;data.push(...p,...n);return i;}
    function triangle(p0,p1,p2,n0,n1,n2) {
      const a=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]],b=[p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
      const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const len=Math.hypot(...cross)||1;
      n0=n0||cross.map(v=>v/len);n1=n1||n0;n2=n2||n0;
      if(cross[0]*n0[0]+cross[1]*n0[1]+cross[2]*n0[2]<0) {const t=p1;p1=p2;p2=t;const n=n1;n1=n2;n2=n;}
      indices.push(vertex(p0,n0),vertex(p1,n1),vertex(p2,n2));
    }
    function begin(name){ranges[name]={offset:indices.length*2,count:0};}
    function end(name){ranges[name].count=indices.length-ranges[name].offset/2;}
    begin('box');
    for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
      const n=[0,0,0];n[axis]=sign;
      const a=(axis+1)%3,b=(axis+2)%3;
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(q=>{const p=[0,0,0];p[axis]=sign*.5;p[a]=q[0]*.5;p[b]=q[1]*.5;return p;});
      triangle(points[0],points[1],points[2],n);triangle(points[0],points[2],points[3],n);
    }
    end('box');
    begin('sphere');
    const sphere=(u,v)=>[Math.sin(v)*Math.cos(u)*.5,Math.cos(v)*.5,Math.sin(v)*Math.sin(u)*.5];
    const longitude=low===2?6:low?8:16,latitude=low===2?4:low?6:10;
    for(let j=0;j<latitude;j++) for(let i=0;i<longitude;i++) {
      const p=[sphere(i*Math.PI*2/longitude,j*Math.PI/latitude),sphere((i+1)*Math.PI*2/longitude,j*Math.PI/latitude),sphere((i+1)*Math.PI*2/longitude,(j+1)*Math.PI/latitude),sphere(i*Math.PI*2/longitude,(j+1)*Math.PI/latitude)];
      if(j>0) triangle(p[0],p[1],p[2],p[0].map(v=>v*2),p[1].map(v=>v*2),p[2].map(v=>v*2));
      if(j<latitude-1) triangle(p[0],p[2],p[3],p[0].map(v=>v*2),p[2].map(v=>v*2),p[3].map(v=>v*2));
    }
    end('sphere');
    begin('foliage');
    for(const [a,b,c] of FOLIAGE.faces)triangle(FOLIAGE.points[a],FOLIAGE.points[b],FOLIAGE.points[c],FOLIAGE.normals[a],FOLIAGE.normals[b],FOLIAGE.normals[c]);
    end('foliage');
    begin('cylinder');
    const cylinderSides=low===2?6:low?8:16;
    for(let i=0;i<cylinderSides;i++) {
      const a=i*Math.PI*2/cylinderSides,b=(i+1)*Math.PI*2/cylinderSides;
      const na=[Math.cos(a),0,Math.sin(a)],nb=[Math.cos(b),0,Math.sin(b)];
      const p0=[na[0]*.5,-.5,na[2]*.5],p1=[nb[0]*.5,-.5,nb[2]*.5],p2=[nb[0]*.5,.5,nb[2]*.5],p3=[na[0]*.5,.5,na[2]*.5];
      triangle(p0,p1,p2,na,nb,nb);triangle(p0,p2,p3,na,nb,na);
      triangle([0,-.5,0],p1,p0,[0,-1,0]);triangle([0,.5,0],p3,p2,[0,1,0]);
    }
    end('cylinder');
    begin('octa');
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2,b=(i+1)*Math.PI/2;
      const p0=[Math.cos(a)*.5,0,Math.sin(a)*.5],p1=[Math.cos(b)*.5,0,Math.sin(b)*.5];
      triangle([0,.5,0],p1,p0);triangle([0,-.5,0],p0,p1);
    }
    end('octa');
    begin('ring');
    const torus=(u,v)=>[(.435+.065*Math.cos(v))*Math.cos(u),.065*Math.sin(v),(.435+.065*Math.cos(v))*Math.sin(u)];
    const torusNormal=(u,v)=>[Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)];
    const ringSides=low===2?8:low?12:24,ringTube=low?4:6;
    for(let i=0;i<ringSides;i++) for(let j=0;j<ringTube;j++) {
      const a=i*Math.PI*2/ringSides,b=(i+1)*Math.PI*2/ringSides,c=j*Math.PI*2/ringTube,d=(j+1)*Math.PI*2/ringTube;
      const p=[torus(a,c),torus(b,c),torus(b,d),torus(a,d)],n=[torusNormal(a,c),torusNormal(b,c),torusNormal(b,d),torusNormal(a,d)];
      triangle(p[0],p[1],p[2],n[0],n[1],n[2]);triangle(p[0],p[2],p[3],n[0],n[2],n[3]);
    }
    end('ring');
    // Close armour and weapon plates catch light on real, flat chamfers. The
    // coarse Canvas primitive uses the existing box; silhouettes retain scale.
    if(low===2)ranges.bevel=ranges.box;
    else{
      begin('bevel');const inner=.42,outer=.5;
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
        const n=[0,0,0];n[axis]=sign;const a=(axis+1)%3,b=(axis+2)%3;
        const p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(q=>{const v=[0,0,0];v[axis]=sign*outer;v[a]=q[0]*inner;v[b]=q[1]*inner;return v;});
        triangle(p[0],p[1],p[2],n);triangle(p[0],p[2],p[3],n);
      }
      for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)for(const sa of [-1,1])for(const sb of [-1,1]){
        const c=3-a-b,n=[0,0,0];n[a]=sa/Math.SQRT2;n[b]=sb/Math.SQRT2;
        const p=[[outer,inner,-inner],[inner,outer,-inner],[inner,outer,inner],[outer,inner,inner]].map(q=>{const v=[0,0,0];v[a]=q[0]*sa;v[b]=q[1]*sb;v[c]=q[2];return v;});
        triangle(p[0],p[1],p[2],n);triangle(p[0],p[2],p[3],n);
      }
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
        const n=[x,y,z].map(v=>v/Math.sqrt(3));
        triangle([x*outer,y*inner,z*inner],[x*inner,y*outer,z*inner],[x*inner,y*inner,z*outer],n);
      }
      end('bevel');
    }
    return {vertices:new Float32Array(data),indices:new Uint16Array(indices),ranges};
  }

  function environmentInfo(value){
    if(!value)return null;
    const color=(v,fallback)=>Array.isArray(v)&&v.length>=3?v.slice(0,3).map((x,i)=>Number.isFinite(x)?Math.max(0,x):fallback[i]):fallback;
    // A direction can contain negative horizontal coordinates; colours cannot.
    const sun=Array.isArray(value.sunDirection)&&value.sunDirection.length>=3?value.sunDirection.slice(0,3).map((x,i)=>Number.isFinite(x)?x:[.4,.8,.3][i]):[.4,.8,.3];
    sun[1]=Math.max(.12,sun[1]);const sunLength=Math.hypot(...sun)||1;
    return {...value,skyTop:color(value.skyTop,[.22,.39,.51]),skyBottom:color(value.skyBottom,[.65,.72,.66]),fog:color(value.fog,[.35,.43,.42]),sunDirection:sun.map(x=>x/sunLength),sunColor:color(value.sunColor,[1,.86,.62]),ambient:color(value.ambient,[.24,.29,.27]),wind:Number.isFinite(value.wind)?Math.max(0,Math.min(2,value.wind)):.6,fogDensity:Number.isFinite(value.fogDensity)?Math.max(.0001,value.fogDensity):.011,outdoorZones:value.outdoorZones||[]};
  }
  function outdoorAt(p,environment){
    return !!environment&&environment.outdoorZones.some(zone=>Math.abs(p[0]-zone.x)<=zone.w*.5+.08&&Math.abs(p[2]-zone.z)<=zone.d*.5+.08);
  }
  function transientLights(value,eye,limit){
    if(!Array.isArray(value))return [];
    const valid=[];
    for(const source of value.slice(0,16)){
      if(!source||!Array.isArray(source.p)||source.p.length!==3||!source.p.every(Number.isFinite)||!Number.isFinite(source.power)||source.power<=0||!Number.isFinite(source.range)||source.range<=0)continue;
      const range=Math.min(48,source.range),power=Math.min(64,source.power),p=source.p;
      const distance=(p[0]-eye[0])**2+(p[1]-eye[1])**2+(p[2]-eye[2])**2;
      if(distance>(180+range)**2)continue;
      const color=Array.isArray(source.color)&&source.color.length===3?source.color.map(v=>Number.isFinite(v)?Math.max(0,Math.min(3,v)):0):[1,.42,.09];
      if(!color.some(v=>v>0))continue;
      valid.push({p,color,power,range,score:power/(1+distance*.1)});
    }
    return valid.sort((a,b)=>b.score-a.score).slice(0,limit);
  }
  function outdoorMesh(mesh,environment){
    return !!environment&&(mesh.outdoor===undefined?((mesh.mat||0)>=8||outdoorAt(mesh.p||[0,0,0],environment)):!!mesh.outdoor);
  }
  function surfaceFlags(mesh,environment,objects=false){
    const object=mesh.overlay||mesh.surface==='object'||objects&&mesh.surface!=='architecture';
    return (mesh.overlay?1:0)+(outdoorMesh(mesh,environment)?2:0)+(object?4:0);
  }
  function pack(meshes,environment,objects=false) {
    const grouped=names.map(()=>[]);
    for(const mesh of meshes||[]) {
      const i=names.indexOf(mesh.shape||'box');
      if(i>=0) grouped[i].push(mesh);
    }
    const count=grouped.reduce((n,g)=>n+g.length,0),values=new Float32Array(count*16),groups=[];
    let offset=0;
    for(let i=0;i<names.length;i++) {
      const list=grouped[i];
      if(list.length) groups.push({name:names[i],offset:offset*4,count:list.length});
      for(const mesh of list) {
        const p=mesh.p||[0,0,0],s=mesh.s||[1,1,1],r=mesh.r||[0,0,0],c=mesh.color||[0,0,0];
        values.set([p[0],p[1],p[2],mesh.mat||0,s[0],s[1],s[2],mesh.emissive||0,r[0],r[1],r[2],surfaceFlags(mesh,environment,objects),c[0],c[1],c[2],mesh.color?1:0],offset);
        offset+=16;
      }
    }
    return {values,groups};
  }
  function packEffects(meshes,environment,eye){
    const distance=m=>(m.p[0]-eye[0])**2+(m.p[1]-eye[1])**2+(m.p[2]-eye[2])**2;
    const list=meshes.filter(m=>names.includes(m.shape||'sphere')&&m.alpha>.003).slice().sort((a,b)=>distance(b)-distance(a));
    const values=new Float32Array(list.length*16),groups=[];let offset=0;
    for(const mesh of list){
      const name=mesh.shape||'sphere',last=groups[groups.length-1];
      if(last&&last.name===name)last.count++;else groups.push({name,offset:offset*4,count:1});
      const p=mesh.p,s=mesh.s||[1,1,1],r=mesh.r||[0,0,0],c=mesh.color||[.5,.5,.5];
      const material=mesh.shape==='ring'&&Number.isFinite(mesh.innerRatio)?20+Math.min(.999,Math.max(0,mesh.innerRatio)):mesh.fxPriority==='hazard'?16:mesh.fxFire?14:mesh.fxSmoke?15:mesh.fxSpark?17:7;
      values.set([p[0],p[1],p[2],material,s[0],s[1],s[2],mesh.emissive||0,r[0],r[1],r[2],surfaceFlags(mesh,environment,true),c[0],c[1],c[2],Math.min(1,Math.max(0,mesh.alpha))],offset);offset+=16;
    }
    return {values,groups};
  }

  function multiply(a,b,out) {
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return out;
  }

  function cameraAxes(camera){
    const yaw=camera.yaw||0,pitch=camera.pitch||0,roll=camera.roll||0;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    const r=[cy,0,sy],u=[-sy*sp,cp,cy*sp];
    return {right:r.map((v,i)=>v*cr+u[i]*sr),up:u.map((v,i)=>v*cr-r[i]*sr),forward:[sy*cp,sp,-cy*cp]};
  }
  function detailRanges(quality,software=false){
    return software?(quality==='low'?[26,16,0]:quality==='high'?[42,30,12]:[34,23,8]):(quality==='low'?[48,20,0]:quality==='high'?[82,42,19]:[64,32,13]);
  }
  function extendedDistance(range,environment,eye){
    for(const zone of environment?.longViewZones||[]){
      const dx=Math.max(0,Math.abs(eye[0]-zone.x)-zone.w*.5),dz=Math.max(0,Math.abs(eye[2]-zone.z)-zone.d*.5),distance=Math.hypot(dx,dz);
      const t=Math.max(0,Math.min(1,(35-distance)/20)),blend=t*t*(3-2*t),target=Math.max(range,Math.min(140,Number(zone.range)||100));
      range=Math.max(range,range+(target-range)*blend);
    }
    return range;
  }
  function softwareDistance(quality,environment,eye){
    return extendedDistance(environment?(quality==='low'?30:quality==='high'?50:38):(quality==='low'?26:quality==='high'?42:34),environment,eye);
  }
  function horrorLights(director,lights){
    if(director?.eventType!=='blackout'||!(director.eventAge>=0&&director.eventAge<1.2))return null;
    const p=[director.eventX,director.eventY,director.eventZ];if(!p.every(Number.isFinite))return null;
    const age=director.eventAge,smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const strength=.78*Math.max(0,Math.min(1,Number.isFinite(director.eventIntensity)?director.eventIntensity:1))*smooth(age/.08)*(1-smooth((age-.72)/.48));
    if(strength<.0001)return null;
    const local=lights.map(light=>({light,d:Math.hypot(...light.p.map((v,k)=>v-p[k]))})).filter(e=>e.d<10).sort((a,b)=>a.d-b.d).slice(0,3),plan=new Map();
    for(const {light,d} of local)plan.set(light,1-strength*(1-smooth((d-4)/6)));
    return plan.size?plan:null;
  }
  function resolutionGovernor(){
    let scale=1,mean=0,slow=0,fast=0,cooldown=1;
    return {
      reset(){scale=1;mean=slow=fast=0;cooldown=1;},
      update(fx,quality){
        if(quality!=='auto'||fx.adaptive!==true){mean=slow=fast=0;return scale;}
        const raw=Number(fx.frameMs);if(!(raw>0&&raw<500))return scale;
        // One loading spike cannot lower quality; sustained slow frames still count.
        const dt=Math.min(.25,raw/1000),sample=Math.min(150,raw);
        mean=mean?mean+(sample-mean)*(1-Math.exp(-dt/.65)):sample;
        cooldown=Math.max(0,cooldown-dt);
        if(cooldown>0){slow=fast=0;return scale;}
        slow=mean>25?slow+dt:0;fast=mean<18.5?fast+dt:0;
        if(slow>1.3&&scale>.65){scale=Math.max(.65,Math.round((scale-.1)*100)/100);cooldown=2;slow=fast=0;}
        else if(fast>5&&scale<1){scale=Math.min(1,Math.round((scale+.05)*100)/100);cooldown=2;slow=fast=0;}
        return scale;
      }
    };
  }
  function metadata(mesh){
    return {mesh,p:mesh.p||[0,0,0],radius:Math.hypot(...(mesh.s||[1,1,1]))*.5,detail:Math.max(0,Math.min(2,Math.floor(mesh.detail||0))),software:null,softwareCoarse:null};
  }
  function spatialIndex(meshes,environment,previous){
    const levels=[new Map(),new Map(),new Map()],maxRadius=[0,0,0],entries=[],byMesh=new WeakMap();
    for(const mesh of meshes||[]){
      // Destruction replaces changed meshes; retained immutable meshes keep
      // their instance rows and expensive Canvas face/lighting caches.
      const retained=previous&&previous.byMesh.get(mesh),e=retained||metadata(mesh),key=Math.floor(e.p[0]/8)+','+Math.floor(e.p[2]/8),map=levels[e.detail];
      if(!map.has(key))map.set(key,[]);map.get(key).push(e);maxRadius[e.detail]=Math.max(maxRadius[e.detail],e.radius);
      if(!retained){const p=e.p,s=mesh.s||[1,1,1],r=mesh.r||[0,0,0],c=mesh.color||[0,0,0];
        e.row=new Float32Array([p[0],p[1],p[2],mesh.mat||0,s[0],s[1],s[2],mesh.emissive||0,r[0],r[1],r[2],surfaceFlags(mesh,environment),c[0],c[1],c[2],mesh.color?1:0]);}
      entries.push(e);byMesh.set(mesh,e);
    }
    function query(eye,ranges){
      const result=[];
      for(let level=0;level<3;level++){
        const range=ranges[level];if(!(range>0))continue;
        const radius=range+maxRadius[level];
        for(let x=Math.floor((eye[0]-radius)/8);x<=Math.floor((eye[0]+radius)/8);x++)for(let z=Math.floor((eye[2]-radius)/8);z<=Math.floor((eye[2]+radius)/8);z++){
          const bucket=levels[level].get(x+','+z);if(!bucket)continue;
          for(const e of bucket){const d=(e.p[0]-eye[0])**2+(e.p[1]-eye[1])**2+(e.p[2]-eye[2])**2;if(d<=(range+e.radius)**2)result.push(e);}
        }
      }
      return result;
    }
    return {entries,query,byMesh};
  }
  function visible(e,eye,axes,horizontal,vertical,far){
    const x=e.p[0]-eye[0],y=e.p[1]-eye[1],d=e.p[2]-eye[2],f=axes.forward,right=axes.right,up=axes.up;
    const z=x*f[0]+y*f[1]+d*f[2],r=e.radius;
    return z+r>.04&&z-r<far&&Math.abs(x*right[0]+y*right[1]+d*right[2])<=z*horizontal+r*Math.sqrt(1+horizontal*horizontal)&&Math.abs(x*up[0]+y*up[1]+d*up[2])<=z*vertical+r*Math.sqrt(1+vertical*vertical);
  }
  function packIndexed(entries){
    const buckets=names.map(()=>[]);for(const e of entries){const i=names.indexOf(e.mesh.shape||'box');if(i>=0)buckets[i].push(e);}
    const values=new Float32Array(entries.length*16),groups=[];let offset=0;
    for(let i=0;i<names.length;i++)if(buckets[i].length){groups.push({name:names[i],offset:offset*4,count:buckets[i].length});for(const e of buckets[i]){values.set(e.row,offset);offset+=16;}}
    return {values,groups};
  }

  function skyColor(values,scale=1){return 'rgb('+values.map(v=>Math.round(Math.pow(Math.max(0,v*scale)/(Math.max(0,v*scale)+.76),.4545)*255)).join(',')+')';}
  function softwareSky(ctx,width,height,axes,tan,environment,time){
    const {right,up,forward}=axes,focal=height/(2*tan),span=Math.hypot(right[1],up[1])||1;
    const ux=right[1]/span,uy=-up[1]/span,offset=-forward[1]*focal/span;
    const hx=width*.5+ux*offset,hy=height*.5+uy*offset;
    const gradient=ctx.createLinearGradient(hx+ux*height,hy+uy*height,hx-ux*height*.15,hy-uy*height*.15);
    gradient.addColorStop(0,skyColor(environment.skyTop));gradient.addColorStop(.84,skyColor(environment.skyBottom));gradient.addColorStop(1,skyColor(environment.fog,.85));
    ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
    const projectDirection=d=>{const z=d[0]*forward[0]+d[1]*forward[1]+d[2]*forward[2];return z>.03?[width*.5+(d[0]*right[0]+d[1]*right[1]+d[2]*right[2])*focal/z,height*.5-(d[0]*up[0]+d[1]*up[1]+d[2]*up[2])*focal/z,z]:null;};
    const sun=projectDirection(environment.sunDirection);
    if(sun){
      const radius=Math.max(4,focal*.022/sun[2]),glow=ctx.createRadialGradient(sun[0],sun[1],radius*.2,sun[0],sun[1],radius*7);
      glow.addColorStop(0,'rgba(255,233,179,.70)');glow.addColorStop(1,'rgba(255,232,182,0)');
      ctx.fillStyle=glow;ctx.fillRect(sun[0]-radius*7,sun[1]-radius*7,radius*14,radius*14);
      ctx.beginPath();ctx.arc(sun[0],sun[1],radius,0,Math.PI*2);ctx.fillStyle=skyColor(environment.sunColor,5);ctx.fill();
    }
    // Clouds occupy stable directions in the sky; walking never drags them with the camera.
    for(let i=0;i<20;i++){
      const angle=i*2.399963+time*.0008*environment.wind,elevation=.16+(.5+.5*Math.sin(i*5.17))*.52;
      const d=[Math.sin(angle),elevation,-Math.cos(angle)],cloud=projectDirection(d);if(!cloud)continue;
      const size=focal*(.075+(.5+.5*Math.sin(i*3.1))*.08)/cloud[2];
      if(cloud[0]<-size*3||cloud[0]>width+size*3||cloud[1]<-size||cloud[1]>height+size)continue;
      ctx.save();ctx.translate(cloud[0],cloud[1]);ctx.rotate(Math.atan2(right[1],up[1]));ctx.scale(2.6,1);
      const haze=ctx.createRadialGradient(0,0,0,0,0,size);haze.addColorStop(0,'rgba(247,249,234,.27)');haze.addColorStop(.5,'rgba(247,249,234,.19)');haze.addColorStop(1,'rgba(247,249,234,0)');
      ctx.fillStyle=haze;ctx.fillRect(-size,-size,size*2,size*2);ctx.restore();
    }
    // A yaw-stable panorama continues behind the actual trees, cliffs and buildings.
    for(let layer=0;layer<2;layer++){
      const points=[];
      for(let x=-width*.25;x<=width*1.25;x+=width/48){
        const lateral=(x-width*.5)/focal,dx=forward[0]+right[0]*lateral,dz=forward[2]+right[2]*lateral,angle=Math.atan2(dx,-dz);
        const ridge=(layer?-.018:.026)+(.5+.5*Math.sin(angle*7.3+layer*5))*.035+(.5+.5*Math.sin(angle*17.1+2))*.022;
        const point=projectDirection([Math.sin(angle),ridge,-Math.cos(angle)]);if(point)points.push(point);
      }
      if(points.length>1){ctx.beginPath();ctx.moveTo(points[0][0],height*3);for(const p of points)ctx.lineTo(p[0],p[1]);ctx.lineTo(points[points.length-1][0],height*3);ctx.closePath();ctx.fillStyle=skyColor(environment.fog,layer?.8:1.12);ctx.fill();}
    }
  }

  // CPU fallback: actual transformed polygons, perspective projection and near clipping.
  // It intentionally has fewer facets and a shorter draw distance than the GPU renderer.
  function createSoftware(canvas) {
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx) throw new Error('Le rendu graphique est indisponible dans ce navigateur.');
    const base={},coarseBase={},palette=[[.105,.135,.15],[.36,.18,.065],[.13,.16,.17],[.57,.58,.54],[.025,.74,.77],[1,.42,.06],[.68,.055,.025],[.065,.075,.085],[.16,.21,.075],[.32,.31,.27],[.18,.10,.04],[.105,.255,.055],[.035,.12,.15]];
    const stats={backend:'canvas2d',webglVersion:0,drawCalls:0,triangles:0,instances:0,contextLost:false,bloom:false,shadows:false};
    let world=spatialIndex([]),lights=[],environment=null,quality='auto',disposed=false,vignette=null,shadowGeometry=new WeakMap(),explicitGround=false,staticCasterPlan=null,worldRevision=0;
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
    const same=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2])<.00001;
    function normal(v) {
      const a=subtract(v[1],v[0]),b=subtract(v[2],v[0]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1;
      return n.map(x=>x/length);
    }
    function merge(a,b) {
      if(dot(normal(a),normal(b))<.99999) return null;
      const edges=[];
      for(const v of [a,b]) for(let j=0;j<3;j++) edges.push([v[j],v[(j+1)%3]]);
      const boundary=edges.filter(e=>!edges.some(f=>e!==f&&same(e[0],f[1])&&same(e[1],f[0])));
      if(boundary.length!==4)return null;
      const v=[boundary[0][0]];let tip=boundary[0][1];
      for(let j=0;j<3;j++){v.push(tip);const next=boundary.find(e=>same(e[0],tip));if(!next)return null;tip=next[1];}
      return same(tip,v[0])?v:null;
    }
    for(const [source,shapes] of [[geometry(true),base],[geometry(2),coarseBase]]){
      for(const shape of names) {
        const range=source.ranges[shape],triangles=[];
        for(let j=range.offset/2;j<range.offset/2+range.count;j+=3){
          const v=[];for(let k=0;k<3;k++){const at=source.indices[j+k]*6;v.push(Array.from(source.vertices.subarray(at,at+3)));}triangles.push(v);
        }
        shapes[shape]=[];
        for(let j=0;j<triangles.length;j++){
          const quad=j+1<triangles.length?merge(triangles[j],triangles[j+1]):null;
          shapes[shape].push(quad||triangles[j]);if(quad)j++;
        }
        if(shape==='cylinder'){
          // A planar cap is one polygon, not a fan of separately shaded triangles.
          for(const sign of [-1,1]){
            const vertices=[];for(const face of shapes[shape])if(normal(face)[1]*sign>.999)for(const p of face)if(Math.hypot(p[0],p[2])>.49&&!vertices.some(v=>same(v,p)))vertices.push(p);
            vertices.sort((a,b)=>Math.atan2(a[2],a[0])-Math.atan2(b[2],b[0]));if(normal(vertices)[1]*sign<0)vertices.reverse();
            shapes[shape]=shapes[shape].filter(face=>normal(face)[1]*sign<.999);shapes[shape].push(vertices);
          }
        }
        // Weld the mathematical primitive once. Moving actors reuse topology
        // instead of rebuilding string-keyed vertex maps for every mesh/frame.
        const faces=shapes[shape],vertices=[],keys=new Map(),indices=faces.map(face=>face.map(p=>{
          const key=p.map(v=>Math.round(v*100000)).join(',');
          if(!keys.has(key)){keys.set(key,vertices.length);vertices.push(p);}return keys.get(key);
        }));
        shapes[shape]={faces,vertices,indices};
      }
    }
    function cache(mesh,staticLighting=false,coarse=false,objects=false) {
      const p=mesh.p||[0,0,0],s=mesh.s||[1,1,1],r=mesh.r||[0,0,0],c=r.map(Math.cos),sn=r.map(Math.sin);
      function transform(v){
        let x=v[0]*s[0],y=v[1]*s[1],z=v[2]*s[2];
        if(mesh.fx&&mesh.shape==='ring'&&Number.isFinite(mesh.innerRatio)){
          const radial=Math.hypot(v[0],v[2]),side=Math.max(0,Math.min(1,(radial-.37)/.13)),inner=Math.max(0,Math.min(.999,mesh.innerRatio)),scale=(inner*.5+(.5-inner*.5)*side)/Math.max(radial,.0001);x*=scale;z*=scale;
        }
        [y,z]=[c[0]*y-sn[0]*z,sn[0]*y+c[0]*z];
        [x,z]=[c[1]*x+sn[1]*z,-sn[1]*x+c[1]*z];
        return [c[2]*x-sn[2]*y+p[0],sn[2]*x+c[2]*y+p[1],z+p[2]];
      }
      const mat=Math.max(0,Math.min(12,Math.floor(mesh.mat||0))),outdoor=outdoorMesh(mesh,environment),color=mesh.color?(mat<4?mesh.color.map(v=>v*.65):mat>=8?mesh.color.map((v,k)=>v*.65+palette[mat][k]*.35):mesh.color):palette[mat],shape=mesh.shape||'box';
      const object=surfaceFlags(mesh,environment,objects)>=4;
      const emission=(mesh.emissive||0)+(mat===4?.72:mat===5?.68:mat===6?.18:0);
      const shapeSet=coarse?coarseBase:base,template=shapeSet[shape]||shapeSet.box,vertices=template.vertices.map(transform),faces=template.faces.map((v,index)=>{
        const indices=template.indices[index],points=indices.map(i=>vertices[i]),n=normal(points),center=[0,0,0];
        for(const q of points)for(let k=0;k<3;k++)center[k]+=q[k]/points.length;
        const surface=object?[0,0,0]:center;
        if(object)for(const q of v)for(let k=0;k<3;k++)surface[k]+=q[k]*s[k]/v.length;
        const grain=.9+Math.abs(Math.sin(surface[0]*91.17+surface[1]*17.3+surface[2]*51.79))*.13;
        // Explicit receivers include terraces, ramps and moving lift decks. Keep
        // the original zero-level inference for older, unmarked scene fixtures.
        const lines=[],ground=!object&&(mesh.ground===true?n[1]>.55:!explicitGround&&mesh.ground!==false&&n[1]>.98&&(mat===2||mat===8||mat===9||mat===12)&&Math.abs(center[1])<.08),plane=dot(n,center);
        if(!object&&shape==='box'&&points.length===4&&mat<4){
          if(ground){
            // Intersect world-aligned seams with the face edges: interpolation
            // keeps every endpoint on sloping and rotated floor polygons.
            for(const axis of [0,2]){
              const coords=points.map(v=>v[axis]),lo=Math.min(...coords),hi=Math.max(...coords);
              for(let value=Math.ceil(lo/2)*2;value<hi;value+=2){
                const hits=[];
                for(let i=0;i<points.length;i++){
                  const a=points[i],b=points[(i+1)%points.length];
                  if((a[axis]<=value)!==(b[axis]<=value)){const t=(value-a[axis])/(b[axis]-a[axis]);hits.push(a.map((x,k)=>x+(b[k]-x)*t));}
                }
                if(hits.length===2)lines.push(hits);
              }
            }
          }else{
            const a=subtract(points[1],points[0]),b=subtract(points[3],points[0]);
            const na=Math.min(12,Math.floor(Math.hypot(...a)/2)),nb=Math.min(12,Math.floor(Math.hypot(...b)/2));
            for(let i=1;i<na;i++)lines.push([points[0].map((x,k)=>x+a[k]*i/na),points[3].map((x,k)=>x+a[k]*i/na)]);
            for(let i=1;i<nb;i++)lines.push([points[0].map((x,k)=>x+b[k]*i/nb),points[1].map((x,k)=>x+b[k]*i/nb)]);
          }
        }
        let fixedLight=null,fixedLampParts=null;
        if(staticLighting){
          fixedLampParts=[];
          fixedLight=(outdoor?environment.ambient:[.10,.13,.15]).map(v=>v*(.72+.28*Math.max(outdoor?0:-1,n[1])));
          const sun=outdoor?Math.max(0,dot(n,environment.sunDirection)):Math.max(0,(-.45*n[0]+.85*n[1]+.35*n[2])/1.022)*.13;
          for(let k=0;k<3;k++)fixedLight[k]+=sun*(outdoor?environment.sunColor[k]:1);
          const nearby=lights.map(light=>({light,d:(light.p[0]-center[0])**2+(light.p[1]-center[1])**2+(light.p[2]-center[2])**2})).sort((a,b)=>a.d-b.d).slice(0,4);
          for(const {light,d} of nearby){const vector=subtract(light.p,center),power=(light.power===undefined?1:light.power)*.24/(1+d*.26)*(Math.max(0,dot(n,vector)/(Math.sqrt(d)||.001))+.035),c=light.color||[1,1,1];for(let k=0;k<3;k++)fixedLight[k]+=power*c[k];fixedLampParts.push(light,power);}
        }
        return {points,indices,n,center,plane,grain,lines,color,emission,mat,ground,fixedLight,fixedLampParts,outdoor,region:mesh.region,overlay:!!mesh.overlay,fx:!!mesh.fx,fxFire:!!mesh.fxFire,fxHazard:mesh.fxPriority==='hazard',alpha:mesh.fx?Math.min(1,Math.max(0,mesh.alpha||0)):1};
      });
      return {p,radius:Math.hypot(...s)*.5,faces,vertices,sway:mat===11,s};
    }
    function setWorld(meshes,points,atmosphere){
      environment=environmentInfo(atmosphere);world=spatialIndex(meshes||[],environment);lights=points||[];
      explicitGround=(meshes||[]).some(mesh=>mesh.ground===true);
      shadowGeometry=new WeakMap();staticCasterPlan=null;for(const e of world.entries)shadowGeometry.set(e.mesh,null);
      worldRevision=0;stats.worldRevision=0;stats.staticTotal=world.entries.length;stats.biome=environment?environment.biome:null;
    }
    function updateWorld(meshes,revision,points){
      if(disposed||revision===worldRevision)return false;
      const changedLights=Array.isArray(points)&&(points.length!==lights.length||points.some((light,i)=>light!==lights[i]));
      if(changedLights)lights=points;
      const next=meshes||[],ground=next.some(mesh=>mesh.ground===true);world=spatialIndex(next,environment,world);
      // Legacy scenes infer the floor. Switching that rule invalidates their
      // receiver classification, even for otherwise unchanged surfaces.
      if(ground!==explicitGround||changedLights)for(const e of world.entries)e.software=e.softwareCoarse=null;
      explicitGround=ground;staticCasterPlan=null;
      for(const e of world.entries)if(!shadowGeometry.has(e.mesh))shadowGeometry.set(e.mesh,null);
      worldRevision=revision===undefined?worldRevision+1:revision;stats.worldRevision=worldRevision;stats.staticTotal=world.entries.length;
      return true;
    }
    function resize(next){
      if(next!==undefined)quality=next;
      const cssWidth=canvas.clientWidth||window.innerWidth||800,cssHeight=canvas.clientHeight||window.innerHeight||600;
      const requested=typeof quality==='number'?Math.max(.5,Math.min(1.5,quality)):quality==='low'?.8:quality==='high'?1.25:1;
      const limit=quality==='low'?[720,480]:quality==='high'?[1280,900]:[1024,720];
      const ratio=Math.min(requested,limit[0]/cssWidth,limit[1]/cssHeight);
      const width=Math.max(1,Math.round(cssWidth*ratio)),height=Math.max(1,Math.round(cssHeight*ratio));
      if(canvas.width!==width||canvas.height!==height||!vignette){
        canvas.width=width;canvas.height=height;
        vignette=ctx.createRadialGradient(width*.5,height*.47,height*.15,width*.5,height*.5,Math.hypot(width,height)*.58);
        vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,5,12,.47)');
      }
      stats.renderScale=1;stats.pixelRatio=ratio;stats.width=width;stats.height=height;
      return {width,height,ratio};
    }
    function clip(points,depth,greater){
      const result=[];let previous=points[points.length-1],prevInside=greater?previous[2]>=depth:previous[2]<=depth;
      for(const p of points){
        const inside=greater?p[2]>=depth:p[2]<=depth;
        if(inside!==prevInside){const t=(depth-previous[2])/(p[2]-previous[2]);result.push([previous[0]+(p[0]-previous[0])*t,previous[1]+(p[1]-previous[1])*t,depth]);}
        if(inside)result.push(p);previous=p;prevInside=inside;
      }
      return result;
    }
    function screenBounds(points){
      const b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of points){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}return b;
    }
    const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
    function clipScreenLine(points,a,b,c){
      const side=p=>a*p[0]+b*p[1]+c,result=[];let previous=points[points.length-1],before=side(previous);
      for(const p of points){const after=side(p);if((before>=0)!==(after>=0)){const t=before/(before-after);result.push([previous[0]+(p[0]-previous[0])*t,previous[1]+(p[1]-previous[1])*t]);}if(after>=0)result.push(p);previous=p;before=after;}
      return result;
    }
    function draw(camera,dynamic,fx){
      if(disposed)return;resize();fx=fx||{};
      const width=canvas.width,height=canvas.height,t=fx.time||0,shake=fx.shake||0,p=camera.pos||[0,1.6,0];
      const eye=[p[0]+Math.sin(t*57)*shake*.025,p[1]+Math.sin(t*71)*shake*.015,p[2]];
      const axes=cameraAxes(camera),{right,up,forward}=axes;
      const fov=Math.max(FOV_MIN,Math.min(110,camera.fov||75))*Math.PI/180,tan=Math.tan(fov*.5),focal=height/(2*tan),horizontal=tan*width/height;
      const near=.065,far=softwareDistance(quality,environment,eye);stats.viewDistance=far;
      const toCamera=v=>{const x=v[0]-eye[0],y=v[1]-eye[1],z=v[2]-eye[2];return [x*right[0]+y*right[1]+z*right[2],x*up[0]+y*up[1]+z*up[2],x*forward[0]+y*forward[1]+z*forward[2]];};
      const project=v=>[width*.5+v[0]*focal/v[2],height*.5-v[1]*focal/v[2]];
      function projectPolygon(points){
        let transformed=points.map(toCamera);if(transformed.length<3||transformed.every(v=>v[2]<near)||transformed.every(v=>v[2]>far))return [];
        if(transformed.some(v=>v[2]<near))transformed=clip(transformed,near,true);
        if(transformed.length&&transformed.some(v=>v[2]>far))transformed=clip(transformed,far,false);
        return transformed.length>2?transformed.map(project):[];
      }
      const nearest=lights.map(light=>({light,d:dot(subtract(light.p,eye),subtract(light.p,eye))})).sort((a,b)=>a.d-b.d).slice(0,quality==='low'?4:6).map(entry=>entry.light);
      const transient=transientLights(fx.lights,eye,quality==='low'?1:2);stats.dynamicLights=transient.length;
      const blackout=horrorLights(fx.horror,lights);stats.blackoutLights=blackout?.size||0;
      const faces=[],overlays=[],grounds=[];
      stats.drawCalls=0;stats.triangles=0;stats.instances=0;
      function inView(position,r){
        const center=toCamera(position);
        return !(center[2]+r<near||center[2]-r>far||Math.abs(center[0])>center[2]*horizontal+r*(1+horizontal)||Math.abs(center[1])>center[2]*tan+r*(1+tan));
      }
      function collect(object){
        if(!inView(object.p,object.radius))return;
        stats.instances++;
        const phase=t*.85+object.p[0]*.37+object.p[2]*.21,bend=object.sway&&environment?environment.wind*.055:0;
        const vertices=object.vertices.map(v=>{if(!bend)return toCamera(v);const weight=Math.max(0,Math.min(1,(v[1]-object.p[1])/Math.max(.01,object.s[1])+.5));return toCamera([v[0]+Math.sin(phase)*bend*weight,v[1],v[2]+Math.cos(phase*.73)*bend*.6*weight]);});
        const projected=vertices.map(v=>v[2]>=near&&v[2]<=far?project(v):null);
        for(const face of object.faces){
          if(dot(face.n,subtract(eye,face.center))<=.00001)continue;
          let points=face.indices.map(i=>vertices[i]),clipped=false;
          if(points.every(v=>v[2]<near)||points.every(v=>v[2]>far))continue;
          if(points.some(v=>v[2]<near)){points=clip(points,near,true);clipped=true;}
          if(points.length<3)continue;
          if(points.some(v=>v[2]>far)){points=clip(points,far,false);clipped=true;}
          if(points.length<3)continue;
          const screen=clipped?points.map(project):face.indices.map(i=>projected[i]);
          if(screen.every(v=>v[0]<-2)||screen.every(v=>v[0]>width+2)||screen.every(v=>v[1]<-2)||screen.every(v=>v[1]>height+2))continue;
          const depth=points.reduce((sum,v)=>sum+v[2],0)/points.length;
          (face.overlay?overlays:face.ground?grounds:faces).push({face,screen,depth,bounds:screenBounds(screen)});
        }
      }
      const ranges=detailRanges(quality,true),tiers=[[],[],[]];if(environment)ranges[0]=far;let staticVisible=0;
      for(const e of world.query(eye,ranges))if(visible(e,eye,axes,horizontal,tan,far)){
        const delta=subtract(e.p,eye),distance=Math.hypot(...delta),pixelRadius=e.radius*focal/Math.max(.2,dot(delta,forward));
        if(e.detail>0&&pixelRadius<(e.detail===2?2.1:1.0))continue;
        tiers[e.detail].push({e,pixelRadius,score:distance/(1+Math.min(e.radius,3)*.32)});
      }
      const budget=quality==='low'?[Infinity,80,0]:quality==='high'?[Infinity,360,120]:[Infinity,170,45];
      for(let level=0;level<3;level++){
        if(level)tiers[level].sort((a,b)=>a.score-b.score);
        for(const {e,pixelRadius} of tiers[level].slice(0,budget[level])){
          const key=quality!=='high'&&(quality==='low'||pixelRadius<75)?'softwareCoarse':'software';
          if(!e[key])e[key]=cache(e.mesh,true,key==='softwareCoarse');collect(e[key]);staticVisible++;
        }
      }
      stats.staticVisible=staticVisible;stats.staticCulled=world.entries.length-staticVisible;
      for(const mesh of dynamic||[]){
        const p=mesh.p||[0,0,0],radius=Math.hypot(...(mesh.s||[1,1,1]))*.5;
        if(inView(p,radius)){const pixelRadius=radius*focal/Math.max(.2,dot(subtract(p,eye),forward)),coarse=!mesh.overlay&&quality!=='high'&&(quality==='low'||pixelRadius<28);collect(cache(mesh,false,coarse,true));}
      }
      const receivers=new Map(),regionPlanes=new Map();
      for(const item of grounds){
        const {face,bounds}=item,key=face.n.map(v=>Math.round(v*10000)).join(',')+','+Math.round(face.plane*10000)+','+face.outdoor;
        let receiver=receivers.get(key);
        if(!receiver){receiver={n:face.n,plane:face.plane,outdoor:face.outdoor,items:[],shadows:[],bounds:bounds.slice(),regions:new Set()};receivers.set(key,receiver);}
        receiver.items.push(item);item.receiver=receiver;
        if(face.region){
          receiver.regions.add(face.region);if(!regionPlanes.has(face.region))regionPlanes.set(face.region,new Set());
          regionPlanes.get(face.region).add(face.n.map(v=>Math.round(v*1000)).join(',')+','+Math.round(face.plane*10));
        }
        for(let i=0;i<4;i++)receiver.bounds[i]=i<2?Math.min(receiver.bounds[i],bounds[i]):Math.max(receiver.bounds[i],bounds[i]);
      }
      if(receivers.size&&(nearest.length||environment)&&quality!=='low'&&fx.shadows!==false){
        const candidates=staticCasters(eye).concat((dynamic||[]).filter(m=>!m.overlay&&shadowCaster(m)))
          .sort((a,b)=>Math.hypot(a.p[0]-eye[0],a.p[2]-eye[2])-Math.hypot(b.p[0]-eye[0],b.p[2]-eye[2])).slice(0,environment?28:18);
        const cross=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
        const casters=[];
        for(const m of candidates){
          const outdoor=outdoorMesh(m,environment),vertices=[];
          // Only setWorld geometry is immutable; reused dynamic meshes may have moved.
          let object=shadowGeometry.get(m);if(!object){object=cache(m,false,true);if(shadowGeometry.has(m))shadowGeometry.set(m,object);}
          const phase=t*.85+object.p[0]*.37+object.p[2]*.21,bend=object.sway&&environment?environment.wind*.055:0;
          for(const [x,py,z] of object.vertices){
            const weight=Math.max(0,Math.min(1,(py-object.p[1])/Math.max(.01,object.s[1])+.5)),px=x+Math.sin(phase)*bend*weight,pz=z+Math.cos(phase*.73)*bend*.6*weight;
            vertices.push([px,py,pz]);
          }
          casters.push({outdoor,vertices,heightLimit:m.actorScale>1?44:16});
        }
        for(const receiver of receivers.values()){
          const {n,plane,outdoor}=receiver,sun=environment&&environment.sunDirection,lamp=outdoor?null:nearest.find(light=>dot(n,light.p)-plane>1.2),sunHeight=sun?dot(n,sun):0;
          if(outdoor?sunHeight<=.05:!lamp)continue;
          const sourceHeight=lamp?dot(n,lamp.p)-plane:0;
          for(const caster of casters){
            if(caster.outdoor!==outdoor)continue;
            const heights=caster.vertices.map(v=>dot(n,v)-plane),top=Math.max(...heights);
            if(top<.025||(outdoor?top>caster.heightLimit:top>=sourceHeight-.15))continue;
            const vertices=[];
            for(let i=0;i<caster.vertices.length;i++){
              if(heights[i]<-.025)continue;
              const v=caster.vertices[i],height=heights[i];
              if(outdoor){const amount=height/sunHeight;vertices.push(v.map((x,k)=>x-sun[k]*amount));}
              else{const amount=sourceHeight/(sourceHeight-height);if(amount<=7)vertices.push(v.map((x,k)=>lamp.p[k]+(x-lamp.p[k])*amount));}
            }
            if(vertices.length<3)continue;
            vertices.sort((a,b)=>a[0]-b[0]||a[2]-b[2]);const hull=[];
            for(const v of vertices){while(hull.length>1&&cross(hull[hull.length-2],hull[hull.length-1],v)<=0)hull.pop();hull.push(v);}
            const lower=hull.length;for(let i=vertices.length-2;i>=0;i--){const v=vertices[i];while(hull.length>lower&&cross(hull[hull.length-2],hull[hull.length-1],v)<=0)hull.pop();hull.push(v);}hull.pop();
            const polygon=projectPolygon(hull);if(polygon.length>2){const bounds=screenBounds(polygon);if(overlap(bounds,receiver.bounds))receiver.shadows.push({polygon,bounds});}
          }
        }
      }
      stats.shadows=Array.from(receivers.values()).some(receiver=>receiver.shadows.length);stats.shadowMode='projected';
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.fillStyle='#14252e';ctx.fillRect(0,0,width,height);
      if(environment)softwareSky(ctx,width,height,axes,tan,environment,t);
      function shade(face){
        const n=face.n,toEye=subtract(eye,face.center),distance=Math.hypot(...toEye)||.001;
        const lit=face.fixedLight?face.fixedLight.slice():(face.outdoor?environment.ambient:[.10,.13,.15]).map(c=>c*(.72+.28*Math.max(face.outdoor?0:-1,n[1])));
        // Dim real local lamp contributions, never a painted dark patch or the
        // sky/torch/emergency emission. Cached light components stay reusable.
        if(blackout&&face.fixedLampParts&&!face.overlay&&!face.fxHazard)for(let i=0;i<face.fixedLampParts.length;i+=2){
          const light=face.fixedLampParts[i],drop=1-(blackout.get(light)??1),color=light.color||[1,1,1];
          if(drop)for(let k=0;k<3;k++)lit[k]-=face.fixedLampParts[i+1]*color[k]*drop;
        }
        const sun=face.outdoor?Math.max(0,dot(n,environment.sunDirection)):Math.max(0,(-.45*n[0]+.85*n[1]+.35*n[2])/1.022)*.13;
        const head=Math.max(0,dot(n,toEye)/distance)*.35/(1+distance*distance*.035);
        for(let k=0;k<3;k++)lit[k]+=(face.fixedLight?0:sun*(face.outdoor?environment.sunColor[k]:1))+head*(k===0?.8:1)+(face.overlay?.2:0)+(fx.flash||0)*.65/(1+distance*distance*.14);
        for(const light of face.fixedLight?[]:nearest){
          const l=subtract(light.p,face.center),d2=dot(l,l),d=Math.sqrt(d2)||.001;
          const factor=!face.overlay&&!face.fxHazard?blackout?.get(light)??1:1;
          const power=(light.power===undefined?1:light.power)*factor*.24/(1+d2*.26)*(Math.max(0,dot(n,l)/d)+.065),color=light.color||[1,1,1];
          for(let k=0;k<3;k++)lit[k]+=power*color[k];
        }
        for(const light of transient){
          const dx=light.p[0]-face.center[0],dy=light.p[1]-face.center[1],dz=light.p[2]-face.center[2],d2=dx*dx+dy*dy+dz*dz;
          if(d2>=light.range*light.range)continue;
          const d=Math.sqrt(d2)||.001,q=Math.max(0,Math.min(1,(d/light.range-.35)/.65)),falloff=1-q*q*(3-2*q);
          const power=light.power*.24*falloff/(1+d2*.26)*(Math.max(0,(n[0]*dx+n[1]*dy+n[2]*dz)/d)+.035);
          for(let k=0;k<3;k++)lit[k]+=power*light.color[k];
        }
        let reflection=null;
        if(face.mat<3||face.mat===12){
          const nv=Math.max(0,dot(n,toEye)/distance),ry=-toEye[1]/distance+2*nv*n[1],roughness=[.48,.60,.35][face.mat]||.13;
          const skyMix=Math.max(0,Math.min(1,ry)),hemisphere=Math.max(0,Math.min(1,(ry+.45)/1.2));
          const strength=(.04+.35*(1-nv)**5)*(.45+.8*(1-roughness));
          reflection=[0,1,2].map(k=>{
            const sky=face.outdoor?environment.skyBottom[k]*(1-skyMix)+environment.skyTop[k]*skyMix:[.18,.24,.27][k];
            const ground=face.outdoor?environment.ambient[k]*.2:[.02,.03,.035][k];
            return (ground*(1-hemisphere)+sky*hemisphere)*strength;
          });
        }
        const fog=face.overlay?0:Math.min(.9,1-Math.exp(-distance*(face.outdoor?environment.fogDensity:.027))),fogColor=face.outdoor?environment.fog:[.009,.018,.024];
        const rgb=lit.map((value,k)=>{
          let color=face.color[k]*(value*face.grain+face.emission*1.55*(.94+.06*Math.sin(t*2.2+face.center[1]*3)));
          if(reflection)color+=reflection[k];
          if(face.fxFire)color*=.72+.28*Math.sin(face.center[0]*5.3+face.center[1]*7.1-face.center[2]*3.7-t*11.);
          color=color*(1-fog)+fogColor[k]*fog;
          return Math.round(Math.pow(Math.max(0,color)/(Math.max(0,color)+.76),.4545)*255);
        });
        return 'rgb('+rgb.join(',')+')';
      }
      function line(a,b){
        let va=toCamera(a),vb=toCamera(b);
        if((va[2]<near&&vb[2]<near)||(va[2]>far&&vb[2]>far))return;
        for(const depth of [near,far]){
          const aInside=depth===near?va[2]>=depth:va[2]<=depth,bInside=depth===near?vb[2]>=depth:vb[2]<=depth;
          if(aInside!==bInside){const fraction=(depth-va[2])/(vb[2]-va[2]),hit=va.map((x,k)=>x+(vb[k]-x)*fraction);if(!aInside)va=hit;else vb=hit;}
        }
        const a2=project(va),b2=project(vb);ctx.moveTo(...a2);ctx.lineTo(...b2);
      }
      function polygonPath(points){ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();}
      function maskGround(item){
        let saved=false;
        // Large ground polygons must still be painted first (their mean depth
        // can lie in front of a nearby actor). Mask only the part of a later
        // face behind a visible receiver plane, within that finite floor. This
        // gives terraces/ramps real occlusion without inverting the base floor.
        for(const receiver of receivers.values()){
          if(receiver===item.receiver||!overlap(item.bounds,receiver.bounds))continue;
          // Dressing built onto one floor already shares its elevation. Avoid
          // hundreds of clips for embedded roots/stone and thin trail inlays.
          // Multi-level regions (lift shafts) keep full plane occlusion.
          if(item.face.fixedLight&&item.face.region&&regionPlanes.get(item.face.region)?.size===1&&receiver.regions.has(item.face.region))continue;
          const distances=item.face.points.map(p=>dot(receiver.n,p)-receiver.plane);
          if(Math.min(...distances)>=-.002)continue;
          const crossing=Math.max(...distances)>-.002,eyeFloor=dot(receiver.n,eye)-receiver.plane,eyeFace=dot(item.face.n,eye)-item.face.plane;
          // On this face, the intersection of the two 3D planes is a screen
          // line. Extend that line across the receiver instead of clipping at
          // actor edges, where antialiased clip boundaries would leave a halo.
          const separator=crossing?item.face.n.map((v,k)=>v*eyeFloor-receiver.n[k]*eyeFace):null;
          const a=crossing?dot(separator,right)/focal:0,b=crossing?-dot(separator,up)/focal:0,c=crossing?dot(separator,forward)-a*width*.5-b*height*.5:0;
          for(const ground of receiver.items){
            if(!overlap(item.bounds,ground.bounds))continue;
            const hidden=crossing?clipScreenLine(ground.screen,a,b,c):ground.screen;if(hidden.length<3)continue;
            if(!saved){ctx.save();saved=true;}
            ctx.beginPath();ctx.rect(0,0,width,height);polygonPath(hidden);ctx.clip('evenodd');
          }
        }
        return saved;
      }
      function paint(list){
        list.sort((a,b)=>a.face.ground&&b.face.ground&&dot(a.face.n,b.face.n)>.99999&&Math.abs(a.face.plane-b.face.plane)<.05?a.face.plane-b.face.plane:b.depth-a.depth);
        for(const item of list){
          const {face,screen,depth}=item,masked=!face.overlay&&maskGround(item);ctx.beginPath();polygonPath(screen);
          if(face.fx){const v=subtract(eye,face.center);ctx.globalAlpha=face.alpha*(face.fxHazard?1:Math.pow(Math.max(0,dot(face.n,v)/(Math.hypot(...v)||1)),.65));}
          ctx.fillStyle=shade(face);ctx.fill();if(face.fx)ctx.globalAlpha=1;stats.drawCalls++;stats.triangles+=screen.length-2;
          if(item.receiver&&item.receiver.shadows.length){
            ctx.save();ctx.clip();ctx.fillStyle=face.outdoor?'rgba(5,18,23,.27)':'rgba(0,7,11,.24)';
            for(const {polygon,bounds} of item.receiver.shadows)if(overlap(bounds,item.bounds)){ctx.beginPath();polygonPath(polygon);ctx.fill();}ctx.restore();
          }
          // The seams are projected from positions on the actual face, not screen-space stripes.
          // Do not outline individual mesh faces: that reveals triangulation instead of material detail.
          if(face.mat<4&&face.lines.length&&depth<18){
            ctx.beginPath();for(const segment of face.lines)line(segment[0],segment[1]);ctx.strokeStyle=face.ground?'rgba(2,7,10,.22)':'rgba(2,7,10,.32)';ctx.lineWidth=face.ground?.65:1.0;ctx.stroke();
            if(!face.ground&&quality!=='low'&&depth<10){ctx.strokeStyle='rgba(128,180,176,.14)';ctx.lineWidth=.35;ctx.stroke();}
          }
          if(masked)ctx.restore();
        }
      }
      paint(grounds);paint(faces);paint(overlays);
      ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
      if(fx.damage>0){ctx.fillStyle='rgba(190,12,2,'+Math.min(.3,fx.damage*.22)+')';ctx.fillRect(0,0,width,height);}
      if(fx.pulse>0){
        const strength=Math.min(1,fx.pulse),radius=(1-strength)*height*.8;
        ctx.beginPath();ctx.arc(width*.5,height*.5,Math.max(1,radius),0,Math.PI*2);ctx.strokeStyle='rgba(82,248,216,'+(strength*.35)+')';ctx.lineWidth=height*.018;ctx.stroke();
      }
    }
    function shadowCaster(m){
      const s=m.s||[1,1,1],mat=m.mat||0,limit=m.actorPart&&m.actorScale>1?44:10;
      return !m.fx&&(m.shape==='box'||m.shape==='bevel'||m.shape==='cylinder'||m.shape==='sphere'||m.shape==='foliage'||m.shape==='octa')&&s[0]>.45&&s[2]>.45&&s[1]>.4&&s[0]<limit&&s[2]<limit&&(mat<4||mat>7);
    }
    function staticCasters(eye){
      if(staticCasterPlan&&eye.every((v,k)=>v===staticCasterPlan.eye[k]))return staticCasterPlan.meshes;
      const meshes=world.query(eye,[environment?25:13,13,0]).map(e=>e.mesh).filter(shadowCaster)
        .sort((a,b)=>Math.hypot(a.p[0]-eye[0],a.p[2]-eye[2])-Math.hypot(b.p[0]-eye[0],b.p[2]-eye[2])).slice(0,environment?28:18);
      staticCasterPlan={eye:eye.slice(),meshes};return meshes;
    }
    // Dynamic casters can only lower the last selected static caster's distance.
    // Reject an offscreen actor only when its ENTIRE sphere is beyond that
    // bound; the exact original 18/28-caster set and stable ordering survive.
    // Sparse scenes retain every actor that might enter that shadow ranking.
    function actorFilter(camera,fx={}){
      stats.actorsConsidered=stats.actorsCulled=0;
      if(disposed)return ()=>true;
      const t=fx.time||0,shake=fx.shake||0,p=camera.pos||[0,1.6,0],axes=cameraAxes(camera);
      const eye=[p[0]+Math.sin(t*57)*shake*.025,p[1]+Math.sin(t*71)*shake*.015,p[2]];
      const cssWidth=canvas.clientWidth||window.innerWidth||800,cssHeight=canvas.clientHeight||window.innerHeight||600;
      const aspect=Math.max(canvas.width/Math.max(1,canvas.height),cssWidth/cssHeight)+(1+cssWidth/cssHeight)/Math.max(1,cssHeight*.3);
      const tangent=Math.tan(Math.max(FOV_MIN,Math.min(110,camera.fov||75))*Math.PI/360),horizontal=aspect*tangent;
      const far=softwareDistance(quality,environment,eye);
      const shadows=quality!=='low'&&fx.shadows!==false&&(lights.length||environment),casters=shadows?staticCasters(eye):[];
      const cutoff=!shadows?-Infinity:casters.length<(environment?28:18)?Infinity:Math.hypot(casters[casters.length-1].p[0]-eye[0],casters[casters.length-1].p[2]-eye[2]);
      stats.actorFilterMode=shadows?'camera-and-ranked-casters':'camera-frustum';stats.actorCasterDistance=cutoff;
      return (x,y,z,radius)=>{
        stats.actorsConsidered++;
        if(![x,y,z,radius].every(Number.isFinite)||radius<0)return true;
        const dx=x-eye[0],dy=y-eye[1],dz=z-eye[2],r=radius+.002,along=a=>dx*a[0]+dy*a[1]+dz*a[2],depth=along(axes.forward);
        const inView=!(depth+r<.065||depth-r>far||Math.abs(along(axes.right))>depth*horizontal+r*(1+horizontal)||Math.abs(along(axes.up))>depth*tangent+r*(1+tangent));
        if(inView||Math.hypot(dx,dz)-r<=cutoff+.002)return true;
        stats.actorsCulled++;return false;
      };
    }
    function dispose(){disposed=true;world=spatialIndex([]);lights=[];vignette=null;shadowGeometry=new WeakMap();staticCasterPlan=null;}
    return {setWorld,updateWorld,draw,resize,dispose,stats,actorFilter};
  }

  // FERRO 0.2 : réglages de création, tous facultatifs. Sans eux, l'image et les commandes GPU sont celles de FERRO 0.1.
  // msaa: 4 anticrénèle la scène avant le bloom (si le GPU l'offre) ; shadowMapScale: 2 double l'atlas d'ombre ;
  // vignette (0 à 1, FERRO 0,59) éclaircit les bords quand elle monte ; bloomThreshold [début, fin] (FERRO [0,56, 0,86]).
  // Le rendu logiciel (Canvas 2D) les ignore.
  function settings(options){
    const o=options||{},unit=(v,d)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):d;
    const bloom=Array.isArray(o.bloomThreshold)?[unit(o.bloomThreshold[0],.56),unit(o.bloomThreshold[1],.86)]:[.56,.86];
    return {msaa:o.msaa===4,shadowMapScale:o.shadowMapScale===2?2:1,vignette:unit(o.vignette,.59),bloom:bloom[1]>bloom[0]?bloom:[.56,.86]};
  }
  const glslFloat=v=>v.toFixed(4);
  function worldFragment(config){
    return config.vignette===.59?FRAG:FRAG.replace('color*=mix(.59,1.,vignette);',`color*=mix(${glslFloat(config.vignette)},1.,vignette);`);
  }
  function postFragment(config){
    const [a,b]=config.bloom;
    return a===.56&&b===.86?POST_FRAG:POST_FRAG.replace('smoothstep(.56,.86,max(max(c.r,c.g),c.b))',`smoothstep(${glslFloat(a)},${glslFloat(b)},max(max(c.r,c.g),c.b))`);
  }
  function create(canvas,options) {
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,powerPreference:'high-performance'});
    if(!gl) return createSoftware(canvas);
    const config=settings(options),worldFrag=worldFragment(config),postFrag=postFragment(config);
    const source=geometry(),view=new Float32Array(16),projection=new Float32Array(16),vp=new Float32Array(16);
    const shadowView=new Float32Array(16),shadowProjection=new Float32Array(16),shadowMatrix=new Float32Array(16),shadowMatrices=new Float32Array(48);
    const lightPositions=new Float32Array(36),lightColors=new Float32Array(36),lightRanges=new Float32Array(12);
    const stats={drawCalls:0,triangles:0,instances:0,contextLost:false,webglVersion:2,backend:'webgl2',bloom:false,shadows:false};
    let program,depthProgram,postProgram,skyProgram,fxProgram,vao,postVao,vbo,ibo,worldBuffer,dynamicBuffer,overlayBuffer,fxBuffer,crowdBuffer,uniforms,postUniforms,skyUniforms,fxUniforms,depthMatrix,depthWind;
    let post=null,shadowTarget=null,whiteTexture=null,targetKey='',shadowKey='',shadowLight=null;
    let world=[],worldIndex=spatialIndex([]),lights=[],environment=null,worldBatch=pack([]),quality='auto',disposed=false,worldRevision=0;
    let staticCaches=[],lampCasters=[],actorLightPlan=null;
    // BITUME : nappes (chaussée, accotements, terrain : triangles continus, matière et couleur par sommet) et lots
    // de décor (instances statiques groupées par portion de circuit, chacune avec sa version lointaine allégée).
    let nappes=[],nappeVao=null,nappeVbo=null,nappeIbo=null,lots=[];
    const governor=resolutionGovernor();let autoScale=1;
    // PDR (voile) : vrai tant que le voile du jeu occupe l'unité 4 ; draw le retire à la première image sans fx.voile.
    let pdrVoilePose=false;
    // PDR (lots) : décor du jeu déjà empaqueté (fx.lots). pdrSlots : un tampon GPU par lot, renvoyé seulement quand le lot
    // change ; pdrLots : les lots de l'image en cours. FERRO a setLots pour le même besoin : à unifier (PROVENANCE.md).
    let pdrSlots=[];const pdrLots=[];
    // PDR (foule) : points d'accroche de la foule sur le GPU. pdrLumiere et pdrVue sont remplis à chaque image, sans
    // allocation, et passés à fx.foule.ombre et fx.foule.couleur. pdrGeneration change à chaque (ré)initialisation du
    // contexte. pdrGlsl : la bibliothèque d'éclairage, au vignettage du réglage de création, comme le shader du monde.
    let pdrGeneration=0;
    const pdrGlsl=config.vignette===.59?PDR_GLSL:PDR_GLSL.replace('couleur*mix(.59,1.,',`couleur*mix(${glslFloat(config.vignette)},1.,`);
    const pdrMatriceSoleil=new Float32Array(16);
    const pdrLumiere={matrice:pdrMatriceSoleil,direction:[.4,.8,.3],texel:1,plein:false,viewport:[0,0,1,1],centre:[0,0,0],etendue:1,profondeur:1};
    const pdrVue={gl,glsl:pdrGlsl,vp,vue:view,projection,oeil:[0,0,0],avant:[0,0,-1],droite:[1,0,0],haut:[0,1,0],fov:1,tangente:1,focale:1,
      largeur:1,hauteur:1,near:.045,far:180,temps:0,qualite:'auto',msaa:0,soleil:[.4,.8,.3],couleurSoleil:[0,0,0],ambiance:[.075,.10,.12],
      brouillard:[.009,.018,.024],densiteBrouillard:.014,cielHaut:[.05,.08,.10],cielBas:[.16,.20,.22],
      ombre:{texture:null,unite:2,matrice:pdrMatriceSoleil,texel:1,plein:false,active:false},
      lumieres:{positions:lightPositions,couleurs:lightColors,portees:lightRanges,nombre:0},
      sortie:'Couleur finale de la cible de scène (RGBA8) : pdrFinir applique brouillard, tonemap c/(c+0,76), gamma 1/2,2 et vignettage, comme le monde.'};

    function compile(type,code) {
      const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error('Compilation 3D : '+message);}
      return shader;
    }
    function link(vertex,fragment){
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();
      gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error('Initialisation 3D : '+message);}
      return p;
    }
    function texture(width,height,depth=false){
      const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,depth?gl.DEPTH_COMPONENT24:gl.RGBA8,width,height,0,depth?gl.DEPTH_COMPONENT:gl.RGBA,depth?gl.UNSIGNED_INT:gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,depth?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,depth?gl.NEAREST:gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      return t;
    }
    function deleteTarget(target){
      if(!target)return;gl.deleteFramebuffer(target.framebuffer);gl.deleteTexture(target.texture);if(target.depth)gl.deleteRenderbuffer(target.depth);
    }
    function colorTarget(width,height,depth){
      const target={framebuffer:gl.createFramebuffer(),texture:texture(width,height),width,height,depth:null};
      gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
      if(depth){target.depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,target.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,target.depth);}
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){deleteTarget(target);return null;}
      return target;
    }
    // PDR : anticrénelage MSAA de la scène avant le bloom ; les lignes fines d'une ville vue de haut l'exigent.
    function deleteMsaa(target){if(!target)return;gl.deleteFramebuffer(target.framebuffer);gl.deleteRenderbuffer(target.color);gl.deleteRenderbuffer(target.depth);}
    function msaaTarget(width,height){
      const samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES)||0);if(samples<2)return null;
      const target={framebuffer:gl.createFramebuffer(),color:gl.createRenderbuffer(),depth:gl.createRenderbuffer(),samples};
      gl.bindRenderbuffer(gl.RENDERBUFFER,target.color);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,gl.RGBA8,width,height);
      gl.bindRenderbuffer(gl.RENDERBUFFER,target.depth);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,gl.DEPTH_COMPONENT24,width,height);
      gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,target.color);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,target.depth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){deleteMsaa(target);return null;}
      return target;
    }
    function freePost(){if(post){deleteTarget(post.scene);deleteTarget(post.a);deleteTarget(post.b);deleteMsaa(post.msaa);post=null;}}
    function ensureTargets(){
      const key=canvas.width+'x'+canvas.height+':'+quality;if(key===targetKey)return;targetKey=key;
      freePost();
      if(quality==='low'){deleteTarget(shadowTarget);shadowTarget=null;shadowKey='';stats.bloom=stats.shadows=false;return;}
      const width=canvas.width,height=canvas.height,bw=Math.max(1,Math.ceil(width/4)),bh=Math.max(1,Math.ceil(height/4));
      const scene=colorTarget(width,height,true),a=colorTarget(bw,bh,false),b=colorTarget(bw,bh,false);
      if(scene&&a&&b)post={scene,a,b};else{deleteTarget(scene);deleteTarget(a);deleteTarget(b);}
      if(post&&config.msaa)post.msaa=msaaTarget(width,height);stats.msaa=post&&post.msaa?post.msaa.samples:0;
      // Tuile d'ombre de 512 en auto, 1 024 en haute qualité. Avec shadowMapScale: 2 (repris de Point de rupture, où un
      // seul soleil couvre tout le sol visible), elle double, bornée par MAX_TEXTURE_SIZE.
      const base=quality==='high'?1024:512,size=config.shadowMapScale>1?Math.min(base*config.shadowMapScale,Math.floor((gl.getParameter(gl.MAX_TEXTURE_SIZE)||2048)/2)):base;
      // Pixel resolution may adapt; a depth atlas of the same size remains valid.
      if(shadowKey!==String(size)){
        deleteTarget(shadowTarget);shadowTarget=null;shadowKey=String(size);
        const target={framebuffer:gl.createFramebuffer(),texture:texture(size*2,size*2,true),size};
        gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,target.texture,0);
        gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE)shadowTarget=target;else deleteTarget(target);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
      stats.bloom=!!post;stats.shadows=!!shadowTarget;
    }
    function initialize() {
      program=link(VERT,worldFrag);depthProgram=link(VERT,DEPTH_FRAG);postProgram=link(POST_VERT,postFrag);skyProgram=link(POST_VERT,SKY_FRAG);fxProgram=link(FX_VERT,FX_FRAG);
      uniforms={};for(const name of ['uViewProjection','uWindTime','uEye','uForward','uLightPosition','uLightColor','uLightRange','uLightCount','uResolution','uEffects','uShadowMap','uShadowMatrix','uShadowSettings','uTorchPosition','uSunDirection','uSunColor','uAmbient','uFogColor','uSkyTop','uSkyBottom','uEnvironment']) uniforms[name]=gl.getUniformLocation(program,name);
      postUniforms={};for(const name of ['uScene','uBloom','uTexel','uPass'])postUniforms[name]=gl.getUniformLocation(postProgram,name);
      skyUniforms={};for(const name of ['uSkyRight','uSkyUp','uSkyForward','uSkyTop','uSkyBottom','uSkyFog','uSunDirection','uSunColor','uSkyFov','uSkyMotion'])skyUniforms[name]=gl.getUniformLocation(skyProgram,name);
      fxUniforms={};for(const name of ['uViewProjection','uWindTime','uEye','uAmbient','uFogColor','uEnvironment','uTime'])fxUniforms[name]=gl.getUniformLocation(fxProgram,name);
      depthMatrix=gl.getUniformLocation(depthProgram,'uViewProjection');depthWind=gl.getUniformLocation(depthProgram,'uWindTime');
      vao=gl.createVertexArray();gl.bindVertexArray(vao);
      vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,source.vertices,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
      ibo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,source.indices,gl.STATIC_DRAW);
      for(let i=2;i<6;i++) {gl.enableVertexAttribArray(i);gl.vertexAttribDivisor(i,1);}
      worldBuffer=gl.createBuffer();dynamicBuffer=gl.createBuffer();overlayBuffer=gl.createBuffer();fxBuffer=gl.createBuffer();
      // PDR : foule déjà empaquetée par le jeu (fx.instances), partagée par l'ombre du soleil et la passe couleur.
      // Son tampon naît au premier usage : un jeu sans foule ne crée rien de plus.
      crowdBuffer=null;
      // Main colour and the three shadow views must keep independent instance buffers.
      staticCaches=[worldBuffer,gl.createBuffer(),gl.createBuffer(),gl.createBuffer()].map(buffer=>({buffer,entries:[],batch:pack([])}));
      lampCasters=[];
      gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.bufferData(gl.ARRAY_BUFFER,worldBatch.values,gl.STATIC_DRAW);
      postVao=gl.createVertexArray();
      whiteTexture=texture(1,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
      // PDR (voile) : ses uniformes. L'échantillonneur reste sur l'unité 4, que rien d'autre n'emploie (texture blanche,
      // force nulle) : tant qu'aucun voile n'est passé à draw, le moteur n'ajoute aucune commande par image.
      for(const name of ['uVoile','uVoileZone','uVoileForce'])uniforms[name]=gl.getUniformLocation(program,name);
      gl.useProgram(program);gl.uniform1i(uniforms.uVoile,4);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,whiteTexture);gl.activeTexture(gl.TEXTURE0);pdrVoilePose=false;
      // PDR (lots) : leurs tampons sont à recréer avec le contexte. PDR (foule) : la génération le dit au jeu.
      pdrSlots=[];pdrLots.length=0;pdrGeneration++;
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
      gl.clearColor(.035,.06,.073,1);
      post=null;shadowTarget=null;targetKey=shadowKey='';shadowLight=null;
      governor.reset();autoScale=1;
      stats.contextLost=false;
    }
    initialize();

    // BITUME : un sommet de nappe = position (3), normale (3), [0, 0, 0, matière] (4), couleur (3), soit 52 octets.
    // Les attributs d'instance 3 et 4 restent constants (échelle 1, surface extérieure en coordonnées du monde).
    function chargerNappes(){
      if(nappeVbo)gl.deleteBuffer(nappeVbo);if(nappeIbo)gl.deleteBuffer(nappeIbo);if(nappeVao)gl.deleteVertexArray(nappeVao);
      nappeVao=nappeVbo=nappeIbo=null;
      if(!nappes.length||stats.contextLost||disposed)return;
      let sommets=0,indices=0;for(const n of nappes){sommets+=n.sommets.length/13;indices+=n.indices.length;}
      const donnees=new Float32Array(sommets*13),index=new Uint32Array(indices);
      let vs=0,is=0;
      for(const n of nappes){
        donnees.set(n.sommets,vs*13);
        for(let k=0;k<n.indices.length;k++)index[is+k]=n.indices[k]+vs;
        n.debut=is*4;n.compte=n.indices.length;vs+=n.sommets.length/13;is+=n.indices.length;
      }
      nappeVao=gl.createVertexArray();gl.bindVertexArray(nappeVao);
      nappeVbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nappeVbo);gl.bufferData(gl.ARRAY_BUFFER,donnees,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,52,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,52,12);
      gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,52,24);gl.vertexAttribDivisor(2,0);
      gl.disableVertexAttribArray(3);gl.disableVertexAttribArray(4);
      gl.enableVertexAttribArray(5);gl.vertexAttribPointer(5,3,gl.FLOAT,false,52,40);gl.vertexAttribDivisor(5,0);
      nappeIbo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,nappeIbo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,index,gl.STATIC_DRAW);
      gl.bindVertexArray(vao);stats.nappeTriangles=indices/3;
    }
    function setNappes(liste){nappes=(liste||[]).filter(n=>n&&n.sommets&&n.indices&&n.indices.length);chargerNappes();}
    function dessinerNappes(eye,axes,horizontal,vertical,far){
      if(!nappeVao)return;
      gl.bindVertexArray(nappeVao);gl.vertexAttrib4f(3,1,1,1,0);gl.vertexAttrib4f(4,0,0,0,2);
      for(const n of nappes){
        if(!visible({p:n.centre,radius:n.rayon},eye,axes,horizontal,vertical,far))continue;
        gl.drawElements(gl.TRIANGLES,n.compte,gl.UNSIGNED_INT,n.debut);stats.drawCalls++;stats.triangles+=n.compte/3;
      }
      gl.bindVertexArray(vao);
    }
    function chargerLots(){
      for(const l of lots){
        for(const cle of ['tampon','tamponLoin'])if(l[cle]){gl.deleteBuffer(l[cle]);l[cle]=null;}
        if(stats.contextLost||disposed)continue;
        l.paquet=pack(l.objets,environment);l.tampon=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,l.tampon);gl.bufferData(gl.ARRAY_BUFFER,l.paquet.values,gl.STATIC_DRAW);
        if(l.loin&&l.loin.length){l.paquetLoin=pack(l.loin,environment);l.tamponLoin=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,l.tamponLoin);gl.bufferData(gl.ARRAY_BUFFER,l.paquetLoin.values,gl.STATIC_DRAW);}
        else l.paquetLoin=null;
      }
    }
    function setLots(liste){for(const l of lots)for(const cle of ['tampon','tamponLoin'])if(l[cle])gl.deleteBuffer(l[cle]);lots=(liste||[]).filter(l=>l&&l.objets);chargerLots();stats.lots=lots.length;}
    function dessinerLots(eye,axes,horizontal,vertical,far,accepte){
      let dessines=0;
      for(const l of lots){
        if(!l.tampon)continue;
        const dx=l.centre[0]-eye[0],dy=l.centre[1]-eye[1],dz=l.centre[2]-eye[2],distance=Math.sqrt(dx*dx+dy*dy+dz*dz)-l.rayon;
        if(accepte){if(!accepte(l))continue;}
        else{if(distance>Math.min(far,l.portee||far))continue;if(!visible({p:l.centre,radius:l.rayon},eye,axes,horizontal,vertical,far))continue;}
        const proche=!l.paquetLoin||distance<(l.bascule||240);
        renderBatch(proche?l.paquet:l.paquetLoin,proche?l.tampon:l.tamponLoin,false,!!accepte);dessines++;
      }
      return dessines;
    }

    function setWorld(meshes,points,atmosphere) {
      environment=environmentInfo(atmosphere);world=meshes||[];worldIndex=spatialIndex(world,environment);lights=points||[];worldBatch=pack([]);shadowLight=null;actorLightPlan=null;stats.staticTotal=world.length;stats.biome=environment?environment.biome:null;
      worldRevision=0;stats.worldRevision=0;
      lampCasters=[];for(const cache of staticCaches){cache.entries=[];cache.batch=pack([]);}
      governor.reset();autoScale=1;
      if(stats.contextLost||disposed) return;
      gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.bufferData(gl.ARRAY_BUFFER,worldBatch.values,gl.STATIC_DRAW);
    }
    function updateWorld(meshes,revision,points){
      if(disposed||revision===worldRevision)return false;
      if(Array.isArray(points)&&(points.length!==lights.length||points.some((light,i)=>light!==lights[i]))){lights=points;if(!lights.includes(shadowLight))shadowLight=null;}
      world=meshes||[];worldIndex=spatialIndex(world,environment,worldIndex);worldBatch=pack([]);
      // Every depth view must stop referencing removed walls immediately. GPU
      // storage is reused; only the affected instance lists upload next draw.
      lampCasters=[];actorLightPlan=null;for(const cache of staticCaches){cache.entries=[];cache.batch=pack([]);}
      worldRevision=revision===undefined?worldRevision+1:revision;stats.worldRevision=worldRevision;stats.staticTotal=world.length;
      return true;
    }
    function resize(next) {
      if(next!==undefined&&next!==quality){quality=next;governor.reset();autoScale=1;}
      const pixelRatio=window.devicePixelRatio||1;
      let ratio=typeof quality==='number'?quality:quality==='low'?.8:quality==='high'?Math.min(pixelRatio,2):Math.min(pixelRatio,1.5);
      const cssWidth=canvas.clientWidth||window.innerWidth||800,cssHeight=canvas.clientHeight||window.innerHeight||600;
      ratio=Math.max(.5,Math.min(2,ratio));
      if(quality==='auto')ratio=Math.min(ratio,Math.sqrt(1800000/(cssWidth*cssHeight)))*autoScale;
      const width=Math.max(1,Math.round(cssWidth*ratio)),height=Math.max(1,Math.round(cssHeight*ratio));
      if(canvas.width!==width||canvas.height!==height) {canvas.width=width;canvas.height=height;}
      stats.renderScale=autoScale;stats.pixelRatio=ratio;stats.width=width;stats.height=height;
      ensureTargets();
      gl.viewport(0,0,width,height);
      return {width,height,ratio};
    }
    function renderBatch(batch,buffer,upload,shadowPass=false) {
      if(!batch.groups.length) return;
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      if(upload){gl.bufferData(gl.ARRAY_BUFFER,batch.values,gl.DYNAMIC_DRAW);stats.uploadBytes+=batch.values.byteLength;}
      for(const group of batch.groups) {
        for(let i=2;i<6;i++) gl.vertexAttribPointer(i,4,gl.FLOAT,false,64,group.offset+(i-2)*16);
        const shape=source.ranges[group.name];
        gl.drawElementsInstanced(gl.TRIANGLES,shape.count,gl.UNSIGNED_SHORT,shape.offset,group.count);
        stats.drawCalls++;stats.triangles+=shape.count/3*group.count;if(!shadowPass)stats.instances+=group.count;
      }
    }
    function renderStatic(entries,slot,shadow=false){
      const cache=staticCaches[slot];
      const same=cache.entries.length===entries.length&&entries.every((entry,i)=>entry===cache.entries[i]);
      if(!same){cache.entries=entries;cache.batch=packIndexed(entries);}
      renderBatch(cache.batch,cache.buffer,!same,shadow);
    }
    function renderEffects(meshes,eye,time){
      const batch=packEffects(meshes,environment,eye);stats.fxInstances+=batch.values.length/16;if(!batch.groups.length)return;
      gl.useProgram(fxProgram);gl.uniformMatrix4fv(fxUniforms.uViewProjection,false,vp);gl.uniform2f(fxUniforms.uWindTime,0,time);
      gl.uniform3fv(fxUniforms.uEye,eye);gl.uniform3fv(fxUniforms.uAmbient,environment?environment.ambient:[.12,.15,.16]);
      gl.uniform3fv(fxUniforms.uFogColor,environment?environment.fog:[.009,.018,.024]);gl.uniform2f(fxUniforms.uEnvironment,environment?1:0,environment?environment.fogDensity:.018);gl.uniform1f(fxUniforms.uTime,time);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
      renderBatch(batch,fxBuffer,true);gl.depthMask(true);gl.disable(gl.BLEND);gl.useProgram(program);
    }
    function shadowPass(light,dynamicBatch,slot,torchAxes,time){
      const p=light.p,shadowAxes=torchAxes||{right:[1,0,0],up:[0,0,-1],forward:[0,-1,0]};
      const {right:r,up:u,forward:fw}=shadowAxes;
      shadowView.set([r[0],u[0],-fw[0],0,r[1],u[1],-fw[1],0,r[2],u[2],-fw[2],0,-(r[0]*p[0]+r[1]*p[1]+r[2]*p[2]),-(u[0]*p[0]+u[1]*p[1]+u[2]*p[2]),fw[0]*p[0]+fw[1]*p[1]+fw[2]*p[2],1]);
      const f=1/Math.tan((torchAxes?108:138)*Math.PI/360),near=torchAxes?.08:.15,far=32;
      shadowProjection.fill(0);shadowProjection[0]=shadowProjection[5]=f;shadowProjection[10]=(far+near)/(near-far);shadowProjection[11]=-1;shadowProjection[14]=2*far*near/(near-far);
      multiply(shadowProjection,shadowView,shadowMatrix);
      shadowMatrices.set(shadowMatrix,slot*16);
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowTarget.framebuffer);gl.viewport((slot%2)*shadowTarget.size,Math.floor(slot/2)*shadowTarget.size,shadowTarget.size,shadowTarget.size);
      gl.useProgram(depthProgram);gl.bindVertexArray(vao);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.1,2.0);gl.uniformMatrix4fv(depthMatrix,false,shadowMatrix);gl.uniform2f(depthWind,environment?environment.wind:0,time);
      const tangent=1/f;
      const previous=lampCasters[slot];
      const stable=!torchAxes&&previous&&previous.light===light&&previous.p.every((v,k)=>v===p[k]);
      const casters=stable?previous.entries:worldIndex.query(p,[32,18,0]).filter(e=>visible(e,p,shadowAxes,tangent,tangent,32));
      if(!torchAxes&&!stable)lampCasters[slot]={light,p:p.slice(),entries:casters};
      renderStatic(casters,slot+1,true);renderBatch(dynamicBatch,dynamicBuffer,false,true);gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    function sunShadowPass(eye,axes,dynamicBatch,time,camera={},fx={},crowd=null){
      const sun=environment.sunDirection,fw=sun.map(v=>-v),length=Math.hypot(fw[0],fw[2]);
      const r=length>.0001?[-fw[2]/length,0,fw[0]/length]:[1,0,0],u=[r[1]*fw[2]-r[2]*fw[1],r[2]*fw[0]-r[0]*fw[2],r[0]*fw[1]-r[1]*fw[0]];
      // PDR : la vue RTS donne l'emprise visible au sol (camera.sun) ; avec fx.sunOnly, le soleil prend tout l'atlas.
      const area=camera.sun,full=!!fx.sunOnly,tile=full?shadowTarget.size*2:shadowTarget.size;
      const extent=area?area.extent:quality==='high'?36:28,texel=extent*2/tile;
      const center=area?area.center.slice():[eye[0]+axes.forward[0]*8,eye[1]+1.4,eye[2]+axes.forward[2]*8],dot=a=>a[0]*center[0]+a[1]*center[1]+a[2]*center[2];
      const xSnap=Math.round(dot(r)/texel)*texel-dot(r),ySnap=Math.round(dot(u)/texel)*texel-dot(u);
      for(let k=0;k<3;k++)center[k]+=r[k]*xSnap+u[k]*ySnap;
      const lift=area?area.depth*.5:55,p=center.map((v,k)=>v+sun[k]*lift);
      shadowView.set([r[0],u[0],-fw[0],0,r[1],u[1],-fw[1],0,r[2],u[2],-fw[2],0,-(r[0]*p[0]+r[1]*p[1]+r[2]*p[2]),-(u[0]*p[0]+u[1]*p[1]+u[2]*p[2]),fw[0]*p[0]+fw[1]*p[1]+fw[2]*p[2],1]);
      const near=1,far=area?area.depth:115;shadowProjection.fill(0);shadowProjection[0]=shadowProjection[5]=1/extent;shadowProjection[10]=-2/(far-near);shadowProjection[14]=-(far+near)/(far-near);shadowProjection[15]=1;
      multiply(shadowProjection,shadowView,shadowMatrix);shadowMatrices.set(shadowMatrix,16);
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowTarget.framebuffer);
      if(full)gl.viewport(0,0,tile,tile);else gl.viewport(shadowTarget.size,0,shadowTarget.size,shadowTarget.size);
      gl.useProgram(depthProgram);gl.bindVertexArray(vao);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.1,2);
      gl.uniformMatrix4fv(depthMatrix,false,shadowMatrix);gl.uniform2f(depthWind,environment.wind,time);
      const inside=e=>{
        const d=e.p.map((v,k)=>v-p[k]),along=a=>d[0]*a[0]+d[1]*a[1]+d[2]*a[2],z=along(fw);
        return Math.abs(along(r))<extent+e.radius&&Math.abs(along(u))<extent+e.radius&&z+e.radius>near&&z-e.radius<far;
      };
      const casters=camera.allStatic?worldIndex.entries:worldIndex.query(center,[extent+24,26,0]).filter(inside);
      renderStatic(casters,2,true);
      // BITUME : les lots dont la sphère touche le volume du soleil projettent leur ombre (version proche ou lointaine).
      dessinerLots(eye,axes,0,0,0,l=>inside({p:l.centre,radius:l.rayon}));
      renderBatch(dynamicBatch,dynamicBuffer,false,true);if(crowd)renderBatch(crowd,crowdBuffer,false,true);gl.disable(gl.POLYGON_OFFSET_FILL);
      // PDR (lots) : les lots du jeu (fx.lots) entrent dans la même vue du soleil, au même biais, rétabli pour eux.
      // PDR (foule) : la foule sur le GPU aussi (fx.foule.ombre) ; au retour, le moteur reprend son état GL.
      const pdrOmbre=fx.foule&&typeof fx.foule.ombre==='function';
      if(pdrLots.length||pdrOmbre){
        gl.enable(gl.POLYGON_OFFSET_FILL);
        for(const entry of pdrLots)renderBatch(entry.lot,entry.buffer,false,true);
        if(pdrOmbre){
          pdrMatriceSoleil.set(shadowMatrix);pdrLumiere.direction=sun;pdrLumiere.texel=texel;pdrLumiere.plein=full;
          pdrLumiere.viewport[0]=full?0:shadowTarget.size;pdrLumiere.viewport[1]=0;pdrLumiere.viewport[2]=pdrLumiere.viewport[3]=tile;
          pdrLumiere.centre=center;pdrLumiere.etendue=extent;pdrLumiere.profondeur=far;
          pdrCompter(fx.foule.ombre(gl,pdrLumiere),true);
          gl.useProgram(depthProgram);gl.bindVertexArray(vao);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.depthMask(true);gl.disable(gl.BLEND);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
    }
    // PDR (foule) : ce que rend un point d'accroche ({ appels, triangles, instances }) entre dans les statistiques du moteur.
    function pdrCompter(r,shadow){
      if(!r)return;stats.drawCalls+=r.appels||0;stats.triangles+=r.triangles||0;if(!shadow)stats.instances+=r.instances||0;
    }
    function skyPass(axes,f,time){
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.bindVertexArray(postVao);gl.useProgram(skyProgram);
      gl.uniform3fv(skyUniforms.uSkyRight,axes.right);gl.uniform3fv(skyUniforms.uSkyUp,axes.up);gl.uniform3fv(skyUniforms.uSkyForward,axes.forward);
      gl.uniform3fv(skyUniforms.uSkyTop,environment.skyTop);gl.uniform3fv(skyUniforms.uSkyBottom,environment.skyBottom);gl.uniform3fv(skyUniforms.uSkyFog,environment.fog);
      gl.uniform3fv(skyUniforms.uSunDirection,environment.sunDirection);gl.uniform3fv(skyUniforms.uSunColor,environment.sunColor);
      gl.uniform2f(skyUniforms.uSkyFov,canvas.width/canvas.height/f,1/f);gl.uniform2f(skyUniforms.uSkyMotion,time,environment.wind);gl.drawArrays(gl.TRIANGLES,0,3);
      stats.drawCalls++;gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
    }
    function postPass(){
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.bindVertexArray(postVao);gl.useProgram(postProgram);
      gl.uniform1i(postUniforms.uScene,0);gl.uniform1i(postUniforms.uBloom,1);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,post.scene.texture);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,post.b.texture);
      gl.bindFramebuffer(gl.FRAMEBUFFER,post.a.framebuffer);gl.viewport(0,0,post.a.width,post.a.height);
      gl.uniform1i(postUniforms.uPass,0);gl.uniform2f(postUniforms.uTexel,1/canvas.width,1/canvas.height);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,post.b.framebuffer);gl.bindTexture(gl.TEXTURE_2D,post.a.texture);
      gl.uniform1i(postUniforms.uPass,1);gl.uniform2f(postUniforms.uTexel,1/post.a.width,1/post.a.height);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.bindTexture(gl.TEXTURE_2D,post.b.texture);
      gl.uniform1i(postUniforms.uPass,2);gl.drawArrays(gl.TRIANGLES,0,3);stats.drawCalls+=3;
      gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.activeTexture(gl.TEXTURE0);
    }
    function lightPlan(eye){
      const distanceTo=light=>(light.p[0]-eye[0])**2+(light.p[1]-eye[1])**2+(light.p[2]-eye[2])**2;
      const sorted=lights.map(light=>({light,d:distanceTo(light)})).sort((a,b)=>a.d-b.d);
      const candidate=sorted.find(entry=>entry.light.p[1]>=2.5&&(entry.light.power||1)>=7)||sorted.find(entry=>entry.light.p[1]>=2.5);
      let chosen=shadowLight;
      if(candidate&&(!chosen||distanceTo(chosen)>candidate.d*1.35+5))chosen=candidate.light;
      if(!candidate)chosen=null;
      const second=sorted.find(entry=>entry.light!==chosen&&entry.light.p[1]>=2.5);
      return {sorted,distanceTo,chosen,shadowLights:chosen?[chosen,...(second&&!environment?[second.light]:[])]:[]};
    }
    // Called once before model construction. A rejected enclosing sphere cannot
    // reach the camera OR any GPU shadow pass, including offscreen sun casters.
    // This changes neither geometry nor shadow resolution/order for kept actors.
    function actorFilter(camera,fx={}){
      stats.actorsConsidered=stats.actorsCulled=0;actorLightPlan=null;
      if(disposed||stats.contextLost){stats.actorFilterMode='inactive';return ()=>true;}
      const t=fx.time||0,shake=fx.shake||0,p=camera.pos||[0,1.6,0],axes=cameraAxes(camera);
      const eye=[p[0]+Math.sin(t*57)*shake*.025,p[1]+Math.sin(t*71)*shake*.015,p[2]];
      const cssWidth=canvas.clientWidth||window.innerWidth||800,cssHeight=canvas.clientHeight||window.innerHeight||600;
      // resize may round/adapt resolution during draw. Enclose every allowed
      // rounded aspect instead of relying on the previous backing-store size.
      const aspect=Math.max(canvas.width/Math.max(1,canvas.height),cssWidth/cssHeight)+(1+cssWidth/cssHeight)/Math.max(1,cssHeight*.3);
      const tangent=Math.tan(Math.max(FOV_MIN,Math.min(110,camera.fov||75))*Math.PI/360),views=[{eye,axes,h:aspect*tangent,v:tangent,far:camera.far||180}];
      const shadows=quality!=='low'&&fx.shadows!==false;
      let sunVolume=null;
      if(shadows){
        const plan=lightPlan(eye);actorLightPlan={eye:eye.slice(),previous:shadowLight,plan};
        const {shadowLights}=plan,down={right:[1,0,0],up:[0,0,-1],forward:[0,-1,0]},lampTangent=Math.tan(138*Math.PI/360);
        if(!fx.sunOnly){
          for(const light of shadowLights)views.push({eye:light.p,axes:down,h:lampTangent,v:lampTangent,far:32});
          const torch=eye.map((v,i)=>v+axes.right[i]*.16-axes.up[i]*.08),torchTangent=Math.tan(108*Math.PI/360);
          views.push({eye:torch,axes,h:torchTangent,v:torchTangent,far:32});
        }
        if(environment){
          const sun=environment.sunDirection,fw=sun.map(v=>-v),length=Math.hypot(fw[0],fw[2]);
          const right=length>.0001?[-fw[2]/length,0,fw[0]/length]:[1,0,0],up=[right[1]*fw[2]-right[2]*fw[1],right[2]*fw[0]-right[0]*fw[2],right[0]*fw[1]-right[1]*fw[0]];
          // The real pass snaps this centre by <=.071 m. A quarter metre guard
          // includes the entire snap and PCF border at both atlas resolutions.
          const area=camera.sun;
          sunVolume=area?{center:area.center,right,up,forward:fw,extent:area.extent+1,lift:area.depth*.5,depth:area.depth}
            :{center:[eye[0]+axes.forward[0]*8,eye[1]+1.4,eye[2]+axes.forward[2]*8],right,up,forward:fw,extent:(quality==='high'?36:28)+.25,lift:55,depth:115};
        }
      }
      stats.actorFilterMode=shadows?'camera-and-shadow-frusta':'camera-frustum';stats.actorFilterVolumes=views.length+(sunVolume?1:0);
      return (x,y,z,radius)=>{
        stats.actorsConsidered++;
        if(![x,y,z,radius].every(Number.isFinite)||radius<0)return true;
        const e={p:[x,y,z],radius:radius+.002};
        for(const v of views)if(visible(e,v.eye,v.axes,v.h,v.v,v.far))return true;
        if(sunVolume){
          const q=sunVolume,dx=x-q.center[0],dy=y-q.center[1],dz=z-q.center[2],dot=a=>dx*a[0]+dy*a[1]+dz*a[2],depth=q.lift+dot(q.forward);
          if(Math.abs(dot(q.right))<=q.extent+e.radius&&Math.abs(dot(q.up))<=q.extent+e.radius&&depth+e.radius>=1&&depth-e.radius<=q.depth)return true;
        }
        stats.actorsCulled++;return false;
      };
    }
    function draw(camera,dynamic,fx) {
      if(disposed||stats.contextLost) return;
      fx=fx||{};autoScale=governor.update(fx,quality);resize();
      const t=fx.time||0,shake=fx.shake||0,p=camera.pos||[0,1.6,0];
      const axes=cameraAxes(camera),{right,up,forward}=axes;
      const eye=[p[0]+Math.sin(t*57.)*shake*.025,p[1]+Math.sin(t*71.)*shake*.015,p[2]];
      view.set([right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,
        -(right[0]*eye[0]+right[1]*eye[1]+right[2]*eye[2]),-(up[0]*eye[0]+up[1]*eye[1]+up[2]*eye[2]),forward[0]*eye[0]+forward[1]*eye[1]+forward[2]*eye[2],1]);
      const fov=Math.max(FOV_MIN,Math.min(110,camera.fov||75))*Math.PI/180,f=1/Math.tan(fov*.5),near=camera.near||.045,far=camera.far||180;
      projection.fill(0);projection[0]=f/(canvas.width/canvas.height);projection[5]=f;projection[10]=(far+near)/(near-far);projection[11]=-1;projection[14]=2*far*near/(near-far);
      multiply(projection,view,vp);
      const ranges=detailRanges(quality);ranges[0]=extendedDistance(ranges[0],environment,eye);stats.viewDistance=ranges[0];
      // PDR : vue de haut, tout le décor part au GPU en un seul lot stable : ni tri ni nouvel envoi quand la caméra bouge,
      // le découpage au champ se fait au clip. Sans camera.allStatic, le tri par portée de FERRO reste inchangé.
      const shown=camera.allStatic?worldIndex.entries:worldIndex.query(eye,ranges).filter(e=>visible(e,eye,axes,canvas.width/canvas.height/f,1/f,ranges[0]));
      stats.staticVisible=shown.length;stats.staticCulled=world.length-shown.length;
      const planned=actorLightPlan&&actorLightPlan.previous===shadowLight&&eye.every((v,k)=>v===actorLightPlan.eye[k])?actorLightPlan.plan:lightPlan(eye);actorLightPlan=null;
      const {sorted,distanceTo,chosen,shadowLights}=planned;shadowLight=chosen;
      // PDR (lampes) : huit lampes passagères (quatre en qualité basse) au lieu de trois : les huit foyers les plus proches
      // de la visée éclairent façades et foule (decor.js) ; la ville n'a pas de lampe fixe, les douze places restent assez.
      const transient=transientLights(fx.lights,eye,quality==='low'?4:8);stats.dynamicLights=transient.length;
      const selected=shadowLights.map(light=>({light,d:distanceTo(light)})).concat(transient.map(light=>({light,d:distanceTo(light)})),sorted.filter(entry=>!shadowLights.includes(entry.light)).slice(0,(quality==='low'?6:12)-shadowLights.length-transient.length));
      const blackout=horrorLights(fx.horror,lights);stats.blackoutLights=blackout?.size||0;
      lightPositions.fill(0);lightColors.fill(0);lightRanges.fill(0);
      selected.forEach(({light},i)=>{lightPositions.set(light.p,i*3);lightRanges[i]=light.range||0;const c=light.color||[1,1,1],power=(light.power===undefined?1:light.power)*(blackout?.get(light)??1);lightColors.set([c[0]*power,c[1]*power,c[2]*power],i*3);});
      const ordinary=[],overlay=[],particles=[],overlayParticles=[];for(const mesh of dynamic||[]) (mesh.overlay?(mesh.fx?overlayParticles:overlay):mesh.fx?particles:ordinary).push(mesh);
      const dynamicBatch=pack(ordinary,environment,true);
      const torchPosition=eye.map((v,i)=>v+right[i]*.16-up[i]*.08);
      stats.drawCalls=0;stats.triangles=0;stats.instances=0;stats.bloom=!!post&&fx.bloom!==false;stats.shadows=!!shadowTarget&&fx.shadows!==false;stats.shadowMaps=stats.shadows?shadowLights.length+1+(environment?1:0):0;stats.shadowMode=environment?'sun-atlas':'atlas';
      stats.uploadBytes=0;stats.fxInstances=0;
      // Animated instances are shared unchanged by every depth and colour pass.
      if(dynamicBatch.values.length){gl.bindBuffer(gl.ARRAY_BUFFER,dynamicBuffer);gl.bufferData(gl.ARRAY_BUFFER,dynamicBatch.values,gl.DYNAMIC_DRAW);stats.uploadBytes+=dynamicBatch.values.byteLength;}
      const crowd=fx.instances&&fx.instances.groups&&fx.instances.groups.length?fx.instances:null,sunOnly=!!fx.sunOnly;
      stats.crowdInstances=crowd?crowd.values.length/16:0;if(sunOnly)stats.shadowMaps=stats.shadows&&environment?1:0;
      if(crowd){if(!crowdBuffer)crowdBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,crowdBuffer);gl.bufferData(gl.ARRAY_BUFFER,crowd.values,gl.DYNAMIC_DRAW);stats.uploadBytes+=crowd.values.byteLength;}
      // PDR (lots) : lots déjà empaquetés par le jeu (fx.lots : le décor), au format de pack. Un lot ne repart au GPU que si
      // l'objet ou sa version (lot.version) change ; il sert ensuite à l'ombre du soleil et à la passe couleur.
      pdrLots.length=0;stats.pdrLotInstances=0;
      if(Array.isArray(fx.lots))for(let i=0;i<fx.lots.length;i++){
        const lot=fx.lots[i];if(!lot||!lot.values||!lot.groups||!lot.groups.length)continue;
        const slot=pdrSlots[i]||(pdrSlots[i]={buffer:gl.createBuffer(),lot:null,version:NaN});
        if(slot.lot!==lot||slot.version!==lot.version){
          gl.bindBuffer(gl.ARRAY_BUFFER,slot.buffer);gl.bufferData(gl.ARRAY_BUFFER,lot.values,gl.DYNAMIC_DRAW);stats.uploadBytes+=lot.values.byteLength;
          slot.lot=lot;slot.version=lot.version;
        }
        pdrLots.push(slot);stats.pdrLotInstances+=lot.values.length/16;
      }
      if(stats.shadows){
        gl.bindFramebuffer(gl.FRAMEBUFFER,shadowTarget.framebuffer);gl.clear(gl.DEPTH_BUFFER_BIT);
        if(!sunOnly)shadowLights.forEach((light,i)=>shadowPass(light,dynamicBatch,i,null,t));
        if(environment)sunShadowPass(eye,axes,dynamicBatch,t,camera,fx,crowd);
        if(!sunOnly)shadowPass({p:torchPosition},dynamicBatch,2,axes,t);
      }
      // PDR (msaa) : fx.msaa === false coupe l'anticrénelage à l'exécution, sans recréer les cibles (réglage du jeu).
      const msaa=stats.bloom&&post.msaa&&fx.msaa!==false?post.msaa:null;
      gl.bindFramebuffer(gl.FRAMEBUFFER,stats.bloom?(msaa?msaa.framebuffer:post.scene.framebuffer):null);gl.viewport(0,0,canvas.width,canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(environment)skyPass(axes,f,t);gl.useProgram(program);gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(uniforms.uViewProjection,false,vp);gl.uniform3fv(uniforms.uEye,eye);gl.uniform3fv(uniforms.uForward,forward);
      gl.uniform2f(uniforms.uWindTime,environment?environment.wind:0,t);gl.uniform3fv(uniforms.uSunDirection,environment?environment.sunDirection:[.4,.8,.3]);gl.uniform3fv(uniforms.uSunColor,environment?environment.sunColor:[0,0,0]);
      gl.uniform3fv(uniforms.uAmbient,environment?environment.ambient:[.075,.10,.12]);gl.uniform3fv(uniforms.uFogColor,environment?environment.fog:[.009,.018,.024]);gl.uniform2f(uniforms.uEnvironment,environment?1:0,environment?environment.fogDensity:.014);
      gl.uniform3fv(uniforms.uSkyTop,environment?environment.skyTop:[.05,.08,.10]);gl.uniform3fv(uniforms.uSkyBottom,environment?environment.skyBottom:[.16,.20,.22]);
      gl.uniform3fv(uniforms.uLightPosition,lightPositions);gl.uniform3fv(uniforms.uLightColor,lightColors);gl.uniform1fv(uniforms.uLightRange,lightRanges);gl.uniform1i(uniforms.uLightCount,selected.length);
      gl.uniform2f(uniforms.uResolution,canvas.width,canvas.height);gl.uniform4f(uniforms.uEffects,t,fx.flash||0,fx.damage||0,Math.max(0,Math.min(1,fx.pulse||0)));
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,stats.shadows?shadowTarget.texture:whiteTexture);gl.uniform1i(uniforms.uShadowMap,2);
      gl.uniformMatrix4fv(uniforms.uShadowMatrix,false,shadowMatrices);gl.uniform4f(uniforms.uShadowSettings,stats.shadows&&!sunOnly?shadowLights.length:0,shadowTarget?1/(shadowTarget.size*2):1,stats.shadows&&!sunOnly?1:0,stats.shadows&&environment?(sunOnly?2:1):0);
      // PDR : sans lampe torche (fx.torch === false), sa source est renvoyée assez loin pour ne plus rien éclairer.
      gl.uniform3fv(uniforms.uTorchPosition,fx.torch===false?[0,-1e5,0]:torchPosition);
      // PDR (voile) : fx.voile = { texture R8, origine [x0, z0], taille [largeur, profondeur], force } sur l'unité 4. Sans
      // voile, rien n'est posé ; à la première image sans lui, la texture blanche reprend l'unité et la force revient à 0.
      const voile=fx.voile&&fx.voile.texture&&fx.voile.force>0?fx.voile:null;
      if(voile||pdrVoilePose){
        gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,voile?voile.texture:whiteTexture);
        if(voile)gl.uniform4f(uniforms.uVoileZone,voile.origine[0],voile.origine[1],1/Math.max(.001,voile.taille[0]),1/Math.max(.001,voile.taille[1]));
        gl.uniform1f(uniforms.uVoileForce,voile?Math.min(1,voile.force):0);gl.activeTexture(gl.TEXTURE2);pdrVoilePose=!!voile;
      }
      renderStatic(shown,0);
      // BITUME : chaussée et terrain, puis décor par lots, découpés au champ et à la portée de chaque lot.
      dessinerNappes(eye,axes,canvas.width/canvas.height/f,1/f,far);
      stats.lotsVisibles=dessinerLots(eye,axes,canvas.width/canvas.height/f,1/f,far);
      renderBatch(dynamicBatch,dynamicBuffer,false);
      if(crowd)renderBatch(crowd,crowdBuffer,false);
      // PDR (lots) : les lots du jeu, dans la cible de la scène (MSAA), avant les effets translucides.
      for(const entry of pdrLots)renderBatch(entry.lot,entry.buffer,false);
      // PDR (foule) : puis la foule sur le GPU (fx.foule.couleur), dans la même cible ; au retour, le moteur reprend son état GL.
      if(fx.foule&&typeof fx.foule.couleur==='function'){
        const v=pdrVue,ombre=v.ombre;
        v.oeil=eye;v.avant=forward;v.droite=right;v.haut=up;v.fov=fov;v.tangente=1/f;v.focale=canvas.height*f*.5;v.largeur=canvas.width;v.hauteur=canvas.height;
        v.near=near;v.far=far;v.temps=t;v.qualite=quality;v.msaa=msaa?msaa.samples:0;
        const env=environment||PDR_INDOOR;
        v.soleil=env.sunDirection;v.couleurSoleil=env.sunColor;v.ambiance=env.ambient;v.brouillard=env.fog;
        v.densiteBrouillard=env.fogDensity;v.cielHaut=env.skyTop;v.cielBas=env.skyBottom;
        ombre.texture=stats.shadows?shadowTarget.texture:whiteTexture;ombre.active=!!(stats.shadows&&environment);ombre.plein=sunOnly;
        ombre.texel=shadowTarget?1/(shadowTarget.size*2):1;if(ombre.active)for(let k=0;k<16;k++)pdrMatriceSoleil[k]=shadowMatrices[16+k];
        v.lumieres.nombre=selected.length;
        pdrCompter(fx.foule.couleur(gl,v),false);
        gl.useProgram(program);gl.bindVertexArray(vao);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
        gl.depthMask(true);gl.disable(gl.BLEND);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,ombre.texture);
      }
      if(particles.length)renderEffects(particles,eye,t);
      if(overlay.length||overlayParticles.length) {
        if(blackout){selected.forEach(({light},i)=>{const c=light.color||[1,1,1],power=light.power===undefined?1:light.power;lightColors.set([c[0]*power,c[1]*power,c[2]*power],i*3);});gl.uniform3fv(uniforms.uLightColor,lightColors);}
        gl.clear(gl.DEPTH_BUFFER_BIT);if(overlay.length)renderBatch(pack(overlay,environment,true),overlayBuffer,true);
        if(overlayParticles.length)renderEffects(overlayParticles,eye,t);
      }
      if(msaa){
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,msaa.framebuffer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,post.scene.framebuffer);
        gl.blitFramebuffer(0,0,canvas.width,canvas.height,0,0,canvas.width,canvas.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      }
      if(stats.bloom)postPass();
    }
    function lost(event){event.preventDefault();stats.contextLost=true;}
    function restored(){if(!disposed){initialize();chargerNappes();chargerLots();}} // BITUME : nappes et lots rechargés
    canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
    function dispose() {
      if(disposed) return;disposed=true;
      canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
      for(const buffer of [vbo,ibo,worldBuffer,dynamicBuffer,overlayBuffer,fxBuffer]) gl.deleteBuffer(buffer);if(crowdBuffer)gl.deleteBuffer(crowdBuffer);
      for(const cache of staticCaches.slice(1))gl.deleteBuffer(cache.buffer);
      // BITUME : tampons des nappes et des lots.
      if(nappeVbo)gl.deleteBuffer(nappeVbo);if(nappeIbo)gl.deleteBuffer(nappeIbo);if(nappeVao)gl.deleteVertexArray(nappeVao);
      for(const l of lots)for(const cle of ['tampon','tamponLoin'])if(l[cle])gl.deleteBuffer(l[cle]);
      // PDR (lots) : tampons des lots du jeu.
      for(const slot of pdrSlots)if(slot)gl.deleteBuffer(slot.buffer);pdrSlots=[];pdrLots.length=0;
      freePost();deleteTarget(shadowTarget);gl.deleteTexture(whiteTexture);
      gl.deleteVertexArray(vao);gl.deleteVertexArray(postVao);gl.deleteProgram(program);gl.deleteProgram(depthProgram);gl.deleteProgram(postProgram);gl.deleteProgram(skyProgram);gl.deleteProgram(fxProgram);
    }
    // PDR (foule) : le jeu dessine la foule lui-même dans les passes du moteur. renderer.gl est le contexte WebGL 2 ;
    // renderer.pdr donne la bibliothèque d'éclairage (glsl), lier(programme) qui rend la fonction posant ses uniformes à
    // partir de la vue passée à fx.foule.couleur, la génération du contexte (elle change après une perte de contexte : tout
    // est à recréer) et la compilation des shaders avec les messages du moteur.
    const pdr={glsl:pdrGlsl,uniformes:PDR_UNIFORMS,
      get generation(){return pdrGeneration;},
      programme(vertex,fragment){return link(vertex,fragment);},
      lier(programme){
        const u={};for(const name of PDR_UNIFORMS)u[name]=gl.getUniformLocation(programme,name);
        return v=>{
          const o=v.ombre;
          gl.uniform1i(u.uPdrOmbre,o.unite);gl.uniformMatrix4fv(u.uPdrMatriceOmbre,false,o.matrice);
          gl.uniform4f(u.uPdrOmbreReglages,o.active?1:0,o.texel,o.plein?1:0,0);
          gl.uniform3fv(u.uPdrOeil,v.oeil);gl.uniform3fv(u.uPdrSoleil,v.soleil);gl.uniform3fv(u.uPdrCouleurSoleil,v.couleurSoleil);
          gl.uniform3fv(u.uPdrAmbiance,v.ambiance);gl.uniform3fv(u.uPdrBrouillard,v.brouillard);
          gl.uniform3fv(u.uPdrCielHaut,v.cielHaut);gl.uniform3fv(u.uPdrCielBas,v.cielBas);
          gl.uniform4f(u.uPdrEnvironnement,1,v.densiteBrouillard,v.temps,0);gl.uniform2f(u.uPdrResolution,v.largeur,v.hauteur);
          const l=v.lumieres;gl.uniform3fv(u.uPdrLumierePosition,l.positions);gl.uniform3fv(u.uPdrLumiereCouleur,l.couleurs);
          gl.uniform1fv(u.uPdrLumierePortee,l.portees);gl.uniform1i(u.uPdrLumieres,l.nombre);
        };
      }};
    return {setWorld,updateWorld,draw,resize,dispose,stats,actorFilter,setNappes,setLots,gl,pdr};
  }
  window.FRender={create,foliageTriangles};
})();
