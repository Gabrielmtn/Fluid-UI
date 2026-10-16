/**
 * Studio Drawer — the full-width bottom drawer (#recDrawer). Audio is its
 * one tab since the animation editor went (2026-10-13): the record strip in
 * Animations is the whole recorder now. The ids kept their rec names.
 *
 * audioMode stays the single source of truth for "is Audio Full": its
 * "full" opens the drawer here, and closing the drawer sets it back to
 * "min" so the sidebar mini reappears.
 *
 * window.studioDrawer = { open(tab), close(), setActiveTab(tab), isOpen(), activeTab() }
 */
(function () {
    'use strict';

    var DRAWER_ID = 'recDrawer';
    // Guard against change -> close -> change recursion when we demote the select.
    var syncing = false;

    function drawer() { return document.getElementById(DRAWER_ID); }
    function modeSelect() { return document.getElementById('audioMode'); }

    // One tab; the tab argument is kept for callers that still pass it.
    function setActiveTab() {
        var d = drawer(); if (!d) return;
        d.setAttribute('data-active-tab', 'audio');
        var tabs = d.querySelectorAll('.studio-tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === 'audio');
        var panels = d.querySelectorAll('.studio-tab-panel');
        for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].dataset.tab === 'audio');
    }

    function open() {
        var d = drawer(); if (!d) return;
        d.classList.add('open');
        setActiveTab();
    }

    function close() {
        var d = drawer(); if (!d) return;
        d.classList.remove('open');
        if (!syncing) {
            syncing = true;
            try {
                var sel = modeSelect();
                if (sel && sel.value === 'full') { sel.value = 'min'; sel.dispatchEvent(new Event('change')); }
            } finally { syncing = false; }
        }
    }

    function isOpen() { var d = drawer(); return !!(d && d.classList.contains('open')); }
    function activeTab() { return 'audio'; }

    window.studioDrawer = { open: open, close: close, setActiveTab: setActiveTab, isOpen: isOpen, activeTab: activeTab };

    // The handle on its top edge drags the drawer taller or shorter. The
    // drawer is zoomed by --ui-scale (init-responsive.css), so the pointer
    // and getBoundingClientRect speak SCREEN px while its CSS height is
    // pre-zoom. Mixing the two made every grab jump by the scale, and the
    // 90%-of-window cap became 90% x scale: from about 1.12 the handle went
    // off the top, the Full audio view could be dragged over nearly the
    // whole canvas, and only a sliver came back (usertest 2026-10-03). Work
    // in screen px, convert once, and keep at least 120 px of canvas above
    // it, at most 60% of the window.
    function wireResize() {
        var d = drawer();
        var handle = document.getElementById('recResizeHandle');
        if (!d || !handle) return;
        var MIN_PX = 160;
        function zoomOf() {
            var css = d.offsetHeight, scr = d.getBoundingClientRect().height;
            return (css > 0 && scr > 0) ? scr / css : 1;
        }
        function maxPx() { return Math.max(MIN_PX, Math.min(window.innerHeight * 0.6, window.innerHeight - 120)); }
        function setScreenHeight(px) {
            var h = Math.max(MIN_PX, Math.min(maxPx(), px));
            d.style.height = Math.round(h / zoomOf()) + 'px';
        }
        var resizing = null;   // { id, startY, startH } in screen px
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            resizing = { id: e.pointerId, startY: e.clientY, startH: d.getBoundingClientRect().height };
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
        });
        handle.addEventListener('pointermove', function (e) {
            if (!resizing || e.pointerId !== resizing.id) return;
            setScreenHeight(resizing.startH + (resizing.startY - e.clientY)); // up = taller
        });
        function stop(e) {
            if (!resizing || (e && e.pointerId !== resizing.id)) return;
            try { handle.releasePointerCapture(resizing.id); } catch (_) {}
            resizing = null;
        }
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
        handle.addEventListener('lostpointercapture', stop);
        // A smaller window (or a bigger ui scale) takes the drawer down
        // with it rather than leaving it over the canvas.
        window.addEventListener('resize', function () {
            if (!d.classList.contains('open')) return;
            if (d.getBoundingClientRect().height > maxPx() + 1) setScreenHeight(maxPx());
        });
    }

    function wire() {
        var d = drawer(); if (!d) return;
        // The tab routes through audioMode so its applyAudioMode() runs
        // (which builds/refreshes the panel, then calls open()).
        var tabs = d.querySelectorAll('.studio-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function () {
                var sel = modeSelect();
                if (sel) { sel.value = 'full'; sel.dispatchEvent(new Event('change')); }
                else { open(); } // fallback if the audio select isn't built yet
            });
        }
        var closeBtn = document.getElementById('studioCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', close);
        wireResize();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
})();
