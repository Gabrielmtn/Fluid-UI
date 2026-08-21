(function(){
var T = window.__test;
    function setup() {
        // Registry defaults FIRST: the app autosaves its settings, so a
        // fresh boot autoloads the PREVIOUS session's state — cross-boot
        // goldens never matched until every registered param was pinned
        // (ParamRegistry.defaults() is snapshot-shaped for exactly this).
        if (window.ParamRegistry && window.applyPresetSnapshot) {
            window.applyPresetSnapshot(window.ParamRegistry.defaults());
        }
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false);
        // The brush colour picker is not registry-covered — pin it too.
        var cp = document.getElementById('colorPicker');
        if (cp) { cp.value = '#4090c0'; cp.dispatchEvent(new Event('input', { bubbles: true })); }
        // Pin the canvas BOX: texture dims are aspect-scaled off the
        // resolution budget, so a boot-to-boot window/wrapper size delta
        // silently changes every buffer. The bakers always setBox() —
        // consecutive boots agreed and a third diverged until this pin.
        var wrap = document.getElementById('canvas-wrapper');
        if (wrap) {
            wrap.style.width = '1280px';
            wrap.style.height = '720px';
            if (window.initializeCanvasPosition) window.initializeCanvasPosition();
            if (window.updateCanvasSize) window.updateCanvasSize();
        }
        T.setSelect('visualResolution', '1024');
        T.setSelect('physicsResolution', '256');
        // fpsCap MUST be uncapped under the virtual clock: lastDrawTimeMs
        // carries the REAL clock's sub-frame phase into the freeze, so with
        // a cap the first pumped frame randomly passes or skips the
        // cap gate per boot — the divergence probe caught boot 2's first
        // frame as a silent no-op (dye untouched) while boot 1 simmed.
        T.setSelect('fpsCap', '0');
        window.fpsCap = 0;
        // Sub-stepping off: the FIRST frozen frame's wallDt spans
        // virtualNow minus the last REAL frame time — phase-random per
        // boot — and when it crosses 20ms the loop runs ceil(wallDt/16)
        // physics sub-steps, a per-boot different count (probe: frame-1
        // means differing by ~7e-6, both frames simmed). With it off,
        // rawDt clamps to a constant 16ms whatever the phase.
        config.SIM_SUBSTEP = false;
        window.timeScale = 1;
        T.setCheckbox('colorGate', false);
        T.setCheckbox('randomColor', false);
        if (window.lightShift) window.lightShift.enabled = false;
        if (window.MaterialModes) window.MaterialModes.setMode('fluid');
        // Strip any live layers and colliders — by each layer's OWN index,
        // not array position (deleteLayer matches l.index). The app under
        // test doubles as a painting app; a layer someone added between
        // runs (measured: a fish) shifts every hash in the suite.
        if (window.layers && window.deleteLayer) {
            window.layers.map(function (l) { return l.index; })
                .forEach(function (id) { try { window.deleteLayer(id); } catch (_) {} });
        }
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
        // Unregistered persisted state — MEASURED drifting across boots
        // (fingerprint diff 2026-08-21): STAMP_SHAPE 0 vs undefined flips
        // the splat shader's footprint branch (every dab changes), the
        // splat in/out ramp distances scale dab radii, and multiArmColors
        // arrived as 1 entry on one boot and 8 on the next.
        config.STAMP_SHAPE = 0;
        window.splatInDist = 0.15;
        window.splatOutDist = 0.15;
        if (window.multiArmColors) {
            for (var ai = 0; ai < 8; ai++) {
                window.multiArmColors[ai] = ai === 0
                    ? { mode: 'fixed', color: '#4090c0', stepIndex: 0, cachedColor: null }
                    : { mode: 'main', color: '#ffffff', stepIndex: 0 };
            }
            window.multiArmColors.length = 8;
        }
        // Zero the decay-debt accumulators (dyeDecayAccum/velDecayAccum,
        // lexical in 05j): they batch dt in SECONDS toward an fp16 flush
        // threshold and carry phase-random PRE-FREEZE debt across clear().
        // The only external reset hook is the loop's own guard — a
        // dissipation-value CHANGE zeroes the debt — so nudge each rate,
        // let one frame observe it, restore the canonical value, and let
        // one more frame observe that. From the second change on, the
        // accumulator path is deterministic. (Divergence probe: frame-1
        // hashes recurred in a small set of variants across boots — the
        // signature of a quantized phase, this one.)
        T.setSlider('densityDissipation', 0.992);   // stay >= 0.88: below wipes the sim
        T.setSlider('velocityDissipation', 0.998);
        return T.step(1).then(function () {
            T.setSlider('densityDissipation', 0.993);
            T.setSlider('velocityDissipation', 0.999);
            return T.step(1);
        }).then(function () {
            T.clear();
            T.seed(0xBEEF);
            return T.step(4);
        });
    }
function seq(marks){
  return setup().then(function(){
    T.stroke({});
    var chain = Promise.resolve();
    [1,5,10,20,30,40,50,60].forEach(function(n, i, arr){
      var prev = i===0?0:arr[i-1];
      chain = chain.then(function(){ return T.step(n-prev); }).then(function(){ var s=T.snapshotState({dyeOnly:true}); marks.push({tag:"frame-"+n, dye:s.dye.hash}); });
    });
    return chain;
  });
}
var r1=[], r2=[];
return T.freeze().then(function(){ return seq(r1); }).then(function(){ return seq(r2); }).then(function(){
  T.unseed(); T.thaw();
  return { run1: r1, run2: r2 };
});
})()