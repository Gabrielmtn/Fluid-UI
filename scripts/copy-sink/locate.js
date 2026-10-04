// The copy sink's "show me where": loaded into the APP page only when the
// sink serves it (scripts/copy-sink.js injects this tag into index.html), so
// nothing here ships. The sink opens the app at #locate=<json> with the
// string's attribute + text (and its id when it has one); this finds that
// control, opens its sidebar section, scrolls it into view and rings it.
(function () {
    'use strict';
    function query() {
        var m = /#locate=(.+)$/.exec(location.hash);
        if (!m) return null;
        try { return JSON.parse(decodeURIComponent(m[1])); } catch (_) { return null; }
    }
    function find(q) {
        if (q.id) {
            var byId = document.getElementById(q.id);
            if (byId) return byId;
        }
        if (q.attr && q.text) {
            var all = document.querySelectorAll('[' + q.attr + ']');
            for (var i = 0; i < all.length; i++) if (all[i].getAttribute(q.attr) === q.text) return all[i];
        }
        return null;
    }
    function note(msg) {
        var t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;' +
            'background:#2a1033;color:#fff;border:1px solid #ff3bd4;border-radius:8px;padding:8px 14px;font:13px system-ui,sans-serif';
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 4000);
    }
    // The nearest named container, so a hidden string can say where it lives
    // ("inside #audioDrawerPanel") instead of only that it is hidden.
    function home(el) {
        for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (p.id) return '#' + p.id;
        }
        return '';
    }
    function ring(el) {
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) {
            var h = home(el);
            note('Found it' + (h ? ' inside ' + h : '') + ', but that is closed right now (a popup, a drawer or a hidden panel).');
            return;
        }
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #ff3bd4;border-radius:6px;' +
            'box-shadow:0 0 0 4px rgba(255,59,212,.3)';
        // Follows the control for its four seconds: a section that is still
        // opening, or the top bar's entrance, moves it after the ring is drawn.
        function place() {
            var q = el.getBoundingClientRect();
            d.style.left = (q.left - 6) + 'px';
            d.style.top = (q.top - 6) + 'px';
            d.style.width = (q.width + 12) + 'px';
            d.style.height = (q.height + 12) + 'px';
        }
        place();
        document.body.appendChild(d);
        var follow = setInterval(place, 50);
        setTimeout(function () { clearInterval(follow); d.remove(); }, 4000);
    }
    function go() {
        var q = query();
        if (!q) return;
        var tries = 0;
        (function look() {
            // The web build slides the top bar and the sidebar in (20 adds
            // ui-enter, then ui-settled once it lands). Opening the More panel
            // mid-slide pins it where the bar was, half off the top.
            var strip = document.getElementById('mixer-strip');
            var entering = strip && strip.classList.contains('ui-enter') && !strip.classList.contains('ui-settled');
            if (entering && tries++ < 60) { setTimeout(look, 250); return; }
            var el = find(q);
            if (!el) {
                if (tries++ < 60) { setTimeout(look, 250); return; }
                note('Could not find that string on screen.');
                return;
            }
            var sec = el.closest && el.closest('.sidebar-section');
            if (sec && sec.classList.contains('collapsed')) {
                var h = sec.querySelector('.section-header');
                if (h) h.click();
            }
            // A top-bar control parked in the "More" overflow (js/46).
            if (el.closest && el.closest('#mixer-more-panel') && window.StripMore) {
                try { window.StripMore.open(); } catch (_) {}
            }
            setTimeout(function () {
                // 'nearest': only when it is not already on screen. 'center' scrolled the
                // app's own overflow-hidden layout and pushed the top bar off the top.
                try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
                setTimeout(function () { ring(el); }, 250);
            }, 300);
        })();
    }
    window.addEventListener('hashchange', go);
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
