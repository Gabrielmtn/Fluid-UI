(function(){
  var T = window.__test;
  return T.freeze().then(function () {
    if (window.ParamRegistry && window.applyPresetSnapshot) window.applyPresetSnapshot(window.ParamRegistry.defaults());
    if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false);
    var cp = document.getElementById('colorPicker');
    if (cp) { cp.value = '#4090c0'; cp.dispatchEvent(new Event('input', { bubbles: true })); }
    T.setSelect('visualResolution', '1024');
    T.setSelect('physicsResolution', '256');
    T.setCheckbox('colorGate', false);
    T.setCheckbox('randomColor', false);
    if (window.lightShift) window.lightShift.enabled = false;
    if (window.MaterialModes) window.MaterialModes.setMode('fluid');
    if (window.layers && window.deleteLayer) window.layers.map(function(l){return l.index;}).forEach(function(id){ try{window.deleteLayer(id);}catch(_){}} );
    if (window.collisionLayers) { if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null); window.collisionLayers.enabled = false; }
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
    T.clear();
    T.seed(48879);
    return T.step(4);
  }).then(function () {
    var cfg = {};
    Object.keys(config).sort().forEach(function (k) { var v = config[k]; if (typeof v !== 'object' && typeof v !== 'function') cfg[k] = v; });
    var fp = {
      config: cfg,
      dims: { canvas: canvas.width + 'x' + canvas.height, dye: window.dyeTexWidth + 'x' + window.dyeTexHeight, sim: window.simTexWidth + 'x' + window.simTexHeight },
      globals: {
        fpsCap: window.fpsCap, timeScale: window.timeScale,
        animationMultiplier: window.animationMultiplier,
        kaleidoEnabled: window.kaleidoEnabled,
        splatInDist: window.splatInDist, splatOutDist: window.splatOutDist,
        splatInMs: window.splatInMs, splatOutMs: window.splatOutMs,
        brushAngle: window.brushAngle,
        armColors: JSON.stringify(window.multiArmColors || null),
        displayShading: JSON.stringify(window.displayShading || null),
        material: window.MaterialModes && window.MaterialModes.getState && JSON.stringify(window.MaterialModes.getState()),
        stampShape: localStorage.getItem('fluidui.stampShape'),
        symmetry: document.getElementById('symmetryMode') && document.getElementById('symmetryMode').value,
        multiplierSlider: document.getElementById('multiplier') && document.getElementById('multiplier').value,
        brushSize: document.getElementById('brushSize') && document.getElementById('brushSize').value
      }
    };
    T.unseed(); T.thaw();
    return fp;
  });
})()
