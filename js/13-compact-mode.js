/**
 * Compact window
 *
 * When the top bar (the mixer strip) would wrap onto a second row, it moves
 * into the right sidebar (body.compact-ui) and the two sidebars carry the
 * whole UI. A small desktop window (768px wide or less, or 500px tall or
 * less and up to 1200px wide) also folds both sidebars to their rails
 * (body.compact-fold), so the canvas gets the whole window; it has room for
 * one open bar, so opening one folds the other (js/20). Folds made here
 * are never kept: leaving puts the left bar back the way you keep it
 * (ui.leftSidebar.collapsed) and opens the right one.
 *
 * Phones and tablets never get here: index.html sends them to phone/ (paint
 * as an artist in a room, or be the computer's mouse). The phone layout
 * that used to live here (☰ drawer, '?' pill, Look · Color · Together · Save
 * row) is gone (2026-10-07, Gabriel: "this view shouldn't exist anymore").
 */

(function() {
    // ── Accidental page-zoom guard (every touch device: a Windows touch
    // laptop, or a tablet past the phone redirect with ?full=1) ──────────
    // The viewport meta leaves zoom allowed (user-scalable=no fails
    // Lighthouse, and iOS Safari has ignored it since iOS 10): any pinch or
    // double-tap landing on the sidebars or buttons would zoom the whole
    // PAGE — fixed-position UI then breaks and it's fiddly to pinch back. touch-action protects only the
    // canvas (styles.css), so guard the rest here:
    // - gesturestart/gesturechange are iOS's pinch events; preventDefault
    //   reliably blocks page pinch-zoom. The canvas never sees them anyway
    //   (its touch handlers preventDefault first).
    // - The touchmove guard is the belt-and-braces for multi-touch on UI
    //   chrome; anything inside #canvas-area is exempt so the canvas's own
    //   two-finger gestures (05d TouchGestures) keep working.
    // Double-tap zoom on UI is killed by touch-action:manipulation in CSS.
    ['gesturestart', 'gesturechange'].forEach(function (t) {
        document.addEventListener(t, function (e) {
            e.preventDefault();
        }, { passive: false });
    });
    document.addEventListener('touchmove', function (e) {
        if (e.touches && e.touches.length > 1 &&
            !(e.target && e.target.closest && e.target.closest('#canvas-area'))) {
            e.preventDefault();
        }
    }, { passive: false });

    var compact = false;
    var stripHome = null;   // where the strip goes back to: { parent, next }

    // Two steps (Gabriel 2026-10-18: "as soon as a single element breaks into
    // the next row ... have the two sidebars form"):
    //   docked  (body.compact-ui)   the top bar would wrap onto a second row,
    //                               so it moves into the right sidebar; both
    //                               sidebars stay as you keep them.
    //   folded  (body.compact-fold) a small window (the old rule): docked, and
    //                               both bars fold to rails, one open at a time.
    // 1920 x 1080 and 2560 x 1440 fit the bar on one row; below that it docks.
    var folded = false;
    var dockedAt = 0;       // the window width the bar last failed to fit at
    function isFoldWindow() {
        return window.innerWidth <= 768
            || (window.innerHeight <= 500 && window.innerWidth <= 1200);
    }
    // Does the strip, in its top-bar home, wrap? Its cells sit on one row
    // when their tops are within a cell's own spread (the dividers sit a few
    // px lower than the cells, so a small spread is still one row).
    function stripWraps() {
        var strip = document.getElementById('mixer-strip');
        if (!strip || strip.closest('#sidebar-right')) return false;
        // js/46 parks faders in More when the row overflows: that is the
        // bar not fitting too, so it docks instead of parking.
        var more = document.getElementById('mixer-more');
        if (more && more.getClientRects().length && getComputedStyle(more).display !== 'none') return true;
        var lo = Infinity, hi = -Infinity;
        Array.prototype.forEach.call(strip.children, function (c) {
            var r = c.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return;
            lo = Math.min(lo, r.top); hi = Math.max(hi, r.top);
        });
        return hi - lo > 40;
    }

    // The strip moves WHOLE (live nodes, no clones), so every id, binding,
    // the radial menu and 46's More overflow keep working. It sits under the
    // right bar's rail; 21-sidebar.css wraps it into a grid that fits.
    function moveStripIn() {
        var strip = document.getElementById('mixer-strip');
        var bar = document.getElementById('sidebar-right');
        if (!strip || !bar || strip.parentElement === bar) return;
        stripHome = { parent: strip.parentElement, next: strip.nextElementSibling };
        var rail = bar.querySelector(':scope > .rsb-rail');
        bar.insertBefore(strip, rail ? rail.nextSibling : bar.firstChild);
    }
    function moveStripOut() {
        var strip = document.getElementById('mixer-strip');
        if (!strip || !stripHome || !stripHome.parent) return;
        var next = stripHome.next;   // #main-area: the strip sits right above it
        stripHome.parent.insertBefore(strip, next && next.parentNode === stripHome.parent ? next : null);
        stripHome = null;
    }

    // Lay the bars out for the current mode. Does nothing until js/20 has
    // built them (window.Sidebars.right is its last piece).
    function apply() {
        var S = window.Sidebars;
        if (compact) moveStripIn(); else moveStripOut();
        if (folded) {
            if (S && S.left && S.left.fold) S.left.fold(true);
            if (S && S.right) S.right.fold(true);
        } else {
            if (S && S.right) S.right.fold(false);
            if (S && S.left && S.left.restore) S.left.restore();
        }
    }

    function setMode(dock, fold) {
        dock = !!dock || !!fold;
        fold = !!fold;
        if (dock === compact && fold === folded) return;
        var wasFolded = folded;
        compact = dock;
        folded = fold;
        document.body.classList.toggle('compact-ui', compact);
        document.body.classList.toggle('compact-fold', folded);
        // Folds belong to the small window: entering or leaving it sets the
        // bars; docking alone leaves them as they are.
        if (fold !== wasFolded) apply();
        else if (compact) moveStripIn();
        else moveStripOut();
    }
    function setCompact(on) { setMode(on, on && isFoldWindow()); }

    // Decide after the window changed size (and after js/20 re-zoomed the
    // bars, which it does on resize too): once per frame at most.
    var raf = 0;
    function decide() {
        raf = 0;
        if (!(window.Sidebars && window.Sidebars.right)) return;
        if (isFoldWindow()) { setMode(true, true); return; }
        if (!compact) {
            if (stripWraps()) { dockedAt = window.innerWidth; setMode(true, false); }
            else setMode(false, false);
            return;
        }
        // Docked: try the top bar again only once the window is wider than
        // where it last did not fit (in the same task, so no frame shows it).
        if (window.innerWidth <= dockedAt && !folded) return;
        setMode(false, false);
        if (stripWraps()) { dockedAt = window.innerWidth; setMode(true, false); }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(decide); }

    function init() {
        // Decide before the layout is built (js/20 builds after DCL), so
        // the bars come up folded with no full-size frame first.
        folded = compact = isFoldWindow();
        document.body.classList.toggle('compact-ui', compact);
        document.body.classList.toggle('compact-fold', folded);

        // js/20 inserts the finished strip as a <body> child in one task;
        // the observer fires right after it, before that frame paints, and
        // the wrap test runs there too (a docked bar never shows a frame on
        // two rows).
        function built() { return !!(window.Sidebars && window.Sidebars.right); }
        function first() {
            if (compact) apply();
            decide();
        }
        if (built()) {
            first();
        } else {
            var mo = new MutationObserver(function () {
                if (!built()) return;
                mo.disconnect();
                first();
            });
            mo.observe(document.body, { childList: true });
        }

        window.addEventListener('resize', schedule);
        // The bar's own size changes after the window's does: the label face
        // loading, the entrance settling, js/46 parking a fader. Watching it
        // catches a wrap that appears after the first test (a 1584 px launch
        // wrapped and never docked).
        if (typeof ResizeObserver !== 'undefined') {
            (function watchStrip() {
                var strip = document.getElementById('mixer-strip');
                if (!strip) { setTimeout(watchStrip, 250); return; }
                new ResizeObserver(schedule).observe(strip);
            })();
        }
        // The label face loads after the first layout and changes widths.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

        // For test harnesses: force either layout (the next resize that
        // crosses the line decides again). No argument flips it.
        window.toggleCompactMode = function (on) {
            setCompact(on === undefined ? !compact : on);
            return compact;
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
