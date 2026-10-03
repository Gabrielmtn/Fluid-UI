// ═══════════════════════════════════════════════════════════════════
// js/52-demo-clock.js — the Steam demo's five-minute clock (2026-09-14),
//   and the playtest label (web build, itch playtest) in the same spot.
// LOAD ORDER: last, after 51-open-in-desktop.js. Needs the quality underbar
//   (20-mixer-layout builds it after DOMContentLoaded) and waits for the
//   startup prompts the way 51 does.
// PROVIDES: window.DemoClock = { active, remainingMs, start, setRemaining,
//   expire, ask, enable }
//
// "Swirl Together Demo" (Steam app 5162690, `npm run dist:demo`) is the
// whole app with a clock. 5:00 counts down on the right end of the quality
// underbar, beside Image Sharpness and Motion Detail; at 0:00 a modal asks
// for a wishlist and opens the full game's store page (5068940 — the
// wishlist lives on the parent app, not the demo). "Keep painting" winds
// the clock back, and every keep adds a minute to the next round (usertest
// 2026-10-03): 5:00, then 6:00, 7:00... The ask counts the keeps, and from
// the fifth on it offers "Leave me alone", which stops the ask and takes
// the clock away. Pressing "Wishlist on Steam" does the same once the ask
// closes: Steam has no way to tell a game that someone wishlisted it, and
// the press is the best sign there is. Those three facts persist under
// DEMO_STATE_KEY, outside the fluidUI: namespace so Settings → Clear leaves
// them; the time itself is never saved, and nothing is ever locked.
//
// The clock starts once the first-run questions are answered (PhotoSafe,
// the Simple | Everything fork) and runs only while the window is on
// screen. It never cuts into a stroke: at 0:00 the ask waits for the
// pointer to lift. When the underbar is hidden (a narrow or short window,
// Settings → Interface) the clock floats in the bottom-right corner, so the
// ask is never a surprise. Clicking the clock asks early, without the
// "time's up".
//
// Edition: window.SWIRL_EDITION, from the --swirl-edition=demo argument
// electron-main.js hands a demo build (read in index.html's boot script).
// The web build (swirltogether.com) and the itch playtest (SWIRL_EDITION
// 'playtest', scripts/dist-playtest.js) are playtests, and say so where the
// demo keeps its clock (PLAYTEST_LABEL below). The full game returns below
// before touching anything.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DEMO_MS = 5 * 60 * 1000;
    var FULL_GAME_APP_ID = 5068940;
    var STEAM_URL = 'steam://store/' + FULL_GAME_APP_ID;
    var STORE_URL = 'https://store.steampowered.com/app/' + FULL_GAME_APP_ID + '/';
    var TICK_MS = 250;
    // One tick never counts for more than this: a machine waking from sleep,
    // or a frame stalled by an export, is not the player's time.
    var MAX_STEP_MS = 2000;
    // How long the ask waits for a stroke in progress before it shows anyway
    // (a pointerup lost off-window must not hold it back forever).
    var STROKE_GRACE_MS = 20000;
    // A key or click already on its way when the ask appears must not answer
    // it — Space is Freeze, and would otherwise press the focused button.
    var ARM_DELAY_MS = 600;
    var PITCH = 'The full game is this same canvas with no clock on it. ' +
                'Wishlist it on Steam and you’ll hear the day it launches.';
    var MINUTE_MS = 60 * 1000;
    var QUIET_AFTER_KEEPS = 5;
    var DEMO_STATE_KEY = 'swirlDemoAsk.v1';
    // { keeps, quiet, wished } — see the header.
    var askState = { keeps: 0, quiet: false, wished: false };
    try {
        var savedAsk = JSON.parse(localStorage.getItem(DEMO_STATE_KEY) || 'null');
        if (savedAsk && typeof savedAsk === 'object') {
            askState.keeps = Math.max(0, Math.min(1000, (savedAsk.keeps | 0)));
            askState.quiet = !!savedAsk.quiet;
            askState.wished = !!savedAsk.wished;
        }
    } catch (_) {}
    function saveAskState() {
        try { localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(askState)); } catch (_) {}
    }
    // This round's length: five minutes, plus one for every keep so far.
    function allowMs() { return DEMO_MS + askState.keeps * MINUTE_MS; }
    function leftAlone() { return askState.quiet || askState.wished; }

    var started = false, expired = false;
    var usedMs = 0, lastMs = null, expiredAt = 0;
    var pointerDown = false;
    var clock = null, btnEl = null;
    var modal = null, els = null, keyHandler = null, armedAt = 0, askKind = null;
    var ticker = null;

    function modalUp() { return !!(modal && modal.classList.contains('show')); }
    function counting() { return started && !expired && !document.hidden && !modalUp(); }

    // Fold the time since the last look into usedMs, then keep the stopwatch
    // running only if the clock should be running now. Every state change is
    // wrapped in a fold before and after, so an interval only ever counts
    // under the state it was actually spent in.
    function fold() {
        var now = performance.now();
        if (lastMs !== null) usedMs += Math.min(MAX_STEP_MS, Math.max(0, now - lastMs));
        lastMs = counting() ? now : null;
    }

    function remainingMs() { return Math.max(0, allowMs() - usedMs); }

    function fmt(ms) {
        var s = Math.ceil(ms / 1000);
        var sec = s % 60;
        return Math.floor(s / 60) + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function tick() {
        fold();
        // Left alone: no ask, ever. The round just starts over unseen.
        if (leftAlone()) {
            if (usedMs >= allowMs()) usedMs = 0;
            render();
            return;
        }
        if (started && !expired && usedMs >= allowMs()) {
            expired = true;
            expiredAt = performance.now();
            lastMs = null;
        }
        if (expired && !modalUp() &&
            (!pointerDown || performance.now() - expiredAt > STROKE_GRACE_MS)) ask('timeup');
        render();
    }

    // ── The clock ────────────────────────────────────────────────────
    function buildClock() {
        clock = document.createElement('div');
        clock.id = 'demoClock';
        clock.className = 'demo-clock';
        var cap = document.createElement('div');
        cap.className = 'demo-clock-cap';
        cap.textContent = 'Demo time left';
        btnEl = document.createElement('button');
        btnEl.type = 'button';
        btnEl.className = 'btn--ghost demo-clock-btn';
        btnEl.title = 'Demo time left — the clock only runs while Swirl Together is on screen. ' +
                      'Click to wishlist the full game on Steam.';
        btnEl.addEventListener('click', function () {
            if (!modalUp()) ask(expired ? 'timeup' : 'early');
        });
        clock.appendChild(cap);
        clock.appendChild(btnEl);
    }

    // The right end of the underbar when it is on screen; the bottom-right
    // corner of the window when it is not (the media queries hide the bar on
    // narrow and short windows, and Settings → Interface can hide it). The
    // clock and the playtest label both live here.
    function place(el) {
        var bar = document.getElementById('quality-underbar');
        var shown = false;
        if (bar) { try { shown = getComputedStyle(bar).display !== 'none'; } catch (_) {} }
        var parent = shown ? bar : document.body;
        if (el.parentElement !== parent) parent.appendChild(el);
        el.classList.toggle('floating', !shown);
        // Floating, it keeps to the painting's corner rather than the window's
        // (the sidebar owns the window's): the same right-edge trim the bar
        // takes in 20-mixer-layout, plus the bar's own 14px padding.
        var right = '';
        if (!shown) {
            var ca = document.getElementById('canvas-area');
            var edge = 0;
            if (ca) {
                var r = ca.getBoundingClientRect();
                if (r.right > 1 && r.right < window.innerWidth - 1) edge = Math.round(window.innerWidth - r.right);
            }
            right = (edge + 14) + 'px';
        }
        if (el.style.right !== right) el.style.right = right;
        return !shown;
    }

    function render() {
        // Nothing on screen until the app is: the clock would otherwise float
        // over the boot for the second before the underbar is built.
        if (!clock || !window.__scriptsReady) return;
        // Left alone, the clock goes too — once the ask that set it is closed.
        var gone = leftAlone() && !modalUp();
        if (clock.hidden !== gone) clock.hidden = gone;
        if (gone) return;
        place(clock);
        var t = fmt(remainingMs());
        if (btnEl.textContent !== t) {
            btnEl.textContent = t;
            btnEl.setAttribute('aria-label', 'Demo time left, ' + t + '. Wishlist Swirl Together on Steam.');
        }
    }

    // ── The ask ──────────────────────────────────────────────────────
    function buildModal() {
        if (modal) return;
        modal = document.createElement('div');
        modal.id = 'demoWishlistModal';
        modal.className = 'delete-modal demo-wishlist-modal';
        modal.dataset.group = 'system';   // button tint (css/01-buttons.css)
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'demoWishlistTitle');
        modal.setAttribute('aria-describedby', 'demoWishlistMsg');
        modal.innerHTML =
            '<div class="delete-modal-content">' +
                '<div class="delete-modal-title" id="demoWishlistTitle"></div>' +
                '<div class="delete-modal-message" id="demoWishlistMsg"></div>' +
                '<div class="delete-modal-actions">' +
                    '<button type="button" id="demoWishlistQuiet" hidden>Leave me alone</button>' +
                    '<button type="button" id="demoWishlistBack"></button>' +
                    '<button type="button" id="demoWishlistGo" class="btn--emphasis">Wishlist on Steam</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        els = {
            title: modal.querySelector('#demoWishlistTitle'),
            msg: modal.querySelector('#demoWishlistMsg'),
            back: modal.querySelector('#demoWishlistBack'),
            quiet: modal.querySelector('#demoWishlistQuiet'),
            go: modal.querySelector('#demoWishlistGo')
        };
        // The scrim is not an answer: the tail of a stroke must not dismiss it.
        modal.addEventListener('mousedown', function (e) { if (e.target === modal) e.preventDefault(); });
        els.go.addEventListener('click', function () {
            if (performance.now() >= armedAt) openStore();
        });
        els.back.addEventListener('click', function () {
            if (performance.now() >= armedAt) close();
        });
        els.quiet.addEventListener('click', function () {
            if (performance.now() < armedAt) return;
            askState.quiet = true;
            saveAskState();
            close();
        });
    }

    function ask(kind) {
        buildModal();
        var timeUp = kind === 'timeup';
        askKind = kind;
        var mins = Math.round(allowMs() / MINUTE_MS), keeps = askState.keeps;
        els.title.textContent = timeUp
            ? (keeps ? 'That’s your ' + mins + ' minutes' : 'That’s your five minutes')
            : 'Enjoying Swirl Together?';
        var count = '';
        if (timeUp && keeps) {
            count = ' You’ve kept going ' + (keeps === 1 ? 'once' : keeps + ' times') +
                (keeps < QUIET_AFTER_KEEPS ? '. At ' + QUIET_AFTER_KEEPS + ', you can turn these off.' : '.');
        }
        els.msg.textContent = (timeUp ? 'Thanks for painting in the Swirl Together demo. '
                                      : 'This demo runs ' + mins + ' minutes at a time. ') + PITCH + count;
        els.back.textContent = timeUp ? 'Keep painting, ' + (mins + 1) + ' minutes' : 'Back to painting';
        els.quiet.hidden = !(timeUp && keeps >= QUIET_AFTER_KEEPS);
        fold();
        modal.classList.add('show');
        fold();
        armedAt = performance.now() + ARM_DELAY_MS;
        if (!keyHandler) {
            // The app's hotkeys listen on document; nothing typed at this
            // question may reach them (same as the startup fork). Keyups pass,
            // so a key held when the ask appeared still hears its release.
            keyHandler = function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (performance.now() >= armedAt) close();
                    return;
                }
                if (e.key !== 'Tab') e.stopPropagation();
            };
            document.addEventListener('keydown', keyHandler, true);
        }
        try { els.go.focus({ preventScroll: true }); } catch (_) {}
        render();
    }

    // Back to painting. After the time-up ask that is a fresh round, a
    // minute longer than the last unless this close is the one that leaves
    // the player alone.
    function close() {
        if (!modalUp()) return;
        fold();
        if (askKind === 'timeup') {
            if (!leftAlone()) { askState.keeps++; saveAskState(); }
            usedMs = 0;
            expired = false;
        }
        modal.classList.remove('show');
        if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
        fold();
        render();
    }

    // Under Steam the page opens in the Steam client, already signed in and
    // one click from the wishlist button; anywhere else, in the browser. The
    // renderer has nodeIntegration, so shell.openExternal is reachable here
    // (12b-preset-vault.js does the same).
    function openStore() {
        var inSteam = !!window.SWIRL_STEAM;
        var shell = null;
        if (window.IS_ELECTRON) { try { shell = require('electron').shell; } catch (_) { shell = null; } }
        if (shell) {
            var url = inSteam ? STEAM_URL : STORE_URL;
            Promise.resolve(shell.openExternal(url)).catch(function () {
                return url === STORE_URL ? null : shell.openExternal(STORE_URL);
            }).catch(function () {});
        } else {
            window.open(STORE_URL, '_blank', 'noopener');
        }
        els.msg.textContent = (inSteam ? 'Opening Swirl Together in Steam' : 'Opening Swirl Together’s Steam page') +
            ' — thank you! Your painting will be right here.';
        // The best sign of a wishlist the demo can get: no more asks once
        // this one is closed.
        askState.wished = true;
        saveAskState();
        els.quiet.hidden = true;
    }

    // ── Start ────────────────────────────────────────────────────────
    function start() {
        if (started || !api.active) return;
        fold();
        started = true;
        fold();
        render();
    }

    // The same wait as the Open-in-desktop offer and the startup fork: the
    // PhotoSafe warning answered, the strip and sidebar built, the splash
    // gone, and the fork answered if this profile has never chosen. No give
    // up: the warning can sit unanswered for as long as it likes.
    function whenReady(fn) {
        (function wait() {
            var pw = document.getElementById('photoWarn');
            var built = !!document.getElementById('sidebar-right') && !!window.__scriptsReady;
            var splashUp = !!document.getElementById('splash-screen');
            if ((pw && !pw.hidden) || !built || splashUp) { setTimeout(wait, 250); return; }
            var uv = window.UIVisibility;
            if (uv && typeof uv.forkPending === 'function' && uv.forkPending() && uv.EVENT) {
                document.addEventListener(uv.EVENT, fn, { once: true });
            } else {
                fn();
            }
        })();
    }

    function onPointer(e) {
        if (e.type === 'pointerdown') pointerDown = true;
        else if (e.type === 'pointerup' || e.type === 'pointercancel') pointerDown = false;
        else if (pointerDown && e.buttons === 0) pointerDown = false;   // an up that went missing
    }

    function init() {
        if (api.active) return;
        api.active = true;
        // enable() on the web (a test hook) hands the playtest label's spot
        // to the clock.
        if (playtest) playtest.remove();
        document.body.classList.add('edition-demo');
        document.title = 'Swirl Together Demo';
        var tt = document.querySelector('.titlebar-title');
        if (tt) tt.textContent = 'Swirl Together Demo';
        buildClock();
        ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (t) {
            window.addEventListener(t, onPointer, true);
        });
        window.addEventListener('blur', function () { pointerDown = false; });
        document.addEventListener('visibilitychange', function () { fold(); render(); });
        window.addEventListener('resize', render);
        ticker = setInterval(tick, TICK_MS);
        whenReady(start);
        render();
    }

    var api = window.DemoClock = {
        active: false,
        remainingMs: function () { return api.active ? remainingMs() : null; },
        // Support and test hooks — the full game never calls enable().
        start: start,
        setRemaining: function (ms) {
            if (!api.active) return;
            fold();
            usedMs = Math.max(0, allowMs() - Math.max(0, +ms || 0));
            fold();
            render();
        },
        expire: function () {
            if (!api.active) return;
            fold();
            started = true;
            usedMs = allowMs();
            tick();
        },
        // Support/test hook: the persisted keeps / quiet / wished.
        askState: function () { return { keeps: askState.keeps, quiet: askState.quiet, wished: askState.wished }; },
        ask: function () { if (api.active && !modalUp()) ask(expired ? 'timeup' : 'early'); },
        enable: init
    };

    // ── The playtest label: the web build and the itch playtest ─────
    // swirltogether.com and "Swirl Together Playtest" (itch.io) are
    // playtests, and say so on the right end of the underbar, where the demo
    // keeps its clock. Plain text: there is nothing to click, so painting
    // runs straight through it. Change the number here when a new playtest
    // goes out (the itch zip is named after it; scripts/dist-playtest.js
    // keeps a matching app version).
    var PLAYTEST_LABEL = '0.02 playtest';
    var playtest = null;

    // Floating on a desktop layout (Simple hides the bar), the canvas runs
    // down to its 24px margin (01-config CANVAS_MARGIN) and the frame's
    // corner handle hangs into that margin, right on the corner spot. The
    // label then sits in the margin under the frame's edge, left of the
    // handle. The clock's two lines would not fit there; it keeps the corner.
    function tuck(el) {
        el.style.bottom = '';                 // measure from the corner spot
        var bottom = '';
        var wrap = document.getElementById('canvas-wrapper');
        if (wrap && !document.body.classList.contains('mobile-mode')) {
            var w = wrap.getBoundingClientRect();
            var r = el.getBoundingClientRect();
            var se = wrap.querySelector('.resize-se');
            // Settings → Display can hide the border and its handles.
            var h = se && se.offsetParent ? se.getBoundingClientRect() : null;
            var hits = function (b) {
                return !!b && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
            };
            var band = window.innerHeight - w.bottom;
            if ((hits(w) || hits(h)) && band >= r.height) {
                var b = Math.floor((band - r.height) / 2);
                bottom = b + 'px';
                var top = window.innerHeight - b - r.height;
                if (h && h.top < top + r.height && h.bottom > top &&
                    h.left < r.right + 6 && h.right > r.left - 6) {
                    el.style.right = Math.round(window.innerWidth - h.left + 6) + 'px';
                }
            }
        }
        if (el.style.bottom !== bottom) el.style.bottom = bottom;
    }

    function initPlaytest() {
        if (window.SWIRL_EDITION === 'playtest') {
            // The desktop playtest names itself, like the demo does; the web
            // keeps its title (the tab and the social cards read it).
            document.title = 'Swirl Together Playtest';
            var tt = document.querySelector('.titlebar-title');
            if (tt) tt.textContent = 'Swirl Together Playtest';
        }
        playtest = document.createElement('div');
        playtest.id = 'playtestLabel';
        playtest.className = 'playtest-label';
        playtest.textContent = PLAYTEST_LABEL;
        var sync = function () {
            if (api.active) return;
            if (place(playtest)) tuck(playtest);
            else if (playtest.style.bottom) playtest.style.bottom = '';
        };
        // Nothing on screen until the app is, as with the clock. The clock
        // re-places itself every tick; the label has no tick, so it follows
        // what moves its spot: a resize (the media queries that hide the
        // bar), Settings → Interface hiding the bar (a class on it), the
        // sidebar's width (the floating label keeps to #canvas-area's edge)
        // and the canvas frame's size (the tuck above).
        (function wait() {
            if (!window.__scriptsReady || !document.getElementById('sidebar-right')) {
                setTimeout(wait, 250);
                return;
            }
            sync();
            window.addEventListener('resize', sync);
            var bar = document.getElementById('quality-underbar');
            if (bar && window.MutationObserver) {
                new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['class'] });
            }
            if (window.ResizeObserver) {
                try {
                    var ro = new ResizeObserver(sync);
                    ['canvas-area', 'canvas-wrapper'].forEach(function (id) {
                        var el = document.getElementById(id);
                        if (el) ro.observe(el);
                    });
                } catch (_) {}
            }
        })();
    }

    var boot = window.SWIRL_EDITION === 'demo' ? init
             : window.SWIRL_EDITION === 'playtest' ? initPlaytest   // itch
             : window.IS_ELECTRON ? null                            // the full game
             : initPlaytest;                                        // the web build
    if (!boot) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
