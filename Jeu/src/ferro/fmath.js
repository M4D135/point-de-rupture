/* FERRO — FMath: sin, cos, atan, atan2 and hypot identical on every platform.
 *
 * A plain-JavaScript port of fdlibm 5.3 as adapted by V8 (src/base/ieee754.cc):
 * __ieee754_rem_pio2 with the npio2_hw table, __kernel_rem_pio2 for huge
 * arguments, __kernel_cos with qx, the 2^-27 atan threshold and "m &= 1" in
 * atan2 when |y/x| > 2^60. Every operation is one IEEE-754 double operation, so
 * no fused multiply-add can creep in: the results are those of V8 compiled
 * without FMA contraction (x86-64), whatever the host. Host Math.sin/cos/atan/
 * atan2 may differ in the last bit (V8 for arm64 is compiled with contraction).
 * hypot, hypot2 and hypot3 port V8's MathHypot builtin (src/builtins/math.tq),
 * which every V8 build computes alike; JavaScriptCore (Safari) does not.
 *
 * Standalone engine module: it knows nothing about the game. It reads the words
 * of a double through one shared typed array (endianness detected at load), and
 * never allocates per call (hypot with more than three arguments excepted).
 * Only exact Math helpers are used: abs, floor and the correctly rounded sqrt.
 *
 * fdlibm: Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunSoft, a Sun Microsystems, Inc. business. Permission to use,
 * copy, modify, and distribute this software is freely granted, provided that
 * this notice is preserved.
 *
 * V8 (src/base/ieee754.cc; MathHypot of src/builtins/math.tq for hypot): the
 * original source code covered by the above license has been modified
 * significantly by Google Inc.
 * Copyright 2016 the V8 project authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *   * Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *   * Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 *   * Neither the name of Google Inc. nor the names of its contributors may be
 *     used to endorse or promote products derived from this software without
 *     specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
(function(G){
  'use strict';
  const fabs=Math.abs,floor=Math.floor,sqrt=Math.sqrt;
  const INF=1/0,NAN=0/0; // local constants: no global lookup in the hot paths

  // Word access. HI/LO index the high and low 32-bit words of f64[0].
  const f64=new Float64Array(1),u32=new Uint32Array(f64.buffer);
  f64[0]=1;
  const HI=u32[1]===0x3ff00000?1:0,LO=1-HI;
  if(u32[HI]!==0x3ff00000||u32[LO]!==0)throw new Error('FMath: unsupported double layout');
  function high(x){f64[0]=x;return u32[HI]|0;}
  function low(x){f64[0]=x;return u32[LO];}
  function words(hi,lo){u32[HI]=hi;u32[LO]=lo;return f64[0];}
  // x*2^n, exact whenever the result is a normal double (always the case here).
  function scalbn(x,n){
    while(n>1023){x*=8.98846567431158e307;n-=1023;}
    while(n<-1022){x*=2.2250738585072014e-308;n+=1022;}
    return x*words((n+1023)<<20,0);
  }

  /* __kernel_sin(x, y, iy): sin on [-pi/4, pi/4]; y is the tail of x, iy=0 if y is 0. */
  const S1=-1.66666666666666324348e-01, /* 0xBFC55555, 0x55555549 */
    S2=8.33333333332248946124e-03, /* 0x3F811111, 0x1110F8A6 */
    S3=-1.98412698298579493134e-04, /* 0xBF2A01A0, 0x19C161D5 */
    S4=2.75573137070700676789e-06, /* 0x3EC71DE3, 0x57B1FE7D */
    S5=-2.50507602534068634195e-08, /* 0xBE5AE5E6, 0x8A2B9CEB */
    S6=1.58969099521155010221e-10; /* 0x3DE5D93A, 0x5ACFD57C */
  function kernelSin(x,y,iy){
    const ix=high(x)&0x7fffffff;
    if(ix<0x3e400000)return x; /* |x| < 2^-27: (int)x == 0 */
    const z=x*x,v=z*x,r=S2+z*(S3+z*(S4+z*(S5+z*S6)));
    if(iy===0)return x+v*(S1+z*r);
    return x-((z*(0.5*y-v*r)-y)-v*S1);
  }

  /* __kernel_cos(x, y): cos on [-pi/4, pi/4], fdlibm 5.3 version with qx. */
  const C1=4.16666666666666019037e-02, /* 0x3FA55555, 0x5555554C */
    C2=-1.38888888888741095749e-03, /* 0xBF56C16C, 0x16C15177 */
    C3=2.48015872894767294178e-05, /* 0x3EFA01A0, 0x19CB1590 */
    C4=-2.75573143513906633035e-07, /* 0xBE927E4F, 0x809C52AD */
    C5=2.08757232129817482790e-09, /* 0x3E21EE9E, 0xBDB4B1C4 */
    C6=-1.13596475577881948265e-11; /* 0xBDA8FAE9, 0xBE8838D4 */
  function kernelCos(x,y){
    const ix=high(x)&0x7fffffff;
    if(ix<0x3e400000)return 1; /* |x| < 2^-27: (int)x == 0 */
    const z=x*x,r=z*(C1+z*(C2+z*(C3+z*(C4+z*(C5+z*C6)))));
    if(ix<0x3fd33333)return 1-(0.5*z-(z*r-x*y)); /* |x| < 0.3 */
    const qx=ix>0x3fe90000?0.28125:words(ix-0x00200000,0); /* x/4 */
    const iz=0.5*z-qx,a=1-qx;
    return a-(iz-(z*r-x*y));
  }

  /* __kernel_rem_pio2, called with prec = 2 (53-bit result in y[0] + y[1]). */
  const twoOverPi=new Int32Array([ /* 1584 bits of 2/pi in 24-bit chunks */
    0xA2F983,0x6E4E44,0x1529FC,0x2757D1,0xF534DD,0xC0DB62,0x95993C,0x439041,0xFE5163,0xABDEBB,0xC561B7,
    0x246E3A,0x424DD2,0xE00649,0x2EEA09,0xD1921C,0xFE1DEB,0x1CB129,0xA73EE8,0x8235F5,0x2EBB44,0x84E99C,
    0x7026B4,0x5F7E41,0x3991D6,0x398353,0x39F49C,0x845F8B,0xBDF928,0x3B1FF8,0x97FFDE,0x05980F,0xEF2F11,
    0x8B5A0A,0x6D1F6D,0x367ECF,0x27CB09,0xB74F46,0x3F669E,0x5FEA2D,0x7527BA,0xC7EBE5,0xF17B3D,0x0739F7,
    0x8A5292,0xEA6BFB,0x5FB11F,0x8D5D08,0x560330,0x46FC7B,0x6BABF0,0xCFBC20,0x9AF436,0x1DA9E3,0x91615E,
    0xE61B08,0x659985,0x5F14A0,0x68408D,0xFFD880,0x4D7327,0x310606,0x1556CA,0x73A8C9,0x60E27B,0xC08C6B]);
  const PIo2=new Float64Array([ /* pi/2 in 24-bit chunks */
    1.57079625129699707031e+00, /* 0x3FF921FB, 0x40000000 */
    7.54978941586159635335e-08, /* 0x3E74442D, 0x00000000 */
    5.39030252995776476554e-15, /* 0x3CF84698, 0x80000000 */
    3.28200341580791294123e-22, /* 0x3B78CC51, 0x60000000 */
    1.27065575308067607349e-29, /* 0x39F01B83, 0x80000000 */
    1.22933308981111328932e-36, /* 0x387A2520, 0x40000000 */
    2.73370053816464559624e-44, /* 0x36E38222, 0x80000000 */
    2.16741683877804819444e-51]); /* 0x3569F31D, 0x00000000 */
  const two24=1.67772160000000000000e+07, /* 0x41700000, 0x00000000 */
    twon24=5.96046447753906250000e-08; /* 0x3E700000, 0x00000000 */
  const iq=new Int32Array(20),fk=new Float64Array(20),fq=new Float64Array(20),qk=new Float64Array(20),tx=new Float64Array(3);
  const yy=new Float64Array(2); // y[0], y[1] of the last reduction
  function kernelRemPio2(x,e0,nx){
    const jk=4,jp=jk,jx=nx-1; /* init_jk[2] */
    let jv=((e0-3)/24)|0;if(jv<0)jv=0;
    let q0=e0-24*(jv+1),jz,i,j,k,n,ih,z,fw;
    j=jv-jx;
    for(i=0;i<=jx+jk;i++,j++)fk[i]=j<0?0:twoOverPi[j];
    for(i=0;i<=jk;i++){for(j=0,fw=0;j<=jx;j++)fw+=x[j]*fk[jx+i-j];qk[i]=fw;}
    jz=jk;
    for(;;){ /* recompute */
      for(i=0,j=jz,z=qk[jz];j>0;i++,j--){ /* distill q[] into iq[] reversingly */
        fw=(twon24*z)|0;
        iq[i]=(z-two24*fw)|0;
        z=qk[j-1]+fw;
      }
      z=scalbn(z,q0); /* actual value of z */
      z-=8*floor(z*0.125); /* trim off integer >= 8 */
      n=z|0;
      z-=n;
      ih=0;
      if(q0>0){ /* need iq[jz-1] to determine n */
        i=iq[jz-1]>>(24-q0);n+=i;iq[jz-1]-=i<<(24-q0);ih=iq[jz-1]>>(23-q0);
      }else if(q0===0)ih=iq[jz-1]>>23;
      else if(z>=0.5)ih=2;
      if(ih>0){ /* q > 0.5 */
        n+=1;let carry=0;
        for(i=0;i<jz;i++){ /* compute 1-q */
          j=iq[i];
          if(carry===0){if(j!==0){carry=1;iq[i]=0x1000000-j;}}
          else iq[i]=0xffffff-j;
        }
        if(q0===1)iq[jz-1]&=0x7fffff;else if(q0===2)iq[jz-1]&=0x3fffff; /* rare case: q0 > 0 */
        if(ih===2){z=1-z;if(carry!==0)z-=scalbn(1,q0);}
      }
      if(z===0){ /* check if recomputation is needed */
        for(j=0,i=jz-1;i>=jk;i--)j|=iq[i];
        if(j===0){
          for(k=1;jk>=k&&iq[jk-k]===0;k++); /* k = no. of terms needed */
          for(i=jz+1;i<=jz+k;i++){ /* add q[jz+1] to q[jz+k] */
            fk[jx+i]=twoOverPi[jv+i];
            for(j=0,fw=0;j<=jx;j++)fw+=x[j]*fk[jx+i-j];
            qk[i]=fw;
          }
          jz+=k;
          continue;
        }
      }
      break;
    }
    if(z===0){ /* chop off zero terms */
      jz-=1;q0-=24;
      while(iq[jz]===0){jz--;q0-=24;}
    }else{ /* break z into 24-bit if necessary */
      z=scalbn(z,-q0);
      if(z>=two24){
        fw=(twon24*z)|0;
        iq[jz]=(z-two24*fw)|0;
        jz+=1;q0+=24;iq[jz]=fw;
      }else iq[jz]=z|0;
    }
    fw=scalbn(1,q0); /* convert integer "bit" chunk to floating-point value */
    for(i=jz;i>=0;i--){qk[i]=fw*iq[i];fw*=twon24;}
    for(i=jz;i>=0;i--){ /* compute PIo2[0,...,jp]*q[jz,...,0] */
      for(fw=0,k=0;k<=jp&&k<=jz-i;k++)fw+=PIo2[k]*qk[i+k];
      fq[jz-i]=fw;
    }
    fw=0; /* compress fq[] into y[] (prec 1 or 2) */
    for(i=jz;i>=0;i--)fw+=fq[i];
    yy[0]=ih===0?fw:-fw;
    fw=fq[0]-fw;
    for(i=1;i<=jz;i++)fw+=fq[i];
    yy[1]=ih===0?fw:-fw;
    return n&7;
  }

  /* __ieee754_rem_pio2(x): x - n*pi/2 in yy[0] + yy[1], returns n. */
  const npio2hw=new Int32Array([
    0x3FF921FB,0x400921FB,0x4012D97C,0x401921FB,0x401F6A7A,0x4022D97C,0x4025FDBB,0x402921FB,
    0x402C463A,0x402F6A7A,0x4031475C,0x4032D97C,0x40346B9C,0x4035FDBB,0x40378FDB,0x403921FB,
    0x403AB41B,0x403C463A,0x403DD85A,0x403F6A7A,0x40407E4C,0x4041475C,0x4042106C,0x4042D97C,
    0x4043A28C,0x40446B9C,0x404534AC,0x4045FDBB,0x4046C6CB,0x40478FDB,0x404858EB,0x404921FB]);
  const invpio2=6.36619772367581382433e-01, /* 0x3FE45F30, 0x6DC9C883 */
    pio2_1=1.57079632673412561417e+00, /* 0x3FF921FB, 0x54400000 */
    pio2_1t=6.07710050650619224932e-11, /* 0x3DD0B461, 0x1A626331 */
    pio2_2=6.07710050630396597660e-11, /* 0x3DD0B461, 0x1A600000 */
    pio2_2t=2.02226624879595063154e-21, /* 0x3BA3198A, 0x2E037073 */
    pio2_3=2.02226624871116645580e-21, /* 0x3BA3198A, 0x2E000000 */
    pio2_3t=8.47842766036889956997e-32; /* 0x397B839A, 0x252049C1 */
  function remPio2(x){
    const hx=high(x),ix=hx&0x7fffffff;
    let z,y0,y1;
    if(ix<=0x3fe921fb){yy[0]=x;yy[1]=0;return 0;} /* |x| ~<= pi/4 */
    if(ix<0x4002d97c){ /* |x| < 3pi/4, special case with n=+-1 */
      if(hx>0){
        z=x-pio2_1;
        if(ix!==0x3ff921fb){y0=z-pio2_1t;y1=(z-y0)-pio2_1t;} /* 33+53 bit pi is good enough */
        else{z-=pio2_2;y0=z-pio2_2t;y1=(z-y0)-pio2_2t;} /* near pi/2, use 33+33+53 bit pi */
        yy[0]=y0;yy[1]=y1;return 1;
      }
      z=x+pio2_1;
      if(ix!==0x3ff921fb){y0=z+pio2_1t;y1=(z-y0)+pio2_1t;}
      else{z+=pio2_2;y0=z+pio2_2t;y1=(z-y0)+pio2_2t;}
      yy[0]=y0;yy[1]=y1;return -1;
    }
    if(ix<=0x413921fb){ /* |x| ~<= 2^19*(pi/2), medium size */
      let t=fabs(x);
      const n=(t*invpio2+0.5)|0,fn=n;
      let r=t-fn*pio2_1,w=fn*pio2_1t; /* 1st round good to 85 bit */
      if(n<32&&ix!==npio2hw[n-1])y0=r-w; /* quick check no cancellation */
      else{
        const j=ix>>20;
        y0=r-w;
        let i=j-((high(y0)>>20)&0x7ff);
        if(i>16){ /* 2nd iteration needed, good to 118 */
          t=r;w=fn*pio2_2;r=t-w;w=fn*pio2_2t-((t-r)-w);y0=r-w;
          i=j-((high(y0)>>20)&0x7ff);
          if(i>49){ /* 3rd iteration needed, 151 bits acc */
            t=r;w=fn*pio2_3;r=t-w;w=fn*pio2_3t-((t-r)-w);y0=r-w;
          }
        }
      }
      y1=(r-y0)-w;
      if(hx<0){yy[0]=-y0;yy[1]=-y1;return -n;}
      yy[0]=y0;yy[1]=y1;return n;
    }
    if(ix>=0x7ff00000){yy[0]=yy[1]=x-x;return 0;} /* inf or NaN */
    const e0=(ix>>20)-1046,lo=low(x); /* z = scalbn(|x|, ilogb(x)-23) */
    z=words(ix-(e0<<20),lo);
    for(let i=0;i<2;i++){tx[i]=z|0;z=(z-tx[i])*two24;}
    tx[2]=z;
    let nx=3;
    while(tx[nx-1]===0)nx--; /* skip zero term */
    const n=kernelRemPio2(tx,e0,nx);
    if(hx<0){yy[0]=-yy[0];yy[1]=-yy[1];return -n;}
    return n;
  }

  function sin(x){
    x=+x;
    const ix=high(x)&0x7fffffff;
    if(ix<=0x3fe921fb)return kernelSin(x,0,0); /* |x| ~< pi/4 */
    if(ix>=0x7ff00000)return x-x; /* sin(Inf or NaN) is NaN */
    const n=remPio2(x);
    switch(n&3){
      case 0:return kernelSin(yy[0],yy[1],1);
      case 1:return kernelCos(yy[0],yy[1]);
      case 2:return -kernelSin(yy[0],yy[1],1);
      default:return -kernelCos(yy[0],yy[1]);
    }
  }

  function cos(x){
    x=+x;
    const ix=high(x)&0x7fffffff;
    if(ix<=0x3fe921fb)return kernelCos(x,0); /* |x| ~< pi/4 */
    if(ix>=0x7ff00000)return x-x; /* cos(Inf or NaN) is NaN */
    const n=remPio2(x);
    switch(n&3){
      case 0:return kernelCos(yy[0],yy[1]);
      case 1:return -kernelSin(yy[0],yy[1],1);
      case 2:return -kernelCos(yy[0],yy[1]);
      default:return kernelSin(yy[0],yy[1],1);
    }
  }

  const atanhi=new Float64Array([
    4.63647609000806093515e-01, /* atan(0.5)hi 0x3FDDAC67, 0x0561BB4F */
    7.85398163397448278999e-01, /* atan(1.0)hi 0x3FE921FB, 0x54442D18 */
    9.82793723247329054082e-01, /* atan(1.5)hi 0x3FEF730B, 0xD281F69B */
    1.57079632679489655800e+00]); /* atan(inf)hi 0x3FF921FB, 0x54442D18 */
  const atanlo=new Float64Array([
    2.26987774529616870924e-17, /* atan(0.5)lo 0x3C7A2B7F, 0x222F65E2 */
    3.06161699786838301793e-17, /* atan(1.0)lo 0x3C81A626, 0x33145C07 */
    1.39033110312309984516e-17, /* atan(1.5)lo 0x3C700788, 0x7AF0CBBD */
    6.12323399573676603587e-17]); /* atan(inf)lo 0x3C91A626, 0x33145C07 */
  const aT0=3.33333333333329318027e-01, /* 0x3FD55555, 0x5555550D */
    aT1=-1.99999999998764832476e-01, /* 0xBFC99999, 0x9998EBC4 */
    aT2=1.42857142725034663711e-01, /* 0x3FC24924, 0x920083FF */
    aT3=-1.11111104054623557880e-01, /* 0xBFBC71C6, 0xFE231671 */
    aT4=9.09088713343650656196e-02, /* 0x3FB745CD, 0xC54C206E */
    aT5=-7.69187620504482999495e-02, /* 0xBFB3B0F2, 0xAF749A6D */
    aT6=6.66107313738753120669e-02, /* 0x3FB10D66, 0xA0D03D51 */
    aT7=-5.83357013379057348645e-02, /* 0xBFADDE2D, 0x52DEFD9A */
    aT8=4.97687799461593236017e-02, /* 0x3FA97B4B, 0x24760DEB */
    aT9=-3.65315727442169155270e-02, /* 0xBFA2B444, 0x2C6A6C2F */
    aT10=1.62858201153657823623e-02; /* 0x3F90AD3A, 0xE322DA11 */
  function atan(x){
    x=+x;
    const hx=high(x),ix=hx&0x7fffffff;
    let id;
    if(ix>=0x44100000){ /* |x| >= 2^66 */
      if(ix>0x7ff00000||(ix===0x7ff00000&&low(x)!==0))return x+x; /* NaN */
      return hx>0?atanhi[3]+atanlo[3]:-atanhi[3]-atanlo[3];
    }
    if(ix<0x3fdc0000){ /* |x| < 0.4375 */
      if(ix<0x3e400000)return x; /* |x| < 2^-27 */
      id=-1;
    }else{
      x=fabs(x);
      if(ix<0x3ff30000){ /* |x| < 1.1875 */
        if(ix<0x3fe60000){id=0;x=(2*x-1)/(2+x);} /* 7/16 <= |x| < 11/16 */
        else{id=1;x=(x-1)/(x+1);} /* 11/16 <= |x| < 19/16 */
      }else if(ix<0x40038000){id=2;x=(x-1.5)/(1+1.5*x);} /* |x| < 2.4375 */
      else{id=3;x=-1/x;} /* 2.4375 <= |x| < 2^66 */
    }
    const z=x*x,w=z*z; /* odd and even halves of the polynomial */
    const s1=z*(aT0+w*(aT2+w*(aT4+w*(aT6+w*(aT8+w*aT10)))));
    const s2=w*(aT1+w*(aT3+w*(aT5+w*(aT7+w*aT9))));
    if(id<0)return x-x*(s1+s2);
    const r=atanhi[id]-((x*(s1+s2)-atanlo[id])-x);
    return hx<0?-r:r;
  }

  const tiny=1.0e-300,
    pi_o_4=7.8539816339744827900e-01, /* 0x3FE921FB, 0x54442D18 */
    pi_o_2=1.5707963267948965580e+00, /* 0x3FF921FB, 0x54442D18 */
    pi=3.1415926535897931160e+00, /* 0x400921FB, 0x54442D18 */
    pi_lo=1.2246467991473531772e-16; /* 0x3CA1A626, 0x33145C07 */
  function atan2(y,x){
    y=+y;x=+x;
    if(x!==x||y!==y)return x+y; /* x or y is NaN */
    const hx=high(x),lx=low(x),hy=high(y),ly=low(y),ix=hx&0x7fffffff,iy=hy&0x7fffffff;
    if(((hx-0x3ff00000)|lx)===0)return atan(y); /* x = 1.0 */
    let m=((hy>>31)&1)|((hx>>30)&2); /* 2*sign(x)+sign(y) */
    if((iy|ly)===0){ /* y = 0 */
      switch(m){
        case 0:case 1:return y; /* atan(+-0,+anything)=+-0 */
        case 2:return pi+tiny; /* atan(+0,-anything) = pi */
        default:return -pi-tiny; /* atan(-0,-anything) =-pi */
      }
    }
    if((ix|lx)===0)return hy<0?-pi_o_2-tiny:pi_o_2+tiny; /* x = 0 */
    if(ix===0x7ff00000){ /* x is INF */
      if(iy===0x7ff00000){
        switch(m){
          case 0:return pi_o_4+tiny;
          case 1:return -pi_o_4-tiny;
          case 2:return 3*pi_o_4+tiny;
          default:return -3*pi_o_4-tiny;
        }
      }
      switch(m){
        case 0:return 0;
        case 1:return -0;
        case 2:return pi+tiny;
        default:return -pi-tiny;
      }
    }
    if(iy===0x7ff00000)return hy<0?-pi_o_2-tiny:pi_o_2+tiny; /* y is INF */
    const k=(iy-ix)>>20; /* compute y/x */
    let z;
    if(k>60){z=pi_o_2+0.5*pi_lo;m&=1;} /* |y/x| > 2^60 */
    else if(hx<0&&k< -60)z=0; /* 0 > |y|/x > -2^-60 */
    else z=atan(fabs(y/x)); /* safe to do y/x */
    switch(m){
      case 0:return z; /* atan(+,+) */
      case 1:return -z; /* atan(-,+) */
      case 2:return pi-(z-pi_lo); /* atan(+,-) */
      default:return (z-pi_lo)-pi; /* atan(-,-) */
    }
  }

  /* hypot as V8's MathHypot builtin computes it on every platform: ToNumber in
   * argument order; Infinity if one argument is infinite, even beside a NaN;
   * then NaN; 0 if every argument is zero; otherwise, with max the largest
   * magnitude, a Kahan-compensated sum of (|arg|/max)^2 in argument order, and
   * sqrt(sum)*max. NaN results are only guaranteed to be NaN (any payload). */
  /* hypot2(x, y) == Math.hypot(x, y) of V8, exactly two arguments, no allocation.
   * The first Kahan step is exact and the largest term is exactly 1, so the sum
   * is 1+r*r with r = min/max. A NaN in x lands in max, a NaN in y in min. */
  function hypot2(x,y){
    x=fabs(x);y=fabs(y);
    const max=y>x?y:x,min=y>x?x:y;
    if(max===INF||min===INF)return INF;
    if(max===0)return min; /* +0, or NaN */
    const r=min/max; /* NaN when an argument is NaN */
    return sqrt(1+r*r)*max;
  }
  /* hypot3(x, y, z) == Math.hypot(x, y, z) of V8, exactly three arguments, no
   * allocation. The compensation of the second step corrects the third. A NaN
   * in x stays in max; any other NaN reaches the sum. */
  function hypot3(x,y,z){
    x=fabs(x);y=fabs(y);z=fabs(z);
    if(x===INF||y===INF||z===INF)return INF;
    let max=x;
    if(y>max)max=y;
    if(z>max)max=z;
    if(max===0)return x+y+z; /* +0, or NaN */
    const a=x/max,b=y/max,c=z/max,a2=a*a,b2=b*b,s=a2+b2;
    return sqrt(s+(c*c-((s-a2)-b2)))*max;
  }
  /* hypot(...values) == Math.hypot(...values) of V8, any number of arguments.
   * Two and three go to hypot2 and hypot3; more allocate one Float64Array. */
  function hypot(){
    const n=arguments.length;
    if(n===2)return hypot2(arguments[0],arguments[1]);
    if(n===3)return hypot3(arguments[0],arguments[1],arguments[2]);
    if(n<2)return n===0?0:fabs(arguments[0]); /* sqrt(1)*|x| */
    const v=new Float64Array(n);
    let max=0,nan=false;
    for(let i=0;i<n;i++){const a=fabs(arguments[i]);if(a!==a)nan=true;else{v[i]=a;if(a>max)max=a;}}
    if(max===INF)return INF;
    if(nan)return NAN;
    if(max===0)return 0;
    let sum=0,compensation=0;
    for(let i=0;i<n;i++){
      const q=v[i]/max,summand=q*q-compensation,preliminary=sum+summand;
      compensation=(preliminary-sum)-summand;sum=preliminary;
    }
    return sqrt(sum)*max;
  }

  G.FMath=Object.freeze({sin,cos,atan,atan2,hypot,hypot2,hypot3});
})(typeof window!=='undefined'?window:globalThis);
