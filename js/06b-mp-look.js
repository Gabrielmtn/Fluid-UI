// ================================================================
// 06b-mp-look.js — Swirl Together client: settings lock + look mirroring.
// The 13.5 host settings lock, look snapshot capture / fit / sanitize /
// apply, and the mirror that re-sends a painter's look while it is theirs
// to drive (mirrorActive: turns beat lock).
//
// The multiplayer client was one 3,600-line file until 2026-09-11. It is now
// five classic scripts, loaded in this order by index.html's async chain.
// They share the global lexical scope: a function or top-level variable
// declared in an earlier file is visible to every later one, and every
// cross-file call happens at runtime (a socket message, a click, a frame),
// so only the load order matters — nothing here runs at load time except
// the init at the tail of 06e.
//   06a-mp-core.js        transport, lifecycle, lobby, message dispatch
//   06b-mp-look.js        settings lock + look snapshots and mirroring
//   06c-mp-turns.js       take turns / call and return
//   06d-mp-paint-wire.js  dabs, cursors, brush shapes, colliders, replay strokes
//   06e-mp-panel.js       the room panel, remote cursors, init (runs last)
// ================================================================

// ── 13.5 host settings lock ─────────────────────────────────────────
// Lock = visual parity: locked guests mirror the host's look-affecting
// settings (sliders/checkboxes/selects/arm colors via a filtered preset
// snapshot — the relay caps messages at 16KB so layers/masks/recordings
// never ride along). Performance-tier controls stay LOCAL on every
// client. Guests' local edits are gated at the slider-binding/preset
// choke points via window.__mpSettingsLocked.
var settingsLockOn = false;        // host's intent (host side only)
var settingsLockDebounce = null;
var hostMirrorInstalled = false;
window.__mpSettingsLocked = false; // guest-side gate (read by 05h/04b/12)
window.__mpApplyingRemote = false; // lets the host's snapshot through the gate

// Local-workflow controls that never ride the look snapshot:
// recording/stats/autoload are per-user UI. brushEraser/sketchVisible are
// sketch/mask *workflow* state, not look — mirroring them let a painter's
// snapshot silently rewrite the watcher's saved eraser/paint-layer prefs
// (pCheckbox persists on 'change').
//
// Resolution and the fps cap used to be on this list too ("perf tiers stay
// local, the governor's look-preserving ladder is the precedent"). That was
// wrong for THIS sim: the physics is resolution-dependent and step-size
// dependent — the same sliders at 384 vs 512 physics, or stepped at 120 vs
// 60 Hz, move differently (advection re-filters the dye every step; see the
// fps-cap note in 05d). Measured 2026-09-11: with every slider, checkbox and
// select mirrored, the ONLY keys left differing between a painter and a
// watcher were these three, and the watcher's motion was visibly different
// while its sidebar looked the same. They ride the mirror now (the numeric
// resolution goes in its own `resolution` section so a Custom value carries
// too). A watcher that cannot keep up still has its governor as the safety
// valve — it steps down by measured fps, never up past the painter's pick.
var MP_PERF_LOCAL_KEYS = [
    'recMode', 'recPlaybackSpeed', 'statsToggle', 'autoloadSettings',
    'brushEraser', 'sketchVisible'
];
// Per-arm Pressure (armColors[].push) falls under the SAME rule, and arrived
// after that list was written. The colours an arm paints are look; whether an
// arm deposits pigment at all is workflow — and it is the most damaging kind
// to inherit, because applyPresetSnapshot PERSISTS the arms it applies
// (12-save-load, brush.armColors). One mirrored snapshot from a painter with
// a push arm therefore rewrote the watcher's own saved arms, and every launch
// afterwards restored a brush that laid no dye with the Pressure button
// showing OFF — "it loaded into Pressure and I never turned it on".
// Stripped on SEND for parity with the keys above, and overwritten with the
// viewer's own flags on RECEIVE, which is the boundary that actually holds
// (snapshots come from untrusted peers on any build).
function stripArmPush(arms) {
    if (!Array.isArray(arms)) return arms || null;
    return arms.map(function (a) {
        if (!a || typeof a !== 'object') return a;
        return { mode: a.mode, color: a.color, stepIndex: a.stepIndex || 0 };
    });
}
// Replace an incoming snapshot's push flags with THIS client's, so applying it
// leaves the local per-arm Pressure state exactly as it was. Deleting the key
// would not do: applyPresetSnapshot reads absent as false and would clear a
// push arm the viewer set themselves.
function keepLocalArmPush(arms) {
    if (!Array.isArray(arms)) return arms;
    var mine = window.multiArmColors || [];
    arms.forEach(function (a, i) {
        if (!a || typeof a !== 'object') return;
        if (mine[i] && mine[i].push) a.push = true; else delete a.push;
    });
    return arms;
}

// A freehand light-shift path stores one full-precision point per ~2px of
// drag — ~117 bytes each, so a normal path is ~12KB on its own and pushed the
// whole snapshot past the shed threshold below. The path was then deleted
// SILENTLY, and a watcher ran with Light Shift "enabled" but no path at all:
// their overexposed whites stayed white while the host's took the path's
// colours. That asymmetry is what "theirs looked more blown out" was.
//
// A mirror doesn't need every sample — resample to at most MIRROR_PATH_POINTS
// (keeping both endpoints) and round to 1 decimal. ~4KB, comfortably inside
// the budget. Presets keep the full-fidelity path: only this mirror copy is
// compacted, and the wire shape is unchanged so old clients still apply it.
var MIRROR_PATH_POINTS = 64;
function compactLightShiftPath(path) {
    if (!path || !path.length) return path || null;
    var r1 = function (v) { return (typeof v === 'number') ? Math.round(v * 10) / 10 : v; };
    var src = path;
    if (src.length > MIRROR_PATH_POINTS) {
        var out = [];
        var step = (src.length - 1) / (MIRROR_PATH_POINTS - 1);
        var prevIdx = 0;
        for (var i = 0; i < MIRROR_PATH_POINTS; i++) {
            var idx = Math.round(i * step);
            var pt = src[idx];
            // A Shift-gap (a jump in the path) must survive resampling: if any
            // dropped point between the last kept one and this one was a jump,
            // this one inherits it, or the mirror draws a line across the gap.
            if (i > 0 && pt && typeof pt === 'object' && !pt.gap) {
                for (var j = prevIdx + 1; j < idx; j++) {
                    if (src[j] && src[j].gap) {
                        pt = { x: pt.x, y: pt.y, hue: pt.hue, saturation: pt.saturation,
                               lightness: pt.lightness, gap: true };
                        break;
                    }
                }
            }
            prevIdx = idx;
            out.push(pt);
        }
        src = out;
    }
    return src.map(function (p) {
        if (!p || typeof p !== 'object') return p;
        var q = { x: r1(p.x), y: r1(p.y), hue: r1(p.hue),
                  saturation: r1(p.saturation), lightness: r1(p.lightness) };
        if (p.gap) q.gap = true; // the jumps are part of the look
        return q;
    });
}

function captureLookSnapshot() {
    if (typeof window.capturePresetSnapshot !== 'function') return null;
    var full;
    // lookOnly: skips layer/mask/branding/recording serialization — those do
    // GPU readbacks + dataURL encodes, far too heavy for mirror re-broadcasts
    try { full = window.capturePresetSnapshot({ lookOnly: true }); } catch (_) { return null; }
    if (!full) return null;
    // 2026-08-06: the lock used to send ONLY sliders/checkboxes/selects (+arm
    // colors, which the guest sanitizer then stripped as nested objects) —
    // background color, palette, kaleidoscope, lighting and stroke dynamics
    // all silently dropped, so a locked guest looked noticeably different
    // from the host. Mirror every look section applyPresetSnapshot knows.
    var snap = {
        version: full.version,
        sliders: {},
        checkboxes: {},
        selects: {},
        colors: full.colors || null,
        kaleido: full.kaleido || null,
        paletteIndex: (typeof full.paletteIndex === 'number') ? full.paletteIndex : null,
        paletteName: full.paletteName || null,
        savedColors: full.savedColors || null,
        userPalettes: full.userPalettes || null,
        lightPos: full.lightPos || null,
        lightShiftPath: compactLightShiftPath(full.lightShiftPath),
        brushState: full.brushState || null,
        material: full.material || null,
        brushTip: full.brushTip || null,
        // Oscillators animate look params — without them a watcher saw only
        // the 2s poll's choppy sampled values instead of the animation itself.
        cosOscillator: full.cosOscillator ||
            ((window.cosOscillator && window.cosOscillator.getState) ? window.cosOscillator.getState() : null),
        // Transport is MIRROR-ONLY state (deliberately not part of presets —
        // loading a preset should never pause you). A painter's pause or
        // freeze is part of the performance, so the audience gets it too.
        transport: {
            paused: (typeof isPaused !== 'undefined') ? !!isPaused : false,
            frozen: !!window.__fluidFrozen
        },
        ssOrigin: full.ssOrigin || null,
        armColors: stripArmPush(full.armColors),
        // The sim's actual resolution, not the dropdown: 'custom' picks live
        // only in config, and applying a select the watcher's list cannot
        // match is silently skipped by applyPresetSnapshot.
        resolution: (window.config && typeof window.config.DYE_RESOLUTION === 'number' &&
                     typeof window.config.SIM_RESOLUTION === 'number')
            ? { dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION }
            : null
    };
    Object.keys(full.sliders || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.sliders[k] = full.sliders[k];
    });
    Object.keys(full.selects || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.selects[k] = full.selects[k];
    });
    Object.keys(full.checkboxes || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.checkboxes[k] = full.checkboxes[k];
    });
    return snap;
}

var settingsLockLastSent = ''; // last snapshot JSON the host broadcast (poll diff gate)

// The relay SILENTLY drops messages over 16KB — for a user with a big saved-
// color/palette library the whole look snapshot vanished on every send, so a
// watcher got per-dab paint properties (they ride the stroke messages) but no
// slider/setting changes at all: "density didn't carry" was this. Sanitize on
// the SENDER (the receiver strips long strings/data URLs anyway, so they are
// pure wasted bytes), then shed bulky optional sections, then as a last
// resort send the core look alone — a partial mirror always beats a silent
// total drop.
function fitLookSnapshot(snap) {
    if (!snap) return null;
    var out = sanitizeLockSnapshot(snap) || {};
    var SHED = ['userPalettes', 'savedColors', 'lightShiftPath', 'ssOrigin', 'brushState'];
    for (var i = 0; i < SHED.length; i++) {
        try { if (JSON.stringify(out).length <= 14000) break; } catch (_) { break; }
        // Shedding used to be completely silent, which is why a dropped
        // lightShiftPath took a user test to find. Say what went overboard.
        if (out[SHED[i]] != null) console.warn('[mp] look snapshot over budget — dropping ' + SHED[i]);
        delete out[SHED[i]];
    }
    var len = 0;
    try { len = JSON.stringify(out).length; } catch (_) {}
    if (len > 15000) {
        console.warn('[mp] look snapshot still ' + len + 'B after shedding — sending core look only');
        out = { sliders: out.sliders, checkboxes: out.checkboxes, selects: out.selects,
                colors: out.colors, kaleido: out.kaleido, paletteIndex: out.paletteIndex,
                material: out.material, cosOscillator: out.cosOscillator,
                transport: out.transport, armColors: out.armColors };
    }
    return out;
}
function broadcastSettingsLock() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var msg = { type: 'settings-lock', locked: settingsLockOn, timestamp: Date.now() };
    if (settingsLockOn) {
        var snap = captureLookSnapshot();
        // Diff gate records the PRE-fit JSON (the poll compares fresh
        // unshedded captures against this — post-fit it would never match
        // an oversize snapshot and the poll would re-send every tick).
        try { settingsLockLastSent = JSON.stringify(snap || null); } catch (_) { settingsLockLastSent = ''; }
        msg.snapshot = fitLookSnapshot(snap);
    }
    partySocket.send(JSON.stringify(msg));
}

// Take-turns twin of broadcastSettingsLock: the current painter's look rides a
// 'turn-look' message (the relay only forwards it from the turn holder).
function broadcastTurnLook() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var snap = captureLookSnapshot();
    // Same pre-fit diff gate as the settings lock (shared with the poll).
    try { settingsLockLastSent = JSON.stringify(snap || null); } catch (_) { settingsLockLastSent = ''; }
    partySocket.send(JSON.stringify({ type: 'turn-look', snapshot: fitLookSnapshot(snap), timestamp: Date.now() }));
}

// The look mirror serves two features: the 13.5 host settings lock, and
// take-turns mode (the current painter's look mirrors to every watcher).
// Exactly one can be live at a time — turns supersede the host lock.
function mirrorActive() {
    if (turnsOn) return isMyTurn() ? 'turn' : null;
    if (settingsLockOn) return 'lock';
    return null;
}
function broadcastLookMirror() {
    var m = mirrorActive();
    if (m === 'lock') broadcastSettingsLock();
    else if (m === 'turn') broadcastTurnLook();
}
// While mirroring, live edits re-broadcast (debounced) so the watching side
// tracks them — "mirror every look-affecting setting"
function hostLockMirrorHandler() {
    if (!mirrorActive()) return;
    if (settingsLockDebounce) clearTimeout(settingsLockDebounce);
    settingsLockDebounce = setTimeout(broadcastLookMirror, 400);
}
var settingsLockPoll = null;
function installHostLockMirror() {
    if (hostMirrorInstalled) return;
    document.addEventListener('input', hostLockMirrorHandler, true);
    document.addEventListener('change', hostLockMirrorHandler, true);
    // Catch-all poll (2026-08-06): plenty of look changes never fire
    // input/change — palette swatch clicks, preset loads, light-source
    // drags, kaleido buttons, Mutate. Diff-gated so a quiet host sends
    // nothing; captureLookSnapshot is the cheap lookOnly capture.
    settingsLockPoll = setInterval(function () {
        var m = mirrorActive();
        if (!m) return;
        var j;
        try { j = JSON.stringify(captureLookSnapshot() || null); } catch (_) { return; }
        if (j !== settingsLockLastSent) hostLockMirrorHandler();
    }, 2000);
    hostMirrorInstalled = true;
}
function removeHostLockMirror() {
    if (!hostMirrorInstalled) return;
    document.removeEventListener('input', hostLockMirrorHandler, true);
    document.removeEventListener('change', hostLockMirrorHandler, true);
    hostMirrorInstalled = false;
    if (settingsLockDebounce) { clearTimeout(settingsLockDebounce); settingsLockDebounce = null; }
    if (settingsLockPoll) { clearInterval(settingsLockPoll); settingsLockPoll = null; }
}
// Install/remove the mirror to match whichever feature currently needs it.
function syncLookMirror() {
    if (mirrorActive()) installHostLockMirror(); else removeHostLockMirror();
}

function toggleSettingsLock() {
    settingsLockOn = !settingsLockOn;
    broadcastSettingsLock();
    syncLookMirror();
    updateConnectedView();
}

// A settings-lock snapshot arrives from an untrusted peer (the relay forwards
// unrecognized messages verbatim and only gates type:"lock" on host). The
// feature only needs the LOOK — sliders/checkboxes/selects/colors — so strip
// everything that carries file data or names, which would otherwise reach the
// layer/mask/recording/path panels and their innerHTML templates.
// Key names must match capturePresetSnapshot's real output (2026-08-06: the
// old list said 'brush'/'lightSource'/'lightShift', which exist nowhere in
// the preset — those sections could never arrive even if sent).
var LOCK_SNAPSHOT_ALLOW = ['sliders', 'checkboxes', 'selects', 'colors', 'savedColors',
    'paletteIndex', 'paletteName', 'armColors', 'brushState', 'lightPos',
    'lightShiftPath', 'kaleido', 'userPalettes', 'ssOrigin', 'material',
    'brushTip', 'cosOscillator', 'transport', 'resolution'];
// Bounded recursive clean: primitives-only leaves (no data: URLs, strings
// capped), depth ≤ 3 so armColors [{mode,color}], lightShiftPath waypoints
// and userPalettes [{name, colors: [...]}] survive — the old one-level rule
// stripped every array-of-objects section to empty.
function cleanLockValue(v, depth) {
    var t = typeof v;
    if (v === null || t === 'number' || t === 'boolean') return v;
    if (t === 'string') return (v.length <= 64 && !/^data:/i.test(v)) ? v : undefined;
    if (t !== 'object' || depth >= 3) return undefined;
    var clean = Array.isArray(v) ? [] : {};
    Object.keys(v).forEach(function (kk) {
        var vv = cleanLockValue(v[kk], depth + 1);
        if (vv === undefined) return;
        if (Array.isArray(clean)) clean.push(vv); else clean[kk] = vv;
    });
    return clean;
}
function sanitizeLockSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    var out = {};
    LOCK_SNAPSHOT_ALLOW.forEach(function (k) {
        if (!(k in snapshot)) return;
        var v = cleanLockValue(snapshot[k], 0);
        if (v !== undefined) out[k] = v;
    });
    if (out.armColors) keepLocalArmPush(out.armColors);
    // Relay caps messages at 16KB — shed the bulkiest optional sections
    // rather than letting the whole snapshot fail to arrive.
    try {
        ['userPalettes', 'savedColors', 'lightShiftPath'].forEach(function (k) {
            if (JSON.stringify(out).length > 14000) delete out[k];
        });
    } catch (_) {}
    return out;
}

// Guest side: enter/leave the locked state (banner + gate + mirror apply)
function setSettingsLockedByHost(locked, snapshot) {
    window.__mpSettingsLocked = !!locked;
    var banner = document.getElementById('mpSettingsLockBanner');
    if (locked) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'mpSettingsLockBanner';
            banner.textContent = 'Settings locked by host';
            banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10002;' +
                'padding:6px 14px;border-radius:8px;background:rgba(15,20,27,0.92);border:1px solid rgba(255,178,71,0.5);' +
                'color:#ffb347;font-size:12px;font-weight:600;pointer-events:none;';
            document.body.appendChild(banner);
        }
        applyRemoteLookSnapshot(snapshot);
    } else if (banner) {
        banner.remove();
    }
}

// Sanitize + apply a look snapshot from an untrusted peer (settings lock or
// take-turns mirror — both ride the same capture/sanitize/apply pipeline).
function applyRemoteLookSnapshot(snapshot) {
    var safeSnap = sanitizeLockSnapshot(snapshot);
    if (safeSnap && typeof window.applyPresetSnapshot === 'function') {
        isProcessingRemoteEvent = true;
        window.__mpApplyingRemote = true;
        try { window.applyPresetSnapshot(safeSnap); }
        catch (e) { console.warn('look mirror: snapshot apply failed', e); }
        finally { isProcessingRemoteEvent = false; window.__mpApplyingRemote = false; }
        // Resolution parity (mirror-only; presets carry it only as the
        // dropdown value). The physics is resolution-dependent, so a watcher
        // on a different grid moves differently with identical sliders. Same
        // path as an explicit pick in 05h: set config, flag the re-init, and
        // pin the governor so no ladder scaling sits under the painter's value.
        try {
            var r = safeSnap.resolution;
            if (r && window.config) {
                var dye = (typeof r.dye === 'number' && isFinite(r.dye)) ? Math.round(r.dye) : 0;
                var sim = (typeof r.sim === 'number' && isFinite(r.sim)) ? Math.round(r.sim) : 0;
                var changed = false;
                if (dye >= 64 && dye <= 8192 && window.config.DYE_RESOLUTION !== dye) { window.config.DYE_RESOLUTION = dye; changed = true; }
                if (sim >= 16 && sim <= 4096 && window.config.SIM_RESOLUTION !== sim) { window.config.SIM_RESOLUTION = sim; changed = true; }
                if (changed) {
                    window.needsFramebufferReinit = true;
                    if (window.QualityGovernor && window.QualityGovernor.pinResolution) window.QualityGovernor.pinResolution();
                    if (typeof window.setResolutionDropdown === 'function') {
                        var vSel = document.getElementById('visualResolution');
                        var pSel = document.getElementById('physicsResolution');
                        if (vSel && dye) window.setResolutionDropdown(vSel, dye);
                        if (pSel && sim) window.setResolutionDropdown(pSel, sim);
                    }
                }
            }
        } catch (e) { /* best-effort */ }
        // Transport parity (mirror-only; applyPresetSnapshot ignores it): the
        // painter pausing or freezing the fluid is part of the performance.
        try {
            var t = safeSnap.transport;
            if (t) {
                if (typeof t.paused === 'boolean' && typeof isPaused !== 'undefined' &&
                    !!isPaused !== t.paused && typeof window.togglePause === 'function') {
                    window.togglePause();
                }
                if (typeof t.frozen === 'boolean' && !!window.__fluidFrozen !== t.frozen &&
                    typeof window.toggleFreeze === 'function') {
                    window.toggleFreeze();
                }
            }
        } catch (e) { /* best-effort */ }
    }
}

function resetSettingsLock() {
    settingsLockOn = false;
    syncLookMirror(); // keeps the turn mirror alive if we're the current painter
    setSettingsLockedByHost(false, null);
}
