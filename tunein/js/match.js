/* MT_TRIAL 比對核心 */
/* 聲音片段比對核心（瀏覽器與 Node 共用）
   輸入：16 kHz 單聲道 Float32Array。輸出：每個範本的分數 0~1。 */
(function (root) {
  const SR = 16000, N = 512, HOP = 320;           // 32 ms 視窗、20 ms 步進（50 fps）
  const NB = 14, FLO = 250, FHI = 7600;            // 14 個對數頻段（小喇叭推不出 250 Hz 以下）
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const edges = []; for (let b = 0; b <= NB; b++) edges.push(FLO * Math.pow(FHI / FLO, b / NB));
  const binOf = f => Math.max(1, Math.min(N / 2 - 1, Math.round(f * N / SR)));
  const bandBins = []; for (let b = 0; b < NB; b++) { const a = binOf(edges[b]), c = Math.max(a + 1, binOf(edges[b + 1])); bandBins.push([a, c]); }
  // 預先算 DFT 表（只算需要的頻點，避免寫完整 FFT）
  const need = new Set(); bandBins.forEach(([a, c]) => { for (let k = a; k < c; k++) need.add(k); });
  const ks = [...need].sort((x, y) => x - y);
  const cosT = ks.map(k => { const r = new Float32Array(N); for (let n = 0; n < N; n++) r[n] = Math.cos(2 * Math.PI * k * n / N) * win[n]; return r; });
  const sinT = ks.map(k => { const r = new Float32Array(N); for (let n = 0; n < N; n++) r[n] = Math.sin(2 * Math.PI * k * n / N) * win[n]; return r; });
  const kIdx = new Map(ks.map((k, i) => [k, i]));

  // 每個影格 NB 維的對數能量
  function features(x) {
    const T = Math.max(0, Math.floor((x.length - N) / HOP) + 1), F = [];
    for (let t = 0; t < T; t++) {
      const o = t * HOP, row = new Float32Array(NB), pw = new Float32Array(ks.length);
      for (let j = 0; j < ks.length; j++) { let re = 0, im = 0; const c = cosT[j], s = sinT[j]; for (let n = 0; n < N; n++) { const v = x[o + n]; re += v * c[n]; im += v * s[n]; } pw[j] = re * re + im * im; }
      for (let b = 0; b < NB; b++) { let e = 0; const [a, c] = bandBins[b]; for (let k = a; k < c; k++) e += pw[kIdx.get(k)]; row[b] = e / (c - a); }
      F.push(row);
    }
    return F;
  }
  // 範本：特徵 + 平均頻譜形狀（扣掉整體音量）
  const lg = E => E.map(r => { const o = new Float32Array(NB); for (let b = 0; b < NB; b++) o[b] = Math.log(r[b] + 1e-7); return o; });
  function makeTemplate(x) {
    const F = lg(features(x)); const prof = new Float32Array(NB);
    let cnt = 0; for (const r of F) { let m = 0; for (let b = 0; b < NB; b++) m += r[b]; m /= NB; if (m > -12) { for (let b = 0; b < NB; b++) prof[b] += r[b] - m; cnt++; } }
    if (cnt) for (let b = 0; b < NB; b++) prof[b] /= cnt;
    return { F, prof };
  }
  const corr = (a, b) => { let ma = 0, mb = 0; const n = a.length; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; } return saa > 1e-9 && sbb > 1e-9 ? sab / Math.sqrt(saa * sbb) : 0; };
  // 查詢：整體頻譜形狀相似度（對喇叭/房間的固定上色有一定容忍：先各自扣平均，再比相關）
  function query(x, templates) {
    const E = features(x); const T = E.length; if (T < 40) return { scores: {}, level: -99, ok: false };
    // 頻譜減法：每個頻段取最安靜 20% 影格當環境底噪，從能量中扣掉
    const nf = new Float32Array(NB);
    for (let b = 0; b < NB; b++) { const col = E.map(r => r[b]).sort((p, q) => p - q); nf[b] = col[Math.floor(T * 0.2)]; }
    const Q = lg(E.map(r => { const o = new Float32Array(NB); for (let b = 0; b < NB; b++) o[b] = Math.max(r[b] - nf[b] * 1.0, nf[b] * 0.03); return o; }));
    const prof = new Float32Array(NB); let cnt = 0, lvl = [];
    for (const r of Q) { let m = 0; for (let b = 0; b < NB; b++) m += r[b]; m /= NB; lvl.push(m); }
    // 取音量最高的 50% 影格（排除範本中的空白間隔）算頻譜形狀
    const sorted = lvl.slice().sort((a, b) => a - b), thr = sorted[Math.floor(sorted.length * 0.5)];
    for (let t = 0; t < T; t++) if (lvl[t] >= thr) { for (let b = 0; b < NB; b++) prof[b] += Q[t][b] - lvl[t]; cnt++; }
    for (let b = 0; b < NB; b++) prof[b] /= cnt;
    const dyn = sorted[Math.floor(sorted.length * 0.95)] - sorted[Math.floor(sorted.length * 0.05)]; // 動態範圍（有沒有東西在響）
    const scores = {};
    for (const id in templates) {
      const tp = templates[id];
      const spec = corr(prof, tp.prof);                                   // 頻譜形狀
      // 時間包絡：在循環播放的範本上找最佳對齊
      const L = tp.F.length, W = Math.min(T, 100);                        // 用查詢中間 2 秒
      const q0 = Math.floor((T - W) / 2); const qa = new Float32Array(W);
      for (let t = 0; t < W; t++) qa[t] = lvl[q0 + t];
      let best = -1; const tl = new Float32Array(L);
      for (let t = 0; t < L; t++) { let m = 0; for (let b = 0; b < NB; b++) m += tp.F[t][b]; tl[t] = m / NB; }
      const tb = new Float32Array(W);
      for (let lag = 0; lag < L; lag += 2) { for (let t = 0; t < W; t++) tb[t] = tl[(lag + t) % L]; const c = corr(qa, tb); if (c > best) best = c; }
      scores[id] = { spec, env: best, score: 0.7 * Math.max(0, spec) + 0.3 * Math.max(0, best) };
    }
    return { scores, dyn, level: sorted[Math.floor(sorted.length * 0.95)], ok: true };
  }
  function decide(res, opt) {
    opt = Object.assign({ minScore: 0.55, minMargin: 0.08, minDyn: 0 }, opt || {});
    if (!res.ok || res.dyn < opt.minDyn) return { label: null, why: '太安靜或沒聲音' };
    const arr = Object.entries(res.scores).map(([id, s]) => [id, s.score]).sort((a, b) => b[1] - a[1]);
    const [id, s] = arr[0], second = arr[1] ? arr[1][1] : 0;
    if (s < opt.minScore) return { label: null, why: '分數太低', best: id, s };
    if (s - second < opt.minMargin) return { label: null, why: '兩個太像', best: id, s };
    return { label: id, s };
  }
  const api = { SR, features, makeTemplate, query, decide };
  if (typeof module !== 'undefined') module.exports = api; else root.SoundMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
