/**
 * Hotkey Reminder Bar
 * Fixed-position panel that slides in from the right edge of the mixer
 * strip when modifier keys are held. Same height as the strip, overlays
 * color / actions / presets but not the fader channels.
 * All animation is GPU-composited (transform + opacity).
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        // Wait for mixer-layout to build the strip
        requestAnimationFrame(function () { requestAnimationFrame(init); });
    });

    function init() {
        // Sync height with mixer strip
        var strip = document.getElementById('mixer-strip');
        if (strip) {
            document.body.style.setProperty('--strip-h', strip.offsetHeight + 'px');
        }

        var bar = document.createElement('div');
        bar.id = 'hotkeyReminder';
        bar.className = 'hotkey-reminder';
        bar.innerHTML =
            '<div class="hotkey-reminder-inner">' +
                '<div class="hk-group hk-default">' +
                    '<span class="hk-chip"><kbd>[</kbd><kbd>]</kbd> Brush</span>' +
                    '<span class="hk-chip"><kbd>1</kbd>–<kbd>8</kbd> Mult</span>' +
                    '<span class="hk-chip"><kbd>T</kbd> Trail</span>' +
                    '<span class="hk-chip"><kbd>C</kbd> Cursor</span>' +
                    '<span class="hk-chip"><kbd>H</kbd> Handles</span>' +
                    '<span class="hk-chip"><kbd>L</kbd> Lock</span>' +
                    '<span class="hk-chip"><kbd>R</kbd> Random</span>' +
                    '<span class="hk-chip"><kbd>A</kbd> Step</span>' +
                    '<span class="hk-chip"><kbd>N</kbd> Next Color</span>' +
                    '<span class="hk-chip"><kbd>S</kbd> Focus</span>' +
                '</div>' +
                '<div class="hk-group hk-shift">' +
                    '<span class="hk-mod">Shift</span>' +
                    '<span class="hk-chip"><kbd>[</kbd><kbd>]</kbd> Coarse Brush</span>' +
                    '<span class="hk-chip"><kbd>S</kbd> Save Color</span>' +
                    '<span class="hk-chip"><kbd>X</kbd> Clear Colors</span>' +
                    '<span class="hk-chip"><kbd>N</kbd> Prev Color</span>' +
                '</div>' +
                '<div class="hk-group hk-ctrl">' +
                    '<span class="hk-mod">Ctrl</span>' +
                    '<span class="hk-chip"><kbd>←</kbd><kbd>→</kbd> Cycle Palette</span>' +
                    '<span class="hk-chip"><kbd>Z</kbd> Undo</span>' +
                    '<span class="hk-chip"><kbd>Y</kbd> Redo</span>' +
                '</div>' +
                '<div class="hk-group hk-ctrl-shift">' +
                    '<span class="hk-mod">Ctrl+Shift</span>' +
                    '<span class="hk-chip"><kbd>Scroll</kbd> Motion Isolation</span>' +
                    '<span class="hk-chip"><kbd>Z</kbd> Redo</span>' +
                '</div>' +
                '<div class="hk-group hk-alt">' +
                    '<span class="hk-mod">Alt</span>' +
                    '<span class="hk-chip"><kbd>↑</kbd><kbd>↓</kbd> Visual Quality</span>' +
                '</div>' +
                '<div class="hk-group hk-alt-shift">' +
                    '<span class="hk-mod">Alt+Shift</span>' +
                    '<span class="hk-chip"><kbd>↑</kbd><kbd>↓</kbd> Physics Detail</span>' +
                '</div>' +
            '</div>';

        document.body.appendChild(bar);

        // Cache group elements (flat array for fast iteration)
        var groupEls = [
            bar.querySelector('.hk-default'),   // 0
            bar.querySelector('.hk-shift'),      // 1
            bar.querySelector('.hk-ctrl'),       // 2
            bar.querySelector('.hk-ctrl-shift'), // 3
            bar.querySelector('.hk-alt'),        // 4
            bar.querySelector('.hk-alt-shift'),  // 5
        ];

        var shift = false, ctrl = false, alt = false;
        var isVisible = false;

        function update() {
            var any = shift || ctrl || alt;

            if (any !== isVisible) {
                isVisible = any;
                if (any) bar.classList.add('visible');
                else     bar.classList.remove('visible');
            }
            if (!any) return;

            var active = -1;
            if      (ctrl && shift && !alt) active = 3;
            else if (alt && shift && !ctrl) active = 5;
            else if (ctrl && !shift && !alt) active = 2;
            else if (alt && !shift && !ctrl) active = 4;
            else if (shift && !ctrl && !alt) active = 1;

            for (var i = 0; i < groupEls.length; i++) {
                groupEls[i].classList.toggle('hk-hidden', i !== 0 && i !== active);
            }
        }

        function onKey(e) {
            var s = e.shiftKey, c = e.ctrlKey || e.metaKey, a = e.altKey;
            if (s !== shift || c !== ctrl || a !== alt) {
                shift = s; ctrl = c; alt = a;
                update();
            }
        }

        document.addEventListener('keydown', onKey, true);
        document.addEventListener('keyup', onKey, true);

        window.addEventListener('blur', function () {
            shift = false; ctrl = false; alt = false;
            update();
        });

        // Re-sync height if window resizes (mixer strip may reflow)
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (strip) {
                    document.body.style.setProperty('--strip-h', strip.offsetHeight + 'px');
                }
            }, 200);
        });
    }
})();
