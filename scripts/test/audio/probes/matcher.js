(async function(){
  var ar = window.audioReactive, AT = window.AudioTiming, CE = window.AudioCueEditor;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var out = {};
  var sr = 22050, secs = 16, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
  var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
  // band-limited noise for the snare: a crude 2-pole resonator around 1.2 kHz
  var y1 = 0, y2 = 0, fr = 2 * Math.PI * 1200 / sr, rr = 0.97, a1 = 2 * rr * Math.cos(fr), a2 = -rr * rr;
  var snareTimes = [];
  for (var k = 0; k < 16; k++) snareTimes.push(0.75 + k * 1.0);
  for (var i = 0; i < n; i++) {
    var t = i / sr;
    var ph = t % 0.5, kick = (ph < 0.12 ? Math.exp(-ph * 30) : 0) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-ph * 40)) * t);
    var ph2 = (t + 0.125) % 0.25, hat = (ph2 < 0.02 ? Math.exp(-ph2 * 250) : 0) * rnd() * 1.2;
    var ps = (t - 0.75) % 1.0, env = (t >= 0.75 && ps < 0.18) ? Math.exp(-ps * 18) : 0;
    var x = rnd() * env; var y = x + a1 * y1 + a2 * y2; y2 = y1; y1 = y;
    var s = 0.55 * kick + 0.25 * hat + 0.09 * y;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true);
  }
  Object.keys(localStorage).filter(function (k) { return k.indexOf('swirlCues.v1:') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  await ar.enable('file', new File([buf], 'snares.wav', { type: 'audio/wav' }));
  for (var q = 0; q < 60 && !ar.trackId(); q++) await sleep(50);
  var sel = document.getElementById('audioMode'); sel.value = 'full'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  for (var q2 = 0; q2 < 100 && !(AT.editor.cache()); q2++) await sleep(100);
  await sleep(500);
  var lanesBefore = AT.gates().length;
  var hzToU = window.AudioScenes.hzToX01;
  // box the first snare: 0.72-0.95 s, 400 Hz - 3 kHz
  CE._box(0.72, 0.95, hzToU(400), hzToU(3000));
  for (var q3 = 0; q3 < 60 && (!CE._match() || CE._match().busy); q3++) await sleep(50);
  var m = CE._match();
  function nearest(t) { var best = 9; snareTimes.forEach(function (s0) { if (Math.abs(t - s0) < Math.abs(best)) best = t - s0; }); return Math.round(best * 1000); }
  function sweep(){ var r={}; [0.5,0.6,0.65,0.7,0.8].forEach(function(x){ CE._setSim(x); var mm=CE._match(); r[x]=mm.n+'/'+mm.times.map(nearest).filter(function(o){return Math.abs(o)<40;}).length; }); CE._setSim(0.6); return r; }
  out.attack = { n: m.n, offsetsMs: m.times.map(nearest), sweep: sweep() };
  // texture mode on the same box
  CE._box(0.72, 0.95, hzToU(400), hzToU(3000), 'texture');
  for (var q4 = 0; q4 < 60 && (!CE._match() || CE._match().busy); q4++) await sleep(50);
  m = CE._match();
  out.texture = { n: m.n, offsetsMs: m.times.map(nearest), sweep: sweep() };
  // back to attacks, a stricter similarity
  CE._box(0.72, 0.95, hzToU(400), hzToU(3000), 'attack');
  for (var q5 = 0; q5 < 60 && (!CE._match() || CE._match().busy); q5++) await sleep(50);
  CE._setSim(0.9);
  out.strict = CE._match().n;
  CE._setSim(0.6);
  var panel = document.querySelector('.ace-match');
  out.panel = panel ? { visible: !panel.hidden, info: panel.querySelector('.ace-match-info').textContent } : null;
  CE._makeLane();
  var g = AT.gates()[AT.gates().length - 1];
  out.lane = { added: AT.gates().length === lanesBefore + 1, method: g.method, act: g.act, cues: g.cues.length, firstCues: g.cues.slice(0, 4).map(function (c) { return c[0]; }) };
  out.rowLabel = (document.querySelectorAll('.atv-method')[AT.gates().length - 1] || {}).textContent;
  // fires on the snares
  var fired = [], og = ar.fireGenerator;
  ar.fireGenerator = function () { fired.push(+ar.position().time.toFixed(3)); return og.apply(this, arguments); };
  for (var li = 0; li < AT.gates().length - 1; li++) AT.setAction(li, 'none');
  ar.seek(2.5); if (ar.isPaused()) ar.resume();
  await sleep(3200);
  ar.fireGenerator = og;
  out.fired = fired.map(nearest);
  // a real pointer drag on the spectrogram makes a box too
  var cv = CE._canvas(); CE.setView(0, 8); await sleep(150);
  var r = cv.getBoundingClientRect(), W = r.width, ky = r.height / cv.clientHeight;
  function pe(type, px, py) { cv.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 3, bubbles: true })); }
  var x0 = r.left + (4.72 / 8) * W, x1 = r.left + (4.95 / 8) * W, yTop = r.top + (14 + 72 * 0.25) * ky, yBot = r.top + (14 + 72 * 0.6) * ky;
  pe('pointerdown', x0, yTop); pe('pointermove', (x0 + x1) / 2, (yTop + yBot) / 2); pe('pointermove', x1, yBot); pe('pointerup', x1, yBot);
  for (var q6 = 0; q6 < 60 && (!CE._match() || CE._match().busy); q6++) await sleep(50);
  out.pointerBox = CE._match() ? CE._match().n : null;
  return out;
})()
