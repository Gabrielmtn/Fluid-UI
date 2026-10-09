// Canvas size readout (2026-10-04, user test 3: "Export aspect ratio drifts").
//
// A picture or a video comes out at the canvas's own pixel size, and a stream
// format is a RATIO fitted into the window: "9:16 TikTok" on a laptop exports
// 464 × 826, not the 1080 × 1920 its row in 21-focus-mode carries. Nothing on
// screen said either. Now three places say it in the same words:
//   - the underbar, under the canvas: "Canvas  464 × 826 · 9:16", always;
//   - Export, under Quick Export: "Comes out 464 × 826 · 9:16";
//   - the label over the canvas while a handle drags (01-config) takes the ratio.
// The size is the canvas buffer (canvas.width/height): what the exporters
// read, including any render scale. The video rounds an odd side down by one
// pixel for H.264; a readout doesn't chase that.
(function () {
    'use strict';

    // Ratios worth a name, within 1%. Anything else reads as a decimal.
    var NAMED = [[9, 16], [1, 1], [16, 9], [21, 9], [4, 3], [3, 4], [4, 5], [5, 4], [3, 2], [2, 3], [2, 1], [1, 2]];
    function ratioLabel(w, h) {
        if (!(w > 0 && h > 0)) return '';
        var r = w / h;
        for (var i = 0; i < NAMED.length; i++) {
            var n = NAMED[i][0] / NAMED[i][1];
            if (Math.abs(r - n) / n < 0.01) return NAMED[i][0] + ':' + NAMED[i][1];
        }
        return r >= 1 ? r.toFixed(2) + ':1' : '1:' + (1 / r).toFixed(2);
    }
    function sizeText(w, h) { return w + ' × ' + h + ' · ' + ratioLabel(w, h); }

    var barEl = null, barVal = null, exportEl = null;
    var lastW = -1, lastH = -1;

    function current() {
        var c = document.getElementById('canvas');
        return c ? { w: c.width, h: c.height } : null;
    }

    // A GIF is scaled down to the exporter's max width (24 exportGIF, same
    // math), so on most canvases it does NOT come out at the canvas size;
    // the Export line says so (agent usertest 2026-10-07: "Comes out
    // 1008 × 646" over a 640 × 410 GIF).
    function gifMaxW() {
        var fe = window.fluidExport;
        var cfg = fe && typeof fe.getConfig === 'function' ? fe.getConfig() : null;
        return (cfg && cfg.gifMaxWidth) || 640;
    }
    var lastMax = -1;

    function refresh(force) {
        var s = current();
        if (!s) return;
        var maxW = gifMaxW();
        if (!force && s.w === lastW && s.h === lastH && maxW === lastMax) return;
        lastW = s.w; lastH = s.h; lastMax = maxW;
        var t = sizeText(s.w, s.h);
        if (barVal) barVal.textContent = t;
        if (exportEl) {
            var out = 'Comes out ' + t;
            var gw = s.w, gh = s.h;
            if (gw > maxW) { gh = Math.round(gh * (maxW / gw)); gw = maxW; }
            gw = gw & ~1; gh = gh & ~1;   // and even sides, as 24 does
            if (gw !== s.w || gh !== s.h) out += ' (GIF ' + gw + ' × ' + gh + ')';
            exportEl.textContent = out;
        }
    }

    // On the underbar after the quality pills, before Reset app and the clock.
    function placeBar() {
        var bar = document.getElementById('quality-underbar');
        if (!bar) return false;
        if (!barEl) {
            barEl = document.createElement('div');
            barEl.className = 'qub-size';
            barEl.title = 'The canvas in pixels, and its shape. Pictures and videos come out at this size; ' +
                'drag the canvas handles or pick a Focus → Format to change it.';
            var cap = document.createElement('div');
            cap.className = 'qub-dd-cap';
            cap.textContent = 'Canvas';
            barVal = document.createElement('div');
            barVal.className = 'qub-size-val';
            barEl.appendChild(cap);
            barEl.appendChild(barVal);
        }
        if (barEl.parentElement !== bar) {
            bar.insertBefore(barEl, bar.querySelector('.reset-app-btn, .demo-clock, .playtest-label'));
        }
        return true;
    }

    // In Export, right under the Quick Export buttons (20-mixer-layout builds
    // them; the Background row follows the grid).
    function placeExport() {
        var ground = document.getElementById('exportGround');
        var row = ground && ground.parentElement;
        if (!row || !row.parentElement) return false;
        if (!exportEl) {
            exportEl = document.createElement('div');
            exportEl.className = 'export-size-readout';
            exportEl.title = 'Video and pictures come out at the canvas size; a video rounds an odd side ' +
                'down by one pixel. A GIF is at most ' + gifMaxW() + ' px wide, with even sides; when that makes it ' +
                'smaller, its size is in brackets.';
        }
        if (exportEl.parentElement !== row.parentElement) row.parentElement.insertBefore(exportEl, row);
        return true;
    }

    (function mount() {
        var a = placeBar(), b = placeExport();
        refresh(true);
        if (!a || !b) { setTimeout(mount, 300); return; }
        // Two integer reads every half second, written only when they change:
        // cheaper than hooking every path that resizes the buffer (handles,
        // window, formats, Focus, render scale, the 05j settle).
        setInterval(function () { if (!document.hidden) refresh(false); }, 500);
    })();

    window.CanvasReadout = { ratioLabel: ratioLabel, text: sizeText, refresh: function () { refresh(true); } };
})();
