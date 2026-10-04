(async function(){
  var ar = window.audioReactive, AT = window.AudioTiming, CE = window.AudioCueEditor;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var out = {};
  var sr = 22050, secs = 12, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
  var seed = 5; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
  for (var i = 0; i < n; i++) {
    var t = i / sr, ph = t % 0.5, kick = (ph < 0.12 ? Math.exp(-ph * 30) : 0) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-ph * 40)) * t);
    var ph2 = (t + 0.125) % 0.25, hat = (ph2 < 0.02 ? Math.exp(-ph2 * 250) : 0) * rnd() * 1.2;
    var ps = (t + 0.25) % 1.0, sn = (ps < 0.15 ? Math.exp(-ps * 20) : 0) * Math.sin(2 * Math.PI * 600 * t);
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, 0.5 * kick + 0.25 * hat + 0.3 * sn)) * 32767, true);
  }
  await ar.enable('file', new File([buf], 'kit.wav', { type: 'audio/wav' }));
  for (var q = 0; q < 60 && !ar.trackId(); q++) await sleep(50);
  var sel = document.getElementById('audioMode'); sel.value = 'full'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  for (var q2 = 0; q2 < 100 && !(AT.editor.cache()); q2++) await sleep(100);
  await sleep(600);
  var lanesEl = document.getElementById('audioDrawerLanes');
  out.fullLanes = lanesEl ? { shown: lanesEl.style.display !== 'none', gateEditor: !!lanesEl.querySelector('.audio-gates-editor canvas, .audio-gates-editor'), rows: lanesEl.querySelectorAll('.atv-lane').length, actSelects: lanesEl.querySelectorAll('.atv-act').length, cueFileBtns: lanesEl.querySelectorAll('.atv-cue-files button').length } : null;
  CE._setup();
  await sleep(300);
  out.setup = { status: (document.querySelector('.ace-status') || {}).textContent, lanes: AT.gates().map(function (g) { return g.name + ' ' + Math.round(window.AudioScenes.x01ToHz(g.lo)) + '-' + Math.round(window.AudioScenes.x01ToHz(g.hi)) + ' ' + g.act + '/' + (g.every || 1) + ' th' + g.th.toFixed(2); }),
                counts: AT.chart().lanes.map(function (l) { return l.count; }) };
  out.rowLabels = [].map.call(lanesEl.querySelectorAll('.atv-lane-label'), function (l) { return l.textContent; });
  var fired = {}, og = ar.fireGenerator, steps = 0, os = window.stepPaletteOnce;
  ar.fireGenerator = function (name) { fired[name] = (fired[name] || 0) + 1; return og.apply(this, arguments); };
  window.stepPaletteOnce = function () { steps++; return os.apply(this, arguments); };
  ar.seek(0); if (ar.isPaused()) ar.resume();
  await sleep(4000);
  ar.fireGenerator = og; window.stepPaletteOnce = os;
  out.in4s = { generators: fired, colourSteps: steps };
  return out;
})()
