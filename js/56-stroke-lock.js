// ═══════════════════════════════════════════════════════════════════
// js/56-stroke-lock.js — Stroke locks: hold a key and the brush keeps its
//   DISTANCE from the centre (a clean circle to swirl round) or its ANGLE
//   (a straight spoke, in toward the centre and back out, for driving
//   colours into each other).
// LOAD ORDER: plain <script> after 48-hotkeys.js and before
//   20-mixer-layout.js, which builds the two key pickers in Stroke and
//   replay. Reads canvas / pointer / settingsManager lazily.
// PROVIDES: window.StrokeLock
// USED BY: 05d (every painted pointer and touch position goes through
//   apply()), 31 (the brush cursor sits where the paint will go), 49
//   (Settings → Hotkeys lists the two keys).
//
// The ORIGIN is the canvas centre, the point Multi-Brush turns its arms
// round (05g multiSplat), in canvas px like everything the stroke carries.
// So a Keep-distance circle is one ring every arm traces together, and a
// Keep-angle spoke brings the arms' colours straight into each other.
//
// A hand never holds a circle exactly. The lock takes what the hand does
// and keeps only the part that is allowed: the radius (or the angle) is
// the one the brush had when the key went down, and the hand's drift off
// it is simply not painted. Keep angle projects the hand onto its line.
// Keep distance moves the brush round its circle by how far the hand TURNS
// round the centre (orbitTurn), so a hand that wanders near the middle
// slows the brush instead of flinging it across the circle. The position
// is corrected where 05d reads it,
// before the stroke engine, the recorder, the replay store and the room
// see it, so a locked stroke replays, records and reaches peers exactly as
// it was painted.
//
// Keys are the person's own (js/48 pickers, no defaults), written through
// to settingsManager 'hotkeys.strokeLocks' the moment they are chosen,
// like every hotkey. Holding BOTH pins the brush where it is.
//
// Letting go mid-stroke must not draw a line from the locked spot to the
// hand, however far the hand strayed: the difference EASES off over the
// next stretch of travel (GLIDE_*), and the stroke flows back under the
// hand. A key pressed while the pointer is off the canvas takes its anchor
// where the brush first lands.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var KEY = 'hotkeys.strokeLocks';
    var KINDS = ['distance', 'angle'];
    var NAMES = { distance: 'Keep distance', angle: 'Keep angle' };
    var DOES = {
        distance: 'hold to paint on a circle round the centre',
        angle: 'hold to paint straight in and out of the centre'
    };
    // Closer to the centre than this (canvas px), a spoke has no direction
    // yet: Keep angle waits for the brush to leave the middle.
    var MIN_SPOKE_PX = 3;
    // Keep distance follows the hand's TURNING round the centre. Beyond
    // this share of the lock's radius the brush turns exactly as the hand
    // does; closer in, the turn fades out toward nothing at the centre.
    var ORBIT_INNER = 0.5;
    // The ease back to the hand, as travel: 1.5x how far the hand had
    // strayed, kept between these shares of the canvas's short side.
    var GLIDE_PER_OFFSET = 1.5, GLIDE_MIN = 0.02, GLIDE_MAX = 0.3;

    var keys = { distance: '', angle: '' };
    var locks = {};         // kind → { pending } | { r, phi } | { ux, uy }
    var pin = null;         // both anchored: the spot the brush stays on
    var glide = null;       // { ox, oy, x0, y0, far, span } easing off after a change mid-stroke
    var lastRaw = null;     // the hand, canvas px
    var lastOut = null;     // where the brush went for it
    var overCanvas = false;
    var listeners = [];

    function cv() { return document.getElementById('canvas'); }
    function H() { return window.Hotkeys || null; }
    function strokeLive() { var p = window.pointer; return !!(p && p.down); }
    function smooth(t) { return t * t * (3 - 2 * t); }

    function anchored(k) { return !!(locks[k] && !locks[k].pending); }
    function anyOn() { return !!(locks.distance || locks.angle); }
    function anyPending() { return !!((locks.distance && locks.distance.pending) || (locks.angle && locks.angle.pending)); }

    // ─── GEOMETRY (canvas px) ───────────────────────────────────
    function anchor(kind, x, y) {
        var c = cv();
        if (!c) return false;
        var rx = x - c.width * 0.5, ry = y - c.height * 0.5, d = Math.hypot(rx, ry);
        if (kind === 'distance') {
            // phi: where on the circle the brush is. A brush exactly on the
            // centre has no direction; it starts at 0 (its radius is 0, so
            // it stays on the centre whichever way phi turns).
            locks.distance = { r: d, phi: d > 1e-6 ? Math.atan2(ry, rx) : 0 };
            return true;
        }
        if (d < MIN_SPOKE_PX) return false;
        locks.angle = { ux: rx / d, uy: ry / d };
        return true;
    }

    // How far the brush turns round the circle as the hand moves from the
    // previous sample to (x, y). Taking the hand's own angle instead made
    // the brush whip round whenever the hand came near the centre — there a
    // few pixels are half a turn, and passing the middle flipped the brush
    // to the far side of the circle. So the brush turns by the hand's TURN:
    // exactly, while the hand is further out than ORBIT_INNER of the radius
    // (both samples); nearer in, by the area the hand sweeps round the
    // centre over that inner radius squared, which shrinks to nothing at
    // the centre and is zero for a hand crossing straight through it. The
    // two agree where they meet, so the brush speeds up and slows down
    // smoothly as the hand comes in and goes out.
    function orbitTurn(x, y) {
        var c = cv(), dl = locks.distance;
        if (!c || !lastRaw || !dl) return 0;
        var ox = c.width * 0.5, oy = c.height * 0.5;
        var ax = lastRaw.x - ox, ay = lastRaw.y - oy, bx = x - ox, by = y - oy;
        var cross = ax * by - ay * bx;
        if (!cross) return 0;
        var turn = Math.atan2(cross, ax * bx + ay * by);
        var inner = ORBIT_INNER * dl.r;
        if (!(inner > 1e-6)) return turn;
        var swept = Math.abs(cross) / (inner * inner);
        return Math.abs(turn) <= swept ? turn : (turn < 0 ? -swept : swept);
    }

    // Where the anchored locks put a hand at (x, y), or null when none is.
    // `commit` keeps Keep distance's turn (apply); without it nothing moves
    // (peek). The spoke is a whole line through the centre: pulling past the
    // middle carries on out the other side instead of stalling on it.
    function constrain(x, y, commit) {
        var dOn = anchored('distance'), aOn = anchored('angle');
        if (!dOn && !aOn) return null;
        if (dOn && aOn) return pin ? { x: pin.x, y: pin.y } : (lastOut ? { x: lastOut.x, y: lastOut.y } : null);
        var c = cv();
        if (!c) return null;
        var ox = c.width * 0.5, oy = c.height * 0.5;
        if (dOn) {
            var dl = locks.distance, phi = dl.phi + orbitTurn(x, y);
            if (commit) dl.phi = phi;
            return { x: ox + dl.r * Math.cos(phi), y: oy + dl.r * Math.sin(phi) };
        }
        var a = locks.angle, t = (x - ox) * a.ux + (y - oy) * a.uy;
        return { x: ox + a.ux * t, y: oy + a.uy * t };
    }

    // The locks' answer plus whatever is still easing off. `commit` moves
    // the ease and the turn along (apply); without it the call changes
    // nothing (peek).
    function resolve(x, y, commit) {
        var out = constrain(x, y, commit) || { x: x, y: y };
        var g = glide;
        if (g) {
            var far = Math.max(g.far, Math.hypot(x - g.x0, y - g.y0));
            if (commit) g.far = far;
            if (far >= g.span) { if (commit) glide = null; }
            else {
                var f = 1 - smooth(far / g.span);
                out = { x: out.x + g.ox * f, y: out.y + g.oy * f };
            }
        }
        return out;
    }

    // The lock set changed under a live stroke: wherever the new set would
    // put the hand, the brush is still where it was, and eases across.
    // Hovering, there is no paint to join up — the cursor just goes there.
    function rebase() {
        glide = null;
        if (!strokeLive() || !lastOut || !lastRaw) return;
        var now = constrain(lastRaw.x, lastRaw.y) || lastRaw;
        var ox = lastOut.x - now.x, oy = lastOut.y - now.y, off = Math.hypot(ox, oy);
        if (off < 0.5) return;
        var c = cv(), side = c ? Math.min(c.width, c.height) : 1080;
        var span = Math.max(GLIDE_MIN * side, Math.min(GLIDE_MAX * side, GLIDE_PER_OFFSET * off));
        glide = { ox: ox, oy: oy, x0: lastRaw.x, y0: lastRaw.y, far: 0, span: span };
    }

    function settlePending(p) {
        var took = false;
        KINDS.forEach(function (k) {
            if (locks[k] && locks[k].pending && anchor(k, p.x, p.y)) took = true;
        });
        if (!took) return;
        pin = (anchored('distance') && anchored('angle')) ? { x: p.x, y: p.y } : null;
        rebase();
        paintGuide();
        emit();
    }

    // ─── PRESS AND RELEASE ──────────────────────────────────────
    // Where the brush is right now, if it is on the canvas at all. The last
    // position 05d asked about, rather than pointer.x/y: that one stands
    // still while a replay or a pause holds the stroke, and the hand doesn't.
    function brushSpot() {
        var live = strokeLive();
        if ((live || overCanvas) && lastOut) return { x: lastOut.x, y: lastOut.y };
        if (live) { var p = window.pointer; return { x: p.x, y: p.y }; }
        return null;
    }

    function engage(kind) {
        if (KINDS.indexOf(kind) < 0) return;
        locks[kind] = { pending: true };
        var here = brushSpot();
        if (here) settlePending(here);
        paintGuide();
        emit();
    }

    function disengage(kind) {
        if (!locks[kind]) return;
        delete locks[kind];
        pin = null;
        // Keep distance left on its own (both were held): it turns on from
        // where the brush is, not from where it stood before the pin.
        var c = cv();
        if (anchored('distance') && lastOut && c) {
            locks.distance.phi = Math.atan2(lastOut.y - c.height * 0.5, lastOut.x - c.width * 0.5);
        }
        rebase();
        paintGuide();
        emit();
    }

    function releaseAll() { KINDS.forEach(disengage); }

    // ─── THE STROKE'S POSITIONS ─────────────────────────────────
    // 05d hands every painted position through here: press, move (each
    // coalesced sample), the live-cursor spot, touch.
    function apply(x, y) {
        if (glide && !strokeLive()) glide = null;   // the stroke it was easing has ended
        // Turned from the previous sample, then this one becomes it.
        var out = resolve(x, y, true);
        lastRaw = { x: x, y: y };
        // Recorded first: a lock that anchors now anchors on this sample,
        // and the brush is already here.
        lastOut = out;
        if (anyPending()) settlePending(out);
        return out;
    }

    function peek(x, y) { return resolve(x, y, false); }

    // True while the brush may not be where the hand is.
    function shaping() { return anyOn() || !!glide; }

    // For the brush cursor (31): a viewport point → where the paint goes,
    // through the same box 02's getCanvasCoordinates maps a press with.
    function clientPoint(clientX, clientY) {
        var c = cv();
        if (!c || !shaping()) return { x: clientX, y: clientY };
        var r = c.getBoundingClientRect();
        var sx = r.width ? c.width / r.width : 1, sy = r.height ? c.height / r.height : 1;
        var q = peek((clientX - r.left) * sx, (clientY - r.top) * sy);
        return { x: r.left + q.x / sx, y: r.top + q.y / sy };
    }

    (function trackHover() {
        var c = cv();
        if (!c) return;
        c.addEventListener('pointerenter', function () { overCanvas = true; });
        // A pointer already over the canvas when the page loaded never
        // entered it; its first move says it is here.
        c.addEventListener('pointermove', function () { overCanvas = true; });
        c.addEventListener('pointerleave', function () { overCanvas = false; });
    })();

    // ─── THE GUIDE ──────────────────────────────────────────────
    // While a lock is held: the centre, and the circle or spoke the brush
    // is held to. Inside #canvas-wrapper one step above the canvas, like
    // Mandala Studio's guides (34), so Zoom View carries it and the side
    // panels stay on top. Drawn on a change only; nothing animates.
    // Off unless Show guides is ticked (Stroke Locks): the brush cursor
    // already rides the lock, and lines over the painting are a choice.
    var GUIDES_KEY = 'strokeLock.showGuides';
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var svg = null;
    var showGuides = false;

    function setShowGuides(on) {
        on = !!on;
        if (showGuides === on) return;
        showGuides = on;
        var m = window.settingsManager;
        if (m) m.set(GUIDES_KEY, on);
        paintGuide();
        emit();
    }

    function ensureGuide() {
        if (svg) return svg;
        var wrap = document.getElementById('canvas-wrapper');
        if (!wrap) return null;
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.id = 'strokeLockGuide';
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;pointer-events:none;display:none;';
        wrap.appendChild(svg);
        return svg;
    }

    // Each mark twice: a dark halo under a light line, so it reads on pale
    // paint and on black alike.
    function stroked(el) {
        var ns = ' fill="none" vector-effect="non-scaling-stroke"';
        return el.replace('/>', ' stroke="rgba(0,0,0,0.45)" stroke-width="3"' + ns + '/>') +
               el.replace('/>', ' stroke="rgba(255,255,255,0.8)" stroke-width="1.25"' + ns + '/>');
    }

    function paintGuide() {
        if (!anyOn() || !showGuides) { if (svg) svg.style.display = 'none'; return; }
        var c = cv();
        if (!c || !c.width || !c.height || !ensureGuide()) return;
        var W = c.offsetWidth, Hh = c.offsetHeight;
        svg.style.left = c.offsetLeft + 'px';
        svg.style.top = c.offsetTop + 'px';
        svg.style.width = W + 'px';
        svg.style.height = Hh + 'px';
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
        var cz = parseInt(getComputedStyle(c).zIndex, 10);
        svg.style.zIndex = (isFinite(cz) ? cz : 2) + 1;

        var kx = W / c.width, ky = Hh / c.height;
        var cx = W / 2, cy = Hh / 2;
        var parts = '';
        if (anchored('distance') && !pin) {
            var r = locks.distance.r;
            parts += stroked('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (r * kx) + '" ry="' + (r * ky) + '"/>');
        }
        if (anchored('angle') && !pin) {
            var a = locks.angle, dx = a.ux * kx, dy = a.uy * ky, m = Math.hypot(dx, dy) || 1, L = Math.hypot(W, Hh);
            dx = dx / m * L; dy = dy / m * L;
            parts += stroked('<line x1="' + (cx - dx) + '" y1="' + (cy - dy) + '" x2="' + (cx + dx) + '" y2="' + (cy + dy) + '"/>');
        }
        if (pin) {
            parts += stroked('<circle cx="' + (pin.x * kx) + '" cy="' + (pin.y * ky) + '" r="7"/>');
        }
        // The origin: a small cross, drawn last so it sits on the lines.
        parts += stroked('<path d="M' + (cx - 6) + ' ' + cy + ' H' + (cx + 6) + ' M' + cx + ' ' + (cy - 6) + ' V' + (cy + 6) + '"/>');
        svg.innerHTML = parts;
        svg.style.display = 'block';
    }

    (function followCanvas() {
        var c = cv();
        if (!c) return;
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { if (anyOn()) paintGuide(); }).observe(c);
        // Reordering layers rewrites the canvas's inline z-index (see 34).
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(function () { if (anyOn()) paintGuide(); })
                .observe(c, { attributes: true, attributeFilter: ['style'] });
        }
    })();

    // ─── KEYS ───────────────────────────────────────────────────
    function load() {
        var m = window.settingsManager, h = H();
        var d = m ? m.get(KEY) : null;
        KINDS.forEach(function (k) {
            var v = (d && typeof d[k] === 'string') ? d[k] : '';
            keys[k] = h ? h.normalize(v) : v;
        });
        showGuides = !!(m && m.get(GUIDES_KEY) === true);
    }

    function save() {
        var m = window.settingsManager;
        if (m) m.set(KEY, { distance: keys.distance, angle: keys.angle });
        var h = H();
        if (h) h.changed();
    }

    function setKey(kind, combo) {
        if (KINDS.indexOf(kind) < 0) return;
        var h = H();
        var c = h ? h.normalize(combo || '') : String(combo || '');
        if (keys[kind] === c) return;
        disengage(kind);   // a hold on the old key is not this lock's any more
        keys[kind] = c;
        save();
        emit();
    }

    function register() {
        var h = H();
        if (!h || typeof h.addSource !== 'function') return;
        h.addSource('strokeLock', function () {
            return KINDS.filter(function (k) { return !!keys[k]; }).map(function (k) {
                return {
                    id: 'lock:' + k,
                    combo: keys[k],
                    label: NAMES[k],
                    group: 'Stroke locks',
                    where: 'Stroke and replay',
                    does: DOES[k],
                    run: function () { engage(k); },
                    release: function () { disengage(k); },
                    set: function (combo) { setKey(k, combo); },
                    clear: function () { setKey(k, ''); }
                };
            });
        });
    }

    function emit() {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](); } catch (e) { console.warn('[StrokeLock] listener failed', e); }
        }
    }

    load();
    register();

    window.StrokeLock = {
        KINDS: KINDS.slice(),
        NAMES: NAMES,
        apply: apply,
        peek: peek,
        clientPoint: clientPoint,
        shaping: shaping,
        key: function (kind) { return keys[kind] || ''; },
        setKey: setKey,
        engage: engage,
        release: disengage,
        releaseAll: releaseAll,
        isHeld: function (kind) { return !!locks[kind]; },
        showGuides: function () { return showGuides; },
        setShowGuides: setShowGuides,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        // Tests and console poking: what is held and how.
        state: function () {
            return {
                distance: locks.distance ? JSON.parse(JSON.stringify(locks.distance)) : null,
                angle: locks.angle ? JSON.parse(JSON.stringify(locks.angle)) : null,
                pin: pin ? { x: pin.x, y: pin.y } : null,
                glide: glide ? { ox: glide.ox, oy: glide.oy, far: glide.far, span: glide.span } : null
            };
        }
    };
})();
