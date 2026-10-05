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
// A hand never holds a circle exactly. The lock keeps its own copy of the
// hand (the HAND below): it moves by what the real hand DOES, sample to
// sample, and it cannot leave the guide's area — a band either side of
// the circle or the line (AREA_PX on screen), never nearer the centre than
// half the radius, never off the canvas along the spoke. However far the
// real hand strays, the one the lock steers by is still beside the guide,
// so coming back works at once and a lap that drifts across the desk turns
// the brush as evenly as one that doesn't (2026-09-29: "we're keeping the
// mouse in the right area the whole time"). The brush is the hand put on
// the guide: its bearing on the circle, its foot on the line. The guide
// marks the hand with a small ring. The position is corrected where 05d
// reads it,
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
//
// While a lock is held a MOUSE stays on the canvas (Pointer Lock, see THE
// MOUSE STAYS IN): no arrow anywhere, no edge of the canvas or the screen
// to stop the hand, until the keys and the button are all up. 58 asks for
// the pointer back when the radial menu opens.
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
    // The guide's area, where the hand may be: this far either side of the
    // circle or the line, in CSS px on screen, and for Keep distance never
    // nearer the centre than this share of the radius (bearings near the
    // middle swing wildly: a few px there are half a turn).
    var AREA_PX = 24;
    var AREA_INNER = 0.5;
    // The ease back to the hand, as travel: 1.5x how far the hand had
    // strayed, kept between these shares of the canvas's short side.
    var GLIDE_PER_OFFSET = 1.5, GLIDE_MIN = 0.02, GLIDE_MAX = 0.3;

    var keys = { distance: '', angle: '' };
    var locks = {};         // kind → { pending } | { r, hx, hy } | { ux, uy, hx, hy }  (hx, hy: the HAND, canvas px)
    var pin = null;         // both anchored: the spot the brush stays on
    var glide = null;       // { ox, oy, x0, y0, far, span } easing off after a change mid-stroke
    var lastRaw = null;     // the real hand, canvas px
    var lastWho = null;     // ...and the pointer it came from
    var handJump = false;   // that pointer left or came back: its next sample moves nothing
    var lastOut = null;     // where the brush went for it
    var overCanvas = false;
    var lastType = '';      // the kind of the last real pointer over the canvas
    var listeners = [];
    var handListeners = [];

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
            // The hand starts where the brush is. A brush exactly on the
            // centre has radius 0 and stays there whatever the hand does.
            locks.distance = { r: d, hx: x, hy: y };
            return true;
        }
        if (d < MIN_SPOKE_PX) return false;
        locks.angle = { ux: rx / d, uy: ry / d, hx: x, hy: y };
        return true;
    }

    // The area's half-width in canvas px: AREA_PX on screen, whatever the
    // canvas resolution or Zoom View.
    function areaPx() {
        var c = cv();
        var w = c ? c.getBoundingClientRect().width : 0;
        return AREA_PX * ((c && w > 0) ? c.width / w : 1);
    }

    // The HAND of lock `kind` moved by (dx, dy), then kept inside the
    // guide's area. Taking the real hand's own position instead (the first
    // cut) or its turn round the centre (the second) steered by wherever
    // the hand had wandered to: near the middle a few px were half a turn,
    // and a lap drifting off-centre sped the brush up on the near side and
    // slowed it on the far one. Kept beside the guide, the hand's bearing
    // (or its place along the spoke) is always a steady thing to steer by,
    // and a hand pushing out past the edge slides along it like a cursor
    // along the edge of the screen.
    function keepHand(kind, dx, dy) {
        var c = cv(), L = locks[kind];
        var ox = c.width * 0.5, oy = c.height * 0.5, w = areaPx();
        var x = L.hx + dx - ox, y = L.hy + dy - oy;
        if (kind === 'distance') {
            if (!(L.r > 1e-6)) return { x: ox, y: oy };
            var d = Math.hypot(x, y);
            // Straight onto the centre: stay where it was (it has no bearing there).
            if (!(d > 1e-9)) { x = L.hx - ox; y = L.hy - oy; d = Math.hypot(x, y) || 1; }
            var k = Math.min(L.r + w, Math.max(L.r - w, AREA_INNER * L.r, d)) / d;
            return { x: ox + x * k, y: oy + y * k };
        }
        // Along the spoke (t) no further than the canvas edge; across it (s)
        // no further than the area. The spoke is a whole line through the
        // centre: pulling past the middle carries on out the other side.
        var ux = L.ux, uy = L.uy;
        var reach = Math.min(Math.abs(ux) > 1e-9 ? ox / Math.abs(ux) : Infinity,
                             Math.abs(uy) > 1e-9 ? oy / Math.abs(uy) : Infinity);
        var t = Math.max(-reach, Math.min(reach, x * ux + y * uy));
        var s = Math.max(-w, Math.min(w, y * ux - x * uy));
        return { x: ox + ux * t - uy * s, y: oy + uy * t + ux * s };
    }

    // Where lock `kind` puts the brush for a hand at (x, y): its bearing on
    // the circle, its foot on the spoke.
    function onGuide(kind, x, y) {
        var c = cv(), L = locks[kind];
        var ox = c.width * 0.5, oy = c.height * 0.5;
        if (kind === 'distance') {
            var rx = x - ox, ry = y - oy, d = Math.hypot(rx, ry);
            if (!(d > 1e-9) || !(L.r > 1e-6)) return { x: ox, y: oy };
            return { x: ox + rx / d * L.r, y: oy + ry / d * L.r };
        }
        var t = (x - ox) * L.ux + (y - oy) * L.uy;
        return { x: ox + L.ux * t, y: oy + L.uy * t };
    }

    // Where the anchored locks put the brush when the real hand has moved
    // by (dx, dy), or null when none is anchored. `commit` moves the HAND
    // (apply); without it nothing moves (peek).
    function constrain(dx, dy, commit) {
        var dOn = anchored('distance'), aOn = anchored('angle');
        if (!dOn && !aOn) return null;
        if (dOn && aOn) return pin ? { x: pin.x, y: pin.y } : (lastOut ? { x: lastOut.x, y: lastOut.y } : null);
        if (!cv()) return null;
        var kind = dOn ? 'distance' : 'angle', L = locks[kind];
        var h = keepHand(kind, dx, dy);
        if (commit) { L.hx = h.x; L.hy = h.y; }
        return onGuide(kind, h.x, h.y);
    }

    // The locks' answer plus whatever is still easing off, for the real hand
    // at (x, y) having moved by (dx, dy). `commit` moves the ease and the
    // HAND along (apply); without it the call changes nothing (peek).
    function resolve(x, y, dx, dy, commit) {
        var out = constrain(dx, dy, commit) || { x: x, y: y };
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
        var now = constrain(0, 0) || lastRaw;
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
        // A fresh press of a key: the mouse may be taken again, even after
        // the radial menu or a failed ask gave it back.
        confineAsked = false;
        noConfine = false;
        confine(null);
        paintGuide();
        emit();
    }

    function disengage(kind) {
        if (!locks[kind]) return;
        delete locks[kind];
        pin = null;
        // The other lock left on its own (both were held): its hand goes on
        // from where the brush is, not from where it stood before the pin.
        var rest = anchored('distance') ? 'distance' : (anchored('angle') ? 'angle' : null);
        if (rest && lastOut) { locks[rest].hx = lastOut.x; locks[rest].hy = lastOut.y; }
        // The last key up under a held button: the mouse stays in until the
        // button comes up, and the brush goes on from where it is (the hand
        // is wherever the lock was carrying it, nowhere the person can see).
        if (!anyOn() && confined && strokeLive() && lastOut) lastRaw = { x: lastOut.x, y: lastOut.y };
        rebase();
        if (!anyOn() && !strokeLive()) freeCursor(false);
        paintGuide();
        emit();
    }

    function releaseAll() { KINDS.forEach(disengage); }

    // ─── THE MOUSE STAYS IN ─────────────────────────────────────
    // While a lock is held the canvas keeps the mouse (Pointer Lock): the
    // arrow is gone everywhere and cannot leave, however far the hand
    // pushes, and the lock steers until the keys are up (2026-10-05: "make
    // sure the mouse doesn't show when it leaves the canvas, and keeps its
    // behavior until they release"). A held mouse reports only how far it
    // MOVED — its clientX/Y stand still where the lock took it — so the real
    // hand is carried on here from those steps, in canvas px, from the last
    // place it was seen. That is all the HAND needs: it only ever moves by
    // the hand's steps, and now no screen edge cuts them off.
    // Asked for on the key's press, on a paint press, or on the first move
    // over the canvas while a key is held; a mouse only (a pen or a finger
    // is where it touches). Given back when the keys and the button are all
    // up, and the browser puts the arrow back where the lock took it. Let go
    // of the keys mid-stroke and the canvas keeps the mouse until the button
    // comes up, the brush going on from where it is, never past the canvas's
    // edge.
    var SPIKE_PX = 300;         // one sample further than this (CSS px) is a warp, not a hand
    var confined = false;       // the canvas has the mouse
    var confineAsked = false;   // ...asked for since the last key or press
    var noConfine = false;      // given back for the radial menu: not again until the next key or press
    var lockJump = false;       // just taken: its first sample moves nothing
    var reseat = false;         // just given back: the arrow is somewhere else

    function confine(e) {
        if (confined || confineAsked || noConfine || !anyOn()) return;
        var c = cv();
        if (!c || typeof c.requestPointerLock !== 'function') return;
        if (e ? (e.pointerType !== 'mouse' || !e.isTrusted) : lastType !== 'mouse') return;
        if (!overCanvas && !strokeLive()) return;
        confineAsked = true;
        try {
            var p = c.requestPointerLock();
            if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (_) {}
    }

    // `hold`: not again until the next key or paint press (the radial menu).
    function freeCursor(hold) {
        confineAsked = false;
        if (hold) noConfine = true;
        var c = cv();
        if (c && document.pointerLockElement === c) document.exitPointerLock();
    }

    // A held mouse's step for sample `e`, in canvas px; null when `e` is not
    // one (nothing held, a pen, a touch, an event the app made itself).
    function confinedStep(e) {
        if (!confined || !e || e.pointerType !== 'mouse' || e.isTrusted === false) return null;
        if (lockJump) { lockJump = false; return { dx: 0, dy: 0 }; }
        var mx = +e.movementX || 0, my = +e.movementY || 0;
        if (Math.abs(mx) > SPIKE_PX || Math.abs(my) > SPIKE_PX) return { dx: 0, dy: 0 };
        var c = cv(), r = c.getBoundingClientRect();
        return { dx: mx * (r.width ? c.width / r.width : 1), dy: my * (r.height ? c.height / r.height : 1) };
    }

    document.addEventListener('pointerlockchange', function () {
        var c = cv(), now = !!c && document.pointerLockElement === c;
        if (now === confined) return;
        confined = now;
        lockJump = now;
        reseat = !now;
    });
    // The button up with no key held: the stroke the mouse was kept for is
    // over. (A stroke that ends without one — a chorded lift — is caught by
    // the next sample, in apply.)
    function strokeOver(e) {
        if (confined && !anyOn() && !(e && e.buttons)) freeCursor(false);
    }
    window.addEventListener('pointerup', strokeOver);
    window.addEventListener('pointercancel', strokeOver);

    // ─── THE STROKE'S POSITIONS ─────────────────────────────────
    // 05d hands every painted position through here: press, move (each
    // coalesced sample), the live-cursor spot, touch. `who` is the pointer
    // (or touch) it came from: the HAND moves by one pointer's own motion,
    // so a sample from another device, or from a pointer just back over
    // the canvas, moves it nothing instead of dragging it across. `e` is
    // the sample itself: a held mouse's carries only its step (see THE
    // MOUSE STAYS IN).
    function apply(x, y, who, e) {
        if (glide && !strokeLive()) glide = null;   // the stroke it was easing has ended
        var step = confinedStep(e);
        if (step) {
            var from = lastRaw || { x: x, y: y };
            x = from.x + step.dx;
            y = from.y + step.dy;
            // Steering nothing, the hand is the brush: it stops at the
            // canvas's edge as the arrow would at the screen's (never pulled
            // in from past it, only kept from going further).
            if (!anchored('distance') && !anchored('angle')) {
                var c = cv();
                x = Math.max(Math.min(0, from.x), Math.min(Math.max(c.width, from.x), x));
                y = Math.max(Math.min(0, from.y), Math.min(Math.max(c.height, from.y), y));
            }
        } else if (reseat && e && e.pointerType === 'mouse') {
            // The mouse given back mid-stroke (the browser let go of it): the
            // arrow is where the lock took it, not where the hand was carried,
            // so the brush stays where it is and eases over.
            reseat = false;
            handJump = true;
            lastRaw = { x: x, y: y };
            rebase();
        }
        var jump = !lastRaw || handJump || who !== lastWho;
        handJump = false;
        lastWho = who;
        // Moved by the step from the previous sample, then this one becomes it.
        var out = resolve(x, y, jump ? 0 : x - lastRaw.x, jump ? 0 : y - lastRaw.y, true);
        lastRaw = { x: x, y: y };
        // Recorded first: a lock that anchors now anchors on this sample,
        // and the brush is already here.
        lastOut = out;
        if (anyPending()) settlePending(out);
        if (anyOn()) handMoved();
        if (e && e.isTrusted) {
            if (e.type === 'pointerdown') { confineAsked = false; noConfine = false; }
            if (anyOn()) confine(e);
            else if (confined && !strokeLive() && !e.buttons) freeCursor(false);
        }
        return out;
    }

    function peek(x, y) {
        return resolve(x, y, lastRaw ? x - lastRaw.x : 0, lastRaw ? y - lastRaw.y : 0, false);
    }

    // The HAND and the spot on the guide the brush takes from it (canvas
    // px), while exactly one lock steers; null otherwise (none, pending,
    // or both held: pinned).
    function hand() {
        var dOn = anchored('distance'), aOn = anchored('angle');
        if (dOn === aOn || !cv()) return null;
        var kind = dOn ? 'distance' : 'angle', L = locks[kind];
        return { hand: { x: L.hx, y: L.hy }, brush: onGuide(kind, L.hx, L.hy) };
    }

    // True while the brush may not be where the hand is (or where the arrow
    // would be: a held mouse's clientX/Y stand still).
    function shaping() { return anyOn() || !!glide || confined; }

    // For the brush cursor (31): a viewport point → where the paint goes,
    // through the same box 02's getCanvasCoordinates maps a press with.
    // While the canvas holds the mouse the point says nothing (it is where
    // the lock took it): the brush is where the last sample put it.
    function clientPoint(clientX, clientY) {
        var c = cv();
        if (!c || !shaping()) return { x: clientX, y: clientY };
        var r = c.getBoundingClientRect();
        var sx = r.width ? c.width / r.width : 1, sy = r.height ? c.height / r.height : 1;
        var q = (confined && lastOut) ? lastOut : peek((clientX - r.left) * sx, (clientY - r.top) * sy);
        return { x: r.left + q.x / sx, y: r.top + q.y / sy };
    }

    (function trackHover() {
        var c = cv();
        if (!c) return;
        // The hand's pointer leaving or coming back: where it re-enters says
        // nothing about how far it moved, so its next sample moves the HAND
        // nothing (see apply).
        function away(e) { if (e.pointerId === lastWho) handJump = true; }
        // Only a real mouse is ever held in (THE MOUSE STAYS IN).
        function kind(e) { if (e.isTrusted) lastType = e.pointerType; }
        c.addEventListener('pointerenter', function (e) { overCanvas = true; kind(e); away(e); });
        // A pointer already over the canvas when the page loaded never
        // entered it; its first move says it is here.
        c.addEventListener('pointermove', function (e) { overCanvas = true; kind(e); });
        c.addEventListener('pointerdown', kind);
        c.addEventListener('pointerleave', function (e) { overCanvas = false; away(e); });
        // A finger coming down lands anywhere (and touch ids repeat): ahead
        // of 05d's touchstart, which paints its first sample.
        c.addEventListener('touchstart', function () { handJump = true; }, { capture: true, passive: true });
    })();

    // ─── THE GUIDE ──────────────────────────────────────────────
    // While a lock is held: the centre, the circle or spoke the brush is
    // held to, and a small ring on the HAND tied to the spot it puts the
    // brush on. Inside #canvas-wrapper one step above the canvas, like
    // Mandala Studio's guides (34), so Zoom View carries it and the side
    // panels stay on top. The marks are redrawn on a change; the hand's
    // ring just moves (once a frame at most).
    // Off unless Show guides is ticked (Stroke Locks): the brush cursor
    // already rides the lock, and lines over the painting are a choice.
    // The Pen Input Window (47) draws the same marks over its own box with
    // guideMarkup() + paintHand(), under its own Guides menu.
    var GUIDES_KEY = 'strokeLock.showGuides';
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var svg = null, svgMarks = null, svgHand = null;
    var showGuides = false;
    var handRaf = 0;

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
        svgMarks = document.createElementNS(SVG_NS, 'g');
        svgHand = document.createElementNS(SVG_NS, 'g');
        svg.appendChild(svgMarks);
        svg.appendChild(svgHand);
        wrap.appendChild(svg);
        return svg;
    }

    // Each mark twice: a dark halo under a light line, so it reads on pale
    // paint and on black alike.
    var HALO = 'rgba(0,0,0,0.45)', LINE = 'rgba(255,255,255,0.8)';
    function stroked(el) {
        var ns = ' fill="none" vector-effect="non-scaling-stroke"';
        return el.replace('/>', ' stroke="' + HALO + '" stroke-width="3"' + ns + '/>') +
               el.replace('/>', ' stroke="' + LINE + '" stroke-width="1.25"' + ns + '/>');
    }

    // The marks for a W×H box laid over the whole canvas (CSS px of that
    // box), '' while no lock is held: the circle or the spoke, the pin when
    // both are held, and the centre.
    function guideMarkup(W, Hh) {
        var c = cv();
        if (!anyOn() || !c || !c.width || !c.height || !(W > 0) || !(Hh > 0)) return '';
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
        return parts;
    }

    // The HAND into SVG group `g` (any same-origin document) over a W×H box:
    // a small ring where it is, and a thin tie to the spot on the guide the
    // brush takes from it (as long as the hand is off the line). Built once
    // per group, moved by attribute writes after that; hidden while no
    // single lock steers.
    function paintHand(g, W, Hh) {
        if (!g) return;
        var c = cv(), h = hand();
        if (!h || !c || !c.width || !c.height || !(W > 0) || !(Hh > 0)) {
            if (g.style.display !== 'none') g.style.display = 'none';
            return;
        }
        var el = g.__strokeLockHand;
        if (!el) {
            var doc = g.ownerDocument;
            var mk = function (tag, stroke, width) {
                var e = doc.createElementNS(SVG_NS, tag);
                e.setAttribute('fill', 'none');
                e.setAttribute('stroke', stroke);
                e.setAttribute('stroke-width', width);
                e.setAttribute('vector-effect', 'non-scaling-stroke');
                g.appendChild(e);
                return e;
            };
            el = g.__strokeLockHand = {
                tieHalo: mk('line', HALO, 2.5), tie: mk('line', 'rgba(255,255,255,0.5)', 1),
                ringHalo: mk('circle', HALO, 3), ring: mk('circle', LINE, 1.5)
            };
            el.ringHalo.setAttribute('r', '4');
            el.ring.setAttribute('r', '4');
        }
        var kx = W / c.width, ky = Hh / c.height;
        var hx = h.hand.x * kx, hy = h.hand.y * ky, bx = h.brush.x * kx, by = h.brush.y * ky;
        [el.tieHalo, el.tie].forEach(function (l) {
            l.setAttribute('x1', hx); l.setAttribute('y1', hy);
            l.setAttribute('x2', bx); l.setAttribute('y2', by);
        });
        [el.ringHalo, el.ring].forEach(function (r) { r.setAttribute('cx', hx); r.setAttribute('cy', hy); });
        if (g.style.display === 'none') g.style.display = '';
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
        svgMarks.innerHTML = guideMarkup(W, Hh);
        paintHand(svgHand, W, Hh);
        svg.style.display = 'block';
    }

    // The hand moved: its ring here, and whoever else draws it (47), once a
    // frame however many samples arrived.
    function handMoved() {
        if (handRaf) return;
        handRaf = requestAnimationFrame(function () {
            handRaf = 0;
            var c = cv();
            if (svg && svg.style.display === 'block' && c) paintHand(svgHand, c.offsetWidth, c.offsetHeight);
            for (var i = 0; i < handListeners.length; i++) {
                try { handListeners[i](); } catch (e) { console.warn('[StrokeLock] hand listener failed', e); }
            }
        });
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
        // The canvas has the mouse (Pointer Lock) while a lock is held;
        // freeCursor() gives it back until the next key or paint press (58:
        // the radial menu needs the real pointer).
        confined: function () { return confined; },
        freeCursor: function () { freeCursor(true); },
        showGuides: function () { return showGuides; },
        setShowGuides: setShowGuides,
        // Other surfaces' guides (47): the marks for a W×H box over the
        // canvas ('' while no lock is held), and the hand's ring into a group.
        guideMarkup: guideMarkup,
        paintHand: paintHand,
        hand: hand,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        // Once a frame while the hand moves under a held lock.
        onHand: function (fn) { if (typeof fn === 'function') handListeners.push(fn); },
        // Tests and console poking: what is held and how.
        state: function () {
            return {
                distance: locks.distance ? JSON.parse(JSON.stringify(locks.distance)) : null,
                angle: locks.angle ? JSON.parse(JSON.stringify(locks.angle)) : null,
                pin: pin ? { x: pin.x, y: pin.y } : null,
                hand: hand(),
                area: areaPx(),
                confined: confined,
                glide: glide ? { ox: glide.ox, oy: glide.oy, far: glide.far, span: glide.span } : null
            };
        }
    };
})();
