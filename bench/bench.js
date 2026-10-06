'use strict';
// Bench Zero — WebGL2 device limits lab. Single-page, no dependencies.
// Canvas renders the current workload; rAF frame deltas feed the stats.

const VERSION = '0.1.0';
const $ = s => document.querySelector(s);

const SWEEP_TIERS = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000];
const FILL_TIERS  = [1, 2, 4, 8, 16, 32, 64];
const WARMUP_MS = 1200;
const MEASURE_MS = 3000;
// uFill: fraction of screen area covered by triangles in total (keeps fill cost
// roughly constant across tiers so the sweep isolates vertex throughput).
const TRI_FILL_FRACTION = 1.3;

const canvas = $('#glcanvas');
const statusEl = $('#status');
const resultsEl = $('#results');
let gl = null;

const results = { meta: null, sweep: null, fill: null, sustain: null };

// ---------- shaders ----------

const TRI_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;           // (0,0) (1,0) (0,1)
uniform vec2 uViewport;                      // backing-store pixels
uniform float uTime;
uniform float uCount;
uniform float uFill;                         // total triangle area / screen area
out vec3 vColor;
float hash(float n){ return fract(sin(n)*43758.5453123); }
void main(){
  float id = float(gl_InstanceID);
  // Wrap hash inputs so GPU sin() sees small arguments (precision degrades badly
  // on fp32 sin of ~1e7 on mobile GPUs).
  float sid = mod(id, 4096.0);
  float kc = mod(uCount, 997.0);
  float aspect = uViewport.x / uViewport.y;
  // Disc-distributed centers in world space x=[-a,a], y=[-1,1]
  vec2 c = vec2((hash(sid*1.618 + kc*0.731)*2.0-1.0)*aspect,
                (hash(sid*2.718 + kc*1.37 )*2.0-1.0));
  // Equilateral side so N triangles cover uFill * screen area
  float side = sqrt(uFill*16.0*aspect / (1.7320508*max(uCount,1.0)));
  float spin = uTime*(0.25 + 0.75*hash(sid*3.14 + kc*0.77));
  float cs = cos(spin), sn = sin(spin);
  vec2 l = (corner*2.0-1.0)*side*0.5;
  vec2 lp = vec2(l.x*cs - l.y*sn, l.x*sn + l.y*cs);
  // Slow global drift so no frame is identical to the last
  vec2 wob = vec2(sin(uTime*0.7 + sid*0.0001), cos(uTime*0.9 + sid*0.00013))*0.03;
  gl_Position = vec4(c + wob + lp, 0.0, 1.0);
  vColor = 0.55 + 0.45*cos(sid*0.13 + vec3(0.0, 2.1, 4.2) + uTime*0.15);
}`;

const TRI_FS = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 frag;
void main(){ frag = vec4(vColor, 1.0); }`;

// Fullscreen quad, one blended layer per instance.
const FILL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;           // [-1,1] quad, TRIANGLE_STRIP
uniform float uCount;
out vec3 vColor;
void main(){
  gl_Position = vec4(corner, 0.0, 1.0);
  float id = float(gl_InstanceID) / max(uCount, 1.0);
  vColor = vec3(0.10+0.30*id, 0.20+0.40*fract(id*3.0), 0.30+0.50*fract(id*7.0));
}`;

const FILL_FS = `#version 300 es
precision mediump float;
in vec3 vColor;
uniform float uAlpha;
out vec4 frag;
void main(){ frag = vec4(vColor, uAlpha); }`;

// ---------- gl setup ----------

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function program(vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

let tri = null, fill = null;

function initGL() {
  gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  tri = {};
  tri.prog = program(TRI_VS, TRI_FS);
  tri.uViewport = gl.getUniformLocation(tri.prog, 'uViewport');
  tri.uTime = gl.getUniformLocation(tri.prog, 'uTime');
  tri.uCount = gl.getUniformLocation(tri.prog, 'uCount');
  tri.uFill = gl.getUniformLocation(tri.prog, 'uFill');
  tri.vao = gl.createVertexArray();
  gl.bindVertexArray(tri.vao);
  const triCorners = new Float32Array([0, 0, 1, 0, 0, 1]);
  tri.buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri.buf);
  gl.bufferData(gl.ARRAY_BUFFER, triCorners, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  fill = {};
  fill.prog = program(FILL_VS, FILL_FS);
  fill.uCount = gl.getUniformLocation(fill.prog, 'uCount');
  fill.uAlpha = gl.getUniformLocation(fill.prog, 'uAlpha');
  fill.vao = gl.createVertexArray();
  gl.bindVertexArray(fill.vao);
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  fill.buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fill.buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    fatal('WebGL context lost (device reclaimed memory). Reload the page and try a smaller custom load.');
  });
}

let dpr = Math.min(window.devicePixelRatio || 1, 3);
let resScale = 1.0;

function resize() {
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr * resScale));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr * resScale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}
window.addEventListener('resize', resize);

// ---------- rendering ----------

// Which workload draw() renders. Triangle tests set triCount; fill test sets fillLayers.
let mode = 'idle';
let triCount = 0;
let fillLayers = 0;

function draw(t) {
  resize();
  if (mode === 'tri') {
    gl.disable(gl.BLEND);
    gl.useProgram(tri.prog);
    gl.bindVertexArray(tri.vao);
    gl.uniform2f(tri.uViewport, canvas.width, canvas.height);
    gl.uniform1f(tri.uTime, t);
    gl.uniform1f(tri.uCount, triCount);
    gl.uniform1f(tri.uFill, TRI_FILL_FRACTION);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, triCount);
  } else if (mode === 'fill') {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(fill.prog);
    gl.bindVertexArray(fill.vao);
    gl.uniform1f(fill.uCount, fillLayers);
    gl.uniform1f(fill.uAlpha, 0.06);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fillLayers);
    gl.disable(gl.BLEND);
  } else {
    gl.clearColor(0.05, 0.07, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

// ---------- timing ----------

function computeStats(dts, durMs) {
  // dts excludes frames with dt>200ms (tab switches / tier-switch hitches).
  const sorted = [...dts].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const pct = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return {
    frames: sorted.length,
    durSec: +(durMs / 1000).toFixed(2),
    meanMs: sorted.length ? +(sum / sorted.length).toFixed(3) : 0,
    p50: +pct(0.50).toFixed(3),
    p95: +pct(0.95).toFixed(3),
    p99: +pct(0.99).toFixed(3),
    maxMs: sorted.length ? +sorted[sorted.length - 1].toFixed(3) : 0,
    fps: sorted.length ? +(1000 * sorted.length / sum).toFixed(1) : 0,
    fpsLow: pct(0.99) > 0 ? +(1000 / pct(0.99)).toFixed(1) : 0,
  };
}

// Runs the rAF loop for `duration` of wall-clock time, returns stats.
function measure(duration) {
  return new Promise(resolve => {
    const dts = [];
    let last = performance.now();
    const start = last;
    let collected = 0;
    function step(t) {
      let dt = t - last;
      last = t;
      if (dt > 200) dt = 34; // tab-switch / hiccup outlier: clamp, don't count real cost
      dts.push(dt);
      collected += dt;
      draw(t / 1000);
      if (collected >= duration) { resolve(computeStats(dts, collected)); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function warmup(ms) {
  await measure(ms);
}

// ---------- UI helpers ----------

function status(msg) { statusEl.textContent = msg; }

function fatal(msg) {
  status('');
  resultsEl.insertAdjacentHTML('afterbegin',
    `<p class="bad">Error: ${msg}</p>`);
}

function metaLine() {
  const m = results.meta;
  return `<p class="kv">${m.gpu} · canvas ${m.canvasW}×${m.canvasH} · dpr ${m.dpr} · scale ${m.scale} · ${m.ua}</p>`;
}

function fmtInt(n) { return n.toLocaleString('en-US'); }

function sweepTable(rows) {
  let h = '<table><tr><th>Triangles</th><th>FPS</th><th>1% low</th><th>mean ms</th><th>p95 ms</th><th>p99 ms</th><th>MT/s</th></tr>';
  for (const r of rows) {
    const cls = r.p95 <= 16.7 ? 'good' : (r.p95 <= 33.4 ? 'warn' : 'bad');
    h += `<tr><td>${fmtInt(r.triangles)}</td><td>${r.fps}</td><td>${r.fpsLow}</td><td>${r.meanMs}</td><td class="${cls}">${r.p95}</td><td>${r.p99}</td><td>${(r.triangles / 1e6 * r.fps / 1000).toFixed(1)}</td></tr>`;
  }
  return h + '</table>';
}

function fillTable(rows) {
  let h = '<table><tr><th>Fullscreen layers</th><th>FPS</th><th>1% low</th><th>p95 ms</th><th>GPix/s</th></tr>';
  const px = results.meta.canvasW * results.meta.canvasH;
  for (const r of rows) {
    const cls = r.p95 <= 16.7 ? 'good' : (r.p95 <= 33.4 ? 'warn' : 'bad');
    h += `<tr><td>${r.layers}</td><td>${r.fps}</td><td>${r.fpsLow}</td><td class="${cls}">${r.p95}</td><td>${(px * r.layers * r.fps / 1e9).toFixed(2)}</td></tr>`;
  }
  return h + '</table>';
}

function sustainTable(s) {
  return `<table>
    <tr><th>Load (tris)</th><th>Duration</th><th>FPS @ start</th><th>FPS @ end</th><th>Min FPS</th><th>Decay</th></tr>
    <tr><td>${fmtInt(s.load)}</td><td>${s.durSec}s</td><td>${s.firstFps}</td><td>${s.lastFps}</td><td>${s.minFps}</td><td class="${s.decayPct > 15 ? 'bad' : (s.decayPct > 5 ? 'warn' : 'good')}">${s.decayPct}%</td></tr>
  </table>`;
}

// ---------- tests ----------

async function runSweep() {
  mode = 'tri';
  const rows = [];
  let max60 = null, max30 = null;
  const custom = parseInt($('#customLoad').value, 10) || 0;
  const tiers = custom > 0 ? [...SWEEP_TIERS, custom].sort((a, b) => a - b) : SWEEP_TIERS;
  for (const n of tiers) {
    triCount = n;
    status(`Triangle sweep: ${fmtInt(n)} tris — warming up…`);
    await warmup(WARMUP_MS);
    status(`Triangle sweep: ${fmtInt(n)} tris — measuring…`);
    const st = await measure(MEASURE_MS);
    rows.push({ triangles: n, ...st });
    results.sweep = { rows, maxAt60: max60, maxAt30: max30 };
    if (st.p95 <= 16.7) max60 = n;
    if (st.p95 <= 33.4) max30 = n;
    results.sweep.maxAt60 = max60; results.sweep.maxAt30 = max30;
    renderResults();
    if (st.p95 > 20.0 && custom <= 0) break; // well below 60 fps; further tiers moot
  }
  status(`Triangle sweep done — max tier holding p95 ≤ 16.7 ms: ${max60 ? fmtInt(max60) + ' tris' : 'none'}`);
}

async function runFill() {
  mode = 'fill';
  const rows = [];
  for (const layers of FILL_TIERS) {
    fillLayers = layers;
    status(`Fill-rate sweep: ${layers} fullscreen layer${layers > 1 ? 's' : ''} — warming up…`);
    await warmup(WARMUP_MS);
    status(`Fill-rate sweep: ${layers} fullscreen layer${layers > 1 ? 's' : ''} — measuring…`);
    const st = await measure(MEASURE_MS);
    rows.push({ layers, ...st });
    results.fill = { rows };
    renderResults();
    if (st.p95 > 25.0) break;
  }
  const best = rows[rows.length - 1];
  const px = results.meta.canvasW * results.meta.canvasH;
  status(`Fill-rate done — peak ${(px * best.layers * best.fps / 1e9).toFixed(2)} GPix/s blended at ${best.layers} layers`);
}

async function runSustain() {
  const custom = parseInt($('#customLoad').value, 10);
  const defaultLoad = (results.sweep && results.sweep.maxAt60)
    ? Math.round(results.sweep.maxAt60 * 0.6) : 500_000;
  const load = custom > 0 ? custom : defaultLoad;
  const durSec = parseInt($('#sustainDur').value, 10);
  mode = 'tri';
  triCount = load;
  const samples = [];
  const start = performance.now();
  await warmup(WARMUP_MS);
  status(`Sustained load: ${fmtInt(load)} tris for ${durSec}s — watch FPS decay (thermal throttling)`);
  while ((performance.now() - start) / 1000 < durSec) {
    const st = await measure(2000);
    samples.push({ t: +((performance.now() - start) / 1000).toFixed(1), fps: st.fps, p95: st.p95 });
    drawSpark(samples);
    status(`Sustained load: ${Math.round((performance.now() - start) / 1000)}/${durSec}s — last window ${st.fps} fps`);
  }
  const fpses = samples.map(s => s.fps);
  const first = fpses[0], last = fpses[fpses.length - 1];
  const decayPct = +(((first - last) / first) * 100).toFixed(1);
  results.sustain = {
    load, durSec,
    firstFps: first, lastFps: last,
    minFps: Math.min(...fpses),
    decayPct,
    samples,
  };
  renderResults();
  status(`Sustained load done — ${first} → ${last} fps (${decayPct}% decay). That decay is thermal throttling.`);
}

async function runAll() {
  setButtons(false);
  try {
    await runSweep(); await sleep(400);
    await runFill(); await sleep(400);
    await runSustain();
  } catch (e) { fatal(e.message); }
  mode = 'idle';
  setButtons(true);
}

// ---------- sparkline ----------

function drawSpark(samples) {
  const c = $('#spark');
  c.style.display = 'block';
  const dpr2 = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth * dpr2, h = c.clientHeight * dpr2;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (samples.length < 2) return;
  const min = Math.min(...samples.map(s => s.fps)) * 0.9;
  const max = Math.max(...samples.map(s => s.fps)) * 1.05;
  ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 2 * dpr2;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const x = s.t / samples[samples.length - 1].t * (w - 10) + 5;
    const y = h - 5 - (s.fps - min) / (max - min) * (h - 10);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#8b949e';
  ctx.font = `${11 * dpr2}px monospace`;
  ctx.fillText(`${Math.round(max)} fps`, 6, 14 * dpr2);
  ctx.fillText(`${Math.round(min)} fps`, 6, h - 6);
}

// ---------- results & export ----------

function renderResults() {
  let h = metaLine();
  if (results.sweep) {
    h += `<h2>Triangle sweep</h2>`;
    h += `<p class="kv">Max holding 60 fps (p95 ≤ 16.7 ms): <span class="good">${results.sweep.maxAt60 ? fmtInt(results.sweep.maxAt60) + ' tris' : '—'}</span>
          · Max holding 30 fps (p95 ≤ 33.4 ms): <span class="warn">${results.sweep.maxAt30 ? fmtInt(results.sweep.maxAt30) + ' tris' : '—'}</span></p>`;
    h += sweepTable(results.sweep.rows);
  }
  if (results.fill) {
    h += `<h2>Fill-rate sweep</h2>` + fillTable(results.fill.rows);
  }
  if (results.sustain) {
    h += `<h2>Sustained load (thermal)</h2>` + sustainTable(results.sustain);
  }
  resultsEl.innerHTML = h;
}

function exportJSON() {
  if (!results.meta) return;
  return JSON.stringify({ version: VERSION, ...results }, null, 1);
}

function setButtons(on) {
  for (const id of ['btnSweep', 'btnFill', 'btnSustain', 'btnAll', 'btnCompare']) {
    $(`#${id}`).disabled = !on;
  }
}

// ---------- compare ----------

function pick(o, path) { return path.split('.').reduce((v, k) => v && v[k], o); }

function compare() {
  let a, b;
  try { a = JSON.parse($('#cmpA').value); b = JSON.parse($('#cmpB').value); }
  catch { $('#cmpOut').innerHTML = '<p class="bad">Could not parse both JSON blobs.</p>'; return; }
  const row = (label, pa, pb, f) => {
    const fa = f(pick(a, pa)), fb = f(pick(b, pb));
    return `<tr><td>${label}</td><td>${fa}</td><td>${fb}</td></tr>`;
  };
  const fmtT = v => v == null ? '—' : fmtInt(v);
  $('#cmpOut').innerHTML = `<h2>Side by side</h2><table>
    <tr><th>Metric</th><th>Device A</th><th>Device B</th></tr>
    ${row('GPU', 'meta.gpu', 'meta.gpu', v => v)}
    ${row('Max tris @60', 'sweep.maxAt60', 'sweep.maxAt60', fmtT)}
    ${row('Max tris @30', 'sweep.maxAt30', 'sweep.maxAt30', fmtT)}
    ${row('Sustain decay %', 'sustain.decayPct', 'sustain.decayPct', v => v == null ? '—' : v + '%')}
    ${row('Sustain start→end fps', 'sustain.firstFps', 'sustain.firstFps', v => v == null ? '—' : v)}
  </table>`;
  // fill-rate peak needs px; recompute from meta
  const gp = (r) => {
    if (!r.fill || !r.fill.rows || !r.meta) return '—';
    const best = r.fill.rows[r.fill.rows.length - 1];
    const px = r.meta.canvasW * r.meta.canvasH;
    return (px * best.layers * best.fps / 1e9).toFixed(2) + ' GPix/s';
  };
  $('#cmpOut table').insertAdjacentHTML('beforeend',
    `<tr><td>Peak blended fill-rate</td><td>${gp(a)}</td><td>${gp(b)}</td></tr>`);
}

// ---------- boot ----------

function collectMeta() {
  let gpu = 'unknown';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  else gpu = String(gl.getParameter(gl.RENDERER));
  results.meta = {
    gpu,
    canvasW: canvas.width, canvasH: canvas.height,
    dpr, scale: resScale,
    screen: `${window.screen.width}×${window.screen.height}`,
    ua: navigator.userAgent.replace(/^Mozilla\/5\.0 \(([^)]+)\).*$/, '$1'),
    date: new Date().toISOString(),
  };
}

let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }
}

async function guarded(fn) {
  setButtons(false);
  if (!results.meta) collectMeta();
  await requestWakeLock();
  try { await fn(); }
  catch (e) { fatal(e.message); console.error(e); }
  if (mode !== 'tri') mode = 'idle'; // leave last workload visible
  setButtons(true);
}

function bind() {
  $('#btnSweep').onclick = () => guarded(runSweep);
  $('#btnFill').onclick = () => guarded(runFill);
  $('#btnSustain').onclick = () => guarded(runSustain);
  $('#btnAll').onclick = () => guarded(runAll);
  $('#resScale').onchange = e => { resScale = parseFloat(e.target.value); resize(); if (!results.meta) collectMeta(); else { results.meta.canvasW = canvas.width; results.meta.canvasH = canvas.height; results.meta.scale = resScale; renderResults(); } };
  $('#btnDownload').onclick = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bench-zero-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#btnCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(exportJSON()); status('JSON copied to clipboard'); }
    catch { fatal('Clipboard blocked — use Download JSON instead'); }
  };
  $('#btnCompare').onclick = compare;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock === null) requestWakeLock();
  });
}

try {
  initGL();
  resize();
  bind();
  collectMeta();
  renderResults();
  status('Ready — start with "Run all" (~5 min), or one test at a time.');
} catch (e) {
  document.body.innerHTML = `<p style="padding:2rem">Bench Zero needs WebGL2: ${e.message}</p>`;
}
