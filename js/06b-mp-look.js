// ================================================================
// 06b-mp-look.js — Swirl Together client: the room's shared settings.
// A room is a set of people sharing one set of settings. Whatever anyone
// changes — a slider, a switch, the palette, the light, gravity — changes
// for everyone in the room, both ways, as it happens. Each person keeps
// their own brush (size, colour, arms, stroke feel): that is how they draw,
// not what the room looks like, and their strokes already carry it.
//
// Until 2026-10-06 the room had three rhythms (together, take turns, call
// and return) and a host lock ("everyone uses my look"); the turn mirror
// and the lock both made ONE person's look the room's. Playtests said the
// loop people actually play is the sharing itself, so those are gone and
// this is the whole of it.
//
// The multiplayer client is five classic scripts, loaded in this order by
// index.html's async chain. They share the global lexical scope: a function
// or top-level variable declared in an earlier file is visible to every
// later one, and every cross-file call happens at runtime (a socket message,
// a click, a frame), so only the load order matters — nothing here runs at
// load time except the init at the tail of 06e.
//   06a-mp-core.js        transport, lifecycle, lobby, message dispatch
//   06b-mp-look.js        the room's shared settings
//   06c-mp-glide.js       incoming slider glide
//   06d-mp-paint-wire.js  dabs, cursors, brush shapes, colliders, replay strokes
//   06e-mp-panel.js       the room panel, remote cursors, init (runs last)
// ================================================================

window.__mpApplyingRemote = false; // a peer's change is being applied (06c, 12, 05h read it)

// How YOUR screen is laid out and what YOUR machine listens to, never the
// room's: recording/stats/autoload are per-user UI; brushEraser and
// sketchVisible are sketch/mask workflow (pCheckbox persists them on change,
// so a peer's value would rewrite your saved preference); Focus mode and the
// stream-format lock rebuild the layout (measured 2026-09-29: one painter's
// F put the other's whole window into Focus mode); cursor and canvas-handle
// switches are chrome; the capture and audio switches reach for devices (a
// synthetic audio-source change on a running engine asks for the
// microphone). Dropped on receive too, for senders on other builds.
var MP_PERF_LOCAL_KEYS = [
    'recMode', 'recPlaybackSpeed', 'statsToggle', 'autoloadSettings',
    'brushEraser', 'sketchVisible',
    'focusModeToggle', 'streamFormatLock', 'cursorToggle', 'showCanvasHandles',
    'lockCanvasBorders', 'hoverCaptureToggle', 'detachCaptureToggle',
    'audioReactToggle', 'audioReactSource'
];

// Your brush, and your machine's ears. The canvas comes out the same either
// way — every dab on the wire carries the brush it was painted with (06d) —
// so sharing these would only change how someone ELSE's hand draws: their
// brush growing mid-stroke because you scrolled yours. The colour mode
// switches (Rnd / Step) also rewrite the colour picker after every stroke,
// so the picker is a cursor, not a choice. Safety and canvas-chrome
// switches round it out (PhotoSafe is never applied from a peer, and
// Transparent Background is how someone's stream is set up).
var ROOM_LOOK_PERSONAL = {
    sliderCategories: { brush: 1, audio: 1 },
    checkboxes: ['randomColor', 'stepPalette', 'symmetrySameAngle', 'symmetryFaceCenter',
        'arMapAutoSplat', 'arMapSize', 'arMapKaleido', 'arMapColor',
        'photoSafeToggle', 'preserveFluidOpacity', 'transparentMode'],
    selects: ['symmetryMode', 'splatInMode', 'splatOutMode', 'audioMode', 'audioAutoSplatMode'],
    // brushState / brushTip / armColors: the brush. userPalettes: your saved
    // palette LIBRARY (applying one persists it, so a peer's would replace
    // yours). transport: pause and freeze are yours (a partner freezing your
    // sim mid-stroke is an interruption, not a setting). kaleido: the same
    // numbers as the kaleido controls, plus the live spin angle, which every
    // screen advances on its own clock.
    sections: ['brushState', 'brushTip', 'armColors', 'userPalettes', 'transport',
        'cosOscillator', 'kaleido']
};

function isPersonalSlider(id) {
    if (MP_PERF_LOCAL_KEYS.indexOf(id) !== -1) return true;
    var R = window.ParamRegistry;
    var reg = R && R.SLIDERS ? R.SLIDERS[id] : null;
    return !!(reg && ROOM_LOOK_PERSONAL.sliderCategories[reg.category]);
}

// Strip what stays with each person from a look. Run on what we send AND on
// what arrives: the second is the boundary that holds, since a look can come
// from any build.
function dropPersonal(look) {
    if (!look) return look;
    ROOM_LOOK_PERSONAL.sections.forEach(function (k) { delete look[k]; });
    if (look.sliders) Object.keys(look.sliders).forEach(function (id) {
        if (isPersonalSlider(id)) delete look.sliders[id];
    });
    if (look.checkboxes) ROOM_LOOK_PERSONAL.checkboxes.concat(MP_PERF_LOCAL_KEYS)
        .forEach(function (id) { delete look.checkboxes[id]; });
    if (look.selects) ROOM_LOOK_PERSONAL.selects.concat(MP_PERF_LOCAL_KEYS)
        .forEach(function (id) { delete look.selects[id]; });
    // The background is the room's; the brush colour is yours.
    if (look.colors) {
        if (look.colors.background) look.colors = { background: look.colors.background };
        else delete look.colors;
    }
    return look;
}

// A freehand light-shift path stores one full-precision point per ~2px of
// drag — ~117 bytes each, so a normal path is ~12KB on its own and pushed the
// whole look past the relay's budget. A room doesn't need every sample:
// resample to at most MIRROR_PATH_POINTS (keeping both endpoints and every
// jump) and round to 1 decimal, ~4KB. Presets keep the full-fidelity path.
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
            // this one inherits it, or the room draws a line across the gap.
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

// Every look section applyPresetSnapshot knows, plus three that only a room
// carries: the sim's real resolution (a 'custom' pick lives only in
// config), gravity (a checkbox and an aim pad outside the registry), and
// pause/freeze (dropped again as personal — kept here so the capture stays
// one function). lookOnly skips layers, masks and recordings: GPU readbacks
// and dataURL encodes, far too heavy for something that runs every second.
function captureLookSnapshot() {
    if (typeof window.capturePresetSnapshot !== 'function') return null;
    var full;
    try { full = window.capturePresetSnapshot({ lookOnly: true }); } catch (_) { return null; }
    if (!full) return null;
    var snap = {
        version: full.version,
        // The units the sliders are in (12's LOOK_UNIT_MOVES): a peer on a
        // later build converts a slider rescaled since.
        baseline: full.baseline,
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
        transport: {
            paused: (typeof isPaused !== 'undefined') ? !!isPaused : false,
            frozen: !!window.__fluidFrozen
        },
        ssOrigin: full.ssOrigin || null,
        armColors: full.armColors || null,
        resolution: (window.config && typeof window.config.DYE_RESOLUTION === 'number' &&
                     typeof window.config.SIM_RESOLUTION === 'number')
            ? { dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION }
            : null,
        gravity: window.config
            ? { on: !!window.config.AMBIENT_FORCE,
                x: (typeof window.config.AMBIENT_FORCE_X === 'number') ? window.config.AMBIENT_FORCE_X : 0,
                y: (typeof window.config.AMBIENT_FORCE_Y === 'number') ? window.config.AMBIENT_FORCE_Y : 0 }
            : null
    };
    ['sliders', 'selects', 'checkboxes'].forEach(function (sec) {
        Object.keys(full[sec] || {}).forEach(function (k) {
            if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap[sec][k] = full[sec][k];
        });
    });
    return snap;
}

// The relay SILENTLY drops messages over 16KB. Sanitize first (the receiver
// strips long strings and data URLs anyway), then shed bulky optional
// sections, then as a last resort send the core look alone — a partial
// look always beats a silent total drop. Only a whole-look push (06b
// sendRoomLook(true)) ever comes near the budget; a change is a few keys.
function fitLookSnapshot(snap) {
    if (!snap) return null;
    var out = sanitizeLook(snap) || {};
    var SHED = ['savedColors', 'lightShiftPath', 'ssOrigin'];
    for (var i = 0; i < SHED.length; i++) {
        try { if (JSON.stringify(out).length <= 14000) break; } catch (_) { break; }
        if (out[SHED[i]] != null) console.warn('[mp] room look over budget — dropping ' + SHED[i]);
        delete out[SHED[i]];
    }
    var len = 0;
    try { len = JSON.stringify(out).length; } catch (_) {}
    if (len > 15000) {
        console.warn('[mp] room look still ' + len + 'B after shedding — sending core look only');
        out = { baseline: out.baseline, sliders: out.sliders, checkboxes: out.checkboxes, selects: out.selects,
                colors: out.colors, paletteIndex: out.paletteIndex, material: out.material, gravity: out.gravity };
    }
    return out;
}

// A look arrives from an untrusted peer (the relay forwards it verbatim).
// Only the look itself survives: no file data, no names longer than a
// palette's, nothing that would reach the layer/mask/recording panels and
// their innerHTML templates.
var LOOK_ALLOW = ['sliders', 'checkboxes', 'selects', 'colors', 'savedColors',
    'paletteIndex', 'paletteName', 'lightPos', 'lightShiftPath', 'material',
    'ssOrigin', 'resolution', 'gravity', 'baseline'];
// Bounded recursive clean: primitive leaves (no data: URLs, strings capped),
// depth ≤ 3 so light-shift waypoints survive.
function cleanLookValue(v, depth) {
    var t = typeof v;
    if (v === null || t === 'boolean') return v;
    if (t === 'number') return isFinite(v) ? v : undefined;
    if (t === 'string') return (v.length <= 64 && !/^data:/i.test(v)) ? v : undefined;
    if (t !== 'object' || depth >= 3) return undefined;
    var clean = Array.isArray(v) ? [] : {};
    Object.keys(v).forEach(function (kk) {
        var vv = cleanLookValue(v[kk], depth + 1);
        if (vv === undefined) return;
        if (Array.isArray(clean)) clean.push(vv); else clean[kk] = vv;
    });
    return clean;
}
function sanitizeLook(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    var out = {};
    LOOK_ALLOW.forEach(function (k) {
        if (!(k in snapshot)) return;
        var v = cleanLookValue(snapshot[k], 0);
        if (v !== undefined) out[k] = v;
    });
    return dropPersonal(out);
}

// Apply the parts of a look that are not sliders (switches, menus, colours,
// palette, light, gravity, resolution) through the preset path, marked as a
// remote apply. Sliders go through the glide (06c) instead; a look whose
// sliders are in other units (a peer on another build) comes through here
// whole, because the preset path is what converts them.
function applyLookSections(safeSnap) {
    if (!safeSnap || typeof window.applyPresetSnapshot !== 'function') return;
    // No baseline = a live capture in today's units (applyPresetSnapshot).
    var wasP = isProcessingRemoteEvent, wasA = window.__mpApplyingRemote;
    isProcessingRemoteEvent = true;
    window.__mpApplyingRemote = true;
    try { window.applyPresetSnapshot(safeSnap); }
    catch (e) { console.warn('[mp] room look apply failed', e); }
    finally { isProcessingRemoteEvent = wasP; window.__mpApplyingRemote = wasA; }
    // Resolution (room-only; presets carry it only as the dropdown). The
    // physics is resolution-dependent, so two screens on different grids
    // move differently with identical sliders. Same path as an explicit
    // pick in 05h: config, a framebuffer re-init, and a pinned governor —
    // which can still step DOWN on a machine that cannot keep up.
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
    // Gravity (room-only; see captureLookSnapshot): switch and aim together.
    try {
        var g = safeSnap.gravity;
        if (g && typeof g.on === 'boolean' && window.config) {
            var unit = function (v) { return (typeof v === 'number' && isFinite(v)) ? Math.max(-1, Math.min(1, v)) : 0; };
            var gx = unit(g.x), gy = unit(g.y);
            var c = window.config;
            if (!!c.AMBIENT_FORCE !== g.on || c.AMBIENT_FORCE_X !== gx || c.AMBIENT_FORCE_Y !== gy) {
                if (typeof window.setGravityField === 'function') {
                    window.setGravityField(g.on, gx, gy);
                } else {
                    // Effects not wired yet: write what its restore() reads.
                    c.AMBIENT_FORCE = g.on; c.AMBIENT_FORCE_X = gx; c.AMBIENT_FORCE_Y = gy;
                    if (window.settingsManager) {
                        window.settingsManager.set('pressure.constantOn', g.on);
                        window.settingsManager.set('pressure.fx', gx);
                        window.settingsManager.set('pressure.fy', gy);
                    }
                }
            }
        }
    } catch (e) { /* best-effort */ }
}

// ── The room's look: what we send ───────────────────────────────────
// Changes travel as DELTAS: only what moved since the room last agreed.
// With several people at the controls, whole-look sends would have two
// people dragging two different sliders overwrite each other with stale
// copies; deltas merge, and only the same slider at the same moment is
// last-write-wins. `roomLookBase` is the agreed look — what we last sent
// plus everything the room has sent us.
var ROOM_LOOK_SEND_MS = 100;        // a drag reaches the room ~10 times a second
var ROOM_LOOK_POLL_MS = 1000;       // catch-all for changes that fire no event
var ROOM_LOOK_FULL_DELAY_MS = 500;  // let a newcomer's socket settle before the welcome push
var roomLookBase = null;
var _roomLookTimer = null;
var _roomLookLastSent = 0;
var _roomLookPoll = null;
var _roomLookFullTimer = null;
var _roomLookListening = false;
var _roomLookStartedAt = 0;
var _roomKeyTouched = Object.create(null);   // key → when someone HERE changed it

// The share version of a look: personal parts dropped, and every slider
// read where it is headed rather than where its thumb is mid-glide.
function captureRoomLook() {
    var snap = captureLookSnapshot();
    if (!snap) return null;
    dropPersonal(snap);
    // Gliding sliders count as already at the room's value.
    Object.keys(snap.sliders || {}).forEach(function (id) {
        var t = mpGlideTarget(id);
        if (t !== undefined) snap.sliders[id] = t;
    });
    // While a material is on, Curl is its macro and the material section
    // carries it; the raw CURL the capture reads is the material's output.
    if (window.MaterialModes && window.MaterialModes.active && window.MaterialModes.active()) {
        delete snap.sliders.curl;
    }
    // A wandering light moves itself (13 random mode) on every screen.
    var lm = snap.selects && snap.selects.lightMode;
    if (lm === 'random' || (window.lightSource && window.lightSource.mode === 'random')) delete snap.lightPos;
    return snap;
}

// The sections whose KEYS diff one by one — the whole point of the delta.
var ROOM_KEYED = ['sliders', 'checkboxes', 'selects'];
var ROOM_NODIFF = { version: 1, baseline: 1 };

// What `next` holds that `prev` does not (keys of `next` only).
function lookDelta(prev, next) {
    if (!next) return null;
    if (!prev) return next;
    var out = {}, any = false;
    ROOM_KEYED.forEach(function (sec) {
        var a = prev[sec] || {}, b = next[sec] || {}, d = null;
        Object.keys(b).forEach(function (k) {
            if (a[k] !== b[k]) { d = d || {}; d[k] = b[k]; }
        });
        if (d) { out[sec] = d; any = true; }
    });
    Object.keys(next).forEach(function (k) {
        if (ROOM_KEYED.indexOf(k) !== -1 || ROOM_NODIFF[k]) return;
        var a, b;
        try { a = JSON.stringify(prev[k]); b = JSON.stringify(next[k]); } catch (_) { return; }
        if (a !== b) { out[k] = next[k]; any = true; }
    });
    return any ? out : null;
}

// Fold a delta into a look. Deliberately not a fresh capture: a fresh one
// would also swallow an edit made here in the few ms before our next send,
// and that edit would then never reach anyone.
function mergeLookDelta(base, delta) {
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
    Object.keys(delta || {}).forEach(function (k) {
        if (ROOM_KEYED.indexOf(k) !== -1 && delta[k] && typeof delta[k] === 'object') {
            var merged = {};
            Object.keys(out[k] || {}).forEach(function (kk) { merged[kk] = out[k][kk]; });
            Object.keys(delta[k]).forEach(function (kk) { merged[kk] = delta[k][kk]; });
            out[k] = merged;
        } else {
            out[k] = delta[k];
        }
    });
    return out;
}

// A delta's keys as flat names: 'sliders.curl', 'gravity'.
function lookKeys(delta, fn) {
    Object.keys(delta || {}).forEach(function (k) {
        if (ROOM_NODIFF[k]) return;
        if (ROOM_KEYED.indexOf(k) !== -1) Object.keys(delta[k] || {}).forEach(function (kk) { fn(k + '.' + kk, k, kk); });
        else fn(k, k, null);
    });
}

// Someone else here to share with: a phone brush in the room paints, but
// has no settings to share.
function roomLookPeers() {
    var pads = 0;
    try { pads = (window.PhonePads && window.PhonePads.count) ? window.PhonePads.count() : 0; } catch (_) {}
    return Math.max(0, (connectedClients | 0) - 1 - pads);
}
function roomLookLive() {
    return !!roomLookBase && isMultiplayerEnabled && !!partySocket &&
        partySocket.readyState === WebSocket.OPEN && roomLookPeers() > 0;
}

// `full` sends the whole look instead of a delta: the host's welcome to a
// newcomer, so they land on the room's look rather than inheriting only
// whatever happens to change next.
function sendRoomLook(full) {
    if (!roomLookLive()) return;
    var snap = captureRoomLook();
    if (!snap) return;
    var payload = full ? snap : lookDelta(roomLookBase, snap);
    if (!payload) return;
    roomLookBase = snap;
    payload.baseline = snap.baseline;
    _roomLookLastSent = Date.now();
    partySocket.send(JSON.stringify({
        type: 'room-look', full: !!full, snapshot: fitLookSnapshot(payload), timestamp: Date.now()
    }));
}

// Leading and trailing, at most every ROOM_LOOK_SEND_MS: the first move of
// a drag goes at once (after the control's own handler has run), the rest
// ride the cadence, and the last value always goes.
function scheduleRoomLookSend(delay) {
    if (_roomLookTimer || !roomLookLive()) return;
    var wait = Math.max(delay || 0, ROOM_LOOK_SEND_MS - (Date.now() - _roomLookLastSent));
    _roomLookTimer = setTimeout(function () {
        _roomLookTimer = null;
        sendRoomLook(false);
    }, wait);
}

// The host welcomes whoever just arrived with the whole look.
function scheduleRoomLookWelcome() {
    if (_roomLookFullTimer) clearTimeout(_roomLookFullTimer);
    _roomLookFullTimer = setTimeout(function () {
        _roomLookFullTimer = null;
        if (myRole === 'host') sendRoomLook(true);
    }, ROOM_LOOK_FULL_DELAY_MS);
}

function onRoomLookEvent(e) {
    if (window.__mpApplyingRemote) return;
    var t = e.target;
    if (e.type === 'click' || e.type === 'pointermove') {
        // A drag on a pad (gravity, the light, the shooting star) fires no
        // input event; a held pointer moving off the canvas stands in for
        // one. Painting is not a setting: a stroke on the canvas is left out.
        if (e.type === 'pointermove' && !e.buttons) return;
        if (t && t.closest && t.closest('#canvas-wrapper, #canvas-area')) return;
        scheduleRoomLookSend(e.type === 'click' ? 60 : 0);   // let a click's own work land first
        return;
    }
    if (t && t.id) {
        var R = window.ParamRegistry, sec = null;
        if (R) sec = R.SLIDERS[t.id] ? 'sliders' : R.CHECKBOXES[t.id] ? 'checkboxes' : R.SELECTS[t.id] ? 'selects' : null;
        if (sec) _roomKeyTouched[sec + '.' + t.id] = Date.now();
    }
    scheduleRoomLookSend(0);
}

function startRoomLook() {
    roomLookBase = captureRoomLook() || {};
    _roomLookStartedAt = Date.now();
    _roomKeyTouched = Object.create(null);
    if (!_roomLookListening) {
        _roomLookListening = true;
        // Capture phase, so a control that stops propagation still counts.
        document.addEventListener('input', onRoomLookEvent, true);
        document.addEventListener('change', onRoomLookEvent, true);
        document.addEventListener('click', onRoomLookEvent, true);
        document.addEventListener('pointermove', onRoomLookEvent, true);
        // Plenty of changes fire no event at all — the light dot, the
        // gravity pad, the wheel shortcuts, a palette swatch's side effects.
        // Diff-gated: a room where nothing changes sends nothing.
        _roomLookPoll = setInterval(function () { if (roomLookLive()) sendRoomLook(false); }, ROOM_LOOK_POLL_MS);
    }
}

function stopRoomLook() {
    if (_roomLookListening) {
        _roomLookListening = false;
        document.removeEventListener('input', onRoomLookEvent, true);
        document.removeEventListener('change', onRoomLookEvent, true);
        document.removeEventListener('click', onRoomLookEvent, true);
        document.removeEventListener('pointermove', onRoomLookEvent, true);
        if (_roomLookPoll) { clearInterval(_roomLookPoll); _roomLookPoll = null; }
    }
    if (_roomLookTimer) { clearTimeout(_roomLookTimer); _roomLookTimer = null; }
    if (_roomLookFullTimer) { clearTimeout(_roomLookFullTimer); _roomLookFullTimer = null; }
    roomLookBase = null;
    // Whatever was on its way lands where it was going.
    mpGlideFinishAll();
}

// ── The room's look: what arrives ───────────────────────────────────
function onRoomLook(data) {
    if (!roomLookBase || !data || data.clientId === clientId) return;
    var inc = sanitizeLook(data.snapshot);
    if (!inc) return;
    var now = Date.now();
    // A welcome push (`full`) carries every key, including ones we changed
    // a moment ago and have not sent yet: ours are newer, so they stay.
    if (data.full) {
        lookKeys(inc, function (name, sec, k) {
            if (now - (_roomKeyTouched[name] || 0) > 1500) return;
            if (k === null) delete inc[sec];
            else if (inc[sec]) delete inc[sec][k];
        });
    }
    var mine = captureRoomLook() || {};
    var change = lookDelta(mine, inc);
    // The room holds these values now, whether or not they differ here.
    var incBase = {};
    Object.keys(inc).forEach(function (k) { if (!ROOM_NODIFF[k]) incBase[k] = inc[k]; });
    roomLookBase = mergeLookDelta(roomLookBase, incBase);
    // A welcome is for whoever just arrived; the people already here get
    // the same push and, at most, a correction. It is said even when the
    // settings already matched: it is how a newcomer learns they share them.
    var welcome = !!data.full && now - _roomLookStartedAt < 8000;
    if (!change) {
        if (welcome && typeof window.__mpRoomLookChanged === 'function') {
            try { window.__mpRoomLookChanged({}, data.clientId, true); } catch (_) {}
        }
        return;
    }
    applyRoomLookChange(change, inc.baseline, data.clientId, welcome);
}

function applyRoomLookChange(change, baseline, fromId, welcome) {
    var sliders = change.sliders || null;
    var rest = {};
    Object.keys(change).forEach(function (k) { if (k !== 'sliders') rest[k] = change[k]; });
    var myGen = window.LOOK_BASELINE_GEN;
    var sameUnits = typeof baseline !== 'number' ? myGen === undefined || myGen === 1
        : (myGen === undefined || baseline === myGen);
    // Switches and sections first: a material or a select can decide what a
    // slider means here.
    if (Object.keys(rest).length) {
        if (typeof baseline === 'number') rest.baseline = baseline;
        applyLookSections(rest);
    }
    if (sliders) {
        if (!sameUnits) {
            // A peer on another build: its sliders may be in older units,
            // and the preset path is what converts them (no glide).
            applyLookSections({ sliders: sliders, baseline: typeof baseline === 'number' ? baseline : 1 });
        } else {
            var R = window.ParamRegistry;
            var material = window.MaterialModes && window.MaterialModes.active && window.MaterialModes.active();
            Object.keys(sliders).forEach(function (id) {
                if (id === 'curl' && material) return;   // the material section carried it
                var v = R && R.clampSlider ? R.clampSlider(id, sliders[id]) : Number(sliders[id]);
                if (v === null || !isFinite(v)) return;
                mpGlideTo(id, v);
            });
        }
    }
    // What landed is the room's value from here on. Applying a peer's value
    // can come back a hair different here — a step the thumb rounds to, a
    // value converted from an older build, a menu without that option — and
    // if the agreed look kept the number that ARRIVED, the next diff would
    // send ours back and the key would bounce between screens. So the keys
    // just applied take what this screen now holds (a gliding slider reads
    // as its target, which is the value sent). Only those keys: anything
    // else that differs is an edit made here, and still goes out.
    var landed = captureRoomLook();
    if (landed && roomLookBase) {
        var base = mergeLookDelta(roomLookBase, {});
        lookKeys(change, function (name, sec, k) {
            if (k === null) { if (sec in landed) base[sec] = landed[sec]; return; }
            if (!landed[sec] || !(k in landed[sec])) return;
            var into = {};
            Object.keys(base[sec] || {}).forEach(function (kk) { into[kk] = base[sec][kk]; });
            into[k] = landed[sec][k];
            base[sec] = into;
        });
        roomLookBase = base;
    }
    if (typeof window.__mpRoomLookChanged === 'function') {
        try { window.__mpRoomLookChanged(change, fromId, welcome); } catch (_) {}
    }
}
