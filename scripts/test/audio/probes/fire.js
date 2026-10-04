(async function(){
  var loaded = await (async function(){
      var sr = 22050, secs = 20, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
      w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
      v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
      for (var i = 0; i < n; i++) {   // a kick every 0.5 s (120 BPM), nothing else
        var t = i / sr, ph = t % 0.5;
        var kick = (ph < 0.12 ? Math.exp(-ph * 30) : 0) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-ph * 40)) * t);
        v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, 0.8 * kick)) * 32767, true);
      }
      await window.audioReactive.enable('file', new File([buf], 'kicks.wav', { type: 'audio/wav' }));
      localStorage.removeItem('fluidui.audioTiming.gates');
      window.AudioTiming.enable();
      for (var k = 0; k < 100 && !(window.AudioTiming.chart() && window.AudioTiming.chart().notes.length); k++) await new Promise(function (r) { setTimeout(r, 100); });
      var ch = window.AudioTiming.chart();
      return { kind: window.audioReactive.sourceKind(), lanes: ch ? ch.lanes.length : 0, cues: ch ? ch.lanes.map(function (l) { return l.count; }) : null,
               seededActs: window.AudioTiming.gates().map(function (g) { return (g.act || 'none') + '/' + (g.every || 1); }) };
    })();
  var fired = await (async function(){
  var ar = window.audioReactive, AT = window.AudioTiming;
  var fired = [], origG = ar.fireGenerator;
  ar.fireGenerator = function () { fired.push(ar.position().time); return origG.apply(this, arguments); };
  AT.setAction(0, 'burst', 1); AT.setAction(1, 'none'); AT.setAction(2, 'none');
  ar.seek(0); if (ar.isPaused()) ar.resume();
  await new Promise(function (r) { setTimeout(r, 300); });
  var tA = ar.position().time;
  await new Promise(function (r) { setTimeout(r, 6000); });
  var tB = ar.position().time;
  ar.fireGenerator = origG;
  var cues = AT.chart().notes.filter(function (n) { return n.lane === 0 && n.t > tA && n.t <= tB; }).map(function (n) { return n.t; });
  var inWin = fired.filter(function (t) { return t > tA && t <= tB + 0.05; });
  var lags = inWin.map(function (t) { var best = 9; cues.forEach(function (c) { if (Math.abs(t - c) < Math.abs(best)) best = t - c; }); return Math.round(best * 1000); });
  var kt = document.getElementById('kaleidoToggle'); if (kt && !kt.checked) { kt.checked = true; kt.dispatchEvent(new Event('change', { bubbles: true })); }
  AT.setAction(0, 'none');
  function turnOver(ms) { return new Promise(function (res) { var prev = window.kAngle || 0, tot = 0, t0 = performance.now(); (function f() { var a = window.kAngle || 0, d = a - prev; if (d < -Math.PI) d += 2 * Math.PI; if (d > Math.PI) d -= 2 * Math.PI; tot += d; prev = a; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(+(tot * 180 / Math.PI).toFixed(1)); })(); }); }
  var base = await turnOver(2000);
  AT.setAction(0, 'spin', 1);
  var withSpin = await turnOver(2000);
  var cfg = ar.getConfig ? ar.getConfig() : {};
  return { window: [+tA.toFixed(2), +tB.toFixed(2)], cuesInWindow: cues.length, firedInWindow: inWin.length, lagMs: lags,
           spinBaseline2s: base, spinWithAction2s: withSpin, kSpinSpeed: window.kSpinSpeed, mapMidToKaleido: cfg.mapMidToKaleido,
           audioMode: (document.getElementById('audioMode') || {}).value };
})();
  return { loaded: loaded, fired: fired };
})()
