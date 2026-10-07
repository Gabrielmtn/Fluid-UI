/**
 * Compact window
 *
 * A small desktop window (768px wide or less, or 500px tall or less and up
 * to 1200px wide) keeps the desktop layout, folded: both sidebars fold to
 * their rails and the top bar (the mixer strip) moves into the right
 * sidebar, so the canvas gets the whole window. A compact window has room
 * for one open bar, so opening one folds the other (js/20). Folds made here
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
    // The viewport meta already says user-scalable=no, but iOS Safari has
    // ignored that since iOS 10: any pinch or double-tap landing on the
    // sidebars or buttons zooms the whole PAGE — fixed-position UI then
    // breaks and it's fiddly to pinch back. touch-action protects only the
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

    function isCompactWindow() {
        return window.innerWidth <= 768
            || (window.innerHeight <= 500 && window.innerWidth <= 1200);
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
        if (compact) {
            moveStripIn();
            if (S && S.left && S.left.fold) S.left.fold(true);
            if (S && S.right) S.right.fold(true);
        } else {
            moveStripOut();
            if (S && S.right) S.right.fold(false);
            if (S && S.left && S.left.restore) S.left.restore();
        }
    }

    function setCompact(on) {
        compact = !!on;
        document.body.classList.toggle('compact-ui', compact);
        apply();
    }

    function init() {
        // Decide before the layout is built (js/20 builds after DCL), so
        // the bars come up folded with no full-size frame first.
        compact = isCompactWindow();
        document.body.classList.toggle('compact-ui', compact);

        // js/20 inserts the finished strip as a <body> child in one task;
        // the observer fires right after it, before that frame paints.
        function built() { return !!(window.Sidebars && window.Sidebars.right); }
        if (built()) {
            if (compact) apply();
        } else {
            var mo = new MutationObserver(function () {
                if (!built()) return;
                mo.disconnect();
                if (compact) apply();
            });
            mo.observe(document.body, { childList: true });
        }

        window.addEventListener('resize', function () {
            var want = isCompactWindow();
            if (want !== compact) setCompact(want);
        });

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
