// ═══════════════════════════════════════════════════════════════════
// js/51-open-in-desktop.js — links into the desktop app (2026-09-14).
// LOAD ORDER: after 50-look-links.js.
// PROVIDES: window.OpenInDesktop = { offer, parseDeepLink, SCHEME, STORE_URL }
//
// WEB: swirltogether.com opened with a room code (#ABC123) or a look
//   (?look=…, shared settings) on a Windows browser offers, once, to open the same thing
//   in the desktop app. "Open in desktop" fires the swirltogether:// scheme
//   the app registers on its first launch (electron-main.js); if the page
//   never loses focus within ~2 s, no handler answered, and the modal
//   offers the Steam page instead. The room is already joined here by then
//   (06e auto-join) — the offer is additive, never a gate — and it waits
//   for the PhotoSafe warning and the Simple|Everything fork like 43 does.
//   "Don't ask again" is remembered per browser.
// DESKTOP: the renderer end of a deep link. Asks main for a link that
//   arrived on the command line (deep-link-ready → deep-link), takes later
//   ones from a second launch, and turns them into window.joinRoom(code)
//   or LookLinks.applyPayload(settings) once the app is ready.
// Scheme: swirltogether://join/ABC123  ·  swirltogether://look/1.<encoded settings>
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var SCHEME = 'swirltogether';
    var STORE_URL = 'https://store.steampowered.com/app/5068940';
    var LS_NEVER = 'fluidui.openInDesktop.never';
    var SS_ASKED = 'fluidui.openInDesktop.asked';   // sessionStorage: kind:value already offered in this tab
    var HANDOFF_MS = 2200;
    var isElectron = !!window.IS_ELECTRON;

    // ── The link itself ─────────────────────────────────────────────
    function parseDeepLink(raw) {
        var m = /^swirltogether:\/\/(join|look)\/([^/?#\s]+)(?:\?([^#\s]*))?/i.exec(String(raw || '').trim());
        if (!m) return null;
        var kind = m[1].toLowerCase();
        var val;
        try { val = decodeURIComponent(m[2]); } catch (_) { return null; }
        if (kind === 'join') {
            var code = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            return code.length === 6 ? { kind: 'join', code: code } : null;
        }
        // The encoded settings (js/50-look-links.js): base64url is
        // case-sensitive and never percent-encoded, so it is taken verbatim.
        return /^[01]\.[A-Za-z0-9_-]{8,12000}$/.test(m[2]) ? { kind: 'look', payload: m[2] } : null;
    }

    function deepLinkUrl(kind, value) {
        if (kind === 'join') return SCHEME + '://join/' + encodeURIComponent(value);
        return SCHEME + '://look/' + value;
    }

    // ═══ WEB: the offer ═══════════════════════════════════════════════
    function webCanOffer() {
        if (isElectron) return false;
        var ua = navigator.userAgent || '';
        if (!/Windows/i.test(ua)) return false;                 // the desktop app is Windows-only
        if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
        try { if (localStorage.getItem(LS_NEVER) === '1') return false; } catch (_) {}
        return true;
    }

    // A private room code; matchmade pub- rooms and DEFAULT-ROOM are not
    // invitations.
    function roomCodeFromHash() {
        var h = (window.location.hash || '').slice(1).toUpperCase();
        return /^[A-Z0-9]{6}$/.test(h) ? h : null;
    }

    var modal = null, els = null, keyHandler = null, handoff = null;

    function build() {
        if (modal) return modal;
        var m = document.createElement('div');
        m.id = 'openDesktopModal';
        m.className = 'delete-modal open-desktop-modal';
        m.dataset.group = 'system';   // button tint (css/01-buttons.css)
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-labelledby', 'openDesktopTitle');
        m.innerHTML =
            '<div class="delete-modal-content">' +
                '<div class="delete-modal-title" id="openDesktopTitle"></div>' +
                '<div class="delete-modal-message" id="openDesktopMsg"></div>' +
                '<label class="open-desktop-remember"><input type="checkbox" id="openDesktopNever"> Don’t ask again on this browser</label>' +
                '<div class="delete-modal-actions">' +
                    '<button type="button" id="openDesktopStay"></button>' +
                    '<button type="button" id="openDesktopStore" class="btn--emphasis"></button>' +
                    '<button type="button" id="openDesktopGo" class="btn--emphasis"></button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(m);
        modal = m;
        els = {
            title: m.querySelector('#openDesktopTitle'),
            msg: m.querySelector('#openDesktopMsg'),
            never: m.querySelector('#openDesktopNever'),
            remember: m.querySelector('.open-desktop-remember'),
            stay: m.querySelector('#openDesktopStay'),
            store: m.querySelector('#openDesktopStore'),
            go: m.querySelector('#openDesktopGo')
        };
        // The scrim is not a "stay" — a stray click must not dismiss a
        // question the user has not read; Esc does.
        m.addEventListener('mousedown', function (e) { if (e.target === m) e.preventDefault(); });
        return m;
    }

    function clearHandoff() {
        if (!handoff) return;
        clearTimeout(handoff.timer);
        window.removeEventListener('blur', handoff.onAway);
        document.removeEventListener('visibilitychange', handoff.onAway);
        window.removeEventListener('focus', handoff.onBack);
        handoff = null;
    }

    function close() {
        if (els && els.never.checked) { try { localStorage.setItem(LS_NEVER, '1'); } catch (_) {} }
        if (modal) modal.classList.remove('show');
        if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
        clearHandoff();
    }

    function show(kind, value) {
        build();
        try { sessionStorage.setItem(SS_ASKED, kind + ':' + value); } catch (_) {}
        var what = (kind === 'join') ? 'This room' : 'These settings';
        els.title.textContent = 'Open in the desktop app?';
        els.msg.textContent = what + ' can open in Swirl Together for Windows — the desktop app runs at full speed, with your pen and your screens. Or keep going right here.';
        els.go.textContent = 'Open in desktop';
        els.go.disabled = false;
        els.go.style.display = '';
        els.stay.textContent = 'Stay in browser';
        els.store.textContent = 'Get it on Steam';
        els.store.style.display = 'none';
        els.remember.style.display = '';
        els.never.checked = false;
        els.go.onclick = function () { launch(deepLinkUrl(kind, value)); };
        els.stay.onclick = function () { close(); };
        els.store.onclick = function () { window.open(STORE_URL, '_blank', 'noopener'); close(); };
        // The app's hotkeys listen on document; nothing typed at this
        // question may reach them (same as the startup fork).
        keyHandler = function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
            if (e.key !== 'Tab') e.stopPropagation();
        };
        document.addEventListener('keydown', keyHandler, true);
        modal.classList.add('show');
        try { els.go.focus(); } catch (_) {}
    }

    // Fired from the click, so the browser treats it as a user gesture.
    // With a handler registered Chromium asks "Open Swirl Together?" and
    // launches it; with none the navigation silently does nothing and the
    // page stays — so the page losing focus is the only signal that
    // something opened. Focus coming straight back is ambiguous (the
    // prompt was cancelled, or the user clicked back), and the modal says
    // so rather than guessing.
    function launch(url) {
        clearHandoff();
        els.msg.textContent = 'Opening in the desktop app…';
        els.go.disabled = true;
        // Live state, not latches. Chromium's "Open Swirl Together?" prompt
        // takes focus and hands it straight back when answered — BEFORE the
        // app's own window comes up and takes it again. So the clock restarts
        // when focus returns, and the verdict reads where focus is at the
        // end: still away → the app opened; back after a prompt → answered,
        // but Open and Cancel cannot be told apart; never away → no handler.
        var away = false, everAway = false, answered = false;
        var verdict = function () {
            clearHandoff();
            els.go.style.display = 'none';
            if (away) {
                els.msg.textContent = 'Opened in the desktop app. You can close this tab, or keep painting here too.';
                els.stay.textContent = 'Stay here';
                els.remember.style.display = 'none';
            } else if (answered) {
                els.msg.textContent = 'If the desktop app did not open, it may not be installed on this PC yet. Swirl Together for Windows is on Steam.';
                els.store.style.display = '';
                els.stay.textContent = 'Stay in browser';
            } else {
                els.msg.textContent = 'Nothing opened — the desktop app does not seem to be installed on this PC. Swirl Together for Windows is on Steam.';
                els.store.style.display = '';
                els.stay.textContent = 'Stay in browser';
            }
        };
        var onAway = function () { if (document.hidden || !document.hasFocus()) { away = true; everAway = true; } };
        var onBack = function () {
            if (!everAway || !handoff) return;
            away = false; answered = true;
            clearTimeout(handoff.timer);
            handoff.timer = setTimeout(verdict, 4000);
        };
        handoff = { onAway: onAway, onBack: onBack, timer: setTimeout(verdict, HANDOFF_MS) };
        window.addEventListener('blur', onAway);
        document.addEventListener('visibilitychange', onAway);
        window.addEventListener('focus', onBack);
        // Chromium runs beforeunload for an external-protocol navigation, and
        // 04f's unsaved-work guard would raise "Leave site?" over a hand-off
        // that leaves nothing. Stand it down for the synchronous setter only.
        var prevApproved = window.__closeApproved;
        window.__closeApproved = true;
        try { window.location.href = url; } catch (_) {}
        finally { window.__closeApproved = prevApproved; }
    }

    // Programmatic: offer('join', 'ABC123') / offer('look', '<encoded settings>').
    function offer(kind, value) {
        if (isElectron) return false;
        if (kind === 'join' && !/^[A-Z0-9]{6}$/.test(String(value || ''))) return false;
        if (kind === 'look' && !/^[01]\.[A-Za-z0-9_-]{8,12000}$/.test(String(value || ''))) return false;
        show(kind, value);
        return true;
    }

    // The offer waits like 43's fork: the PhotoSafe warning answered, the
    // strip and sidebar built, the splash gone, and the fork itself answered
    // if this profile has never chosen — one question at a time.
    function scheduleOffer() {
        if (!webCanOffer()) return;
        var room = roomCodeFromHash();
        var look = (window.LookLinks && typeof window.LookLinks.pending === 'function') ? window.LookLinks.pending() : null;
        if (!room && !look) return;
        var kind = room ? 'join' : 'look';
        var value = room || look.payload;
        // Once per tab per link: a reload in the room (F5, a context-loss
        // restart) keeps #CODE in the URL and must not ask again.
        try { if (sessionStorage.getItem(SS_ASKED) === kind + ':' + value) return; } catch (_) {}
        var tries = 0;
        (function wait() {
            var pw = document.getElementById('photoWarn');
            var built = !!document.getElementById('sidebar-right') && !!window.__scriptsReady;
            var splashUp = !!document.getElementById('splash-screen');
            if ((pw && !pw.hidden) || !built || splashUp) {
                if (tries++ < 4800) setTimeout(wait, 250);
                return;
            }
            var go = function () {
                setTimeout(function () { show(kind, value); }, 700);
            };
            var uv = window.UIVisibility;
            if (uv && typeof uv.forkPending === 'function' && uv.forkPending() && uv.EVENT) {
                document.addEventListener(uv.EVENT, go, { once: true });
            } else {
                go();
            }
        })();
    }
    if (!isElectron) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleOffer);
        else scheduleOffer();
    }

    // ═══ DESKTOP: the renderer end of a deep link ═════════════════════
    if (isElectron) {
        var ipc = null;
        try { if (typeof require === 'function') ipc = require('electron').ipcRenderer; } catch (_) { ipc = null; }
        if (ipc) {
            var ready = false, queue = [];

            var openRoomPanel = function () {
                var secs = document.querySelectorAll('#sidebar-right .sidebar-section');
                for (var i = 0; i < secs.length; i++) {
                    var t = secs[i].querySelector('.section-title');
                    if (!t || t.textContent.trim() !== 'Swirl Together') continue;
                    if (typeof window.openSidebarSection === 'function') window.openSidebarSection(secs[i]);
                    try { secs[i].scrollIntoView({ block: 'nearest' }); } catch (_) {}
                    return;
                }
            };

            // 06a's room is a script-global lexical binding, not on window.
            var roomNow = function () { try { return currentRoom || null; } catch (_) { return null; } };
            var handle = function (raw) {
                var d = parseDeepLink(raw);
                if (!d) { console.warn('[deep-link] ignored:', raw); return; }
                if (d.kind === 'join') {
                    // A link to the room this app is already in is a no-op:
                    // joinRoom would leave and rejoin, resetting host state.
                    if (roomNow() !== d.code && typeof window.joinRoom === 'function') window.joinRoom(d.code);
                    openRoomPanel();
                } else if (window.LookLinks && typeof window.LookLinks.applyPayload === 'function') {
                    window.LookLinks.applyPayload(d.payload);
                }
            };

            ipc.on('deep-link', function (_evt, raw) {
                if (ready) handle(raw); else queue.push(raw);
            });

            // Same settle rule as 50-look-links: the saved session applied
            // and the strip + sidebar built, then the link on top of it.
            var tries = 0;
            var poll = function () {
                var built = !!window.__scriptsReady && !!document.getElementById('mixer-strip');
                if (!built && tries++ <= 1200) { setTimeout(poll, 100); return; }
                setTimeout(function () {
                    ready = true;
                    queue.splice(0).forEach(handle);
                    try { ipc.send('deep-link-ready'); } catch (_) {}
                }, 350);
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll);
            else poll();
        }
    }

    window.OpenInDesktop = {
        SCHEME: SCHEME,
        STORE_URL: STORE_URL,
        parseDeepLink: parseDeepLink,
        deepLinkUrl: deepLinkUrl,
        offer: offer,
        close: close
    };
})();
