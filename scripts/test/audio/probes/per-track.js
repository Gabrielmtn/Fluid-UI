(async function(){
  var ar = window.audioReactive, AT = window.AudioTiming;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function wav(freq, period, secs) {
    var sr = 22050, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
    for (var i = 0; i < n; i++) {
      var t = i / sr, ph = t % period;
      var k = (ph < 0.12 ? Math.exp(-ph * 30) : 0) * Math.sin(2 * Math.PI * (freq + 80 * Math.exp(-ph * 40)) * t);
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, 0.8 * k)) * 32767, true);
    }
    return buf;
  }
  async function load(buf, name) {
    await ar.enable('file', new File([buf], name, { type: 'audio/wav' }));
    for (var k = 0; k < 60 && !ar.trackId(); k++) await sleep(50);
    for (var k2 = 0; k2 < 100 && !(AT.chart() && AT.chart().notes.length); k2++) await sleep(100);
  }
  var out = {};
  Object.keys(localStorage).filter(function (k) { return k.indexOf('swirlCues.v1:') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  var A = wav(55, 0.5, 12), B = wav(60, 0.4, 12);
  AT.enable();
  await load(A, 'kicks.wav');
  out.idA = ar.trackId();
  AT.setAction(0, 'burst', 1);
  out.savedA = !!localStorage.getItem('swirlCues.v1:' + out.idA);
  await load(B, 'other.wav');
  out.idB = ar.trackId();
  out.bStartsFromA = (AT.gates()[0] || {}).act;
  AT.setAction(0, 'grid', 2);
  await load(A.slice(0), 'renamed copy.wav');
  out.idAagain = ar.trackId();
  out.aKeepsItsOwn = (AT.gates()[0] || {}).act + '/' + ((AT.gates()[0] || {}).every || 1);
  out.status = AT.status();
  // chart closed: cues still fire
  AT.disable();
  var fired = 0, origG = ar.fireGenerator;
  ar.fireGenerator = function () { fired++; return origG.apply(this, arguments); };
  await load(B, 'other.wav');
  ar.seek(0); if (ar.isPaused()) ar.resume();
  await sleep(4000);
  ar.fireGenerator = origG;
  out.chartClosedArmed = AT.isArmed();
  out.firedWithChartClosedIn4s = fired;   // B: grid every 2nd, kick every 0.4 s → ~5
  // open a cue file onto track B
  AT.enable(); await sleep(300);
  var rec = { format: 'swirlcues', v: 1, track: { id: out.idB, name: 'other.wav' }, nudgeMs: 40,
              lanes: [{ lo: 0.2, hi: 0.3, th: 0.5, method: 'onset', act: 'spiral', every: 1 }] };
  var picker = document.querySelector('.atv-cue-files input[type=file]');
  out.cueButtons = [].map.call(document.querySelectorAll('.atv-cue-files button'), function (b) { return b.textContent; });
  if (picker) {
    var dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(rec)], 'other.swirlcues', { type: 'application/json' }));
    picker.files = dt.files; picker.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(600);
  }
  out.afterOpen = AT.gates().map(function (g) { return g.act; }).join(',') + ' nudge ' + (JSON.parse(localStorage.getItem('swirlCues.v1:' + out.idB)) || {}).nudgeMs;
  out.records = Object.keys(localStorage).filter(function (k) { return k.indexOf('swirlCues.v1:') === 0; }).length;
  return out;
})()
