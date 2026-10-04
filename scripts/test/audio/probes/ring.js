(async function(){
  var ar = window.audioReactive, AT = window.AudioTiming;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var sr = 22050, secs = 10, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
  for (var i = 0; i < n; i++) { var t = i / sr, ph = t % 0.5; var k = (ph < 0.12 ? Math.exp(-ph * 30) : 0) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-ph * 40)) * t); v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, 0.8 * k)) * 32767, true); }
  await ar.enable('file', new File([buf], 'kicks.wav', { type: 'audio/wav' }));
  localStorage.removeItem('fluidui.audioTiming.gates');
  AT.enable();
  for (var q = 0; q < 100 && !(AT.chart() && AT.chart().notes.length); q++) await sleep(100);
  var rings = 0, orig = window.applyRingSplat;
  window.applyRingSplat = function () { rings++; return orig.apply(this, arguments); };
  AT.setAction(0, 'ring', 1); AT.setAction(1, 'none'); AT.setAction(2, 'none');
  var out = { scene: window.AudioScenes.active(), actions: AT.actions };
  ar.seek(0); if (ar.isPaused()) ar.resume();
  var launched = 0, of = window.AudioScenes.fireRing;
  window.AudioScenes.fireRing = function () { var r = of.apply(this, arguments); if (r) launched++; return r; };
  await sleep(3000);
  window.AudioScenes.fireRing = of;
  out.cueRings = { launchedIn3s: launched, ringStampDraws: rings, busyAfter: window.AudioScenes.busy() };
  // the Tunnel scene still runs its own rings
  AT.setAction(0, 'none');
  var sel = document.getElementById('audioMode'); sel.value = 'tunnel'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(400);
  rings = 0;
  await sleep(3000);
  window.applyRingSplat = orig;
  out.tunnelScene = { active: window.AudioScenes.active(), ringStampDraws: rings };
  return out;
})()
