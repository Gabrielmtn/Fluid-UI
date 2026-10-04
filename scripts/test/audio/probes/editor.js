(async function(){
  var ar = window.audioReactive, AT = window.AudioTiming, CE = window.AudioCueEditor;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var out = { editor: !!CE, composerGone: !window.audioComposer };
  var sr = 22050, secs = 16, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
  for (var i = 0; i < n; i++) {
    var t = i / sr, ph = t % 0.5, ph2 = (t + 0.25) % 0.5;
    var kick = (ph < 0.12 ? Math.exp(-ph * 30) : 0) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-ph * 40)) * t);
    var hat = (ph2 < 0.03 ? Math.exp(-ph2 * 200) : 0) * (Math.sin(2 * Math.PI * 9000 * t) * 0.6);
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, 0.7 * kick + 0.5 * hat)) * 32767, true);
  }
  Object.keys(localStorage).filter(function (k) { return k.indexOf('swirlCues.v1:') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  await ar.enable('file', new File([buf], 'beat.wav', { type: 'audio/wav' }));
  for (var k = 0; k < 60 && !ar.trackId(); k++) await sleep(50);
  // Full mode opens the drawer with the editor in it
  var sel = document.getElementById('audioMode'); sel.value = 'full'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  for (var k2 = 0; k2 < 100 && !(AT.chart() && AT.chart().notes.length); k2++) await sleep(100);
  await sleep(800);
  var cv = document.querySelector('.ace-canvas');
  out.canvas = cv ? { w: cv.clientWidth, h: cv.clientHeight, visible: cv.offsetParent !== null } : null;
  out.liveBlock = !!document.querySelector('details.audio-live-block #audioSensitivity');
  var ch = AT.chart();
  out.lanes = ch.lanes.map(function (l) { return l.label + ':' + l.count; });
  var lane0 = ch.notes.filter(function (q) { return q.lane === 0; });
  var t0 = lane0[3].t;
  // move a cue +0.1 s
  CE.setSnap(false);   // exact positions below; snap has its own check at the end
  CE.select(0, t0); CE.move(0.1);
  var after = AT.chart().notes.filter(function (q) { return q.lane === 0; }).map(function (q) { return q.t; });
  out.moved = { from: +t0.toFixed(3), foundAt: after.some(function (t) { return Math.abs(t - (t0 + 0.1)) < 0.002; }), oldGone: !after.some(function (t) { return Math.abs(t - t0) < 0.002; }), edited: !!AT.gates()[0].edited };
  // add + delete + undo/redo
  var before = after.length;
  CE.add(0, 7.777, 0.9);
  var c1 = AT.chart().notes.filter(function (q) { return q.lane === 0; }).length;
  CE.select(0, 7.777); CE.remove();
  var c2 = AT.chart().notes.filter(function (q) { return q.lane === 0; }).length;
  CE.undo();
  var c3 = AT.chart().notes.filter(function (q) { return q.lane === 0; }).length;
  CE.redo();
  var c4 = AT.chart().notes.filter(function (q) { return q.lane === 0; }).length;
  out.addDelete = { before: before, added: c1, deleted: c2, undone: c3, redone: c4 };
  // the track record keeps the edit; the template doesn't carry cues
  var rec = JSON.parse(localStorage.getItem('swirlCues.v1:' + ar.trackId()) || 'null');
  var tpl = JSON.parse(localStorage.getItem('fluidui.audioTiming.gates') || '[]');
  out.saved = { recordHasCues: !!(rec && rec.lanes[0].cues && rec.lanes[0].cues.length), templateHasCues: tpl.some(function (g) { return !!g.cues; }) };
  // pointer: drag a tick on lane 1 by 40 px; double-click lane 2 to add; Delete key while focused
  CE.setView(0, 8);
  await sleep(200);
  var r = cv.getBoundingClientRect(), W = r.width, ky = r.height / cv.clientHeight; out.zoom = +ky.toFixed(3);
  var lane1 = AT.chart().notes.filter(function (q) { return q.lane === 1 && q.t > 1 && q.t < 7; });
  var tick = lane1[0];
  var laneY = r.top + (14 + 72 + 6 + 1 * 20 + 10) * ky;
  var x = r.left + (tick.t - 0) / 8 * W;
  function pe(type, px, py, extra) { cv.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: px, clientY: py, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, bubbles: true, altKey: true }, extra || {}))); }
  var reached = []; cv.addEventListener('pointerdown', function (e) { reached.push(['target', e.button, e.defaultPrevented]); }); window.addEventListener('pointerdown', function (e) { if (e.target === cv) reached.push(['window-capture']); }, true);
  out.dbg = { view: CE.view(), rect: [r.left, r.top, r.width, r.height], tickT: tick.t, x: x, laneY: laneY, topEl: (document.elementFromPoint(x, laneY) || {}).className };
  pe('pointerdown', x, laneY); out.dbg.selAfterDown = CE.selection(); out.dbg.reached = reached; out.dbg.nCanvas = document.querySelectorAll(".ace-canvas").length; out.dbg.same = CE._canvas() === cv; out.dbg.hit = CE._hit(1, x - r.left); pe('pointermove', x + 20, laneY); pe('pointermove', x + 40, laneY); pe('pointerup', x + 40, laneY);
  await sleep(100);
  var dt = 40 / W * 8;
  out.drag = { lane1Edited: !!AT.gates()[1].edited, movedBy: +dt.toFixed(3), landed: AT.chart().notes.some(function (q) { return q.lane === 1 && Math.abs(q.t - (tick.t + dt)) < 0.01; }) };
  var lane2Before = AT.chart().notes.filter(function (q) { return q.lane === 2; }).length;
  var ly2 = r.top + (14 + 72 + 6 + 2 * 20 + 10) * ky;
  cv.dispatchEvent(new MouseEvent('dblclick', { clientX: r.left + W * 0.37, clientY: ly2, bubbles: true, altKey: true }));
  await sleep(50);
  var lane2After = AT.chart().notes.filter(function (q) { return q.lane === 2; }).length;
  cv.focus({ preventScroll: true });
  var recLen = (typeof recGetActiveLayer === 'function' && recGetActiveLayer()) ? 'rec ok' : 'no rec';
  cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  await sleep(50);
  var lane2Del = AT.chart().notes.filter(function (q) { return q.lane === 2; }).length;
  out.dblclickAndKey = { before: lane2Before, afterDbl: lane2After, afterDelete: lane2Del, appConfirmOpen: !!document.querySelector('#appConfirmModal.show'), recState: recLen };
  // fire at the edited times
  ar.seek(t0 + 0.1 - 0.3); if (ar.isPaused()) ar.resume();
  AT.setAction(0, 'burst', 1);
  var fired = [], og = ar.fireGenerator;
  ar.fireGenerator = function () { fired.push(+ar.position().time.toFixed(3)); return og.apply(this, arguments); };
  await sleep(700);
  ar.fireGenerator = og;
  out.firesAtMoved = { want: +(t0 + 0.1).toFixed(3), fired: fired };
  // snap: a cue added 25 ms after a detected kick lands on it
  CE.setSnap(true);
  var kick = AT.chart().notes.filter(function (q) { return q.lane === 0 && q.t > 9 && q.t < 12; })[0];
  var before0 = AT.chart().notes.filter(function (q) { return q.lane === 0; }).length;
  CE.add(0, kick.t + 0.025, 0.8);
  var near = AT.chart().notes.filter(function (q) { return q.lane === 0 && Math.abs(q.t - kick.t) < 0.012; }).length;
  out.snap = { kick: +kick.t.toFixed(3), added: AT.chart().notes.filter(function (q) { return q.lane === 0; }).length - before0, landedOnKick: near >= 2, sel: CE.selection()[0] && +CE.selection()[0].t.toFixed(3) };
  CE.setView(0, 16);
  await sleep(300);
  return out;
})()
