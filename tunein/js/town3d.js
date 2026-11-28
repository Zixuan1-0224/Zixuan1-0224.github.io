import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ═════════ [T01] 設定（和 Unity 一致：PlayAreaBounds 300×300、insideRatio .9、flipZ） ═════════ */
/* ╔══════════════════════════════════════════════════════════════╗
   ║  【CONFIG 常改的數字】想調整手感／大小，只改這一區（每一項後面寫了作用）  ║
   ╚══════════════════════════════════════════════════════════════╝ */
const CFG = {
  walkSpeed: 4.5,        // 前進速度（公尺／秒）
  backSpeed: 2.2,        // 後退速度
  turnDeg: 120,          // 左右轉速度（度／秒）
  camBack: 6.5,          // 鏡頭在 Ping 後方幾公尺
  camHeight: 3.5,        // 鏡頭高度
  camLookAhead: 3.5,     // 鏡頭看向 Ping 前方幾公尺
  talkRange: 5,          // 走到離居民幾公尺內，出現「和 X 說話」
  blipR: .45,            // Blip 碰撞半徑（走動時擋住你）
  nameTagY: 2.55,        // Ping 名字牌高度
  blipBubbleY: 4.1,      // Blip 說話泡泡高度
  bubbleChars: 10,       // Blip 泡泡每行幾個字
  bubbleLines: 4         // Blip 泡泡最多幾行
};
try { const x = new XMLHttpRequest(); x.open('GET', './ui_config.json?' + (Date.now() / 6e4 | 0), false); x.send(); if (x.status === 200) { const J = JSON.parse(x.responseText).town || {}; Object.keys(J).forEach(k => { if (k[0] !== '_' && k in CFG) CFG[k] = J[k]; }); } } catch (e) {}   // ui_config.json 覆蓋 CFG
try { document.fonts.load('700 34px "jf-openhuninn"'); } catch (e) {}
const QP = new URLSearchParams(location.search), DEBUG = QP.get('debug') === '1';
let PID = QP.get('pid') || '';
const AREA = 270, HALF = AREA / 2;                       // 手機地圖 0–320 × 0–290 對應到 ±135 公尺
const mapToWorld = (px, py) => [(px / 320 - .5) * AREA, (.5 - py / 290) * AREA];   // → Unity 座標 (x, z)
const worldToMap = (x, z) => [Math.max(0, Math.min(320, (x / AREA + .5) * 320)), Math.max(0, Math.min(290, (1 - (z / AREA + .5)) * 290))];
const U = (x, y, z) => new THREE.Vector3(x, y, -z);      // Unity → Three（z 取負，畫面左右和 Unity 一樣）

/* ═════════ [T02] Unity 數值（全部讀自專案：00_Proto 場景、各 .mat、PostFX_Atmosphere） ═════════ */
/* Unity 的 Color 存的是 sRGB（挑色盤的值），專案是 Linear 色彩空間 → 用 sRGB 轉進 Three 的線性工作空間 */
const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const SUN_COL = C(1, .96862745, .91764706).multiplyScalar(1.3);                    // Directional Light：顏色 × 強度 1.3
const SUN_DIR = new THREE.Vector3(-0.643, 0.669, 0.371).normalize();               // 旋轉 (42°, 60°, 0) → 光來的方向（Unity z 取負後）
const HOR = C(.894, .945, .937), SKY_TOP = C(.361, .678, .922), SKY_MID = C(.725, .867, .933), SKY_GND = C(.659, .812, .722);   // Sky_Pink.mat
const TINT_SAT = 1.6;   /* Ping 染色飽和度：要和 Unity Player_Toon 的 _TintSat、選色頁預覽（play.main.js SOFT.sat）一致 */
const UN = {   // 環境光：Unity 用天空做 SH；這裡用天空三色近似（天頂／中段／地面）
  uSun: { value: SUN_COL }, uTime: { value: 0 }, uWxDim: { value: 0 }, uWind: { value: 0 }, uWxSat: { value: 0 }, uWxLift: { value: 0 }, uCl: { value: .66 }, uWxTint: { value: new THREE.Vector3(0, 0, 0) },
  uAmbU: { value: C(.50, .75, .93).multiplyScalar(.9) }, uAmbM: { value: C(.76, .88, .93).multiplyScalar(.9) }, uAmbD: { value: C(.66, .81, .72).multiplyScalar(.8) }
};

/* 後製（PostFX_Atmosphere）：Neutral 色調映射、曝光 +0.05、對比 +18、飽和 +14、暗部偏青／亮部偏暖、色溫 +8；暈影在 CSS */
const GLSL_COMMON = `
uniform vec3 uSun, uAmbU, uAmbM, uAmbD;
uniform float uTime, uWxDim, uWind, uCl, uWxSat, uWxLift;
uniform vec3 uWxTint;
float uLum(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
vec3 uAmb(vec3 n){ float y = n.y; return mix(uAmbD, mix(uAmbM, uAmbU, smoothstep(0.,1.,y)), smoothstep(-1.,0.,y)); }
vec3 uSoftLight(vec3 b, vec3 s){ vec3 r1 = 2.*b*s + b*b*(1.-2.*s); vec3 r2 = sqrt(b)*(2.*s-1.) + 2.*b*(1.-s); return vec3(s.r<.5?r1.r:r2.r, s.g<.5?r1.g:r2.g, s.b<.5?r1.b:r2.b); }
vec3 uNeutral(vec3 c){
  float x = min(c.r, min(c.g, c.b)); float off = x < .08 ? x - 6.25*x*x : .04; c -= off;
  float peak = max(c.r, max(c.g, c.b)); const float sc = .76;
  if (peak < sc) return c;
  float d = 1. - sc; float np = 1. - d*d/(peak + d - sc); c *= np/peak;
  float g = 1. - 1./(.15*(peak - np) + 1.); return mix(c, vec3(np), g);
}
vec3 uGrade(vec3 c){
  { float l0 = uLum(c); c = mix(vec3(l0), c, 1. + uWxSat); c *= 1. + uWxTint; c = mix(c, vec3(.8,.84,.85), uWxLift) * (1. - uWxDim*.5); }   // [W03] 天氣：飽和／色偏／霧白／變暗（預設 0＝不變）
  c = max(c, vec3(0.)) * exp2(.05) * vec3(1.03, 1., .965);
  c = .18 * pow(max(c, vec3(1e-4))/.18, vec3(1.18));
  float l = uLum(c); c = max(vec3(l) + (c - vec3(l))*1.14, vec3(0.));
  c = clamp(uNeutral(c), 0., 1.);
  vec3 g = pow(c, vec3(1./2.2)); float t = clamp(uLum(g), 0., 1.);
  g = uSoftLight(g, mix(vec3(.5), vec3(.3098,.5608,.6510), 1.-t));
  g = uSoftLight(g, mix(vec3(.5), vec3(1.,.9020,.7098), t));
  return pow(clamp(g, 0., 1.), vec3(2.2));
}
float uHash3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float uNoise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(uHash3(i), uHash3(i+vec3(1,0,0)), f.x), mix(uHash3(i+vec3(0,1,0)), uHash3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(uHash3(i+vec3(0,0,1)), uHash3(i+vec3(1,0,1)), f.x), mix(uHash3(i+vec3(0,1,1)), uHash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float uHash2(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float uNoise2(vec2 p){ vec2 i = floor(p), f = fract(p); float a = uHash2(i), b = uHash2(i+vec2(1,0)), c = uHash2(i+vec2(0,1)), d = uHash2(i+vec2(1,1)); vec2 u = f*f*(3.-2.*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
`;
const v3 = c => 'vec3(' + [c.r, c.g, c.b].map(x => x.toFixed(5)).join(',') + ')';
const f1 = x => (+x).toFixed(5);
const FOG_N = 140, FOG_F = 330;

/* ═════════ [T22] 光暈（Unity Bloom 的近似：強度 .45／門檻 .85／散射 .7）：把畫面縮小複製一份，用 CSS 取亮部＋模糊＋「濾色」疊回去；很省效能，要關或調整改 BLOOM ═════════ */
const BLOOM = { on: true, opacity: .32, every: 2, scale: 5 };   // opacity 光暈強度（0 無～1 很夢幻）／every 每幾張畫面更新一次／scale 縮小倍數（越大越省）
let glowCv = null, glowCx = null, glowN = 0;
function glowFrame() {
  if (!BLOOM.on) return; if (!glowCv) { glowCv = document.createElement('canvas'); glowCv.id = 'glow'; glowCv.style.opacity = BLOOM.opacity; document.body.appendChild(glowCv); glowCx = glowCv.getContext('2d'); }
  if (++glowN % BLOOM.every) return; const w = Math.max(16, Math.round(innerWidth / BLOOM.scale)), h = Math.max(16, Math.round(innerHeight / BLOOM.scale));
  if (glowCv.width !== w || glowCv.height !== h) { glowCv.width = w; glowCv.height = h; }
  try { glowCx.drawImage(renderer.domElement, 0, 0, w, h); } catch (e) { BLOOM.on = false; }
}
/* ═════════ [T03] 渲染 ═════════ */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.background = HOR;
const cam = new THREE.PerspectiveCamera(55, 1, .3, 700);   // Unity 攝影機 FOV 55
const sun = new THREE.DirectionalLight('#ffffff', 1); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); { const c = sun.shadow.camera; c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 10; c.far = 220; sun.shadow.bias = -.0005; sun.shadow.normalBias = .05; }
scene.add(sun); scene.add(sun.target);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

/* ═════════ [T22b] 飄浮光塵（Unity Tools > TuneIn > Add Dust Motes 的網頁版）：顏色 #FFF3C4、大小 .16–.40、最高透明 .85、壽命 8–14 秒、緩緩往上飄；範圍 80×6×80，繞著玩家重複排列 ═════════ */
const DUST = { n: 420, area: 80, hgt: 6, sMin: .16, sMax: .4, alpha: .85, color: '#FFF3C4' };
let dustPts = null;
function dustInit() {
  const n = DUST.n, pos = new Float32Array(n * 3), sd = new Float32Array(n * 4); let k = 7; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { sd[i * 4] = rnd(); sd[i * 4 + 1] = rnd(); sd[i * 4 + 2] = rnd(); sd[i * 4 + 3] = rnd(); }
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 8; i++) { const d = i / 8; gr.addColorStop(d, 'rgba(255,255,255,' + Math.pow(1 - d, 2.2).toFixed(3) + ')'); } cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uMap: { value: new THREE.CanvasTexture(cv) }, uSc: { value: 800 }, uCol: { value: new THREE.Color(DUST.color) } },
    vertexShader: `attribute vec4 aSeed; uniform float uT, uSc; uniform vec3 uC; varying float vA;
      void main(){ float life = 8. + aSeed.w*6.; float ph = fract(uT/life + aSeed.w*7.3); float a = sin(3.14159*ph); vA = a*a*${DUST.alpha.toFixed(2)};
        vec3 o = vec3((aSeed.x-.5)*${DUST.area.toFixed(1)}, aSeed.y*${DUST.hgt.toFixed(1)}, (aSeed.z-.5)*${DUST.area.toFixed(1)});
        o.y = mod(o.y + uT*(.05 + aSeed.w*.13), ${DUST.hgt.toFixed(1)});
        o.x += sin(uT*.25 + aSeed.z*20.)*.7; o.z += cos(uT*.22 + aSeed.x*20.)*.7;
        vec2 c = uC.xz; o.xz = c + mod(o.xz - c + ${(DUST.area / 2).toFixed(1)}, ${DUST.area.toFixed(1)}) - ${(DUST.area / 2).toFixed(1)};
        vec4 mv = viewMatrix*vec4(o,1.); float sz = ${DUST.sMin.toFixed(2)} + aSeed.y*${(DUST.sMax - DUST.sMin).toFixed(2)}; gl_PointSize = clamp(sz*uSc/max(-mv.z,.5), 1., 90.); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying float vA; void main(){ float t = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uCol*1.2, t*vA); }` });
  dustPts = new THREE.Points(g, m); dustPts.frustumCulled = false; dustPts.renderOrder = 5; scene.add(dustPts);
}
function dustFrame(now) {
  if (!dustPts) dustInit(); const u = dustPts.material.uniforms; u.uT.value = now / 1000; u.uC.value.copy(cam.position);
  u.uSc.value = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
}
/* ═════════ [T04] 把 Unity 的 Shader（Blip/SoftToon、Fuwa/ToonGround）搬進 Three ═════════ */
const SOFT = o => Object.assign({ kind: 'soft', sh: C(.66, .73, .85), thr: .5, soft: .2, str: .85, amb: .25, rim: C(1, 1, 1), rimP: 3, rimS: .2, gd: 0, gh: 1.5, holes: 0, leaf: 2.5, tint: null }, o);
const P_PING = SOFT({ sh: C(.60, .67, .80), thr: .535, rim: C(.59, .59, .59), tone: true });   // Player_Toon：Tone Amount 1、Tint Sat 1.05
const P_PINGHAT = SOFT({ sh: C(.60, .67, .80), thr: .535, rim: C(.59, .59, .59) });   // Ping_Pink.mat：帽子固定色
const P_BLIP = SOFT({ sh: C(.659, .725, .847), thr: .55, soft: .2, str: .85, amb: .25, rim: C(1, .92, .95), rimP: 3, rimS: .15 });   // Blip_Toon.mat
const P_ROWAN = SOFT({ sh: C(.85, .88, .94), thr: .535, rim: C(.59, .59, .59) });
const P_MOUSE = SOFT({ sh: C(.66, .73, .85), thr: .535, rim: C(.59, .59, .59) });
const P_HOUSE = SOFT({ thr: .5, amb: .35, rimS: .4, gd: .22, gh: 2.5 });
const P_HARD = SOFT({ sh: C(.70, .73, .77), thr: .744 });
const P_BLOSSOM = SOFT({ thr: .551, soft: .075, str: .01, amb: .8, rim: C(1, .92, .95), rimS: .15, gd: .289, gh: .1 });
const P_BUSH = SOFT({ thr: .551, soft: .075, str: .01, amb: .8, rim: C(1, .92, .95), rimS: .15, gd: .289, gh: .1, holes: .35, leaf: 3.5 });
const P_BUSH2 = SOFT({ thr: .551, soft: .075, str: .01, amb: .8, rim: C(1, .92, .95), rimS: .15, gd: .289, gh: .1 });   // 花叢用（葉片是實體面片，不用葉隙鏤空）
const P_TRUNK = SOFT({ sh: C(.49, .60, .79), thr: .55, str: .091, amb: .695, rim: C(1, .92, .95), rimS: .15 });
const P_LEAF = SOFT({ sh: C(.37, .62, .55), thr: .5, str: .091, amb: .695, rim: C(1, .96, .83), rimS: .3, holes: .42, leaf: 2.5 });
const P_CONIFER = SOFT({ sh: C(.37, .62, .55), thr: .5, soft: .231, str: .64, amb: .5, rim: C(1, .97, .88), rimS: .2, holes: .42, leaf: 2.29, tint: C(.65, .76, 1) });
const P_GRASS = { kind: 'grass', base: C(.247, .580, .408), tip: C(.651, .851, .557), sh: C(.373, .659, .635), tint: C(1, .976, .925), thr: .45, soft: .05, gp: 1.2 };   // Gress.mat（Fuwa/ToonGeometryGrass）
const P_GROUND = { kind: 'ground', ga: C(.490, .722, .541), gb: C(.412, .651, .494), dirt: C(.851, .804, .682), sh: C(.37, .66, .64), tint: C(1, .98, .93), thr: .4, soft: .08, str: .9, blur: .15 };

function unityDefs(P) {
  let s = '';
  if (P.kind === 'soft') s += `#define SHC ${v3(P.sh)}\n#define THR ${f1(P.thr)}\n#define SOFT ${f1(P.soft)}\n#define STR ${f1(P.str)}\n#define AMB ${f1(P.amb)}\n#define RIMC ${v3(P.rim)}\n#define RIMP ${f1(P.rimP)}\n#define RIMS ${f1(P.rimS)}\n#define GD ${f1(P.gd)}\n#define GH ${f1(P.gh)}\n`;
  else if (P.kind === 'grass') s += `#define GBASE ${v3(P.base)}\n#define GTIP ${v3(P.tip)}\n#define SHC ${v3(P.sh)}\n#define LTINT ${v3(P.tint)}\n#define THR ${f1(P.thr)}\n#define SOFT ${f1(P.soft)}\n#define GPOW ${f1(P.gp)}\n#define GRASS\n`;
  else s += `#define GA ${v3(P.ga)}\n#define GB ${v3(P.gb)}\n#define DIRT ${v3(P.dirt)}\n#define SHC ${v3(P.sh)}\n#define LTINT ${v3(P.tint)}\n#define THR ${f1(P.thr)}\n#define SOFT ${f1(P.soft)}\n#define STR ${f1(P.str)}\n#define BLUR ${f1(P.blur)}\n#define GRR 330.\n`;
  if (P.tone) s += '#define TONE\n';
  return s + `#define FOGC ${v3(HOR)}\n#define FOGN ${f1(FOG_N)}\n#define FOGF ${f1(FOG_F)}\n`;
}
const SHADOW_SAMPLE_1 = `
float shAtt = 1.0;
#if NUM_DIR_LIGHTS > 0 && NUM_DIR_LIGHT_SHADOWS > 0 && defined( USE_SHADOWMAP )
  DirectionalLightShadow dls = directionalLightShadows[ 0 ];
  shAtt = getShadow( directionalShadowMap[ 0 ], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[ 0 ] );
#endif
vec3 Ld = directionalLights[ 0 ].direction;`;
const SHADOW_SAMPLE_SOFT = `
float shAtt = 1.0;
#if NUM_DIR_LIGHTS > 0 && NUM_DIR_LIGHT_SHADOWS > 0 && defined( USE_SHADOWMAP )
  DirectionalLightShadow dls = directionalLightShadows[ 0 ];
  float ign = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715))));
  float acc = 0.;
  for (int k = 0; k < 4; k++) { float a = float(k)*2.39996323 + ign*6.2831853; float r = sqrt((float(k)+.5)/4.)*BLUR/92.;
    vec4 sc = vDirectionalShadowCoord[ 0 ]; sc.xy += vec2(cos(a), sin(a))*r*sc.w;
    acc += getShadow( directionalShadowMap[ 0 ], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, sc ); }
  shAtt = smoothstep(.2, .8, acc/4.);
#endif
vec3 Ld = directionalLights[ 0 ].direction;`;
const BODY_SOFT = `vec3 outgoingLight;
{ vec3 N = normal; vec3 Nw = inverseTransformDirection(N, viewMatrix); vec3 alb = diffuseColor.rgb;
#ifdef TONE
  { vec3 texCol = texture2D(map, vMapUv).rgb; float tm = texture2D(uTintMask, vMapUv).r;
    float tone = clamp(.82 + (texture2D(uToneMap, vMapUv).r - .68)*2.2, 0., 1.);
    vec3 cc = clamp(pow(diffuse, vec3(1./2.2)), 0., 1.); vec3 lightC = mix(vec3(1.), cc, .4), deepC = cc*cc*.85;
    vec3 toned = mix(deepC, lightC, tone); float tl = dot(toned, vec3(.299,.587,.114)); toned = clamp(mix(vec3(tl), toned, ${TINT_SAT.toFixed(2)}), 0., 1.);
    alb = mix(texCol, pow(toned, vec3(2.2)), tm); }
#endif
  float ndl = dot(N, Ld)*.5 + .5;
  float lit = smoothstep(THR - SOFT, THR + SOFT, ndl); lit *= mix(1., shAtt, STR);
  vec3 diff = mix(alb*SHC, alb, lit) * uSun;
  vec3 amb = uAmb(Nw) * alb * AMB;
  vec3 V = normalize(vViewPosition);
  float rim = pow(1. - clamp(dot(N, V), 0., 1.), RIMP); rim *= clamp(dot(N, Ld)*.5 + .5, 0., 1.);
  float gAO = 1. - GD*(1. - clamp(vWP.y/max(GH,.01), 0., 1.));
  outgoingLight = (diff + amb)*gAO + RIMC*rim*RIMS;
  outgoingLight = mix(outgoingLight, FOGC, smoothstep(FOGN, FOGF, length(vViewPosition)));
  outgoingLight = uGrade(outgoingLight); }`;
const BODY_GRASS = `vec3 outgoingLight;
{ float hh = clamp(diffuseColor.r, 0., 1.); vec3 alb = mix(GBASE, GTIP, pow(hh, GPOW));
  vec3 Lw = inverseTransformDirection(Ld, viewMatrix); float ndl = Lw.y*.5 + .5;
  float toon = smoothstep(THR - SOFT, THR + SOFT, ndl); toon *= shAtt;
  outgoingLight = mix(alb*SHC, alb*uSun*LTINT, toon);
  outgoingLight = mix(outgoingLight, FOGC, smoothstep(FOGN, FOGF, length(vViewPosition)));
  outgoingLight = uGrade(outgoingLight); }`;
const BODY_GROUND = `vec3 outgoingLight;
{ vec3 N = normal; vec2 xz = vec2(vWP.x, -vWP.z);
  float n = uNoise2(xz*.25)*.65 + uNoise2(xz*.25*2.3 + 17.)*.35;
  float pm = smoothstep(.5 - .06, .5 + .06, n);
  vec3 grass = mix(GA, GB, pm);
  float m = texture2D(uPath, vec2((xz.x/GRR + 1.)*.5, (xz.y/GRR + 1.)*.5)).r;
  float path = smoothstep(.5 - .05, .5 + .05, m);
  vec3 alb = mix(grass, DIRT, path);
  float ndl = dot(N, Ld)*.5 + .5;
  float toon = smoothstep(THR - SOFT, THR + SOFT, ndl); toon *= mix(1., shAtt, STR);
  outgoingLight = mix(alb*SHC, alb*uSun*LTINT, toon);
  outgoingLight = mix(outgoingLight, FOGC, smoothstep(FOGN, FOGF, length(vViewPosition)));
  outgoingLight = uGrade(outgoingLight); }`;
let PATH_TEX = null, PATHD = null, PATHW = 1024;
const onPath = (x, z) => { if (!PATHD) return false; const GR = 330, px = ((x / GR + 1) / 2 * PATHW) | 0, py = ((1 - z / GR) / 2 * PATHW) | 0; if (px < 0 || py < 0 || px >= PATHW || py >= PATHW) return false; return PATHD[(py * PATHW + px) * 4] > 90; };
const onPathT = (x, z, t) => { if (!PATHD) return false; const GR = 330, px = ((x / GR + 1) / 2 * PATHW) | 0, py = ((1 - z / GR) / 2 * PATHW) | 0; if (px < 0 || py < 0 || px >= PATHW || py >= PATHW) return false; return PATHD[(py * PATHW + px) * 4] > t; };   /* 路面遮罩門檻 t（越小，路邊緣也算路） */
function unityMat(P, opt) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ color: 0xffffff }, opt || {})); m.fog = false;
  const defs = unityDefs(P);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, UN); if (P.tone) { sh.uniforms.uToneMap = { value: T.ping_tone }; sh.uniforms.uTintMask = { value: T.ping_mask }; } if (P.kind === 'ground') sh.uniforms.uPath = { value: PATH_TEX };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;' + (P.kind === 'grass' ? '\nuniform float uTime, uWind;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + (P.kind === 'grass' ? '\n{ vec3 o = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz; float dd = distance(o, cameraPosition); transformed *= 1. - smoothstep(30., 40., dd); float hh = color.r; float wa = 1. + uWind*3.; transformed.x += sin(uTime*(1.2+uWind*1.4) + o.x*.6 + o.z*.4)*hh*hh*.07*wa; transformed.z += cos(uTime*(1.0+uWind*1.2) + o.x*.4 + o.z*.6)*hh*hh*.05*wa; }' : ''))
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wp = vec4(transformed, 1.);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp;\n#endif\n vWP = (modelMatrix * wp).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + defs + GLSL_COMMON + 'varying vec3 vWP;\n' + (P.kind === 'ground' ? 'uniform sampler2D uPath;\n' : '') + (P.tone ? 'uniform sampler2D uToneMap, uTintMask;\n' : ''))
      .replace('#include <lights_fragment_begin>', P.kind === 'ground' ? SHADOW_SAMPLE_SOFT : SHADOW_SAMPLE_1)
      .replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', '')
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', P.kind === 'ground' ? BODY_GROUND : P.kind === 'grass' ? BODY_GRASS : BODY_SOFT);
  };
  m.customProgramCacheKey = () => 'u' + defs;
  m.receiveShadow = true;
  if (P.holes > 0) m.userData.depth = leafDepth(P.leaf, P.holes);
  return m;
}
/* 葉隙影子：影子被葉子鏤空，地上出現斑駁光影（Unity 的 _LeafHoles／_LeafScale，用「物件座標」的 3D 雜訊，光斑跟著樹走） */
const depthCache = {};
function leafDepth(scale, holes) {
  const k = scale + '/' + holes; if (depthCache[k]) return depthCache[k];
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRel;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 pr = vec4(transformed, 1.); vec3 org = vec3(0.);\n#ifdef USE_INSTANCING\n pr = instanceMatrix * pr; org = instanceMatrix[3].xyz;\n#endif\n vRel = (modelMatrix * vec4(pr.xyz, 1.)).xyz - (modelMatrix * vec4(org, 1.)).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRel;\n' + GLSL_COMMON.split('float uHash3')[1].replace(/^/, 'float uHash3').split('float uHash2')[0])
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ vec3 p = vRel*' + f1(scale) + '; float n = uNoise3(p)*.6 + uNoise3(p*2.7 + 5.3)*.4; if (n < ' + f1(holes) + ') discard; }');
  };
  d.customProgramCacheKey = () => 'leaf' + k; return depthCache[k] = d;
}
const mat = (c, o) => unityMat(P_BLOSSOM, Object.assign({ color: new THREE.Color(c) }, o || {}));   // 沒有專屬材質的小東西

/* 天空：Fuwa/GradientSky（三色漸層＋幾朵柔邊的雲） */
{ const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: Object.assign({ top: { value: SKY_TOP }, mid: { value: SKY_MID }, hor: { value: HOR }, gnd: { value: SKY_GND }, t: { value: 0 } }, UN),
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: GLSL_COMMON + `
varying vec3 p; uniform vec3 top, mid, hor, gnd; uniform float t;
float fbm(vec2 q){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*uNoise2(q); q = q*2.03 + 7.1; a *= .5; } return s; }
void main(){
  vec3 d = normalize(p); float h = d.y, hu = max(h, 0.); const float MH = .286;
  float t1 = clamp(hu/MH, 0., 1.), t2 = clamp((hu - MH)/(1. - MH), 0., 1.);
  vec3 col = mix(hor, mid, smoothstep(0.,1.,t1)); col = mix(col, top, smoothstep(0.,1.,t2)); col = mix(col, gnd, 1. - smoothstep(-.15, 0., h));
  if (h > .02) { vec2 q = d.xz/(h + .35)*1.7 + vec2(t*.01, 0.); float c = fbm(q*1.3); float a = smoothstep(uCl - .1, uCl, c) * smoothstep(.02, .22, h) * (1. - smoothstep(.55, .9, h));
    float sh = clamp((fbm(q*1.3 + vec2(.12,.2)) - c)*5. + .5, 0., 1.);
    vec3 cc = mix(vec3(1.,.95,.95), vec3(.58,.82,1.)*.9, sh*.75*.9); cc *= 1. - uWxDim*.45; col = mix(col, cc, a*.9); }
  gl_FragColor = vec4(uGrade(col), 1.);
  #include <colorspace_fragment>
}` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), m); sky.renderOrder = -10; scene.add(sky); window.__sky = sky; window.__skyMat = m; }

/* 地面：Fuwa/ToonGround（兩色草地色塊在 Shader 裡算）＋小路遮罩（優先用 Unity 輸出的 path_mask.png，沒有就用程式畫的曲線小路） */
async function loadMask() {
  try { const j = await (await fetch('./path_mask.json')).json(); const img = new Image(); img.src = './path_mask.png'; await img.decode(); const c = document.createElement('canvas'); c.width = c.height = j.res; const g = c.getContext('2d'); g.drawImage(img, 0, 0); j.data = g.getImageData(0, 0, j.res, j.res).data; return j; } catch (e) { return null; }
}
function buildGround(mask) {
  const GR = 330, W = 1024, c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d');
  const X = x => (x / GR + 1) / 2 * W, Z = z => (1 - z / GR) / 2 * W;   // Unity (x,z) → 畫布像素
  g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
  if (mask) {
    const x0 = Math.max(0, Math.floor(X(mask.minX))), x1 = Math.min(W - 1, Math.ceil(X(mask.minX + mask.sx))), y0 = Math.max(0, Math.floor(Z(mask.minZ + mask.sz))), y1 = Math.min(W - 1, Math.ceil(Z(mask.minZ)));
    const im = g.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1), d = im.data, w = im.width, res = mask.res, md = mask.data;
    for (let py = 0; py < im.height; py++) for (let px = 0; px < w; px++) {
      const wx = ((px + x0) / W * 2 - 1) * GR, wz = (1 - 2 * (py + y0) / W) * GR, u = (wx - mask.minX) / mask.sx, v = (wz - mask.minZ) / mask.sz;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const m = md[(((1 - v) * res | 0) * res + (u * res | 0)) * 4], k = (py * w + px) * 4; d[k] = d[k + 1] = d[k + 2] = m;
    }
    g.putImageData(im, x0, y0);
  } else {   // 沒有 Unity 的路網：用幾條彎彎的小路連起 出生點、花店、奶奶、起司屋
    g.filter = 'blur(5px)';
    const curve = (pts, wd) => { g.strokeStyle = '#fff'; g.lineWidth = wd / GR * W / 2; g.lineCap = g.lineJoin = 'round'; g.beginPath(); const P = pts.map(q => [X(q[0]), Z(q[1])]);
      g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length - 1; i++) g.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2); g.lineTo(P[P.length - 1][0], P[P.length - 1][1]); g.stroke(); };
    curve([[6, -22], [10, -12], [-2, -10], [-4, -4]], 5); curve([[6, -22], [18, -8], [30, 10], [24, 34], [46, 52], [58, 70], [50, 88], [47, 98]], 5.5);
    curve([[24, 34], [0, 40], [-30, 30], [-40, 8]], 4); curve([[46, 52], [80, 50], [100, 20]], 4); curve([[30, 10], [60, 0], [90, -30]], 4); curve([[50, 88], [20, 100], [-10, 120]], 4);
    g.filter = 'none';
  }
  PATHD = g.getImageData(0, 0, W, W).data; PATHW = W;
  PATH_TEX = new THREE.CanvasTexture(c); PATH_TEX.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GR, 96), unityMat(P_GROUND)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); groundMesh = ground;
}

/* ═════════ [T05] Unity 模型（FBX → GLB）：倍率 = Unity 匯入的 Scale Factor ═════════ */
const TREE_R = 1.7;   /* 大樹幹碰撞半徑（模型單位，調大＝擋更遠） */
const MODELS = {
  ping: { s: .8 }, blip: { s: .11 }, rowan: { s: .13 }, mouse: { s: .5 }, shop: { s: 1.5 }, cheese: { s: .5 },
  tree: { s: 2.5 }, conifer: { s: 1 }, bench: { s: 1 }, stone: { s: .5 }, flower: { s: .08 }, bush: { s: 1 }, bird1: { s: .3 }, bird2: { s: .4 },
  mountain0: { s: 1 }, mountain1: { s: 1 }, mountain2: { s: 1 }   // 山：大小由 town_layout.json 的外框高度決定（見 placeMountains）
};
const TEXS = { ping: ['ping_base'], blip: ['blip'], mouse: ['mouse'], rowan: ['rowan'], flower: ['flower'], conifer: ['conifer'], tree: ['tree', 'treeleaf'], bush: ["bush"], bird1: ['bird1'], bird2: ['bird2'], shop: ['shop'], cheese: ['cheese'], mountain0: ['mountain0'], mountain1: ['mountain1'], mountain2: ['mountain2'], raw: ['ping_tone', 'ping_mask'] };   // raw＝資料圖（深淺圖、染色遮罩），不做色彩轉換
const FALLBACK = { conifer: '#4FAE6C', flower: '#FFB5C1', mouse: '#F2DCC4', ping: '#FFB5C1' };
const P_MOUNT = SOFT({ sh: C(.62, .68, .82), thr: .5, soft: .25, str: .7, amb: .4, rim: C(1, 1, 1), rimS: .12 });   // 山（Moutain_Toon.mat 近似）
const PBY = { mountain0: P_MOUNT, mountain1: P_MOUNT, mountain2: P_MOUNT, blip: P_BLIP, bird1: P_MOUSE, bird2: P_MOUSE, ping: P_PING, rowan: P_ROWAN, mouse: P_MOUSE, shop: P_HOUSE, cheese: P_HOUSE, bench: P_HARD, stone: P_HARD, flower: P_BLOSSOM, conifer: P_CONIFER, bush: P_BUSH2 };
const M = {}, T = {};
const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
const tl = new THREE.TextureLoader();
/* [P73] 載入失敗自動重試：以前一個模型／貼圖下載失敗就默默略過，整個小鎮變簡約版；現在先重試 3 次（間隔 0.6／1.2 秒），還是缺才補救 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn, n) { let e; for (let i = 0; i < (n || 3); i++) { try { return await fn(); } catch (x) { e = x; await sleep(600 * (i + 1)); } } throw e; }
function loadTex(k) { return retry(() => new Promise((res, rej) => tl.load('./models/tex_' + k + '.webp?v=' + (QP.get('v') || ''), t => { t.flipY = false; t.colorSpace = /^ping_(tone|mask)$/.test(k) ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, e => rej(e || new Error('tex ' + k))))).catch(() => null); }
/* 【T-啟動加速】遠處、很大的起司屋（約 2.6 MB）不擋開機：小鎮先準備好，起司屋在背後載完再放進去 */
const LATE = ['cheese'];
async function loadLate() {
  try {
    for (const k of LATE) { M[k] = await retry(() => gl.loadAsync('./models/' + k + '.glb')); for (const t of TEXS[k] || []) T[t] = await loadTex(t); }
    if (M.cheese) { { const CH2 = LMK.cheese || [47.4, .47, 93.5]; placeStatic('cheese', CH2[0], CH2[1], CH2[2], 0); } try { scene.traverse(o => { const ms = o.material ? [].concat(o.material) : []; ms.forEach(m => { if (m.map) try { renderer.initTexture(m.map); } catch (e) {} }); }); } catch (e) {} updateGrass(me.x, me.z, true); }
  } catch (e) { console.warn('late', e); }
}
async function loadModels() {
  const names = Object.keys(MODELS).filter(k => !LATE.includes(k)), texs = [].concat(...Object.entries(TEXS).filter(([k]) => !LATE.includes(k)).map(e => e[1])); let n = 0; const tot = names.length + texs.length;
  const tick = () => { n++; const p = Math.round(n / tot * 100); document.getElementById('bi').style.width = p + '%'; document.getElementById('lt').textContent = 'Blip 正在布置小鎮… ' + p + '%'; parent.postMessage({ tunein: 'prog', p: Math.min(95, p) }, '*'); };
  await Promise.all(names.map(k => retry(() => gl.loadAsync('./models/' + k + '.glb')).then(g => { M[k] = g; }).catch(e => { console.warn('model', k, e); }).then(tick)
    ).concat(texs.map(k => loadTex(k).then(t => { T[k] = t; }).then(tick))));
  const miss = names.filter(k => !M[k]).concat(texs.filter(k => !T[k]));
  if (miss.length) {   /* 重試後還是缺：整頁自動重新載入一次（已存好的檔案會直接用），再不行才用備用造型 */
    let tried = '0'; try { tried = sessionStorage.getItem('tunein.reload') || '0'; } catch (e) {}
    if (tried === '0') { try { sessionStorage.setItem('tunein.reload', '1'); } catch (e) {} document.getElementById('lt').textContent = '網路不穩，重新載入中…'; setTimeout(() => location.reload(), 600); await new Promise(() => {}); }
    else { try { sessionStorage.removeItem('tunein.reload'); } catch (e) {} console.warn('missing', miss); }
  } else { try { sessionStorage.removeItem('tunein.reload'); } catch (e) {} }
}
/* 材質換成 Unity 的 SoftToon（每種物件用各自 .mat 的數值）；缺貼圖的（FBX 沒帶）用 Unity 的貼圖補 */
function lambertize(root, texKey, tex, pcol) {
  root.traverse(o => {
    if (!o.isMesh) return; const old = o.material, hasVC = !!o.geometry.attributes.color;
    let map = old.map || null;
    if (map && map.image && map.image.width <= 2) map = null;      // FBX2glTF 的 1×1 佔位圖
    if (!map && tex && /_Mat$/.test(old.name || '')) map = tex;
    if (texKey === 'tree') map = /Leaf/i.test(old.name || '') ? T.treeleaf : T.tree;     // 樹：樹幹／球狀葉簇用 Tree_Color，葉片用 Leaf_Color
    if ((texKey === 'ping' || texKey === 'blip' || texKey === 'rowan' || texKey === 'bird1' || texKey === 'bird2' || texKey === 'shop' || texKey === 'cheese') && tex) map = tex;                       // Ping 全身都用同一張貼圖（Unity 的 Player_Toon）
    const hat = texKey === 'ping' && /Ping_Pink/.test(old.name || '');   /* Unity：貝雷帽用 Ping_Pink.mat（固定粉紅 #FF6E82，不吃玩家色、不用貼圖） */
    if (hat) map = null;
    const P = hat ? P_PINGHAT : texKey === 'tree' ? (/Leaf/i.test(old.name || '') ? P_LEAF : P_TRUNK) : (PBY[texKey] || P_BLOSSOM);
    const base = hat ? C(1, .431, .508) : texKey === 'ping' ? (pcol || PCOL_DEF) : P.tint ? P.tint : (map ? new THREE.Color(1, 1, 1) : (old.color && old.name !== 'Ping_Mat' ? old.color : new THREE.Color(FALLBACK[texKey] || '#DDDDDD')));
    const m = unityMat(P, { map, color: base, vertexColors: hasVC && !map, side: old.side, alphaTest: old.alphaTest || 0, transparent: old.transparent });
    if (hat) m.userData.fixed = true;
    o.material = m; o.receiveShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false;
  });
}
const PCOL_DEF = C(.949, .380, .612);
const PALU = { flower: C(.949, .380, .612), house: C(.906, .745, .973), market: C(.929, .914, .525), river: C(.576, .671, .851), lilac: C(.788, .608, .918), sun: C(.973, .706, .816) };   // PingSpawner 的玩家色
const pingColor = (hex, col) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? new THREE.Color(hex) : PALU[col] || PCOL_DEF).clone();
function tintPing(g, c) { g.traverse(o => { if (o.isMesh && o.material && o.material.color && !o.material.userData.fixed) o.material.color.copy(c); }); }

/* ═════════ [T06] 小鎮配置（從 Unity 場景 00_Proto 讀出來） ═════════ */
let LMK = {};   // 地標位置（Unity 匯出的 landmarks；沒有就用預設值）
async function loadLayout() { const r = await fetch('./town_layout.json?' + (Date.now() / 6e4 | 0)); const j = await r.json(); LMK = j.landmarks || {}; return j; }

/* ═════════ [T07] 樹、花、長椅、石頭：按區塊分組的 instanced（沒看到的區塊整組不畫） ═════════ */
const colliders = [];   // 圓形 {x, z, r}（Unity 座標）
const boxes = [];       // 方形 {x0, x1, z0, z1}（Unity 座標）
const chunks = [];      // 區塊：{mesh, cx, cz}
const CH = 50;
function instParts(parts, list, colors, cast) {   // parts: [{geometry, material, m}]；依區塊分組，沒看到的區塊整組不畫
  const groups = new Map();
  list.forEach((a, i) => { a.i = i; const k = Math.floor(a.p.x / CH) + ',' + Math.floor(a.p.z / CH); (groups.get(k) || groups.set(k, []).get(k)).push(a); });
  const d = new THREE.Object3D(), mm = new THREE.Matrix4(), col = new THREE.Color();
  groups.forEach(arr => {
    let cx = 0, cz = 0; arr.forEach(a => { cx += a.p.x; cz += a.p.z; }); cx /= arr.length; cz /= arr.length;
    parts.forEach(pt => {
      const im = new THREE.InstancedMesh(pt.geometry, pt.material, arr.length);
      arr.forEach((a, i) => { d.position.copy(a.p); d.rotation.set(0, a.ry || 0, 0); d.scale.setScalar(a.s); d.updateMatrix(); mm.multiplyMatrices(d.matrix, pt.m); im.setMatrixAt(i, mm); if (colors) im.setColorAt(i, col.set(colors[a.i % colors.length])); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = !!cast; im.receiveShadow = true;
      if (pt.material.userData.depth) im.customDepthMaterial = pt.material.userData.depth;
      scene.add(im); chunks.push({ mesh: im, cx, cz });
    });
  });
}
/* 花叢幾何：葉片（5 個斷面、中線折起、尖端下垂）由內往外分四圈疊成圓丘，再貼上白色五瓣花 */
function buildBushGeo() {
  let sd = 20261117; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const parts = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const leaf = (L, W, col0, col1) => {
    const pos = [], col = [], idx = [], T = [0, .14, .34, .55, .75, .9, 1], PW = T.map(t => Math.pow(Math.sin(Math.PI * (.03 + t * .94)), .62));
    T.forEach((t, i) => { const w = W * .5 * PW[i], droop = -.16 * L * t * t, fold = .1 * W * PW[i], c = col0.clone().lerp(col1, t);
      pos.push(-w, droop, t * L, 0, droop + fold, t * L, w, droop, t * L); const dk = c.clone().multiplyScalar(.86);
      col.push(c.r, c.g, c.b, dk.r, dk.g, dk.b, c.r, c.g, c.b); });
    for (let i = 0; i < T.length - 1; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const rings = [[26, 28, 48, 1.35, 1.7], [38, 48, 66, 1.2, 1.5], [36, 64, 80, 1.0, 1.3], [12, 84, 90, .75, .95]];
  rings.forEach(([n, p0, p1, l0, l1], ri) => { for (let i = 0; i < n; i++) {
    const L = l0 + rnd() * (l1 - l0), W = L * (.7 + rnd() * .14), th = (i / n) * Math.PI * 2 + rnd() * .5, ph = (p0 + rnd() * (p1 - p0)) * Math.PI / 180;
    const sh = .9 + rnd() * .18, c0 = C(.19 * sh, .38 * sh, .27 * sh), c1 = C(.34 * sh, .58 * sh, .34 * sh);
    const g = leaf(L, W, c0, c1); e.set(-ph, th, (rnd() - .5) * .5, 'YXZ'); q.setFromEuler(e); v.set((rnd() - .5) * .18, .18 + ri * .04, (rnd() - .5) * .18);
    m4.compose(v, q, new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m4); parts.push(g); } });
  const white = C(1, .99, .96), gold = C(1, .72, .22);
  for (let f = 0; f < 18; f++) {
    const th = rnd() * Math.PI * 2, ph = (14 + rnd() * 62) * Math.PI / 180, R = .9 + (1 - ph / 1.4) * .45;
    const dir = new THREE.Vector3(Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)), at = dir.clone().multiplyScalar(R + .14).add(new THREE.Vector3(0, .25, 0));
    const pos = [], col = [], idx = []; let n = 0;
    const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return n++; };
    const hub = push(0, .03, 0, gold);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), pl = .3, pw = .17;
      const c0 = push(ca * pl * .5, .012, sa * pl * .5, white), ring = [];
      for (let j = 0; j < 8; j++) { const u = Math.cos(j / 8 * Math.PI * 2) * pl * .5, w = Math.sin(j / 8 * Math.PI * 2) * pw * .5; ring.push(push(ca * (pl * .5 + u) - sa * w, .004, sa * (pl * .5 + u) + ca * w, white)); }
      for (let j = 0; j < 8; j++) idx.push(c0, ring[j], ring[(j + 1) % 8]); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, b = (k + 1) / 6 * Math.PI * 2, c0 = push(Math.cos(a) * .09, .03, Math.sin(a) * .09, gold), c1 = push(Math.cos(b) * .09, .03, Math.sin(b) * .09, gold); idx.push(hub, c0, c1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().lerp(new THREE.Vector3(0, 1, 0), .35).normalize()); const sp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28); q.multiply(sp);
    m4.compose(at, q, new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m4); parts.push(g); }
  return mergeGeometries(parts);
}

function instSet(name, list, texKey, ground, cast) {
  const g = M[name].scene; g.updateMatrixWorld(true); lambertize(g, texKey, T[texKey]);
  const pre = new THREE.Matrix4();
  if (ground) { const b = new THREE.Box3().setFromObject(g); pre.makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); }   // 原點不在腳底的模型：置中、貼地
  const parts = []; g.traverse(o => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, m: new THREE.Matrix4().multiplyMatrices(pre, o.matrixWorld) }); });
  instParts(parts, list, null, cast);
}
const modelBox = name => { const b = new THREE.Box3().setFromObject(M[name].scene), s = b.getSize(new THREE.Vector3()); return { b, s }; };
function placeStatic(name, ux, uy, uz, yaw3) {
  const o = M[name].scene; lambertize(o, name, T[name]); o.scale.setScalar(MODELS[name].s); o.rotation.y = yaw3; o.position.copy(U(ux, uy, uz)); o.traverse(m => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } }); scene.add(o); o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  if (name === 'shop') {   // 花店：整棟外框太大（把店裡面也擋掉了）→ 只擋「站在地上的實體」：牆、櫃檯、箱子；高處的架子、地板、小裝飾不擋
    const tb = new THREE.Box3(), sz = new THREE.Vector3(); let n = 0;
    o.traverse(m => { if (!m.isMesh || !m.geometry) return; m.geometry.computeBoundingBox(); tb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); tb.getSize(sz);
      if (tb.min.y > 1.2 || tb.max.y < .7 || (sz.x > 20 && sz.z > 20) || sz.x * sz.z < .25) return;   // 太高／太矮（地板）／整片大地板／太小
      boxes.push({ x0: tb.min.x - .1, x1: tb.max.x + .1, z0: -tb.max.z - .1, z1: -tb.min.z + .1 }); n++; });
    if (n) return b;
  }
  boxes.push({ x0: b.min.x, x1: b.max.x, z0: -b.max.z, z1: -b.min.z });   // Three z → Unity z
  return b;
}
/* 山：Unity 的 MountainZone（[款式,x,y,z,轉向,縮放,外框中心x,z,外框底y,外框高,外框半徑]）→ 依外框高度等比縮放、貼地、加圓形碰撞 */
function placeMountains(list) {
  const proto = [];
  for (let i = 0; i < 3; i++) {
    const k = 'mountain' + i; if (!M[k]) { proto.push(null); continue; }
    const t = T[k]; if (t) { t.flipY = true; t.needsUpdate = true; }   // 山的 UV 是 FBX 的（v 向上），貼圖要翻
    const sc = M[k].scene; sc.updateMatrixWorld(true); lambertize(sc, k, t);
    proto.push({ sc, b: new THREE.Box3().setFromObject(sc) });
  }
  list.forEach(m => {
    const pr = proto[m[0]]; if (!pr) return;
    const s = m[9] / (pr.b.max.y - pr.b.min.y), o = pr.sc.clone(true);
    o.scale.setScalar(s); o.rotation.y = -m[4] * Math.PI / 180 + Math.PI; /* 山臉在模型 +Z，z 翻轉後多轉 180° */ o.position.copy(U(m[1], m[8] - s * pr.b.min.y, m[3]));
    o.traverse(x => { if (x.isMesh) { x.receiveShadow = true; x.castShadow = true; } }); scene.add(o);
    colliders.push({ x: m[6], z: m[7], r: m[10] });
  });
}
function procHouse(x, z, body, roof, w, d, h) {
  const g = new THREE.Group(); g.position.copy(U(x, 0, z));
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), unityMat(P_HOUSE, { color: new THREE.Color(body) })); b.position.y = h / 2; g.add(b);
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .78, h * .6, 4), unityMat(P_HOUSE, { color: new THREE.Color(roof) })); r.position.y = h + h * .3; r.rotation.y = Math.PI / 4; g.add(r);
  scene.add(g); colliders.push({ x, z, r: Math.max(w, d) * .6 });
}
/* 【碰撞】把「模型的外框」換成沿長邊排列的圓形碰撞框（長椅等長條形物件用）；ux,uz＝Unity 座標，ry＝模型旋轉（Three 的 rotation.y），s＝縮放，box＝模型未縮放的外框 */
function addBoxAsCircles(ux, uz, ry, s, box) {
  const sx = (box.max.x - box.min.x) * s, sz = (box.max.z - box.min.z) * s, cx = (box.max.x + box.min.x) / 2 * s, cz = (box.max.z + box.min.z) / 2 * s;
  const along = sx >= sz ? 'x' : 'z', L = Math.max(sx, sz), W = Math.min(sx, sz), r = Math.max(.25, W / 2), n = Math.max(1, Math.ceil((L - 2 * r) / (r * 1.2)) + 1);
  const co = Math.cos(ry), si = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : -((L - 2 * r) / 2) + (L - 2 * r) * i / (n - 1), lx = cx + (along === 'x' ? k : 0), lz = cz + (along === 'z' ? k : 0);
    const wx = lx * co + lz * si, wz = -lx * si + lz * co;   // 模型座標 → 世界（Three）
    colliders.push({ x: ux + wx, z: uz - wz, r });             // Three z → Unity z
  }
}
/* ═════════ [T07b] 河、池塘、橋（資料來自 Unity 匯出的 town_layout.json 的 water；沒有就不畫、不擋） ═════════ */
var groundMesh = null;   // [T02] 地面網格，buildWater 會在河、池塘位置挖洞
const WATER = { on: false, river: [], ponds: [], zones: [] };
function waterDist(x, z) {   // 離水域邊緣的距離（水裡是負的）；演算法和 Unity RiverPath.DistanceToEdge 相同
  let best = 9999;
  for (const p of WATER.ponds) { const dx = x - p.x, dz = z - p.z; let a = Math.atan2(dz, dx); if (a < 0) a += Math.PI * 2; const f = a / (Math.PI * 2) * 64, k = Math.floor(f) % 64, tt = f - Math.floor(f), r = p.r[k] + (p.r[(k + 1) % 64] - p.r[k]) * tt; best = Math.min(best, Math.hypot(dx, dz) - r); }
  const R = WATER.river;
  for (let i = 0; i < R.length - 1; i++) {
    const ax = R[i][0], az = R[i][1], bx = R[i + 1][0], bz = R[i + 1][1], abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz;
    const tt = l2 > 1e-6 ? Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + abx * tt), z - (az + abz * tt)) - (R[i][2] + (R[i + 1][2] - R[i][2]) * tt));
  }
  return best;
}
function onBridge(x, z) {
  for (const b of WATER.zones) { const dx = x - b.x, dz = z - b.z, s = Math.sin(b.ry), c = Math.cos(b.ry), lx = dx * c - dz * s, lz = dx * s + dz * c; if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) return true; }
  return false;
}
function groundY(x, z) {   /* 橋板／坡／碼頭上的腳底高度（其他地方 0） */
  let y = 0; if (!WATER.hz) return 0;
  for (const b of WATER.hz) { const dx = x - b.x, dz = z - b.z, sn = Math.sin(b.ry), c = Math.cos(b.ry), lx = dx * c - dz * sn, lz = dx * sn + dz * c; if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz && b.top > y) y = b.top; }
  return y;
}
function waterBlocked(x, z) { return WATER.on && waterDist(x, z) < .3 && !onBridge(x, z); }
function buildWater(W) {
  if (!W || !W.river || W.river.length < 2) return; WATER.on = true; WATER.river = W.river; WATER.ponds = W.ponds || [];
  // [水面] 一張自訂 Shader：中間深→岸邊淺的漸層、流動的白色細紋、岸邊泡沫線、閃光點（aE：中線 0 → 岸邊 1）
  const mk = (extra, y, mat, k) => {
    const pos = [], idx = [], ae = [], R = W.river;
    for (let i = 0; i < R.length; i++) {
      const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const hw = Math.max(.1, R[i][2] * k + extra), nx = -tz, nz = tx;
      pos.push(R[i][0] + nx * hw, y, -(R[i][1] + nz * hw), R[i][0], y, -R[i][1], R[i][0] - nx * hw, y, -(R[i][1] - nz * hw)); ae.push(1, 0, 1);
      if (i < R.length - 1) { const q = i * 3; idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3, q + 1, q + 2, q + 4, q + 2, q + 5, q + 4); }
    }
    for (const p of WATER.ponds) {
      const c0 = pos.length / 3; pos.push(p.x, y, -p.z); ae.push(0);
      for (let j = 0; j < 64; j++) { const a = j / 64 * Math.PI * 2, r = Math.max(.1, p.r[j] * k + extra); pos.push(p.x + Math.cos(a) * r, y, -(p.z + Math.sin(a) * r)); ae.push(1); }
      for (let j = 0; j < 64; j++) idx.push(c0, c0 + 1 + j, c0 + 1 + (j + 1) % 64);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aE', new THREE.Float32BufferAttribute(ae, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 1; scene.add(m);
  };
  // 水面 Shader：照 Unity Fuwa/ToonRiver（ToonRiver.shader）移植——淺青岸邊→藍色河心、慢飄色塊、細光紋、小漣漪圈、貼岸細亮邊、水往 Unity -Z 流（沒有倒影）
  const wmat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, uniforms: { uTime: UN.uTime },
    vertexShader: 'attribute float aE; varying float vE; varying vec2 vW; void main(){ vE=aE; vW=vec2(position.x,-position.z); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uTime; varying float vE; varying vec2 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      vec2 h22(vec2 p){ float a=h21(p); return vec2(a,h21(p+a*17.3)); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); float a=h21(i),b=h21(i+vec2(1.,0.)),c=h21(i+vec2(0.,1.)),d=h21(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
      void main(){
        float edge = 1.-vE, t = uTime; vec2 w = vW; vec2 flow = vec2(0.,-t*.5);
        vec3 col = mix(vec3(.62,.90,.92), vec3(.40,.82,.88), smoothstep(.02,.5,edge));   /* 照 Unity 截圖：淡青綠、很平 */
        float n1=vn((w+flow*.6)*.07), n2=vn((w+flow)*.18+11.), n3=vn((w+flow*1.7)*.45+3.);
        float shade=n1*.5+n2*.33+n3*.17; col *= 1.+(shade-.5)*.5*.45; col = mix(col, vec3(.30,.70,.80), smoothstep(.55,.85,n1)*.22);   /* 慢飄的深青色雲狀塊 */
        vec2 wp=w*.22+flow*.5; wp+=(vec2(vn(wp*.9+4.),vn(wp*.9+9.))-.5)*1.6;
        float r1=1.-abs(vn(wp)*2.-1.), r2=1.-abs(vn(wp*1.7+vec2(3.7,1.3)+flow*.3)*2.-1.);
        float caustic=smoothstep(.80,.98,r1)*.6+smoothstep(.82,.98,r2)*.4;
        col += caustic*.05*vec3(.55,.75,.7)*smoothstep(.05,.4,edge);
        vec2 g=w/9.; vec2 id=floor(g), f=fract(g); vec2 hh=h22(id+5.); float ph=fract(t*.16+hh.x*7.); vec2 ctr=.25+hh*.5;
        float d=length((f-ctr)*9.), rad=ph*2.2;
        float ring=smoothstep(.14,0.,abs(d-rad))*(1.-ph)*step(.45,hh.y)*smoothstep(.1,.3,edge);
        col=mix(col,vec3(1.),ring*.22);
        float rim=1.-smoothstep(0.,.04,edge); col=mix(col,vec3(.95,1.,1.),rim*.18);
        gl_FragColor=vec4(col*vec3(1.,.99,.95),1.); }` });
  /* [T07c] 凹下去的河床（照 Unity：水面 y=-0.85、岸壁往下）：地面挖洞 → 水面放低 → 兩側鋪岸壁（上緣沙色、下緣青綠） */
  const WY = -.85, hole = [], walls = [];
  { const R = W.river, Lp = [], Rp = [];
    for (let i = 0; i < R.length; i++) { const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; const hw = Math.max(.3, R[i][2]); Lp.push([R[i][0] - tz * hw, R[i][1] + tx * hw]); Rp.push([R[i][0] + tz * hw, R[i][1] - tx * hw]); }
    hole.push(Lp.concat(Rp.slice().reverse())); walls.push(Lp, Rp);
    for (const p of WATER.ponds) { const pts = []; for (let j = 0; j < 64; j++) { const an = j / 64 * Math.PI * 2, r = Math.max(.3, p.r[j]); pts.push([p.x + Math.cos(an) * r, p.z + Math.sin(an) * r]); } hole.push(pts); walls.push(pts.concat([pts[0]])); } }
  if (groundMesh) {
    const sh = new THREE.Shape(); sh.absarc(0, 0, 330, 0, Math.PI * 2, false);
    for (const h of hole) sh.holes.push(new THREE.Path(h.map(q => new THREE.Vector2(q[0], q[1]))));
    groundMesh.geometry.dispose(); groundMesh.geometry = new THREE.ShapeGeometry(sh, 24);
  }
  { const pos = [], col = [], idx = [], top = new THREE.Color('#EBC884'), bot = new THREE.Color('#D9BD83');
    for (const w of walls) { const b0 = pos.length / 3; for (const q of w) { pos.push(q[0], 0, -q[1], q[0], WY - .1, -q[1]); col.push(top.r, top.g, top.b, bot.r, bot.g, bot.b); }
      for (let i = 0; i < w.length - 1; i++) { const a = b0 + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.frustumCulled = false; scene.add(m); }
  mk(0, WY, wmat, 1);
  const wood = new THREE.MeshLambertMaterial({ color: '#C99B6D' }), bg = new THREE.BoxGeometry(1, 1, 1);
  [].concat(W.bridge || [], W.fishing || []).forEach(r => { const m = new THREE.Mesh(bg, wood); m.position.set(r[1], r[2], -r[3]); m.rotation.y = -r[4] * Math.PI / 180; m.scale.set(r[5], r[6], r[7]); m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  (W.bridge || []).forEach(r => { if (/^Rail/.test(r[0])) { const ry = r[4] * Math.PI / 180, hx = r[5] / 2, hz = r[7] / 2, wx = Math.abs(hx * Math.cos(ry)) + Math.abs(hz * Math.sin(ry)), wz = Math.abs(hx * Math.sin(ry)) + Math.abs(hz * Math.cos(ry)); boxes.push({ x0: r[1] - wx, x1: r[1] + wx, z0: r[3] - wz, z1: r[3] + wz }); } });   /* 橋欄杆擋住（不能穿過去、也不能跳出橋） */
  WATER.hz = []; [].concat(W.bridge || [], W.fishing || []).forEach(r => { if (r[0] === 'Deck' || /^Ramp/.test(r[0]) || r[0] === 'Jetty') WATER.hz.push({ x: r[1], z: r[3], ry: r[4] * Math.PI / 180, hx: r[5] / 2, hz: r[7] / 2, top: r[2] + r[6] / 2 }); });   /* 走得上去的面：板、坡、碼頭的頂面高度 */
  (W.bridge || []).forEach(r => { if (r[0] === 'Deck' || /^Ramp/.test(r[0])) WATER.zones.push({ x: r[1], z: r[3], ry: r[4] * Math.PI / 180, hx: r[5] / 2 + .15, hz: r[7] / 2 + .15 }); });
}
function buildWorld(L) {
  { const LM = L.landmarks || {}; if (LM.rowan) { NPCS[0].x = LM.rowan[0]; NPCS[0].z = LM.rowan[1]; } if (LM.mouse) { NPCS[1].x = LM.mouse[0]; NPCS[1].z = LM.mouse[1]; } if (LM.bird) { BIRD_HOME.x = LM.bird[0]; BIRD_HOME.z = LM.bird[1]; } }
  const sc = (t, k, lo) => Math.max(lo || .6, t[5]) * k;
  if (M.tree) {
    const m = MODELS.tree.s, list = L.trees.map(t => ({ p: U(t[1], 0, t[3]), ry: t[4] * Math.PI / 180, s: sc(t, m) }));
    instSet('tree', list, 'tree', false, true); L.trees.forEach(t => { const S = MODELS.tree.s * Math.max(.6, t[5]), ry = t[4] * Math.PI / 180, ox = .31, oz = -.15, ex = (ox * Math.cos(ry) + oz * Math.sin(ry)) * S, ez = (-ox * Math.sin(ry) + oz * Math.cos(ry)) * S; colliders.push({ x: t[1] + ex, z: t[3] - ez, r: 1.7 * S }); });   /* 樹幹實測：離地 0.6 以內的半徑中位數約 1.17（模型單位），× 場景縮放 */
  }
  if (M.conifer) {
    const list = L.pines.map(t => ({ p: U(t[1], 0, t[3]), ry: t[4] * Math.PI / 180, s: sc(t, MODELS.conifer.s) }));
    instSet('conifer', list, 'conifer', false, true); L.pines.forEach(t => colliders.push({ x: t[1], z: t[3], r: .7 * Math.max(.6, t[5]) }));
  }
  // 小花（Flower_s*）與灌木叢（花叢_Fin_s*，Unity 場景裡是另一個很重的模型，這裡用低面數的圓團代替）
  const FL = L.flowers.filter(t => /^Flower_s/.test(t[0])), BU = L.flowers.filter(t => !/^Flower_s/.test(t[0]));
  if (M.flower) instSet('flower', FL.map((t, i) => ({ p: U(t[1], t[2], t[3]), ry: (i * 2.4), s: sc(t, MODELS.flower.s, .5) })), 'flower', true, false);
  if (M.bush) {   // 花叢：Blender 原檔（60 片葉＋18 朵花）低面數重建；球心在 y=0、Unity 擺放高度就是球心高度，縮放 = Unity 縮放 ÷100
    const bl = BU.map(t => ({ p: U(t[1], t[2], t[3]), ry: t[4] * Math.PI / 180, s: t[5] / 100 }));
    instSet('bush', bl, 'bush', false, true); BU.forEach(t => colliders.push({ x: t[1], z: t[3], r: 1.5 * t[5] / 70 })); }
  else { const bg = buildBushGeo();
    instParts([{ geometry: bg, material: unityMat(P_BUSH2, { color: new THREE.Color(1, 1, 1), vertexColors: true, side: THREE.DoubleSide }), m: new THREE.Matrix4() }], BU.map(t => ({ p: U(t[1], 0, t[3]), ry: t[4] * Math.PI / 180, s: t[5] / 70 * 1.5 })), null, true);
    BU.forEach(t => colliders.push({ x: t[1], z: t[3], r: 2.2 * t[5] / 70 })); }
  if (M.bench) { instSet('bench', L.benches.map(t => ({ p: U(t[1], 0, t[3]), ry: -t[4] * Math.PI / 180, s: sc(t, MODELS.bench.s) })), 'bench', false, true);
    const bb = modelBox('bench'); L.benches.forEach(t => addBoxAsCircles(t[1], t[3], -t[4] * Math.PI / 180, sc(t, MODELS.bench.s), bb.b)); }   // 長椅：依模型真實大小，沿長邊排幾顆圓形碰撞框
  if (M.stone) { L.stones = L.stones.filter(t => !/Shadow/.test(t[0]));   // 名字帶 Shadow 的是接地陰影貼片，不是石頭
    instSet('stone', L.stones.map(t => ({ p: U(t[1], 0, t[3]), ry: t[4] * Math.PI / 180, s: sc(t, MODELS.stone.s) })), 'stone', false, true); const sz = modelBox('stone').s.x * MODELS.stone.s; L.stones.forEach(t => colliders.push({ x: t[1], z: t[3], r: sz * t[5] * .38 })); }
  if (L.mountains && L.mountains.length) placeMountains(L.mountains);
  buildWater(L.water);
  // 房子：位置、朝向來自 Unity 場景（花店轉 180°、起司屋朝北）
  { const SH = (L.landmarks && L.landmarks.shop) || [-3.8, .12, -1.6]; if (M.shop) placeStatic('shop', SH[0], SH[1], SH[2], 0); else procHouse(SH[0], SH[2], '#F2E6D8', '#C69BE0', 8, 6, 4.5); }
  // 起司屋改在開機後才載入（loadLate），這裡先不放
  if (false) placeStatic('cheese', 47.4, .47, 93.5, 0);   // 門朝南（面向小鎮中心／出生點） else procHouse(47.4, 93.5, '#FFE9A8', '#F2A65A', 8, 8, 5);
}

/* ═════════ [T08] 草（Fuwa/ToonGeometryGrass）：玩家周圍一圈草叢，隨玩家移動重排；避開小路、樹、房子 ═════════ */
const GRASS_R = 36, GRASS_CELL = .38, GRASS_NEAR = 16;   // 近處（NEAR 公尺內）全密度；更遠的草變稀一點但長得一樣高，範圍拉到 36 公尺，邊緣在畫面外，不會看到「長出來」   // 草的範圍（公尺）與每叢間距：Unity 每平方公尺約 48 片草；叢間距 .36 ≈ 每平方公尺 46 片。手機太卡就把 GRASS_CELL 調大（.45）或 GRASS_R 調小（18）
let grass = null, grassAt = [1e9, 1e9];
function grassTuft() {   // 一叢：6 片草，每片 3 排（根→尖），寬 .04、高 .42±.2（Unity Gress.mat）、微前傾；頂點色 r＝高度比例（給 Shader 做根→尖漸層與擺動）
  const pos = [], col = [], idx = []; let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < 6; b++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * .3, bx = Math.cos(a) * r, bz = Math.sin(a) * r, yaw = rnd() * 6.283, h = .42 + (rnd() * 2 - 1) * .2, w = .042 * (.8 + rnd() * .5), lean = .15 * h * (.6 + rnd() * .8);
    const cx = Math.cos(yaw), sz = Math.sin(yaw), base = pos.length / 3;
    for (let k = 0; k < 3; k++) { const t = k / 2, hw = w * (1 - Math.pow(t, 1.6)) + .003, y = h * t, f = lean * t * t * 2.2;
      for (const sgn of [-1, 1]) { pos.push(bx + cx * hw * sgn - sz * f, y, bz + sz * hw * sgn + cx * f); col.push(t, t, t); } }
    for (let k = 0; k < 2; k++) { const i = base + k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/* [T08b] 靜態草（照 Unity）：讀 Unity 匯出的 grass_points.bin（GrassScatter 的草點，世界座標），整個小鎮一次擺好、不隨玩家移動重排 → 不會邊走邊長出來。
   分成 GCHUNK 公尺的小區塊，視錐外的區塊不畫、太遠的區塊不畫。沒有這個檔案就退回下面的「玩家周圍動態草」。 */
const GCHUNK = 20, GSHOW = 46;   // 區塊大小；離玩家超過 GSHOW 公尺的區塊不畫
let grassChunks = null;
function buildStaticGrass(buf) {   // [T08c] 43 萬個草點：先只分區塊（很快），區塊走近了才真的建；遠處的區塊只畫一部分（LOD）
  try {
    const dv = new DataView(buf); if (buf.byteLength < 8 || dv.getUint8(0) !== 71 || dv.getUint8(1) !== 82 || dv.getUint8(2) !== 83) return false;
    const n = dv.getInt32(4, true); if (n <= 0 || buf.byteLength < 8 + n * 6) return false;
    const m = unityMat(P_GRASS, { vertexColors: true, side: THREE.DoubleSide }), geo = grassTuft(), groups = new Map();
    for (let i = 0; i < n; i++) { const o = 8 + i * 6, x = dv.getInt16(o, true) / 100, y = dv.getInt16(o + 2, true) / 100, z = dv.getInt16(o + 4, true) / 100; if (onPathT(x, z, 24)) continue; const k = Math.floor(x / GCHUNK) + ',' + Math.floor(z / GCHUNK); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(x, y, z, i); }
    grassChunks = []; grassGeo = geo; grassMat = m;
    groups.forEach(g => { const c = g.length / 4; let cx = 0, cz = 0; for (let j = 0; j < c; j++) { cx += g[j * 4]; cz += g[j * 4 + 2]; } grassChunks.push({ g, c, cx: cx / c, cz: cz / c, im: null, f: 0 }); });
    console.log('[T08b] 靜態草', n, '點', grassChunks.length, '區塊'); return true;
  } catch (e) { console.warn('static grass', e); grassChunks = null; return false; }
}
let grassGeo = null, grassMat = null;
function grassBuildChunk(ch) {
  const g = ch.g, c = ch.c, d = new THREE.Object3D(), im = new THREE.InstancedMesh(grassGeo, grassMat, c); im.receiveShadow = true;
  for (let j = c - 1; j > 0; j--) { const r = Math.floor((Math.sin(g[j * 4 + 3] * 12.9898) * 43758.5453 % 1 + 1) % 1 * (j + 1)); if (r !== j) for (let q = 0; q < 4; q++) { const t = g[j * 4 + q]; g[j * 4 + q] = g[r * 4 + q]; g[r * 4 + q] = t; } }   // 洗牌：之後只畫前面一部分＝隨機變稀疏
  for (let j = 0; j < c; j++) { const x = g[j * 4], y = g[j * 4 + 1], z = g[j * 4 + 2], i = g[j * 4 + 3], h1 = Math.sin(i * 127.1) * 43758.5453, h3 = Math.sin(i * 419.2) * 31415.9265;
    d.position.copy(U(x, y, z)); d.rotation.set(0, (h3 - Math.floor(h3)) * 6.283, 0); d.scale.setScalar(.8 + (h1 - Math.floor(h1)) * .5); d.updateMatrix(); im.setMatrixAt(j, d.matrix); }
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); ch.im = im; ch.g = null;
}
function grassChunkFrame(px, pz) {
  if (!grassChunks) return; const todo = [];
  for (const ch of grassChunks) {
    const dd = Math.hypot(ch.cx - px, ch.cz - pz), vis = dd < GSHOW + GCHUNK;
    if (vis && !ch.im) { todo.push([dd, ch]); continue; }
    if (!ch.im) continue; ch.im.visible = vis;
    if (vis) { const f = dd < 26 ? 1 : dd < 40 ? .55 : .3; if (f !== ch.f) { ch.f = f; ch.im.count = Math.max(1, Math.ceil(ch.c * f)); } }
  }  if (todo.length) { todo.sort((p, q) => p[0] - q[0]); for (let i = 0; i < Math.min(4, todo.length); i++) grassBuildChunk(todo[i][1]); }   // 由近到遠，每幀最多建 4 塊，不卡
}
function buildGrass() {
  const n = Math.ceil(Math.PI * GRASS_R * GRASS_R / (GRASS_CELL * GRASS_CELL)) + 64, m = unityMat(P_GRASS, { vertexColors: true, side: THREE.DoubleSide });
  grass = new THREE.InstancedMesh(grassTuft(), m, n); grass.frustumCulled = false; grass.receiveShadow = true; grass.count = 0; scene.add(grass);
}
function updateGrass(px, pz, force) {   // px, pz：Unity 座標
  if (!grass || (!force && Math.hypot(px - grassAt[0], pz - grassAt[1]) < 2)) return; grassAt = [px, pz];
  const d = new THREE.Object3D(), r = GRASS_R, cs = GRASS_CELL, gx0 = Math.floor((px - r) / cs), gx1 = Math.ceil((px + r) / cs), gz0 = Math.floor((pz - r) / cs), gz1 = Math.ceil((pz + r) / cs);
  const near = colliders.filter(c => Math.hypot(c.x - px, c.z - pz) < r + 6), nb = boxes.filter(b => b.x1 > px - r - 2 && b.x0 < px + r + 2 && b.z1 > pz - r - 2 && b.z0 < pz + r + 2);
  let i = 0;
  for (let gx = gx0; gx <= gx1 && i < grass.instanceMatrix.count; gx++) for (let gz = gz0; gz <= gz1 && i < grass.instanceMatrix.count; gz++) {
    const h1 = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453, h2 = Math.sin(gx * 269.5 + gz * 183.3) * 24634.6345, h3 = Math.sin(gx * 419.2 + gz * 371.9) * 31415.9265;
    const x = (gx + (h1 - Math.floor(h1))) * cs, z = (gz + (h2 - Math.floor(h2))) * cs;
    const dpl = Math.hypot(x - px, z - pz); if (dpl > r || (dpl > GRASS_NEAR && (h3 * 3 % 1 + 1) % 1 > .6 - (dpl - GRASS_NEAR) / (r - GRASS_NEAR) * .25) || onPathT(x, z, 24) || (WATER.on && waterDist(x, z) < .5)) continue;
    let bad = false; for (const c of near) { const dx = x - c.x, dz = z - c.z, rr = c.r + .25; if (dx * dx + dz * dz < rr * rr) { bad = true; break; } }
    if (!bad) for (const b of nb) if (x > b.x0 - .3 && x < b.x1 + .3 && z > b.z0 - .3 && z < b.z1 + .3) { bad = true; break; }
    if (bad) continue;
    d.position.copy(U(x, 0, z)); d.rotation.set(0, (h3 - Math.floor(h3)) * 6.283, 0); d.scale.setScalar(.8 + ((h1 * 7) % 1 + 1) % 1 * .5); d.updateMatrix(); grass.setMatrixAt(i++, d.matrix);
  }
  grass.count = i; grass.instanceMatrix.needsUpdate = true;
}

/* ═════════ [T09] 角色 ═════════ */
function nameTag(text, bg, big) {   // 和 Unity WorldTags 一致：淡色圓角底＋深紫字＋柔影；bg＝底色（Color 或 hex）
  const lines = String(text).split('\n'), W = 360, lh = 54, H = lines.length * lh + 44, c = document.createElement('canvas'); c.width = W; c.height = H + 12; const g = c.getContext('2d');
  const col = new THREE.Color(bg || '#FFF6BE'), css = '#' + col.getHexString();
  g.font = '700 34px "jf-openhuninn","PingFang TC","Microsoft JhengHei",system-ui,sans-serif'; const tw = Math.min(W - 24, Math.max(...lines.map(l => g.measureText(l).width)) + 60), x0 = (W - tw) / 2, r = Math.min(30, H / 2);
  g.fillStyle = 'rgba(62,42,90,.28)'; g.beginPath(); g.roundRect(x0 + 3, 9, tw, H, r); g.fill();             // 柔影
  g.fillStyle = css; g.globalAlpha = .97; g.beginPath(); g.roundRect(x0, 4, tw, H, r); g.fill(); g.globalAlpha = 1;   // 底
  g.fillStyle = '#3E2A5A'; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, W / 2, 4 + 22 + lh / 2 + i * lh));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); const k = (big ? 1.9 : 1.6) / W * (W); s.scale.set(k * (W / 360), k * (c.height / 360), 1); s.renderOrder = 10; return s;
}
function shadowDisc(r) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: '#2B3A2B', transparent: true, opacity: .10, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .03; return m; }
/* 模型朝向修正：glTF 的「正面」在 Three 裡朝 +Z 時為 0（外層再轉成 π − yaw） */
const FACE = { ping: 0, blip: 0, rowan: 0, mouse: 0, bird1: 0, bird2: 0 };
function actor(name, pcol) {
  const root = SkeletonUtils.clone(M[name].scene), g = new THREE.Group(), inner = new THREE.Group();
  lambertize(root, name, T[name === 'ping' ? 'ping_base' : name], pcol);
  root.traverse(m => { if (m.isMesh) m.castShadow = true; });
  inner.add(root); inner.scale.setScalar(MODELS[name].s); inner.rotation.y = FACE[name]; g.add(inner);
  const mixer = new THREE.AnimationMixer(root), acts = {};
  M[name].animations.forEach(a => { const k = /wingopen/i.test(a.name) ? 'wing' : /walk/i.test(a.name) ? 'walk' : /idle/i.test(a.name) ? 'idle' : 'clip'; acts[k] = mixer.clipAction(a); });
  const first = acts.idle || acts.clip; if (first) first.play();
  g.userData = { mixer, acts, cur: first ? (acts.idle ? 'idle' : 'clip') : '' };
  return g;
}
function setAnim(g, want) {   // 'idle' | 'walk'
  const u = g.userData; if (!u.acts || !u.acts[want] || u.cur === want) return;
  const a = u.acts[want], b = u.acts[u.cur]; a.reset().play(); if (b) a.crossFadeFrom(b, .2, false); u.cur = want;
}
function makePingFallback(hex) {
  const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(.9, 18, 14), unityMat(P_PING, { color: new THREE.Color(hex) })); body.position.y = 1; g.add(body); g.add(shadowDisc(1)); g.userData = { body, fb: true }; return g;
}
const PAL = ['#FFB5C1', '#E7BEF8', '#FFE59A', '#A9D3FF', '#B7E1D1', '#FFC9A3'];
const hueIdx = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function setTag(g, name, col, flash) {   // 名字牌：底色＝玩家顏色混奶油黃（Unity：Lerp(玩家色, 奶油黃, .7)）；剛接任務多一行「接受任務成功」
  name = name || ''; g.userData.nm = name; g.userData.nmc = col ? '#' + col.getHexString() : ''; const key = name + '|' + (col ? col.getHexString() : '') + '|' + (flash ? 1 : 0); if (g.userData.tagName === key) return; g.userData.tagName = key;
  if (g.userData.tag) { const o = g.userData.tag; g.remove(o); o.material.map.dispose(); o.material.dispose(); g.userData.tag = null; }
  if (name && !EMBED) { const bg = new THREE.Color('#FFF6BE'); if (col) bg.lerp(col, .3); const t = nameTag(flash ? '接受任務成功\n' + name : name, bg); t.position.set(0, CFG.nameTagY + (flash ? .2 : 0), 0); g.add(t); g.userData.tag = t; }
}
function makePing(col, name, hex) {
  const idx = hueIdx(col), pc = pingColor(hex, col), g = M.ping ? actor('ping', pc) : makePingFallback('#' + pc.getHexString());
  g.add(shadowDisc(1.1));
  setTag(g, name, pc);
  return g;
}
/* [T09b] 居民頭上的「？」：把 Unity RowanReactions.MakeMarkerSprite(true) 的算法照搬（奶油底、淡藍紫邊、藍紫色？、小尾巴、外發光） */
const mark = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N), d = im.data;
  const cream = [1, .973, .918], pink = [.68, .76, 1], coral = [.42, .52, 1], px = 2 / N, cl = (v, a, b) => Math.max(a, Math.min(b, v)), mx = (a, b, t) => a + (b - a) * t;
  const cap = (x, y, ax, ay, bx, by) => { const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay, h = cl((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1), dx = pax - bax * h, dy = pay - bay * h; return Math.hypot(dx, dy); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = (x + .5) / N * 2 - 1, ny = 1 - (y + .5) / N * 2;   // 畫布 y 向下，Unity 貼圖 y 向上
    const dMain = Math.hypot(nx, ny - .12) - .68, dTail = Math.hypot(nx, ny + .7) - .13, k = .16, h = cl(.5 + .5 * (dTail - dMain) / k, 0, 1), sd = mx(dTail, dMain, h) - k * h * (1 - h);
    const fill = cl(.5 - sd / px, 0, 1), inner = cl(.5 - (sd + .07) / px, 0, 1), dDot = Math.hypot(nx, ny + .2) - .115;
    const ang = cl(Math.atan2(ny - .36, nx), -70 * Math.PI / 180, 160 * Math.PI / 180), ax = .2 * Math.cos(ang), ay = .36 + .2 * Math.sin(ang);
    const dArc = Math.hypot(nx - ax, ny - ay) - .09, dStem = cap(nx, ny, .068, .172, 0, .03) - .09, dSym = Math.min(dArc, dStem, dDot), m = cl(.5 - dSym / px, 0, 1);
    const glow = sd > 0 ? Math.exp(-sd * 9) * .3 : 0, a = Math.max(fill, glow * (1 - fill)), i = (y * N + x) * 4;
    for (let q = 0; q < 3; q++) { let v = mx(pink[q], cream[q], inner); v = mx(v, coral[q], m * inner); d[i + q] = v * 255; }
    d[i + 3] = a * 255;
  }
  g.putImageData(im, 0, 0); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false })); sp.center.set(.5, .12); sp.scale.set(1.2, 1.2, 1); sp.renderOrder = 11; return sp; })();   // center .12＝尾巴指著居民

/* [T09c] 「？」動態照搬 Unity RowanReactions：大小 1.28、離鏡頭越遠越大(每公尺+5%)、呼吸、彈出回彈、出現光環、偶爾飄粉色小泡泡 */
const MKFX = (() => {
  const mk = (N, f) => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const nx = (x + .5) / N * 2 - 1, ny = (y + .5) / N * 2 - 1, i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.max(0, Math.min(1, f(nx, ny))) * 255; } g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return { ring: mk(64, (x, y) => 1 - Math.abs(Math.hypot(x, y) - .86) / .1), soft: mk(32, (x, y) => 1 - ss(0, 1, Math.hypot(x, y))), list: [] };
})();
function mkFxSprite(tex, col, size) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthTest: false, depthWrite: false })); m.renderOrder = 10; m.visible = false; m.userData = { t: -1, life: 1, size, vx: 0, vy: 0, ring: false }; scene.add(m); MKFX.list.push(m); return m; }
function mkPop(n, now) {   // 出現：兩圈光環往外擴散
  const p = new THREE.Vector3(); n.m.getWorldPosition(p); p.y += .55;
  for (let i = 0; i < 2; i++) { const r = mkFxSprite(MKFX.ring, 0xADC2FF, 1.9); Object.assign(r.userData, { t: now + i * 120, life: 700, ring: true, p0: p.clone() }); }
}
function mkFrame(n, now, dt) {
  const vis = n.m.visible;
  if (vis && !n.mShown) { n.mShown = true; n.mT = now; mkPop(n, now); } else if (!vis) n.mShown = false;
  if (!vis) return;
  const e0 = Math.min(1, (now - n.mT) / 500), e = 1 + 2.70158 * Math.pow(e0 - 1, 3) + 1.70158 * Math.pow(e0 - 1, 2);
  const wp = new THREE.Vector3(); n.m.getWorldPosition(wp);
  const dist = cam.position.distanceTo(wp), ds = 1 + Math.max(0, dist - 4) * .05, w = Math.sin(now / 1000 * 5), sc = n.obj.scale.x || 1;
  n.m.scale.set((1 + .02 * w) * 1.28 * ds * Math.max(.001, e) / sc, (1 - .02 * w) * 1.28 * ds * Math.max(.001, e) / sc, 1);
  if (e0 >= .9 && now - (n.mPuff || 0) > 700) { n.mPuff = now; const b = mkFxSprite(MKFX.soft, 0xFFC7DB, .12 + Math.random() * .08); Object.assign(b.userData, { t: now, life: 1300, p0: wp.clone().add(new THREE.Vector3((Math.random() - .5) * .6, -.2, 0)), vx: (Math.random() - .5) * .3, vy: .5 }); }
}
function mkFxFrame(now) {
  for (let i = MKFX.list.length - 1; i >= 0; i--) {
    const s = MKFX.list[i], u = s.userData, a = (now - u.t) / u.life;
    if (u.t < 0 || a >= 1) { if (u.t >= 0) { scene.remove(s); s.material.dispose(); MKFX.list.splice(i, 1); } continue; }
    if (a < 0) { s.visible = false; continue; } s.visible = true;
    if (u.ring) { const k = 1 - (1 - a) * (1 - a), sz = u.size * 2 * (.25 + .75 * k); s.scale.set(sz, sz, 1); s.position.copy(u.p0); s.material.opacity = (1 - a) * .9; }
    else { const t = a * u.life / 1000, sz = u.size * (a < .15 ? a / .15 : 1 - (a - .15) / .85); s.scale.set(Math.max(.001, sz), Math.max(.001, sz), 1); s.position.set(u.p0.x + u.vx * t, u.p0.y + u.vy * t * .8, u.p0.z); s.material.opacity = 1 - a * a; }
  }
}
const NPCS = [
  { id: 'flower', name: '花店老闆', x: -7.06, z: -9.4, kind: 'rowan', h: 6.3, r: 1.4 },
  { id: 'house', name: '奶奶', x: 59.2, z: 74.3, kind: 'mouse', h: 3.7, r: 1.1 }
];
function buildNpcs() {
  NPCS.forEach(n => {
    if (M[n.kind]) { n.obj = actor(n.kind); n.obj.rotation.y = n.face || 0; }
    else { n.obj = new THREE.Group(); const b = new THREE.Mesh(new THREE.CapsuleGeometry(.8, 1.4, 6, 12), unityMat(P_PING, { color: new THREE.Color(n.kind === 'rowan' ? '#E7BEF8' : '#D63A3A') })); b.position.y = 1.5; n.obj.add(b); }
    n.obj.add(shadowDisc(n.r));   // 居民頭上不顯示名字
    n.obj.position.copy(U(n.x, 0, n.z)); n.m = mark.clone(); n.m.visible = false;
    n.obj.updateMatrixWorld(true);
    { const bb = new THREE.Box3(); n.obj.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type !== 'CircleGeometry') bb.expandByObject(o, true); });   // precise：吃骨架姿勢
      if (!bb.isEmpty() && isFinite(bb.max.y) && bb.max.y - bb.min.y < 12) { const top = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2); n.obj.worldToLocal(top); n.m.userData.bx = Math.abs(top.x) < .5 ? top.x : 0; n.m.userData.by = top.y + .85; } else { n.m.userData.bx = 0; n.m.userData.by = n.h + .2; } }
    n.m.position.set(n.m.userData.bx, n.m.userData.by - .4, 0); n.obj.add(n.m);
    scene.add(n.obj); colliders.push({ x: n.x, z: n.z, r: n.r });
  });
}

/* ═════════ [T10] 聲音（交給 play.html 播）：每 250 ms 回報附近的花與距離 ═════════ */
const TRK = [['降頻啾聲', 'down1'], ['慢慢鯨歌', 'down4'], ['放慢雨滴', 'down5'], ['冒泡泡', 'odd3'], ['玻璃呼吸', 'odd4'], ['爬樓梯', 'odd5'], ['低低震動', 'down2'], ['拉長和音', 'down3'], ['咕嚕嚕', 'odd1'], ['沙沙掃過', 'odd2'], ['風鈴', 'chime'], ['水滴', 'drop'], ['時鐘', 'clock'], ['蟲鳴', 'cricket'], ['青蛙', 'frog'], ['火堆', 'fire'], ['貓頭鷹', 'owl'], ['小雞', 'chick'], ['鐘聲', 'bell'], ['海浪', 'sea'], ['風', 'wind']];   // 鳥叫、雨不做循環（只在事件裡出現）
const sndKey = tr => { for (const [w, k] of TRK) if (String(tr || '').includes(w)) return k; return ''; };
function post(o) { try { parent.postMessage(o, '*'); } catch (e) {} }
/* 【T-網頁介面分工】放在手機頁裡（iframe）時：頭上的名字牌／Blip 說話改由 play.html 左上角顯示、對話改用手機頁底部對話卡；Unity 維持頭上顯示。網址加 ?embed=1 可在單獨開啟時測試 */
const EMBED = window.parent !== window || new URLSearchParams(location.search).get('embed') === '1';
let hudKey = '';
function hudSend() {
  if (!EMBED || !me) return;
  const nm = g => ({ n: (g.userData && g.userData.nm) || '', c: (g.userData && g.userData.nmc) || '' });
  const o = { tunein: 'hud', me: nm(me.obj), others: Object.keys(others).map(k => nm(others[k].obj)).filter(x => x.n), blip: BLIP && BLIP.obj.visible ? BLIP.say || '' : '' };
  const k = JSON.stringify(o); if (k === hudKey) return; hudKey = k; post(o);
}
setInterval(() => { try { hudSend(); } catch (e) {} }, 500);
/* ═════════ [T21] 聲音點：小鎮裡會發出聲音的光點（探測器開啟才看得到／聽得到），靠近到 radius 內交給 play.html 的調頻面板 ═════════ */
const SPOT = { cfg: null, list: [], got: {}, t: 0 };
/* [T23] 開場教學：教學中只開「一個」離玩家 10～22 公尺的教學聲音點，活動範圍限縮在它附近；做完（play.html 送 tut off）才解鎖全圖 */
const TUT = { on: false, id: '', cx: 0, cz: 0, R: 28, edgeT: 0 };
SPOT.unl = {};   // 已跟哪些居民聊過（flower／house）；有 gate 的聲音點要聊過才出現
const spotAct = o => (!TUT.on || o.sp.id === TUT.id) && (!o.sp.gate || !!SPOT.unl[o.sp.gate]);
function tutBird() {   /* 教學一律用鳥聲（s01 樹梢的鳥）：不在 9～24 公尺就搬到玩家附近，已收過也重來 */
  const o = SPOT.list.find(q => q.sp.id === 's01'); if (!o || !me) return null;
  const d0 = Math.hypot(o.x - me.x, o.z - me.z);
  if (d0 < 9 || d0 > 24 || o.lost) {
    for (let i = 0; i < 240; i++) { const a = Math.random() * 6.283, r = 12 + Math.random() * 8, x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r; if (spotFree(x, z) && !waterBlocked(x, z)) { o.x = x; o.z = z; o.g.position.copy(U(x, 0, z)); o.shown = false; o.born = performance.now(); break; } }
  }
  o.lost = false; o.got = false; delete SPOT.got[o.sp.id]; o.clue = o.sp.clue || ''; return { o, sc: 0 };
}
function tutStart() {
  if (!me || !SPOT.list.length) { TUT.on = false; return; }
  let best = tutBird(); if (!best) SPOT.list.forEach(o => { if (o.got || bandOf(o)) return; const d = Math.hypot(o.x - me.x, o.z - me.z), sc = Math.abs(d - 14); if (d >= 9 && d <= 24 && (!best || sc < best.sc)) best = { o, sc }; });
  if (!best) SPOT.list.forEach(o => { if (o.got || bandOf(o)) return; const d = Math.hypot(o.x - me.x, o.z - me.z); if (!best || d < best.sc) best = { o, sc: d }; });
  if (!best) { TUT.on = false; return; }
  TUT.on = true; TUT.id = best.o.sp.id; TUT.cx = me.x; TUT.cz = me.z; TUT.R = Math.min(170, Math.max(26, Math.hypot(best.o.x - me.x, best.o.z - me.z) + 14, Math.hypot(BIRD_HOME.x - me.x, BIRD_HOME.z - me.z) + 10));   /* 教學範圍要含小鳥，才走得到小鳥旁邊種花 */
}
try { SPOT.got = JSON.parse(localStorage.getItem('tunein.codex') || '{}') || {}; } catch (e) {}
try { const x = new XMLHttpRequest(); x.open('GET', './sound_spots.json?' + (Date.now() / 6e4 | 0), false); x.send(); if (x.status === 200) SPOT.cfg = JSON.parse(x.responseText); } catch (e) {}
function spotRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function spotFree(x, z) {
  for (const c of colliders) if (Math.hypot(c.x - x, c.z - z) < c.r + 1.6) return false;
  for (const b of boxes) if (x > b.x0 - 1.6 && x < b.x1 + 1.6 && z > b.z0 - 1.6 && z < b.z1 + 1.6) return false;
  return true;
}
// 聲音點依「棲地」放：鳥在樹旁、水聲在河池塘邊、鈴聲在花店旁……（hab 設定在 sound_spots.json）；找不到棲地才隨機
function spotAnchor(hab, L, rnd) {
  const pick = a => a && a.length ? a[Math.floor(rnd() * a.length)] : null, off = (x, z, r) => { const a = rnd() * 6.283, d = r * (.7 + rnd() * .6); return [x + Math.cos(a) * d, z + Math.sin(a) * d]; };
  const LM = L.landmarks || {};
  if (hab === 'tree') { const q = pick(L.trees); if (q) return off(q[1], q[3], 2.6); }
  if (hab === 'pine') { const q = pick(L.pines); if (q) return off(q[1], q[3], 2.4); }
  if (hab === 'bench') { const q = pick(L.benches); if (q) return off(q[1], q[3], 2.2); }
  if (hab === 'stone') { const q = pick((L.stones || []).filter(s => !/Shadow/.test(s[0]))); if (q) return off(q[1], q[3], 2.2); }
  if (hab === 'bush') { const q = pick(L.flowers.filter(s => !/^Flower_s/.test(s[0]))); if (q) return off(q[1], q[3], 2.4); }
  if (hab === 'shop') { const s = LM.shop || [-3.8, 0, -1.6]; return off(s[0], s[2], 6.5); }
  if (hab === 'cheese') { const s = LM.cheese || [47.4, 0, 93.5]; return off(s[0], s[2], 7); }
  if (hab === 'water' && WATER.on) {
    if (WATER.ponds.length && rnd() < .5) { const p = pick(WATER.ponds), a = rnd() * 6.283; return [p.x + Math.cos(a) * (p.r[Math.floor(a / 6.283 * 64) % 64] + 1.4), p.z + Math.sin(a) * (p.r[Math.floor(a / 6.283 * 64) % 64] + 1.4)]; }
    const i = 1 + Math.floor(rnd() * (WATER.river.length - 2)), R = WATER.river[i], side = rnd() < .5 ? 1 : -1, n = WATER.river[i + 1], tx = n[0] - R[0], tz = n[1] - R[1], l = Math.hypot(tx, tz) || 1;
    return [R[0] + (-tz / l) * side * (R[2] + 1.5), R[1] + (tx / l) * side * (R[2] + 1.5)];
  }
  if (hab === 'bridge' && WATER.zones.length) { const z = pick(WATER.zones); return off(z.x, z.z, 3.5); }
  if (hab === 'edge') { const a = rnd() * 6.283, r = 46 + rnd() * 10; return [Math.cos(a) * r, Math.sin(a) * r]; }
  return null;
}
/* [T21d] 聲音點會「走」：存活一段時間沒被收走就消失、換地方重生；調頻失敗（play 送 spotLost）也一樣，過幾秒在別處重生。間距、存活時間、重生延遲在 sound_spots.json（gap／life／relocDelay） */
const spotPost = (o, first) => { try { api('/spot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: o.sp.id, x: +o.x.toFixed(1), z: +o.z.toFixed(1), k: o.sp.k, type: o.sp.type, first: !!first }) }); } catch (e) {} };
function spotAdopt(list) {   /* P71：以伺服器的位置為準，所有手機和 Unity 看到同一批聲音點 */
  if (!list || !SPOT.list.length) return; const now = performance.now();
  list.forEach(s => { const o = spotGet(s.id); if (!o || (TUT.on && o.sp.id === TUT.id)) return; if (Math.hypot(o.x - s.x, o.z - s.z) > .8) { o.x = s.x; o.z = s.z; o.g.position.copy(U(s.x, 0, s.z)); o.shown = false; o.born = now; o.life = spotLife(); if (SPOT.nid === o.sp.id) SPOT.nid = ''; } });
}
function spotLife() { const l = (SPOT.cfg && SPOT.cfg.life) || [150, 240]; return (l[0] + Math.random() * (l[1] - l[0])) * 1000; }
function spotRelocate(o, now) {
  const C = SPOT.cfg || {}, L = SPOT.L; if (!L) return; const gap = (C.gap || 22) * .8, maxR = C.maxR || 75; let x = 0, z = 0, ok = false, generic = false;
  const far = (x, z) => SPOT.list.every(q => q === o || Math.hypot(q.x - x, q.z - z) > gap) && (!me || Math.hypot(me.x - x, me.z - z) > 25);
  for (let i = 0; i < 160 && !ok; i++) { const an = spotAnchor(o.sp.hab, L, Math.random); if (!an) break; x = an[0]; z = an[1]; ok = Math.hypot(x, z) <= maxR && spotFree(x, z) && !waterBlocked(x, z) && far(x, z); }
  for (let i = 0; i < 300 && !ok; i++) { const a = Math.random() * 6.283, r = 10 + Math.random() * (maxR - 14); x = Math.cos(a) * r; z = Math.sin(a) * r; ok = spotFree(x, z) && !waterBlocked(x, z) && far(x, z); generic = true; }
  if (!ok) { o.born = now; return; }
  o.x = x; o.z = z; o.g.position.copy(U(x, 0, z)); o.lost = false; o.shown = false; o.born = now; o.life = spotLife(); o.clue = generic ? '小鎮的某處有聲音' : (o.sp.clue || '');
  if (SPOT.nid === o.sp.id) SPOT.nid = '';
  spotPost(o, false);
}
function spotLost(id) { const o = spotGet(id); if (!o || o.got) return; o.lost = true; o.relocAt = performance.now() + (((SPOT.cfg && SPOT.cfg.relocDelay) || 10) * 1000); o.g.visible = false; o.shown = false; SPOT.nid = ''; post({ tunein: 'spotNear', on: false, id: '', type: '', k: '' }); }
function buildSpots(L) {
  SPOT.L = L; const C = SPOT.cfg; if (!C || !C.spots) return; const rnd = spotRng(C.seed || 1), COL = { env: 0xFFE59A, down: 0xB7E1D1, odd: 0xFFB5C1 };
  C.spots.forEach(sp => {
    let x = 0, z = 0, ok = false;
    for (let i = 0; i < 300 && !ok; i++) { const an = spotAnchor(sp.hab, L, rnd); if (!an) break; x = an[0]; z = an[1]; ok = Math.hypot(x, z) <= (C.maxR || 75) && spotFree(x, z) && !waterBlocked(x, z) && SPOT.list.every(o => Math.hypot(o.x - x, o.z - z) > (C.gap || 22)); }
    if (!ok) sp.clue = '小鎮的某處有聲音';   // 找不到符合的棲地（太遠、被擋住）就不亂給線索
    for (let i = 0; i < 400 && !ok; i++) { const a = rnd() * Math.PI * 2, r = 10 + rnd() * ((C.maxR || 75) - 14); x = Math.cos(a) * r; z = Math.sin(a) * r; ok = spotFree(x, z) && !waterBlocked(x, z) && SPOT.list.every(o => Math.hypot(o.x - x, o.z - z) > Math.max(12, (C.gap || 22) * .7)); }
    if (!ok) return;
    const g = new THREE.Group(), col = COL[sp.type] || 0xFFE59A, bm = (o, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    /* [T21b] 聲音小精靈：圓圓軟軟的小團子（淡色身體，沒有臉），會浮動；出現時彈出來，靠近會跳 */
    const pc = new THREE.Color(col).lerp(new THREE.Color(0xFFFFFF), .45), spr = new THREE.Group(); spr.position.y = 1.2; g.add(spr);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.42, 20, 16), new THREE.MeshBasicMaterial({ color: pc })); orb.scale.set(1, .9, 1); spr.add(orb);
    const dk = new THREE.MeshBasicMaterial({ color: 0x5A3E6B }), pk = new THREE.MeshBasicMaterial({ color: 0xFF9DB5, transparent: true, opacity: .75 });
    const eyes = new THREE.Group(); spr.add(eyes);   // 不畫臉（眼睛組留空，避免其他程式出錯）
    const nt = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: pc })); nt.position.set(0, .5, 0); spr.add(nt);   // 頭上一顆小呆毛
    const halo = new THREE.Mesh(new THREE.SphereGeometry(.85, 18, 14), bm(0, .22)); halo.position.y = 1.2; g.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .1, 6, 1, true), bm(0, 0)); beam.visible = false; g.add(beam);   // 光柱取消（太生硬）；保留欄位避免其他程式出錯
    const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .75, 40), bm(0, .8)); ring.rotation.x = -Math.PI / 2; ring.position.y = .07; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(.55, .7, 40), bm(0, .6)); ring2.rotation.x = -Math.PI / 2; ring2.position.y = .08; g.add(ring2);
    g.userData.spr = spr; g.userData.eyes = eyes;
    g.position.copy(U(x, 0, z)); g.visible = false; scene.add(g);
    SPOT.list.push({ sp, x, z, g, orb, halo, beam, ring, ring2, still: 0, got: !!SPOT.got[sp.id], born: performance.now(), life: spotLife(), clue: sp.clue || '' });
  });
  SPOT.list.forEach(o => spotPost(o, true));
}
const DET = { on: false, band: 0 };   // band＝聽法：0 平常聽（日常聲）／1 放慢聽（降頻聲）／2 變調聽（說不清的聲）；只聽得到目前聽法的聲音
const bandOf = o => /^down/.test(o.sp.k) ? 1 : /^odd/.test(o.sp.k) ? 2 : 0;   // 探測器：手機按下才開；開了才聽得到聲音點、看得到靠近的光圈
function spotGet(id) { return SPOT.list.find(o => o.sp.id === id); }
function spotSave() { try { localStorage.setItem('tunein.codex', JSON.stringify(SPOT.got)); } catch (e) {} }
function spotTake(id) {
  const o = spotGet(id); if (!o || o.got) return; o.got = true; o.tk = performance.now(); SPOT.got[id] = Date.now(); spotSave();
  post({ tunein: 'spotGot', id, n: Object.keys(SPOT.got).length, total: SPOT.list.length });
  try { api('/spotgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); } catch (e) {}
}
function spotReset() { SPOT.unl = {}; SPOT.got = {}; spotSave(); SPOT.list.forEach(o => { o.got = false; o.lost = false; o.born = performance.now(); }); SPOT.nid = ''; }
function spotFrame(now) {
  const C = SPOT.cfg; if (!C || !SPOT.list.length || !me) return; const R = C.radius || 3.5; let best = null;
  SPOT.list.forEach(o => {
    if (!spotAct(o)) { o.g.visible = false; o.shown = false; o.born = now; return; }
    if (o.lost) { if (now >= o.relocAt) spotRelocate(o, now); else { o.g.visible = false; return; } }
    else if (!o.got && !TUT.on && now - o.born > o.life && Math.hypot(o.x - me.x, o.z - me.z) > 30) spotRelocate(o, now);   /* 沒人收的聲音點：消失、換地方 */
    const d = Math.hypot(o.x - me.x, o.z - me.z), H = (C.hear || 14), tk = o.got && o.tk && (now - o.tk) < 1500, on0 = DET.on && !o.got && d < (o.shown ? H + 2.5 : H) && bandOf(o) === DET.band;
    if (on0) o.onT = now; const show = tk || on0 || (o.shown && o.onT && now - o.onT < 350);   /* P70：邊界遲滯＋離開後多留 0.35 秒，聲音點不會在範圍邊緣閃現 */
    o.g.visible = show; if (!show) { o.shown = false; return; }
    if (tk) {   /* [T21c] 收下的瞬間：小精靈縮成一顆金黃色種子，往上飄、消失（種子進口袋） */
      const t = (now - o.tk) / 1500, sp2 = o.g.userData.spr; sp2.scale.setScalar(1.45 * (1 - t * .72)); sp2.position.y = 1.2 + t * 1.8 + Math.sin(t * 22) * .05; o.g.userData.eyes.visible = t < .2;
      o.orb.material.color.lerp(new THREE.Color(0xE8C47A), .2); o.halo.material.opacity = .22 * (1 - t); o.ring.material.opacity = 0; o.ring2.material.opacity = 0; return; }
    const near = Math.max(0, Math.min(1, 1 - d / H)), pu = (now / 900 + o.x) % 1;
    if (!o.shown) { o.shown = true; o.t0 = now; } const age = (now - o.t0) / 1000, pop = age < .7 ? 1 + Math.sin(Math.min(1, age / .7) * Math.PI * 2.2) * Math.exp(-age * 4) * .6 - Math.exp(-age * 6) : 1;   // 彈出來：由小變大、彈兩下
    const spr = o.g.userData.spr, hop = d < R ? Math.abs(Math.sin(now / 260)) * .35 : 0;   // 靠近就開心地跳
    spr.position.y = 1.2 + Math.sin(now / 520 + o.x) * .12 + hop; spr.scale.setScalar(Math.max(.01, pop) * 1.45 * (1 + (d < R ? .12 : 0))); spr.scale.y *= 1 - hop * .12; spr.rotation.z = Math.sin(now / 700 + o.z) * .12;
    spr.rotation.y = Math.atan2(cam.position.x - o.g.position.x, cam.position.z - o.g.position.z); o.g.userData.eyes.scale.y = (now % 3200) < 140 ? .1 : 1;   // 面向鏡頭、偶爾眨眼
    o.halo.scale.setScalar(1 + Math.sin(now / 380 + o.z) * .12 + (d < R ? .4 : 0)); o.halo.material.opacity = .05 + near * .09;
    o.beam.material.opacity = .12 + near * .3; o.ring.scale.setScalar(1 + pu * 2.2); o.ring.material.opacity = (1 - pu) * .8; const p2 = (pu + .5) % 1; o.ring2.scale.setScalar(1 + p2 * 2.2); o.ring2.material.opacity = (1 - p2) * .6;
    if (d < R && (!best || d < best.d)) best = { d, id: o.sp.id, type: o.sp.type, k: o.sp.k };
  });
  const nid = DET.on && best ? best.id : ''; if (nid !== SPOT.nid) { SPOT.nid = nid; post({ tunein: 'spotNear', on: !!nid, id: nid, type: best ? best.type : '', k: best ? best.k : '' }); }
}
window.__spot = { SPOT, DET, TUT, WATER, waterDist, onBridge, waterBlocked, get me() { return me; } };
function sndSend() {
  const l = [];
  for (const k in plantObjs) { const q = plantObjs[k], key = sndKey(q.p.tr); if (!key) continue; const [wx, wz] = mapToWorld(q.p.x, q.p.y), d = Math.hypot(wx - me.x, wz - me.z), g = Math.pow(Math.max(0, 1 - d / 45), 2); if (g > .02) l.push({ id: +k, k: key, g: +g.toFixed(2), d }); }
  if (DET.on) {
    const H = (SPOT.cfg && SPOT.cfg.hear) || 14, fw = new THREE.Vector3(); cam.getWorldDirection(fw); const rx = -fw.z, rz = fw.x, rl = Math.hypot(rx, rz) || 1;
    SPOT.list.forEach(o => {
      if (o.got || !spotAct(o) || bandOf(o) !== DET.band) return; const dx = o.x - me.x, dz = -(o.z - me.z), d = Math.hypot(dx, dz), Ha = H * 1.7, tt = Math.max(0, 1 - d / Ha), g = tt > 0 ? .05 + 1.1 * tt * tt : 0; if (g <= .02) return;
      const pan = d < .5 ? 0 : Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / rl) / d));
      l.push({ id: 'sp_' + o.sp.id, k: o.sp.k, g: +g.toFixed(2), d, pan: +pan.toFixed(2), lp: Math.round(500 + Math.max(0, 1 - d / H) * 9000) });
    });
  }
  if (DET.on) {   // 探測器提示：最近那個還沒收的聲音點，方向（相對鏡頭，右為正）與距離
    let nb = null; const fw2 = new THREE.Vector3(); cam.getWorldDirection(fw2); const rx2 = -fw2.z, rz2 = fw2.x;
    SPOT.list.forEach(o => { if (o.got || !spotAct(o) || bandOf(o) !== DET.band) return; const dx = o.x - me.x, dz = -(o.z - me.z), d = Math.hypot(dx, dz); if (!nb || d < nb.d) nb = { d, clue: o.clue || o.sp.clue || '', ang: Math.atan2(dx * rx2 + dz * rz2, dx * fw2.x + dz * fw2.z) }; });
    post({ tunein: 'detInfo', bn: [0, 1, 2].map(b => SPOT.list.filter(o => !o.got && spotAct(o) && bandOf(o) === b).length), locked: TUT.on ? 0 : SPOT.list.filter(o => !o.got && o.sp.gate && !SPOT.unl[o.sp.gate]).length, left: SPOT.list.filter(o => !o.got && spotAct(o)).length, d: nb ? Math.round(nb.d) : -1, ang: nb ? +nb.ang.toFixed(2) : 0, clue: nb ? nb.clue : '' });
  }
  l.sort((a, b) => a.d - b.d); post({ tunein: 'snd', list: l.slice(0, 8).map(({ id, k, g, pan, lp }) => pan !== undefined ? { id, k, g, pan, lp } : { id, k, g }) });
}
addEventListener('message', e => { const d = e.data; if (!d) return; if (d.tunein === 'det') { DET.on = !!d.on; if (!DET.on) SPOT.list.forEach(o => { o.g.visible = false; }); sndSend(); } if (d.tunein === 'band') { DET.band = d.v | 0; SPOT.list.forEach(o => { o.g.visible = false; o.shown = false; }); sndSend(); } if (d.tunein === 'spotTake') spotTake(d.id); if (d.tunein === 'spotLost') spotLost(d.id); if (d.tunein === 'unlock') { SPOT.unl = {}; (d.ids || []).forEach(k => { SPOT.unl[k] = 1; }); }
  if (d.tunein === 'birdMark') { BMARK.on = !!d.on; if (!BMARK.on && BIRD_LBL && BIRD_LBL.userData.until === Infinity) BIRD_LBL.visible = false; return; } if (d.tunein === 'appearGo') { appearGo = true; ownTryAppear(); return; } if (d.tunein === 'tut') { if (d.on) { appearGo = true; ownTryAppear(); if (!spawned) return; tutStart(); } else TUT.on = false; post({ tunein: 'tutState', on: TUT.on }); } });

/* ═════════ [T11] 小鳥事件（Unity BirdArrival）：種下「鳥叫」→ 鏡頭切到降落點、星星特效、兩隻小鳥飛下來 ═════════ */
const BIRD_HOME = { x: 1.84, z: .2 };   // Bird_Fin 在場景裡的位置（朝向 180°）
const B = { partner: null, flock: [], t0: 0, phase: 0, stars: [], done: false };
function starTex() {
  const cols = ['#FA96CD', '#BAE6FD', '#FEF3C9'], out = [];
  cols.forEach(col => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.translate(128, 128);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128); [[0, .6], [.25, .32], [.5, .13], [.75, .03], [1, 0]].forEach(s => gr.addColorStop(s[0], 'rgba(' + parseInt(col.slice(1, 3), 16) + ',' + parseInt(col.slice(3, 5), 16) + ',' + parseInt(col.slice(5, 7), 16) + ',' + s[1] + ')'));
    g.fillStyle = gr; g.fillRect(-128, -128, 256, 256);
    const path = () => { g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 29 : 57, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.lineJoin = 'round'; };
    path(); g.lineWidth = 35; g.strokeStyle = '#F26DB5'; g.stroke(); g.fillStyle = '#F26DB5'; g.fill();
    path(); g.lineWidth = 20; g.strokeStyle = col; g.stroke(); g.fillStyle = col; g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; out.push(t);
  });
  return out;
}
let STAR_T = null;
function buildBirds() {
  if (!M.bird1) return; const p = actor('bird1'); p.add(shadowDisc(.5)); p.position.copy(U(BIRD_HOME.x, 0, BIRD_HOME.z)); p.rotation.y = 0; scene.add(p); B.partner = p; colliders.push({ x: BIRD_HOME.x, z: BIRD_HOME.z, r: .6 });
}
function birdSpawn(side) { const b = actor('bird2'); b.add(shadowDisc(.45)); b.visible = false; scene.add(b); const u = b.userData; if (u.acts.clip) { u.acts.clip.setLoop(THREE.LoopOnce, 1); u.acts.clip.clampWhenFinished = true; } return { obj: b, side }; }
function birdTrigger(mine) {
  if (B.done || !M.bird2) return; B.done = true; B.t0 = performance.now(); B.phase = 1; STAR_T = STAR_T || starTex();
  B.flock.forEach(f => scene.remove(f.obj)); B.flock = [birdSpawn(-1), birdSpawn(1)];
  if (mine) {
    const dx = me.x - BIRD_HOME.x, dz = me.z - BIRD_HOME.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, px = -uz, pz = ux;
    let cx = BIRD_HOME.x + ux * 5 + px * 6.5, cz = BIRD_HOME.z + uz * 5 + pz * 6.5;
    if (!spotFree(cx, cz)) { cx = BIRD_HOME.x + ux * 5 - px * 6.5; cz = BIRD_HOME.z + uz * 5 - pz * 6.5; }
    if (!spotFree(cx, cz)) { cx = BIRD_HOME.x + ux * 6; cz = BIRD_HOME.z + uz * 6; }
    shot = { p: U(cx, 2.8, cz), l: U(BIRD_HOME.x, 1.2, BIRD_HOME.z), cine: true, until: B.t0 + 1300 + 2400 + 1000 + 2400 + 1800 };
    birdLabel(shot.until);
  }
}
const BMARK = { on: false, t: 0, vis: null };
function birdMarkFrame(now) {
  if (!BMARK.on || cineOn || !me) return;
  if (!BIRD_LBL) birdLabel(Infinity);
  BIRD_LBL.visible = true; BIRD_LBL.userData.until = Infinity;
  const p = U(BIRD_HOME.x, 2.3, BIRD_HOME.z); BIRD_LBL.position.copy(p);
  const dist = Math.hypot(me.x - BIRD_HOME.x, me.z - BIRD_HOME.z), k = Math.min(4.4, Math.max(1.8, dist * .16)); BIRD_LBL.scale.set(k, k * .3, 1);
  if (now - BMARK.t < 150) return; BMARK.t = now;
  cam.updateMatrixWorld(); const rel = p.clone().applyMatrix4(cam.matrixWorldInverse), v = p.clone().project(cam);
  const vis = rel.z < 0 && Math.abs(v.x) < .85 && Math.abs(v.y) < .85;
  post({ tunein: 'birdDir', vis, side: rel.x >= 0 ? 'r' : 'l', dist: Math.round(dist) });
}
let BIRD_LBL = null;
function birdLabel(until) {
  if (!BIRD_LBL) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.96)'; g.strokeStyle = '#3E2A5A'; g.lineWidth = 5; g.beginPath(); g.roundRect(6, 6, 308, 62, 31); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(144, 68); g.lineTo(160, 90); g.lineTo(176, 68); g.closePath(); g.fillStyle = 'rgba(255,255,255,.96)'; g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.96)'; g.fillRect(150, 62, 20, 8);
    g.fillStyle = '#3E2A5A'; g.font = '700 32px "Noto Sans TC",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('小鳥在這裡', 160, 38);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    BIRD_LBL = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); BIRD_LBL.scale.set(2.2, .66, 1); BIRD_LBL.renderOrder = 14; scene.add(BIRD_LBL);
  }
  BIRD_LBL.position.copy(U(BIRD_HOME.x, 2.9, BIRD_HOME.z)); BIRD_LBL.visible = true; BIRD_LBL.userData.until = until;
}
function birdFx(now) {
  if (BIRD_LBL && BIRD_LBL.visible && now > BIRD_LBL.userData.until) BIRD_LBL.visible = false;
  if (!B.phase) return; const t = (now - B.t0) / 1000;
  if (B.phase === 1 && t > 1.3) {   // 星星環
    B.phase = 2; post({ tunein: 'snd', ev: 'bird' });
    for (let i = 0; i < 15; i++) { const big = i < 7, ci = big ? i % 3 : (Math.random() * 3) | 0, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: STAR_T[ci], transparent: true, depthTest: false })), a = Math.random() * 6.283, life = 2.4 * (.85 + Math.random() * .15); s.renderOrder = 12;
      s.userData = { a, big, d: big ? 0 : .14, life, r0: Math.sqrt(Math.random()) * .9, sp: 3.83 * (.3 + Math.random() * .9), sz: big ? .76 + Math.random() * .33 : .29 + Math.random() * .21, rot0: (Math.random() - .5) * .7, w: (Math.random() - .5) * 1.6 }; s.visible = false; scene.add(s); B.stars.push(s); }
  }
  if (B.phase >= 2) {
    const fp = U(BIRD_HOME.x, 0, BIRD_HOME.z), fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize(), ts = t - 1.3;
    const SZC = [[0, 0], [.12, 1.4], [.26, 1], [.4, 1.12], [.52, .96], [.75, 1], [1, .7]], szAt = k => { for (let j = 1; j < SZC.length; j++) if (k <= SZC[j][0]) { const a = SZC[j - 1], b = SZC[j]; return a[1] + (b[1] - a[1]) * (k - a[0]) / (b[0] - a[0]); } return .7; };
    const DK = k => k <= .35 ? 1.4 * k - 1.2143 * k * k : .3412 + .55 * (k - .35) - .3308 * (k - .35) * (k - .35);
    B.stars.forEach(s => { const u = s.userData, tt = ts - u.d, k = tt / u.life; if (k <= 0 || k >= 1) { s.visible = false; return; } s.visible = true;
      const r = u.r0 + u.sp * u.life * DK(k), up = .589 * tt * tt;
      s.position.copy(fp).addScaledVector(right, Math.cos(u.a) * r).add(new THREE.Vector3(0, 2 + Math.sin(u.a) * r + up, 0)); s.scale.setScalar(Math.max(.01, u.sz * 2.7 * szAt(k))); s.material.rotation = u.rot0 + u.w * tt; s.material.opacity = k < .45 ? 1 : 1 - (k - .45) / .55; });
  }
  if (B.phase === 2 && t > 2.3) { B.phase = 3; B.flock.forEach((f, i) => { f.t0 = now + i * 300; f.sx = BIRD_HOME.x + f.side * 4; f.sz = BIRD_HOME.z - 1; f.ex = BIRD_HOME.x + f.side * 1.4; f.ez = BIRD_HOME.z - .6; const a = f.obj.userData.acts.clip; if (a) a.reset().play(); }); }
  if (B.phase === 3) {
    let all = true;
    B.flock.forEach(f => { const k = (now - f.t0) / 2400; if (k < 0) { all = false; return; } f.obj.visible = true; const e = Math.min(1, k), ease = 1 - Math.pow(1 - e, 2);
      const x = f.sx + (f.ex - f.sx) * ease, z = f.sz + (f.ez - f.sz) * ease, y = 6 * (1 - ease) * (1 - ease); f.obj.position.copy(U(x, y, z)); f.obj.rotation.y = Math.PI - Math.atan2(f.ex - f.sx, f.ez - f.sz);
      if (k < 1) all = false; else if (!f.landed) { f.landed = true; const a = f.obj.userData.acts; if (a.clip) a.clip.stop(); if (a.idle) a.idle.reset().play(); f.obj.userData.cur = 'idle'; f.obj.position.y = 0; f.obj.rotation.y = Math.PI; } });
    if (all) { B.phase = 4; B.tEnd = now; }
  }
  if (B.phase === 4 && now - B.tEnd > 3000) { B.phase = 0; B.stars.forEach(s => scene.remove(s)); B.stars = []; }
}
B.reset = () => { B.done = false; B.phase = 0; B.stars.forEach(s => scene.remove(s)); B.stars = []; B.flock.forEach(f => scene.remove(f.obj)); B.flock = []; shot = null; if (BIRD_LBL) BIRD_LBL.visible = false; };

/* ═════════ [T12] 太陽雨（Unity TownReactions）：白色短雨絲、輕微斜、落地冒水波圈，天色不變暗 ═════════ */
const RAIN = { on: false, t0: 0, mesh: null, rings: [], ri: 0 };
function buildRain() {
  const N = 900, pos = new Float32Array(N * 12), cor = new Float32Array(N * 8), idx = new Uint16Array(N * 6), rnd = Math.random;
  for (let i = 0; i < N; i++) { const bx = (rnd() - .5) * 30, by = rnd() * 12, bz = (rnd() - .5) * 30, sp = 1 + rnd() * .5; for (let k = 0; k < 4; k++) pos.set([bx, by, bz], i * 12 + k * 3); cor.set([-1, 0, 1, 0, -1, sp, 1, sp], i * 8); const v = i * 4; idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('corner', new THREE.BufferAttribute(cor, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uA: { value: 0 } },
    vertexShader: `uniform float uT; uniform vec3 uC; attribute vec2 corner; varying float vA;
      void main(){ vec3 b = position; float y = mod(b.y - uT * 11. * max(corner.y, 1.), 12.); vec2 xz = b.xz + vec2(.25, .1) * (12. - y) * .25; xz = mod(xz - uC.xz + 15., 30.) - 15.;
        vec3 p = vec3(uC.x + xz.x, y, uC.z + xz.y); vec3 dir = normalize(vec3(.22, -1., .08)); vec3 cv = normalize(p - cameraPosition); vec3 r = normalize(cross(dir, cv));
        float up = corner.y > .5 ? 1. : 0.; p += -dir * up * .55 + r * corner.x * .011; float dc = distance(p, cameraPosition); vA = smoothstep(0., 1.5, y) * smoothstep(3., 7., dc) * (1. - smoothstep(16., 26., dc));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`,
    fragmentShader: `uniform float uA; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.), .85 * vA * uA); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 9; scene.add(mesh); RAIN.mesh = mesh;
  const rg = new THREE.RingGeometry(.82, 1, 24); rg.rotateX(-Math.PI / 2);
  for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false })); r.visible = false; r.renderOrder = 8; scene.add(r); RAIN.rings.push({ m: r, t: -1 }); }
}
function rainTrigger() { if (!RAIN.mesh) return; RAIN.on = true; RAIN.t0 = performance.now(); RAIN.mesh.visible = true; post({ tunein: 'snd', ev: 'rain', on: true }); }
/* [W03] 天氣（伺服器給 kind：clear／partly／cloud／fog／rain／wind＋lv 強度）：每種天氣各有自己的光線、天空、色調與動態，數值慢慢漸變。測試：town3d.html?wx=rain&lv=1 */
const WX_BASE = { sun: SUN_COL.clone(), ambU: UN.uAmbU.value.clone(), ambM: UN.uAmbM.value.clone(), ambD: UN.uAmbD.value.clone() };
const WX_PROF = {   // dim 變暗／sat 飽和度／tint 色偏／lift 霧白／sun 太陽強度(倍)／amb 環境光(倍)／cl 雲量門檻(越低雲越多)／wind 風／rain 雨／fog 霧罩／cs 雲速
  clear:  { dim: .1,  sat: 1,   tint: [1, 1, 1],         lift: 0,   sun: 1,    amb: 1,    cl: .66, wind: .1,  rain: 0, fog: 0, cs: 1, top: C(.361, .678, .922), mid: C(.725, .867, .933), hor: C(.894, .945, .937) },
  partly: { dim: .2,  sat: 1.02, tint: [1, 1, 1],        lift: .02, sun: .8,   amb: 1.04, cl: .5,  wind: .2,  rain: 0, fog: 0, cs: 1.6, top: C(.42, .66, .88), mid: C(.74, .85, .91), hor: C(.88, .93, .93) },
  cloud:  { dim: .35, sat: .75, tint: [-.03, -.01, .02], lift: .08, sun: .45,  amb: 1.12, cl: .34, wind: .15, rain: 0, fog: 0, cs: 1, top: C(.58, .65, .72), mid: C(.74, .79, .83), hor: C(.84, .87, .88) },
  fog:    { dim: .2,  sat: .55, tint: [0, .01, .02],     lift: .3,  sun: .35,  amb: 1.2,  cl: .3,  wind: 0,   rain: 0, fog: 1, cs: .4, top: C(.76, .81, .83), mid: C(.83, .87, .88), hor: C(.9, .93, .93) },
  rain:   { dim: .55, sat: .68, tint: [-.12, -.05, .08], lift: .05, sun: .28,  amb: .95,  cl: .3,  wind: .45, rain: 1, fog: 0, cs: 2, top: C(.4, .47, .56), mid: C(.55, .62, .68), hor: C(.7, .76, .79) },
  wind:   { dim: .1,  sat: 1.12, tint: [-.01, .02, .04], lift: 0,   sun: 1.1,  amb: 1,    cl: .6,  wind: 1,   rain: 0, fog: 0, cs: 5, top: C(.3, .64, .95), mid: C(.68, .86, .95), hor: C(.86, .94, .95) }
};
const WEA = { kind: 'clear', lv: 1, snd: false, cx: 0, cur: null, tgt: null };
function wxTarget(k, lv) {   // 強度 lv 調整：雨越大越暗越灰、風越強雲越快
  const t = Object.assign({}, WX_PROF[k] || WX_PROF.clear); lv = Math.max(.2, Math.min(1, lv || 1));
  if (k === 'rain') { t.rain = lv; t.dim = .35 + .3 * lv; t.sun = .4 - .15 * lv; t.sat = .8 - .15 * lv; }
  if (k === 'wind') { t.wind = .5 + .5 * lv; t.cs = 2 + 4 * lv; }
  return t;
}
{ const p = WX_PROF.clear; WEA.cur = { dim: p.dim, sat: p.sat, lift: p.lift, sun: p.sun, amb: p.amb, cl: p.cl, wind: p.wind, rain: 0, fog: 0, cs: p.cs, tint: p.tint.slice(), top: p.top.clone(), mid: p.mid.clone(), hor: p.hor.clone() }; WEA.tgt = wxTarget('clear', 1); }
const wxFogEl = document.createElement('div');   // 霧：畫面中段一層淡白霧帶（沒有深度資料，用畫面疊色近似）
wxFogEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:3;background:linear-gradient(to bottom,rgba(232,238,238,.5) 0%,rgba(232,238,238,.12) 28%,rgba(232,238,238,.72) 50%,rgba(232,238,238,.28) 74%,rgba(232,238,238,.1) 100%)';
document.body.appendChild(wxFogEl);
function weatherSet(k, lv) { if (!WX_PROF[k]) return; WEA.kind = k; WEA.lv = lv || 1; WEA.tgt = wxTarget(k, WEA.lv); }
function weatherFx(dt) {
  const c = WEA.cur, t = WEA.tgt, s = Math.min(1, dt * .5), f = (a, b) => a + (b - a) * s;
  ['dim', 'sat', 'lift', 'sun', 'amb', 'cl', 'wind', 'rain', 'fog', 'cs'].forEach(k => { c[k] = f(c[k], t[k]); });
  for (let i = 0; i < 3; i++) c.tint[i] = f(c.tint[i], t.tint[i]);
  c.top.lerp(t.top, s); c.mid.lerp(t.mid, s); c.hor.lerp(t.hor, s);
  UN.uWxDim.value = c.dim; UN.uWxSat.value = c.sat - 1; UN.uWxLift.value = c.lift; UN.uWxTint.value.set(c.tint[0], c.tint[1], c.tint[2]); UN.uCl.value = c.cl; UN.uWind.value = c.wind;
  SKY_TOP.copy(c.top); SKY_MID.copy(c.mid); HOR.copy(c.hor);
  SUN_COL.copy(WX_BASE.sun).multiplyScalar(c.sun); sun.intensity = Math.max(.15, c.sun);
  UN.uAmbU.value.copy(WX_BASE.ambU).multiplyScalar(c.amb); UN.uAmbM.value.copy(WX_BASE.ambM).multiplyScalar(c.amb); UN.uAmbD.value.copy(WX_BASE.ambD).multiplyScalar(c.amb);
  wxFogEl.style.opacity = (c.fog * .85).toFixed(3); WEA.cx += dt * c.cs;
}
function weatherRain(now, u) {
  if (RAIN.on) { WEA.snd = false; return; }
  const r = WEA.cur.rain;
  if (r > .02) {
    RAIN.mesh.visible = true; u.uA.value = r * .75;
    if (!WEA.snd) { WEA.snd = true; post({ tunein: 'snd', ev: 'rain', on: true }); }
    if (Math.random() < .15 + .3 * r) { const g = RAIN.rings[RAIN.ri++ % RAIN.rings.length]; g.t = now; g.m.position.set(me.obj.position.x + (Math.random() - .5) * 18, .06, me.obj.position.z + (Math.random() - .5) * 18); g.m.visible = true; }
  } else { if (WEA.snd) { WEA.snd = false; post({ tunein: 'snd', ev: 'rain', on: false }); } if (RAIN.mesh.visible) RAIN.mesh.visible = false; }
}
addEventListener('message', e => { const d = e.data; if (d && d.tunein === 'weather') weatherSet(d.kind, +d.lv || 1); });
{ const qp = new URLSearchParams(location.search), q = qp.get('wx'); if (q) weatherSet(q, +qp.get('lv') || 1); }
function rainFx(now) {
  if (!RAIN.mesh) return; const u = RAIN.mesh.material.uniforms; u.uT.value = now / 1000; u.uC.value.set(me.obj.position.x, 0, me.obj.position.z);
  weatherRain(now, u);
  if (RAIN.on) { const t = (now - RAIN.t0) / 1000; u.uA.value = Math.max(0, Math.min(1, t / 1.5) * Math.min(1, (14 - t) / 2)); if (t > 14) { RAIN.on = false; RAIN.mesh.visible = false; post({ tunein: 'snd', ev: 'rain', on: false }); }
    if (Math.random() < .5) { const r = RAIN.rings[RAIN.ri++ % RAIN.rings.length]; r.t = now; r.m.position.set(me.obj.position.x + (Math.random() - .5) * 18, .06, me.obj.position.z + (Math.random() - .5) * 18); r.m.visible = true; } }
  RAIN.rings.forEach(r => { if (r.t < 0) return; const k = (now - r.t) / 700; if (k >= 1) { r.t = -1; r.m.visible = false; return; } r.m.scale.setScalar(.2 + k * .8); r.m.material.opacity = .7 * (1 - k); });
}
/* ═════════ [T13] Ping 出現特效：彈出＋地面波圈＋光柱＋往上飄的亮點（和 Unity 的 PingAppearFx 一致） ═════════ */
const APPEAR = [];
let apGeo = null;
function otherAppear(o, at) { const dl = at - srvNow(); if (dl > -(SPIN.total + 3.4) * 1000) pingAppear(o.obj, dl); }   // 別人的 Ping：照伺服器約好的時間落下；早就出現過就直接站著
let appearAsked = false;
const GATE = /[?&]gate=1/.test(location.search); let appearGo = !GATE;   /* 手機頁嵌入時：玩家按完第一個教學按鈕才讓 Ping 出現 */
function ownTryAppear() {   // 我的 Ping：位置到了＋畫面準備好 → 向伺服器要「出現時間」，網頁與 Unity 同一刻開始（重新整理回來拿到舊時間 → 不重播）
  if (meAppeared || appearAsked || !appearGo || !spawned || !PID || !readySent) return; appearAsked = true;
  api('/appear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid: PID }) }).then(r => {
    meAppeared = true; let dl = 300; if (r && r.at) { dl = r.at - r.now; SRVOFF = r.now - Date.now(); }
    if (dl < -(SPIN.total + 3.4) * 1000) { me.obj.scale.setScalar(1); return; }
    pingAppear(me.obj, dl);
  });
}
function pingAppear(obj, delay) {
  if (!obj) return;
  if (!apGeo) {   // 柔軟圓形光點貼圖：和 Unity PingAppearFx.GlowTex 同公式（透明度 = (1-距離)^2.2，邊緣漸隱）
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), im = x.createImageData(64, 64);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const d = Math.hypot(i - 32, j - 32) / 32, p = (j * 64 + i) * 4; im.data[p] = im.data[p + 1] = im.data[p + 2] = 255; im.data[p + 3] = d >= 1 ? 0 : Math.round(255 * Math.pow(1 - d, 2.2)); }
    x.putImageData(im, 0, 0);
    apGeo = { tex: new THREE.CanvasTexture(c) }; apGeo.tex.colorSpace = THREE.SRGBColorSpace;
  }
  const grp = new THREE.Group(), gems = [], cA = new THREE.Color('#FFFFFF'), cB = new THREE.Color('#FFE699');   // 顏色在白色與暖黃之間隨機（Unity: sparkA / sparkB）
  for (let i = 0; i < AP.count; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: apGeo.tex, color: cA.clone().lerp(cB, Math.random()), transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending })); m.renderOrder = 9;
    // 球殼分布（Unity Shape=Sphere、半徑1、厚度.35）：方向均勻、半徑在 0.65~1 之間（依體積取樣）
    const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), r0 = 1 - AP.thick, r = Math.cbrt(r0 * r0 * r0 + Math.random() * (1 - r0 * r0 * r0)) * AP.radius;
    const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th), sp = AP.spd[0] + Math.random() * (AP.spd[1] - AP.spd[0]);
    m.userData = { x: dx * r, y: AP.cy + dy * r, z: dz * r,
      vx: dx * sp + (Math.random() * 2 - 1) * AP.wind, vy: dy * sp + AP.up[0] + Math.random() * (AP.up[1] - AP.up[0]), vz: dz * sp + (Math.random() * 2 - 1) * AP.wind,
      life: AP.life[0] + Math.random() * (AP.life[1] - AP.life[0]), s: AP.size[0] + Math.random() * (AP.size[1] - AP.size[0]) };
    gems.push(m); grp.add(m);
  }
  scene.add(grp); obj.scale.setScalar(.001);
  APPEAR.push({ obj, grp, dots: gems, t0: performance.now() + (delay || 0), snd: false });
  if (me && obj === me.obj) me.lockUntil = performance.now() + (delay || 0) + SPIN.total * 1000 + 100;   // 出現動作中不能移動（Unity 也鎖）
}
/* Ping 出現的光點參數：和 Unity PingAppearFx.MakeSparks 逐項相同（要調兩邊一起改） */
const AP = { count: 26, radius: 1.0, thick: .35, cy: 1.1, spd: [.05, .25], wind: .15, up: [.15, .45], grav: .04 * 9.81, life: [2, 2.8], size: [.25, .6] };
/* 出現動作（和 Unity PingSpin 同一套，要改兩邊一起改）：從 3.1 公尺高直直落下 0.5 秒（重力，越落越快）→ 落地壓一下 0.3 秒（光點＋叮聲）→ 原地轉一圈 1.0 秒；共 1.8 秒，期間不能移動。開始時間由伺服器 /appear 的 at 決定，網頁和 Unity 同一刻開始 */
const SPIN = { drop: .5, hold: .3, spin: 1.0, h: 3.1 };
SPIN.total = SPIN.drop + SPIN.hold + SPIN.spin;
let SRVOFF = 0; const srvNow = () => Date.now() + SRVOFF;   // 伺服器時間 ≈ 本機時間 + SRVOFF（每次 /state 與 /appear 更新）
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function appearFx(now) {
  for (let i = APPEAR.length - 1; i >= 0; i--) {
    const a = APPEAR[i], t = a.fz != null ? a.fz : (now - a.t0) / 1000, ts = t - SPIN.drop;   // ts＝落地後的秒數（光點從落地開始）
    if (t < 0) { a.obj.scale.setScalar(.001); continue; }
    const o = a.obj; if (a.base == null) a.base = o.rotation.y; const base = (me && o === me.obj) ? o.rotation.y : a.base; let rot = base, dy = 0, sx = 1, sy = 1;
    if (t < SPIN.drop) { const u = t / SPIN.drop; dy = SPIN.h * (1 - u * u); }                                                        // 直直落下（重力）
    else if (t < SPIN.drop + SPIN.hold) { const u = (t - SPIN.drop) / SPIN.hold, sq = Math.sin(u * Math.PI) * .1; sx = 1 + sq; sy = 1 - sq * 1.6; }   // 落地壓一下
    else if (t < SPIN.total) rot = base + Math.PI * 2 * smooth((t - SPIN.drop - SPIN.hold) / SPIN.spin);                              // 原地轉一圈
    o.rotation.y = t >= SPIN.total ? base : rot; o.position.y += dy; o.scale.set(sx, sy, sx);
    if (!a.snd && ts >= 0) { a.snd = true; a.grp.position.copy(o.position); a.grp.position.y -= dy; post({ tunein: 'snd', ev: 'appear' }); }   // 光點留在落地的位置（Unity 是世界座標模擬，不跟著 Ping 走）
    a.dots.forEach(d => { const u = d.userData, q = ts / u.life; if (ts < 0 || q > 1) { d.material.opacity = 0; return; }
      d.position.set(u.x + u.vx * ts, u.y + u.vy * ts + .5 * AP.grav * ts * ts, u.z + u.vz * ts);   // 往外飄＋隨機橫風＋輕微上浮
      const sz = q < .2 ? q / .2 : q < .7 ? 1 - .1 * (q - .2) / .5 : .9 * (1 - q) / .3;          // 大小曲線：0 → 1 → .9 → 0
      d.scale.setScalar(u.s * sz);
      d.material.opacity = q < .15 ? q / .15 : q < .7 ? 1 : (1 - q) / .3; });                    // 透明度：淡入 → 維持 → 淡出
    if (ts > 3.3) { o.scale.setScalar(1); scene.remove(a.grp); a.dots.forEach(m => m.material.dispose()); APPEAR.splice(i, 1); }
  }
}
let cineOn = false;
function fxFrame(now, dt) {
  { const cn = !!(shot && shot.cine && now < shot.until); if (cn !== cineOn) { cineOn = cn; post({ tunein: 'cine', on: cn }); } }
  birdMarkFrame(now); birdFx(now); rainFx(now); appearFx(now); if (appearGo && !appearAsked && !meAppeared) ownTryAppear();
  if (B.partner && B.partner.userData.mixer) B.partner.userData.mixer.update(dt);
  B.flock.forEach(f => f.obj.userData.mixer.update(dt));
}
/* 新種下的花 → 觸發事件（剛打開頁面時已存在的花不觸發；新的一輪＝花變少，事件重置） */
let seenPlants = null, lastN = 0;
function plantEvents(list) {
  if (seenPlants === null) { seenPlants = new Set(list.map(p => p.id)); lastN = list.length; return; }
  if (list.length < lastN) B.reset();
  lastN = list.length;
  list.forEach(p => { if (seenPlants.has(p.id)) return; seenPlants.add(p.id); const tr = String(p.tr || ''); if (/鳥/.test(tr)) birdTrigger(p.pid === PID); if (/雨/.test(tr)) rainTrigger(); });
}

/* ═════════ [T14] 我的 Ping、其他玩家 ═════════ */
let me = null; const others = {}, plantObjs = {};
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

/* ═════════ [T15] 輸入：play.html 的方向鍵用 postMessage 傳進來；電腦測試可用方向鍵 ═════════ */
const ctl = { fwd: 0, turn: 0 };
addEventListener('message', e => { const d = e.data; if (d && d.tunein === 'ctl') { ctl.fwd = +d.fwd || 0; ctl.turn = +d.turn || 0; CTLDBG.n++; if (ctl.fwd || ctl.turn) CTLDBG.hit = performance.now(); } });
const CTLDBG = { n: 0, hit: 0, last: '' };   /* 除錯用：記收到方向訊息幾次；網址有 debug=1 時，手機頁會顯示小鎮目前的狀態 */
const held = {};
addEventListener('keydown', e => { held[e.key] = 1; }); addEventListener('keyup', e => { held[e.key] = 0; });
function keyCtl() { const f = (held.ArrowUp || held.w ? 1 : 0) - (held.ArrowDown || held.s ? 1 : 0), t = (held.ArrowRight || held.d ? 1 : 0) - (held.ArrowLeft || held.a ? 1 : 0); return [f, t]; }

/* 【除錯】顯示碰撞框：網址加 ?dbg=1，或按鍵盤 C（紅圈＝圓形、紅框＝方形）。要加／調碰撞框就看這個畫面 */
let colDbg = null; window.__col = { colliders, boxes };
function toggleColliders(on) {
  if (colDbg) { scene.remove(colDbg); colDbg = null; } if (!on) return;
  colDbg = new THREE.Group(); const mt = new THREE.LineBasicMaterial({ color: 0xff3366, depthTest: false, transparent: true }), ln = pts => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mt); l.renderOrder = 20; colDbg.add(l); };
  colliders.forEach(c => { const p = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.2832; p.push(new THREE.Vector3(c.x + Math.cos(a) * c.r, .2, -(c.z + Math.sin(a) * c.r))); } ln(p); });
  boxes.forEach(b => ln([[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1], [b.x0, b.z0]].map(q => new THREE.Vector3(q[0], .2, -q[1]))));
  scene.add(colDbg);
}
addEventListener('keydown', e => { if (e.key === 'c' || e.key === 'C') toggleColliders(!colDbg); });
if (new URLSearchParams(location.search).get('dbg') === '1') setTimeout(() => toggleColliders(true), 4000);

/* ═════════ [T16] 移動（碰撞：圓形擋住樹、長椅、石頭、NPC、Blip；方形擋住房子；邊界） ═════════ */
const PR = .5;
function pushOutSpawn() {   /* 出現點保險：萬一伺服器給的位置落在樹／房子／石頭裡，把 Ping 推到旁邊空地（伺服器新版已會避開，這是舊版或固定點的保險） */
  for (let k = 0; k < 6; k++) {
    for (const c of colliders) { const dx = me.x - c.x, dz = me.z - c.z, rr = c.r + PR + .3, d2 = dx * dx + dz * dz; if (d2 < rr * rr) { const d = Math.sqrt(d2); if (d > 1e-3) { me.x = c.x + dx / d * rr; me.z = c.z + dz / d * rr; } else me.x = c.x + rr; } }
    for (const b of boxes) { const m = PR + .3; if (me.x > b.x0 - m && me.x < b.x1 + m && me.z > b.z0 - m && me.z < b.z1 + m) { const l = me.x - (b.x0 - m), r = (b.x1 + m) - me.x, t = me.z - (b.z0 - m), u = (b.z1 + m) - me.z, mn = Math.min(l, r, t, u); if (mn === l) me.x = b.x0 - m; else if (mn === r) me.x = b.x1 + m; else if (mn === t) me.z = b.z0 - m; else me.z = b.z1 + m; } }
  }
}
function step(dt) {
  if (typeof TK !== 'undefined' && TK.on) { me.moving = false; return; }
  const [kf, kt] = keyCtl(), f = ctl.fwd || kf, t = ctl.turn || kt;
  me.yaw += t * (CFG.turnDeg * Math.PI / 180) * dt;
  const sp = f > 0 ? CFG.walkSpeed : f < 0 ? CFG.backSpeed : 0;
  if (sp) {
    let nx = me.x + Math.sin(me.yaw) * sp * Math.sign(f) * dt, nz = me.z + Math.cos(me.yaw) * sp * Math.sign(f) * dt;
    const dyn = BLIP && BLIP.init && BLIP.obj.visible ? [{ x: BLIP.x, z: BLIP.z, r: CFG.blipR }] : [];   // Blip 會走動：臨時的圓形碰撞框
    for (let pass = 0; pass < 2; pass++) {   // 跑兩輪：被一個推開後又撞到旁邊另一個時，也不會穿進去
    for (const c of colliders.concat(dyn)) { const dx = nx - c.x, dz = nz - c.z, rr = c.r + PR, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); nx = c.x + dx / d * rr; nz = c.z + dz / d * rr; } }
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(b.x1, nx)), cz = Math.max(b.z0, Math.min(b.z1, nz)), dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) { if (d2 < PR * PR) { const d = Math.sqrt(d2); nx = cx + dx / d * PR; nz = cz + dz / d * PR; } }
      else { const l = nx - b.x0, r = b.x1 - nx, bo = nz - b.z0, to = b.z1 - nz, m = Math.min(l, r, bo, to); if (m === l) nx = b.x0 - PR; else if (m === r) nx = b.x1 + PR; else if (m === bo) nz = b.z0 - PR; else nz = b.z1 + PR; }
    }
    }
    if (WATER.on && waterBlocked(nx, nz)) { if (!waterBlocked(nx, me.z)) nz = me.z; else if (!waterBlocked(me.x, nz)) nx = me.x; else { nx = me.x; nz = me.z; } }   // 不能走進水裡（橋上可以）
    me.x = Math.max(-HALF, Math.min(HALF, nx)); me.z = Math.max(-HALF, Math.min(HALF, nz));
    if (TUT.on) { const dx = me.x - TUT.cx, dz = me.z - TUT.cz, dd = Math.hypot(dx, dz); if (dd > TUT.R + 8) { TUT.cx = me.x; TUT.cz = me.z; } else if (dd > TUT.R) { me.x = TUT.cx + dx / dd * TUT.R; me.z = TUT.cz + dz / dd * TUT.R; const t = performance.now(); if (t - TUT.edgeT > 4000) { TUT.edgeT = t; post({ tunein: 'tutEdge' }); } } }   // 教學中不走太遠
  }
  me.moving = !!sp;
}

/* ═════════ [T17] 伺服器同步 ═════════ */
let base = null;
async function api(path, opt) {
  const SRV = (QP.get('server') || window.TUNEIN_SERVER || '').replace(/\/$/, '');   /* P74：網頁放在雲端、小鎮伺服器在自己電腦時，用 ?server= 或 config.js 指到伺服器 */
  const bs = base ? [base] : (SRV ? [SRV + '/api'] : []).concat(['/api', location.protocol === 'http:' ? 'http://' + location.hostname + ':8080/api' : 'https://' + location.hostname + ':8443/api']);
  for (const b of bs) { try { const r = await fetch(b + path, opt); if (r.ok) { base = b; return await r.json(); } } catch (e) {} }
  return null;
}
let lastPost = 0, inflight = false;
function postMove(now) {
  if (!PID || inflight || now - lastPost < 250) return; lastPost = now; inflight = true;
  const [mx, my] = worldToMap(me.x, me.z);
  api('/move', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: PID, x: +mx.toFixed(1), y: +my.toFixed(1) }) }).finally(() => { inflight = false; });
}
const PCOL = ['#A9D3FF', '#FFB5C1', '#FFE59A'], PSZ = [.7, 1, 1.35];
let spawned = false, firstStateDone = false, holdT = 0;
function holdView(on) { try { const cv = renderer.domElement; cv.style.transition = on ? 'none' : 'opacity .45s ease-out'; cv.style.opacity = on ? '0' : '1'; clearTimeout(holdT); if (on) holdT = setTimeout(() => holdView(false), 4000); } catch (e) {} }   // 換身分／重進時先藏畫面，等新位置確定再顯示，不會閃到舊位置或殘留的 Ping
/* ---- Blip（粉紅貝雷帽兔子）：位置/朝向/說話由 Unity 經 server /state 的 blip 欄位同步 ---- */
let BLIP = null; window.__blip = () => BLIP; window.__pm = () => me; window.__appear = d => pingAppear(me.obj, d || 0);   // 除錯：重播出現動作
function applyBlip(b) {
  if (!M.blip) return;
  if (!b) { if (BLIP) BLIP.obj.visible = false; return; }
  if (!BLIP) { const g = actor('blip'); g.traverse(m => { if (m.isMesh && /^Body00[45]$/.test(m.name) && m.material) { m.material = new THREE.MeshBasicMaterial({ color: '#FBF4F4' });   /* 眼睛的白瞳：原本被改成灰粉色看起來像黑洞 */ } }); g.add(shadowDisc(.8)); scene.add(g); BLIP = { obj: g, x: 0, z: 0, yaw: 0, init: false, say: '' }; }
  const [wx, wz] = mapToWorld(b.x, b.y), nowT = performance.now();
  if (BLIP.init && BLIP.lt) { const dp = (nowT - BLIP.lt) / 1000; if (dp > .05 && dp < 2 && b.mv) { BLIP.vx = (wx - BLIP.rx) / dp; BLIP.vz = (wz - BLIP.rz) / dp; } else { BLIP.vx = 0; BLIP.vz = 0; } }   // 估走路速度，下一次更新前繼續往前走（推算），看起來不卡
  BLIP.rx = wx; BLIP.rz = wz; BLIP.lt = nowT; BLIP.tx = wx; BLIP.tz = wz; BLIP.tyaw = +b.yaw || 0; BLIP.mv = !!b.mv; BLIP.obj.visible = true;
  if (!BLIP.init) { BLIP.x = wx; BLIP.z = wz; BLIP.yaw = BLIP.tyaw; BLIP.init = true; }
  const say = String(b.say || '');
  if (say !== BLIP.say) {   // 說話泡泡：奶油底（Unity WorldTags Blip bubble），高 2.5 m
    BLIP.say = say; const u = BLIP.obj.userData;
    if (u.bub) { BLIP.obj.remove(u.bub); u.bub.material.map.dispose(); u.bub.material.dispose(); u.bub = null; }
    if (say && !EMBED) { const ls = []; for (let i = 0; i < say.length && ls.length < CFG.bubbleLines; i += CFG.bubbleChars) ls.push(say.slice(i, i + CFG.bubbleChars)); const t = nameTag(ls.join('\n'), '#FFF6BE', true); t.position.set(0, CFG.blipBubbleY, 0); BLIP.obj.add(t); u.bub = t; }
  }
}

const STEPS = { px: null, pz: null, acc: 0, o: {} };
function stepSfx(now) {
  if (!me) return;
  if (STEPS.px === null) { STEPS.px = me.x; STEPS.pz = me.z; }
  const dm = Math.hypot(me.x - STEPS.px, me.z - STEPS.pz); STEPS.px = me.x; STEPS.pz = me.z;
  if (me.moving && dm > 0 && dm < 2) { STEPS.acc += dm; if (STEPS.acc >= 1.5) { STEPS.acc = 0; post({ tunein: 'step', v: 1 }); } } else if (!me.moving) STEPS.acc = Math.min(STEPS.acc, 1);
  for (const k in others) {
    const o = others[k]; if (o.tx == null) continue; const q = STEPS.o[k] || (STEPS.o[k] = { x: o.x, z: o.z, acc: 0 });
    const mv = Math.hypot(o.x - q.x, o.z - q.z); q.x = o.x; q.z = o.z; if (mv > 2) continue;
    if (mv > .004) { q.acc += mv; if (q.acc >= 1.5) { q.acc = 0; const d = Math.hypot(o.x - me.x, o.z - me.z), g = Math.max(0, 1 - d / 16) * .5; if (g > .03) post({ tunein: 'step', v: g }); } }
  }
}
function blipFrame(dt) {
  if (!BLIP || !BLIP.init || !BLIP.obj.visible) return;
  if (BLIP.mv && BLIP.vx !== undefined && performance.now() - BLIP.lt < 700) { BLIP.tx += BLIP.vx * dt; BLIP.tz += BLIP.vz * dt; }
  const a = Math.min(1, dt * 6); BLIP.x += (BLIP.tx - BLIP.x) * a; BLIP.z += (BLIP.tz - BLIP.z) * a;
  let d = BLIP.tyaw - BLIP.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); BLIP.yaw += d * Math.min(1, dt * 8);
  BLIP.obj.position.copy(U(BLIP.x, 0, BLIP.z)); BLIP.obj.rotation.y = Math.PI - BLIP.yaw;
  const u = BLIP.obj.userData; if (u.mixer) { setAnim(BLIP.obj, BLIP.mv ? 'walk' : 'idle'); u.mixer.update(dt); }
}
let RES = null;
function applyState(j) {
  if (!j || !me) return;
  try { spotAdopt(j.spots); } catch (e) {}
  if (j.now) SRVOFF = j.now - Date.now();
  if (j.residents) RES = j.residents;
  try { applyBlip(j.blip); } catch (e) { console.warn('blip', e); }
  (j.players || []).forEach(p => {
    if (p.pid === PID) { if (M.ping) { const k = (p.hex || '') + '|' + (p.col || ''); if (me.ck !== k) { me.ck = k; tintPing(me.obj, pingColor(p.hex, p.col)); } } setTag(me.obj, p.name); if (!spawned) { const [wx, wz] = mapToWorld(p.x, p.y); me.x = wx; me.z = wz; pushOutSpawn(); spawned = true; camPos.set(0, 0, 0); holdView(false); try { updateGrass(me.x, me.z, true); } catch (e) {} if (readySent || !PID) {} if (PID && !meAppeared) me.obj.scale.setScalar(.001); ownTryAppear(); } return; }
    const [wx, wz] = mapToWorld(p.x, p.y); let o = others[p.pid];
    if (!o) {
      o = others[p.pid] = { obj: makePing(p.col, p.name || '', p.hex), x: wx, z: wz }; scene.add(o.obj);
      if (p.at === undefined) { if (firstStateDone) pingAppear(o.obj, 0); }   // 舊版伺服器（沒有出現時間）：照舊
      else if (!p.at) { o.wait = true; o.obj.visible = false; }               // 這位玩家的手機還沒準備好：先不顯示
      else otherAppear(o, p.at);
    } else if (o.wait && p.at) { o.wait = false; o.obj.visible = true; otherAppear(o, p.at); }
    setTag(o.obj, p.name); o.tx = wx; o.tz = wz; o.seen = performance.now();
  });
  const live = new Set((j.players || []).filter(p => p.pid !== PID).map(p => p.pid)); Object.keys(others).forEach(k => { if (!live.has(k)) { scene.remove(others[k].obj); delete others[k]; } });
  // 種下的聲音花
  const ids = new Set((j.plants || []).map(p => p.id));
  plantEvents(j.plants || []);
  Object.keys(plantObjs).forEach(k => { if (!ids.has(+k)) { scene.remove(plantObjs[k].obj); { const ci = colliders.indexOf(plantObjs[k].col); if (ci >= 0) colliders.splice(ci, 1); } delete plantObjs[k]; } });
  (j.plants || []).forEach(p => {
    if (plantObjs[p.id]) return; const [wx, wz] = mapToWorld(p.x, p.y), g = new THREE.Group(), sz = (PSZ[p.wt] || 1) * 1.6;
    // 聲音花（和 Unity SoundGarden.Build 同一個造型）：細莖＋兩片葉＋中心＋6 片花瓣＋腳下淡光環
    const pc = new THREE.Color(PCOL[p.pt] || '#FFB5C1'), qq = Math.max(0, Math.min(1, p.q == null ? 1 : p.q)), pcol = new THREE.Color('#FFFFFF').lerp(pc, .45 + .55 * qq);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, .95 * sz, 6), mat('#6BB872')); st.position.y = .475 * sz; g.add(st);
    [-1, 1].forEach(s => { const lf = new THREE.Mesh(new THREE.SphereGeometry(.2 * sz, 10, 8), mat('#79C27E')); lf.scale.set(1.6, .22, .8); lf.position.set(s * .2 * sz, .3 * sz, 0); lf.rotation.z = s * .5; g.add(lf); });
    const bl = new THREE.Group(); bl.position.y = .98 * sz; g.add(bl);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, pt = new THREE.Mesh(new THREE.SphereGeometry(.2 * sz, 12, 10), mat(pcol)); pt.scale.set(1.15, .5, .75); pt.position.set(Math.cos(a) * .27 * sz, .02 * sz, Math.sin(a) * .27 * sz); pt.rotation.y = -a; pt.rotation.z = .25; bl.add(pt); }
    const ct = new THREE.Mesh(new THREE.SphereGeometry(.16 * sz, 12, 10), mat('#FFE08A')); ct.position.y = .08 * sz; bl.add(ct);
    const hl = new THREE.Mesh(new THREE.RingGeometry(.5 * sz, .62 * sz, 32), new THREE.MeshBasicMaterial({ color: pcol, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide })); hl.rotation.x = -Math.PI / 2; hl.position.y = .05; g.add(hl);
    g.add(shadowDisc(.45 * sz)); g.position.copy(U(wx, 0, wz)); g.scale.setScalar(.01); scene.add(g); plantObjs[p.id] = { obj: g, born: performance.now(), p };
    /* 小鎮多了東西一定要有碰撞框：種下的花是圓形碰撞（半徑和 Unity SoundGarden 的 0.3 一樣）；種在腳下時把 Ping 往後推出去，不穿模 */
    const plc = { x: wx, z: wz, r: .3 }; colliders.push(plc); plantObjs[p.id].col = plc;
    if (me) { const ddx = me.x - wx, ddz = me.z - wz, dd = Math.hypot(ddx, ddz), rr = plc.r + PR + .05; if (dd < rr) { if (dd > .05) { me.x = wx + ddx / dd * rr; me.z = wz + ddz / dd * rr; } else { me.x = wx - Math.sin(me.yaw) * rr; me.z = wz - Math.cos(me.yaw) * rr; } } }
  });
}

/* ═════════ [T18] 對話（Unity Detector 的 ModernDialogue／GrandmaLines）：鏡頭切到兩人側面，點一下換下一句 ═════════ */
const SNDN = { bird: '鳥叫', chime: '風鈴', clock: '時鐘', chick: '小雞', rain: '雨聲', drop: '水滴', frog: '青蛙', cricket: '蟲鳴', fire: '火堆', owl: '貓頭鷹', sea: '海浪', wind: '風聲', bell: '鐘聲' };
const SPK = { 老闆: '花店老闆', 奶奶: '奶奶' };
function talkLines(id) {
  const r = RES && RES.find(x => x.id === id);
  const w = r && r.want && r.want.length >= 2 ? r.want.map(k => SNDN[k] || k) : null, got = r && r.got ? r.got.length : 0, met = r && r.met;
  const left = () => '「' + (r.got.indexOf(r.want[0]) >= 0 ? w[1] : w[0]) + '」';
  if (id === 'house') {   /* 奶奶：慢慢說、愛織毛線、想念孫子 */
    if (!w) return ['奶奶：嗯？有客人呀。', '奶奶：來，慢慢坐。這裡好久沒有聲音了。', '奶奶：你去花那邊找找，說不定有。'];
    if (r.done) return ['奶奶：' + w[0] + '，還有' + w[1] + '。', '奶奶：家裡又熱熱鬧鬧的了，真好。', '奶奶：謝謝你呀，孩子。'];
    if (got === 1) return ['奶奶：呀，這個聲音，我聽過的。', '奶奶：一聽，手上的毛線都暖了。', '奶奶：還差' + left() + '，你再幫我找找。'];
    if (!met) return ['奶奶：孫子們好久沒回來了。', '奶奶：以前家裡熱熱鬧鬧的，我一邊織毛線一邊聽。', '奶奶：我好想再聽到「' + w[0] + '」和「' + w[1] + '」。', '奶奶：找到了，收起來，種在我旁邊就好。'];
    return ['奶奶：回來啦。', '奶奶：我還在等「' + w[0] + '」和「' + w[1] + '」。', '奶奶：不急，慢慢找。'];
  }
  /* 花店老闆：熱心、手忙腳亂、花會跟著聲音開 */
  if (!w) return ['老闆：哎呀，有客人！', '老闆：小鎮今天好安靜，花都睡著了。', '老闆：聽說你的探測器找得到會唱歌的花，幫我看看好嗎？'];
  if (r.done) return ['老闆：聽到了！' + w[0] + '，還有' + w[1] + '。', '老闆：你看，花一朵一朵開了。', '老闆：謝謝你，Ping。'];
  if (got === 1) return ['老闆：咦，這個聲音我認得！', '老闆：花都抖了一下，快醒了。', '老闆：還差' + left() + '，應該就在附近。'];
  if (!met) return ['老闆：哎呀，有客人！', '老闆：以前屋外滴滴答答的，花一聽到就醒了。', '老闆：現在太安靜，它們都不肯開。', '老闆：我好想再聽到「' + w[0] + '」和「' + w[1] + '」。', '老闆：靠近花，站著不動，聽清楚再收。'];
  return ['老闆：回來啦！', '老闆：我還在等「' + w[0] + '」和「' + w[1] + '」。', '老闆：慢慢來，花都在等。'];
}
function hintLines(id) {   /* 這位居民知道哪些「害羞的聲音」：聊完就能在探測器找到（sound_spots.json 的 gate） */
  const L = (SPOT.cfg && SPOT.cfg.spots || []).filter(x => x.gate === id), nm = id === 'house' ? '奶奶' : '老闆'; if (!L.length) return [];
  return [nm + '：對了，有幾個聲音很害羞，躲著不出來。', nm + '：' + L.map(x => x.clue).join('；') + '。', nm + '：打開探測器，說不定就聽到了。'];
}
const TK = { on: false, id: '', lines: [], i: 0 };
function talkShow() {
  const m = /^(.+?)：(.*)$/.exec(TK.lines[TK.i]) || ['', '', TK.lines[TK.i]];
  if (EMBED) { post({ tunein: 'dlgLine', id: TK.id, who: SPK[m[1]] || m[1], text: m[2], i: TK.i, n: TK.lines.length }); return; }   // 手機頁用自己的對話卡（有「繼續」按鈕），這裡不畫
  document.getElementById('dn').textContent = SPK[m[1]] || m[1]; document.getElementById('dt').textContent = m[2];
  document.getElementById('dk').textContent = TK.i < TK.lines.length - 1 ? '點一下繼續' : '點一下結束';
}
function talkStart(id) {
  const n = NPCS.find(x => x.id === id); if (!n) return; if (TK.on) talkEnd(false);   // 上一段沒結束（例如對話中被重置）：先收掉再重開，不會卡住
   TK.on = true; TK.id = id; TK.lines = talkLines(id).concat(hintLines(id)); TK.i = 0;
  ctl.fwd = 0; ctl.turn = 0; me.moving = false;
  const dx = n.x - me.x, dz = n.z - me.z, d = Math.hypot(dx, dz) || 1; me.yaw = Math.atan2(dx, dz); n.obj.rotation.y = Math.PI - Math.atan2(-dx, -dz);
  const mx = (n.x + me.x) / 2, mz = (n.z + me.z) / 2, sx = -dz / d, sz = dx / d;   // 兩人連線的側邊
  const ux = dx / d, uz = dz / d, bk = id === 'flower' ? 6 : 4; shot = { p: U(me.x - ux * bk + sx * 2.6, id === 'flower' ? 3.8 : 2.6, me.z - uz * bk + sz * 2.6), l: U(mx + ux * 1.2, id === 'flower' ? 1.0 : .5, mz + uz * 1.2), until: 1e15 };
  document.getElementById('dlg').hidden = EMBED; talkShow();   // 手機頁裡：對話卡在 play.html；單獨開啟時才用這裡的對話框
}
function talkEnd(notify) { TK.on = false; shot = null; document.getElementById('dlg').hidden = true; post({ tunein: 'dlgClose' }); if (notify) post({ tunein: 'talkEnd', id: TK.id }); }
function talkNext() { if (!TK.on) return; if (++TK.i >= TK.lines.length) talkEnd(true); else talkShow(); }
document.getElementById('dlg').addEventListener('pointerdown', e => { e.preventDefault(); talkNext(); });
/* 【T-新一輪重置】play.html 開新一輪時通知：對話、種下的花、其他玩家、鳥／雨事件、Blip 泡泡全部回到開場，並重新出生 */
function resetWorld() {
  if (TK.on) talkEnd(false);
  Object.keys(plantObjs).forEach(k => { scene.remove(plantObjs[k].obj); { const ci = colliders.indexOf(plantObjs[k].col); if (ci >= 0) colliders.splice(ci, 1); } delete plantObjs[k]; });
  Object.keys(others).forEach(k => { scene.remove(others[k].obj); delete others[k]; });
  seenPlants = null; lastN = 0; try { B.reset(); } catch (e) {}
  RES = null; spawned = false; meAppeared = false; appearAsked = false; appearGo = !GATE; camPos.set(0, 0, 0); nearId = ''; holdView(true);   /* 重置時先藏起來，等新位置確定再淡入，不露出舊位置 */
  if (BLIP && BLIP.obj.userData.bub) { BLIP.obj.remove(BLIP.obj.userData.bub); BLIP.obj.userData.bub = null; BLIP.say = ''; }
  api('/state').then(applyState).catch(() => {});
}
addEventListener('message', e => { const d = e.data; if (d && d.tunein === 'reset') { resetWorld(); spotReset(); } if (d && d.tunein === 'talk') talkStart(d.id); if (d && d.tunein === 'talkNext') talkNext(); if (d && d.tunein === 'talkStop' && TK.on) talkEnd(false); if (d && d.tunein === 'pid' && d.pid && d.pid !== PID) { PID = d.pid; holdView(true); if (others[PID]) { scene.remove(others[PID].obj); delete others[PID]; } spawned = false; meAppeared = !!d.restore; camPos.set(0, 0, 0); api('/state').then(applyState).catch(() => {}); } });

/* ═════════ [T19] 靠近居民：通知 play.html 顯示「說話」按鈕 ═════════ */
let nearId = '';
function checkNear() {
  let best = null, bd = 1e9;
  NPCS.forEach(n => { const d = Math.hypot(n.x - me.x, n.z - me.z); n.m.visible = d < 16; if (d < bd) { bd = d; best = n; } });
  const id = best && bd < CFG.talkRange ? best.id : '';
  if (id !== nearId) { nearId = id; try { parent.postMessage({ tunein: id ? 'near' : 'far', id, name: best ? best.name : '' }, '*'); } catch (e) {} }
}

/* ═════════ [T20] 主迴圈 ═════════ */
let READY_AT = 0, readySent = false, meAppeared = false; const WD = { t: 0 };
let last = performance.now(), fr = 0, camOverride = null, shot = null;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; fr++;
  if (GATE && now - (CTLDBG.t || 0) > 700) { CTLDBG.t = now; const sg = [CTLDBG.n, +!!appearGo, +!!spawned, +!!meAppeared, me && me.lockUntil > now ? 1 : 0, ctl.fwd, ctl.turn, TK.on ? 1 : 0, Math.round(me ? me.x : 0), Math.round(me ? me.z : 0)].join(','); if (sg !== CTLDBG.last) { CTLDBG.last = sg; post({ tunein: 'dbg', s: 'n=' + CTLDBG.n + ' go=' + +!!appearGo + ' pid=' + +!!PID + ' sp=' + +!!spawned + ' ap=' + +!!meAppeared + ' lock=' + (me && me.lockUntil > now ? 1 : 0) + ' f=' + ctl.fwd + ' t=' + ctl.turn + ' talk=' + (TK.on ? 1 : 0) + ' x=' + (me ? me.x.toFixed(1) : '-') + ' z=' + (me ? me.z.toFixed(1) : '-') }); } }
  if (GATE && appearGo && !meAppeared && me && me.obj) { if (!WD.t) WD.t = now; if (now - WD.t > 5000) { WD.t = 0; if (!spawned) { try { pushOutSpawn(); } catch (e) {} spawned = true; camPos.set(0, 0, 0); holdView(false); } meAppeared = true; appearAsked = true; try { pingAppear(me.obj, 200); } catch (e) { me.obj.scale.setScalar(1); } } } else if (meAppeared) WD.t = 0;   /* 保險：6 秒內出現流程沒完成（伺服器沒回等）就直接播出現動畫，Ping 不會一直隱形、方向鍵不會一直鎖住 */
  if (me && (me.lockUntil > now || (GATE && !meAppeared))) { ctl.fwd = 0; ctl.turn = 0; }
  if ((ctl.fwd || ctl.turn) && CTLDBG.hit && now - CTLDBG.hit > 1500) { ctl.fwd = 0; ctl.turn = 0; }   /* P62：放開的訊息漏掉時，1.5 秒沒收到心跳就自動停下，Ping 不會一直自己走 */
  step(dt); postMove(now); checkNear();
  me.gy = (me.gy || 0) + (groundY(me.x, me.z) - (me.gy || 0)) * .4; me.obj.position.copy(U(me.x, me.gy, me.z)); me.obj.rotation.y = Math.PI - me.yaw;   // Three 的 z 取負：朝向 (sin, -cos)
  if (me.obj.userData.mixer) { setAnim(me.obj, me.moving ? 'walk' : 'idle'); me.obj.userData.mixer.update(dt); }
  else if (me.obj.userData.body) me.obj.userData.body.position.y = 1 + (me.moving ? Math.abs(Math.sin(now / 110)) * .15 : 0);
  for (const k in others) {
    const o = others[k]; if (o.tx == null) continue;
    const a = Math.min(1, dt * 5), nx = o.x + (o.tx - o.x) * a, nz = o.z + (o.tz - o.z) * a, mv = Math.hypot(nx - o.x, nz - o.z);
    if (mv > .01) o.obj.rotation.y = Math.atan2(nx - o.x, -(nz - o.z));
    o.x = nx; o.z = nz; o.obj.position.copy(U(o.x, 0, o.z));
    if (o.obj.userData.mixer) { setAnim(o.obj, mv / dt > .6 ? 'walk' : 'idle'); o.obj.userData.mixer.update(dt); }
  }
  stepSfx(now);
  blipFrame(dt);
  for (const k in plantObjs) { const q = plantObjs[k], t = Math.min(1, (now - q.born) / 600), e = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2); q.obj.scale.setScalar(Math.max(.01, e)); q.obj.rotation.y = Math.sin(now / 900 + +k) * .15; }
  NPCS.forEach(n => { n.m.position.y = n.m.userData.by - .4 + Math.sin(now / 1000 * 3.2) * .12; if (n.obj.userData.mixer) n.obj.userData.mixer.update(dt); mkFrame(n, now, dt); }); mkFxFrame(now);
  { const p = me.obj.position; sun.target.position.set(Math.round(p.x / 2) * 2, 0, Math.round(p.z / 2) * 2); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 90); }
  UN.uTime.value = now / 1000; try { dustFrame(now); } catch (e) { DUST.n = 0; } updateGrass(me.x, me.z); grassChunkFrame(me.x, me.z); fxFrame(now, dt); weatherFx(dt); spotFrame(now, dt); if (fr % 15 === 0) sndSend();
  window.__sky.position.copy(cam.position); window.__skyMat.uniforms.t.value = WEA.cx;
  // 鏡頭（Unity CameraFollow）：在 Ping 後方 6.5 公尺、高 3.5 公尺，看向前方 3.5 公尺、高 1.2 公尺
  const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
  const target = U(me.x - fx * CFG.camBack, CFG.camHeight, me.z - fz * CFG.camBack), look = U(me.x + fx * CFG.camLookAhead, 1.2, me.z + fz * CFG.camLookAhead);
  if (!camPos.lengthSq()) { camPos.copy(target); camLook.copy(look); }
  const k = 1 - Math.exp(-dt * 8); if (!(shot && now < shot.until)) { camPos.lerp(target, k); camLook.lerp(look, k); }
  if (shot && now < shot.until) { camPos.lerp(shot.p, 1 - Math.exp(-dt * 10)); camLook.lerp(shot.l, 1 - Math.exp(-dt * 10)); }
  if (camOverride) { cam.position.copy(camOverride.p); cam.lookAt(camOverride.l); } else { cam.position.copy(camPos); cam.lookAt(camLook); }
  // 遠處的區塊整組不畫
  /* 區塊不再依距離整組關掉（整張地圖才 270 公尺，關掉會在遠處突然冒出來）；看不到的由 three 的視錐剔除自動略過 */
  renderer.render(scene, cam); glowFrame(); requestAnimationFrame(frame);
  if (!readySent && READY_AT && fr >= READY_AT) { readySent = true; ownTryAppear(); document.getElementById('load').hidden = true; parent.postMessage({ tunein: 'ready' }, '*'); }
}

async function boot() {
  const lt = document.getElementById('lt');
  const T0 = performance.now(), prof = new URLSearchParams(location.search).get('prof') === '1', mark = s => { if (prof) console.log('PROF ' + s + ' ' + Math.round(performance.now() - T0)); };
  const pGrass = fetch('grass_points.bin?v=' + (Date.now() / 6e5 | 0)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null), pState = api('/state').catch(() => null), pMask = loadMask(), pLayout = loadLayout(), pModels = loadModels();   // 狀態、地圖遮罩、配置、模型 同時開始載入（以前是一個等一個）
  let L; try { L = await pLayout; } catch (e) { lt.textContent = '小鎮資料載入失敗：' + e.message; return; }
  await pModels; mark('models'); buildGround(await pMask); mark('ground');
  buildWorld(L); buildNpcs(); buildSpots(L); { const gb = await pGrass; if (!(gb && buildStaticGrass(gb))) buildGrass(); } buildBirds(); buildRain(); mark('built');
  me = { x: 6.37, z: -18.48, yaw: 0, moving: false, obj: null };
  me.obj = makePing('flower', ''); scene.add(me.obj);
  // 先把第一份狀態拿到（我的位置、其他人、花），整個場景一次長好，才讓畫面出現
  try { applyState(await Promise.race([pState, new Promise(r => setTimeout(r, 4000))])); } catch (e) {} mark('state');
  firstStateDone = true;
  setInterval(async () => { applyState(await api('/state')); }, 500);
  /* [T17b] Blip 專用快速通道：伺服器有 GET /blip 才用（沒有就維持上面 /state 的 0.5 秒），每 0.25 秒一次，跟 Unity BlipSync 的回報節奏一樣 */
  setInterval(async () => { try { const j = await api('/blip'); if (j && typeof j === 'object' && 'blip' in j) applyBlip(j.blip); } catch (e) {} }, 250);   // 狀態輪詢（秒）：Blip 走路、說話要跟 Unity 同步，所以 0.5 秒一次
  updateGrass(me.x, me.z, true); camPos.set(0, 0, 0);
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, cam); else renderer.compile(scene, cam); mark('compile'); const seenT = new Set(); scene.traverse(o => { const ms = o.material ? [].concat(o.material) : []; ms.forEach(m => { for (const k of ['map', 'alphaMap', 'emissiveMap']) { const t = m[k]; if (t && !seenT.has(t)) { seenT.add(t); try { renderer.initTexture(t); } catch (e) {} } } }); }); } catch (e) {}   // 貼圖先全部送進顯卡，第一次看到樹和花叢才不會卡一下才長出來
  lt.textContent = '快好了，再等一下…'; parent.postMessage({ tunein: 'prog', p: 99 }, '*');
  READY_AT = 8; requestAnimationFrame(frame); mark('ready'); loadLate();
  if (DEBUG) { window.__ap = pingAppear; window.__AP = APPEAR; window.__me = me; window.__scene = scene; window.__r = renderer; window.__cam = cam; window.__talk = talkStart; window.__B = B; window.__npc = id => NPCS.find(n => n.id === id); window.__bird = () => birdTrigger(true); window.__rain = rainTrigger; window.__setCam = (p, l) => { camOverride = p ? { p: U(p[0], p[1], p[2]), l: U(l[0], l[1], l[2]) } : null; }; }
}
boot();
