(function () {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  /* ╔══════════════════════════════════════════════════════════════╗
   ║  【CONFIG 常改的數字】時間、口袋格數等，只改這一區                    ║
   ╚══════════════════════════════════════════════════════════════╝ */
  const CONFIG = {
    roundSec: 480,        // 一輪幾秒（預設 8 分鐘）。實際以伺服器 roundMs 為準 → 要改請同時改 tunein-server.js 最上面的 ROUND_SEC
    settleSec: 16,        // 「時間到」結算頁停幾秒（伺服器重置時間＝結算＋離場卡，兩邊要一致）
    leaveAutoSec: 30,     // 離場卡幾秒後自動「再玩一次」
    pocket: 2,            // 種子口袋格數
    hideMicListen: true   // true＝小鎮畫面不顯示舊的「收聲音」按鈕（因為不做實體裝置；要恢復舊流程改成 false）
  };
  /* [P00] ui_config.json：同資料夾的設定檔，覆蓋 CONFIG／CSS 變數／額外 CSS（檔案不存在就用內建值） */
  try { const x = new XMLHttpRequest(); x.open('GET', './ui_config.json?' + (Date.now() / 6e4 | 0), false); x.send(); if (x.status === 200) { const J = JSON.parse(x.responseText); window.__UI_CFG = J;
      Object.keys(J.play || {}).forEach(k => { if (k[0] !== '_' && k in CONFIG) CONFIG[k] = J.play[k]; });
      Object.keys(J.css || {}).forEach(k => { if (k.slice(0, 2) === '--') document.documentElement.style.setProperty(k, J.css[k]); });
      if (J.extraCss) { const st = document.createElement('style'); st.textContent = J.extraCss; document.head.appendChild(st); } } } catch (e) {}
  let ROUND_MS = CONFIG.roundSec * 1000; const SETTLE_MS = CONFIG.settleSec * 1000;
  const TH = { low: 450, high: 1200, spread: 2.6, light: 20, heavy: 31, loud: 44, loudQuiet: 32, burst: 450, cont: .72 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const HUE = { flower: '小莓', house: '小紫', market: '小檸', river: '小藍', lilac: '小葡', sun: '小桃' };   // 名字對應配色：莓紅／淡紫／檸檬黃／藍莓／深紫／淡粉
  let ME = 'flower';
  const ME0 = { x: 150, y: 262 };
  const EMS = [[28, 40], [116, 44], [206, 100], [30, 150], [190, 170], [108, 192], [60, 252], [276, 150], [206, 246], [270, 40]];
  const RES_EM = { flower: 1, house: 2, market: 5, river: 8 };
  const FR = [{ name: '小葵 Ping', col: 'house' }, { name: '小檸', col: 'market' }, { name: '阿藍', col: 'river' }];
  let EM = [];

  /* ═════════ [P01] 居民與副線 ═════════ */
  const N = {
    flower: { id: 'flower', main: 1, name: '花店', who: '花店老闆', x: 70, y: 74, icon: 'lamp', way: '敲', how: '手邊的小東西，輕輕敲一下試試。', need: '小小一下', fx: '小花開', cls: 'flower',
      own: '以前屋外滴滴答答的，花一聽到就醒了。現在太安靜，它們都不肯開。', ownN: '花店老闆說，以前屋外滴滴答答的。我想：一下一下的。',
      nb: { about: 'market', line: '市集那邊低低沉沉的，一直都在，我都習慣了。', note: '花店老闆說，市集那邊低低沉沉的。我想：低低的。' },
      wrong: '花店老闆正低頭澆花：「嗯……花好像沒什麼反應。」', h1: '很輕，一下一下的。', h2: '手邊的小東西，敲一下試試。' },
    house: { id: 'house', main: 1, name: '居民家', who: '奶奶', x: 246, y: 64, icon: 'door', way: '疊', how: '找旁邊的 Ping，一起把聲音疊起來。', need: '熱鬧一陣', fx: '窗戶亮', cls: 'house',
      own: '孫子們好久沒回來了。以前家裡熱熱鬧鬧的，我邊織毛線邊聽。', ownN: '奶奶說，以前家裡熱熱鬧鬧的。我想：很多聲音，一陣一陣。',
      nb: { about: 'flower', line: '隔壁花店那種聲音很輕，我要湊近才聽得到。', note: '奶奶說，隔壁花店的聲音很輕。我想：輕輕的。' },
      wrong: '奶奶瞇著眼織毛線：「這聲音……不太對，再想想。」', h1: '很多聲音混在一起，有高有低。', h2: '找幾個人，聊一聊。' },
    market: { id: 'market', main: 1, name: '市集', who: '攤販', x: 150, y: 154, icon: 'bell', way: '調', how: '找一個一直不停的低聲音。', need: '低低不停', fx: '燈籠亮', cls: 'market',
      own: '嘿，客人。中午最悶，以前耳邊一直有個低低的聲音轉著，我聽著聽著就睡著了。', ownN: '攤販說，以前一直有個聲音在耳邊轉。我想：連續不斷。',
      nb: { about: 'river', line: '河邊那聲音輕輕的，連著不斷，我睡午覺都覺得舒服。', note: '攤販說，河邊的聲音輕輕的、連著不斷。我想：輕、連續。' },
      wrong: '攤販趴在桌上打哈欠：「呼……不是這個，我還想睡。」', h1: '很沉，很低，一直轉。', h2: '站著不動，聽聽背景裡一直沒停過的那個。' },
    river: { id: 'river', main: 1, name: '河邊', who: '釣魚的人', x: 248, y: 234, icon: 'water', way: '靜', how: '安靜下來，收一個輕輕連著的聲音。', need: '悄悄流動', fx: '水紋', cls: 'river',
      own: '噓，小聲點。以前河水一直輕輕響著，聲音一變，我就知道魚來了。', ownN: '釣魚的人說，以前河水一直響著。我想：連續。',
      nb: { about: 'house', line: '那家人說話，有人嗓子尖，有人嗓子粗，混在一起。', note: '釣魚的人說，那家人有人嗓子尖、有人嗓子粗。我想：有高有低。' },
      wrong: '釣魚的人盯著浮標：「魚沒上鉤，不是這個。」', h1: '連在一起的，不會斷。', h2: '安靜下來，有個聲音輕輕地連著。' },
    trav: { id: 'trav', side: 1, name: '路口', who: '旅人', ch: '旅', x: 122, y: 98, icon: 'bell', way: '播', how: '找一張大聲的、一張小聲的給他。', fx: '路燈亮', cls: 'market',
      own: '走了一路，只聽到自己的腳步。要是有個大聲的，再配個小聲的就好了。', ownN: '旅人說，只聽到自己的腳步，想要大聲的和小聲的。我想：一重一輕。',
      wrong: '旅人拍拍鞋上的灰：「這組……還是只有腳步聲。」', h1: '一個大聲，一個小聲。', h2: '手邊找一個重的、一個輕的。' },
    old: { id: 'old', side: 1, name: '小路', who: '老爺爺', ch: '爺', x: 206, y: 186, icon: 'door', way: '哼', how: '找一張高高的、一張低低的給他。', fx: '鳥飛來', cls: 'house',
      own: '今天連鳥都不叫。要是有個高高的，再有個低低的，這裡就不冷清了。', ownN: '老爺爺說，連鳥都不叫，想要高的和低的。我想：一高一低。',
      wrong: '老爺爺抬頭看樹：「鳥還在睡。」', h1: '一個高，一個低。', h2: '哼一個高的、哼一個低的。' }
  };
  const MAIN = ['flower', 'house', 'market', 'river'], SIDE = ['trav', 'old'], ALL = MAIN.concat(SIDE);
  const SPEAKER = { flower: 'house', house: 'river', market: 'flower', river: 'market' };
  const SK = ['小鳥', '小孩', '小幫手', '小青蛙'];
  const ENDS = [['小鎮還在睡', '小鎮還在睡。沒關係，下次再來叫醒它。'], ['小鎮還在睡', '小鎮還在睡。沒關係，下次再來叫醒它。'], ['小鎮慢慢醒來', '小鎮慢慢醒來了，謝謝你。'], ['小鎮慢慢醒來', '小鎮慢慢醒來了，謝謝你。'], ['小鎮醒了', '小鎮醒了！聲音都回來了。']];
  const S = {};
  const BIRD = { done: false, shown: null };   // 給小鳥的狀態（任務列 ♪ 要不要顯示）
  function reset() {
    Object.assign(S, { screen: 'join', view: 'map', started: false, roundEnd: 0, taught: true, cards: [], planted: [], notes: [], seen: {}, met: {}, woke: {}, side: {}, small: [], sk: 0, marks: 0,
      sideOn: false, cur: null, loc: '路口', me: { x: ME0.x, y: ME0.y }, quiet: false, ended: false, pend: null, players: S.players || 1, hint: {}, asked: {}, help: null, town: [], hq: 0, helpAt: 0, sel: [], pk: null, friends: {}, swap: {}, heard: {}, quest: null, assign: null, unl: {} });
    assignSlots();
  }
  function assignSlots() {
    const mine = {}, theirs = [];
    MAIN.forEach(f => { const r = MAIN.filter(x => N[x].nb && N[x].nb.about === f)[0], a = f + '.own', b = r + '.nb'; if (Math.random() < .5) { mine[a] = 1; theirs.push(b); } else { mine[b] = 1; theirs.push(a); } });
    S.mine = mine; S.fh = [[], [], []]; theirs.forEach((sl, k) => S.fh[k % 3].push(sl));
  }
  reset();

  /* ═════════ [P02] 小工具 ═════════ */
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
  const say = t => { $('#live').textContent = t; };
  const BLIP_FLAT = (c) => '<img class="' + c + '" src="/tunein/blip_flat.webp?v=6" alt="Blip" decoding="async">';
  const icon = n => '<svg aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const popEl = (el, c) => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
  function toast(t, k, ms) {
    if (typeof CINE !== 'undefined' && CINE.on) { setTimeout(() => toast(t, k, ms), 600); return; }
    const el = $('#toast'); k = k || (/成功|✓|醒了|收到|朋友|換到/.test(t) ? 'ok' : /沒有|不能|還沒|先|太/.test(t) ? 'warn' : 'info');
    if (document.body.classList.contains('tut') && k === 'info') return;   /* 教學中不插入一般通知 */
    el.className = 'toast ' + k; el.innerHTML = '<i class="ti">' + (k === 'ok' ? '✓' : k === 'warn' ? '!' : '♪') + '</i><span></span>'; el.lastChild.textContent = t; el.hidden = true; void el.offsetWidth; el.hidden = false;
    try { if (navigator.vibrate) navigator.vibrate(k === 'ok' ? [30, 40, 30] : k === 'warn' ? [70] : [15]); } catch (e) {}
    if (k === 'ok') sfx.got(); else if (k === 'warn') sfx.oops(); else sfx.tap();
    document.body.classList.add('toasting'); clearTimeout(toast.t); toast.t = setTimeout(() => { el.classList.add('out'); document.body.classList.remove('toasting'); setTimeout(() => { el.hidden = true; }, 260); }, ms || 2600);
  }
  const CLOSE = '<button class="icon-btn" data-close type="button" aria-label="關閉"><svg aria-hidden="true"><use href="#i-x"/></svg></button>';
  function openSheet(h) { $('#sheetBody').innerHTML = h; $('#sheet').hidden = false; $$('#sheetBody [data-close]').forEach(b => b.addEventListener('click', closeSheet)); }
  function closeSheet() { $('#sheet').hidden = true; try { $('#sheet').classList.remove('dlgmode'); document.body.classList.remove('talking'); } catch (x) {} S.cur = null; if (window.__tuneStop) window.__tuneStop(); if (S.talkOn) { S.talkOn = false; try { const fr = $('#uFrame'); fr && fr.contentWindow && fr.contentWindow.postMessage({ tunein: 'talkStop' }, '*'); } catch (x) {} } }   // 對話中按 X／點外面＝結束對話

  /* ═════════ [P03] 回饋音（錄音時不出聲，避免被收進去） ═════════ */
  let AC = null;
  function ensureAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} return AC; }
  /* 11/14 音效總輸出：增益 ×3.2 ＋壓縮器，音量大又不破音 */
  let SO = null;
  function sfxOut() { if (SO) return SO; try { const g = AC.createGain(); g.gain.value = 3.2; const c = AC.createDynamicsCompressor(); c.threshold.value = -14; c.knee.value = 12; c.ratio.value = 6; c.attack.value = .003; c.release.value = .15; g.connect(c); c.connect(AC.destination); SO = g; } catch (e) { SO = AC.destination; } return SO; }
  function tone(f, type, vol, dur, delay) {
    if (!AC || A.rec) return; const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(sfxOut()); o.start(t); o.stop(t + dur + .05);
  }
  /* 可愛音效（11/14）：木琴／卡林巴式的短「叮」＋往上滑的「噗」，音量小、很短 */
  function pluck(f, vol, dur, delay) { tone(f, 'sine', vol, dur, delay); tone(f * 2, 'sine', vol * .35, dur * .5, delay); tone(f * 3, 'sine', vol * .12, dur * .3, delay); }
  function glide(f0, f1, vol, dur, delay, type) {
    if (!AC || A.rec) return; const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .8);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(sfxOut()); o.start(t); o.stop(t + dur + .05);
  }
  const sfx = {
    tap() { },   /* 按鈕聲音改由全域 pop 統一處理，避免重複 */
    pop() { const f = [659, 784, 880, 1047, 1175][Math.floor(Math.random() * 5)]; glide(f * .75, f * 1.15, .09, .13); pluck(f * 2, .05, .1, .05); pluck(f * 3, .025, .08, .09); },   /* 噗啾 */
    walk() { pluck(660, .04, .15); pluck(784, .04, .15, .1); },
    got() { [784, 988, 1175, 1568].forEach((f, i) => pluck(f, .12, .5, i * .09)); glide(1000, 2400, .06, .22, .38); pluck(2349, .05, .4, .5); },   /* 叮叮叮噹～ 收到了 */
    wake() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => pluck(f, .08, .4, i * .08)); glide(500, 1100, .05, .2, .55); pluck(2093, .04, .5, .62); },
    oops() { glide(520, 400, .06, .16); glide(430, 330, .06, .2, .14); },   /* 呃喔～（軟軟的，不是警告聲） */
    note() { pluck(1175, .06, .22); pluck(1568, .05, .26, .09); }
  };
  /* 防護：手機自己發出聲音（提示音、鎖定音）的當下與之後 0.9 秒，偵測先不算，避免把自己的聲音當成花 */
  Object.keys(sfx).forEach(k => { const f = sfx[k]; if (typeof f === 'function') sfx[k] = function () { A.selfUntil = Date.now() + 900; return f.apply(this, arguments); }; });
  const BCOL = ['#F9B3D1', '#B5E3C2', '#FBC38A', '#9ED8EA'];
  function burst(x, y, n, spread) {
    const host = $('#fx');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'), a = Math.random() * Math.PI * 2, d = (spread || 110) * (.45 + Math.random() * .75);
      p.className = 'bp' + (i % 3 === 0 ? ' o' : ''); p.style.left = (x - 6) + 'px'; p.style.top = (y - 6) + 'px'; p.style.setProperty('--pc', BCOL[i % 4]);
      p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px'); p.style.setProperty('--dy', (Math.sin(a) * d - 20).toFixed(0) + 'px');
      p.style.width = p.style.height = (8 + Math.random() * 10).toFixed(0) + 'px'; host.appendChild(p); setTimeout(() => p.remove(), 1100);
    }
  }
  function fxEl(cls, c, x, y, text) {
    const d = document.createElement('div'); d.className = cls + ' l-' + c; if (x != null) { d.style.left = x + 'px'; d.style.top = y + 'px'; } if (text) d.textContent = text;
    $('#fx').appendChild(d); setTimeout(() => d.remove(), 1500); return d;
  }
  function banner(id, text, big) {
    const b = $('#banner'), n = N[id]; b.className = 'banner l-' + n.cls + (big ? ' big' : ''); b.hidden = false;
    b.innerHTML = '<span class="bd">' + icon(n.icon) + '</span><span>' + text + '</span>'; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, big ? 3200 : 2400);
  }
  function ptRect(id) { const g = document.querySelector('[data-id="' + id + '"]'); const r = g ? g.getBoundingClientRect() : null; return r ? [r.left + r.width / 2, r.top + r.height / 2] : [innerWidth / 2, innerHeight / 2]; }
  function celebrate(id, big) {
    const p = ptRect(id), n = N[id]; fxEl('flash', n.cls); fxEl('ring', n.cls, p[0], p[1]); fxEl('fl-t', n.cls, p[0], p[1] - 20, n.fx);
    banner(id, n.who + '：' + n.fx + '！', big); burst(p[0], p[1], 34, 150); sfx.wake(); try { navigator.vibrate && navigator.vibrate([40, 40, 80]); } catch (e) {}
  }

  /* ═════════ [P04] 聲音分析（麥克風 / 示範聲音共用） ═════════ */
  const A = { an: null, bus: null, mode: 'demo', base: .003, calibrated: false, last: { rms: 0, cen: 0 }, rec: null, src: null, stream: null, noise: null };
  A.init = () => {
    if (!ensureAudio()) return false;
    if (!A.an) {
      A.an = AC.createAnalyser(); A.an.fftSize = 2048; A.an.smoothingTimeConstant = 0; A.t = new Float32Array(2048); A.f = new Float32Array(1024);
      A.bus = AC.createGain(); A.mf = AC.createBiquadFilter(); A.mf.type = 'lowpass'; A.mf.frequency.value = 20000; A.mg = AC.createGain(); A.bus.connect(A.mf); A.mf.connect(A.mg); A.mg.connect(AC.destination); A.bus.connect(A.an);
      const b = AC.createBuffer(1, AC.sampleRate * 3, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; A.noise = b;
    }
    return true;
  };
  A.thr = () => A.mode === 'mic' ? Math.max(A.base * 2.2, .004) : Math.max(A.base * 3, .008);
  A.useDemo = () => { if (!A.init()) return; if (A.src) { A.src.disconnect(); A.src = null; } if (A.stream) { A.stream.getTracks().forEach(t => t.stop()); A.stream = null; } try { A.bus.connect(A.an); } catch (e) {} A.mode = 'demo'; };
  A.useMic = async () => {
    if (!A.init()) return false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      try { A.bus.disconnect(A.an); } catch (e) {} A.stream = s; A.src = AC.createMediaStreamSource(s); A.mic = AC.createGain(); A.mic.gain.value = 2.5; A.gv = 2.5; A.src.connect(A.mic); A.mic.connect(A.an); A.mode = 'mic'; return true;
    } catch (e) { return false; }
  };

  /* ═════════ [P05] MT_TRIAL 聲音比對（網址加 ?match=1 才啟用）：清晰度＝手機聽到的聲音跟範本有多像 ═════════ */
  const MT = { on: !/[?&]match=0/.test(location.search), k: 0, g: 0, tpl: {}, loading: null, node: null, mute: null, ring: null, pos: 0, filled: 0, iv: null, ids: ['0001', '0003'], bg: { '0001': .45, '0003': .10 }, bg0: { '0001': .45, '0003': .10 }, hist: { '0001': [], '0003': [] }, gh: [], env: '', fl: null, flId: (new URLSearchParams(location.search).get('flower') | 0) || 1, srv: false, msg: '', flIv: null, paused: false, flTrack: -1, flSince: 0, bh: [] };
  MT.active = () => MT.on && A.mode === 'mic' && !!MT.tpl['0001'] && !!MT.tpl['0003'];
  MT.lerp = (x, sr) => { const r = sr / 16000, n = Math.floor(x.length / r), o = new Float32Array(n); for (let i = 0; i < n; i++) { const a = Math.floor(i * r), b = Math.max(a + 1, Math.floor((i + 1) * r)); let s = 0; for (let k = a; k < b && k < x.length; k++) s += x[k]; o[i] = s / (b - a); } return o; };
  MT.to16k = async buf => {
    try {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new OAC(1, Math.ceil(buf.duration * 16000), 16000), s = oc.createBufferSource(); s.buffer = buf; s.connect(oc.destination); s.start(0);
      const out = await new Promise((res, rej) => { const p = oc.startRendering(); if (p && p.then) p.then(res, rej); oc.oncomplete = e => res(e.renderedBuffer); setTimeout(() => rej(new Error('timeout')), 8000); });
      return out.getChannelData(0);
    } catch (e) { return MT.lerp(buf.getChannelData(0), buf.sampleRate); }
  };
  MT.load = () => MT.loading || (MT.loading = (async () => {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    for (const id of MT.ids) {
      if (MT.tpl[id]) continue;
      const r = await fetch('st_' + id + '.mp3?v=' + Date.now()); if (!r.ok) throw new Error('範本讀不到 ' + id);
      const ab = await r.arrayBuffer(), b = await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
      MT.tpl[id] = SoundMatch.makeTemplate(await MT.to16k(b));
    }
    try { c.close(); } catch (e) {}
  })().catch(e => { MT.loading = null; console.warn('MT load', e); }));
  /* 向伺服器問這朵花現在播什麼（伺服器每秒去問花）。問不到就退回手機自己比對 */
  MT.pollFlower = async () => {
    const bases = MT.base ? [MT.base] : [NET.api, '/api', location.protocol === 'http:' ? 'http://' + location.hostname + ':8080/api' : 'https://' + location.hostname + ':8443/api'].filter(Boolean);
    for (const b of bases) {
      try {
        const c = new AbortController(), t = setTimeout(() => c.abort(), 1500), r = await fetch(b + '/flower?id=' + MT.flId, { cache: 'no-store', signal: c.signal }); clearTimeout(t);
        if (!r.ok) continue; const j = await r.json();
        if (j && (j.missing || j.track != null)) { MT.base = b; j.got = Date.now() - (j.age || 0); MT.fl = j; MT.paintFl(); return; }
      } catch (e) {}
    }
    MT.base = ''; MT.fl = null; MT.paintFl();
  };
  /* 花的連線狀態：ok＝伺服器確定花在播什麼；wait＝伺服器連得到、但查不到花；none＝連不到伺服器 */
  MT.link = () => {
    const f = MT.fl, now = Date.now(); if (!f) return 'none';
    if (f.missing || f.online === false || f.ready === false || now - f.got > 3500) return f.ready === false && !f.missing ? 'off' : 'wait';
    return 'ok';
  };
  MT.paintFl = () => {
    const e = document.getElementById('flst'); if (!e) return; const L = MT.link(), f = MT.fl; let t = '', c = '';
    if (L === 'ok') { c = f.phase === 'play' ? 'on' : 'rest'; t = f.phase === 'play' ? '花正在唱：' + (f.track === 1 ? '鳥叫聲' : f.track === 3 ? '小動物' : '聲音') : f.phase === 'silent' ? '花安靜一下下' : '花在換氣'; }
    else if (L === 'off') t = '花的小喇叭還沒醒'; else if (L === 'wait') t = '還找不到花的訊號'; else t = '連不到小鎮';
    e.className = c; e.textContent = t;
  };
  MT.start = () => {
    MT.stop(); MT.k = 0; MT.g = 0; MT.dwell = 0; MT.paused = false; MT.flTrack = -1; MT.bh = []; MT.sh = []; if (!MT.on) return; MT.load(); MT.pollFlower(); MT.flIv = setInterval(MT.pollFlower, 1000);
    if (A.mode !== 'mic' || !A.src || !AC) return;
    try {
      const len = Math.round(AC.sampleRate * 4); MT.ring = new Float32Array(len); MT.pos = 0; MT.filled = 0;
      MT.node = AC.createScriptProcessor(2048, 1, 1);
      MT.node.onaudioprocess = e => { const d = e.inputBuffer.getChannelData(0), R = MT.ring; for (let i = 0; i < d.length; i++) { R[MT.pos] = d[i]; MT.pos = (MT.pos + 1) % R.length; } MT.filled = Math.min(R.length, MT.filled + d.length); };
      MT.mute = AC.createGain(); MT.mute.gain.value = 0; A.src.connect(MT.node); MT.node.connect(MT.mute); MT.mute.connect(AC.destination);
      MT.iv = setInterval(MT.tick, 700);
    } catch (e) { console.warn('MT start', e); MT.stop(); }
  };
  MT.stop = () => { if (MT.flIv) clearInterval(MT.flIv); MT.flIv = null; MT.srv = false; MT.msg = ''; if (MT.iv) clearInterval(MT.iv); MT.iv = null; try { if (MT.node) { MT.node.onaudioprocess = null; MT.node.disconnect(); } if (A.src && MT.node) A.src.disconnect(MT.node); if (MT.mute) MT.mute.disconnect(); } catch (e) {} MT.node = null; MT.mute = null; MT.k = 0; MT.g = 0; };
  /* 每 0.7 秒判斷一次。伺服器說這朵花在播什麼，手機只回答兩件事：1) 比環境底噪大聲多少（SNR）2) 像不像那一首（範本分數）。
     環境底噪在花「換氣／安靜」時量（那時花確定沒聲音），所以不管現場多吵都會自動校正。 */
  const SIGB = [3, 4, 5, 6, 7, 8, 9, 10, 11];              // 約 500～4500 Hz：小喇叭推得出來的範圍
  const sigSum = v => { let t = 0; SIGB.forEach(b => { t += v[b]; }); return t; };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  MT.nf = null; MT.nfAt = 0; MT.phSince = 0; MT.phase = ''; MT.snr = 0;
  const FREE = /[?&]free=1/.test(location.search), DBG = /[?&]dbg=1/.test(location.search);
  MT.tick = () => {
    if (MT.paused) { MT.k = 0; MT.g = 0; MT.gh = []; return; }
    if (!MT.active() || !MT.ring || MT.filled < AC.sampleRate * 2) return;
    const R = MT.ring, n = MT.filled, out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = R[(MT.pos - n + i + R.length * 2) % R.length];
    const x = MT.lerp(out, AC.sampleRate), res = SoundMatch.query(x, MT.tpl); if (!res || !res.scores) return;
    const now = Date.now();
    if (now < (A.selfUntil || 0)) { MT.k *= .5; return; }   // 防護：自己的提示音期間不算
    { let pkN = 0; const m = Math.min(n, Math.round(AC.sampleRate * 1.2)); for (let i = n - m; i < n; i++) { const v = Math.abs(out[i]); if (v > pkN) pkN = v; } MT.clip = pkN > .95; MT.pk = pkN; }   // 防護：爆音（喇叭貼太近、對著麥克風吹）
    /* 1. 環境吵雜度（10% 最安靜的 50 毫秒） */
    const fr = []; for (let i = 0; i + 800 <= x.length; i += 800) { let q = 0; for (let j = i; j < i + 800; j++) q += x[j] * x[j]; fr.push(10 * Math.log10(q / 800 + 1e-12)); }
    fr.sort((a, b) => a - b); const p10 = fr[Math.floor(fr.length * .1)] || -80; MT.env = p10 <= -60 ? '安靜' : p10 <= -50 ? '普通' : '吵';
    /* 2. 最近 1.2 秒各頻段能量，和各頻段的底噪 */
    const last = x.slice(Math.max(0, x.length - 25600)), F = SoundMatch.features(last), nb = F.length ? F[0].length : 14, cur = new Float64Array(nb);
    F.forEach(r => { for (let b = 0; b < nb; b++) cur[b] += r[b] / F.length; });
    const auto = new Float64Array(nb); { const E = SoundMatch.features(x); for (let b = 0; b < nb; b++) { const col = E.map(r => r[b]).sort((p, q) => p - q); auto[b] = col[Math.floor(col.length * .15)] || 1e-9; } }   // 備用底噪：最安靜的 15%
    /* 3. 伺服器資料 */
    const fl = MT.link() === 'ok' ? MT.fl : null, exp = fl ? ({ 1: '0001', 3: '0003' })[fl.track] : null, ph = fl ? fl.phase : '';
    if (fl && (ph !== MT.phase || fl.track !== MT.flTrack || (fl.seq | 0) !== MT.flSeq)) { if (fl.track !== MT.flTrack || (fl.seq | 0) !== MT.flSeq) { MT.flTrack = fl.track; MT.flSeq = fl.seq | 0; MT.flSince = now; MT.gh = []; } MT.phase = ph; MT.phSince = now; }
    if (!fl) MT.phase = '';
    MT.srv = false; MT.msg = ''; MT.dm = ''; MT.gapHold = false;
    if (fl && ph !== 'play' && now - MT.phSince > 2200) {   // 花確定沒聲音超過 2.2 秒：此時最近 1.2 秒就是純環境，拿來更新底噪
      if (!MT.nf) MT.nf = Float64Array.from(cur); else for (let b = 0; b < nb; b++) MT.nf[b] = MT.nf[b] * .5 + cur[b] * .5; MT.nfAt = now;
    }
    const nfU = MT.nf && now - MT.nfAt < 40000 ? MT.nf : auto;      // 40 秒內量過才用（現場人聲、環境變化快，太舊的底噪會讓別的聲音被當成花），否則用備用底噪
    /* 加權 SNR：用那一首的頻譜形狀當權重（只看它真正有能量的頻段），遠一點、聲音很小時比單純加總更容易看出來 */
    const wv = exp && MT.tpl[exp] && MT.tpl[exp].prof ? SIGB.map(b => Math.exp(MT.tpl[exp].prof[b])) : null;
    const wsum = v => { if (!wv) return sigSum(v); let t = 0; SIGB.forEach((b, i) => { t += v[b] * wv[i]; }); return t; };
    const snrRaw = 10 * Math.log10((wsum(cur) + 1e-12) / (wsum(nfU) + 1e-12));
    MT.sh = MT.sh || []; MT.sh.push(snrRaw); if (MT.sh.length > 5) MT.sh.shift();
    const snr = Math.min(snrRaw, MT.sh.slice().sort((a, b) => a - b)[MT.sh.length >> 1] + 6); MT.snr = snr;   // 抗雜訊：單次突然冒出的大聲（拍手、碰撞、說話）最多只比最近的中位數高 6 dB，不會一下就衝滿
    const lowRise = (cur[0] + cur[1] + cur[2] + 1e-12) / (nfU[0] + nfU[1] + nfU[2] + 1e-12);   // 低頻突然變大＝手在碰手機／風／車聲，不是花
    const kSnr = clamp01((snr - (p10 > -32 ? 2 : 1)) / 4);   // 越吵，門檻越高                           // 高於底噪 1.5 dB 開始有感覺，7.5 dB 算滿（遠一點也收得到）
    /* 4. 範本分數（只看伺服器說的那一首），背景分數自動校正 */
    MT.ids.forEach(id => { const h = MT.hist[id]; h.push([now, res.scores[id].score]); while (h.length && now - h[0][0] > 40000) h.shift();
      if (h.length >= 8) { const mn = Math.min.apply(null, h.map(v => v[1])); MT.bg[id] = Math.max(MT.bg0[id] * .6, Math.min(MT.bg0[id] + .06, mn + .03)); } });
    MT.dwell = MT.dwell || 0; if (snr >= 1 && !MT.clip) MT.dwell += .7 * LVF[Math.min(2, NET.lv | 0)]; else MT.dwell = Math.max(0, MT.dwell - .35);   // 靠近（比底噪大聲）一陣子就累積
    const kDwell = clamp01(MT.dwell / 3.5) * 1.1;
    let best = -1, bid = '', kRaw = 0;
    if (fl && ph === 'play' && exp && now - MT.flSince < 900) {          // 剛換聲音 1.6 秒內：緩衝還混著上一首，不判
      MT.dm = '剛換聲音'; kRaw = 0; MT.gapHold = true;
    } else if (fl && (ph !== 'play' || !exp)) {                          // 花沒聲音
      MT.dm = ph === 'warn' ? '換氣' : ph === 'silent' ? '安靜' : '沒聲音'; kRaw = 0; MT.gapHold = true;
    } else if (fl) {                                                      // 花正在播 exp
      MT.srv = true; bid = exp; best = res.scores[exp].score - MT.bg[exp];
      MT.gh.push(best); if (MT.gh.length > 3) MT.gh.shift(); best = MT.gh.slice().sort((a, b) => a - b)[MT.gh.length >> 1];
      const kT = clamp01(best / .11);   // 伺服器已確認這朵花正在播哪一首：手機只要確認「聽得到聲音變大」就夠，不再硬比對波形
      kRaw = 1.25 * (.85 * kSnr + .15 * kT);
      if (snr < .5) kRaw = Math.min(kRaw, .25);                                 // 幾乎沒比底噪大聲：還不夠近
      if (lowRise > 10 && snr < 3) kRaw = Math.min(kRaw, .2);                     // 只有低頻變大：手在碰手機／風，不算
      if (p10 > -32 && snr < 4) kRaw = Math.min(kRaw, .6);                       // 環境太吵且聲音不夠突出：不給鎖定
      kRaw = Math.max(kRaw, kDwell);                                            // 保底：靠近花待一陣子（約 3.5 秒）就算收到，不靠波形
      if (MT.clip) kRaw = Math.min(kRaw, .3);                                    // 爆音：不給鎖定
      if (MT.clip) MT.msg = '太大聲了，離花遠一點';
      else if (p10 > -32) MT.msg = '周圍聲音很多，靠花近一點再搜尋';
      else if (kSnr < .25) MT.msg = '還太遠，再靠近花一點';
      else if (kRaw < .85) MT.msg = '快到了，保持住';
    } else if (!FREE) {                                                   // 沒有伺服器確認：先用「靠近待一陣子」判斷，聲音取最像的那一首
      const gs0 = MT.ids.map(id => [id, res.scores[id].score - MT.bg[id]]).sort((a, c) => c[1] - a[1]); bid = gs0[0][0]; best = Math.max(0, gs0[0][1]);
      kRaw = kDwell; if (MT.clip) kRaw = Math.min(kRaw, .3);
      MT.dm = ''; MT.msg = kSnr < .25 ? '還太遠，再靠近花一點' : kRaw < .85 ? '快到了，保持住' : '';
    } else {                                                              // ?free=1：自己測試用，手機自己猜
      const gs = MT.ids.map(id => [id, res.scores[id].score - MT.bg[id]]).sort((a, b) => b[1] - a[1]);
      MT.bh.push(gs[0][1] >= .08 && gs[0][1] - gs[1][1] >= .05 ? gs[0][0] : ''); if (MT.bh.length > 5) MT.bh.shift();
      const sb = MT.bh.filter(v => v === gs[0][0]).length;
      if (MT.bh[MT.bh.length - 1] && sb >= 4) { best = gs[0][1]; bid = gs[0][0]; kRaw = clamp01(best / .11); if (MT.clip || p10 > -40) kRaw = Math.min(kRaw, .6); } else { best = Math.min(gs[0][1], .04); MT.msg = MT.link() === 'off' ? '花的小喇叭還沒醒，請工作人員看一下' : MT.link() === 'wait' ? '還找不到花的訊號，靠近花再試試' : '還不確定是什麼聲音，再靠近一點'; kRaw = 0; }
    }
    MT.g = best; MT.bid = bid;
    if (MT.gapHold) MT.k *= .96; else MT.k = MT.k * .35 + clamp01(kRaw) * .65;   // 花在換氣／安靜：進度慢慢退，不歸零，下一段響起可以接著累積（一段只有 5 秒，不然很難收滿）
    const e = $('#mtdbg'); if (e) e.textContent = bid ? '搜尋到聲音了' : '搜尋中…'; window.__mt = { bid, gain: best, snr, k: MT.k, env: MT.env };
    if (DBG) { let d = document.getElementById('mtdbg2'); if (!d) { d = document.createElement('pre'); d.id = 'mtdbg2'; d.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;margin:0;padding:6px 8px;font:11px/1.35 monospace;background:rgba(0,0,0,.72);color:#fff;border-radius:8px;pointer-events:none;white-space:pre'; document.body.appendChild(d); } d.textContent = 'link ' + MT.link() + '  phase ' + (ph || '-') + '  track ' + (fl ? fl.track : '-') + '  age ' + (MT.fl ? Math.round(now - MT.fl.got) : '-') + '\nsnr ' + snr.toFixed(1) + '  raw ' + snrRaw.toFixed(1) + '  p10 ' + p10.toFixed(0) + '  low ' + lowRise.toFixed(1) + '\nkSnr ' + kSnr.toFixed(2) + '  kRaw ' + kRaw.toFixed(2) + '  k ' + MT.k.toFixed(2) + '  best ' + (best || 0).toFixed(3) + '\nnf ' + (MT.nf && now - MT.nfAt < 40000 ? Math.round((now - MT.nfAt) / 1000) + 's' : 'auto') + '  clip ' + (MT.clip ? 1 : 0) + '  gap ' + (MT.gapHold ? 1 : 0) + '  hold ' + (LV.hold | 0) + '  lock ' + (LV.lock ? 1 : 0) + '\n' + (MT.dm || MT.msg || ''); }   // 詳細數字不顯示在手機上
  };

  const CLIPS = {};   // 卡片 id -> { d: Float32Array, sr }，只存在這個頁面的記憶體
  MT.grab = c => {
    try {
      if (!MT.ring || !AC) return; const R = MT.ring, n = Math.min(MT.filled, Math.round(AC.sampleRate * 3)), d = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = R[(MT.pos - n + i + R.length * 2) % R.length];
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); CLIPS[c.id] = { d, sr: AC.sampleRate, pk: Math.max(pk, 1e-4) };
    } catch (e) {}
  };
  MT.waveHTML = c => {
    const k = CLIPS[c.id]; if (!k) return ''; const B = 48, st = Math.floor(k.d.length / B); let p = '';
    for (let i = 0; i < B; i++) { let m = 0; for (let j = i * st; j < (i + 1) * st; j++) m = Math.max(m, Math.abs(k.d[j])); const h = Math.max(2, Math.min(30, m / k.pk * 30)); p += '<rect x="' + (i * 6) + '" y="' + (16 - h / 2).toFixed(1) + '" width="4" height="' + h.toFixed(1) + '" rx="2"/>'; }
    return '<span class="clipw"><button class="clipb" type="button" data-clip="' + c.id + '" aria-label="播放這個聲音">▶ 聽這個聲音</button><svg viewBox="0 0 288 32" width="100%" height="32" fill="currentColor" aria-hidden="true">' + p + '</svg></span>';
  };
  MT.playClip = id => {
    const k = CLIPS[id]; if (!k || !AC) return; try {
      if (AC.state === 'suspended') AC.resume(); const b = AC.createBuffer(1, k.d.length, k.sr); b.copyToChannel(k.d, 0); const src = AC.createBufferSource(), g = AC.createGain();
      src.buffer = b; g.gain.value = Math.min(25, .8 / k.pk); src.connect(g); g.connect(AC.destination); src.start();
    } catch (e) {}
  };
  MT.bindClips = root => { (root || document).querySelectorAll('[data-clip]').forEach(b => { if (b.__b) return; b.__b = 1; b.addEventListener('click', ev => { ev.stopPropagation(); MT.playClip(Number(b.getAttribute('data-clip'))); }); }); };
  setInterval(() => {
    if (!A.an || (!A.rec && !LV.on)) return;
    A.an.getFloatTimeDomainData(A.t); let s = 0; for (let i = 0; i < A.t.length; i++) s += A.t[i] * A.t[i]; const rms = Math.sqrt(s / A.t.length);
    A.an.getFloatFrequencyData(A.f); const bw = AC.sampleRate / A.an.fftSize; let n = 0, d = 0;
    for (let i = 2; i < 256; i++) { const m = Math.pow(10, A.f[i] / 20); n += m * i * bw; d += m; }
    A.last = { rms, cen: d > 0 ? n / d : 0 }; if (A.rec) A.rec.push(A.last); paintLive();
  }, 50);
  const dbOf = r => Math.max(0, 20 * Math.log10(Math.max(r, 1e-5) / A.base));
  const pitchOf = c => c < TH.low ? '低' : c > TH.high ? '高' : '中';
  function paintLive() {
    const l = A.last, db = dbOf(l.rms), on = l.rms > A.thr();
    $$('.mtl').forEach(e => { e.style.width = Math.min(100, db / 50 * 100) + '%'; });
    $$('.mtx').forEach(e => { e.textContent = on ? Math.round(db) + ' dB　' + (l.cen | 0) + ' Hz · ' + pitchOf(l.cen) : '很安靜'; });
    $$('#meter i').forEach((e, i) => { e.style.height = (4 + Math.max(0, Math.min(1, db / 50 - i * .12)) * 14) + 'px'; });
  }
  function record(ms, tick) { return new Promise(res => { A.rec = []; const t0 = performance.now(); const iv = setInterval(() => { const p = Math.min(1, (performance.now() - t0) / ms); if (tick) tick(p); if (p >= 1) { clearInterval(iv); const r = A.rec; A.rec = null; res(r); } }, 50); }); }
  async function calibrate(tick) {
    const fr = await record(3000, tick), r = fr.map(f => f.rms).sort((a, b) => a - b); A.base = Math.max(.0015, r[r.length >> 1] || 0); A.calibrated = true; return A.base;
  }
  function analyse(fr, loudDb) {
    const thr = MT.active() ? .0012 : A.thr(); let act = fr.map(f => f.rms > thr);
    for (let i = 0; i < act.length; i++) if (!act[i]) { let j = i; while (j < act.length && !act[j]) j++; if (i > 0 && j < act.length && j - i <= 2) for (let k = i; k < j; k++) act[k] = true; i = j; }
    const na = act.filter(Boolean).length, ratio = na / (act.length || 1), mx = Math.max(0, ...fr.map(f => f.rms)), af = fr.filter((f, i) => act[i]);
    const mean = af.length ? Math.sqrt(af.reduce((s, f) => s + f.rms * f.rms, 0) / af.length) : 0, db = mean ? 20 * Math.log10(mean / A.base) : 0;
    const out = { ratio, db, mx, onsets: 0, burst: 0, cen: 0, spread: 1 };
    if (mx > .45 * (A.mode === 'mic' ? (A.gv || 1) : 1) || (!MT.active() && db > loudDb)) return Object.assign(out, { bad: 'loud' });
    if (af.length < 1) return Object.assign(out, { bad: 'quiet' });
    const b = []; let c = 0; for (const a of act) { if (a) c++; else if (c) { b.push(c); c = 0; } } if (c) b.push(c);
    out.onsets = b.length; out.burst = b.reduce((s, x) => s + x, 0) / b.length * 50;
    const cs = af.map(f => f.cen).sort((x, y) => x - y), q = p => cs[Math.min(cs.length - 1, Math.floor(cs.length * p))];
    out.cen = q(.5); out.spread = q(.9) / Math.max(60, q(.1));
    const rhythm = ratio >= TH.cont ? '連續' : out.burst <= TH.burst ? '一下一下' : '一陣一陣', pitch = pitchOf(out.cen), weight = db < TH.light ? '輕' : db < TH.heavy ? '中' : '重', wide = out.spread > TH.spread;
    let name = '說不出來的聲音';
    if (rhythm === '一下一下') name = weight === '重' ? '咚咚一下' : '小小一下';
    else if (rhythm === '連續') { if (weight === '輕') name = '悄悄流動'; else if (pitch === '低') name = '低低不停'; }
    else if (wide) name = '熱鬧一陣';
    return Object.assign(out, { rhythm, pitch, weight, wide, name });
  }

  /* ═════════ [P06] 合成聲音庫（2026-11-15）：示範模式用程式做的聲音當「花的聲音」，主聲＋細聲疊在一起 ═════════ */
  const SYN = (function () {
var AC, out, noiseB, S5 = [0, 2, 4, 7, 9];
function f5(base,deg){return base*Math.pow(2,(S5[deg%5]+12*Math.floor(deg/5))/12)}
function R(a,b){return a+Math.random()*(b-a)}
function env(t,vol,att,dur){var g=AC.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+att);g.gain.exponentialRampToValueAtTime(.0001,t+dur);return g}
function pan(g,p){var n=AC.createStereoPanner?AC.createStereoPanner():null;if(n){n.pan.value=p;g.connect(n);n.connect(out)}else g.connect(out)}
// 風鈴：金屬棒的非整數倍泛音，長長的餘韻
function chime(t){var f=f5(1046.5,(Math.random()*5)|0),p=R(-.6,.6);[[1,1,2.6],[2.76,.5,1.6],[5.4,.25,.9],[8.93,.12,.5]].forEach(function(x){var o=AC.createOscillator(),g=env(t,.07*x[1],.004,x[2]);o.frequency.value=f*x[0];o.connect(g);pan(g,p);o.start(t);o.stop(t+x[2]+.1)})}
// 水滴：很快往上滑的短音
function drop(t){var f=f5(700,(Math.random()*5)|0),p=R(-.7,.7),o=AC.createOscillator(),g=env(t,.12,.003,.16);o.frequency.setValueAtTime(f*.8,t);o.frequency.exponentialRampToValueAtTime(f*1.5,t+.07);o.connect(g);pan(g,p);o.start(t);o.stop(t+.2);if(Math.random()<.4){var o2=AC.createOscillator(),g2=env(t+.12,.04,.003,.12);o2.frequency.setValueAtTime(f*.8,t+.12);o2.frequency.exponentialRampToValueAtTime(f*1.5,t+.19);o2.connect(g2);pan(g2,p);o2.start(t+.12);o2.stop(t+.3)}}
// 鳥叫：幾聲快速的頻率掃動，帶一點抖音
function bird(t){var p=R(-.7,.7),n=2+((Math.random()*4)|0),f=R(2600,3800),k;for(k=0;k<n;k++){var s=t+k*R(.09,.14),o=AC.createOscillator(),l=AC.createOscillator(),lg=AC.createGain(),g=env(s,.06,.012,.1);o.frequency.setValueAtTime(f,s);o.frequency.exponentialRampToValueAtTime(f*R(1.15,1.5),s+.08);l.frequency.value=R(30,50);lg.gain.value=80;l.connect(lg);lg.connect(o.frequency);o.connect(g);pan(g,p);o.start(s);o.stop(s+.14);l.start(s);l.stop(s+.14);f*=R(.92,1.08)}}
// 時鐘：滴、答兩種音色
var ctick=0;function clock(t){var s=AC.createBufferSource(),b=AC.createBiquadFilter(),g=env(t,.5,.001,.03);b.type='bandpass';b.frequency.value=(ctick++%2)?1900:2500;b.Q.value=4;s.buffer=noiseB;s.connect(b);b.connect(g);pan(g,0);s.start(t,Math.random(),.05)}
// 氣泡：低一點、慢一點的往上滑
function bubble(t){var f=R(220,420),p=R(-.5,.5),o=AC.createOscillator(),g=env(t,.14,.004,.12);o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*2.2,t+.09);o.connect(g);pan(g,p);o.start(t);o.stop(t+.2)}
// 風：慢慢變化的濾波雜訊
var windNode=null;function windStart(){var s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=noiseB;s.loop=true;f.type='bandpass';f.frequency.value=500;f.Q.value=.8;g.gain.value=.0;s.connect(f);f.connect(g);g.connect(out);s.start();windNode={s:s,f:f,g:g,iv:setInterval(function(){var t=AC.currentTime;f.frequency.setTargetAtTime(R(250,1100),t,1.2);g.gain.setTargetAtTime(R(.04,.16),t,1.4)},1800)};g.gain.value=.08}
function windStop(){if(!windNode)return;clearInterval(windNode.iv);windNode.g.gain.setTargetAtTime(0,AC.currentTime,.2);var w=windNode;setTimeout(function(){w.s.stop()},800);windNode=null}
// 新增 10 組聲音
function noiseSrc(t,dur,ft,fq,q,vol,p,att){var s=AC.createBufferSource(),b=AC.createBiquadFilter(),g=env(t,vol,att||.001,dur);b.type=ft;b.frequency.value=fq;b.Q.value=q;s.buffer=noiseB;s.connect(b);b.connect(g);pan(g,p||0);s.start(t,Math.random(),dur+.05)}
// 雨：持續的高頻雜訊＋隨機小水珠
function rainStart(){var s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=noiseB;s.loop=true;f.type='bandpass';f.frequency.value=5200;f.Q.value=.4;g.gain.value=.1;s.connect(f);f.connect(g);g.connect(out);s.start();var iv=setInterval(function(){noiseSrc(AC.currentTime+.02,.03,'bandpass',R(4000,8000),3,.12,R(-.8,.8))},70);return function(){clearInterval(iv);g.gain.setTargetAtTime(0,AC.currentTime,.2);setTimeout(function(){s.stop()},800)}}
// 海浪：低頻雜訊，音量隨慢速波浪起伏
function seaStart(){var s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain(),l=AC.createOscillator(),lg=AC.createGain();s.buffer=noiseB;s.loop=true;f.type='lowpass';f.frequency.value=700;g.gain.value=.11;l.frequency.value=.13;lg.gain.value=.09;l.connect(lg);lg.connect(g.gain);s.connect(f);f.connect(g);g.connect(out);s.start();l.start();return function(){g.gain.setTargetAtTime(0,AC.currentTime,.2);setTimeout(function(){s.stop();l.stop()},800)}}
// 蟲鳴：一串很快的高頻短音
function cricket(t){var p=R(-.8,.8),f=R(4200,5000),k;for(k=0;k<4;k++){var s=t+k*.07,o=AC.createOscillator(),g=env(s,.05,.006,.04);o.frequency.value=f;o.connect(g);pan(g,p);o.start(s);o.stop(s+.06)}}
// 青蛙：低頻方波＋快速顫動
function frog(t){var p=R(-.7,.7),n=1+((Math.random()*2)|0),k;for(k=0;k<n;k++){var s=t+k*.2,o=AC.createOscillator(),f=AC.createBiquadFilter(),l=AC.createOscillator(),lg=AC.createGain(),g=env(s,.12,.01,.16);o.type='square';o.frequency.setValueAtTime(R(150,190),s);o.frequency.exponentialRampToValueAtTime(95,s+.15);f.type='lowpass';f.frequency.value=800;l.frequency.value=48;lg.gain.value=40;l.connect(lg);lg.connect(o.frequency);o.connect(f);f.connect(g);pan(g,p);o.start(s);o.stop(s+.2);l.start(s);l.stop(s+.2)}}
// 木魚：短短的「叩」，音高落在五聲音階
function wood(t){var f=f5(520,(Math.random()*5)|0),o=AC.createOscillator(),g=env(t,.2,.001,.14);o.frequency.setValueAtTime(f*1.25,t);o.frequency.exponentialRampToValueAtTime(f,t+.03);o.connect(g);pan(g,R(-.4,.4));o.start(t);o.stop(t+.18);noiseSrc(t,.02,'bandpass',2200,2,.12)}
// 腳踏車鈴：高頻非整數倍泛音，叮鈴叮鈴
function bike(t){var k,n=2+((Math.random()*2)|0);for(k=0;k<n;k++){var s=t+k*.14;[[3150,1],[4760,.6],[7800,.25]].forEach(function(x){var o=AC.createOscillator(),g=env(s,.05*x[1],.002,.5);o.frequency.value=x[0];o.connect(g);pan(g,.2);o.start(s);o.stop(s+.6)})}}
// 鐘聲：低沉的鐘，多個泛音、很長的餘韻
function bell(t){var f=f5(196,(Math.random()*5)|0),p=R(-.3,.3);[[.5,1,4],[1,1,3.5],[1.19,.6,3],[1.56,.4,2.4],[2,.5,2.2],[2.51,.25,1.6],[3.2,.15,1.2]].forEach(function(x){var o=AC.createOscillator(),g=env(t,.07*x[1],.004,x[2]);o.frequency.value=f*x[0];o.connect(g);pan(g,p);o.start(t);o.stop(t+x[2]+.1)})}
// 火堆：不規則的短雜訊爆裂
function fire(t){var n=2+((Math.random()*4)|0),k;for(k=0;k<n;k++)noiseSrc(t+k*R(.02,.12),R(.01,.04),'highpass',R(1500,4500),.7,R(.1,.35),R(-.5,.5))}
// 貓頭鷹：兩聲低低的「咕～咕」
function owl(t){var p=R(-.5,.5),k;for(k=0;k<2;k++){var s=t+k*.55,o=AC.createOscillator(),g=env(s,.14,.12,.4);o.frequency.setValueAtTime(R(380,430),s);o.frequency.exponentialRampToValueAtTime(330,s+.4);o.connect(g);pan(g,p);o.start(s);o.stop(s+.45)}}
// 小雞：很短很高的啾啾
function chick(t){var p=R(-.7,.7),n=2+((Math.random()*3)|0),k;for(k=0;k<n;k++){var s=t+k*.12,o=AC.createOscillator(),g=env(s,.07,.005,.07);o.frequency.setValueAtTime(R(3000,3600),s);o.frequency.exponentialRampToValueAtTime(R(4200,5000),s+.05);o.connect(g);pan(g,p);o.start(s);o.stop(s+.09)}}

function frog(t){var p=R(-.7,.7),n=2+((Math.random()*2)|0),k,base=R(270,350);for(k=0;k<n;k++){var last=(k==n-1),d=last?.2:.11,s=t+k*R(.17,.22),o=AC.createOscillator(),f1=AC.createBiquadFilter(),f2=AC.createBiquadFilter(),g2=AC.createGain(),l=AC.createOscillator(),lg=AC.createGain(),m=AC.createGain(),g=env(s,.17,.01,d+.05);o.type='sawtooth';o.frequency.setValueAtTime(base*.8,s);o.frequency.exponentialRampToValueAtTime(base*(last?1.35:1.15),s+d*.55);o.frequency.exponentialRampToValueAtTime(base*.95,s+d);f1.type='bandpass';f1.frequency.value=850;f1.Q.value=4;f2.type='bandpass';f2.frequency.value=2300;f2.Q.value=5;g2.gain.value=.45;l.frequency.value=R(48,66);lg.gain.value=.5;m.gain.value=.5;l.connect(lg);lg.connect(m.gain);o.connect(f1);o.connect(f2);f1.connect(m);f2.connect(g2);g2.connect(m);m.connect(g);pan(g,p);o.start(s);o.stop(s+d+.06);l.start(s);l.stop(s+d+.06);base*=R(.96,1.04)}}
function owl(t){var p=R(-.5,.5),k,n=2+((Math.random()*2)|0),f=R(360,440);for(k=0;k<n;k++){var s=t+k*(k==0?.0:.5),o=AC.createOscillator(),v=AC.createOscillator(),vg=AC.createGain(),g=env(s,.1,.14,.42);o.frequency.setValueAtTime(f*(k?.93:1),s);o.frequency.exponentialRampToValueAtTime(f*(k?.8:.88),s+.4);v.frequency.value=5;vg.gain.value=6;v.connect(vg);vg.connect(o.frequency);o.connect(g);pan(g,p);o.start(s);o.stop(s+.45);v.start(s);v.stop(s+.45);noiseSrc(s,.35,'bandpass',f*2,2,.015,p,.1)}}

function windCont(){var s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=noiseB;s.loop=true;f.type='bandpass';f.frequency.value=500;f.Q.value=.8;g.gain.value=.08;s.connect(f);f.connect(g);g.connect(out);s.start();var iv=setInterval(function(){var t=AC.currentTime;f.frequency.setTargetAtTime(R(250,1100),t,1.2);g.gain.setTargetAtTime(R(.04,.16),t,1.4)},1800);return function(){clearInterval(iv);g.gain.setTargetAtTime(0,AC.currentTime,.2);setTimeout(function(){s.stop()},800)}}

// ═════ [P06b] 降頻聲與說不清的聲音（探測器找到的聲音，合成音；名字在 SKEY／SNAME） ═════
function down1(t){var k,p=R(-.5,.5);for(k=0;k<3;k++){var s=t+k*.35,o=AC.createOscillator(),g=env(s,.12,.01,.32);o.type='triangle';o.frequency.setValueAtTime(R(1300,1700),s);o.frequency.exponentialRampToValueAtTime(R(420,560),s+.28);o.connect(g);pan(g,p);o.start(s);o.stop(s+.36)}}
function down2(t){var k,p=R(-.4,.4),f=R(95,130);for(k=0;k<8;k++){var s=t+k*R(.12,.18),o=AC.createOscillator(),lf=AC.createBiquadFilter(),g=env(s,.13,.01,.11);o.type='sawtooth';o.frequency.value=f*R(.97,1.03);lf.type='lowpass';lf.frequency.value=700;o.connect(lf);lf.connect(g);pan(g,p);o.start(s);o.stop(s+.14)}}
function down3(t){var b=f5(220,(Math.random()*5)|0),p=R(-.4,.4);[1,1.005,1.5].forEach(function(m){var o=AC.createOscillator(),g=env(t,.07,.5,1.9);o.frequency.value=b*m;o.connect(g);pan(g,p);o.start(t);o.stop(t+2)})}
function odd1(t){var p=R(-.4,.4),o=AC.createOscillator(),m=AC.createOscillator(),mg=AC.createGain(),g=env(t,.15,.05,.9);o.frequency.setValueAtTime(R(150,200),t);o.frequency.exponentialRampToValueAtTime(90,t+.8);m.frequency.value=18;mg.gain.value=60;m.connect(mg);mg.connect(o.frequency);o.connect(g);pan(g,p);o.start(t);m.start(t);o.stop(t+1);m.stop(t+1)}
function odd2(t){var k;for(k=0;k<2;k++)noiseSrc(t+k*.5,.42,'bandpass',R(600,1800),4,.28,R(-.6,.6),.12)}
function down4(t){var p=R(-.4,.4),o=AC.createOscillator(),v=AC.createOscillator(),vg=AC.createGain(),g=env(t,.2,.5,2.6);o.type='sine';o.frequency.setValueAtTime(R(200,240),t);o.frequency.exponentialRampToValueAtTime(R(85,105),t+2.4);v.frequency.value=4;vg.gain.value=7;v.connect(vg);vg.connect(o.frequency);o.connect(g);pan(g,p);o.start(t);v.start(t);o.stop(t+2.7);v.stop(t+2.7)}
function down5(t){var k,p=R(-.5,.5),b=R(150,210);for(k=0;k<3;k++){var s=t+k*R(.5,.8),o=AC.createOscillator(),g=env(s,.2,.006,.55);o.frequency.setValueAtTime(b*1.6,s);o.frequency.exponentialRampToValueAtTime(b*.7,s+.3);o.connect(g);pan(g,p);o.start(s);o.stop(s+.6)}}
function odd3(t){var k,p=R(-.5,.5);for(k=0;k<6;k++){var s=t+k*R(.07,.13),o=AC.createOscillator(),g=env(s,.12,.005,.1),f=R(300,520)*(1+k*.18);o.frequency.setValueAtTime(f,s);o.frequency.exponentialRampToValueAtTime(f*1.8,s+.08);o.connect(g);pan(g,p);o.start(s);o.stop(s+.12)}}
function odd4(t){var p=R(-.3,.3),b=R(520,700);[1,1.006,2.01].forEach(function(m,i){var o=AC.createOscillator(),g=env(t,.05/(i+1),.9,1.8);o.frequency.value=b*m;o.connect(g);pan(g,p);o.start(t);o.stop(t+1.9)});noiseSrc(t,1.6,'bandpass',3200,5,.05,p,.7)}
function odd5(t){var k,p=R(-.4,.4),b=R(330,420);for(k=0;k<5;k++){var s=t+k*.16,o=AC.createOscillator(),g=env(s,.12,.004,.22);o.type='triangle';o.frequency.value=f5(b,k);o.connect(g);pan(g,p);o.start(s);o.stop(s+.26)}}
var SND={down4:{n:'慢慢鯨歌',e:'',fn:down4,gap:function(){return R(3.5,6)}},down5:{n:'放慢雨滴',e:'',fn:down5,gap:function(){return R(3,5)}},odd3:{n:'冒泡泡',e:'',fn:odd3,gap:function(){return R(2,4)}},odd4:{n:'玻璃呼吸',e:'',fn:odd4,gap:function(){return R(2.5,4.5)}},odd5:{n:'爬樓梯',e:'',fn:odd5,gap:function(){return R(2.5,4)}},down1:{n:'降頻啾聲',e:'',fn:down1,gap:function(){return R(2,4)}},down2:{n:'低低震動',e:'',fn:down2,gap:function(){return R(2.5,4.5)}},down3:{n:'拉長和音',e:'',fn:down3,gap:function(){return R(3,5)}},odd1:{n:'咕嚕嚕',e:'',fn:odd1,gap:function(){return R(2.5,4.5)}},odd2:{n:'沙沙掃過',e:'',fn:odd2,gap:function(){return R(3,5)}},chime:{n:'風鈴',e:'🎐',fn:chime,gap:function(){return R(.8,2.4)}},drop:{n:'水滴',e:'💧',fn:drop,gap:function(){return R(.6,1.6)}},bird:{n:'鳥叫',e:'🐦',fn:bird,gap:function(){return R(1.2,3)}},clock:{n:'時鐘',e:'⏰',fn:clock,gap:function(){return .65}},cricket:{n:'蟲鳴',e:'🦗',fn:cricket,gap:function(){return R(.6,1.6)}},frog:{n:'青蛙',e:'🐸',fn:frog,gap:function(){return R(1.4,3)}},fire:{n:'火堆',e:'🔥',fn:fire,gap:function(){return R(.2,.7)}},owl:{n:'貓頭鷹',e:'🦉',fn:owl,gap:function(){return R(2.5,5)}},chick:{n:'小雞',e:'🐤',fn:chick,gap:function(){return R(1,2.2)}},bell:{n:'鐘聲',e:'🔔',fn:bell,gap:function(){return R(3,6)}},wind:{n:'風',e:'🍃',cont:windCont},rain:{n:'雨',e:'🌧️',cont:rainStart},sea:{n:'海浪',e:'🌊',cont:seaStart}};
var ENV={morning:{n:'早晨花',e:'☀️',pairs:[['bird','chime'],['clock','chime'],['chick','chime']]},rain:{n:'雨天花',e:'💧',pairs:[['rain','drop'],['rain','chime']]},night:{n:'夜晚花',e:'🌙',pairs:[['frog','cricket'],['fire','cricket'],['owl','cricket']]},sea:{n:'海邊花',e:'🐚',pairs:[['sea','bird'],['sea','chime'],['wind','bird']]}};
function bind(ctx) { AC = ctx; if (!noiseB) { var n = AC.sampleRate * 2; noiseB = AC.createBuffer(1, n, AC.sampleRate); var a = noiseB.getChannelData(0); for (var i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; } }
function loop(key, dest, slot) { var s = SND[key], sv; if (s.cont) { sv = out; out = dest; slot.stop = s.cont(); out = sv; return; } slot.on = true; (function go() { if (!slot.on) return; var sv2 = out; out = dest; try { s.fn(AC.currentTime + .05); } catch (e) {} out = sv2; slot.tm = setTimeout(go, s.gap() * 1000); })(); }
function halt(slot) { slot.on = false; clearTimeout(slot.tm); if (slot.stop) { try { slot.stop(); } catch (e) {} slot.stop = null; } }
return { ENV: ENV, SND: SND, bind: bind, loop: loop, halt: halt };
  })();
  const SYNP = {
    on: false, mk: '', fk: '', mn: '', fn: '', sm: {}, sf: {}, fg: null, mg: null, snap: null,
    start(k) {
      this.stop(); if (!A.init()) return; const p = k.split(':'), pr = SYN.ENV[p[1]].pairs[+p[2]]; SYN.bind(AC);
      this.mg = AC.createGain(); this.mg.gain.value = 1.3; this.mg.connect(A.bus); this.fg = AC.createGain(); this.fg.gain.value = .14; this.fg.connect(A.bus);
      this.mk = pr[0]; this.fk = pr[1]; this.mn = SYN.SND[pr[0]].n; this.fn = SYN.SND[pr[1]].n; this.sm = {}; this.sf = {}; this.on = true; this.snap = null;
      SYN.loop(this.mk, this.mg, this.sm); SYN.loop(this.fk, this.fg, this.sf);
    },
    stop() { if (!this.on) return; this.on = false; SYN.halt(this.sm); SYN.halt(this.sf); try { this.mg.disconnect(); this.fg.disconnect(); } catch (e) {} },
    tick(lock, lockAt) { if (!this.on) return; const r = lock ? clamp01((Date.now() - lockAt - 1500) / 2300) : 0; this.fg.gain.value = .14 + r * .9; }   // 鎖定後再穩 1.5～3.8 秒，細聲慢慢浮出來
  };
  const SYN_PADS = []; Object.keys(SYN.ENV).forEach(e => SYN.ENV[e].pairs.forEach((pr, i) => SYN_PADS.push(['syn:' + e + ':' + i, SYN.ENV[e].e + ' ' + SYN.SND[pr[0]].n + '＋' + SYN.SND[pr[1]].n])));
  const PADS = SYN_PADS.concat([['knock', '滴答聲'], ['light', '輕輕一聲'], ['thump', '咚咚聲'], ['stack', '熱熱鬧鬧'], ['tune', '嗡嗡聲'], ['calm', '輕輕水聲'], ['hhi', '高高哼聲'], ['hlo', '低低哼聲'], ['loud', '聲音太多']]);
  function play(k) {
    if (/^syn:/.test(k)) return;
    if (!A.init()) return; const c = AC, t = c.currentTime + .02, o = A.bus;
    const tick = (f, t0, pk, tau) => { const os = c.createOscillator(), g = c.createGain(); os.frequency.value = f; g.gain.setValueAtTime(pk, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + tau * 3); os.connect(g); g.connect(o); os.start(t0); os.stop(t0 + tau * 3 + .05); };
    const sus = (f, t0, d, pk, vib) => { const os = c.createOscillator(), g = c.createGain(); os.frequency.value = f; if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5; lg.gain.value = f * .03; l.connect(lg); lg.connect(os.frequency); l.start(t0); l.stop(t0 + d + .1); }
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(pk, t0 + .08); g.gain.setValueAtTime(pk, t0 + d - .12); g.gain.linearRampToValueAtTime(0, t0 + d); os.connect(g); g.connect(o); os.start(t0); os.stop(t0 + d + .05); };
    const nz = (t0, d, pk, f, q) => { const s = c.createBufferSource(), g = c.createGain(); s.buffer = A.noise; s.loop = true; let n = s; if (f) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; s.connect(b); n = b; }
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(pk, t0 + .08); g.gain.setValueAtTime(pk, t0 + d - .12); g.gain.linearRampToValueAtTime(0, t0 + d); n.connect(g); g.connect(o); s.start(t0); s.stop(t0 + d + .05); };
    if (k === 'knock') [.2, .9, 1.6, 2.3].forEach(x => tick(800, t + x, .07, .035));
    if (k === 'light') tick(900, t + .6, .07, .035);
    if (k === 'thump') [.3, 1.3].forEach(x => tick(160, t + x, .9, .08));
    if (k === 'stack') { sus(400, t + .1, .6, .15); sus(1200, t + .9, .6, .12); sus(2400, t + 1.7, .6, .08); }
    if (k === 'tune') { sus(130, t + .1, 2.7, .15); sus(260, t + .1, 2.7, .05); }
    if (k === 'calm') nz(t + .1, 2.7, .12, 700, 1);
    if (k === 'hhi') sus(1500, t + .1, 2.6, .12, true);
    if (k === 'hlo') sus(200, t + .1, 2.6, .12, true);
    if (k === 'loud') nz(t + .1, 1.5, .95);
  }
  const padsHTML = () => '<div class="pads2" data-pads>' + PADS.map(p => '<button class="btn btn-soft" type="button" data-pad="' + p[0] + '">' + p[1] + '</button>').join('') + '</div>';
  const kindOf = c => c.rhythm === '一下一下' ? (c.weight === '重' ? 'thump' : c.weight === '輕' ? 'light' : 'knock') : c.rhythm === '一陣一陣' ? 'stack' : c.weight === '輕' ? 'calm' : c.pitch === '高' ? 'hhi' : c.pitch === '低' ? 'tune' : 'hlo';
  const tagsHTML = c => '<span class="tag">' + c.rhythm + '</span> <span class="tag">' + c.pitch + (c.wide ? '・有高有低' : '') + '</span> <span class="tag">' + c.weight + '</span>';

  /* ═════════ [P07] 地圖 ═════════ */
  const near = (x, y) => ALL.filter(id => id in N && (N[id].main || S.sideOn)).map(id => N[id]).filter(n => Math.hypot(n.x - 30 - x, n.y + 22 - y) < 30 || Math.hypot(n.x - x, n.y - y) < 52)[0];
  function buildMap() {
    const pts = MAIN.map(id => { const n = N[id], w = 22 + n.name.length * 14;
      return '<g class="pt l-' + n.cls + ' st0" data-id="' + id + '" tabindex="0" role="button" aria-label="' + n.who + '" transform="translate(' + n.x + ' ' + n.y + ')"><circle class="hit" r="34" fill="transparent"/><circle class="ping" r="20"/>' +
        '<g class="body"><circle class="disc" r="21"/><use href="#i-' + n.icon + '" x="-14" y="-14" width="28" height="28"/></g><g class="spk"><circle cx="-10" cy="-24" r="3"/><circle cx="2" cy="-28" r="3"/><circle cx="14" cy="-24" r="3"/></g>' +
        '<g class="lab"><rect x="' + (-w / 2) + '" y="27" width="' + w + '" height="24" rx="12"/><text y="44">' + n.who + '</text></g></g>'; }).join('');
    const wk = SIDE.map(id => { const n = N[id]; return '<g class="wk l-' + n.cls + '" data-id="' + id + '" role="button" tabindex="0" aria-label="' + n.who + '" transform="translate(' + n.x + ' ' + n.y + ')" style="display:none"><circle r="24" fill="transparent"/><circle class="wkd" r="13"/><text y="5">' + n.ch + '</text></g>'; }).join('');
    $('#mapWrap').innerHTML = '<div class="vnote" id="vnote" hidden>還沒連上小鎮，先看看示範地圖</div><div class="vseg" id="vseg" hidden role="group" aria-label="切換畫面"><button type="button" data-v="0" aria-pressed="true">2D 地圖</button><button type="button" data-v="1" aria-pressed="false" id="uSeg">Unity 畫面</button></div><svg id="mapSvg" viewBox="0 0 320 290" role="img" aria-label="小鎮簡化地圖，有四位居民">' +
      '<rect width="320" height="290" fill="var(--t-house)"/><path d="M298 -10C270 50 330 100 298 150S262 240 304 300" fill="none" stroke="var(--h-river)" stroke-width="44" stroke-linecap="round"/>' +
      '<path d="M292 24C276 58 306 92 290 124M286 180C272 206 296 236 284 266" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="2 10"/>' +
      '<path d="M40 262C58 210 70 140 70 74M70 74C100 100 128 130 150 154M150 154C190 122 220 92 246 64M150 154C190 200 225 218 248 234" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/>' +
      emHTML() + wk + pts + '<g id="ltg"></g><circle id="wdot" class="wdot" r="7" cx="-20" cy="-20"/>' +
      '<g class="npc l-house" id="npc0" role="button" tabindex="0" aria-label="小葵 Ping" style="transform:translate(40px,200px)"><circle class="ear" r="17"/><circle r="24" fill="transparent"/><use href="#i-sprite" x="-12" y="-12" width="24" height="24" style="color:var(--c)"/></g>' +
      '<g class="op l-market" id="op1" data-f="1" role="button" tabindex="0" aria-label="小檸" style="transform:translate(60px,196px)"><circle class="frr" r="19"/><circle r="24" fill="transparent"/><use href="#i-sprite" x="-12" y="-12" width="24" height="24" style="color:var(--h-market)"/><text class="opn" y="26">小檸</text></g>' +
      '<g class="op l-river" id="op2" data-f="2" role="button" tabindex="0" aria-label="阿藍" style="transform:translate(236px,196px)"><circle class="frr" r="19"/><circle r="24" fill="transparent"/><use href="#i-sprite" x="-12" y="-12" width="24" height="24" style="color:var(--h-river)"/><text class="opn" y="26">阿藍</text></g>' +
      '<g id="me" style="transform:translate(' + ME0.x + 'px,' + ME0.y + 'px)"><circle class="halo" r="20"/><use href="#i-sprite" x="-15" y="-15" width="30" height="30" style="color:var(--h-' + ME + ')"/></g></svg><button class="camb" id="camBtn" type="button">看全景</button><iframe id="uFrame" title="Unity 遊戲即時畫面" hidden></iframe><div class="uq" id="uq" hidden></div><div class="dpad" id="dpad" hidden><div class="dgrp"><button type="button" class="dk" data-k="l" aria-label="向左轉"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="dk" data-k="r" aria-label="向右轉"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="dcap">轉身</span></div><div class="dgrp"><button type="button" class="dk" data-k="b" aria-label="後退"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="dk" data-k="f" aria-label="前進"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="dcap">後退／前進</span></div></div><div class="camarr" id="camArr" hidden></div>';
    $('#mapWrap').classList.add('hasseg'); netUi();
    $('#mapWrap').addEventListener('click', e => {
      if (S.screen !== 'explore' || S.view !== 'map') return;
      const vb = e.target.closest('.vseg button'); if (vb) { const v = Number(vb.getAttribute('data-v')); if (v === 1 && !NET.on) { toast('還沒連上遊戲，稍等一下會自動重試。'); return; } uSet(v); return; }
      if (e.target.closest('.vseg')) return;
      if (S.view === 'map' && $('#mapWrap').classList.contains('ufull')) return;
      if (e.target.closest('.camb')) { CAM.full = !CAM.full; $('#camBtn').textContent = CAM.full ? '跟著我' : '看全景'; return; }
      // (小 NPC 已移除)
      const fp = el => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform || ''); return m ? [Number(m[1]), Number(m[2])] : [S.me.x, S.me.y]; };
      const goF = (el, i) => { const p = fp(el); if (Math.hypot(p[0] - S.me.x, p[1] - S.me.y) < 52) { openFriend(i); return; } walkTo(p[0] - 30, p[1] + 22); S.goF = i; };
      if (e.target.closest('.npc')) { goF($('#npc0'), 0); return; }
      const np = e.target.closest('.nop'); if (np) { greetPid(np.getAttribute('data-pid')); return; }   // 點地圖上別的玩家＝打招呼
      const op = e.target.closest('.op'); if (op) { goF(op, Number(op.getAttribute('data-f'))); return; }
      const g = e.target.closest('.pt,.wk');
      if (g) { const n = N[g.getAttribute('data-id')]; if (near(S.me.x, S.me.y) === n) { arrive(); } else walkTo(n.x - 30, n.y + 22); return; }
      const svg = $('#mapSvg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); walkTo(q.x, q.y);
    });
  }
  function moveMe(x, y, dur) { const m = $('#me'); m.style.transitionDuration = dur ? dur + 's' : ''; m.style.transform = 'translate(' + x + 'px,' + y + 'px)'; S.me = { x, y }; }
  function walkTo(x, y) {
    S.goF = null; x = Math.max(14, Math.min(306, x)); y = Math.max(14, Math.min(276, y)); const d = Math.hypot(x - S.me.x, y - S.me.y), dur = Math.max(.45, d / 110);
    moveMe(x, y, dur); const dot = $('#wdot'); dot.setAttribute('cx', x); dot.setAttribute('cy', y); sfx.walk();
    clearTimeout(S.walkT); S.walkT = setTimeout(arrive, dur * 1000 + 80);
  }
  function arrive() {
    const dot = $('#wdot'); dot.setAttribute('cx', -20); dot.setAttribute('cy', -20);
    if (S.screen !== 'explore' || S.view !== 'map') return; if (S.goF != null) { const gi = S.goF; S.goF = null; openFriend(gi); return; } const n = near(S.me.x, S.me.y); if (!n) return;
    S.met[n.id] = true; S.loc = n.name; const m = $('#me'); m.classList.remove('hop'); void m.getBoundingClientRect(); m.classList.add('hop'); openRes(n.id);
  }
  function renderMap() {
    MAIN.forEach(id => { const g = document.querySelector('.pt[data-id="' + id + '"]'); if (g) { g.classList.remove('st0', 'st1', 'st2'); g.classList.add(S.woke[id] ? 'st2' : 'st0'); } });
    SIDE.forEach(id => { const g = document.querySelector('.wk[data-id="' + id + '"]'); if (g) { g.style.display = S.sideOn ? '' : 'none'; g.classList.toggle('awake', !!S.side[id]); } });
    $('#ltg').innerHTML = S.small.map((s, i) => { const n = N[s.at], x = Math.max(16, Math.min(304, n.x + (i % 2 ? -34 : 34))), y = Math.min(272, n.y + 38);
      return '<g class="lt l-' + n.cls + '" data-i="' + i + '" role="button" tabindex="0" aria-label="' + s.kind + '" transform="translate(' + x + ' ' + y + ')" style="cursor:pointer"><circle r="20" fill="transparent"/><g class="ltb"><circle class="ltd" r="11" style="' + (s.joined ? '' : 'fill:#fff') + '"/><text y="4">' + s.kind.charAt(1) + '</text></g></g>'; }).join('');
    $('#ltg').innerHTML += S.town.map(t => '<g class="tw-d" transform="translate(' + t.x + ' ' + t.y + ')"><circle class="tw-r" r="' + (10 + t.clar * 6) + '" fill="none" stroke="var(--h-' + t.cls + ')" stroke-width="3"/><circle r="' + (4 + t.clar * 2) + '" fill="var(--h-' + t.cls + ')"/></g>').join('');
    emDraw();
    [['npc0', 0], ['op1', 1], ['op2', 2]].forEach(p => { const e = document.getElementById(p[0]); if (e) e.classList.toggle('fr', !!S.friends[p[1]]); });
    renderGuide(); renderProg(); updateCount();
  }

  /* ═════════ [P08] 主要任務、進度、筆記 ═════════ */
  function noteCount(id) { return S.notes.filter(n => n.f === id).length; }
  const walkTip = () => '用方向鍵，把 Ping 走到他旁邊';
  function taskNow() {
    const awake = MAIN.filter(id => S.woke[id]).length, t = { awake, id: null, h: '', p: '' };
    { const tn = tutNow(); if (tn) { t.tut = tn.n; if (tn.n >= 1 && tn.n <= 5) { t.h = '新手教學'; t.p = ''; } else { t.h = tn.n ? '教學完成' : '新手教學'; t.p = tn.n ? '可以自由逛逛了' : '五個小步驟'; } return t; } }   // [P30] 教學中：上方卡只講教學這一步
    /* [P28d] 小鎮畫面的「下一步」只在這張卡上說一次（探測器→跟著箭頭→調清楚→種花）；不再同時出現兩個提示 */
    try { if (U.m === 1 && CODEX.cfg && awake < 4) {
      const n = seedsGet().length;
      t.free = true;   // 教學結束後的任務卡：只說「現在的目標」，不編步驟號（避免和教學的 1/5 混在一起）
      if (TN.on) { t.h = '調頻中'; t.p = '滑到波形最整齊'; return t; }
      if (n >= POCKET) { t.h = '口袋滿了'; t.p = '先按「種花」'; return t; }
      if (n > 0) { t.h = '種花'; t.p = '按「種花」'; return t; }
      const I = DETS.info;
      if (DETS.on && I && I.left <= 0 && I.locked > 0) { t.h = '找居民聊聊'; t.p = '他們知道更多聲音'; return t; }
      if (DETS.on) { t.h = '跟著箭頭'; t.p = BANDS[DETS.band] + '中　電量用完要充電'; return t; }
      t.h = '找聲音'; t.p = '選聽法，再開探測器'; return t;
    } } catch (e) {}
    if (awake >= 4) { t.h = '四位居民都醒了'; t.p = '等時間到，看小鎮的結局'; return t; }
    if (!S.quest || S.woke[S.quest]) { const gv = giver(), gn = N[gv]; t.id = gv; t.h = rname(gv) + '好像有話想說'; t.p = '走近一點，他會開口'; return t; }
    const id = pickCur(), n = N[id], r = (S.rs || []).find(x => x.id === id);
    t.id = id;
    if (r && !r.met) { t.h = rname(id) + '好像有話想說'; t.p = '走近一點，他會開口'; return t; }
    const wants = r ? (r.want || []).filter(k => !(r.got || []).includes(k)).map(k => (SNAME && SNAME[k]) || k) : [];
    t.h = rname(id) + (wants.length ? '想聽 ' + wants.join('、') : '的聲音');
    t.p = '收到聲音後，按「種花」送給他'; return t;
  }
  // 其他玩家接了誰的委託（來自伺服器 players[].quest）；沒人接就不顯示
  function whoAcc() {
    const L = (NET.list || []).filter(q => q.quest && N[q.quest]);
    if (!NET.on || !L.length) return '';
    return '<div class="whoacc">' + L.map(q => '<span class="wa" style="background:var(--t-' + (N[q.quest].cls === 'house' || N[q.quest].cls === 'lilac' ? 'purple' : N[q.quest].cls) + ')"><i style="background:var(--h-' + (q.col || 'flower') + ')"></i>' + (HUE[q.col] || q.name || '玩家') + ' 接了 ' + N[q.quest].who + '</span>').join('') + '</div>';
  }
  function renderGuide() {
    const g = $('#guide'), show = S.started && S.screen === 'explore' && S.view === 'map'; g.hidden = !show; g.style.display = show ? '' : 'none';
    $$('.pt,.wk').forEach(p => p.classList.remove('task')); if (!show) return;
    if (S.quest && S.woke[S.quest]) setQuest(null);
    const t = taskNow(), dots = t.free ? '' : t.tut != null ? [1, 2, 3, 4, 5].map(i => '<i style="background:var(--h-flower);opacity:' + (i <= t.tut ? 1 : .3) + '"></i>').join('') : MAIN.map(id => '<i style="background:var(--h-' + id + ');opacity:' + (S.woke[id] ? 1 : .3) + '"></i>').join('');
    const html = '<div class="tk-top"><span class="tk-eye">' + (t.tut != null ? '教學' : t.free ? '探索' : '居民') + '</span><span class="tk-dots">' + dots + '<b class="num">' + (t.free ? '' : t.tut != null ? Math.min(5, Math.max(0, t.tut)) + '/5' : t.awake + '/4') + '</b></span><span class="tk-btns"><button type="button" class="tkb" data-open="q" aria-label="任務單"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v3H8zM6 6h12v15H6zM9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="tkb" data-open="s" aria-label="交流"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15.5 14.2c3 0 5.5 1.8 5.5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' + (socialRows().length ? '<b class="bdg">' + socialRows().length + '</b>' : '') + '</button></span></div>' +
      '<div class="tk-main' + (S.acc && Date.now() - S.acc < 4000 ? ' ok' : '') + '">' + (t.id ? '<span class="tk-dot" style="background:var(--h-' + N[t.id].cls + ')"></span>' : '') + '<div><p class="tk-h">' + t.h + '</p><p class="tk-p">' + t.p + '</p></div></div>';
    if (g.__h !== html) { g.__h = html; g.innerHTML = html; }   // 內容沒變就不重畫（避免上方介面一直閃、跳動）
    if (t.id) { const pt = document.querySelector('[data-id="' + t.id + '"]'); if (pt && t.awake < 4) pt.classList.add('task'); }
    MAIN.forEach(id => { const pt = document.querySelector('[data-id="' + id + '"]'); if (pt) pt.classList.toggle('lockp', !S.woke[id] && !srcOn(id)); });
  }
  function accOK(id) { toast('接受任務成功' + (id && N[id] ? '：叫醒' + N[id].who : ''), 'ok', 5000); burst(innerWidth / 2, innerHeight * .32, 28, 130); }
  function setQuest(id) { if (id && !S.quest) { S.acc = Date.now(); accOK(id); setTimeout(renderGuide, 4200); } S.quest = id || null; try { renderGuide(); renderMap(); } catch (e) {} if (NET.on && NET.joined) netPost('/quest', { pid: NET.pid, quest: S.quest || '' }); uqUpdate(); }

  /* ═════════ [P09] 任務單（線索收集）與交流 ═════════ */
  const QNAME = { flower: '花店老闆', house: '奶奶', market: '市場阿姨', river: '釣魚大叔' };
  const frIdx = pid => { let k = 0; for (const ch of pid) k += ch.charCodeAt(0); return k % FR.length; };
  const pName = q => (q.name || HUE[q.col] || '訪客');
  const melPid = pid => { let h = 5381; for (const ch of String(pid)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return [h % 3, Math.floor(h / 3) % 3, Math.floor(h / 9) % 3]; };   // 每位玩家自己的三音招呼聲（由 pid 決定，兩支手機算出來一樣）
  function becameFriends(pid) {   // 雙方成為朋友：兩支手機都跳同樣的訊息（只跳一次）
    NET.fdone = NET.fdone || {}; if (NET.fdone[pid]) return; NET.fdone[pid] = 1;
    const q = (NET.list || []).find(x => x.pid === pid) || { pid, col: 'flower' }, k = frIdx(pid), f = FR[k], nm = pName(q);
    if (q.name) f.name = q.name; S.friends[k] = 1; S.marks++; sfx.got(); try { renderMap(); burst(innerWidth / 2, innerHeight * .4, 26, 120); } catch (e) {}
    openSheet('<div class="sh-h l-' + f.col + '"><span class="ico">' + icon('door') + '</span><div><h2>' + nm + '</h2><p class="cap">新朋友</p></div>' + CLOSE + '</div><div class="bub small l-' + f.col + '">我們互相聽到對方的招呼聲了！聲音連在一起了。</div><p class="murmur">你和' + nm + '成為朋友　交流記號 +1</p><button class="btn btn-ink btn-block" type="button" id="frSw3">換線索</button>');
    $('#frSw3').addEventListener('click', () => openSwap(k));
  }
  function frHead(q) { const f = FR[frIdx(q.pid)]; return '<div class="sh-h l-' + f.col + '"><span class="ico">' + icon('door') + '</span><div><h2>' + pName(q) + '</h2><p class="cap">旁邊的訪客</p></div>' + CLOSE + '</div>'; }
  function hearSheet(pid) {   // 聽對方的三個音，照著按出來（雙方各做一次，可以同時進行）
    const q = (NET.list || []).find(x => x.pid === pid); if (!q) return; const k = frIdx(pid), f = FR[k], nm = pName(q), head = frHead(q), target = melPid(pid); let inp = [];
    NET.waitPid = null;
    openSheet(head + '<p>' + nm + '也在用聲音打招呼。聽他的三個音，照著按出來，他就知道你聽到了。</p><button class="btn btn-soft btn-block" type="button" id="frHear">▶ 聽他的招呼聲</button><div class="mel l-' + f.col + '" id="frIn"><i></i><i></i><i></i></div><div class="keys"><button class="btn btn-soft" type="button" data-kn="0">低</button><button class="btn btn-soft" type="button" data-kn="1">中</button><button class="btn btn-soft" type="button" data-kn="2">高</button></div><p class="cap" id="frMsg">真實展場：兩支手機直接聽對方放的招呼聲，不用按。</p>');
    const dots = () => $$('#frIn i').forEach((d, j) => d.classList.toggle('on', j < inp.length));
    $('#frHear').addEventListener('click', () => { ensureAudio(); playMel(target); });
    setTimeout(() => { if (!$('#sheet').hidden) playMel(target); }, 350);
    $$('#sheetBody [data-kn]').forEach(bn => bn.addEventListener('click', async () => {
      ensureAudio(); const v = Number(bn.getAttribute('data-kn')); tone(NF[v], 'triangle', .12, .4); inp.push(v); dots(); if (inp.length < 3) return;
      if (!inp.every((x, j) => x === target[j])) { $('#frMsg').textContent = '不太一樣，再聽一次他的招呼聲。'; inp = []; dots(); sfx.oops(); return; }
      const j2 = await netPost('/greet', { pid: NET.pid, to: pid, done: true }); if (!j2) toast('伺服器沒回應打招呼：請重開 node', 'warn', 6000);
      if (j2 && j2.mutual) { becameFriends(pid); return; }
      openSheet(head + '<div class="bub small l-' + f.col + '">你聽出' + nm + '的招呼聲了！</div><p class="murmur">等他也聽出你的招呼聲，你們就成為朋友。</p><button class="btn btn-soft btn-block" type="button" id="frMy2">▶ 再放一次我的招呼聲</button>'); $('#frMy2').addEventListener('click', () => { ensureAudio(); playMel(melPid(NET.pid)); });
    }));
  }
  async function greetPid(pid) {   // 雙方都可以同時按「打招呼」：各自送出招呼聲、各自聽出對方的三個音，兩邊都完成才成為朋友
    const q = (NET.list || []).find(x => x.pid === pid); if (!q) { toast('對方離開了。'); return; }
    const k = frIdx(pid); if (q.name) FR[k].name = q.name; if (S.friends[k]) { openSwap(k); return; }
    ensureAudio(); const me2 = NET.me || {};
    if ((me2.wt || []).includes(pid)) { openSheet(frHead(q) + '<p>你已經聽出他的招呼聲了。等他也聽出你的招呼聲，就成為朋友。</p><button class="btn btn-soft btn-block" type="button" id="frMy">▶ 再放一次我的招呼聲</button>'); $('#frMy').addEventListener('click', () => { ensureAudio(); playMel(melPid(NET.pid)); }); return; }
    if (me2.gt !== pid) { const j = await netPost('/greet', { pid: NET.pid, to: pid }); if (!j) toast('伺服器沒回應打招呼：請關掉 node 視窗重開（node tunein-server.js）', 'warn', 6000); NET.lastPoll = 0; playMel(melPid(NET.pid)); }
    if (q.gt === NET.pid || (me2.rp || []).includes(pid)) { setTimeout(() => hearSheet(pid), 900); return; }   // 對方也打了招呼：我的招呼聲放完，馬上換聽他的
    NET.waitPid = pid;
    openSheet(frHead(q) + '<p>你的招呼聲送出去了。等' + pName(q) + '也按打招呼（兩個人可以同時按），他的招呼聲一到就會自動跳出來讓你聽。</p><button class="btn btn-soft btn-block" type="button" id="frMy">▶ 再放一次我的招呼聲</button>');
    $('#frMy').addEventListener('click', () => { ensureAudio(); playMel(melPid(NET.pid)); });
  }
  function socialRows() {
    const rows = [], seen = {};
    NET.k2p = {}; if (NET.on) (NET.list || []).forEach(q => { const k = frIdx(q.pid); if (seen[k]) return; seen[k] = 1; if (q.name) FR[k].name = q.name; NET.k2p[k] = q.pid; rows.push(k); });
    else FR.forEach((f, k) => rows.push(k));
    return rows;
  }
  const rname = id => { const r = (S.rs || []).find(x => x.id === id); return (r && r.name) || (N[id] && N[id].who) || ''; };   // 居民名字以伺服器為準（市場阿姨、釣魚大叔）
  function openQuests() {   // 任務單（重做）：頂端一句「下一步」，下面每位居民一行（在哪、想聽什麼、醒了沒），最後是我的種子
    const rs = S.rs || [], sd = seedsGet();
    const anyMet = rs.some(r => r.met), anyGot = rs.some(r => (r.got || []).length), nDone = MAIN.filter(id => { const r = rs.find(x => x.id === id); return r && r.done; }).length;
    const st = [['聊聊', anyMet], ['收聲音', sd.length > 0 || anyGot], ['種花', anyGot]];
    const steps = '<div class="qsteps">' + st.map((x, i) => '<span class="qs' + (x[1] ? ' on' : '') + '"><i>' + (x[1] ? '✓' : i + 1) + '</i>' + x[0] + '</span>').join('') + '</div>';
    let nx, act = '';   // 下一步：只講現在該做的一件事
    if (nDone >= MAIN.length) nx = ['小鎮醒了', '每位居民都聽到了，去找他們聊天吧。'];
    else if (sd.length) { nx = ['把聲音種下去', '走到想聽它的居民旁邊，按「種花」。']; act = 'plant'; }
    else if (anyMet) { nx = ['去找聲音', '打開探測器，跟著箭頭走；靠近花、站著不動再收。']; act = 'go'; }
    else nx = ['先去跟居民聊聊', '走到居民旁邊，按「和他說話」，他會告訴你想聽什麼。'];
    const rows = MAIN.map(id => {
      const n = N[id], r = rs.find(x => x.id === id); let st2;
      if (r && r.done) st2 = '<em>醒了：' + n.fx + '</em>';
      else if (r && r.met) st2 = '<em class="qq">「' + n.own + '」</em><div class="wrow">' + (r.want || []).map(k => '<span class="wchip' + ((r.got || []).includes(k) ? ' got' : '') + '">' + ((r.got || []).includes(k) ? '✓ ' : '') + ((SNAME && SNAME[k]) || k) + '</span>').join('') + '</div>';
      else st2 = '<em>在' + n.name + '，去跟他聊聊</em>';
      return '<li class="qn l-' + n.cls + '"><span class="qd"></span><span class="qt"><b>' + rname(id) + '</b>' + st2 + '</span></li>';
    }).join('');
    const seeds = sd.length ? '<div class="wrow">' + sd.map(x => '<span class="wchip">' + seedDot(x.k) + ' ' + ((SNAME && SNAME[x.k]) || x.k) + '</span>').join('') + '</div>' : '<p class="cap">口袋是空的，收到的聲音會放在這裡</p>';
    openSheet('<div class="sh-h"><span></span><div><h2>任務單</h2><p class="cap">小鎮醒了 ' + nDone + ' / ' + MAIN.length + '</p></div>' + CLOSE + '</div>' + steps +
      '<div class="qnext"><b>' + nx[0] + '</b><span>' + nx[1] + '</span>' + (act === 'plant' ? '<button class="btn btn-ink" type="button" id="qPlant">種花</button>' : act === 'go' ? '<button class="btn btn-ink" type="button" id="qGo">去找聲音</button>' : '') + '</div>' +
      '<ul class="qlist" style="max-height:none;overflow:visible">' + rows + '</ul><p class="cap qh">我的種子　' + sd.length + '</p>' + seeds);
    const g1 = $('#qGo'); if (g1) g1.addEventListener('click', () => { closeSheet(); if (!CONFIG.hideMicListen) openCollect(); });
    const g2 = $('#qPlant'); if (g2) g2.addEventListener('click', () => { closeSheet(); TR.open = true; TR.sel = -1; trayRender(); });
  }
  function openSocial() {
    const rows = socialRows();
    const li = rows.length ? rows.map(k => { const f = FR[k], qq = NET.on && NET.k2p && (NET.list || []).find(x => x.pid === NET.k2p[k]); return '<li class="qn l-' + f.col + '"><span class="pdisc"><svg aria-hidden="true"><use href="#i-sprite"/></svg></span><span class="qt"><b>' + f.name + '</b>' + (S.friends[k] ? '<em>已是朋友</em>' : '') + (qq && qq.quest ? '<em>接了「' + QNAME[qq.quest] + '」的委託</em>' : '') + '</span><button type="button" class="btn ' + (S.friends[k] ? 'btn-soft' : 'btn-ink') + ' qb" data-fr="' + k + '">' + (S.friends[k] ? '換線索' : (NET.me && (NET.me.wt || []).includes(qq && qq.pid) ? '等他聽你的' : ((qq && qq.gt === NET.pid) || (NET.me && (NET.me.rp || []).includes(qq && qq.pid)) ? '回應招呼' : (NET.me && NET.me.gt === (qq && qq.pid) ? '等他回應' : '打招呼')))) + '</button></li>'; }).join('') : '<li class="qe">附近還沒有訪客</li>';
    openSheet('<div class="sh-h"><span></span><div><h2>交流</h2></div>' + CLOSE + '</div><ul class="qlist">' + li + '</ul>');
    $$('#sheetBody [data-fr]').forEach(b => b.addEventListener('click', () => { const k = +b.getAttribute('data-fr'); if (NET.on && NET.k2p && NET.k2p[k]) { closeSheet && closeSheet(); greetPid(NET.k2p[k]); return; } S.friends[k] ? openSwap(k) : openFriend(k); }));
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tkb'); if (!b || !b.hasAttribute('data-open')) return; ensureAudio(); sfx.tap(); b.getAttribute('data-open') === 'q' ? openQuests() : openSocial(); });
  function renderProg() {
    $('#prog').innerHTML = '<div class="pcols">' + MAIN.map(id => { const n = N[id], st = S.woke[id] ? 2 : noteCount(id) ? 1 : 0;
      return '<div class="pcol l-' + n.cls + ' st' + st + '"><span class="pdisc">' + icon(n.icon) + '</span><b>' + n.who + '</b><span class="pst">' + (S.woke[id] ? n.fx : st ? '想一想' : 'zzz') + '</span></div>'; }).join('') + '</div>';
  }
  function addNote(f, t, src, kind) { if (S.notes.some(n => n.t === t)) return false; S.notes.push({ f, t, src, kind }); sfx.note(); return true; }
  const CK = { 'flower.own': 'knock', 'house.own': 'stack', 'market.own': 'tune', 'river.own': 'calm', 'house.nb': 'light', 'flower.nb': 'tune', 'market.nb': 'calm', 'river.nb': 'stack' };
  const noteHTML = x => '<span class="nrow"><span class="cap" style="color:var(--ink)">' + x.t + (x.src ? '　（' + x.src + '給的）' : '') + '</span>' + (x.kind ? '<button class="nk" type="button" data-nk="' + x.kind + '" aria-label="聽這條線索的聲音">▶</button>' : '') + '</span>';

  /* ═════════ [P10] 居民對話 ═════════ */
  const hintHTML = id => { const n = N[id], k = S.hint[id] || 0; let o = ''; if (k >= 1) o += '<p class="murmur">Blip 小聲說：' + n.h1 + '</p>'; if (k >= 2) o += '<p class="murmur">Blip 又說：' + n.h2 + '</p>';
    if (k < 2) o += '<button class="btn btn-soft btn-block" type="button" data-hint="' + id + '">' + (k ? '再問 Blip 一次' : '想不出來？問問 Blip') + '</button>'; return o; };
  const SETUP = {
    flower: ['花店老闆蹲在門口，抬頭看著空空的屋簷。', '今天太安靜了，連花都低著頭。'],
    house: ['奶奶坐在窗邊，手裡的毛線針停了好一會兒。', '家裡安靜得，我都聽得到自己呼吸。'],
    market: ['攤販趴在桌上，帽子蓋著臉。', '呼……沒人來聊天，反而睡不著。'],
    river: ['釣魚的人盯著浮標，一動也不動。', '今天水面靜得像一面鏡子。'],
    trav: ['旅人站在路口，東張西望。', '這裡好安靜，是不是少了什麼？'],
    old: ['老爺爺坐在長椅上，仰頭看著樹。', '今天，樹上空空的。']
  };
  function openRes(id) {
    const n = N[id], curM = pickCur();
    if (n.main) {   // 新版：只講他想聽什麼聲音（聊過就解鎖），收聲音／種花都在遊戲畫面操作
      if (NET.on) netPost('/residents/met', { id: id });
      const r = (S.rs || []).find(x => x.id === id); if (r) r.met = true; S.met[id] = true; S.cur = id; S.tgt = id;
      let body;
      if (r && (r.want || []).length) {
        const ws = r.want.map(k => '<span class="wchip' + ((r.got || []).includes(k) ? ' got' : '') + '">' + ((r.got || []).includes(k) ? '✓ ' : '') + ((SNAME && SNAME[k]) || k) + '</span>').join('');
        body = r.done ? '<div class="bub small l-' + n.cls + '">「聽到了，謝謝你！」</div>' : '<div class="bub small l-' + n.cls + '">「我想聽這兩個聲音。」</div><div class="wrow">' + ws + '</div><p class="cap">用探測器找聲音，收好後按「種花」送給我。</p><button class="btn btn-ink btn-block" type="button" id="resGo">好，我去找</button>';
      } else body = '<div class="bub small l-' + n.cls + '">「我想聽的聲音還在想……等一下再來找我。」</div>';
      openSheet('<div class="sh-h l-' + n.cls + '"><span class="ico">' + icon(n.icon) + '</span><div><h2>' + rname(id) + '</h2><p class="cap">' + (r && r.done ? '聽到了' : '想聽的聲音') + '</p></div>' + CLOSE + '</div>' + body);
      const gb = $('#resGo'); if (gb) gb.addEventListener('click', () => { closeSheet(); if (!CONFIG.hideMicListen) openCollect(); });
      try { renderGuide(); } catch (e) {}
      return;
    }
    if (n.main && !S.woke[id] && !srcOn(id)) { S.cur = id; sfx.oops(); openSheet('<div class="sh-h l-' + n.cls + '"><span class="ico">' + icon(n.icon) + '</span><div><h2>' + n.who + '</h2><p class="cap">' + n.name + '・' + (RES_EM[id] + 1) + ' 號小裝置沒聲音</p></div>' + CLOSE + '</div><p class="narr">' + n.who + '旁邊的聲音點睡著了，現在聽不到。</p><p class="murmur">Blip：聲音點會輪流醒來。先去' + N[curM].who + '那邊看看。</p><button class="btn btn-ink btn-block" type="button" id="goCur">去找' + N[curM].who + '</button>'); $('#goCur').addEventListener('click', () => { closeSheet(); walkTo(N[curM].x - 30, N[curM].y + 22); }); return; }
    S.cur = id; S.tgt = id; const A = (S.asked[id] = S.asked[id] || {}), done = S.woke[id] || S.side[id], tg = n.nb && N[n.nb.about], st = SETUP[id];
    const qs = [['s0', '今天怎麼了？'], ['own', '你以前常聽到什麼聲音？']]; if (tg) qs.push(['nb', '你聽過' + tg.name + '那邊的聲音嗎？']);
    const bub = t => '<div class="bub small l-' + n.cls + '">「' + t + '」</div>', ask = q => '<div class="ask">' + q + '</div>';
    let talk = '';
    if (A.s0) talk += ask(qs[0][1]) + '<p class="narr">' + st[0] + '</p>' + bub(st[1]);
    const hush = '<div class="bub small l-' + n.cls + '">「嗯……這件事，我只跟別的訪客說過。」</div><p class="murmur">Blip：這條你聽不到。別的訪客聽過，交朋友換換看。</p>';
    if (A.own) talk += ask(qs[1][1]) + (S.mine[id + '.own'] ? bub(n.own) : hush);
    if (A.nb) talk += ask(qs[2][1]) + (S.mine[id + '.nb'] ? bub(n.nb.line) : hush);
    if (!talk) talk = '<p class="narr">' + st[0] + '</p>';
    const gv = giver(), canAcc = id === gv && !done && !(S.quest && !S.woke[S.quest]);
    if (canAcc) talk = '<div class="bub small l-' + n.cls + '">「小鎮太安靜了……你能幫我，把我的聲音找回來嗎？」</div><button class="btn btn-ink btn-block" type="button" data-acc="' + id + '">接任務：叫醒' + n.who + '</button>' + talk;
    else if (S.quest === id && !done) talk = '<p class="murmur">任務進行中：叫醒' + n.who + '。問問他，再去找聲音。</p>' + talk;
    const nx = qs.filter(q => !A[q[0]])[0];
    openSheet('<div class="sh-h l-' + n.cls + '"><span class="ico">' + icon(n.icon) + '</span><div><h2>' + n.who + '</h2><p class="cap">' + n.name + '・' + (done ? n.fx : '睡著了') + '</p></div>' + CLOSE + '</div>' + talk +
      (nx ? '<p class="cap">點一句，問問他：</p><button class="btn btn-soft btn-block ask-b" type="button" data-q="' + nx[0] + '">' + nx[1] + '</button>' : '<p class="cap">想問的都問完了。</p>') +
      (done ? '<p class="murmur">' + n.fx + '了，謝謝你。</p>' : (A.own ? '<p class="cap">可以試試：' + n.how + '</p><button class="btn btn-ink btn-block" type="button" data-give="' + id + '">交聲音卡</button>' : '')));
    $$('#sheetBody [data-q]').forEach(b => b.addEventListener('click', () => {
      const k = b.getAttribute('data-q'); A[k] = 1; sfx.tap();
      if (k === 'own' && S.mine[id + '.own']) { addNote(id, n.ownN, null, CK[id + '.own']); play(CK[id + '.own']); } else if (k === 'nb' && S.mine[id + '.nb']) { addNote(n.nb.about, n.nb.note, null, CK[id + '.nb']); play(CK[id + '.nb']); }
      openRes(id); renderGuide(); renderMap();
    }));
    const ab = $('#sheetBody [data-acc]'); if (ab) ab.addEventListener('click', () => { setQuest(id); sfx.got && sfx.got(); openRes(id); renderGuide(); renderMap(); });
    const gb = $('#sheetBody [data-give]'); if (gb) gb.addEventListener('click', () => giveTo(id));
    renderMap();
  }
  function cardRow(c, on) { return '<button class="cr l-' + (c.cls || 'flower') + (on ? ' on' : '') + '" type="button" data-sel="' + c.id + '"><b class="cn">' + c.name + '</b><br>' + tagsHTML(c) + '<br><span class="cap">' + c.where + (c.gift ? '・交流收下' : '') + '</span></button>'; }
  function pickCards(o) { S.pk = o; S.sel = []; drawPick(); }
  function drawPick() {
    const o = S.pk, list = S.cards.filter(o.filter || (() => true));
    openSheet('<div class="sh-h"><span></span><div><h2>' + o.title + '</h2><p class="cap">選 ' + o.need + ' 張</p></div>' + CLOSE + '</div>' + (list.map(c => cardRow(c, S.sel.includes(c.id))).join('') || '<p>沒有可以選的卡。</p>') +
      '<button class="btn btn-ink btn-block" type="button" id="pkOk"' + (S.sel.length === o.need ? '' : ' disabled') + '>' + o.ok + '</button>');
    $$('#sheetBody [data-sel]').forEach(b => b.addEventListener('click', () => { const id = Number(b.getAttribute('data-sel')), i = S.sel.indexOf(id); if (i >= 0) S.sel.splice(i, 1); else if (S.sel.length < o.need) S.sel.push(id); else S.sel = [id]; drawPick(); }));
    $('#pkOk').addEventListener('click', () => { const cs = S.sel.map(id => S.cards.find(c => c.id === id)); const f = o.onOk; closeSheet(); f(cs); });
  }
  function giveTo(id) {
    const n = N[id]; if (!S.cards.length) { openSheet('<div class="sh-h"><span></span><div><h2>還沒有聲音卡</h2></div>' + CLOSE + '</div><p>先按「收聲音」收一顆種子，再回來種下。</p>'); return; }
    pickCards({ title: '種給' + n.who, need: n.main ? 1 : 2, ok: '種下', onOk: cs => handIn(id, cs) });
  }
  async function handIn(id, cs) {
    const n = N[id]; let ok; const bl = cs.find(c => (c.clar == null ? 3 : c.clar) < 2);
    if (bl) { sfx.oops(); openSheet('<div class="sh-h l-' + n.cls + '"><span class="ico">' + icon(n.icon) + '</span><div><h2>' + n.who + '</h2></div>' + CLOSE + '</div><div class="bub small l-' + n.cls + '">「有點模糊……我聽不太清楚。」</div><p class="murmur">Blip：這張還沒調清楚，轉一轉旋鈕再來。</p><button class="btn btn-ink btn-block" type="button" id="reT">調清晰</button>'); $('#reT').addEventListener('click', () => openTune(bl, () => { judge(bl); openRes(id); })); return; }
    if (n.main) ok = cs[0].name === n.need; else if (id === 'trav') ok = cs.some(c => c.weight === '重') && cs.some(c => c.weight === '輕'); else ok = cs.some(c => c.pitch === '高') && cs.some(c => c.pitch === '低');
    if (!ok) { sfx.oops(); openSheet('<div class="sh-h l-' + n.cls + '"><span class="ico">' + icon(n.icon) + '</span><div><h2>' + n.who + '</h2></div>' + CLOSE + '</div><div class="bub small l-' + n.cls + '">' + n.wrong + '</div><p class="murmur">Blip：沒關係，換一張，或再問問旁邊的人。</p>'); return; }
    if (id === 'house' && S.players > 1) { openSheet('<div class="sh-h l-house"><span class="ico">' + icon('door') + '</span><div><h2>奶奶</h2></div></div><div class="bub small l-house">奶奶想聽很多人的聲音……</div><p class="murmur">等小葵 Ping 走過來，一起疊。</p>'); await sleep(1600); }
    closeSheet();
    S.woke[id] = cs[0].name; cs.forEach(c => plantRec(c, 'resident', id)); S.cards = S.cards.filter(c => !cs.includes(c)); try { updateCount(); } catch (e) {}
    renderMap(); const full = cs.every(c => (c.clar == null ? 3 : c.clar) >= 3); if (full) celebrate(id, true); else { celebrate(id, false); toast(n.who + '：嗯，大概是這個。再清楚一點更好。'); }
    if (MAIN.every(x => S.woke[x])) setTimeout(() => { banner('flower', '四位居民都醒了！', true); }, 1800);
  }
  /* ═════════ [P11] 聲音交流（小葵 Ping 是模擬的） ═════════ */
  const PALC = [{ name: '低低不停', rhythm: '連續', pitch: '低', weight: '中' }, { name: '小小一下', rhythm: '一下一下', pitch: '中', weight: '輕' }, { name: '咚咚一下', rhythm: '一下一下', pitch: '低', weight: '重' }, { name: '說不出來的聲音', rhythm: '連續', pitch: '高', weight: '中' }];
  const COLS = ['flower', 'house', 'market', 'river', 'lilac', 'sun'], FRM = [[0, 2, 1], [2, 0, 1], [1, 2, 0]], NF = [262, 392, 523];
  const myMel = () => { const k = Math.max(0, COLS.indexOf(ME)); return [k % 3, (k + 1) % 3, (k + 2) % 3]; };
  function playMel(m) { m.forEach((v, j) => tone(NF[v], 'triangle', .12, .4, j * .45)); }
  function openFriend(i) {
    const f = FR[i]; if (S.friends[i]) { openSheet('<div class="sh-h l-' + f.col + '"><span class="ico">' + icon('door') + '</span><div><h2>' + f.name + '</h2><p class="cap">朋友</p></div>' + CLOSE + '</div><p>你們已經是朋友了。可以跟她換一條線索。</p><button class="btn btn-ink btn-block" type="button" id="frSw">換線索</button>'); $('#frSw').addEventListener('click', () => openSwap(i)); return; }
    const head = '<div class="sh-h l-' + f.col + '"><span class="ico">' + icon('door') + '</span><div><h2>' + f.name + '</h2><p class="cap">旁邊的訪客</p></div>' + CLOSE + '</div>', target = FRM[i];
    let inp = [];
    openSheet(head + '<p>' + f.name + '在用聲音打招呼。聽她的三個音，照著按出來，她就知道你聽到了。</p><button class="btn btn-soft btn-block" type="button" id="frHear">▶ 聽她的招呼聲</button><div class="mel l-' + f.col + '" id="frIn"><i></i><i></i><i></i></div><div class="keys"><button class="btn btn-soft" type="button" data-kn="0">低</button><button class="btn btn-soft" type="button" data-kn="1">中</button><button class="btn btn-soft" type="button" data-kn="2">高</button></div><p class="cap" id="frMsg">真實展場：兩支手機直接聽對方放的招呼聲，不用按。</p>');
    const dots = () => $$('#frIn i').forEach((d, j) => d.classList.toggle('on', j < inp.length));
    $('#frHear').addEventListener('click', () => { ensureAudio(); playMel(target); });
    setTimeout(() => { if (!$('#sheet').hidden) { ensureAudio(); playMel(target); } }, 350);
    $$('#sheetBody [data-kn]').forEach(b => b.addEventListener('click', async () => {
      ensureAudio(); const v = Number(b.getAttribute('data-kn')); tone(NF[v], 'triangle', .12, .4); inp.push(v); dots(); if (inp.length < 3) return;
      if (inp.every((x, j) => x === target[j])) {
        await sleep(500); playMel(myMel()); await sleep(1500);
        S.friends[i] = 1; S.marks++; sfx.got(); renderMap(); burst(innerWidth / 2, innerHeight * .4, 26, 120);
        openSheet(head + '<div class="bub small l-' + f.col + '">' + f.name + '：聽到你的招呼聲了！我們的聲音連在一起了。</div><p class="murmur">交流記號 +1。</p><button class="btn btn-ink btn-block" type="button" id="frSw2">換線索</button>'); $('#frSw2').addEventListener('click', () => openSwap(i));
      } else { $('#frMsg').textContent = '不太一樣，再聽一次她的招呼聲。'; inp = []; dots(); sfx.oops(); }
    }));
  }

  /* ═════════ [P12] 畫面切換 ═════════ */
  function show(name) {
    S.screen = name; document.body.setAttribute('data-screen', name); if (name !== 'listen' && typeof stopLive === 'function') stopLive();
    ['join', 'teach', 'mic', 'explore', 'cards'].forEach(k => { $('#s-' + k).hidden = (k !== name); });
    ['listen', 'leave', 'settle', 'error'].forEach(k => { $('#s-' + k).hidden = (k !== name); });
    const chrome = name === 'explore' || name === 'cards'; $('#top').hidden = !chrome;
    $('#btnBack').hidden = name !== 'cards'; $('#brand').hidden = name === 'cards'; $('#ttl').hidden = name !== 'cards'; $('#btnCards').hidden = true;
    $('#dockbar').hidden = !chrome; $('#res').hidden = true; $('#main').scrollTop = 0;
    $('#s-explore').setAttribute('data-view', S.view);
    if (name === 'join') { $('#btnJoin').textContent = S.round > 1 ? '再玩一次' : '開始'; $('#btnSkip').hidden = true; joinPage(S.introDone ? 2 : 1); $('#btnPrev').hidden = !!S.round; }
    if (name === 'cards') renderCards();
    if (name === 'explore') { renderMap(); netUi(); }
    updateMain();
  }
  function updateCount() { const b = $('#cardCount'), n = S.cards.length; b.hidden = n === 0; if (b.textContent !== String(n)) { b.textContent = n; popEl(b, 'bump'); } }
  function updateMain() {
    const b = $('#btnMain'), tip = $('#dockTip'), offMap = S.screen === 'explore' && S.view !== 'map'; b.hidden = offMap || (CONFIG.hideMicListen && S.screen === 'explore' && typeof U !== 'undefined' && U.m === 1); tip.hidden = offMap; b.classList.remove('resting'); b.disabled = false;
    if (S.screen === 'cards') { b.textContent = S.cards.length ? '帶回家聽' : '回小鎮'; tip.textContent = S.cards.length ? '點 ▶ 播放聲音卡' : ''; return; }
    b.textContent = '收聲音'; tip.textContent = (typeof U !== 'undefined' && U.m === 1 && CONFIG.hideMicListen) ? '' : (typeof U !== 'undefined' && U.m === 1) ? '走到會唱歌的花旁邊，按「收聲音」；收好再按「種花」'   : '走到會唱歌的花旁邊，按「收聲音」';
  }
  function tickRound() {
    if (!S.started || S.ended) return; const left = S.roundEnd - Date.now(); $('#chipText').textContent = '剩 ' + fmt(left); $('#chip').classList.toggle('low', left <= 30000 && left > 0);
    const e = (ROUND_MS - left) / 1000; S.quiet = false; const q = $('#quiet'); if (q) q.hidden = !(S.quiet && S.screen === 'explore' && S.view === 'map');
    if (left <= 0 && $('#sheet').hidden && S.screen !== 'listen') openSettle();
  }

  /* ═════════ [P13] 收聲音 ═════════ */
  const L = { busy: false };
  const setRing = p => { $('#pa').style.strokeDashoffset = 678.6 * (1 - p); };
  function setL(main, sub) { const t = $('#lText'); if (t.textContent !== main) { t.textContent = main; popEl(t, 'bump'); } $('#lSub').textContent = sub || ''; }
  const WAYS = { '敲': '找手邊的東西，輕輕敲，我來數', '疊': '聲音越多越好，高的低的都要', '調': '找一個一直不停的聲音，我看它高還是低', '靜': '安靜下來，聽輕輕連著的聲音', '播': '先放一個大聲的，再放一個小聲的', '哼': '哼一個高的，再哼一個低的' };
  function curWay() { const n = S.tgt && N[S.tgt]; return n && n.way && !(S.woke[n.id] || S.side[n.id]) ? n : null; }
  function liveInit() {
    const n = curWay(), box = $('#lLive'); L.cnt = 0; L.hi = L.lo = L.lt = L.hv = false; L.prev = false; if (!box) return;
    if (!n) { box.innerHTML = ''; return; }
    const w = n.way, chip = (id, t) => '<span class="lchip" id="' + id + '">' + t + '</span>';
    box.innerHTML = w === '敲' ? chip('lcN', '敲了 0 下') : w === '調' ? '<span class="ltune"><i id="lth"></i></span><span class="ltl"><span>低</span><span>高</span></span>' : w === '靜' ? chip('lcQ', '安靜') :
      w === '播' ? chip('lcLt', '輕輕的') + chip('lcHv', '重重的') : chip('lcLo', '低低的') + chip('lcHi', '高高的');
  }
  function lon(id, t) { const e = $('#' + id); if (!e) return; if (t) e.textContent = t; if (!e.classList.contains('on')) { e.classList.add('on'); popEl(e, 'bump'); } }
  function liveFx() {
    const n = curWay(); if (!n || !A.last) return; const r = A.last.rms, cen = A.last.cen, thr = A.thr(), act = r > thr, db = 20 * Math.log10(Math.max(r, 1e-5) / A.base), w = n.way;
    if (w === '敲') { if (act && !L.prev) { L.cnt++; lon('lcN', '敲了 ' + L.cnt + ' 下'); if (navigator.vibrate) navigator.vibrate(15); const e = $('#lcN'); if (e) popEl(e, 'bump'); } L.prev = act; }
    else if (w === '調') { const th = $('#lth'); if (th && act && cen > 0) th.style.left = (Math.max(0, Math.min(1, (Math.log(cen) - Math.log(100)) / (Math.log(2000) - Math.log(100)))) * 100) + '%'; }
    else if (w === '靜') { const e = $('#lcQ'); if (e) { const q = r < thr; e.textContent = q ? '安靜' : '噓……有聲音'; e.classList.toggle('on', q); e.classList.toggle('warn', !q); } }
    else if (w === '播') { if (act && db < TH.light) lon('lcLt'); if (act && db > TH.heavy) lon('lcHv'); }
    else if (act) { if (cen < TH.low) lon('lcLo'); if (cen > TH.high) lon('lcHi'); }
  }
  const DEMO = /[?&]demo=1/.test(location.search);   // 只有網址加 ?demo=1 才用示範聲音（旋鈕介面）
  function openListen() { focReset(); A.init(); try { const op = $('#orbPing'); if (op) op.style.color = 'var(--h-' + ME + ')'; } catch (e) {} L.busy = false; S.pend = null; $('#lRes').innerHTML = ''; { const pd = $('#lPads'); if (pd) pd.hidden = false; } $('#lSec').textContent = '收'; setRing(0);
    const needMic = (MT.on || NET.on) && !DEMO && A.mode !== 'mic';
    $('#lPads').style.display = A.mode === 'demo' && ((!MT.on && !NET.on) || DEMO) ? '' : 'none'; show('listen');
    if (needMic) {   // 先拿到麥克風再開始，不會閃出舊的旋鈕介面
      stopLive(); setL('正在打開耳朵…', '跳出視窗時，請按「允許」'); { const bd = $('#btnDone'); bd.disabled = true; bd.classList.remove('ready'); bd.textContent = '聽清楚才收得到'; }
      A.useMic().then(ok => { if (S.screen !== 'listen') return; if (ok) startLive(); else setL('小耳朵打不開', '請允許麥克風，再重新進入'); });
    } else startLive(); }
  async function doCollect(ring, bar) {
    if (L.busy) return null; L.busy = true; liveInit(); A.init(); const orb = $('#orbWrap'); if (orb) orb.classList.add('holding'); $('#s-listen').classList.add('holding');
    const fr = await record(3000, p => { if (ring) setRing(p); if (bar) bar(p); liveFx(); }); $('#s-listen').classList.remove('holding'); L.busy = false; if (ring) setRing(0);
    return analyse(fr, S.quiet ? TH.loudQuiet : TH.loud);
  }
  /* 聽得清不清楚：k 0～1，越接近正確的位置，聲音越亮越大聲；null＝恢復正常 */
  function setHear(k) { if (!A.mf) return; const t = AC.currentTime; if (k == null) { A.mf.frequency.setTargetAtTime(20000, t, .05); A.mg.gain.setTargetAtTime(1, t, .05); return; } A.mf.frequency.setTargetAtTime(300 * Math.pow(14000 / 300, k), t, .08); A.mg.gain.setTargetAtTime(.2 + .8 * k, t, .08); }
  function drawWave(k) { const p = $('#wvp'); if (!p) return; if (k < 0) { p.setAttribute('d', 'M0 32H300'); p.classList.add('idle'); return; } p.classList.remove('idle'); const ph = Date.now() / 140; let d = ''; for (let i = 0; i <= 60; i++) { const y = 32 + Math.sin(i * .5 + ph) * (6 + 16 * k) + (Math.random() - .5) * 46 * (1 - k); d += (i ? 'L' : 'M') + (i * 5) + ' ' + Math.max(3, Math.min(61, y)).toFixed(1); } p.setAttribute('d', d); }
  /* 釣聲音：聽清楚(鎖定)後放下耳朵 → 等它咬鉤 → 「咚」→ 1 秒內收竿。沒有失敗：太急或太慢，聲音只是溜走，再等一次 */
  const FISH = { ph: '', bAt: 0, biteAt: 0, miss: 0, early: 0, rt: 0, msg: '', msgUntil: 0 };
  const FISH_WIN = 1100;
  function fishTone() { try { if (!AC) return; A.selfUntil = Date.now() + 1500; const t = AC.currentTime; [[196, 0], [130.8, .09]].forEach(([f, d]) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t + d); g.gain.linearRampToValueAtTime(.16, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .5); o.connect(g); g.connect(AC.destination); o.start(t + d); o.stop(t + d + .55); }); } catch (e) {} }
  function fishWait(extra) { const lv = NET.lv | 0, now = Date.now(); FISH.ph = 'wait'; FISH.biteAt = now + (extra || 0) + (2200 + Math.random() * 3600) * (1 + .3 * lv); const w = $('#orbWrap'); if (w) { w.classList.remove('fbite'); w.classList.add('fwait'); } }
  function fishMsg(t, ms) { FISH.msg = t; FISH.msgUntil = Date.now() + (ms || 2500); }
  function fishReset() { FISH.ph = ''; FISH.miss = 0; FISH.early = 0; FISH.rt = 0; FISH.msg = ''; const w = $('#orbWrap'); if (w) w.classList.remove('fwait', 'fbite'); }
  function fishTick(now) {
    return;   // 11/14 改成「學→唱」，釣魚暫停
    if (!LV.lock) { if (FISH.ph) { FISH.ph = ''; const w = $('#orbWrap'); if (w) w.classList.remove('fwait', 'fbite'); } return; }
    if (!FISH.ph) fishWait(600);
    if (FISH.ph === 'wait') {
      if (FOC.shakeAt && now - FOC.shakeAt < 300 && now - (FISH.shk || 0) > 1500) { FISH.shk = now; FISH.biteAt += 1500; fishMsg('手晃到了，聲音縮回去了。拿穩一點，再等它。', 2800); }
      if (now >= FISH.biteAt) { FISH.ph = 'bite'; FISH.bAt = now; const w = $('#orbWrap'); if (w) { w.classList.remove('fwait'); w.classList.add('fbite'); } fishTone(); }
    } else if (FISH.ph === 'bite' && now - FISH.bAt > FISH_WIN) {
      FISH.miss++; fishMsg('聲音溜走了。沒關係，再等它一次。', 2800); fishWait(500);
    }
  }
  function fishQ() { const fq = focusQ(), rt = FISH.rt || 600, ta = rt <= 450 ? 1 : rt <= 900 ? .88 : .75; return Math.round(Math.max(.5, Math.min(1, (fq + ta) / 2 - .05 * FISH.miss)) * 100) / 100; }
  /* 學→唱：聽清楚原聲後，玩家用自己的聲音唱出來。像不像（節奏、高低、輕重）決定種子飽滿度；種下去的是「玩家的版本」 */
  const SING = { on: false, orig: null, mine: null, q: null, parts: null };
  const LVL = { '低': 0, '中': 1, '高': 2 }, WGT = { '輕': 0, '中': 1, '重': 2 };
  function simOf(o, m) { const rh = o.rhythm === m.rhythm ? 1 : ((o.rhythm === '連續') !== (m.rhythm === '連續') ? 0 : .5), pt = 1 - Math.abs((LVL[o.pitch] | 0) - (LVL[m.pitch] | 0)) / 2, wt = 1 - Math.abs((WGT[o.weight] | 0) - (WGT[m.weight] | 0)) / 2; return .5 * rh + .35 * pt + .15 * wt; }
  function singQ(o, m) { const fqn = Math.max(0, Math.min(1, (focusQ() - .4) / .6)); return Math.round(Math.max(.5, Math.min(1, .5 + .5 * (.85 * Math.min(1, simOf(o, m) * 1.15) + .15 * fqn))) * 100) / 100; }   /* [P93] 放寬容錯 */
  async function singIt() {
    SING.on = true; const bd = $('#btnDone'); bd.disabled = true; bd.classList.remove('ready'); bd.textContent = '唱吧…'; setL('換你了', '用嘴巴、拍手或敲桌子，把它唱出來');
    const fr = await record(3200, p => { try { setRing(p); } catch (e) {} });
    A.rec = []; SING.on = false; try { setRing(0); } catch (e) {}
    if (!LV.on) return null;
    const m = analyse(fr, 999);
    if (m.bad === 'quiet') { sfx.oops(); setL('沒聽到你的聲音', '靠近探測器一點，再唱一次。沒有損失。'); return null; }
    if (m.bad === 'loud') return { rhythm: m.ratio >= TH.cont ? '連續' : '一陣一陣', pitch: '中', weight: '重' };
    return { rhythm: m.rhythm, pitch: m.pitch, weight: m.weight };
  }
  const LV = { on: false, iv: null, tgt: 50, v: 50, lock: false, hold: 0, mx: 0, ema: 0, nodes: null, loop: null, kind: null, quietMs: 0 };
  function stopLive() {
    try { MT.stop(); setHear(null); $('#s-listen').classList.remove('sensed'); } catch (e) {}
    try { fishReset(); } catch (e) {} SING.on = false; if (LV.iv) clearInterval(LV.iv); LV.iv = null; if (LV.loop) clearInterval(LV.loop); LV.loop = null; LV.kind = null; try { SYNP.stop(); } catch (e) {}
    if (LV.nodes) { try { LV.nodes.n.stop(); } catch (e) {} LV.nodes = null; } if (LV.on) A.rec = null; LV.on = false;
  }
  function startLive() {
    stopLive(); LV.on = true; LV.lock = false; LV.hold = 0; LV.mx = 0; LV.ema = 0; LV.tgt = 50; LV.v = Math.random() < .5 ? 15 : 85; LV.quietMs = 0; A.rec = []; liveInit();
    LV.sensed = false; LV.senseUntil = 0; LV.lastHeard = 0; LV.openAt = Date.now(); LV.lowSince = 0; fishReset(); SING.on = false; SING.orig = null; SING.mine = null; SING.q = null; LV.hint = null;
    $('#lRes').innerHTML = '<div class="tuner" id="tuner"><svg class="wv" viewBox="0 0 300 64" aria-hidden="true"><path id="wvp" class="idle" d="M0 32H300"/></svg>' +
      '<div class="gauge"><span class="gl">清楚度</span><span class="gt"><i id="gfill"></i><b></b></span></div>' +
      '<input class="tdial" id="ldial" type="range" min="0" max="100" value="' + LV.v + '" aria-label="調清楚的旋鈕"><div class="tdl"><span>低</span><span>高</span></div></div>';
    setL('搜尋中…', curWay() ? WAYS[curWay().way] : (A.mode === 'demo' ? '示範：點下面一個聲音，當作花的聲音' : '走到正在響的花旁邊'));
    $('#btnDone').textContent = '聽清楚才收得到'; $('#btnDone').disabled = true; $('#btnDone').classList.remove('ready');
    if (A.mode === 'demo') { try { const o1 = AC.createOscillator(), o2 = AC.createOscillator(), ng = AC.createGain(); o1.type = o2.type = 'sine'; o1.frequency.value = 392; o2.frequency.value = 588; ng.gain.value = .02; o1.connect(ng); o2.connect(ng); ng.connect(AC.destination); o1.start(); o2.start(); LV.nodes = { n: { stop() { try { o1.stop(); o2.stop(); } catch (e) {} } }, o2, ng }; } catch (e) {} }   /* 探測中的背景音：柔和的兩個音（原本是雜訊），越清楚越明顯 */
    $('#ldial').addEventListener('input', function () { LV.v = Number(this.value); try { navigator.vibrate && navigator.vibrate(4); } catch (e) {} });
    MT.start();
    if (MT.on && A.mode === 'mic') {   // 一開始待機不收音，玩家按「開始搜尋」才收
      MT.paused = true; const dl = $('#ldial'); if (dl) dl.style.display = 'none'; const tl = document.querySelector('#tuner .tdl'); if (tl) tl.style.display = 'none';
      const tn = $('#tuner'); if (tn) tn.insertAdjacentHTML('beforeend', '<button type="button" id="mtPause" class="btn btn-white" style="margin-top:10px;min-height:44px;font-size:16px">開始搜尋</button><div id="mtdbg" style="font-size:14px;margin-top:8px;opacity:.8">還沒開始搜尋</div>');
      const pb = $('#mtPause'); if (pb) pb.addEventListener('click', () => {
        MT.paused = !MT.paused; pb.textContent = MT.paused ? '開始搜尋' : '暫停搜尋'; const dg = $('#mtdbg');
        if (MT.paused) { LV.lock = false; LV.hold = 0; MT.k = 0; LV.sensed = false; $('#s-listen').classList.remove('sensed'); if (dg) dg.textContent = '還沒開始搜尋'; }
        else { LV.ema = 0; LV.hold = 0; LV.mx = 0; LV.sensed = false; LV.lastHeard = 0; LV.lowSince = 0; LV.openAt = Date.now(); A.rec = []; MT.k = 0; MT.g = 0; MT.gh = []; MT.bh = []; if (MT.ring) { MT.filled = 0; MT.pos = 0; } if (dg) dg.textContent = '搜尋中…'; }   // 只聽「從現在起」的聲音
        try { sfx.note && sfx.note(); } catch (e) {}
      });
    }
    LV.iv = setInterval(liveTick, 80);
  }
  function loopPlay(k) { if (LV.loop) clearInterval(LV.loop); LV.loop = null; SYNP.stop(); LV.kind = k; if (/^syn:/.test(k)) { SYNP.start(k); return; } play(k); LV.loop = setInterval(() => { if (LV.on && S.screen === 'listen') play(k); }, 3200); }
  function liveTick() {
    if (!LV.on || SING.on) return; if (A.rec && A.rec.length > 90) A.rec.splice(0, A.rec.length - 90);
    const r = A.last ? A.last.rms : 0, cen = A.last ? A.last.cen : 0, thr = A.thr(), act = r > thr, rc = (A.rec || []).slice(-30), recent = MT.active() ? MT.k > .1 : rc.some(f => f.rms > thr);
    if (act && cen > 0) LV.ema = LV.ema ? LV.ema * .85 + cen * .15 : cen;
    if (LV.ema) LV.tgt = Math.max(0, Math.min(100, (Math.log(Math.max(LV.ema, 100)) - Math.log(100)) / (Math.log(2000) - Math.log(100)) * 100));
    const k = MT.active() ? MT.k : (recent && LV.ema ? Math.max(0, 1 - Math.abs(LV.v - LV.tgt) / 28) : 0); LV.mx = Math.max(LV.mx, k);
    if (!LV.lock && !(MT.active() && MT.gapHold)) { if (k > (MT.active() ? .7 : .85)) { LV.hold += 80; if (LV.hold >= (MT.active() ? 1000 : 700)) { LV.lock = true; LV.lockAt = Date.now(); LV.lowLock = 0; orbBurst(); sfx.note(); fishReset(); try { LV.hint = analyse((A.rec || []).slice(-60), 999); } catch (e) { LV.hint = null; } A.selfUntil = Date.now() + 1200; try { navigator.vibrate && navigator.vibrate([30, 40, 30]); } catch (e) {} } } else if (k < .5) LV.hold = 0; else LV.hold = Math.max(0, LV.hold - 40); }   // 抗抖動：要連續夠清楚 1 秒才鎖定；中間稍微掉一下不會整個歸零
    if (LV.lock && MT.active() && !MT.paused) { if (MT.k < .3) { LV.lowLock = (LV.lowLock || 0) + 80; if (LV.lowLock > 5000) { LV.lock = false; LV.hold = 0; LV.lowLock = 0; sfx.oops(); } } else LV.lowLock = 0; }   // 防護：鎖定後聲音消失超過 5 秒，鎖定解除（不能鎖住之後離開還能收）
    SYNP.tick(LV.lock, LV.lockAt); const kk = LV.lock ? 1 : k, now = Date.now(); fishTick(now); orbFx(kk, LV.sensed || LV.lock, now);
    if (LV.nodes) { LV.nodes.ng.gain.value = recent ? .02 + .05 * kk : .012; try { LV.nodes.o2.frequency.value = 588 + 98 * kk; } catch (e) {} }
    if (A.mode === 'demo') setHear(recent || LV.lock ? kk : null);
    if (MT.active() && MT.k > .15) LV.lastHeard = now; else if (recent && !MT.active()) LV.lastHeard = now;
    if (recent && !LV.sensed) { LV.sensed = true; LV.senseUntil = now + 1400; sfx.note(); $('#s-listen').classList.add('sensed'); }
    if (LV.sensed && !LV.lock && now - LV.lastHeard > 4000) { LV.sensed = false; $('#s-listen').classList.remove('sensed'); }
    drawWave(recent || LV.lock ? kk : -1);
    const gf = $('#gfill'); if (gf) gf.style.width = (recent || LV.lock ? kk * 100 : 0) + '%';
    const bd = $('#btnDone'); bd.disabled = !LV.lock; bd.classList.toggle('ready', LV.lock); bd.classList.remove('bite'); bd.textContent = LV.lock ? '收下這個聲音' : '聽清楚才收得到';
    /* Blip 只在卡住時才說話：很久沒聽到聲音、或轉了很久還是模糊 */
    if (LV.sensed && !LV.lock) { if (k >= .5 || !LV.lowSince) LV.lowSince = now; } else LV.lowSince = 0;
    const lowFor = LV.lowSince ? now - LV.lowSince : 0, dirHint = LV.tgt > LV.v ? '高' : '低';
    const hint = MT.active() ? (LV.lock ? '' : (MT.msg || '靠近正在響的花，聲音會越來越清楚')) : LV.lock ? '' : !LV.sensed ? (now - Math.max(LV.openAt, LV.lastHeard) > 15000 ? '好像還沒搜尋到，再靠近花一點' : '') : lowFor > 24000 ? '往「' + dirHint + '」那邊轉轉看。' : lowFor > 12000 ? '慢慢轉，聽聽哪裡的聲音變亮了。' : '';
    if (MT.paused) { setL('暫停搜尋', '自己走到響的花旁邊，再按「開始搜尋」'); const bdp = $('#btnDone'); bdp.disabled = true; bdp.classList.remove('ready'); bdp.textContent = '聽清楚才收得到'; drawWave(-1); const gfp = $('#gfill'); if (gfp) gfp.style.width = '0%'; return; }
    else if (LV.lock) { const h = LV.hint; setL('聽清楚了', h && h.rhythm ? '它是「' + h.rhythm + '・' + h.pitch + '・' + h.weight + '」。按「收下這個聲音」。' : '聲音很清楚了，按「收下這個聲音」。'); }
    else if (!LV.sensed) setL('搜尋中…', hint || (curWay() ? WAYS[curWay().way] : (A.mode === 'demo' ? '示範：點下面一個聲音，當作花的聲音' : '走到正在響的花旁邊')));
    else if (now < LV.senseUntil) setL('感應到聲音了！', '聲音還很模糊');
    else setL(k > .85 ? '再穩一下' : k > .5 ? (MT.on ? '快到了，再靠近一點' : '快到了，再轉一點') : k > .2 ? '有聲音浮出來了' : (MT.on ? '聲音很模糊，再靠近一點' : '聲音很模糊，轉旋鈕找清楚'), hint || (recent ? '' : '等它再響一次'));
    liveFx();
  }
  /* 收聲音的動態：聽到聲音後，音符和星星從四周飄進圓裡（越清楚越密、越亮）；調清楚鎖定時往外炸開 */
  const ORBC = ['#F2619C', '#E7BEF8', '#93ABD9', '#EDE986'];
  function orbFx(k, on, now) {
    const w = $('#orbWrap'); if (!w) return;
    /* 11/14c：不再用 drop-shadow 光暈（會被元素邊界切出方形邊） */
    if (!on || document.hidden) return;
    if (now - (LV.fxAt || 0) < 300 - 210 * k) return; LV.fxAt = now;
    const e = document.createElement('i'), a = Math.random() * 6.283, d = w.offsetWidth * (.75 + Math.random() * .35);
    e.className = 'fxn'; e.textContent = ['♪', '♫', '✦', '♪', '✧'][Math.random() * 5 | 0];
    e.style.cssText = '--x:' + (Math.cos(a) * d).toFixed(0) + 'px;--y:' + (Math.sin(a) * d).toFixed(0) + 'px;color:' + ORBC[Math.random() * 4 | 0] + ';font-size:' + Math.round(16 + k * 16) + 'px';
    w.appendChild(e); setTimeout(() => e.remove(), 1100);
  }
  function orbBurst() {
    const w = $('#orbWrap'); if (!w) return;
    for (let i = 0; i < 16; i++) { const e = document.createElement('i'), a = i / 16 * 6.283 + Math.random() * .3, d = w.offsetWidth * (.7 + Math.random() * .4); e.className = 'fxn out'; e.textContent = i % 2 ? '✦' : '♪'; e.style.cssText = '--x:' + (Math.cos(a) * d).toFixed(0) + 'px;--y:' + (Math.sin(a) * d).toFixed(0) + 'px;color:' + ORBC[i % 4] + ';font-size:22px'; w.appendChild(e); setTimeout(() => e.remove(), 900); }
    w.classList.remove('cheer'); void w.offsetWidth; w.classList.add('cheer');
  }
  async function confirmLive() {
    if (!LV.on) return; if (LV.lock && MT.active() && (MT.clip || (!SING.orig && Date.now() - (LV.lockAt || 0) > 8000 && MT.k < .5))) { LV.lock = false; LV.hold = 0; sfx.oops(); setL(MT.clip ? '太大聲了' : '聲音走遠了', '靠近花一點，聽清楚了再收'); return; }   // 防護：按下去的當下再確認一次
    if (!LV.lock && !SING.orig) { sfx.oops(); setL('還不夠清楚', MT.on ? '再靠近花一點，聽清楚了才收得到。' : '轉旋鈕，把聲音調清楚才收得到。'); return; } const fr = (A.rec || []).slice(-60), res = SING.orig || analyse(fr, S.quiet ? TH.loudQuiet : TH.loud);
    if (MT.active() && res.bad === 'quiet') { res.bad = null; res.name = '說不出來的聲音'; res.rhythm = res.rhythm || '連續'; res.pitch = res.pitch || '中'; res.weight = res.weight || '輕'; res.wide = !!res.wide; res.cen = res.cen || 400; }
    if (MT.active() && MT.bid && (MT.g > .05 || MT.srv)) { res.name = MT.bid === '0001' ? '鳥叫聲' : '小動物的叫聲'; res.desc = MT.bid === '0001' ? '清脆的鳥叫，一串一串從高處傳來。' : '小小的動物叫聲，一下一下，很有精神。'; }
    if (res.bad === 'loud') { sfx.oops(); setL('周圍聲音有點多，等一下再收', S.quiet ? '小葵 Ping 也在收，這次不算，沒有損失。' : '這次不算，也沒有任何損失。'); return; }
    if (res.bad === 'quiet') { sfx.oops(); setL('好像沒聽到，靠近一點再試', ''); return; }
    if (!SING.mine) { SING.orig = res; SING.mine = { rhythm: res.rhythm, pitch: res.pitch, weight: res.weight }; SING.q = Math.round(Math.max(.4, Math.min(1, .4 + .6 * (.6 * focusQ() + .4 * (MT.k || 0)))) * 100) / 100; SING.parts = null; }
    if (SYNP.on) { SYNP.snap = { m: SYNP.mn, f: SYNP.fn, fine: Date.now() - (LV.lockAt || 0) > 3800 }; res.name = SYNP.mn; res.desc = '「' + SYNP.mn + '」的聲音，' + (res.rhythm === '一下一下' ? '一下一下的。' : '一直在響。'); }
    const clar = 3; stopLive();
    const c = { id: Date.now(), q: SING.q != null ? SING.q : focusQ(), mine: SING.mine, name: res.name, rhythm: res.rhythm, pitch: res.pitch, weight: res.weight, wide: res.wide, cen: res.cen, clar, where: S.loc, no: Math.floor(Math.random() * 30) + 1, cls: 'flower' };
    const at = ALL.map(i => N[i]).filter(n => n.name === S.loc)[0]; if (at) c.cls = at.cls; c.real = c.name; c.desc = res.desc || ('聽起來是「' + res.rhythm + '、' + res.pitch + '、' + res.weight + '」的聲音。'); c.parts = SING.parts; if (c.parts && c.parts.clean >= .75 && c.parts.complete >= 1 && c.parts.near >= .55) { c.desc += '　回放時，好像還聽到一點很細很細的聲音。'; c.fine = 1; } if (SYNP.snap) { c.synM = SYNP.snap.m; if (SYNP.snap.fine) { c.synF = SYNP.snap.f; c.fine = 1; c.name = SYNP.snap.m + '＋' + SYNP.snap.f; c.real = c.name; c.desc = '主聲是「' + SYNP.snap.m + '」，靜下來還聽到細細的「' + SYNP.snap.f + '」。'; } SYNP.snap = null; }
    if (MT.active() || MT.on) MT.grab(c); S.pend = c; SING.orig = null; SING.mine = null; SING.q = null; SING.parts = null; const hi = S.tgt ? RES_EM[S.tgt] : null; if (hi != null && EM[hi] && EM[hi].on) S.heard[hi] = 1;
    SING.orig = null; SING.mine = null; SING.q = null; SING.parts = null; setL('判定中……', ''); $('#lRes').innerHTML = '<div class="scard l-' + c.cls + ' judging" style="grid-template-columns:1fr"><b style="font-size:24px">？？？</b><span class="meta">' + c.where + '</span></div>'; $('#btnDone').disabled = true; await sleep(900);
    judge(c); sfx.got(); try { navigator.vibrate && navigator.vibrate([30, 40, 30]); } catch (e) {} setL('收到一個聲音', ''); { const pd = $('#lPads'); if (pd) pd.hidden = true; }
    $('#lRes').innerHTML = '<div class="rcard l-' + c.cls + '"><b class="rn">' + c.name + '</b><span class="rdesc" style="font-size:16px;line-height:1.5;text-align:center">' + (c.desc || '') + '</span>' + MT.waveHTML(c) + '<span class="rtags">' + tagsHTML(c) + '</span><div class="rmeta">' + (c.parts ? '<div><em>靠近</em><span>' + pdots(c.parts.near) + '</span></div><div><em>乾淨</em><span>' + pdots(c.parts.clean) + '</span></div><div><em>完整</em><span>' + pdots(c.parts.complete) + '</span></div>' : '<div><em>飽滿</em><span>' + qdots(c) + '</span></div><div><em>地點</em><span>' + c.where + '</span></div><div><em>你唱的</em><span>' + (c.mine ? c.mine.rhythm + '・' + c.mine.pitch : '—') + '</span></div>') + '</div>' + (c.parts ? '<button class="btn btn-soft" id="reRec" style="margin-top:8px">再錄一次</button>' : '') + '</div>'; popEl($('#lRes').firstChild, 'bump'); MT.bindClips($('#lRes')); { const rr = $('#reRec'); if (rr) rr.addEventListener('click', () => { S.pend = null; openListen(); }); }
    $('#btnDone').textContent = '收下'; $('#btnDone').disabled = false; $('#btnDone').classList.remove('ready');
  }
  function judge(c) { c.pending = false; c.name = c.clar < 2 ? '說不出來的聲音' : c.real; if (c.clar >= 2 && (/鳥/.test(c.real || '') || c.pitch === '高')) c.bird = 1; }   // 收到鳥聲：先收著，走到小鳥旁邊按「給小鳥」才會觸發（見 giveBird）
  const dots = c => '●'.repeat(c.clar || 0) + '○'.repeat(3 - (c.clar || 0));
  function openTune(c, done) {
    const tgt = Math.max(0, Math.min(100, (Math.log(Math.max(c.cen || 300, 100)) - Math.log(100)) / (Math.log(2000) - Math.log(100)) * 100)), start = tgt > 50 ? Math.max(4, tgt - 42) : Math.min(96, tgt + 42);
    let mx = 0, lock = false, hold = 0, v = start, nodes = null, iv = null;
    const cl = x => Math.max(0, 1 - Math.abs(x - tgt) / 28);
    openSheet('<div class="sh-h l-' + (c.cls || 'flower') + '"><span></span><div><h2>調清晰</h2><p class="cap">' + (c.pending ? '還沒判定' : c.name) + '</p></div>' + CLOSE + '</div><p>左右轉，找到聲音最清楚的地方。調好了再判定。</p><div class="tbars" id="tbars">' + '<i></i>'.repeat(9) + '</div><input class="tdial" id="tdial" type="range" min="0" max="100" value="' + start + '" aria-label="調頻旋鈕"><div class="tdl"><span>低</span><span>高</span></div><p class="tcl" id="tcl">清晰 ○○○</p><button class="btn btn-ink btn-block" type="button" id="tOk">先這樣收下</button>');
    const stop = () => { if (iv) clearInterval(iv); iv = null; if (nodes) { try { nodes.n.stop(); nodes.o.stop(); } catch (e) {} nodes = null; } window.__tuneStop = null; };
    window.__tuneStop = stop; ensureAudio();
    try { const n = AC.createBufferSource(), ng = AC.createGain(), o = AC.createOscillator(), og = AC.createGain(); n.buffer = A.noise; n.loop = true; o.frequency.value = Math.max(120, Math.min(1800, c.cen || 400)); ng.gain.value = .08; og.gain.value = 0; n.connect(ng); ng.connect(AC.destination); o.connect(og); og.connect(AC.destination); n.start(); o.start(); nodes = { n, o, ng, og }; } catch (e) {}
    const upd = () => { const k = cl(v); mx = Math.max(mx, k); if (nodes) { nodes.ng.gain.value = .09 * (1 - k); nodes.og.gain.value = .07 * k; }
      $$('#tbars i').forEach((b, i) => { b.style.height = (10 + (k * 34 * (1 - Math.abs(i - 4) / 6)) + (1 - k) * Math.random() * 30) + 'px'; b.style.opacity = .35 + k * .65; });
      const t = $('#tcl'); if (t) t.textContent = lock ? '清晰 ●●●　鎖定了' : k > .85 ? '清晰 ●●●　再穩一下' : k > .5 ? '清晰 ●●○' : k > .2 ? '清晰 ●○○' : '清晰 ○○○'; };
    iv = setInterval(() => { const k = cl(v); if (!lock) { if (k > .85) { hold += 80; if (hold >= 700) { lock = true; sfx.got(); try { navigator.vibrate && navigator.vibrate([30, 40, 30]); } catch (e) {} const b = $('#tOk'); if (b) { b.textContent = '收下（清晰 ●●●）'; popEl(b, 'bump'); } } } else hold = 0; } upd(); }, 80);
    $('#tdial').addEventListener('input', function () { v = Number(this.value); try { navigator.vibrate && navigator.vibrate(4); } catch (e) {} });
    $('#tOk').addEventListener('click', () => { c.clar = lock ? 3 : mx > .5 ? 2 : 1; closeSheet(); done && done(); });
  }
  /* ═════════ [P14] 把鳥聲給小鳥：通知 Unity（tag=bird），Unity 會檢查你的 Ping 有沒有走到小鳥旁邊 ═════════ */
  function giveBird() {   // 跟交給居民一樣：選一張聲音卡
    if (!S.cards.length) { openSheet('<div class="sh-h"><span></span><div><h2>還沒有聲音卡</h2></div>' + CLOSE + '</div><p>先按「收聲音」收一張，再回來給小鳥。</p>'); return; }
    pickCards({ title: '給小鳥聽', need: 1, ok: '給牠聽', onOk: cs => handBird(cs[0]) });
  }
  function handBird(c) {
    if (!c) return; ensureAudio();
    if ((c.clar == null ? 3 : c.clar) < 2) { sfx.oops(); toast('這張還沒調清楚，小鳥聽不懂。轉一轉旋鈕再來。'); return; }
    if (false) { sfx.oops(); openSheet('<div class="sh-h l-house"><span></span><div><h2>小鳥</h2></div>' + CLOSE + '</div><div class="bub small l-house">小鳥歪著頭：「這不是我的歌。」</div><p class="murmur">Blip：換一張，找清脆、一串一串的鳥叫聲。</p>'); return; }
    netPost('/event', { pid: NET.pid, loc: 'river', col: 'sun', tag: 'bird', depth: 'once', secs: 1 });   // Unity 會檢查你的 Ping 有沒有走到小鳥旁邊
    c.given = 1; BIRD.done = true; updateGiveChip();
    burst(innerWidth / 2, innerHeight * .5, 22, 100);
    toast(NET.on ? '小鳥聽到了！看看畫面。' : '還沒連到 Unity，先看看示範畫面。');
    setTimeout(() => { BIRD.done = false; }, 6000);   // 6 秒內沒成功（太遠）還可以再給一次；成功後 Unity 不會再來第二批
  }
  function updateGiveChip() {   // ♪ 小鈕在任務列裡（renderGuide 畫），只有「該不該顯示」變了才重畫
    const old = $('#giveBird'); if (old) old.remove();
    const k = !BIRD.done && S.screen === 'explore';
    if (k !== BIRD.shown) { BIRD.shown = k; renderGuide(); }
  }
  { const gd = $('#guide'); if (gd) gd.addEventListener('click', e => { if (e.target.closest && e.target.closest('#tkBird')) giveBird(); else if (e.target.closest && e.target.closest('#tkPlant')) plantGround(); }); }
  setInterval(updateGiveChip, 800);
  function keepCard() { const c = S.pend; if (!c) return; S.cards.push(c); S.pend = null; burst(innerWidth / 2, innerHeight * .4, 22, 110); show('explore'); renderMap(); try { renderGuide(); } catch (e) {} toast('收到一顆聲音種子。種在居民旁邊叫醒他，或種在路邊。'); }
  /* ═════════ [P15] 聲音種子：口袋 2 格、聽得越穩種子越飽滿、種進小鎮（2026-11-13） ═════════ */
  const POCKET = CONFIG.pocket, RH = { '一下一下': 0, '一陣一陣': 1, '連續': 2 }, PT = { '低': 0, '中': 1, '高': 2 }, WT = { '輕': 0, '中': 1, '重': 2 };
  const FOC = { n: 0, still: 0, lm: 0, first: true, asked: false };
  window.addEventListener('devicemotion', ev => {   // 手機拿得穩不穩：每次加速度變化很小就算「靜」
    if (S.screen !== 'listen') return; const a = ev.accelerationIncludingGravity || ev.acceleration; if (!a || a.x == null) return;
    const m = Math.hypot(a.x, a.y, a.z), d = Math.abs(m - FOC.lm); FOC.lm = m; if (FOC.first) { FOC.first = false; return; }
    FOC.n++; if (d < 0.35) FOC.still++; if (d > 1.2) FOC.shakeAt = Date.now();
  });
  const LVF = [1, .78, .57];   // 小鎮越熱鬧，越難靜下來聽：收聲音的累積速度 100% / 78% / 57%
  /* [P29] 小鎮熱鬧度條（和 Unity 公用螢幕上方那條一樣：奶油底、「小鎮 熱鬧起來」、粉色進度），放在 3D 畫面右上角、計時鈕下方（不擋左上角的名字和 Blip 說的話） */
  let GP = null, gpEl = null, gpLv = -1, gpT = 0;
  function gardenPill() {
    try { if (GP && (GP.lv | 0) !== gpLv) { gpLv = GP.lv | 0; gpT = Date.now(); }   /* [P91] 熱鬧度膠囊只在剛進來／等級改變後出現 6 秒，平常不佔畫面 */
      const show = U.m === 1 && S.started && !S.ended && GP && Date.now() - gpT < 6000 && !DETS.on && !document.body.classList.contains('tut') && $('#lsOv') && $('#lsOv').hidden;
      if (!gpEl) { gpEl = document.createElement('div'); gpEl.className = 'sdx-gp'; gpEl.innerHTML = '<b></b><i><u></u></i>'; document.body.appendChild(gpEl); }
      gpEl.hidden = !show; if (!show) return; const lv = GP.lv | 0; gpEl.firstChild.textContent = '小鎮 ' + (lv >= 2 ? '好熱鬧' : lv === 1 ? '熱鬧起來' : '靜悄悄'); gpEl.querySelector('u').style.width = Math.max(4, Math.min(100, GP.loud || 0)) + '%';
      const f = $('#uFrame'), r = f && !f.hidden ? f.getBoundingClientRect() : null; if (r && r.width > 40) { gpEl.style.left = 'auto'; gpEl.style.transform = 'none'; gpEl.style.right = (innerWidth - r.right + 12) + 'px'; gpEl.style.top = (r.top + 62) + 'px'; } } catch (e) {}
  }
  /* [W02] 天氣：伺服器統一給一個值；頂部倒數旁一個小圖示，換天氣時 Blip 說一句（不佔操作區）；小鎮光線／雨／風由 town3d 處理 */
  const WX_ICON = { clear: '☀️', partly: '⛅', cloud: '☁️', fog: '🌫️', rain: '🌧️', wind: '🌬️' }, WX_SAY = { partly: '雲慢慢飄，光一下亮一下。', fog: '起霧了，遠遠的聲音變柔柔的。', clear: '今天天氣好，聲音傳得很遠。', cloud: '雲有點厚，小鎮靜靜的。', rain: '外面在下雨，聽聽雨聲吧。', wind: '風有點大，樹葉沙沙響。' };
  let WXK = '', WXO = null;
  function weatherSync(w) {
    if (!w || !WX_ICON[w.kind]) return; const wk = w.kind + ':' + (w.lv || 1); if (wk === WXK) return;
    WXK = wk; WXO = w; const el = $('#wx'); if (el) { el.textContent = WX_ICON[w.kind]; el.hidden = false; el.setAttribute('aria-label', '天氣：' + (w.label || '')); }
    toTown({ tunein: 'weather', kind: w.kind, lv: w.lv });
    let seen = ''; try { seen = sessionStorage.getItem('tunein.wx') || ''; } catch (e) {}
    if (S.started && !S.ended && seen !== w.kind) { try { sessionStorage.setItem('tunein.wx', w.kind); } catch (e) {} toast('Blip：' + WX_SAY[w.kind], 'info'); }
  }
  function gardenSync(g) {   // 每次輪詢 /state 都呼叫：熱鬧度等級變高時提醒一次
    if (g) { GP = g; gardenPill(); }
    if (!g) return; const lv = g.lv | 0; if (lv === NET.lv) return; const up = lv > (NET.lv | 0); NET.lv = lv; if (!S.started || S.ended || !up) return;
    if (lv === 1) toast('小鎮熱鬧起來了。要聽見細小的聲音，要靜一點。', undefined, 5000); else if (lv === 2) toast('小鎮好熱鬧！聲音多了，聽的時候要更有耐心。', undefined, 5000);
  }
  function focReset() { FOC.n = 0; FOC.still = 0; FOC.first = true; if (!FOC.asked) { FOC.asked = true; try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission().catch(() => {}); } catch (e) {} } }
  function focusQ() { const f = FOC.n >= 12 ? FOC.still / FOC.n : 0.6; return Math.round((0.4 + 0.6 * Math.max(0, Math.min(1, f))) * 100) / 100; }   // 沒有感應器就給中間值 0.6
  const REC = { on: false, t0: 0, iv: null, fn0: 0, fs0: 0, env: '' };
  const REC_MAX = 6500, pdots = v => { const n = Math.max(1, Math.min(3, Math.round(v * 3))); return '●'.repeat(n) + '○'.repeat(3 - n); };
  function recStart() {
    if (REC.on || S.pend || !LV.on || A.mode !== 'mic' || MT.paused || SING.on) return;
    REC.on = true; SING.on = true; REC.t0 = performance.now(); REC.fn0 = FOC.n; REC.fs0 = FOC.still; REC.env = MT.env || '';
    A.rec = []; const bd = $('#btnDone'); bd.classList.add('holding'); bd.textContent = '錄音中…放開結束'; setL('錄音中', '拿穩手機，等花唱完再放開');
    REC.iv = setInterval(() => { const p = Math.min(1, (performance.now() - REC.t0) / REC_MAX); try { setRing(p); } catch (e) {} if (p >= 1) recStop(); }, 50);
  }
  async function recStop() {
    if (!REC.on) return; REC.on = false; clearInterval(REC.iv); const f = A.rec || []; A.rec = null; SING.on = false; try { setRing(0); } catch (e) {}
    const bd = $('#btnDone'); bd.classList.remove('holding');
    const reset = () => { SING.orig = null; SING.mine = null; SING.q = null; SING.parts = null; };
    if (f.length < 16) { sfx.oops(); setL('太短了', '按住，等花唱完再放開。沒有損失。'); return; }
    const rs = f.map(x => x.rms).sort((a, b) => a - b), nf = rs[Math.floor(rs.length * .2)] || 0, thr = Math.max(MT.active() ? .0012 : A.thr(), nf * 2.2);
    if (f.filter(x => x.rms > thr).length < 8) { sfx.oops(); setL('沒錄到花的聲音', '等花唱的時候再按住，靠近一點。沒有損失。'); return; }
    const res = analyse(f, S.quiet ? TH.loudQuiet : TH.loud);
    if (res.bad === 'loud') { sfx.oops(); setL('太大聲了', '離花遠一點再錄。沒有損失。'); return; }
    if (res.bad === 'quiet') { sfx.oops(); setL('沒錄到花的聲音', '靠近一點再錄。沒有損失。'); return; }
    const near = clamp01(((res.db || 0) - 8) / 22), E = Math.max(1, Math.min(4, f.length >> 3));
    const eq = a => a.filter(x => x.rms <= thr).length / E >= .5 ? .5 : 0, complete = eq(f.slice(0, E)) + eq(f.slice(-E));
    const dn = FOC.n - REC.fn0, ds = FOC.still - REC.fs0, still = dn >= 6 ? ds / dn : .6, envK = REC.env === '安靜' ? .9 : REC.env === '吵' ? .45 : .7, clean = clamp01(envK * (.6 + .4 * still));
    const q = Math.round(clamp01(.4 + .6 * (.4 * near + .3 * clean + .3 * complete)) * 100) / 100;
    SING.orig = res; SING.mine = { rhythm: res.rhythm, pitch: res.pitch, weight: res.weight }; SING.q = q; SING.parts = { near, clean, complete };
    await confirmLive(); if (!S.pend) reset();
  }
  function qdots(c) { const n = Math.max(1, Math.min(3, Math.round((c.q == null ? .6 : c.q) * 3))); return '●'.repeat(n) + '○'.repeat(3 - n); }
  function plantRec(c, at, res) {
    const q = c.q == null ? .6 : c.q, m = c.mine || c; S.planted.push({ id: c.id, name: c.name, rhythm: m.rhythm, pitch: m.pitch, weight: m.weight, q, cls: c.cls || 'flower', at, res: res || '', t: Date.now() });
    if (NET.on && NET.joined) netPost('/plant', { pid: NET.pid, rh: RH[m.rhythm] == null ? 0 : RH[m.rhythm], pt: PT[m.pitch] == null ? 1 : PT[m.pitch], wt: WT[m.weight] == null ? 0 : WT[m.weight], q, tr: c.bid || c.real || '', sn: (c.name || '').slice(0, 12), fine: c.fine ? 1 : 0, at, res: res || '' });
  }
  function plantGround() {   // 種在路邊：Ping 站哪就種哪
    if (!S.cards.length) { openSheet('<div class="sh-h"><span></span><div><h2>口袋是空的</h2></div>' + CLOSE + '</div><p>先去找正在響的花，靜下來聽，收一顆種子。</p>'); return; }
    pickCards({ title: '種在這裡', need: 1, ok: '種下', onOk: cs => { const c = cs[0]; plantRec(c, 'ground', ''); S.cards = S.cards.filter(x => x !== c); try { sfx.got && sfx.got(); } catch (e) {} burst(innerWidth / 2, innerHeight * .4, 26, 120); toast('種下了「' + c.name + '」。小鎮多了一點聲音。'); try { renderGuide(); renderMap(); updateCount(); } catch (e) {} } });
  }

  /* ═════════ [P16] 聲音卡頁 ═════════ */
  function renderCards() {
    const el = $('#specs'); if (!el) return;
    el.innerHTML = S.cards.length ? S.cards.map(c => '<div class="scard l-' + (c.cls || 'flower') + '"><button class="play" type="button" data-pc="' + c.id + '" aria-label="播放">' + icon('play') + '</button><b>' + c.name + '</b>' + MT.waveHTML(c) + '<span class="meta">' + tagsHTML(c) + (c.clar ? '　清晰 ' + dots(c) : '') + '</span><span class="meta">' + c.where + (c.gift ? '・交流收下' : (c.no ? '・第 ' + c.no + ' 位發現' : '')) + '</span>' + (c.bird ? '<button class="btn btn-ink givebtn" type="button" data-gb="' + c.id + '">給小鳥</button>' : '') + '</div>').join('') :
      '<div class="card empty"><h2>還沒有聲音卡</h2><p>回小鎮按「收聲音」，收一個你聽到的聲音。</p></div>';
    $$('#specs [data-pc]').forEach(b => b.addEventListener('click', () => { const c = S.cards.find(x => x.id === Number(b.getAttribute('data-pc'))); if (c) { if (CLIPS[c.id]) MT.playClip(c.id); else play(kindOf(c)); } }));
    $$('#specs [data-gb]').forEach(b => b.addEventListener('click', giveBird));
    MT.bindClips(el);
  }

  /* ═════════ [P17] 結局與離場卡 ═════════ */
  function openSettle() {
    if (S.ended) return; S.ended = true; try { localStorage.removeItem('tunein.sess'); } catch (e) {} closeSheet(); clearInterval(S.settleTimer);
    const a = MAIN.filter(id => S.woke[id]).length, kinds = new Set(S.planted.map(x => x.name)).size, aq = S.planted.length ? S.planted.reduce((t, x) => t + (x.q || 0), 0) / S.planted.length : 0;
    let E = (a >= 4 && ((NET.lv | 0) >= 2 || S.marks >= 1)) ? ['小鎮好熱鬧', 'Blip 坐到你身邊，耳朵輕輕晃'] : (a >= 4 && NET.on ? ['小鎮醒了', '小鎮醒了，熱鬧裡還留著一個安靜的角落。'] : ENDS[a]);
    if (S.planted.length) E = [E[0], E[1] + (aq >= .75 ? '　你聽得很專心，種下的聲音又亮又久。' : '　你種下的聲音，讓小鎮多了一點熱鬧。')];
    S.end = E; $('#stRound').textContent = '時間到'; $('#stAll').textContent = E[0];
    const meter = '<div class="rsm"><div class="rsm-l"><span>開始　好安靜</span><b>現在　' + a + '／4 位醒了</b></div><div class="rsm-b">' + MAIN.map(id => '<i class="' + (S.woke[id] ? 'on ' : '') + 'l-' + N[id].cls + '"></i>').join('') + '</div></div>';   // [P38] 結果頁：小鎮從安靜到熱鬧
    $('#stTiles').innerHTML = meter + MAIN.map(id => { const n = N[id], on = !!S.woke[id]; return '<div class="tile l-' + n.cls + (on ? ' on' : '') + '"><span class="ti">' + icon(n.icon) + '</span><b>' + n.who + '</b><span class="st">' + (on ? n.fx : '還在睡') + '</span></div>'; }).join('');
    $('#stLine').textContent = E[1]; $('#stMine').hidden = true; const pr = $('#stProg'); pr.classList.remove('run'); void pr.offsetWidth; pr.classList.add('run');
    let left = SETTLE_MS / 1000; $('#stCount').textContent = '離場卡 ' + left + ' 秒後出現'; $('#stCards').hidden = false;
    show('settle'); if (a >= 4) sfx.wake();
    S.settleTimer = setInterval(() => { left--; $('#stCount').textContent = '離場卡 ' + left + ' 秒後出現'; if (left <= 0) { clearInterval(S.settleTimer); showLeave(); } }, 1000);
  }
  function showLeave() {
    clearInterval(S.settleTimer); const E = S.end || ENDS[0]; $('#lvName').textContent = E[0];
    $('#lvLine').textContent = E[1].replace(new RegExp('^' + E[0] + '[。，,]?\\s*'), '') || E[1];
    const aw = MAIN.filter(id => S.woke[id]).length, fr = FR.filter((f, i) => S.friends[i]).length, sw = S.notes.filter(n => n.src).length;
    const dots = MAIN.map(id => '<i style="background:var(--h-' + N[id].cls + ');opacity:' + (S.woke[id] ? 1 : .22) + '"></i>').join('');
    const tile = (n, l, x) => '<div class="lvt"><b class="num">' + n + '</b><span>' + l + '</span>' + (x || '') + '</div>';
    const found = S.cards.concat(S.planted), seenN = {}, uniq = found.filter(c => !seenN[c.name] && (seenN[c.name] = 1));
    $('#lvLittle').innerHTML = tile(aw + '/4', '叫醒居民', '<span class="lvd2">' + dots + '</span>') + tile(uniq.length, '發現的聲音') + tile(S.planted.length, '種下的聲音') + tile(fr, '新朋友');
    $('#lvSounds').innerHTML = '<p class="lvst">我發現的聲音</p><div class="lvchips">' + (uniq.length ? uniq.map(c => '<span class="lvchip l-' + (c.cls || 'flower') + '"><i></i>' + c.name + '</span>').join('') : '<span class="lvnone">這輪還沒收到聲音，下次去聽聽看</span>') + '</div>';
    $('#lvSounds').hidden = false;
    NetLeave();   // 看結果時 Ping 先離場，不留在小鎮裡；再玩一次時才重新加入（會有出現動畫）
    show('leave');
    clearInterval(S.leaveTimer); let lt = LEAVE_AUTO; const lb = $('#lvAgain'); if (lb) lb.textContent = '再玩一次（' + lt + '）';
    S.leaveTimer = setInterval(() => { if (S.screen !== 'leave') { clearInterval(S.leaveTimer); return; } lt--; if (lb) lb.textContent = '再玩一次（' + Math.max(lt, 0) + '）'; if (lt <= 0) { clearInterval(S.leaveTimer); playAgain(); } }, 1000);   // 每輪結束自動回到開頭，重新來過
  }
  const LEAVE_AUTO = CONFIG.leaveAutoSec;
  function NetLeave() { if (NET.on && NET.joined) { NET.joined = false; NET.left = true; netPost('/leave', { pid: NET.pid }); } }
  function playAgain() { clearInterval(S.leaveTimer); { const lb = $('#lvAgain'); if (lb) lb.textContent = '再玩一次'; } if (NET.stale) { location.reload(); return; } const t = S.taught, p = S.players, td = S.tutDone; reset(); S.taught = t; S.players = p; S.tutDone = td; S.round = 2; S.introDone = true; $('#ltg').innerHTML = ''; moveMe(ME0.x, ME0.y); newRoundReset(); show('join'); }

  /* ═════════ [P18] 練習（3 步）與聲音測試 ═════════ */
  const T = { step: 1, ok: false, cal: false };
  const seg = () => '<div class="seg2" id="srcSeg"><button type="button" data-src="demo" class="' + (A.mode === 'demo' ? 'on' : '') + '">示範聲音</button><button type="button" data-src="mic" class="' + (A.mode === 'mic' ? 'on' : '') + '">麥克風</button></div><p class="cap" id="srcMsg">' + (A.mode === 'mic' ? '麥克風已開，關閉降噪和自動增益。' : '用按鈕播出聲音，不需要麥克風。') + '</p>';
  async function chooseSrc(m, afterFn) {
    A.init(); const msg = $('#srcMsg');
    if (m === 'mic') { if (msg) msg.textContent = '正在請求麥克風…'; if (!(await A.useMic())) { A.useDemo(); if (msg) msg.textContent = '這個頁面拿不到麥克風（瀏覽器或嵌入限制），已改回示範聲音。'; } else if (msg) msg.textContent = '麥克風已開，關閉降噪和自動增益。請先校準。'; } else A.useDemo();
    A.calibrated = false; $$('#srcSeg button').forEach(b => b.classList.toggle('on', b.getAttribute('data-src') === A.mode)); $$('[data-pads]').forEach(e => { e.style.display = A.mode === 'demo' ? '' : 'none'; }); if (afterFn) afterFn();
  }
  function enterTeach() { ensureAudio(); T.step = 1; T.ok = false; show('teach'); renderTeach(); }
  function endTeach() { S.taught = true; startRound(); }
  function renderTeach() {
    const el = $('#s-teach'), st = T.step; let top = '', bot = '';
    const N_ST = 2, dots = '<div class="dots" aria-hidden="true">' + [1, 2].map(k => '<i' + (k === st ? ' class="on"' : '') + '></i>').join('') + '</div>', skip = '<button class="btn-text" data-act="skip" type="button">跳過說明</button>';
    const head = '<p class="tstep">Blip 的說明 ' + st + '／' + N_ST + '</p>', nxt = l => '<button class="btn btn-ink btn-block" data-act="next" type="button">' + l + '</button>';
    const ping = (x, y, c) => '<use href="#i-sprite" x="' + (x - 34) + '" y="' + (y - 38) + '" width="68" height="56" style="color:' + c + '"/>';
    const ILL = [
      '<svg class="tillu" viewBox="20 8 280 168" aria-hidden="true"><ellipse cx="160" cy="138" rx="126" ry="14" fill="#B7E1D1" opacity=".55"/><g class="tfx t-walk"><g class="t-bob">' + ping(160, 112, '#FFB5C1') + '</g></g><g fill="#111111"><path class="t-arr" d="M222 150l14-8v16z"/></g><circle cx="46" cy="138" r="4" fill="#111111" opacity=".25"/><circle cx="270" cy="138" r="4" fill="#111111" opacity=".25"/></svg>',
      '<svg class="tillu" viewBox="20 8 280 168" aria-hidden="true"><ellipse cx="160" cy="146" rx="126" ry="12" fill="#B7E1D1" opacity=".55"/>' + ping(84, 112, '#FFB5C1') + '<g transform="translate(236 122)" stroke-linejoin="round"><path d="M-27.5 -34.4 L-28.7 -33.1 L-29.8 -31.1 L-30.8 -26.2 L-30.5 -21.5 L-28.4 -13.6 L-32.2 -9.1 L-35.2 -3.8 L-37.0 1.4 L-38.0 8.2 L-37.6 12.7 L-36.4 16.5 L-34.3 20.6 L-31.3 24.5 L-26.2 28.6 L-19.0 32.3 L-10.3 34.7 L-5.7 35.5 L-0.5 35.9 L7.9 35.5 L17.0 33.5 L24.3 30.3 L30.1 26.2 L33.6 22.4 L36.2 17.9 L37.4 13.9 L37.9 6.4 L37.1 0.6 L35.3 -4.7 L32.2 -10.2 L29.0 -14.1 L29.0 -15.0 L30.4 -19.1 L31.1 -23.1 L30.9 -27.9 L30.4 -29.7 L29.2 -31.8 L27.7 -33.2 L26.0 -34.0 L24.5 -34.3 L21.8 -34.1 L18.8 -33.1 L15.3 -31.1 L12.0 -28.4 L8.9 -25.1 L4.4 -25.5 L-0.9 -25.6 L-8.2 -24.9 L-11.0 -28.7 L-14.1 -31.9 L-18.4 -34.8 L-21.1 -35.8 L-23.5 -36.0 L-25.5 -35.6Z" fill="#000" stroke="#000" stroke-width=".8"/><path d="M6.3 -2.8 L5.5 -1.7 L5.7 0.2 L6.8 1.3 L7.9 1.3 L8.9 0.3 L8.9 -1.6 L7.7 -2.9ZM-0.4 -2.9 L-1.8 -2.4 L-2.6 -1.3 L-2.7 -0.4 L-2.3 0.5 L-1.1 1.2 L0.3 0.9 L1.3 -0.6 L0.9 -2.2ZM5.7 -8.6 L5.5 -7.2 L5.9 -6.1 L6.8 -5.2 L8.9 -4.5 L10.1 -4.5 L12.0 -5.1 L13.3 -6.2 L13.8 -7.5 L13.6 -8.6 L13.0 -9.5 L10.6 -10.6 L8.2 -10.5 L6.6 -9.7ZM-7.7 -8.7 L-7.8 -7.4 L-7.4 -6.5 L-6.3 -5.4 L-4.0 -4.6 L-2.2 -4.6 L-0.8 -5.0 L0.6 -6.1 L1.0 -7.0 L0.5 -9.0 L-0.3 -9.8 L-2.6 -10.7 L-5.6 -10.5 L-6.8 -9.8ZM22.5 -32.4 L19.5 -31.1 L17.2 -29.2 L14.3 -25.8 L12.7 -22.8 L20.5 -18.1 L20.8 -18.3 L21.0 -17.8 L25.6 -15.2 L26.1 -15.2 L26.2 -15.7 L25.7 -16.2 L26.2 -16.4 L28.2 -22.0 L28.6 -24.3 L28.5 -27.9 L27.8 -30.1 L26.2 -31.9 L24.5 -32.5ZM-22.2 -33.1 L-24.3 -33.0 L-26.2 -31.9 L-27.6 -30.1 L-28.4 -27.6 L-28.4 -25.3 L-27.6 -21.8 L-25.9 -18.0 L-24.0 -15.2 L-23.3 -15.3 L-10.9 -21.8 L-11.0 -22.8 L-11.8 -23.5 L-15.4 -28.7 L-18.5 -31.5 L-20.4 -32.6Z" fill="#F7F7F7" stroke="#F7F7F7" stroke-width=".5"/><path d="M22.1 -3.5 L19.8 -2.9 L17.5 -1.0 L16.1 1.6 L15.9 4.8 L17.0 7.9 L18.6 9.7 L20.9 11.0 L23.4 11.2 L25.9 10.4 L28.2 8.3 L29.4 5.5 L29.5 3.0 L28.6 0.1 L26.8 -2.0 L24.3 -3.3ZM-18.3 -4.4 L-20.7 -3.6 L-23.2 -1.4 L-24.4 0.8 L-24.9 4.4 L-24.2 7.2 L-22.4 9.7 L-19.5 11.3 L-17.1 11.4 L-15.4 10.9 L-13.9 10.0 L-12.0 7.9 L-11.0 5.7 L-10.7 2.1 L-11.7 -0.9 L-13.6 -3.1 L-15.8 -4.2Z" fill="#FF5A5A" stroke="#FF5A5A" stroke-width=".5"/><path d="M-8.1 8.0 L-6.9 8.6 L-4.5 9.0 L-0.1 8.6 L2.0 7.4 L2.2 6.7 L2.7 6.6 L3.5 5.4 L4.2 6.7 L5.3 7.7 L7.8 8.9 L11.9 9.0 L13.1 8.4 L14.2 8.3 L13.9 7.7 L11.5 6.5 L9.5 4.5 L6.9 3.0 L4.8 2.6 L3.5 3.4 L2.7 2.5 L1.9 2.2 L0.4 2.4 L-1.4 3.2Z" fill="#D2D2D2" stroke="#D2D2D2" stroke-width=".5"/></g><g class="tfx t-pop"><path d="M212 36h30a13 13 0 0 1 0 26h-17l-7 9 1-9h-7a13 13 0 0 1 0-26z" fill="#fff" stroke="#111111" stroke-width="2.5" stroke-linejoin="round"/><g fill="#111111"><circle class="tfx t-dot" cx="215" cy="49" r="3"/><circle class="tfx t-dot" cx="227" cy="49" r="3"/><circle class="tfx t-dot" cx="239" cy="49" r="3"/></g></g></svg>',
      '<svg class="tillu" viewBox="20 8 280 168" aria-hidden="true"><ellipse cx="160" cy="140" rx="126" ry="12" fill="#B7E1D1" opacity=".55"/><g transform="translate(160 78)"><circle class="tfx t-ring" r="26"/><circle class="tfx t-ring b" r="26"/><circle class="tfx t-ring c" r="26"/><g class="tfx t-bob"><g fill="#FFB5C1"><circle cx="0" cy="-24" r="14"/><circle cx="23" cy="-8" r="14"/><circle cx="14" cy="19" r="14"/><circle cx="-14" cy="19" r="14"/><circle cx="-23" cy="-8" r="14"/></g><circle r="12" fill="#FFE59A"/></g></g><rect x="70" y="138" width="180" height="14" rx="7" fill="#fff" stroke="#111111" stroke-width="3"/><rect class="t-fill" x="73" y="141" width="174" height="8" rx="4" fill="#6FBF9F"/></svg>',
      '<svg class="tillu" viewBox="20 8 280 168" aria-hidden="true"><ellipse cx="160" cy="150" rx="126" ry="10" fill="#B7E1D1" opacity=".55"/><g transform-origin="center"><rect class="tfx t-key" x="58" y="82" width="56" height="62" rx="18" fill="#A9D3FF"/><rect class="tfx t-key k2" x="132" y="58" width="56" height="86" rx="18" fill="#B7E1D1"/><rect class="tfx t-key k3" x="206" y="30" width="56" height="114" rx="18" fill="#FFB5C1"/></g><g font-family="sans-serif" font-weight="900" font-size="18" fill="#111111" text-anchor="middle"><text x="86" y="170">低</text><text x="160" y="170">中</text><text x="234" y="170">高</text></g></svg>'
    ];
    const PG = [   // Blip 的開場說明（只講目標；操作步驟改成在小鎮畫面上隨時提示，見 coachTick）
      ['嗨，我是 Blip', '這個顏色很適合你的 Ping。小鎮太安靜了，我們一起讓它熱鬧起來。'],
      ['先找聲音，再種下去', '用下面的「探測器」找小鎮裡微弱的聲音，找到了就種在居民身邊。我會在畫面上提示你。']
    ];
    { const g = PG[st - 1]; top = '<div class="tpg tin">' + head + '<div class="tblipw">' + BLIP_FLAT('tblip') + '</div><div class="bub small l-house tbub"><b>Blip</b><p class="tq2">' + g[0] + '</p><p class="tl">' + g[1].split('。').filter(Boolean).map(x => '<span>' + x + '。</span>').join('') + '</p></div></div>'; bot = dots + (st === 2 ? '<button class="btn btn-ink btn-block" data-act="go" type="button">一起出發</button>' : nxt('繼續')) + (st === 2 ? '' : skip); }
    el.innerHTML = '<div class="jpage"><div class="join-top how-top">' + top + '</div><div class="join-bottom">' + bot + '</div></div>';
    $$('#s-teach [data-act]').forEach(b => b.addEventListener('click', () => { const a = b.getAttribute('data-act'); if (a === 'next') { T.step = Math.min(2, T.step + 1); T.ok = false; renderTeach(); } else endTeach(); }));
  }
  const SAMPLES = [{ k: 'knock', n: '滴答聲' }, { k: 'tune', n: '嗡嗡聲' }, { k: 'calm', n: '輕輕的水聲' }, { k: 'stack', n: '熱熱鬧鬧的人聲' }];
  async function teachMic() {
    if (L.busy || T.cal) return; const m = $('#tMsg');
    if (A.mode === 'mic') { A.useDemo(); A.calibrated = false; renderTeach(); return; }
    m.textContent = '正在請求麥克風…';
    if (!(await A.useMic())) { A.useDemo(); m.textContent = '這個頁面拿不到麥克風，繼續用示範聲音。'; return; }
    T.cal = true; $('#tPlay').disabled = true; m.textContent = '先安靜 3 秒，讓我認識這裡…';
    await calibrate(p => { const f = $('#tFill'); if (f) f.style.width = (p * 100) + '%'; }); T.cal = false; renderTeach();
  }
  async function teachGo() {
    if (L.busy || T.cal) return; const demo = A.mode === 'demo', sm = demo ? SAMPLES[(T.n = (T.n || 0) + 1) % SAMPLES.length] : null; A.init();
    $('#tRes').innerHTML = ''; $('#tPlay').disabled = true; $('#tMsg').textContent = '聽著……'; if (sm) play(sm.k);
    const res = await doCollect(false, p => { const f = $('#tFill'); if (f) f.style.width = (p * 100) + '%'; }); const m = $('#tMsg'); if (!m) return; $('#tFill').style.width = '0'; $('#tPlay').disabled = false;
    if (res.bad) { sfx.oops(); m.textContent = res.bad === 'loud' ? '周圍聲音有點多，等一下再收。沒有損失。' : '好像沒聽到，再按一次。'; return; }
    sfx.got(); m.textContent = '收到了！先轉旋鈕，把聲音調清楚。';
    const c = { name: '？？？', real: res.name, cen: res.cen, rhythm: res.rhythm, pitch: res.pitch, weight: res.weight, wide: res.wide, cls: 'flower', pending: true, clar: 0 };
    $('#tRes').innerHTML = '<div class="tresc"><b class="cn">？？？</b><p class="cap">調清晰後才判定</p></div>'; await sleep(500);
    openTune(c, async () => { const mm = $('#tMsg'); if (!mm) return; mm.textContent = '判定中……'; await sleep(800); judge(c); sfx.got(); mm.textContent = demo ? '判定好了！再按一次，聽不一樣的。' : '判定好了！'; if (demo) $('#tPlay').innerHTML = '再播一個';
      $('#tRes').innerHTML = '<div class="tresc"><b class="cn">' + c.name + '</b><p class="cap">' + (sm ? '剛剛放的是：' + sm.n + '　・　' : '') + '清晰 ' + dots(c) + '</p><div class="tcells"><span><small>節奏</small><b>' + c.rhythm + '</b></span><span><small>高低</small><b>' + c.pitch + (c.wide ? '・有高有低' : '') + '</b></span><span><small>輕重</small><b>' + c.weight + '</b></span></div></div>';
      T.ok = true; const nb = $('#s-teach [data-act="next"]'); if (nb) nb.disabled = false; });
  }
  function renderMic() {
    $('#s-mic').innerHTML = '<div class="mic-head"><button class="icon-btn" id="mBack" type="button" aria-label="返回"><svg aria-hidden="true"><use href="#i-back"/></svg></button><h2>收音和聲音測試</h2></div>' +
      '<div class="card mic-card"><h3>1　聲音來源</h3>' + seg() + '</div>' +
      '<div class="card mic-card"><h3>2　即時聽到</h3><div class="mbar"><i class="mtl"></i></div><p class="mread mtx" role="status"></p><div style="display:flex;gap:8px;align-items:center"><span class="cap" id="baseMsg">' + (A.calibrated ? '底噪 ' + A.base.toFixed(4) + '　已校準' : '還沒校準') + '</span><button class="btn btn-soft" id="mCal" type="button" style="margin-left:auto">校準 3 秒</button></div></div>' +
      '<div class="card mic-card"><h3>3　示範聲音</h3><p class="cap">點一個播出聲音，看上面的數字怎麼動。</p>' + padsHTML() + '</div>' +
      '<div class="card mic-card"><h3>4　試收</h3><button class="btn btn-ink" id="mTest" type="button">試收 3 秒</button><div id="mOut"></div></div>';
    $('#mBack').addEventListener('click', () => show(S.micFrom === 'explore' ? 'explore' : 'join'));
    $$('#srcSeg button').forEach(b => b.addEventListener('click', () => chooseSrc(b.getAttribute('data-src'))));
    $('#mCal').addEventListener('click', async () => { $('#baseMsg').textContent = '校準中，請保持安靜…'; A.init(); await calibrate(); $('#baseMsg').textContent = '底噪 ' + A.base.toFixed(4) + '　已校準'; });
    $('#mTest').addEventListener('click', async () => { $('#mOut').innerHTML = '<p class="cap">在聽……請發出一個聲音</p>'; const r = await doCollect(false); const o = $('#mOut'); if (!o) return;
      if (r.bad) { o.innerHTML = '<p class="mread">' + (r.bad === 'loud' ? '聲音太多' : '沒聽到') + '　最大音量 ' + r.mx.toFixed(3) + '，' + r.db.toFixed(1) + ' dB</p>'; return; }
      o.innerHTML = '<p class="cn" style="font-size:24px;margin:8px 0">' + r.name + '</p><p class="cap">節奏：' + r.rhythm + '（' + r.onsets + ' 段，平均 ' + (r.burst | 0) + ' ms，有聲 ' + ((r.ratio * 100) | 0) + '%）<br>高低：' + r.pitch + '（' + (r.cen | 0) + ' Hz' + (r.wide ? '，有高有低' : '') + '，比值 ' + r.spread.toFixed(1) + '）<br>輕重：' + r.weight + '（' + r.db.toFixed(1) + ' dB）</p>'; });
  }
  function openMic(from) { S.micFrom = from; A.init(); show('mic'); renderMic(); }

  /* ═════════ [P19] 組裝 ═════════ */
  function joinPage(n) { $('#jp1').hidden = n !== 1; $('#jp2').hidden = n !== 2; }
  /* ═════════ [P25] 新一輪重置 ═════════ 手機端：種子、3D 小鎮（對話、種下的花、其他玩家、事件）一起清掉，和伺服器／Unity 的重置同步 */
  function newRoundReset() {
    try { localStorage.removeItem('tunein.seeds'); } catch (x) {}
    try { localStorage.removeItem('tunein.sess'); } catch (x) {}
    try { const fr = $('#uFrame'); if (fr && fr.contentWindow) fr.contentWindow.postMessage({ tunein: 'reset' }, '*'); } catch (x) {}
    try { TUTO.go = 0; TUTO.ack = 0; } catch (x) {}
    try { const b = $('#t3talk'); if (b) b.hidden = true; } catch (x) {}
  }
  function startRound() {
    NET.restored = false; ensureAudio(); A.init(); const t = S.taught, p = S.players, td = S.tutDone; reset(); S.taught = t; S.players = p; S.tutDone = td; S.started = true; S.roundEnd = Date.now() + ROUND_MS; S.view = 'map'; $('#ltg').innerHTML = ''; moveMe(ME0.x, ME0.y); emInit(); newRoundReset(); netJoin(); syncRound();
    if (!$('#quiet')) $('#guide').insertAdjacentHTML('afterend', '<div class="card" id="quiet" hidden>小葵 Ping 正在收聲音，輕一點。</div>');
    show('explore'); tickRound();
  }
  function setMyColor(col) { ME = col; const mu = document.querySelector('#me use'); if (mu) mu.style.color = 'var(--h-' + col + ')'; const su = document.querySelector('.scene .fl use'); if (su) su.style.color = 'var(--h-' + col + ')'; document.documentElement.style.setProperty('--me', 'var(--h-' + col + ')'); }

  /* ═════════ [P20] 連到小鎮伺服器：玩家加入時 Unity 出現 Ping、位置即時同步、發聲點由伺服器排程 ═════════ */
  let uMode = 0;   // 0 關閉　1 Unity 全螢幕（Unity 管我的 Ping）　2 小窗
  window.__netApi = () => NET.api;   // 串流頁（iframe）用：問伺服器這位玩家的 Ping 生出來了沒
  /* 融合：收聲音流程 = listen.html（內嵌），共用同一個玩家與伺服器居民資料 */
  function openCollect() { const o = $('#lsOv'), f = $('#lsFr'); if (!o || !f) return; f.src = 'listen.html?embed=' + (NET.pid ? '1&pid=' + encodeURIComponent(NET.pid) : '0') + (S.roundEnd ? '&end=' + S.roundEnd : '') + '&t=' + Date.now(); o.hidden = false; }
  function closeCollect() { const o = $('#lsOv'), f = $('#lsFr'); if (o) o.hidden = true; if (f) f.src = 'about:blank'; try { trayRender(); } catch (e) {} }
  /* ---- 種子選擇列：在 Unity 畫面上選種子 → 種在 Ping 站的地方（或給想聽的居民） ---- */
  var SKEY = ['bird', 'chime', 'clock', 'chick', 'rain', 'drop', 'frog', 'cricket', 'fire', 'owl', 'sea', 'wind', 'bell', 'down1', 'down2', 'down3', 'odd1', 'odd2', 'down4', 'down5', 'odd3', 'odd4', 'odd5'];
  var SNAME = { bird: '鳥叫', chime: '風鈴', clock: '時鐘', chick: '小雞', rain: '雨', drop: '水滴', frog: '青蛙', cricket: '蟲鳴', fire: '火堆', owl: '貓頭鷹', sea: '海浪', wind: '風', bell: '鐘聲', down1: '降頻啾聲', down2: '低低震動', down3: '拉長和音', odd1: '咕嚕嚕', odd2: '沙沙掃過', down4: '慢慢鯨歌', down5: '放慢雨滴', odd3: '冒泡泡', odd4: '玻璃呼吸', odd5: '爬樓梯' };
  const TR = { sel: -1, h: '', open: false };
  function seedsGet() { try { return JSON.parse(localStorage.getItem('tunein.seeds') || '[]'); } catch (e) { return []; } }
  function seedsSet(a) { try { localStorage.setItem('tunein.seeds', JSON.stringify(a)); } catch (e) {} }
  function seedDot(k) { return '<i class="sdx-dot" style="background:hsl(' + (SKEY.indexOf(k) * 47 % 360) + ' 75% 78%)"></i>'; }
  function trayRender() {
    let el = $('#seedTray');
    if (!el) { el = document.createElement('div'); el.id = 'seedTray'; el.hidden = true; const db = $('#dockbar'); (db || document.body).appendChild(el); el.addEventListener('click', trayClick); }
    const sd = seedsGet(), on = U.m === 1 && S.started && $('#lsOv') && $('#lsOv').hidden;
    if (!on) { el.hidden = true; return; }
    if (TR.sel >= sd.length) TR.sel = -1;
    if (!sd.length) TR.open = false;
    el.classList.toggle('open', !!TR.open);
    if (!TR.open) { const h0 = '<button type="button" class="sdx-go big' + (sd.length ? '' : ' empty') + '" data-open="1">種花　' + sd.length + '</button>'; if (TR.h !== h0) { TR.h = h0; el.innerHTML = h0; } el.hidden = false; return; }
    const k0 = TR.sel >= 0 && sd[TR.sel] ? sd[TR.sel].k : '', rb = (S.rs || []).filter(r => k0 && r.met && !r.done && (r.want || []).includes(k0) && !(r.got || []).includes(k0)).map(r => '<button type="button" class="sdx-go res" data-at="resident" data-res="' + r.id + '">給' + r.name + '</button>').join('');
    const h = '<div class="sdx-hd"><b>種在小鎮</b><span>' + (TR.sel >= 0 ? '選好了，種下去' : '選一顆聲音') + '</span></div><div class="sdx-seeds">' + sd.map((s, i) => '<button type="button" class="sdx-seed" data-i="' + i + '" aria-pressed="' + (TR.sel === i) + '">' + seedDot(s.k) + SNAME[s.k] + '</button>').join('') + '</div><div class="sdx-acts"><button type="button" class="sdx-go main" data-at="ground"' + (TR.sel >= 0 ? '' : ' disabled') + '>種在這裡</button>' + rb + '<button type="button" class="sdx-go ghost" data-open="1">收起</button></div>';
    if (TR.h !== h) { TR.h = h; el.innerHTML = h; }
    el.hidden = false;
  }
  async function trayClick(e) {
    const sb = e.target.closest('.sdx-seed'), gb = e.target.closest('.sdx-go'); const sd = seedsGet();
    if (gb && gb.hasAttribute('data-open')) { if (!sd.length) { toast('口袋沒有聲音，先打開探測器去找'); return; } TR.open = !TR.open; TR.sel = TR.open ? 0 : -1; trayRender(); return; }
    if (sb) { const i = +sb.getAttribute('data-i'); TR.sel = i; trayRender(); return; }
    if (!gb || TR.sel < 0 || !sd[TR.sel] || gb.disabled) return;
    const s = sd[TR.sel], n = Math.max(0, SKEY.indexOf(s.k)); gb.disabled = true;
    const j = await netPost('/plant', { pid: NET.pid, rh: n % 3, pt: ((n / 3) | 0) % 3, wt: ((n / 9) | 0) % 3, q: .8, tr: SNAME[s.k] || '', sk: s.k, fine: s.l === 'f' ? 1 : 0, at: gb.getAttribute('data-at'), res: gb.getAttribute('data-res') || '' });
    if (j && j.ok) { sd.splice(TR.sel, 1); seedsSet(sd); TR.sel = -1; if (!sd.length) TR.open = false; toast(gb.getAttribute('data-at') === 'resident' ? '送出去了，看看小鎮' : '種下去了，看看小鎮'); try { navigator.vibrate && navigator.vibrate([30, 30, 60]); } catch (x) {} } else { toast('沒種成功，再試一次', 'warn'); }
    trayRender();
  }
  setInterval(() => { try { trayRender(); } catch (e) {} }, 1500);
  /* [P93] 個人收集進度小圓點：4～5 顆（大螢幕仍是 8 種合奏）。已收集＝不同聲音種類數；固定位置不推擠版面；小鳥事件／非探索畫面隱藏；新回合 reset() 清空 S.cards 自然歸零 */
  const CD = { n: 5, last: 0, h: '' };
  function cdKinds() { const m = {}; (S.cards || []).forEach(c => { const k = c && (c.bid || c.real || c.name); if (k && c.clar !== 0) m[k] = 1; }); return Object.keys(m).length; }
  function cdRender() {
    let el = document.getElementById('cdots');
    if (!el) { el = document.createElement('div'); el.id = 'cdots'; el.setAttribute('role', 'img'); document.body.appendChild(el); }
    const show = S.screen === 'explore' && S.started && !S.ended && !(typeof bdOn !== 'undefined' && bdOn) && !(typeof CINE !== 'undefined' && CINE.on);
    el.hidden = !show; if (!show) return;
    const n = Math.min(CD.n, cdKinds()), hx = (typeof CHEX === 'string' && CHEX) ? CHEX : '#F2619C';
    let h = '';
    for (let i = 0; i < CD.n; i++) h += '<i class="' + (i < n ? 'on' : '') + '"' + (i < n ? ' style="background:' + hx + '"' : '') + '></i>';
    if (h !== CD.h) { CD.h = h; el.innerHTML = h; el.setAttribute('aria-label', '收集進度 ' + n + '／' + CD.n); if (n > CD.last) { const on = el.querySelector('i:nth-child(' + n + ')'); if (on) { on.classList.add('pop'); } } CD.last = n; }
  }
  /* [P94] 小鎮畫面上的浮層統一排版：上排＝名字／進度點／倒數；第二排＝單一提示（方向或說話，互斥）；右側＝聽法直排；下方＝說話鈕（方向鍵上方） */
  function placeHud() {
    const f = $('#uFrame'); if (!f || f.hidden || !document.body.classList.contains('ufull')) return; const r = f.getBoundingClientRect(); if (r.width < 40) return;
    const dots = document.getElementById('cdots'); if (dots) { dots.style.left = (r.left + r.width / 2) + 'px'; dots.style.top = (r.top + 34) + 'px'; dots.style.right = 'auto'; }
    const br = document.getElementById('bandRow'); if (br) { br.style.left = 'auto'; br.style.right = Math.max(6, innerWidth - r.right + 10) + 'px'; br.style.top = (r.top + r.height * .34) + 'px'; }
    document.body.classList.toggle('talkon', !!($('#t3talk') && !$('#t3talk').hidden));
    try { placeTalk(); } catch (e) {}
  }
  setInterval(() => { try { cdRender(); placeHud(); } catch (e) {} }, 500);
  window.addEventListener('message', e => { if (e.data && e.data.tunein === 'close') closeCollect(); });
  function resSync(rs) { S.rs = rs; let ch = false; rs.forEach(r => { if (r.done && MAIN.includes(r.id) && !S.woke[r.id]) { S.woke[r.id] = '聽到了'; ch = true; } }); if (ch) { try { renderGuide(); renderMap(); } catch (e) {} } }
  const NET = { on: false, api: '', pid: '', lastPoll: 0, lastPost: 0, px: -99, py: -99, joined: false, others: {} };
  async function netProbe() {
    const q = new URLSearchParams(location.search).get('server') || window.TUNEIN_SERVER || '', cands = [];
    if (q) cands.push(q.replace(/\/$/, '') + '/api');
    if (/^https?:$/.test(location.protocol)) { cands.push('/api'); if (location.protocol === 'http:') cands.push('http://' + location.hostname + ':8080/api'); else cands.push('https://' + location.hostname + ':8443/api'); }   // https（Tailscale Funnel）：小鎮伺服器開在 8443
    // 全部候選位址同時問，最快回來且正確的先用（原本一個一個問，前面的慢或不通就要多等好幾秒）
    const one = async b => { const c = new AbortController(), t = setTimeout(() => c.abort(), 2500); try { const r = await fetch(b + '/state', { cache: 'no-store', signal: c.signal }); if (!r.ok) throw 0; const j = await r.json(); if (j && j.levels) return b; } finally { clearTimeout(t); } throw 0; };
    const any = ps => new Promise((ok, no) => { let n = ps.length; if (!n) return no(); ps.forEach(p => p.then(ok, () => { if (--n === 0) no(); })); });   // 不用 Promise.any（舊版 Safari 沒有）
    try { NET.api = await any(cands.map(one)); return true; } catch (e) {}
    return false;
  }
  const netPost = (p, body) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); return fetch(NET.api + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: c.signal }).then(r => r.json()).catch(() => null).finally(() => clearTimeout(t)); };   // 4 秒沒回就放棄，不卡住
  async function syncRound() {   // 兩支手機一起玩：剩餘時間以伺服器這一輪為準（剩不到 90 秒就由伺服器開新的一輪）
    if (!NET.on) return; const t0 = Date.now(), j = await netPost('/round', { minLeft: 20000 }), rtt = Date.now() - t0;   // 剩不到 20 秒才開新的一輪，避免其他人的時間被硬改
    if (j && j.roundEnd && j.now) { const left = j.roundEnd - j.now - rtt / 2; if (left > 5000 && left <= ROUND_MS + 2000) { S.roundEnd = Date.now() + left; try { tickRound(); } catch (e) {} } }
  }
  async function netJoin() {
    NET.left = false;
    if (!NET.on) return;
    if (!NET.pid) {
      try { NET.pid = new URLSearchParams(location.search).get('pid') || ''; } catch (e) {}
      if (!NET.pid) {
        /* 重新整理：同一個分頁沿用原本的 pid，只要伺服器還留著那隻 Ping（60 秒內），就接回原本的、不生新的；已經被收掉才換新的 */
        let old = ''; try { old = sessionStorage.getItem('tunein.pid') || ''; } catch (e) {}
        if (old) { try { const sj = await (await fetch(NET.api + '/state?lite=1', { cache: 'no-store' })).json(); if (sj && (sj.players || []).some(p => p.pid === old)) NET.pid = old; } catch (e) {} }
        if (!NET.pid) { NET.pid = 'p' + Math.random().toString(36).slice(2, 8); if (old) netPost('/leave', { pid: old }); }
      }
      try { sessionStorage.setItem('tunein.pid', NET.pid); } catch (e) {}
    }   // 每個分頁各一個 pid（同一支瀏覽器開兩個分頁＝兩位玩家）
    const j = await netPost('/join', { pid: NET.pid, col: ME, name: pnameNow(), hex: (typeof CHEX === 'string' ? CHEX : '') }); NET.joined = !!j; NET.px = -99; if (j && j.me && j.me.assign) NET.assign = j.me.assign; if (j && j.me && typeof moveMe === 'function') { const np = netPos(); if (Math.abs(np[0] - ME0.x) < 4 && Math.abs(np[1] - ME0.y) < 4) { moveMe(j.me.x, j.me.y, 0.001); NET.px = j.me.x; NET.py = j.me.y; } }   /* 剛加入、還在起點：改站到伺服器分配的出現點（每人不同） */ if (j && S.quest && !S.woke[S.quest]) netPost('/quest', { pid: NET.pid, quest: S.quest });   // 重新加入後，把手上的任務補回伺服器
    if (j) { try { uLoad($('#uFrame')); uPid(); } catch (e) {} toast('已加入小鎮'); }
  }
  function netPos() { const me = $('#me'), m = me && /matrix\(([^)]+)\)/.exec(getComputedStyle(me).transform || ''); if (m) { const a = m[1].split(',').map(Number); return [a[4], a[5]]; } return [S.me.x, S.me.y]; }
  function netOthers(list) {
    const svg = $('#mapSvg'); if (!svg) return; let g = document.getElementById('netg');
    if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.id = 'netg'; svg.insertBefore(g, $('#me')); }
    const ids = {}; list.filter(p => p.pid !== NET.pid).forEach(p => {
      ids[p.pid] = 1; let e = NET.others[p.pid];
      if (!e) { e = document.createElementNS('http://www.w3.org/2000/svg', 'g'); e.setAttribute('class', 'op nop'); e.setAttribute('data-pid', p.pid); e.innerHTML = '<use href="#i-sprite" x="-12" y="-12" width="24" height="24" style="color:var(--h-' + (p.col || 'flower') + ')"/><text class="opn" y="26">' + (p.name || '') + '</text>'; e.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; g.appendChild(e); NET.others[p.pid] = e; }
      e.style.transition = 'transform 1s linear'; e.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
    });
    Object.keys(NET.others).forEach(k => { if (!ids[k]) { NET.others[k].remove(); delete NET.others[k]; } });
  }
  function netSocial(mm, list) {   // 別人向我打招呼 → 提示；雙方都打過招呼 → 成為朋友
    NET.gseen = NET.gseen || {};
    list.forEach(q => { const k = frIdx(q.pid);
      if (q.gt === NET.pid && NET.waitPid === q.pid && !$('#sheet').hidden) { NET.gseen[q.pid] = 1; hearSheet(q.pid); }
      if (q.gt === NET.pid && !(mm.fr || []).includes(q.pid)) { if (!NET.gseen[q.pid]) { NET.gseen[q.pid] = 1; toast(pName(q) + ' 向你打招呼　走到他旁邊回應'); try { playMel(melPid(q.pid)); } catch (e) {} } } else NET.gseen[q.pid] = 0;
      if ((mm.rp || []).includes(q.pid)) { if (!NET.rseen || NET.rseen !== q.pid) { NET.rseen = q.pid; toast(pName(q) + ' 聽出你的招呼聲了'); try { playMel(melPid(q.pid)); } catch (e) {} } } else if (NET.rseen === q.pid) NET.rseen = null;
      if ((mm.fr || []).includes(q.pid) && !S.friends[k]) { try { playMel(melPid(q.pid)); } catch (e) {} becameFriends(q.pid); }
    });
  }
  async function netTick() {
    if (!NET.on || !NET.joined || !S.started) return; const now = Date.now(), p = netPos();
    if (uMode !== 1 && !NET.sync && (Math.abs(p[0] - NET.px) > 1 || Math.abs(p[1] - NET.py) > 1 || now - NET.lastPost > 5000) && now - NET.lastPost > 300) { NET.px = p[0]; NET.py = p[1]; NET.lastPost = now; netPost('/move', { pid: NET.pid, x: p[0], y: p[1] }); }
    if (now - NET.lastPoll < 500 || NET.busy) return; NET.lastPoll = now; NET.busy = true;
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 3000);
    try {
      const tq = Date.now(), s2 = await (await fetch(NET.api + '/state?lite=1', { cache: 'no-store', signal: ac.signal })).json(); if (!s2) return; try { gardenSync(s2.garden); } catch (e) {} try { ensSync(s2.garden); } catch (e) {} try { weatherSync(s2.weather); } catch (e) {} try { if (s2.residents) resSync(s2.residents); } catch (e) {}
      if (s2.active && s2.roundEnd && s2.now && S.started && !S.ended) {   // 每次輪詢都對一次伺服器的剩餘時間：後來加入的人、手機時鐘不準，倒數都會一致
        const left = s2.roundEnd - s2.now - (Date.now() - tq) / 2, mine = S.roundEnd - Date.now();
        if (left > 0 && left <= ROUND_MS + 2000 && Math.abs(mine - left) > 1500) { S.roundEnd = Date.now() + left; try { tickRound(); } catch (e) {} }
      }
      if (s2.emitters && s2.emitters.length === EM.length) { let ch = false; s2.emitters.forEach((e, i) => { if (EM[i].on !== e.on) { EM[i].on = e.on; ch = true; } }); if (ch) { emDraw(); renderGuide(); MAIN.forEach(id => { const pt = document.querySelector('[data-id="' + id + '"]'); if (pt) pt.classList.toggle('lockp', !S.woke[id] && !srcOn(id)); }); } }
      if (s2.notices) {   // 別的玩家接了任務：這支手機也跳「某某 接受任務成功」（第一次對時只記編號、不補跳舊的）
        const QN = { flower: '叫醒花店老闆', house: '叫醒奶奶', market: '叫醒攤販', river: '叫醒釣魚的人' };
        const first = NET.noteId == null; let top = NET.noteId || 0;
        s2.notices.forEach(n => { if (n.id > top) { top = n.id; if (!first && n.pid !== NET.pid && n.kind === 'accept') { toast((n.name || HUE[n.col] || '另一位玩家') + '　接受任務成功：' + (QN[n.quest] || ''), 'ok', Math.max(2500, 5000 - Math.max(0, (s2.now || n.t) - n.t))); } } });   /* 用伺服器時間算還剩多久：每支手機的提示一起消失 */
        NET.noteId = top;
      }
      try { const cm = s2.players && s2.players.find(q => q.pid === NET.pid); if (cm && cm.cue) { if (NET.cueId == null) NET.cueId = cm.cue.id; else if (cm.cue.id !== NET.cueId) { NET.cueId = cm.cue.id; const cf = { lock: 'note', got: 'got', oops: 'oops' }[cm.cue.kind]; if (cf && sfx[cf]) { ensureAudio(); sfx[cf](); } } } } catch (e) {}   /* Unity 鎖定／確認結果：手機播提示音 */
      if (s2.players) { const mm = s2.players.find(q => q.pid === NET.pid); if (mm) { NET.mx = mm.x; NET.my = mm.y; NET.assign = mm.assign || NET.assign; NET.me = mm; NET.list = s2.players.filter(q => q.pid !== NET.pid); netSocial(mm, NET.list); if (mm.quest && !S.quest && !S.woke[mm.quest]) { S.quest = mm.quest; S.acc = Date.now(); accOK(); renderGuide(); setTimeout(renderGuide, 4200); } } { const qs = NET.list.map(q => q.pid + ':' + (q.quest || '')).join('|'); if (qs !== NET.qs) { NET.qs = qs; renderGuide(); } } uqUpdate(); netOthers(s2.players); NET.count = s2.players.length; const c = $('.lvp'); if (c) c.textContent = (NET.count + 2) + ' 位訪客在線'; }
      NET.fail = 0;
      if (s2.roundMs && s2.roundMs !== ROUND_MS) ROUND_MS = s2.roundMs;   // 一輪長度以伺服器為準
      if (s2.epoch != null) {   // 伺服器一回合結束、清掉舊資料重來：這支手機也回到最前面（在看離場卡的人，等他按再玩一次）
        if (NET.epoch == null) NET.epoch = s2.epoch;
        else if (s2.epoch !== NET.epoch && !S.started) NET.epoch = s2.epoch;   // 還在選角、沒開始玩：只對時，不重整
        else if (s2.epoch !== NET.epoch) { NET.stale = true; if (S.screen !== 'leave' && S.screen !== 'settle') { location.reload(); return; } }
      }
      if (NET.stale) { /* 等使用者按「再玩一次」 */ }
      else if (!NET.left && (!s2.players || !s2.players.some(p => p.pid === NET.pid))) netJoin();   // 伺服器重開或太久沒回報：重新加入
    } catch (e) { NET.fail = (NET.fail || 0) + 1; if (NET.fail >= 60) { NET.on = false; NET.joined = false; netUi(); } }   // 連續約 10 秒失敗才算斷線（手機網路偶爾卡一下不會把 Unity 畫面關掉）
    finally { clearTimeout(to); NET.busy = false; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && NET.on) { NET.lastPoll = 0; NET.busy = false; NET.fail = 0; } });   // 切回來立刻重新對時
  /* Unity 真實畫面：小窗 → 全螢幕 → 關閉（串流頁 /tunein/live.html，需 Unity 在 Play） */
  /* 串流頁提早載入：加入小鎮的當下就先開始連線（隱藏著連），玩家切到 Unity 畫面時已經接好，不用再等 */
  const T3 = new URLSearchParams(location.search).get('t3') !== '0';   // 預設：手機自己用 Three.js 畫小鎮（不再串流 Unity 畫面）；網址加 ?t3=0 可退回串流
  function uPid() { try { const fr = $('#uFrame'); fr && fr.contentWindow && fr.contentWindow.postMessage({ tunein: 'pid', pid: NET.pid, restore: !!NET.restored }, '*'); } catch (e) {} }
  function uLoad(f) { if (f && !f.getAttribute('src')) f.setAttribute('src', T3 ? '/tunein/town3d.html?v=113&gate=1&pid=' + encodeURIComponent(NET.pid || '') + ((new URLSearchParams(location.search).get('server') || '') ? '&server=' + encodeURIComponent(new URLSearchParams(location.search).get('server')) : '') : '/tunein/live.html?v=7&fit=cover&pid=' + encodeURIComponent(NET.pid || '')); }
  /* 小鎮裡種下的花、小鳥、太陽雨的聲音：town3d 每 0.25 秒回報附近的花，這裡用合成聲音庫播（只在小鎮畫面；不經過收聲音用的 A.bus，避免干擾判斷） */
  /* ═════════ [P28] 探測器＋調頻（子功能：CODEX 讀 sound_spots.json／TN 調頻小遊戲／detSet 開關／detHint 提示條／message 收 spotNear、detInfo） ═════════
     按「探測器」才聽得到小鎮裡微弱的聲音（左右耳辨方向）→ 走近 → 拖滑桿把聲音調到最清楚並穩住 → 收下變種子 */
  const CODEX = { cfg: null };
  try { const x = new XMLHttpRequest(); x.open('GET', './sound_spots.json?' + (Date.now() / 6e4 | 0), false); x.send(); if (x.status === 200) CODEX.cfg = JSON.parse(x.responseText); } catch (e) {}
  const DETS = { on: false, t0: 0, near: false, tm: 0, band: 0, until: 0, cool: 0 };
  const DET_ON_MS = 10000, DET_COOL_MS = 12000, BANDS = ['平常聽', '放慢聽', '變調聽'];   // [P39] 探測器只能開 10 秒，之後充電 12 秒；三種聽法各聽得到不同的聲音
  function detLabel() {
    const b = $('#btnDet'); if (!b) return; const now = Date.now(), lim = S.tutDone, cool = lim && DETS.cool > now;
    b.textContent = DETS.on ? (lim ? '探測器　' + Math.max(0, Math.ceil((DETS.until - now) / 1000)) + ' 秒' : '探測器　開') : cool ? '充電中　' + Math.ceil((DETS.cool - now) / 1000) + ' 秒' : '探測器　關';
    b.disabled = !!cool && !DETS.on; b.classList.toggle('cool', !!cool && !DETS.on); b.classList.toggle('on', DETS.on);
    document.body.classList.toggle('deton', !!DETS.on); const row = $('#bandRow'); if (row) { const f0 = $('#uFrame'), r0 = f0 && !f0.hidden ? f0.getBoundingClientRect() : null; if (r0 && r0.width > 40) row.style.top = (r0.top + 58) + 'px'; const show = lim && DETS.on && U.m === 1 && S.started && !S.ended && !!CODEX.cfg; if (row.hidden === show) row.hidden = !show; if (show) bandIntro(); $$('#bandRow button').forEach((x, i) => x.classList.toggle('on', i === DETS.band)); }
  }
  function bandIntro() {   // [P41] 新功能說明：教學後第一次看到聽法列時跳一次（探測器電量、三種聽法、找不到就換聽法）
    try { if (localStorage.getItem('tunein.bandIntro') === '1' || BANDS.intro) return; } catch (e) {} BANDS.intro = true; const sh = $('#sheet'); if (sh && !sh.hidden) { BANDS.intro = false; return; }
    openSheet('<div class="sh-h"><span></span><div><h2>聽法</h2></div>' + CLOSE + '</div><ul class="bandhow"><li><b>探測器開 10 秒</b><span>用完充電 12 秒</span></li><li><b>聽不到？</b><span>換一種聽法</span></li></ul><button class="btn btn-ink btn-block" type="button" id="bandOk">知道了</button>');
    const b = $('#bandOk'); if (b) b.addEventListener('click', () => { try { localStorage.setItem('tunein.bandIntro', '1'); } catch (e) {} closeSheet(); });
  }
  function detTick() { try { if (DETS.on && S.tutDone && Date.now() > DETS.until) { DETS.cool = Date.now() + DET_COOL_MS; detSet(false); toast('探測器沒電了　充電 ' + DET_COOL_MS / 1000 + ' 秒', '', 2600); } detLabel(); } catch (e) {} }
  function bandSet(i) { DETS.band = i; DETS.info = null; toTown({ tunein: 'band', v: i }); sfx.tap(); tnClose(); detLabel(); if (DETS.on) detHint(); }
  // [P28c] 探測器音效：開著時有「嘀…」掃描聲（越靠近聲音越密）；進入聽得到的範圍有「叮叮叮」偵測提示；靠到可調頻有確認聲。音量改 vol 參數
  function dtTone(f1, f2, vol, dur, delay) {
    try { ensureAudio(); if (!AC) return; const t = AC.currentTime + (delay || 0) + .01, o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur * .6);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + .05); } catch (e) {}
  }
  function dtScan() {   // 掃描聲：嘀（上滑）＋很輕的回音；間隔依最近聲音的距離 0.7～2.4 秒
    clearTimeout(DETS.tm); if (!DETS.on || TN.on) return;
    dtTone(620, 900, .07, .28); dtTone(620, 900, .028, .28, .16);
    const I = DETS.info, hear = (CODEX.cfg && CODEX.cfg.hear) || 14, k = I && I.d >= 0 ? Math.max(0, Math.min(1, 1 - I.d / (hear * 2.5))) : 0;
    DETS.tm = setTimeout(dtScan, 2400 - k * 1700);
  }
  function dtFound() { dtTone(880, 1000, .09, .22); dtTone(1175, 1300, .09, .22, .13); dtTone(1568, 1700, .1, .34, .26); try { navigator.vibrate && navigator.vibrate([25, 40, 25]); } catch (e) {} }
  const TN = { on: false, id: '', sp: null, T: null, base: .5, ph: 0, hold: 0, c: 0, last: 0, raf: 0, osc: null, og: null };
  function toTown(o) { try { const fr = $('#uFrame'); fr && fr.contentWindow && fr.contentWindow.postMessage(o, '*'); } catch (e) {} }
  function spotOf(id) { return CODEX.cfg && CODEX.cfg.spots.find(x => x.id === id); }
  function placeOv(el) {   // 浮在 3D 畫面底部（畫面外框會因版面不同而改變，所以用實際位置算）
    const f = $('#uFrame'), r = f && !f.hidden ? f.getBoundingClientRect() : null;
    if (r && r.width > 40) { el.style.left = (r.left + r.width / 2) + 'px'; el.style.bottom = Math.max(8, innerHeight - r.bottom + 10) + 'px'; el.style.width = Math.min(r.width - 24, 320) + 'px'; }
    else { el.style.left = '50%'; el.style.bottom = '150px'; el.style.width = 'min(88vw,320px)'; }
  }
  function placeTop(el) {   // 提示條放在 3D 畫面上方（名字與倒數時間的下面），不壓到底部的說話按鈕
    const f = $('#uFrame'), r = f && !f.hidden ? f.getBoundingClientRect() : null;
    if (r && r.width > 40) { el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top + 56) + 'px'; el.style.bottom = 'auto'; el.style.width = 'auto'; }   /* [P94] 提示統一放在上方同一個位置，寬度隨文字（原本 deton 時掉到畫面中間） */
    else { el.style.left = '50%'; el.style.top = '150px'; el.style.bottom = 'auto'; el.style.width = 'min(88vw,330px)'; }
  }
  let spotHintEl = null, hintTm = 0;
  function spotHint(on, txt) {
    if (!spotHintEl) { spotHintEl = document.createElement('div'); spotHintEl.className = 'sdx-sh'; spotHintEl.setAttribute('role', 'status'); document.body.appendChild(spotHintEl); }
    if (!on || (document.body.classList.contains('tut') && /收完/.test(txt || ''))) { spotHintEl.classList.remove('show'); return; }   /* 教學中只留引路箭頭，不顯示「聲音都收完了」 */
    spotHintEl.textContent = txt; placeTop(spotHintEl); spotHintEl.classList.add('show');
  }
  let tnEl = null, tnCv = null;
  const TNC = { cool: {}, near: null };   // cool＝聲音溜走後的冷卻（id→可再試的時間）、near＝目前站在哪個聲音旁
  function tnBuild() {
    if (tnEl) return tnEl; tnEl = document.createElement('div'); tnEl.className = 'sdx-tn'; tnEl.hidden = true;
    tnEl.innerHTML = '<b class="sdx-tn-t"></b><canvas class="sdx-tn-w" width="520" height="96" aria-hidden="true"></canvas><input type="range" min="0" max="1000" value="500" aria-label="調整頻率"><div class="sdx-tn-h" aria-hidden="true"><i></i></div>';
    tnCv = tnEl.querySelector('canvas'); document.body.appendChild(tnEl); return tnEl;
  }
  // 波形：不清楚＝亂抖的雜訊線，越清楚越整齊、越偏粉紅；視覺上就是「訊號變乾淨」
  function tnWave(c, now, lock) {
    const g = tnCv.getContext('2d'), W = tnCv.width, H = tnCv.height; g.clearRect(0, 0, W, H);
    const col = lock ? '#F2619C' : c > .5 ? '#E9A3C0' : '#B9B3C6'; g.strokeStyle = col; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    for (let x = 0; x <= W; x += 6) { const t = x / W, base = Math.sin(t * 6.28 * 3 + now / 220) * 26 * (.35 + c * .65), nz = (Math.random() - .5) * 2 * 40 * Math.pow(1 - c, 1.4); const y = H / 2 + base + nz; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  // 調頻時聲音的模糊程度：不清楚＝悶一點＋沙沙雜訊，但一定聽得到；越清楚越亮、雜訊越小（lp＝低通頻率 Hz、gain＝音量）
  const tnLp = c => 1500 + Math.pow(c, 1.3) * 8500, tnGain = c => .22 + .78 * Math.pow(c, 1.2), tnNoise = c => .16 * Math.pow(1 - c, 1.2);
  function tnParams(sp) {   // 難度：教學中的第一個聲音很好調；之後依類型（sound_spots.json 的 tune）越來越難
    const T = Object.assign({ h: .07, hold: 2, amp: .06, spd: .5, hop: 0, time: 30 }, (CODEX.cfg.tune || {})[sp.type] || {});
    if (tutActive()) return { h: .11, hold: 1.4, amp: 0, spd: 0, hop: 0, time: 0 };
    const lv = sp.lv || 2;   /* 難度分級：1 簡單（寬、短、不跳頻、無假位置）／2 普通／3 較難 */
    if (lv === 1) { T.h *= 1.25; T.hold *= .85; T.hop = 0; T.decoy = 0; } else if (lv >= 3) { T.h *= .9; T.hold *= 1.1; }
    return T;
  }
  function tnOpen(id) {
    const sp = spotOf(id); if (!sp || TN.on) return;
    if (S.tutPl && (!S.tutDone || Date.now() - (S.tutDoneAt || 0) < 4000)) return;   /* 小鳥事件剛播完：不要馬上跳出「調清楚」畫面 */
    if (TNC.cool[id] && Date.now() < TNC.cool[id]) return;
    if (seedsGet().length >= POCKET) { if (!TNC.fullAt || Date.now() - TNC.fullAt > 6000) { TNC.fullAt = Date.now(); toast('口袋滿了，先按「種花」', '', 2600); } return; }   // 收集的取捨：口袋只有幾格，要先種才能再收
    const T = tnParams(sp);
    ensureAudio(); const el = tnBuild(); TN.on = true; TN.id = id; TN.sp = sp; TN.T = T; TN.base = .2 + Math.random() * .6; TN.ph = Math.random() * 6.28; TN.hold = 0; TN.c = 0; TN.last = performance.now(); TN.t0 = TN.last; TN.hopAt = T.hop ? TN.last + T.hop * 1000 : 0;
    document.body.classList.add('tuning');
    dtTone(1568, 1568, .08, .25); dtTone(2093, 2093, .08, .3, .12); el.querySelector('input').value = 500; el.hidden = false; placeOv(el); spotHint(false);
    try { if (AC) { 
      if (A.noise) { TN.ns = AC.createBufferSource(); TN.ns.buffer = A.noise; TN.ns.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = .6; TN.ng = AC.createGain(); TN.ng.gain.value = tnNoise(0); TN.ns.connect(bp); bp.connect(TN.ng); TN.ng.connect(AC.destination); TN.ns.start(); } } } catch (e) {}
    try { navigator.vibrate && navigator.vibrate(20); } catch (e) {}
    TN.raf = requestAnimationFrame(tnLoop);
  }
  function tnClose() {
    if (!TN.on) return; TN.on = false; cancelAnimationFrame(TN.raf); if (tnEl) tnEl.hidden = true; document.body.classList.remove('tuning');
    try { if (TN.osc) { TN.og.gain.setTargetAtTime(0, AC.currentTime, .05); TN.osc.stop(AC.currentTime + .3); } if (TN.ns) { TN.ng.gain.setTargetAtTime(0, AC.currentTime, .05); TN.ns.stop(AC.currentTime + .3); } } catch (e) {} TN.osc = null; TN.og = null; TN.ns = null; TN.ng = null;
    if (DETS.on) { detHint(); clearTimeout(DETS.tm); DETS.tm = setTimeout(dtScan, 900); }
  }
  function toStopLost(id) { try { toTown({ tunein: 'spotLost', id }); } catch (e) {} }   /* 調頻失敗：小鎮那邊讓這個聲音點消失，過幾秒在別處重生 */
  function tnFlee() {   // 太久沒調好：聲音害羞溜走一會兒（冷卻 8 秒），走開再靠近或等一下會再出現
    const id = TN.id; tnClose(); TNC.cool[id] = Date.now() + 8000; toStopLost(id); toast('聲音溜走了，它會換個地方', '', 2800); try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} dtTone(500, 300, .08, .4);
  }
  function tnLoop(now) {
    if (!TN.on) return; const dt = Math.min(.1, (now - TN.last) / 1000); TN.last = now; const T = TN.T;
    if (TN.hopAt && now >= TN.hopAt) { TN.base = Math.max(.15, Math.min(.85, TN.base + (Math.random() < .5 ? -1 : 1) * (.18 + Math.random() * .12))); TN.hopAt = now + T.hop * 1000 * (.8 + Math.random() * .4); dtTone(900, 700, .05, .2); }   // 頻率突然跳一下，要重新追
    const target = Math.max(.1, Math.min(.9, TN.base + T.amp * Math.sin(now / 1000 * T.spd + TN.ph))), v = tnEl.querySelector('input').value / 1000, diff = Math.abs(v - target);
    TN.c = Math.max(0, 1 - diff / .3); const ok = diff <= T.h;
    if (T.decoy) { if (TN.dc == null || TN.dcFor !== TN.base) { TN.dcFor = TN.base; TN.dc = TN.base < .5 ? TN.base + .34 : TN.base - .34; } TN.c = Math.max(TN.c, .72 * Math.max(0, 1 - Math.abs(v - TN.dc) / .1)); }   // [P28] 假的清楚位置：看起來也很整齊，但穩不住
    TN.hold = ok ? TN.hold + dt : Math.max(0, TN.hold - dt * 1.5);
    tnEl.querySelector('.sdx-tn-h i').style.width = Math.round(Math.min(1, TN.hold / T.hold) * 100) + '%';
    const left = T.time ? T.time - (now - TN.t0) / 1000 : 99;
    tnEl.querySelector('.sdx-tn-t').textContent = ok ? '穩住…' : left < 8 ? '聲音快溜走了！' : TN.c > .5 ? '接近了，慢慢轉' : '轉動滑桿，找訊號';
    tnWave(TN.c, now, ok);
    try { const sl = TSND.sl['sp_' + TN.id]; if (sl && sl.f) { sl.f.frequency.setTargetAtTime(tnLp(TN.c), AC.currentTime, .05); sl.g.gain.setTargetAtTime(tnGain(TN.c), AC.currentTime, .05); }
      if (TN.ng) TN.ng.gain.setTargetAtTime(tnNoise(TN.c), AC.currentTime, .05); } catch (e) {}
    if (TN.hold >= T.hold) { tnDone(); return; }
    if (left <= 0) { tnFlee(); return; }
    TN.raf = requestAnimationFrame(tnLoop);
  }
  function seedFly() {   // [P28e] 收下時：一顆種子從畫面中央飛進「種花」按鈕
    try { const f = $('#uFrame'), r = f && f.getBoundingClientRect(), tb = document.querySelector('.sdx-go.big'), tr = tb && tb.getBoundingClientRect(); if (!r || !tr) return;
      const e = document.createElement('div'); e.style.cssText = 'position:fixed;z-index:99;width:22px;height:28px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#F2C766;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.18);pointer-events:none;left:' + (r.left + r.width / 2 - 11) + 'px;top:' + (r.top + r.height * .45) + 'px';
      document.body.appendChild(e); const dx = tr.left + tr.width / 2 - 11 - (r.left + r.width / 2 - 11), dy = tr.top + tr.height / 2 - 14 - (r.top + r.height * .45);
      const a = e.animate([{ transform: 'translate(0,0) scale(1.6)', opacity: 1 }, { transform: 'translate(' + dx * .5 + 'px,' + (dy * .5 - 60) + 'px) scale(1.1)', opacity: 1, offset: .5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: .2 }], { duration: 900, easing: 'ease-in-out' });
      a.onfinish = () => { e.remove(); if (tb) tb.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300 }); }; } catch (x) {}
  }
  function tnDone() {
    const sp = TN.sp; const sd = seedsGet(); sd.push({ k: sp.k, l: 'f' }); seedsSet(sd); toTown({ tunein: 'spotTake', id: sp.id }); tnClose();
    seedFly(); toast('收下了：' + sp.name + '，變成種子了', 'ok', 3000); try { navigator.vibrate && navigator.vibrate([30, 40, 60]); } catch (e) {}
    try { trayRender(); } catch (e) {}
  }
  function detSet(on) {
    DETS.on = on; if (on) DETS.until = Date.now() + DET_ON_MS; const b = $('#btnDet'); if (b) { b.setAttribute('aria-pressed', on); } detLabel();
    if (on) { try { localStorage.setItem('tunein.det1', '1'); } catch (e) {} const bp = $('#btnDet'); bp && bp.classList.remove('sdx-pulse'); }
    toTown({ tunein: 'det', on }); if (!on) { clearTimeout(DETS.tm); tnClose(); spotHint(false); clearTimeout(hintTm); return; }
    ensureAudio(); DETS.t0 = Date.now(); DETS.info = null; DETS.near = false; detHint(); dtScan(); clearTimeout(hintTm);
  }
  // 探測器提示條（常駐）：箭頭指向最近的聲音，旁邊寫大概距離；靠近到可調頻時交給調頻面板
  function detHint() {
    if (!DETS.on || TN.on) return; const I = DETS.info, el = spotHintEl || (spotHint(true, ''), spotHintEl);
    if (I && I.left <= 0 && document.body.classList.contains('tut')) { el.classList.remove('show'); return; }   /* 教學中聲音收完了就不顯示「聲音都收完了」 */
    if (document.body.classList.contains('tut') && DETS.near) { el.classList.remove('show'); return; }   /* [P92] 教學中走到圈圈旁，只留一個提示（不要和「出現聲音點了」疊在一起） */
    let txt, ang = null, ok = false;   // [P37/P39] 方向＋距離分兩行（大／小）；這個聽法沒有聲音時，直接說換聽法
    if (!I) txt = '<b>正在聽…</b>'; else if (I.left <= 0) txt = '<b>' + (I.locked > 0 ? '去問問居民' : '聲音都收完了') + '</b>'; else if (I.d < 0) txt = '<b>' + BANDS[DETS.band] + '：這裡沒有聲音</b><i>換一種聽法試試</i>'; else {
      const a = Math.abs(I.ang), side = I.ang >= 0 ? '右' : '左'; ang = I.ang; ok = a < .35;
      txt = I.d <= 6 ? '<b>很近了！</b>' : '<b>' + (ok ? '對了，往前走' : a >= 2.2 ? '轉身' : '向' + side + '轉') + '</b><i>約 ' + I.d + ' 公尺</i>';
    }
    el.classList.toggle('sdx-ok', ok);
    el.innerHTML = '<span class="sdx-ar" style="' + (ang === null ? 'display:none' : 'transform:rotate(' + ang + 'rad)') + '"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 3 L19 20 L12 16 L5 20 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><span class="sdx-tx">' + txt + '</span>';
    placeTop(el); el.classList.add('show');
  }
  // [P28b] 操作提示（取代前面的長說明）：在小鎮畫面上依目前進度顯示下一步，並讓對應按鈕閃一下
  function coachTick(show) {   // [P28b/P28d] 只讓「現在該按的按鈕」閃一下；文字說明統一放在上方任務卡（taskNow）
    try {
      document.body.classList.toggle('noseed', seedsGet().length === 0);
      const sh = $('#sheet'), busy = sh && !sh.hidden, bd = $('#btnDet'), bm = document.querySelector('.sdx-go.big');
      if (!show || TN.on || busy) { bd && bd.classList.remove('sdx-pulse'); bm && bm.classList.remove('sdx-pulse'); if (!DETS.on && !TN.on) spotHint(false); return; }
      const n = seedsGet().length;
      bd && bd.classList.toggle('sdx-pulse', n === 0 && !DETS.on); bm && bm.classList.toggle('sdx-pulse', n > 0);
      if (!DETS.on) spotHint(false);
      renderGuide();
    } catch (e) {}
  }
  function detInit() {
    const db = $('#dockbar'), bm = $('#btnMain'); if (!db || !bm || $('#btnDet')) return;
    const b = document.createElement('button'); b.id = 'btnDet'; b.type = 'button'; b.className = 'btn btn-block sdx-det'; b.textContent = '探測器　關'; b.setAttribute('aria-pressed', 'false'); b.hidden = true;
    bm.insertAdjacentElement('afterend', b); b.addEventListener('click', () => { if (S.tutDone && !DETS.on && DETS.cool > Date.now()) { toast('探測器充電中'); return; } sfx.tap(); detSet(!DETS.on); });
    if (!$('#bandRow')) { const row = document.createElement('div'); row.id = 'bandRow'; row.className = 'bandrow'; row.hidden = true; row.setAttribute('role', 'group'); row.setAttribute('aria-label', '聽法');
      row.innerHTML = BANDS.map((n, i) => '<button type="button" data-b="' + i + '" data-s="' + n.slice(0, 2) + '" aria-label="' + n + '">' + n + '</button>').join(''); db.parentNode.insertBefore(row, db); row.addEventListener('click', e => { const x = e.target.closest('button[data-b]'); if (x) bandSet(+x.getAttribute('data-b')); }); }
  }
  setInterval(() => {
    try { detInit(); const b = $('#btnDet'); if (!b) return; const show = U.m === 1 && S.started && !S.ended && $('#lsOv') && $('#lsOv').hidden && !!CODEX.cfg; if (b.hidden === show) b.hidden = !show; if (!show && DETS.on) detSet(false); detTick(); coachTick(show); gardenPill(); if (DETS.on && !TN.on && TNC.near && !(TNC.cool[TNC.near] > Date.now())) tnOpen(TNC.near); } catch (e) {}
  }, 600);
  /* ═════════ [P86] 分享與探索（P09）：走近別人公開的聲音花→出現小卡，留「喜歡／有趣／驚喜」；走近自己的花→改公開／私人、移除（都要再按一次確認）。town3d 送 plantNear，伺服器 /react /plantpub /plantdel ═════════ */
  const FC = { cur: null, rx: {}, ask: '', askT: 0, el: null };
  function fcOk() { return U.m === 1 && S.started && !S.ended && document.body.classList.contains('ufull') && !document.body.classList.contains('tut') && !document.body.classList.contains('cine') && !(typeof TN !== 'undefined' && TN.on) && !(typeof TR !== 'undefined' && TR.open); }
  function fcEl() { if (FC.el) return FC.el; const el = document.createElement('div'); el.id = 'flwCard'; el.hidden = true; document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; fcAct(b.getAttribute('data-a'), b.getAttribute('data-k')); }); return (FC.el = el); }
  function fcPlace() { const f = $('#uFrame'), el = FC.el; if (!f || !el) return; const r = f.getBoundingClientRect(); if (r.width < 40) return; el.style.left = (r.left + 16) + 'px'; el.style.width = (r.width - 32) + 'px'; el.style.bottom = 'auto'; el.style.top = Math.round(r.top + 104) + 'px'; }   /* [P89] 小卡放畫面上方（原本在下方會蓋住 Ping 與方向鍵）：熱鬧度膠囊下方、不擋角色 */
  function fcRender() {
    const el = fcEl(), c = FC.cur; if (!c || c.id < 0 || !fcOk()) { if (!c || c.id < 0) { FC.t0 = 0; FC.id0 = null; FC.gone = false; } el.hidden = true; return; }
    { const tn = Date.now();   /* [P91] 一次只出現一個提示：走近停 1.2 秒才出小卡、自己的花 7 秒後自動收起（走開再回來才會再出現）、走動中不跳出來 */
      if (FC.id0 !== c.id) { FC.t0 = tn; FC.id0 = c.id; FC.gone = false; FC.open = null; }
      if (FC.gone) { el.hidden = true; return; }
      if (tn - FC.t0 < 300) { el.hidden = true; clearTimeout(FC.tm); FC.tm = setTimeout(fcRender, 350 - (tn - FC.t0)); return; }   /* [P92] ToolTip：靠近 0.3 秒自動跳出一行短提示，點一下才展開操作 */
      if (FC.open !== c.id) {
        if (tn - FC.t0 > 4300) { FC.gone = true; el.hidden = true; return; } clearTimeout(FC.tm); FC.tm = setTimeout(fcRender, 4350 - (tn - FC.t0));
        const tt = c.mine ? '我的聲音花' : (c.nm ? c.nm + ' 的聲音花' : '別人的聲音花'), h1 = '<button type="button" class="fcTip" data-a="open"><b>' + tt + '</b><span>點一下，看看能做什麼</span></button>';
        if (el.getAttribute('data-h') !== h1) { el.setAttribute('data-h', h1); el.innerHTML = h1; } el.classList.add('tip'); fcPlace(); el.hidden = false; return; }
      el.classList.remove('tip'); if (!FC.openT) FC.openT = tn;
      if (c.mine && !FC.ask) { if (tn - FC.openT > 8000) { FC.gone = true; FC.openT = 0; el.hidden = true; return; } clearTimeout(FC.tm); FC.tm = setTimeout(fcRender, 8100 - (tn - FC.openT)); } }
    let h;
    if (c.mine) {
      const pubNow = c.pub !== 0, a1 = FC.ask === 'pub', a2 = FC.ask === 'del', rx = c.rx || {}, tot = (rx.l || 0) + (rx.f || 0) + (rx.w || 0);
      h = '<div class="fcT"><b>我的聲音花</b><span>' + (pubNow ? '公開中' + (tot ? '　收到 ' + tot + ' 個回應' : '') : '私人，只有你看得到') + '</span></div><div class="fcB">' +
        (pubNow ? '<button type="button" data-a="priv">' + '設成私人' + '</button>' : '<button type="button" class="pri" data-a="pub">' + (a1 ? '再按一次，公開給大家' : '公開給大家') + '</button>') +
        '<button type="button" data-a="del">' + (a2 ? '再按一次，移除' : '移除') + '</button></div>';
    } else {
      const rx = c.rx || {}, my = FC.rx[c.id] || '', mk = (k, t) => '<button type="button" data-a="rx" data-k="' + k + '" class="' + (my === k ? 'on' : '') + '">' + t + (rx[k] ? ' ' + rx[k] : '') + '</button>';
      h = '<div class="fcT"><b>' + (c.nm ? c.nm + ' 的聲音花' : '別人的聲音花') + '</b><span>聽聽看，留個回應</span></div><div class="fcB">' + mk('l', '喜歡') + mk('f', '有趣') + mk('w', '驚喜') + '</div>';
    }
    if (el.getAttribute('data-h') !== h) { el.setAttribute('data-h', h); el.innerHTML = h; }
    fcPlace(); el.hidden = false;
  }
  async function fcAct(a, k) {
    const c = FC.cur; if (a === 'open') { if (c) { FC.open = c.id; FC.openT = 0; fcRender(); } return; } if (!c || !NET.on || !NET.joined) return; const now = Date.now();
    if (a === 'rx') { const j = await netPost('/react', { pid: NET.pid, id: c.id, k }); if (j && j.ok) { FC.rx[c.id] = k; c.rx = j.rx; toast('收到你的回應了', '', 1600); } else toast('這朵花現在不能回應', 'warn', 1800); fcRender(); return; }
    if (a === 'pub') { if (FC.ask !== 'pub') { FC.ask = 'pub'; FC.askT = now; fcRender(); return; } FC.ask = ''; const j = await netPost('/plantpub', { pid: NET.pid, id: c.id, pub: 1 }); if (j && j.ok) { c.pub = 1; toast('公開了，其他人走近就能聽到', '', 2200); } else toast('沒有成功，再試一次', 'warn', 2000); fcRender(); return; }
    if (a === 'priv') { const j = await netPost('/plantpub', { pid: NET.pid, id: c.id, pub: 0 }); if (j && j.ok) { c.pub = 0; c.rx = { l: 0, f: 0, w: 0 }; toast('設成私人了', '', 1800); } else toast('沒有成功，再試一次', 'warn', 2000); fcRender(); return; }
    if (a === 'del') { if (FC.ask !== 'del') { FC.ask = 'del'; FC.askT = now; fcRender(); return; } FC.ask = ''; const j = await netPost('/plantdel', { pid: NET.pid, id: c.id }); if (j && j.ok) { toast('移除了', '', 1600); FC.cur = null; } else toast('沒有成功，再試一次', 'warn', 2000); fcRender(); }
  }
  setInterval(() => { if (FC.ask && Date.now() - FC.askT > 4000) { FC.ask = ''; try { fcRender(); } catch (e) {} } try { if (FC.cur && FC.cur.id >= 0) fcRender(); } catch (e) {} }, 700);
  window.addEventListener('message', e => { const d = e.data; if (d && d.tunein === 'plantNear') { if (!FC.cur || FC.cur.id !== d.id) FC.ask = ''; FC.cur = d.id >= 0 ? d : null; try { fcRender(); } catch (x) {} } });
  window.addEventListener('message', e => {
    const d = e.data; if (d && d.tunein === 'detInfo') { DETS.info = d; const hr = (CODEX.cfg && CODEX.cfg.hear) || 14; if (DETS.on && d.left > 0 && d.d >= 0) { if (d.d <= hr && !DETS.near) { DETS.near = true; dtFound(); } else if (d.d > hr + 3) DETS.near = false; } detHint(); return; } if (!d || d.tunein !== 'spotNear') return; TNC.near = d.on ? d.id : null; if (d.on && DETS.on) tnOpen(d.id); else { tnClose(); detHint(); }
  });
  const TSND = { sl: {}, rain: null, out: null };
  window.addEventListener('message', e => {
    const d = e.data; if (!d || d.tunein !== 'snd') return;
    let ok = false; try { ok = !!(A.init() && AC); } catch (x) {} if (!ok) return;
    try { if (AC.state === 'suspended') AC.resume(); SYN.bind(AC); } catch (x) {}
    if (!TSND.out) { TSND.out = AC.createGain(); TSND.out.gain.value = .8; TSND.out.connect(AC.destination); }
    if (d.list) {
      const seen = {};
      d.list.forEach(it => { seen[it.id] = 1; let s = TSND.sl[it.id]; if (!s) { const g = AC.createGain(); g.gain.value = 0; g.connect(TSND.out); let dst = g, f = null, pn = null; if (it.pan !== undefined && AC.createStereoPanner) { pn = AC.createStereoPanner(); pn.connect(g); dst = pn; } if (it.lp) { f = AC.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = .7; f.frequency.value = it.lp; f.connect(dst); dst = f; } s = TSND.sl[it.id] = { g, f, pn, slot: {} }; try { SYN.loop(it.k, dst, s.slot); } catch (x) {} } const tune = TN.on && it.id === 'sp_' + TN.id; if (s.pn && it.pan !== undefined) s.pn.pan.setTargetAtTime(it.pan, AC.currentTime, .1); if (s.f && it.lp) s.f.frequency.setTargetAtTime(tune ? tnLp(TN.c) : it.lp, AC.currentTime, .25); s.g.gain.setTargetAtTime(tune ? tnGain(TN.c) : it.g, AC.currentTime, .25); });
      Object.keys(TSND.sl).forEach(k => { if (!seen[k]) { const s = TSND.sl[k]; try { SYN.halt(s.slot); s.g.disconnect(); } catch (x) {} delete TSND.sl[k]; } });
    }
    if (d.ev === 'appear') {   /* Ping 出現：三顆上行的亮晶晶小音 */
      const t0 = AC.currentTime + .02;[784, 1047, 1568].forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = f; const t = t0 + i * .09; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.32, t + .015); g.gain.exponentialRampToValueAtTime(.001, t + .55); o.connect(g); g.connect(TSND.out); o.start(t); o.stop(t + .6); });
    }
    if (d.ev === 'bird') { const g = AC.createGain(); g.gain.value = 1.2; g.connect(TSND.out); const s = {}; try { SYN.loop('bird', g, s); setTimeout(() => SYN.halt(s), 60); setTimeout(() => { s.on = false; SYN.loop('bird', g, s); setTimeout(() => SYN.halt(s), 60); }, 700); } catch (x) {} }
    if (d.ev === 'rain') {
      if (d.on && !TSND.rain) { const g = AC.createGain(); g.gain.value = .0; g.connect(TSND.out); const s = {}; try { const n = AC.sampleRate * 2, nb = AC.createBuffer(1, n, AC.sampleRate), ch = nb.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1; const src = AC.createBufferSource(), f = AC.createBiquadFilter(), v = AC.createGain(); src.buffer = nb; src.loop = true; f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = .4; v.gain.value = .12; src.connect(f); f.connect(v); v.connect(g); src.start(); s.stop = () => { try { src.stop(); } catch (y) {} }; } catch (x) {} g.gain.setTargetAtTime(.8, AC.currentTime, .8); TSND.rain = { g, s }; }
      if (!d.on && TSND.rain) { const r = TSND.rain; TSND.rain = null; r.g.gain.setTargetAtTime(0, AC.currentTime, .6); setTimeout(() => { try { r.s.stop(); r.g.disconnect(); } catch (x) {} }, 2500); }
    }
  });
  /* ═════════ [P89] 小鎮合奏：種下的聲音種類（伺服器 garden.kinds）越多，伴奏一層層加進來 ≥2 種＝節拍、≥4 種＝低音、≥6 種＝和弦；
     手機和 Unity 都以「牆鐘每 4 秒」為一格（Date.now()%4000），所以不同裝置的節拍會對在一起（誤差＝裝置時鐘差，通常 <50ms）。
     全用 Web Audio 合成，音量很小（不蓋過花的聲音）；只在小鎮畫面且已按「開始」時播放 ═════════ */
  const ENS = { tier: 0, out: null, nextK: 0, tm: 0, on: false };
  function ensTier(k) { return k >= 6 ? 3 : k >= 4 ? 2 : k >= 2 ? 1 : 0; }
  function ensNote(t, f, dur, vol, type) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0008, t + dur); o.connect(g); g.connect(ENS.out); o.start(t); o.stop(t + dur + .05); }
  function ensKick(t) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); g.gain.setValueAtTime(.32, t); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.connect(g); g.connect(ENS.out); o.start(t); o.stop(t + .25); }
  function ensHat(t) { const n = Math.floor(AC.sampleRate * .04), b = AC.createBuffer(1, n, AC.sampleRate), c = b.getChannelData(0); for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * .25)); const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = 6500; g.gain.value = .07; s.connect(f); f.connect(g); g.connect(ENS.out); s.start(t); }
  function ensSched() {
    if (!ENS.tier || !ENS.on || document.hidden) return; let ok = false; try { ok = !!(A.init() && AC); } catch (x) {} if (!ok) return;
    if (AC.state === 'suspended') { try { AC.resume(); } catch (x) {} return; }
    if (!ENS.out) { ENS.out = AC.createGain(); ENS.out.gain.value = .55; ENS.out.connect(AC.destination); }
    const wall = Date.now(), acNow = AC.currentTime, STEP = 250;   // 一格 = 250 ms（一個 16 分音符）；4 秒 = 16 格
    let k = Math.max(ENS.nextK, Math.ceil(wall / STEP));
    for (; k * STEP < wall + 450; k++) {
      const t = acNow + (k * STEP - wall) / 1000; if (t < acNow) continue; const bar = k % 16;
      if (ENS.tier >= 1) { if (bar % 4 === 0) ensKick(t); if (bar % 2 === 1) ensHat(t); }
      if (ENS.tier >= 2 && bar % 4 === 0) { const f = [65.41, 65.41, 98, 87.31][bar / 4]; ensNote(t, f, .9, .16, 'triangle'); }
      if (ENS.tier >= 3 && bar === 0) { [261.63, 329.63, 392].forEach(f => ensNote(t, f, 3.6, .05, 'sine')); }
    }
    ENS.nextK = k;
  }
  function ensSync(g) {   // gardenSync 每次輪詢呼叫：層數變高時提醒一次
    if (!g) return; const t = ensTier(g.kinds | 0); ENS.on = U.m === 1 && S.started && !S.ended;
    if (t !== ENS.tier) { const up = t > ENS.tier; ENS.tier = t; ENS.nextK = 0; if (up && ENS.on) toast(t === 1 ? '小鎮有了節拍' : t === 2 ? '低音加入了，小鎮在合奏' : '和弦鋪滿了小鎮', '', 2600); }
    if (!ENS.tm) ENS.tm = setInterval(ensSched, 120);
  }
  const U = { m: 0 };   // 0 關閉　1 全螢幕＋方向鍵（Unity 管我的 Ping）　2 小窗
  function uSet(m) {
    const w = $('#mapWrap'), f = $('#uFrame'), d = $('#dpad'); if (!w || !f || m === U.m) return; const prev = U.m; U.m = m; uMode = m;
    if (m) uLoad(f);
    f.hidden = !m; w.classList.toggle('ufull', m === 1); document.body.classList.toggle('ufull', m === 1); if (d) d.hidden = m !== 1;
    $$('#vseg button').forEach(b => b.setAttribute('aria-pressed', Number(b.getAttribute('data-v')) === m ? 'true' : 'false'));
    if (m === 1) ctlStart(); else if (prev === 1) ctlEnd(); try { updateMain(); uqUpdate(); } catch (e) {}
    uqUpdate(); try { trayRender(); } catch (e) {}
  }
  /* Unity 畫面裡接任務：Ping 走到居民旁邊，出現「接任務」按鈕（位置由 Unity 回報） */
  function uqUpdate() {
    const el = $('#uq'); if (!el) return; if (U.m !== 1 || !S.started) { el.hidden = true; return; }
    const cur = S.quest && !S.woke[S.quest] ? S.quest : null, gv = giver();
    const tg = cur || gv, nr = NET.mx == null || !tg || S.woke[tg] ? null : (Math.hypot(N[tg].x - NET.mx, N[tg].y - NET.my) < 30 ? tg : null);   // 只有「該找的那位」才出現說話按鈕
    const nv = NET.mx == null ? null : (NET.list || []).filter(q => Math.hypot(q.x - NET.mx, q.y - NET.my) < 40)[0];
    let h = '';
    if (nr) h += '<button type="button" class="btn btn-ink uqb" data-r="' + nr + '">跟' + N[nr].who + '說話' + (nr === gv && !cur ? '' : '') + '</button>';
    if (false) h += '<button type="button" class="btn btn-ink uqb" data-bird="1">♪ 給小鳥聽</button>';   // Unity 回報這隻 Ping 在小鳥旁邊
    if (nv) { const fk = frIdx(nv.pid), me2 = NET.me || {}, lb = S.friends[fk] ? '跟' + pName(nv) + '換線索' : (me2.wt || []).includes(nv.pid) ? '等' + pName(nv) + '聽你的招呼聲…' : (nv.gt === NET.pid || (me2.rp || []).includes(nv.pid)) ? '回應' + pName(nv) + '的招呼' : me2.gt === nv.pid ? '等' + pName(nv) + '回應…' : '跟' + pName(nv) + '打招呼'; h += '<button type="button" class="btn btn-soft uqb" data-v="' + nv.pid + '"' + (((me2.gt === nv.pid && nv.gt !== NET.pid && !(me2.rp || []).includes(nv.pid)) || (me2.wt || []).includes(nv.pid)) && !S.friends[fk] ? ' disabled' : '') + '>' + lb + (nv.quest ? '<small class="uqn">接了' + QNAME[nv.quest] + '的委託</small>' : '') + '</button>'; }
    if (!h && !cur && !(NET.list || []).length) { /* 沒訪客 */ }
    if (!h && (NET.list || []).length) h = '<span class="uqt uqs">有訪客在線　點上方「交流」可打招呼</span>';
    if (!h) { const d = (tg && NET.mx != null) ? Math.hypot(N[tg].x - NET.mx, N[tg].y - NET.my) : 999; h = cur ? '' : '<span class="uqt uqs">' + (d < 120 ? '快到了，再靠近一點' : '往他走過去') + '</span>'; }   // 提示不重複任務標題；高度固定，按鈕出現時畫面不跳動
    if (el.getAttribute('data-h') !== h) {
      el.setAttribute('data-h', h); el.innerHTML = h;
      $$('#uq [data-bird]').forEach(b => b.addEventListener('click', giveBird));
      $$('#uq [data-r]').forEach(b => b.addEventListener('click', () => openRes(b.getAttribute('data-r'))));
      $$('#uq [data-v]').forEach(b => b.addEventListener('click', () => greetPid(b.getAttribute('data-v'))));
    }
    el.hidden = !h;
  }
  /* 連線狀態：沒連上時切換列照樣顯示（Unity 那格變淡、寫「未連線」），並一直自動重試 */
  function netUi() {   // 連上伺服器就只看 Unity 畫面；沒連上才用示範用的 2D 地圖
    const vn = $('#vnote'); if (vn) vn.hidden = NET.on || S.screen !== 'explore';
    if (NET.on) NET.was = true; if (NET.on && S.started && S.screen === 'explore') uSet(1); else if (!NET.on && U.m && !NET.was) uSet(0);
  }
  async function netRetry() {
    if (NET.on) return; const ok = await netProbe(); if (!ok) return;
    NET.on = true; NET.fail = 0; netUi(); if (S.started && !NET.joined && !NET.left) netJoin();
  }
  setInterval(netRetry, 3000);
  /* 當機紀錄：頁面卡住超過 1.5 秒、或出現錯誤，就記下來（網址加 ?debug=1 會顯示在畫面左下） */
  (function () {
    const LOG = []; const dbg = new URLSearchParams(location.search).get('debug') === '1'; let box = null;
    const add = t => { LOG.push(new Date().toLocaleTimeString() + ' ' + t); if (LOG.length > 8) LOG.shift(); try { localStorage.setItem('tunein.log', JSON.stringify(LOG)); } catch (e) {} if (dbg) { if (!box) { box = document.createElement('pre'); box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;margin:0;max-width:92vw;font:12px/1.4 monospace;background:rgba(17,17,17,.9);color:#fff;padding:6px 8px;border-radius:10px;white-space:pre-wrap;pointer-events:none'; document.body.appendChild(box); } box.textContent = LOG.join('\n'); } };
    let last = performance.now(); setInterval(() => { const n = performance.now(), d = n - last - 1000; last = n; if (d > 1500 && !document.hidden) add('卡住 ' + Math.round(d) + ' ms'); }, 1000);
    window.addEventListener('error', e => add('錯誤 ' + (e.message || '')));
    window.addEventListener('unhandledrejection', e => add('錯誤 ' + ((e.reason && e.reason.message) || e.reason)));
    window.__tlog = add;
    if (dbg) add('除錯紀錄已開啟');
  })();
  /* 手機方向鍵 → 伺服器 /input → Unity：這位玩家的 Ping 由 Unity 管（和鍵盤一樣：上下前後、左右轉身）。
     看 Unity 全螢幕時每 0.25 秒送一次心跳（沒按也送 0），離開時通知伺服器，並把地圖上的 Ping 放到 Unity 裡最後的位置。 */
  const CTL = { held: {}, fwd: 0, turn: 0, hb: 0, lk: Date.now() % 100000, cf: Date.now() % 100000, bk: Date.now() % 100000 };   // lk 鎖定／cf 確認／bk 返回：按一下加 1
  function ctlCalc() { CTL.fwd = (CTL.held.f ? 1 : 0) - (CTL.held.b ? 1 : 0); CTL.turn = (CTL.held.r ? 1 : 0) - (CTL.held.l ? 1 : 0); }
  function ctlSend() {   // 網路慢時不堆請求：上一個還沒回來就先記著，回來後只送最新的按法
    if (T3) { try { const fr = $('#uFrame'); fr && fr.contentWindow && fr.contentWindow.postMessage({ tunein: 'ctl', fwd: CTL.fwd, turn: CTL.turn }, '*'); } catch (e) {} return; }   // Three.js 小鎮：方向鍵直接傳給畫面，不經過 Unity
    if (!NET.on || !NET.pid) return; const sg = CTL.fwd + ',' + CTL.turn + ',' + CTL.lk + CTL.cf + CTL.bk, nw = Date.now();
    const holding = CTL.fwd !== 0 || CTL.turn !== 0; if (sg === CTL.sig && nw - (CTL.ls || 0) < (holding ? 200 : 600)) return; const chg = sg !== CTL.sig; CTL.sig = sg; CTL.ls = nw;   // 沒在按鍵就 0.6 秒才報一次，兩支手機同時連時伺服器不被塞滿
    if (CTL.busy && !chg) { CTL.again = true; return; }   // 按鍵有變就馬上送（不排隊）；只有心跳才等上一個回來
    CTL.busy = true; CTL.again = false; clearTimeout(CTL.bt); CTL.bt = setTimeout(() => { CTL.busy = false; }, 700);   // 請求卡住也不會永遠鎖死
    netPost('/input', { q: (CTL.q = (CTL.q || 0) + 1), pid: NET.pid, fwd: CTL.fwd, turn: CTL.turn, lk: CTL.lk, cf: CTL.cf, bk: CTL.bk, mode: 1 }).then(() => { CTL.busy = false; if (CTL.again && uMode === 1) ctlSend(); });
  }
  function ctlStart() { clearInterval(CTL.hb); CTL.held = {}; ctlCalc(); ctlSend(); CTL.hb = setInterval(ctlSend, 250); }
  function ctlHold(k, on) {
    if (!!CTL.held[k] === on) return; CTL.held[k] = on; ctlCalc(); try { window.__tlog && window.__tlog('鍵 ' + k + (on ? ' 按下' : ' 放開') + ' uMode=' + uMode); } catch (x) {} if (uMode === 1 || T3) ctlSend();   /* P62：Three.js 小鎮不看 uMode，按了就送 */
    $$('#dpad .dk').forEach(el => el.classList.toggle('on', !!CTL.held[el.getAttribute('data-k')]));
  }
  function ctlEnd() {
    clearInterval(CTL.hb); CTL.hb = 0; CTL.held = {}; ctlCalc(); $$('#dpad .dk').forEach(el => el.classList.remove('on'));
    if (!NET.on || !NET.pid) return;
    NET.sync = true;   // 先不要把地圖上的舊位置送出去，等 Unity 的最後位置回來
    netPost('/input', { pid: NET.pid, mode: 0 });
    setTimeout(async () => {   // 等 Unity 把最後位置傳回來，再讓地圖上的 Ping 接著走
      try { const j = await (await fetch(NET.api + '/state?lite=1', { cache: 'no-store' })).json(); const me = j && j.players && j.players.find(p => p.pid === NET.pid); if (me && uMode !== 1) { moveMe(me.x, me.y, 0.001); NET.px = me.x; NET.py = me.y; NET.lastPost = Date.now(); } } catch (e) {}
      NET.sync = false;
    }, 800);
  }

  /* Three.js 小鎮：Ping 走到居民旁邊，畫面下方出現「和 X 說話」（開居民資料卡，並通知伺服器聊過了） */
  window.addEventListener('message', e => {   // ═════════ [P26] 3D 小鎮對話點擊 ═════════ 對話框在 3D 小鎮 iframe 裡：對話中讓 iframe 接收點擊（平常 pointer-events:none，所以以前點不到、對話無法繼續）
    const d = e.data; if (!d || d.tunein !== 'dlg') return;
    try { const fr = $('#uFrame'); if (fr) fr.style.pointerEvents = d.on ? 'auto' : 'none'; } catch (x) {}
  });
  window.addEventListener('message', e => {   // 小鎮裡聊完了：通知伺服器「聊過了」（居民想聽的聲音就會出現在任務單）
    const d = e.data; if (!d || d.tunein !== 'talkEnd') return;
    S.talkOn = false;
    { S.unl = S.unl || {}; const fresh = !S.unl[d.id]; S.unl[d.id] = 1; toTown({ tunein: 'unlock', ids: Object.keys(S.unl) }); try { sessSave(); } catch (x) {}
      if (fresh && CODEX.cfg && CODEX.cfg.spots.some(x => x.gate === d.id)) toast('居民告訴你一些害羞的聲音，打開探測器找找看', 'ok', 3600); }   // [P33] 跟居民聊過才找得到的聲音
    try { if (NET.on) netPost('/residents/met', { id: d.id }); } catch (x) {}
    try { const b = $('#t3talk'); if (b) b.hidden = false; } catch (x) {}
    try { if (N[d.id]) openRes(d.id); else closeSheet(); } catch (x) { try { closeSheet(); } catch (y) {} }   // 聊完：顯示居民「想聽的聲音」那張卡（網頁原本的居民畫面）
  });
  /* ═════════ [P27] 3D 小鎮對話卡：用網頁自己的底部對話卡＋「繼續」按鈕（不用點螢幕）；頭上名字／Blip 說話顯示在畫面左上角 ═════════ */
  const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.addEventListener('message', e => {   // 對話中的一句
    const d = e.data; if (!d || d.tunein !== 'dlgLine') return;
    const n = N[d.id] || {}, last = d.i >= d.n - 1, cls = n.cls || 'flower';
    S.talkOn = true;
    const prog = d.n > 1 ? '<span class="dlg-n">' + (d.i + 1) + '／' + d.n + '</span>' : '';   /* [P44] 對話卡：說話的人、頁數文字、一個氣泡、一顆按鈕 */
    openSheet('<div class="dlg l-' + cls + '"><div class="dlg-who"><span class="ico">' + (n.icon ? icon(n.icon) : '') + '</span><b>' + escH(d.who) + '</b>' + prog + CLOSE + '</div>' +
      '<div class="dlg-bub">' + escH(d.text) + '</div><button class="dlg-go" type="button" id="dlgNext">' + (last ? '好，我去找' : '繼續') + '</button></div>');
    try { $('#sheet').classList.add('dlgmode'); document.body.classList.add('talking'); } catch (x) {}
    const b = $('#dlgNext'); if (b) b.addEventListener('click', () => { try { ensureAudio(); sfx.tap(); } catch (x) {} try { const fr = $('#uFrame'); fr && fr.contentWindow && fr.contentWindow.postMessage({ tunein: 'talkNext' }, '*'); } catch (x) {} });
  });
  window.addEventListener('message', e => {   // 3D 小鎮說對話結束了（例如被重置）：收起對話卡
    const d = e.data; if (!d || d.tunein !== 'dlgClose') return;
    if (S.talkOn) { S.talkOn = false; closeSheet(); }
  });
  window.addEventListener('message', e => {   // 頭上的 UI 搬到畫面左上角：我與其他玩家的名字、Blip 說的話
    const d = e.data; if (!d || d.tunein !== 'hud') return;
    let hb = $('#t3hud'); if (!hb) { hb = document.createElement('div'); hb.id = 't3hud'; const w = $('#mapWrap'); if (!w) return; w.appendChild(hb); }
    const pill = (p, you) => '<span class="t3p"><i style="background:' + escH(p.c || '#FFB5C1') + '"></i>' + escH(p.n) + (you ? '<em>你</em>' : '') + '</span>';
    const names = []; if (d.me && d.me.n) names.push(pill(d.me, true)); (d.others || []).slice(0, 3).forEach(p => names.push(pill(p, false))); if ((d.others || []).length > 3) names.push('<span class="t3p">+' + ((d.others || []).length - 3) + '</span>');
    hb.innerHTML = (names.length ? '<div class="t3row">' + names.join('') + '</div>' : '') + (d.blip ? '<div class="t3say"><b>Blip</b>' + escH(d.blip) + '</div>' : '');
    hb.hidden = !hb.innerHTML;
  });
  window.addEventListener('message', e => {
    const d = e.data; if (!d || !d.tunein || (d.tunein !== 'near' && d.tunein !== 'far')) return;
    let b = $('#t3talk');
    if (d.tunein === 'far') { if (b) b.hidden = true; return; }
    if (!b) { b = document.createElement('button'); b.id = 't3talk'; b.type = 'button'; b.className = 'btn btn-ink'; $('#mapWrap').appendChild(b); b.addEventListener('click', () => { const id = b.getAttribute('data-id'); try { ensureAudio(); sfx.tap(); } catch (x) {} if (id) { b.hidden = true; try { const fr = $('#uFrame'); fr.contentWindow.postMessage({ tunein: 'talk', id }, '*'); } catch (x) {} } }); }
    b.textContent = '和' + (d.name || '居民') + '說話'; b.setAttribute('data-id', d.id); b.hidden = false; placeTalk();
  });
  function placeTalk() { const b = $('#t3talk'), f = $('#uFrame'); if (!b || !f || !document.body.classList.contains('ufull')) return; const r = f.getBoundingClientRect(); if (r.width < 40) return; b.style.left = (r.left + r.width / 2) + 'px'; b.style.top = (r.bottom - 142) + 'px'; b.style.bottom = 'auto'; const q = $('#uq'); if (q) { q.style.left = (r.left + r.width / 2) + 'px'; q.style.top = (r.bottom - 142) + 'px'; } }   /* [P94] 說話鈕放方向鍵正上方、不蓋 Ping */   /* 說話鈕固定在方向鍵正上方（原本會被方向鍵蓋住、誤觸） */   /* 說話鈕放在方向鍵上方，不壓到方向鍵 */
  window.addEventListener('resize', placeTalk);
  function ctlStop() { Object.keys(CTL.held).forEach(k => { if (CTL.held[k]) ctlHold(k, false); }); }
  document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('#dpad .dk'); if (!b) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} ctlHold(b.getAttribute('data-k'), true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => document.addEventListener(t, e => { const b = e.target.closest && e.target.closest('#dpad .dk'); if (b) ctlHold(b.getAttribute('data-k'), false); }));
  /* 動作鍵：鎖定／確認／返回（Unity 裡 Ping 站定後用耳朵偵測；鎖定後上下鍵＝對焦、左右鍵＝微調視線） */
  document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('#dpad .ak'); if (!b) return; e.preventDefault(); const k = b.getAttribute('data-a'); CTL[k]++; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 160); if (uMode === 1) ctlSend(); });
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('#dpad')) e.preventDefault(); });
  window.addEventListener('blur', ctlStop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) ctlStop(); });
  /* 保險：手指全部離開螢幕（或被系統手勢打斷）時，一定把所有方向鍵放開，避免按鍵卡在『按住』 */
  ['touchend', 'touchcancel'].forEach(t => document.addEventListener(t, e => { if (!e.touches || e.touches.length === 0) ctlStop(); }, { passive: true }));
  /* ═════════ [P30] 開場教學：做完才能自由逛 ═════════
     歡迎 → 走走看 → 打開探測器 → 跟著箭頭 → 調清楚 → 種花；教學中小鎮只開一個教學聲音點、活動範圍縮小，結束後才解鎖全圖。
     每一步都由「玩家真的做了」才換下一步（走路、開探測器、靠近、收下、種花），不靠按「下一步」。 */
  const TUTS = [
    { h: '歡迎來到聲音小鎮', p: '收集聲音，讓小鎮熱鬧' },
    { h: '先走走看', p: '右鍵前進，左鍵轉身' },
    { h: '打開探測器', p: '按下面的按鈕' },
    { h: '跟著箭頭', p: '走進發光的圈' },
    { h: '調清楚', p: '滑到波形最整齊' },
    { h: '種在小鳥旁', p: '走到花店旁，按「種花」' },
    { h: '小鳥飛來了', p: '去找居民聊聊' }
  ];
  const TUT_NEAR = { h: '出現聲音點了', p: '走進圈裡' };
  const TUTO = { on: false, ack: 0, mvT: 0, go: 0, plAt: 0 };
  const CINE = { on: false };
  const tutActive = () => U.m === 1 && S.started && !S.ended && !S.tutDone && !!(CODEX && CODEX.cfg);
  function tutIdx() {   // 0 歡迎　1 走走看　2 探測器　3 跟箭頭　4 調清楚　5 種花　6 完成
    if (!S.tutHi) return 0; if (S.tutPl) return 6;
    if (TN.on) return 4; if (seedsGet().length > 0) return 5; if (DETS.on) return 3; if (!S.tutMv) return 1; return 2;
  }
  function tutNow() { return tutActive() ? { n: tutIdx() } : null; }
  let tmEl = null, tmN = null;
  function tutModal(n) {
    if (n === null) { if (tmEl && !tmEl.hidden) { tmEl.classList.add('out'); const el0 = tmEl; setTimeout(() => { if (tmN === null) el0.hidden = true; }, 400); } tmN = null; return; }
    if (!tmEl) {
      tmEl = document.createElement('div'); tmEl.className = 'sdx-tm'; tmEl.setAttribute('role', 'dialog'); tmEl.setAttribute('aria-modal', 'true'); tmEl.hidden = true;
      tmEl.innerHTML = '<div class="sdx-tmc">' + BLIP_FLAT('sdx-tmi') + '<h3 class="sdx-tmh"></h3><p class="sdx-tmp"></p><button type="button" class="btn btn-ink btn-block sdx-tmb"></button></div>';
      document.body.appendChild(tmEl);
      tmEl.querySelector('.sdx-tmb').addEventListener('click', () => {
        try { ensureAudio(); A.init(); sfx.tap(); } catch (x) {}
        if (tmN === 0) { S.tutHi = true; } else if (tmN === 6) { S.tutDone = true; S.tutDoneAt = Date.now(); toTown({ tunein: 'tut', on: false }); toast('教學完成，去逛逛小鎮吧', 'ok', 2800); try { sessSave(); } catch (x) {} }
        tmN = null; tutTick();
      });
    }
    if (tmN !== n) { tmN = n; tmEl.querySelector('.sdx-tmh').textContent = TUTS[n].h; tmEl.querySelector('.sdx-tmp').textContent = TUTS[n].p; tmEl.querySelector('.sdx-tmb').textContent = n === 0 ? '開始' : '自由逛逛'; }
    const f = $('#uFrame'), r = f && !f.hidden ? f.getBoundingClientRect() : null;
    if (r && r.width > 40) { tmEl.style.left = r.left + 'px'; tmEl.style.top = r.top + 'px'; tmEl.style.width = r.width + 'px'; tmEl.style.height = r.height + 'px'; }
    tmEl.classList.remove('out'); tmEl.hidden = false;
  }
  /* [P42] 教學浮動提示：直接疊在小鎮畫面中間偏上（Ping 上方），大字，做完該步自動換；步驟 3 有箭頭提示列，不重複 */
  let coEl = null, coN = null;
  function tutCoach(i) {
    const near3 = i === 3 && DETS.on && !!DETS.near, show = (i >= 1 && i <= 5 && i !== 3 && !(i === 4 && TN.on)) || near3;   /* 說明放在 Ping 上方的小提示；上方任務卡只留步驟進度 */
    if (!show) { if (coEl) coEl.hidden = true; coN = null; return; }
    if (!coEl) { coEl = document.createElement('div'); coEl.className = 'sdx-co'; coEl.setAttribute('role', 'status'); coEl.hidden = true; coEl.innerHTML = '<b class="sdx-coh"></b><span class="sdx-cop"></span>'; document.body.appendChild(coEl); }
    const TT = near3 ? TUT_NEAR : TUTS[i], key = near3 ? 'n3' : i;
    if (coN !== key) { coN = key; coEl.querySelector('.sdx-coh').textContent = TT.h; coEl.querySelector('.sdx-cop').textContent = TT.p; coEl.classList.remove('in'); void coEl.offsetWidth; coEl.classList.add('in'); }
    const f = $('#uFrame'), r = f && !f.hidden ? f.getBoundingClientRect() : null; if (!r || r.width < 40) { coEl.hidden = true; return; }
    coEl.style.left = (r.left + r.width / 2) + 'px'; coEl.style.top = (r.top + 96) + 'px'; coEl.style.maxWidth = (r.width - 32) + 'px'; coEl.hidden = false;
  }
  /* [P55] 教學種花步驟：小鳥在哪裡——畫面內＝小鳥頭上出現標籤；畫面外＝邊緣出現方向提示 */
  let bdEl = null, bdOn = false;
  function birdMark(on) {
    if (on === bdOn) return; bdOn = on; toTown({ tunein: 'birdMark', on });
    if (!on && bdEl) bdEl.hidden = true;
  }
  function birdDir(d) {
    if (!bdOn || CINE.on || d.vis) { if (bdEl) bdEl.hidden = true; return; }
    if (!bdEl) { bdEl = document.createElement('div'); bdEl.className = 'sdx-bd'; bdEl.setAttribute('role', 'status'); bdEl.innerHTML = '<i></i><b></b>'; document.body.appendChild(bdEl); }
    const f = $('#uFrame'), r = f && !f.hidden ? f.getBoundingClientRect() : null; if (!r || r.width < 40) { bdEl.hidden = true; return; }
    bdEl.className = 'sdx-bd ' + (d.side === 'l' ? 'l' : 'r'); bdEl.querySelector('b').textContent = '小鳥 ' + d.dist + ' 公尺';
    bdEl.style.top = (r.top + r.height * .5) + 'px'; bdEl.style.left = d.side === 'l' ? (r.left + 10) + 'px' : 'auto'; bdEl.style.right = d.side === 'l' ? 'auto' : (innerWidth - r.right + 10) + 'px'; bdEl.hidden = false;
  }
  function tutTick() {
    try {
      const act = tutActive(); document.body.classList.toggle('tut', act);
      if (!act) { if (S.started && TUTO.go < 40) { TUTO.go++; toTown({ tunein: 'appearGo' }); } if (TUTO.on) { TUTO.on = false; tutModal(null); } tutCoach(null); splTick(-1); document.body.removeAttribute('data-tut'); return; }
      if (!TUTO.on) { TUTO.on = true; TUTO.ack = 0; }
      if (TUTO.ack < 40 && S.tutHi) { TUTO.ack++; toTown({ tunein: 'tut', on: true }); }   // 小鎮還沒載好時重送，直到它回報 tutState
      const n = seedsGet().length; if (n > 0) S.tutHad = true;
      if (S.tutHad && !S.tutPl && !TN.on && n === 0) { S.tutPl = true; TUTO.plAt = Date.now(); }   // 收過種子、口袋又空了＝種下去了
      let i = tutIdx();
      if (i === 1 && CTL.fwd > 0) { TUTO.mvT += .3; if (TUTO.mvT >= 2) { S.tutMv = true; i = tutIdx(); } }
      document.body.setAttribute('data-tut', String(i));
      tutModal(i === 0 || (i === 6 && !CINE.on && Date.now() - TUTO.plAt > 2800) ? i : null);   /* 完成卡等小鳥事件播完才出現 */ tutCoach(i); birdMark(i === 5 && !CINE.on); renderGuide(); placeTalk(); splTick(i);
    } catch (e) {}
  }

  /* ═════════ [P92] 教學引導三機制：Spotlight（背景壓暗 70%、只亮目前的按鈕）／Guided Action（挖洞以外全鎖，做完才進下一步）／ToolTip（見 fcRender：靠近 0.3 秒跳短提示） ═════════ */
  const SPL = { dim: null, ring: null };
  function splEls() {
    if (SPL.dim) return; const d = document.createElement('div'); d.id = 'sp92'; d.hidden = true; const r = document.createElement('div'); r.id = 'sp92r'; r.hidden = true; r.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d); document.body.appendChild(r); SPL.dim = d; SPL.ring = r;
  }
  function splTick(i) {
    try {
      splEls(); const f = $('#uFrame'), fr = f && !f.hidden ? f.getBoundingClientRect() : null; let box = null, dim = false;
      if (i === 1 && fr && fr.width > 40) { box = { l: fr.left + 6, t: fr.bottom - 120, w: fr.width - 12, h: 112 }; dim = !(TUTO.mvT > 0 || S.tutMv); }   /* 走走看：方向鍵區；一開始走動就放亮 */
      else if (i === 2) { const b = $('#btnDet'); if (b && !b.hidden) { const r = b.getBoundingClientRect(); if (r.width > 20) { box = { l: r.left, t: r.top, w: r.width, h: r.height }; dim = true; } } }
      else if (i === 5) { const b = document.querySelector('.sdx-go.big'); if (b) { const r = b.getBoundingClientRect(); if (r.width > 20) box = { l: r.left, t: r.top, w: r.width, h: r.height }; } }   /* 種花：只圈出按鈕，不壓暗（還要走路） */
      document.body.classList.toggle('lock', i >= 1 && i <= 5);   /* Guided Action：上方卡片按鈕先鎖住 */
      if (!box || CINE.on) { SPL.dim.hidden = true; SPL.ring.hidden = true; return; }
      const P = 8, x1 = Math.max(0, box.l - P), y1 = Math.max(0, box.t - P), x2 = box.l + box.w + P, y2 = box.t + box.h + P;
      SPL.ring.style.cssText = 'left:' + x1 + 'px;top:' + y1 + 'px;width:' + (x2 - x1) + 'px;height:' + (y2 - y1) + 'px'; SPL.ring.hidden = false;
      if (dim) { SPL.dim.style.clipPath = 'polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,' + x1 + 'px ' + y1 + 'px,' + x1 + 'px ' + y2 + 'px,' + x2 + 'px ' + y2 + 'px,' + x2 + 'px ' + y1 + 'px,' + x1 + 'px ' + y1 + 'px)'; SPL.dim.hidden = false; } else SPL.dim.hidden = true;
    } catch (e) {}
  }
  setInterval(tutTick, 300);
  window.addEventListener('resize', () => { try { splTick(tutActive() ? tutIdx() : -1); } catch (e) {} });
  /* [P47] 歡迎音樂（只在網頁）：加入頁＋歡迎卡時循環播放，按「開始」進教學就淡出；瀏覽器要先有一次點擊才能出聲 */
  const BGM_ID = Math.random().toString(36).slice(2), BGM_KEY = 'tunein.bgm';
  function bgmOwn() {
    try {
      const raw = localStorage.getItem(BGM_KEY), o = raw ? JSON.parse(raw) : null, now = Date.now();
      if (!o || o.id === BGM_ID || now - o.t > 1500) { localStorage.setItem(BGM_KEY, JSON.stringify({ id: BGM_ID, t: now })); return true; }
      return false;
    } catch (e) { return true; }
  }
  function bgmRelease() { try { const o = JSON.parse(localStorage.getItem(BGM_KEY) || 'null'); if (o && o.id === BGM_ID) localStorage.removeItem(BGM_KEY); } catch (e) {} }
  window.addEventListener('pagehide', bgmRelease);
  const bgmHint = document.createElement('div'); bgmHint.id = 'bgmHint'; bgmHint.textContent = '點一下畫面，開啟音樂'; bgmHint.hidden = true; document.body.appendChild(bgmHint);
  const BGM = { a: null, ok: false, vol: .4, v: 0, g: null, ctx: null };
  function bgmEl() {
    if (!BGM.a) {
      const a = new Audio('audio/welcome.mp3?v=2'); a.loop = true; a.preload = 'none'; BGM.a = a;   /* P62：背景音樂 4.2MB 不要一開頁就下載（會和小鎮模型搶頻寬、讓載入變慢），要播的時候才載 */
      try { const AX = window.AudioContext || window.webkitAudioContext; BGM.ctx = new AX(); const src = BGM.ctx.createMediaElementSource(a); BGM.g = BGM.ctx.createGain(); BGM.g.gain.value = 0; src.connect(BGM.g); BGM.g.connect(BGM.ctx.destination); } catch (e) { BGM.g = null; }
    }
    return BGM.a;
  }
  function bgmVol(v) { BGM.v = v; try { if (BGM.g) BGM.g.gain.value = v; else BGM.a.volume = Math.max(0, Math.min(1, v)); } catch (e) {} }   /* iOS 不吃 audio.volume，所以走 Web Audio 增益；淡出到 0 才真的暫停 */
  function bgmTick() {
    try { bgmHint.hidden = BGM.ok || S.started || S.ended; } catch (e) {}
    try {
      const want = BGM.ok && !document.hidden && !S.started && !S.ended && bgmOwn(), a = bgmEl();
      if (want) { try { if (BGM.ctx && BGM.ctx.state === 'suspended') BGM.ctx.resume(); } catch (e) {} if (a.paused) { const pr = a.play(); if (pr && pr.catch) pr.catch(() => { BGM.ok = false; }); } bgmVol(Math.min(BGM.vol, BGM.v + .04)); }
      else if (!a.paused) { bgmVol(Math.max(0, BGM.v - .12)); if (BGM.v <= 0) a.pause(); }
    } catch (e) {}
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, () => { BGM.ok = true; bgmTick(); }, { passive: true }));
  setInterval(bgmTick, 200);
  /* [P69] 小鎮背景音樂（和 Unity 同步）：小鎮安靜時播寂靜曲；熱鬧度 loud(0–100) 超過 25% 淡入歡樂曲，70% 完全換成歡樂曲（和 Unity BgmPlayer 一樣的門檻） */
  const TM = { q: null, l: null, ctx: null, gq: null, gl: null, k: 0, a: 0 };
  function tmInit() {
    if (TM.q) return;
    TM.q = new Audio('audio/town_quiet.mp3?v=1'); TM.l = new Audio('audio/town_lively.mp3?v=1');
    [TM.q, TM.l].forEach(x => { x.loop = true; x.preload = 'none'; });
    try { const AX = window.AudioContext || window.webkitAudioContext; TM.ctx = new AX();
      [['q', 'gq'], ['l', 'gl']].forEach(p => { const s = TM.ctx.createMediaElementSource(TM[p[0]]); TM[p[1]] = TM.ctx.createGain(); TM[p[1]].gain.value = 0; s.connect(TM[p[1]]); TM[p[1]].connect(TM.ctx.destination); }); } catch (e) { TM.gq = TM.gl = null; }
  }
  function tmSet(vq, vl) { try { if (TM.gq) { TM.gq.gain.value = vq; TM.gl.gain.value = vl; } else { TM.q.volume = Math.max(0, Math.min(1, vq)); TM.l.volume = Math.max(0, Math.min(1, vl)); } } catch (e) {} }
  function tmTick() {
    try {
      const on = BGM.ok && !document.hidden && S.started && !S.ended && bgmOwn();
      if (!on && !TM.q) return; tmInit();
      TM.a = on ? Math.min(1, TM.a + .03) : Math.max(0, TM.a - .1);
      if (on && TM.ctx && TM.ctx.state === 'suspended') { try { TM.ctx.resume(); } catch (e) {} }
      if (on) { [TM.q, TM.l].forEach(x => { if (x.paused) { const pr = x.play(); if (pr && pr.catch) pr.catch(() => {}); } }); }
      const loud = (typeof GP !== 'undefined' && GP && GP.loud) || 0, x0 = Math.max(0, Math.min(1, (loud / 100 - .25) / .45)), kt = x0 * x0 * (3 - 2 * x0);
      TM.k += (kt - TM.k) * .08;
      const duck = DETS.on ? .6 : 1;
      tmSet(.55 * TM.a * duck * (1 - TM.k), .3 * TM.a * duck * TM.k);
      if (!on && TM.a <= 0) [TM.q, TM.l].forEach(x => { if (!x.paused) x.pause(); });
    } catch (e) {}
  }
  setInterval(tmTick, 200);
  /* [P70] Ping 走路腳步聲：town3d 每走約 1.5 公尺送一次 step；這裡合成輕輕的「噗」聲（低頻小撞擊＋濾過的氣音），不用音檔 */
  const FS = { ctx: null, g: null, nb: null, last: 0 };
  function fsInit() {
    if (FS.ctx) return true;
    try {
      const AX = window.AudioContext || window.webkitAudioContext; FS.ctx = new AX(); FS.g = FS.ctx.createGain(); FS.g.gain.value = 1; FS.g.connect(FS.ctx.destination);
      const n = Math.floor(FS.ctx.sampleRate * .12), b = FS.ctx.createBuffer(1, n, FS.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; FS.nb = b; return true;
    } catch (e) { FS.ctx = null; return false; }
  }
  function fsPlay(v) {
    try {
      if (!BGM.ok || document.hidden || !S.started || S.ended || !fsInit()) return;
      const c = FS.ctx, t = c.currentTime; if (c.state === 'suspended') c.resume(); if (t - FS.last < .12) return; FS.last = t;
      const vol = Math.max(0, Math.min(1, v)) * .5, pit = .85 + Math.random() * .3;
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150 * pit, t); o.frequency.exponentialRampToValueAtTime(55 * pit, t + .09);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(vol * .9, t + .008); og.gain.exponentialRampToValueAtTime(.0008, t + .11); o.connect(og); og.connect(FS.g); o.start(t); o.stop(t + .13);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), sg = c.createGain(); s.buffer = FS.nb; f.type = 'bandpass'; f.frequency.value = 900 * pit; f.Q.value = .8;
      sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(vol * .5, t + .004); sg.gain.exponentialRampToValueAtTime(.0008, t + .07); s.connect(f); f.connect(sg); sg.connect(FS.g); s.start(t); s.stop(t + .12);
    } catch (e) {}
  }
  window.addEventListener('message', e => { const d = e.data; if (d && d.tunein === 'step') fsPlay(+d.v || 0); });
  /* P62 保護：小鎮還沒認到我（沒收到 pid、訊息在 iframe 載入前漏掉）就每 1.5 秒重送一次，直到小鎮回報 sp=1；Ping 不會因為一次訊息漏掉就一直隱形、方向鍵一直鎖住 */
  const TOWN = { sp: false, t: 0 };
  setInterval(() => { try { if (NET.pid && S.started && !TOWN.sp) uPid(); } catch (x) {} }, 1500);
  window.addEventListener('message', e => {
    const d = e.data; if (!d) return;
    if (d.tunein === 'birdDir') { birdDir(d); return; }
    if (d.tunein === 'cine') { CINE.on = !!d.on; document.body.classList.toggle('cine', CINE.on); clearTimeout(CINE.safe); if (CINE.on) CINE.safe = setTimeout(() => { CINE.on = false; document.body.classList.remove('cine'); }, 15000); return; }   /* 保險：過場最多 15 秒，小鎮沒回報結束也會自動解除，方向鍵不會一直被藏起來 */
    if (d.tunein === 'dbg') { try { window.__tlog && window.__tlog('town ' + d.s); } catch (x) {} TOWN.sp = /sp=1/.test(d.s || ''); TOWN.t = Date.now(); return; }
    if (d.tunein === 'tutState') { TUTO.ack = 99; return; }
    if (d.tunein === 'ready') { TUTO.ack = 0; if (WXO) toTown({ tunein: 'weather', kind: WXO.kind, lv: WXO.lv }); toTown({ tunein: 'unlock', ids: Object.keys(S.unl || {}) }); return; }
    if (d.tunein === 'tutEdge') toast('先在這附近完成教學，之後就能走遠囉', '', 2600);
  });

  /* ═════════ [P21] 回合內意外跳出：回來接回原本的進度；回合結束就清掉，結束就是結束 ═════════ */
  const SESS_KEY = 'tunein.sess', SESS_F = ['cards', 'planted', 'notes', 'seen', 'met', 'woke', 'side', 'small', 'sk', 'marks', 'sideOn', 'loc', 'me', 'hint', 'asked', 'town', 'friends', 'swap', 'heard', 'quest', 'assign', 'mine', 'fh', 'taught', 'players', 'acc', 'unl', 'tutHi', 'tutMv', 'tutHad', 'tutPl', 'tutDone'];
  function sessSave() {
    try {
      if (!S.started || S.ended || S.roundEnd - Date.now() <= 0) { localStorage.removeItem(SESS_KEY); return; }
      const o = {}; SESS_F.forEach(k => { o[k] = S[k]; });
      localStorage.setItem(SESS_KEY, JSON.stringify({ pid: NET.pid, epoch: NET.epoch, roundEnd: S.roundEnd, ts: Date.now(), ME: ME, S: o }));
    } catch (e) {}
  }
  async function sessRestore() {
    let o = null; try { o = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); } catch (e) {}
    if (!o || !o.pid || !o.S || o.roundEnd - Date.now() < 3000) { try { localStorage.removeItem(SESS_KEY); } catch (e) {} return; }
    await sleep(300);   // 等頁面和字型載完、畫面穩了再還原，不跟載入搶
    for (let i = 0; i < 24 && !NET.on; i++) await sleep(250);
    if (!NET.on || S.started || S.screen !== 'join') return;   // 已經自己按了開始：不還原   // 連不上伺服器、或已經自己按了開始：不還原
    let s2 = null; try { s2 = await (await fetch(NET.api + '/state?lite=1', { cache: 'no-store' })).json(); } catch (e) {}
    if (!s2 || !s2.active || (o.epoch != null && s2.epoch !== o.epoch)) { try { localStorage.removeItem(SESS_KEY); } catch (e) {} return; }   // 這一輪已結束或伺服器已重置
    try {
      Object.assign(S, o.S); NET.pid = o.pid; try { sessionStorage.setItem('tunein.pid', o.pid); } catch (e) {} NET.epoch = s2.epoch; if (o.ME) { ME = o.ME; setMyColor(o.ME); }
      S.started = true; S.ended = false; S.roundEnd = Date.now() + (s2.left || 0); S.view = 'map';
      ensureAudio(); try { A.init(); } catch (e) {}
      $('#ltg').innerHTML = ''; moveMe(S.me.x, S.me.y); emInit(); NET.restored = true; netJoin().then(() => { try { if (NET.joined) netPost('/move', { pid: NET.pid, x: S.me.x, y: S.me.y }); } catch (e) {} }); syncRound();
      if (!$('#quiet')) $('#guide').insertAdjacentHTML('afterend', '<div class="card" id="quiet" hidden>小葵 Ping 正在收聲音，輕一點。</div>');
      show('explore'); tickRound();
      setTimeout(() => { try { renderMap(); } catch (e) {} }, 60); setTimeout(() => { try { renderGuide(); } catch (e) {} }, 160);   // 分批畫，一次做完會卡
      setTimeout(() => toast('歡迎回來，已接回原本的進度', 'ok'), 400);
    } catch (e) { console.warn('sessRestore', e); }
  }
  /* 存檔放在畫面閒下來時、每 10 秒一次；收聲音（錄音運算中）和切到背景時不存，避免主執行緒被打斷而卡 */
  setInterval(() => { if (S.screen === 'listen' || document.hidden || !S.started) return; (window.requestIdleCallback ? window.requestIdleCallback(sessSave, { timeout: 3000 }) : setTimeout(sessSave, 60)); }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sessSave(); });
  netProbe().then(ok => { NET.on = ok; netUi(); });
  sessRestore().then(() => document.documentElement.classList.remove('resuming'), () => document.documentElement.classList.remove('resuming')); setTimeout(() => document.documentElement.classList.remove('resuming'), 8000);
  setInterval(netTick, 350);
  window.addEventListener('pagehide', () => { sessSave(); if (NET.on && NET.joined && (S.ended || !S.started || S.roundEnd - Date.now() <= 0)) {   /* 回合內意外跳出：不通知離開，Ping 留著 60 秒等他回來；回合結束才真的離開 */ try { navigator.sendBeacon(NET.api + '/leave', JSON.stringify({ pid: NET.pid })); } catch (e) {} } });

  /* ═════════ [P22] 十個發聲點（真實展場由 server 排程，這裡模擬） ═════════ */
  const srcOn = id => { if (!EM.length || !(id in RES_EM)) return true; if (EM[RES_EM[id]].on) return true; return !MAIN.some(x => !S.woke[x] && EM[RES_EM[x]].on); };   // 全部都沒聲音時先全部放行，不會卡住
  const GV = ['flower'];   // Unity 目前只有花店老闆 Rowan：任務只由他發；之後加居民就把名字加進來
  function giver() { const gok = x => !NET.on || GV.includes(x); if (S.assign && !S.woke[S.assign] && gok(S.assign)) return S.assign; const un = MAIN.filter(x => !S.woke[x] && gok(x)), ok = un.filter(srcOn); if (!un.length) return null;
    S.assign = (NET.assign && un.includes(NET.assign) && (ok.includes(NET.assign) || !ok.length)) ? NET.assign : (ok.length ? ok : un)[Math.floor(Math.random() * (ok.length || un.length))]; return S.assign; }
  function pickCur() { if (S.quest && MAIN.includes(S.quest) && !S.woke[S.quest]) return S.quest; const g = giver(); if (g) return g; const un = MAIN.filter(x => !S.woke[x]); return un.filter(srcOn)[0] || un[0]; }
  function emHTML() {
    return '<g id="emg">' + EMS.map((p, i) => '<g class="em l-' + ['flower', 'house', 'market', 'river'][i % 4] + '" data-e="' + i + '" transform="translate(' + p[0] + ' ' + p[1] + ')"><circle class="emr" r="8"/><circle class="emr b" r="8"/><circle class="emd" r="8"/><text y="3.6">' + (i + 1) + '</text></g>').join('') + '</g>';
  }
  function emDraw() { EM.forEach((e, i) => { const g = document.querySelector('.em[data-e="' + i + '"]'); if (g) g.classList.toggle('on', e.on && !!S.heard[i]); }); const c = $('#lvcnt'); if (c) c.textContent = EM.filter(e => e.on).length + '/10'; }
  function emFix() {
    const cnt = () => EM.filter(e => e.on).length; let g = 0, o;
    while (cnt() < 4 && g++ < 30) { o = EM.filter(e => !e.on); o[Math.floor(Math.random() * o.length)].on = true; }
    while (cnt() > 6 && g++ < 60) { o = EM.filter(e => e.on); o[Math.floor(Math.random() * o.length)].on = false; }
    const un = MAIN.filter(x => !S.woke[x]); if (un.length && !un.some(srcOn)) EM[RES_EM[un[0]]].on = true;
  }
  function emInit() { const now = Date.now(); EM = EMS.map((p, i) => ({ on: false, until: now + (25 + Math.random() * 55) * 1000 })); EM.sort(() => Math.random() - .5).forEach((e, i) => { e.on = i < 5; }); EM.sort(() => 0); emFix(); emDraw(); }
  function emTick() {
    if (NET.on || !S.started || S.ended || !EM.length) return; const now = Date.now(), ch = [];
    EM.forEach((e, i) => { if (now >= e.until) { e.on = !e.on; e.until = now + (40 + Math.random() * 50) * 1000; ch.push(i); } });
    if (!ch.length) return; emFix(); emDraw(); const cur = pickCur();
    if (cur && ch.indexOf(RES_EM[cur]) >= 0 && EM[RES_EM[cur]].on && S.screen === 'explore') toast(N[cur].name + '那邊的聲音點醒了。');
    renderGuide(); MAIN.forEach(id => { const pt = document.querySelector('[data-id="' + id + '"]'); if (pt) pt.classList.toggle('lockp', !S.woke[id] && !srcOn(id)); });
  }
  const OPS = [['op1', 60, 196], ['op2', 236, 196]];
  function opWander() { if (S.screen !== 'explore') return; OPS.forEach(o => { const e = document.getElementById(o[0]); if (!e) return; o[1] = Math.max(24, Math.min(296, o[1] + (Math.random() - .5) * 120)); o[2] = Math.max(30, Math.min(268, o[2] + (Math.random() - .5) * 100)); e.style.transition = 'transform 3.5s ease'; e.style.transform = 'translate(' + o[1] + 'px,' + o[2] + 'px)'; }); }

  /* ═════════ [P23] 合作換線索：每位玩家只聽得到一半，另一半在別的訪客那裡 ═════════ */
  const clueOfSlot = sl => { const r = sl.split('.')[0], k = sl.split('.')[1]; return k === 'own' ? { f: r, t: N[r].ownN, kind: CK[sl] } : { f: N[r].nb.about, t: N[r].nb.note, kind: CK[sl] }; };
  function openSwap(i) {
    const f = FR[i], list = S.fh[i]; const head = '<div class="sh-h l-' + f.col + '"><span class="ico">' + icon('door') + '</span><div><h2>' + f.name + '</h2><p class="cap">換線索</p></div>' + CLOSE + '</div>';
    if (!list.length) { openSheet(head + '<div class="bub small l-' + f.col + '">' + f.name + '：我知道的都告訴你了。</div>'); return; }
    const mine = S.notes.filter(n => !n.src);
    if (!mine.length) { openSheet(head + '<div class="bub small l-' + f.col + '">' + f.name + '：我聽過一條，想跟你換。你先去問問居民，再回來。</div>'); return; }
    const cur = pickCur(), pk = list.filter(sl => clueOfSlot(sl).f === cur)[0] || list[0], give = clueOfSlot(pk);
    openSheet(head + '<div class="bub small l-' + f.col + '">' + f.name + '：我聽過一條，你也給我一條你聽過的吧。</div><p class="cap">換給她哪一條？她會聽到那條線索的聲音：</p>' + mine.map((n, j) => '<button class="btn btn-soft btn-block" type="button" data-give="' + j + '">' + n.t + '</button>').join(''));
    $$('#sheetBody [data-give]').forEach(b => b.addEventListener('click', () => {
      const mk = mine[Number(b.getAttribute('data-give'))].kind; if (mk) play(mk);
      S.fh[i] = list.filter(x => x !== pk); S.mine[pk] = 1; S.marks++; addNote(give.f, give.t, f.name, give.kind); sfx.got(); if (give.kind) setTimeout(() => play(give.kind), 500); renderMap(); burst(innerWidth / 2, innerHeight * .4, 22, 110);
      openSheet(head + '<div class="bub small l-' + f.col + '">謝謝！換你：</div><p class="narr">' + give.t + '</p><p class="murmur">這條線索記住了（' + f.name + '給的）。再去問居民，他就會說出來。交流記號 +1。</p>');
    }));
  }

  /* ═════════ [P24] 小鎮即時畫面：鏡頭跟著你的 Ping（真實版：Unity 的玩家視角串流） ═════════ */
  const CAM = { full: false, zoom: 1.9, x: ME0.x, y: ME0.y, w: 320 / 1.9, h: 290 / 1.9 };
  function camLoop() {
    requestAnimationFrame(camLoop); if (document.hidden || U.m === 1) return; const svg = $('#mapSvg'), me = $('#me'); if (!svg || !me || S.screen !== 'explore' || S.view !== 'map') return;
    let mx = S.me.x, my = S.me.y; const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(me).transform || ''); if (m) { const a = m[1].split(',').map(Number); mx = a[4]; my = a[5]; }
    const tw = CAM.full ? 320 : 320 / CAM.zoom, th = CAM.full ? 290 : 290 / CAM.zoom, tx = CAM.full ? 160 : mx, ty = CAM.full ? 145 : my;
    CAM.x += (tx - CAM.x) * .14; CAM.y += (ty - CAM.y) * .14; CAM.w += (tw - CAM.w) * .14; CAM.h += (th - CAM.h) * .14;
    const vx = Math.max(0, Math.min(320 - CAM.w, CAM.x - CAM.w / 2)), vy = Math.max(0, Math.min(290 - CAM.h, CAM.y - CAM.h / 2));
    const vb = vx.toFixed(1) + ' ' + vy.toFixed(1) + ' ' + CAM.w.toFixed(1) + ' ' + CAM.h.toFixed(1);
    if (vb === CAM.vb && Date.now() - (CAM.at || 0) < 250) return; CAM.vb = vb; CAM.at = Date.now(); svg.setAttribute('viewBox', vb);
    const ar = $('#camArr'); if (!ar) return; const t = taskNow(), n = t.id && N[t.id];
    if (CAM.full || !n) { ar.hidden = true; return; }
    const dx = n.x - (vx + CAM.w / 2), dy = n.y - (vy + CAM.h / 2), out = n.x < vx + 10 || n.x > vx + CAM.w - 10 || n.y < vy + 10 || n.y > vy + CAM.h - 10;
    if (!out) { ar.hidden = true; return; }
    const ang = Math.atan2(dy, dx), arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'], k = (Math.round(ang / (Math.PI / 4)) + 8) % 8;
    ar.hidden = false; ar.textContent = arrows[k] + ' ' + n.who; ar.style.left = (50 + Math.max(-38, Math.min(38, Math.cos(ang) * 60))) + '%'; ar.style.top = (58 + Math.max(-32, Math.min(32, Math.sin(ang) * 60))) + '%';
  }
  requestAnimationFrame(camLoop);

  buildMap();
  /* 開機：Three.js 小鎮在背後先完整長好，準備好了才放行首頁（sdx- 為開機畫面專用前綴） */
  (function () {
    if (!T3) return;
    const f = $('#uFrame'), ex = $('#s-explore'); if (!f || !ex) return;
    const cv = document.createElement('div'); cv.id = 'sdxBoot'; cv.setAttribute('role', 'status'); cv.setAttribute('aria-live', 'polite');
    cv.innerHTML = '<div class="sdx-in">' + BLIP_FLAT('sdx-ic') + '<div class="sdx-t" id="sdxT">Blip 正在布置小鎮…</div><div class="sdx-bar" aria-hidden="true"><i id="sdxB"></i></div></div>';
    document.body.appendChild(cv);
    let done = false;
    const fin = () => { if (done) return; done = true; ex.classList.remove('sdx-pre'); if (!U.m) f.hidden = true; cv.classList.add('sdx-off'); setTimeout(() => { try { cv.remove(); } catch (e) {} }, 500); };
    ex.classList.add('sdx-pre'); f.hidden = false; uLoad(f);
    window.addEventListener('message', e => {
      const d = e.data; if (!d || done) return;
      if (d.tunein === 'prog') { const p = Math.max(0, Math.min(100, +d.p || 0)); $('#sdxB').style.width = p + '%'; $('#sdxT').textContent = p >= 99 ? '快好了，再等一下…' : 'Blip 正在布置小鎮… ' + p + '%'; }
      if (d.tunein === 'ready') { try { if (NET.pid) uPid(); } catch (x) {} fin(); }
    });
    setTimeout(() => { if (!done) fin(); }, 90000);   // 已取消「先進來看看」按鈕：玩家不用選，等小鎮準備好自動進入；萬一 90 秒還沒好就自動放行，不會卡住
  })();
  $('#s-listen').innerHTML = '<div class="inner"><div class="lbar"><button class="icon-btn" id="lLeave" type="button" aria-label="離開"><svg aria-hidden="true"><use href="#i-x"/></svg></button></div>' +
    '<div class="lcenter"><div class="orbwrap" id="orbWrap"><svg class="orb" viewBox="0 0 240 240" role="img" aria-label="收聲音的進度圈"><circle class="rip" cx="120" cy="120" r="92"/><circle class="rip" cx="120" cy="120" r="92"/><circle class="rip" cx="120" cy="120" r="92"/>' +
    '<circle class="track" cx="120" cy="120" r="108"/><circle class="pa" id="pa" cx="120" cy="120" r="108" transform="rotate(-90 120 120)" style="stroke-dasharray:678.6;stroke-dashoffset:678.6"/><circle class="disc" cx="120" cy="120" r="92"/><circle class="glow" cx="120" cy="120" r="84"/><g class="orbit"><circle class="od o1" cx="120" cy="12" r="9"/><circle class="od o2" cx="228" cy="120" r="7"/><circle class="od o3" cx="120" cy="228" r="8"/><circle class="od o4" cx="12" cy="120" r="6"/></g><text class="nt n1" x="196" y="62">♪</text><text class="nt n2" x="26" y="74">♫</text><text class="nt n3" x="206" y="190">♬</text>' +
    '<g class="hearw"><path d="M60 100q-8 10 0 22"/><path d="M48 92q-14 18 0 38"/></g><g class="hearw" transform="translate(240 0) scale(-1 1)"><path d="M60 100q-8 10 0 22"/><path d="M48 92q-14 18 0 38"/></g>' +
    '<g class="ear" id="earL"></g><g class="ear" id="earR"></g><g id="orbPing" class="orbping" style="color:var(--h-flower)"><use href="#i-sprite" x="52" y="68" width="136" height="112"/></g></svg></div>' +
    '<span id="lSec" hidden>收</span><div><p id="lText">按「收」，靜靜聽 3 秒</p><p id="lSub" class="cap"></p></div><div id="lLive" class="llive" aria-live="polite"></div>' +
    '<div class="lsense"><span class="meter" id="meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="mtx"></span></div><div id="lRes" style="width:100%"></div><div id="lPads"><p class="cap padcap">示範用：點一個，當作展場小裝置的聲音</p>' + padsHTML() + '</div></div></div>' +
    '<div class="foot"><button class="btn btn-ink" id="btnDone" type="button">收</button></div>';
  $('#s-explore .proto .row').innerHTML = '<button class="btn btn-soft" id="pEnd" type="button">跳到結局</button><button class="btn btn-soft" id="pPpl" type="button">模擬人數：一個人</button><button class="btn btn-soft" id="pMic" type="button">收音和聲音測試</button><button class="btn btn-soft" id="pEm" type="button">發聲點輪替一次</button>';
  $('#jp2 .how li:nth-child(1) b').textContent = '找居民聊聊'; $('#jp2 .how li:nth-child(2) b').textContent = '收聲音'; $('#jp2 .how li:nth-child(3) b').textContent = '種花';
  var CHEX = '';
  function pnameNow() { const e = document.getElementById('pnm'); const v = e ? e.value.replace(/\s+/g, ' ').trim().slice(0, 6) : ''; return v || HUE[ME] || ''; }
  function hslHex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); const x = v => Math.round(v * 255).toString(16).padStart(2, '0'); return '#' + x(f(0)) + x(f(8)) + x(f(4)); }
  (function () {
    const sl = document.getElementById('ccH'), dp = document.getElementById('ccD'), dot = document.getElementById('ccDot'), cv = document.getElementById('pvCv'), nm = document.getElementById('pnm'); if (!sl || !dp || !dot || !cv) return;
    const PRE = { flower: [340, 50], house: [285, 50], market: [48, 50], river: [210, 50] };
    const base = () => { const h = +sl.value; return hslHex(h, Math.min(34 + 0.22 * +dp.value, (h >= 60 && h <= 170) ? 30 : 42), 82 - 0.24 * +dp.value); };   /* 馬卡龍色：飽和度上限，黃綠色再壓低，避免螢光 */
    const rgb = hx => [1, 3, 5].map(k => parseInt(hx.substr(k, 2), 16) / 255);
    const SAT = 1.05, TT = [0, 0, 0], cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;   /* 與 Unity Shader 的 _TintSat 一致 */
    const css = a => 'rgb(' + a.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',') + ')';
    const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const s = i / 255; lin[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
    const D = {}; let W = 0, H = 0, got = 0, outImg = null, ctx = cv.getContext('2d');
    const FS = 320, FC = 6, FN = 24; let FR = 0;
    /* [P05b] Ping 預覽（照 Unity Blip/SoftToon）：idle_albedo.png＝Ping_Color_Pink 貼圖（24 格 6×4）；idle_ctl.png＝R 明暗(half-lambert)／G Tone Map／B Tint Mask。
       染色＝Tone Amount 1：身體依 Tone Map 在淺色與深色間分布（TintMask 以外的眼睛、鞋底保持原貼圖）；明暗＝smoothstep(閾值±柔邊)＋藍紫陰影，參數見 SOFT */
    const SOFT = { thr: .535, soft: .2, shadow: [.6003, .6665, .7987], amb: .04, sat: 1.6, light: .94 };
    const sstep = (a, b, x) => { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
    const s2l = lin, enc = new Uint8ClampedArray(4096); for (let i = 0; i < 4096; i++) { const l = i / 4095; enc[i] = (l <= .0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - .055) * 255 + .5; }
    const draw = hx => {
      if (got < 2) return; const ox = (FR % FC) * FS, oy = ((FR / FC) | 0) * FS, cc = rgb(hx), A = D.albedo, K = D.ctl, o = outImg.data;
      const LC = cc.map(v => 1 + (v - 1) * .4), DC = cc.map(v => v * v * .85), S = SOFT;
      for (let q = 0; q < FS * FS; q++) {
        const i = (((oy + ((q / FS) | 0)) * W) + ox + (q % FS)) * 4, j = q * 4, al = A[i + 3]; if (al === 0) { o[j + 3] = 0; continue; }
        const tone = cl01(.82 + (s2l[K[i + 1]] - .68) * 2.2), mk = K[i + 2] / 255, lit = sstep(S.thr - S.soft, S.thr + S.soft, K[i] / 255);
        let t0 = LC[0] * tone + DC[0] * (1 - tone), t1 = LC[1] * tone + DC[1] * (1 - tone), t2 = LC[2] * tone + DC[2] * (1 - tone);
        const tl = .299 * t0 + .587 * t1 + .114 * t2; t0 = cl01(tl + (t0 - tl) * S.sat); t1 = cl01(tl + (t1 - tl) * S.sat); t2 = cl01(tl + (t2 - tl) * S.sat);
        const e = [A[i], A[i + 1], A[i + 2]], tn = [t0, t1, t2];
        for (let c = 0; c < 3; c++) {
          const tx = s2l[e[c]], al2 = tx + (s2l[Math.round(tn[c] * 255)] - tx) * mk;                 /* 染色後的反照率（線性） */
          const df = (al2 * S.shadow[c] + (al2 - al2 * S.shadow[c]) * lit) * S.light + al2 * S.amb;   /* 陰影藍紫＋環境光 */
          o[j + c] = enc[Math.min(4095, Math.round(df * 4095))];
        }
        o[j + 3] = al;
      }
      ctx.putImageData(outImg, 0, 0);
    };
    ['albedo', 'ctl'].forEach(n => { const im = new Image(); im.onload = () => { const c2 = document.createElement('canvas'); c2.width = im.width; c2.height = im.height; const x = c2.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); D[n] = x.getImageData(0, 0, im.width, im.height).data; W = im.width; H = im.height; if (++got === 2) { cv.width = FS; cv.height = FS; outImg = ctx.createImageData(FS, FS); draw(CHEX || base()); } }; im.src = 'idle_' + n + '.png?v=6'; });
    const paint = hx => { const L = rgb(hx).map(v => 1 + (v - 1) * 0.4), Dk = rgb(hx).map(v => v * v * 0.85); dot.style.background = 'linear-gradient(90deg,' + css(L) + ',' + css(rgb(hx)) + ',' + css(Dk) + ')'; dp.style.background = 'linear-gradient(90deg,' + hslHex(+sl.value, 34, 82) + ',' + hslHex(+sl.value, 56, 58) + ')'; draw(hx); try { cv.parentNode.style.setProperty('--pc', hx); } catch (e) {} };
    const post = () => { saveProf(); if (typeof NET !== 'undefined' && NET.joined) netPost('/join', { pid: NET.pid, col: ME, name: pnameNow(), hex: CHEX }); };
    { let lt0 = 0; const RM = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches; const loop = t => { if (got >= 2 && !RM && t - lt0 >= 83 && !document.hidden) { const jp = document.getElementById('jp2'); if (jp && !jp.hidden) { lt0 = t; FR = (FR + 1) % FN; draw(CHEX || base()); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
    const send = () => { CHEX = base(); paint(CHEX); post(); };
    const PK = 'tunein.prof';   /* 重新整理也記得：顏色、深淺、名字 */
    try { const pf = JSON.parse(localStorage.getItem(PK) || 'null'); if (pf) { if (isFinite(pf.h)) sl.value = pf.h; if (isFinite(pf.d)) dp.value = pf.d; if (nm && pf.n) nm.value = String(pf.n).slice(0, 12); } } catch (e) {}
    const saveProf = () => { try { localStorage.setItem(PK, JSON.stringify({ h: +sl.value, d: +dp.value, n: nm ? nm.value.slice(0, 12) : '' })); } catch (e) {} };
    CHEX = base(); paint(CHEX);
    const free = () => { send(); };
    sl.addEventListener('input', free); dp.addEventListener('input', free);
    if (nm) { let ntm = 0; nm.addEventListener('change', post); nm.addEventListener('input', () => { clearTimeout(ntm); ntm = setTimeout(post, 350); }); }   // 打字停下就同步名字，不用等離開輸入框
    { const jb = document.getElementById('btnJoin'); if (jb) jb.addEventListener('click', post); }   // 按「開始」再送一次，確保 Unity 用的是最後的名字
  })();
  /* 全域按鈕回饋：按下就有「啵」一聲＋幾顆小泡泡（方向鍵不加，避免連按太吵） */
  document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('button, .btn, .tkb, .dk, [role="button"]'); if (!b || b.disabled || b.closest('#dpad')) return; try { ensureAudio(); sfx.pop(); burst(e.clientX, e.clientY, 6, 46); } catch (err) {} }, { passive: true });
  $('#btnNext').addEventListener('click', () => { S.introDone = true; joinPage(2); });
  $('#btnPrev').addEventListener('click', () => joinPage(1));
  $('#consent').addEventListener('change', function () { $('#btnJoin').disabled = !this.checked; $('#joinHint').textContent = this.checked ? '約 6 分鐘，錄音展後刪除' : '約 6 分鐘，錄音展後刪除'; });
  $('#btnJoin').addEventListener('click', () => { ensureAudio(); sfx.tap(); startRound(); });   // 說明只留一套：進小鎮後的場景教學（P30）
  $('#btnSkip').addEventListener('click', () => { ensureAudio(); S.taught = true; startRound(); });
  $('#pMic').addEventListener('click', () => openMic('explore'));
  $('#pEnd').addEventListener('click', openSettle);
  $('#pPpl').addEventListener('click', function () { S.players = S.players > 1 ? 1 : 3; this.textContent = '模擬人數：' + (S.players > 1 ? '有人一起' : '一個人'); toast(S.players > 1 ? '奶奶要等小葵 Ping 一起疊。' : '一個人也能叫醒奶奶。'); });
  $('#pEm').addEventListener('click', () => { EM.forEach(e => { e.until = 0; }); emTick(); toast('發聲點換了一輪。'); });
  $('#btnMain').addEventListener('click', () => { ensureAudio(); if (S.screen === 'cards') { if (!S.cards.length) { show('explore'); return; } openSheet('<div class="sh-h"><span></span><div><h2>帶回家聽</h2></div>' + CLOSE + '</div><p>展覽結束後，會給你一個連結，可以帶回家聽，也可以刪掉。</p>'); return; } if (S.cards.length >= POCKET) { toast('口袋滿了（' + POCKET + ' 顆）。先去種下一顆，再回來聽。', 'warn', 4000); return; } openCollect(); });
  $('#btnCards').addEventListener('click', () => show('cards'));
  $('#btnBack').addEventListener('click', () => show('explore'));
  $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) closeSheet(); });
  $('#stCards').addEventListener('click', showLeave);
  $('#lvAgain').addEventListener('click', playAgain);
  $('#lvHome').addEventListener('click', () => openSheet('<div class="sh-h"><span></span><div><h2>帶回家聽</h2></div>' + CLOSE + '</div><p>展覽結束後，會給你一個連結，可以帶回家聽，也可以刪掉。</p>'));
  $('#lLeave').addEventListener('click', () => { if (L.busy) return; stopLive(); S.pend = null; show('explore'); });
  $('#btnDone').addEventListener('click', () => { if (S.pend) keepCard(); else confirmLive(); });
  { const b = $('#btnDone'); b.addEventListener('contextmenu', e => e.preventDefault()); }   // 11/14：改回「靠近→安靜→變清楚→收」，不再按住錄音
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-pad]'); if (!p) return; ensureAudio(); A.init();
    if (S.screen === 'listen' && LV.on && A.mode === 'demo') { loopPlay(p.getAttribute('data-pad')); return; }
    play(p.getAttribute('data-pad'));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  window.TuneApp = { S, A, N, TH, get EM() { return EM; }, NET, FRM, openSwap, assignSlots, openRes, emTick, emInit, srcOn, pickCur, FR, openSettle, renderMap, show, startRound };
  setInterval(() => { if (!document.hidden) tickRound(); }, 500); setInterval(() => { if (!NET.on && !document.hidden) emTick(); }, 1000); setInterval(() => { if (U.m !== 1 && !document.hidden) opWander(); }, 4200);   // 連上 Unity 後，示範用的模擬（發聲點、訪客亂走）全部停掉
  setInterval(() => { const n = $('#npc0'); if (!n || S.screen !== 'explore' || U.m === 1 || document.hidden) return; const m = N[MAIN[Math.floor(Math.random() * 4)]]; n.style.transition = 'transform 3s ease'; n.style.transform = 'translate(' + (m.x + (m.x > 200 ? -36 : 36)) + 'px,' + (m.y + 2) + 'px)'; }, 4500);
  show('join');
})();

/* [P36] 背景預載小鎮素材：玩家在選角、說明頁停留時，Service Worker 先把模型／貼圖／草點抓到手機裡，按「進小鎮」時直接讀快取（原本要等 13 MB 才開得了） */
(function () {
  try {
    if (!('serviceWorker' in navigator) || (navigator.connection && navigator.connection.saveData)) return;
    var L = ['vendor/three.module.min.js', 'models/ping.glb', 'models/tex_ping_base.webp', 'models/tex_ping_tone.webp', 'models/tex_ping_mask.webp', 'models/tex_ping_pink.webp', 'models/tex_ping_blue.webp', 'models/tex_ping_green.webp',
      'models/blip.glb', 'models/tex_blip.webp', 'models/rowan.glb', 'models/tex_rowan.webp', 'models/tree.glb', 'models/tex_tree.webp', 'models/tex_treeleaf.webp', 'models/bush.glb', 'models/tex_bush.webp', 'models/conifer.glb', 'models/tex_conifer.webp', 'models/flower.glb', 'models/tex_flower.webp',
      'models/mouse.glb', 'models/tex_mouse.webp', 'models/bird1.glb', 'models/tex_bird1.webp', 'models/bird2.glb', 'models/tex_bird2.webp', 'models/bench.glb', 'models/stone.glb', 'grass_points.bin', 'models/shop.glb', 'models/tex_shop.webp', 'models/cheese.glb', 'models/tex_cheese.webp'];
    var i = 0, run = function () { if (i >= L.length) return; var u = L[i++]; fetch(u, { priority: 'low' }).then(function (r) { return r.arrayBuffer(); }).catch(function () {}).then(run); };
    var go = function () { run(); run(); };   // 同時 2 條，不搶畫面本身的頻寬
    var start = function () { navigator.serviceWorker.ready.then(function () { setTimeout(go, 1500); }).catch(function () {}); };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  } catch (e) {}
})();
