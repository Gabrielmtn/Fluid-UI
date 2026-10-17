// ===================================================================
// js/74-theme-room.js - Walnut & Copper room drawer: the change log on a
// VFD screen and the room code as nixie tubes. Both are aria-hidden
// mirrors of the app's own elements, #mpActivity (06e renderActivity, the
// room's live region) and #roomName (06e renderShareMode), which stay the
// source of truth and what screen readers get.
//
// Ported from the study (design/study-lite.html, v19): the cathode screen
// notifications (1395-1463: NR, DIM, LINE_H, notify, restack, stepLines),
// the drawer feed (CSS 467, 491-494; markup 825; stepFeed 2835) and
// nixies() (2764). Timings, levels and pitch are the study's.
//
// What reaches the screen (presentation only; nothing is sent, announced or
// changed):
//   - Another player: exactly the line 06e shows in #mpActivity. New words
//     strike in as a new line; 06e stamps data-at on #mpActivity each time
//     a change lands, so a drag that leaves the words as they are keeps its
//     line lit, as the study's merge window does.
//   - You (OWN_LINES): a change you make to a shared setting while the room
//     is live, read from the input / change event 06b itself listens to.
//     "Shared" and "live" are 06b's own tests (the key is in roomLookBase,
//     roomLookLive()). Sliders, switches and menus only: a pad, a swatch or
//     a preset fires no event with a setting's id, so it posts no line.
//
// Motion rides js/71's frame (ThemeMotion.run) while a line moves and
// stops when nothing does; a timer re-wakes it when the next line's dwell
// ends. Under reduced motion lines appear, move and leave at once.
// ===================================================================
(function () {
    'use strict';
    var root = document.documentElement;
    if (root.getAttribute('data-theme') !== 'walnut-copper') return;

    var TM = window.ThemeMotion || null;
    var OWN_LINES = true;

    // ── Study 1396-1398, literal ───────────────────────────────────────
    var NR = { maxLines: 3, dwellYou: 1800, dwellRemote: 4500, merge: 900 };
    var DIM = [1, 0.62, 0.4, 0.3, 0.24];
    var LINE_H = 21;
    var QUIET = 'Quiet · no changes yet';
    var OFFLINE = 'Offline';
    var YOU = { name: 'You', css: 'var(--you)', you: true };

    // Without js/71 everything jumps, as under reduced motion.
    function Jump(x) { this.x = x; this.t = x; this.v = 0; }
    Jump.prototype.to = function (t) { this.x = this.t = t; this.v = 0; };
    Jump.prototype.step = function () {};
    Jump.prototype.settled = function () { return true; };
    var PROF = TM ? TM.PROF : { local: null, drawer: null, remote: null };
    function spring(x, p) { return TM ? new TM.Spring(x, p) : new Jump(x); }
    function reduced() { return TM ? TM.reduced() : true; }

    var src = null, conn = null, dot = null, feed = null, notes = null, empty = null, sec = null;
    var lines = [];
    var seen = { shown: false, text: '', at: '' };
    var idleText = '', emptyShown = null, hadLines = false, expTimer = 0;

    // ── Lines ──────────────────────────────────────────────────────────
    function renderLine(L) {
        var el = L.el;
        el.textContent = '';
        L.parts.forEach(function (p) {
            if (p.who) {
                el.appendChild(document.createElement('i'));
                var w = document.createElement('span');
                w.className = 'wc-who';
                w.textContent = L.who.name;
                el.appendChild(w);
            } else {
                el.appendChild(document.createTextNode(p.text));
            }
        });
    }
    function partsText(parts) {
        return parts.map(function (p) { return p.who ? '\u0001' : p.text; }).join('');
    }

    // Study notify(): one gesture by one player on one setting is one line
    // (900 ms merge window). Here the newest line also takes a repeat of its
    // own words: the app's lines carry no values, so a second identical line
    // under it would say nothing new.
    function notify(who, key, makeParts) {
        var now = performance.now();
        var dwell = who.you ? NR.dwellYou : NR.dwellRemote;
        var L = null, i;
        for (i = 0; i < lines.length; i++) {
            var l = lines[i];
            if (!l.leaving && l.who.you === who.you && l.who.name === who.name && l.key === key) { L = l; break; }
        }
        if (L && (now - L.updated < NR.merge || L.rank === 0)) {
            L.updated = now;
            L.expires = now + dwell;
            L.pulse = 1;
            if (who.css && who.css !== L.who.css) { L.who.css = who.css; L.el.style.setProperty('--c', who.css); }
            var parts = makeParts();
            if (partsText(parts) !== partsText(L.parts)) { L.parts = parts; renderLine(L); }
        } else {
            // The same words after a pause: the old line cools off and they
            // strike again on top.
            if (L) { L.leaving = true; L.tau = L.who.you ? 0.3 : 0.45; }
            var prof = who.you ? PROF.local : PROF.remote;
            var el = document.createElement('div');
            el.className = 'wc-nline';
            el.style.setProperty('--c', who.css);
            L = {
                who: { name: who.name, css: who.css, you: who.you }, key: key, parts: makeParts(), el: el,
                updated: now, expires: now + dwell, leaving: false, I: 0, pulse: 0,
                y: spring(0, prof), tau: who.you ? 0.045 : 0.22, flick: who.you && !reduced(),
                t0: TM ? TM.now() : 0, rank: 0, lastOp: '', lastTf: ''
            };
            renderLine(L);
            notes.insertBefore(el, notes.firstChild);
            lines.unshift(L);
            restack(prof);
        }
        wake();
    }

    // Study restack(): newest on top; a fourth pushes the oldest off.
    function restack(prof) {
        var r = 0;
        for (var i = 0; i < lines.length; i++) {
            var L = lines[i];
            if (L.leaving) continue;
            if (r >= NR.maxLines) { L.leaving = true; L.tau = L.who.you ? 0.3 : 0.45; continue; }
            L.rank = r;
            L.y.to(r, prof);
            r++;
        }
    }

    // 06e stopped naming anyone (the room is no longer together): every
    // line cools off where it is.
    function leaveAll() {
        lines.forEach(function (L) { if (!L.leaving) { L.leaving = true; L.tau = L.who.you ? 0.3 : 0.45; } });
        wake();
    }
    // Out of the room: the screen is gone with the panel, so is its log.
    function clearAll() {
        lines.forEach(function (L) { L.el.remove(); });
        lines = [];
        clearTimeout(expTimer); expTimer = 0;
        syncEmpty();
    }

    // Study stepLines(), once per drawn frame while anything moves.
    function step(dt, T) {
        var now = performance.now(), i, L, expired = false;
        // The drawer the screen sits in (js/20 moves the panel there at boot).
        if (!sec || !sec.contains(feed)) sec = feed.closest('.sidebar-section');
        for (i = 0; i < lines.length; i++) {
            L = lines[i];
            if (!L.leaving && now > L.expires) { L.leaving = true; L.tau = L.who.you ? 0.3 : 0.45; expired = true; }
        }
        if (expired) restack(PROF.drawer);
        // A closed drawer shows nothing: settle at once instead of stepping.
        var snap = reduced() || !!(sec && sec.classList.contains('collapsed'));
        var busy = false;
        for (i = 0; i < lines.length; i++) {
            L = lines[i];
            var target = L.leaving ? 0 : 1;
            if (snap) { L.y.x = L.y.t; L.y.v = 0; L.I = target; L.pulse = 0; L.flick = false; }
            else {
                L.y.step(dt);
                L.I += (target - L.I) * (1 - Math.exp(-dt / L.tau));
                if (Math.abs(target - L.I) < 1e-3) L.I = target;
                L.pulse *= Math.exp(-dt / 0.25);
                if (L.pulse < 1e-3) L.pulse = 0;
            }
            var v = L.I;
            var flickering = L.flick && T - L.t0 < 0.17;
            if (flickering) {
                var k = (T - L.t0) / 0.17;
                v *= 0.4 + 0.6 * (k + (1 - k) * Math.abs(Math.sin(T * 173) * Math.sin(T * 61)));
            }
            var dim = DIM[Math.min(L.rank, DIM.length - 1)];
            var op = Math.min(1, v * dim + L.pulse * 0.25).toFixed(3);
            var tf = 'translateY(' + (L.y.x * LINE_H).toFixed(2) + 'px)';
            if (op !== L.lastOp) { L.el.style.opacity = op; L.lastOp = op; }
            if (tf !== L.lastTf) { L.el.style.transform = tf; L.lastTf = tf; }
            if (!L.y.settled() || L.I !== target || L.pulse > 0 || flickering) busy = true;
        }
        for (i = lines.length - 1; i >= 0; i--) {
            L = lines[i];
            if (L.leaving && L.I < 0.02) { L.el.remove(); lines.splice(i, 1); }
        }
        syncEmpty();
        if (busy) return false;
        armExpiry();
        return true;
    }

    function wake() {
        if (TM) TM.run(step);
        else step(1, 0);
    }
    // At rest nothing steps; the next dwell to end wakes the frame again.
    function armExpiry() {
        clearTimeout(expTimer); expTimer = 0;
        var next = Infinity;
        lines.forEach(function (L) { if (!L.leaving && L.expires < next) next = L.expires; });
        if (next < Infinity) expTimer = setTimeout(function () { expTimer = 0; wake(); }, Math.max(0, next - performance.now()) + 10);
    }

    // Study stepFeed(): the empty state shows while no line is live. Its
    // words: 06e's own sentence while the room is together and it names
    // nobody, "Quiet" in a room, "Offline" until the room answers.
    function syncEmpty() {
        if (!feed) return;
        var any = false;
        for (var i = 0; i < lines.length; i++) if (!lines[i].leaving) { any = true; break; }
        if (any !== hadLines) { feed.classList.toggle('has-lines', any); hadLines = any; }
        var t = seen.shown ? (idleText || QUIET)
            : (dot && !dot.classList.contains('mp-dot-connecting')) ? QUIET : OFFLINE;
        if (t !== emptyShown) { empty.textContent = t; emptyShown = t; }
    }

    // ── The source: #mpActivity ────────────────────────────────────────
    function readSource() {
        var shown = src.style.display !== 'none';
        if (!shown) {
            if (seen.shown) leaveAll();
            seen.shown = false; seen.text = ''; seen.at = '';
            feed.removeAttribute('title');
            syncEmpty();
            return;
        }
        seen.shown = true;
        var whoEl = src.querySelector('.mp-activity-who');
        var text = src.textContent.replace(/\s+/g, ' ').trim();
        var at = src.getAttribute('data-at') || '';
        var changed = text !== seen.text, beat = !!at && at !== seen.at;
        seen.text = text; seen.at = at;
        if (!whoEl) {
            idleText = text;
            feed.removeAttribute('title');
            syncEmpty();
            return;
        }
        if (src.title) feed.title = src.title; else feed.removeAttribute('title');
        var who = { name: whoEl.textContent.trim(), css: whoEl.style.color || 'var(--vfd)', you: false };
        if (changed || beat) {
            notify(who, who.name + '|' + text, function () {
                // 06e's nodes in order, its name span as the dot and the name.
                // "Mika changed Curl" reads as the study's "MIKA › CURL".
                var parts = [];
                src.childNodes.forEach(function (n) { parts.push(n === whoEl ? { who: true } : { text: n.textContent }); });
                if (parts.length > 1 && parts[0].who && /^\s*changed\s+/i.test(parts[1].text)) {
                    parts[1] = { text: ' › ' + parts[1].text.replace(/^\s*changed\s+/i, '') };
                }
                return parts;
            });
        } else {
            // The words held and only the colour moved (06e repaintPeer: the
            // player picked up another paint).
            lines.forEach(function (L) {
                if (!L.who.you && L.who.name === who.name && L.who.css !== who.css) { L.who.css = who.css; L.el.style.setProperty('--c', who.css); }
            });
        }
        syncEmpty();
    }

    // ── You: a shared setting changed here, while the room is live ─────
    function onLocalChange(e) {
        var base = window.roomLookBase;
        if (!OWN_LINES || !base || !feed || window.__mpApplyingRemote || window._profileApplying) return;
        var t = e.target;
        if (!t || !t.id) return;
        var R = window.ParamRegistry;
        var kind = !R ? null : R.SLIDERS && R.SLIDERS[t.id] ? 'sliders' : R.CHECKBOXES && R.CHECKBOXES[t.id] ? 'checkboxes' : R.SELECTS && R.SELECTS[t.id] ? 'selects' : null;
        if (!kind || !base[kind] || !Object.prototype.hasOwnProperty.call(base[kind], t.id)) return;
        if (typeof window.roomLookLive !== 'function' || !window.roomLookLive()) return;
        notify(YOU, 'you|' + t.id, function () {
            var name = t.id;
            try { if (typeof window.controlName === 'function') name = window.controlName(t.id) || t.id; } catch (_) {}
            return [{ who: true }, { text: ' › ' + name }];
        });
    }

    // ── The room code: one nixie tube per character (study nixies()) ──
    function buildNixies() {
        var code = document.getElementById('roomName');
        if (!code || !code.parentNode || code.nextElementSibling && code.nextElementSibling.classList.contains('wc-nixies')) return;
        var box = document.createElement('div');
        box.className = 'wc-nixies';
        box.setAttribute('aria-hidden', 'true');
        code.parentNode.insertBefore(box, code.nextSibling);
        var last = null;
        function render() {
            box.hidden = code.style.display === 'none';
            box.classList.toggle('is-masked', code.classList.contains('mp-code-hidden'));
            var txt = code.textContent.replace(/\s+/g, '');
            if (txt === last) return;
            last = txt;
            box.textContent = '';
            var chars = Array.from(txt);
            chars.forEach(function (ch, i) {
                if (chars.length === 6 && i === 3) {
                    var sep = document.createElement('span');
                    sep.className = 'wc-nxsep';
                    box.appendChild(sep);
                }
                var s = document.createElement('span');
                s.className = ch === '-' ? 'wc-nx is-off' : 'wc-nx';
                s.textContent = ch;
                box.appendChild(s);
            });
        }
        new MutationObserver(render).observe(code, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        render();
    }

    // ── Build ──────────────────────────────────────────────────────────
    function build() {
        src = document.getElementById('mpActivity');
        conn = document.getElementById('mpConnected');
        dot = document.getElementById('connectionDot');
        if (!src || !conn || !src.parentNode) return false;
        feed = document.createElement('div');
        feed.className = 'wc-feed';
        feed.setAttribute('aria-hidden', 'true');
        notes = document.createElement('div');
        notes.className = 'wc-notes';
        empty = document.createElement('div');
        empty.className = 'wc-nempty';
        feed.appendChild(notes);
        feed.appendChild(empty);
        src.parentNode.insertBefore(feed, src.nextSibling);
        new MutationObserver(readSource).observe(src, { childList: true, characterData: true, subtree: true,
            attributes: true, attributeFilter: ['style', 'data-at', 'title'] });
        new MutationObserver(function () {
            if (conn.style.display === 'none') clearAll(); else readSource();
        }).observe(conn, { attributes: true, attributeFilter: ['style'] });
        if (dot) new MutationObserver(syncEmpty).observe(dot, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('input', onLocalChange, true);
        document.addEventListener('change', onLocalChange, true);
        buildNixies();
        readSource();
        return true;
    }

    build();
})();
