/**
 * Studio Drawer — shared, tabbed "lower area" for the bottom drawer (#recDrawer).
 *
 * The bottom drawer is shared between the Record feature and the Audio feature.
 * A tab bar at the top switches which panel (.studio-tab-panel[data-tab]) shows.
 * Each feature keeps its own Off/Min/Full mode <select> (recMode / audioMode);
 * "Full" routes through here. The mode selects remain the single source of truth
 * for "which feature is Full" — opening one tab demotes the other Full -> Min so
 * the sidebar minis stay correct.
 *
 * window.studioDrawer = { open(tab), close(), setActiveTab(tab), isOpen(), activeTab() }
 */
(function () {
    'use strict';

    var DRAWER_ID = 'recDrawer';
    // Guard against change -> open -> change recursion when we demote a select.
    var syncing = false;

    function drawer() { return document.getElementById(DRAWER_ID); }
    function modeSelectFor(tab) { return document.getElementById(tab === 'audio' ? 'audioMode' : 'recMode'); }

    function setActiveTab(tab) {
        var d = drawer(); if (!d) return;
        tab = (tab === 'audio') ? 'audio' : 'record';
        d.setAttribute('data-active-tab', tab);
        var tabs = d.querySelectorAll('.studio-tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === tab);
        var panels = d.querySelectorAll('.studio-tab-panel');
        for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].dataset.tab === tab);
    }

    // Drop the *other* feature out of Full when we switch tabs, so its sidebar
    // mini reappears and only one feature is ever "Full".
    function demoteOther(tab) {
        var other = (tab === 'audio') ? 'record' : 'audio';
        var sel = modeSelectFor(other);
        if (sel && sel.value === 'full') { sel.value = 'min'; sel.dispatchEvent(new Event('change')); }
    }

    function open(tab) {
        var d = drawer(); if (!d) return;
        tab = (tab === 'audio') ? 'audio' : 'record';
        d.classList.add('open');
        setActiveTab(tab);
        if (!syncing) { syncing = true; try { demoteOther(tab); } finally { syncing = false; } }
    }

    function close() {
        var d = drawer(); if (!d) return;
        d.classList.remove('open');
        if (!syncing) {
            syncing = true;
            try {
                ['recMode', 'audioMode'].forEach(function (id) {
                    var sel = document.getElementById(id);
                    if (sel && sel.value === 'full') { sel.value = 'min'; sel.dispatchEvent(new Event('change')); }
                });
            } finally { syncing = false; }
        }
    }

    function isOpen() { var d = drawer(); return !!(d && d.classList.contains('open')); }
    function activeTab() { var d = drawer(); return d ? (d.getAttribute('data-active-tab') || 'record') : 'record'; }

    window.studioDrawer = { open: open, close: close, setActiveTab: setActiveTab, isOpen: isOpen, activeTab: activeTab };

    function wire() {
        var d = drawer(); if (!d) return;
        // Tab buttons route through the feature's mode select so its applyMode()
        // runs (which builds/refreshes the panel, then calls open()).
        var tabs = d.querySelectorAll('.studio-tab');
        for (var i = 0; i < tabs.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var tab = btn.dataset.tab;
                    var sel = modeSelectFor(tab);
                    if (sel) { sel.value = 'full'; sel.dispatchEvent(new Event('change')); }
                    else { open(tab); } // fallback if that feature's select isn't built yet
                });
            })(tabs[i]);
        }
        var closeBtn = document.getElementById('studioCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', close);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
})();
