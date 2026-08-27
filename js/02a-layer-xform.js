// ═══════════════════════════════════════════════════════════════════
// js/02a-layer-xform.js — the layer transform contract, in one place
// LOAD ORDER: plain <script> after 02-palettes, before everything that
//   renders or composites layers. Pure math: no DOM, no config.
//
// Every site that places a layer — the CSS divs (05k/05l), the obstacle
// compositors (23/05c/05b), splat-to-fluid (05m), mask import (05o), the
// export compositors (24/comfyui-bridge), the mask editor's view matrix
// (15), and the transform overlay's hit-testing (26) — must agree on ONE
// matrix:
//   M = T(center + x,y) · R(rotation) · K(skew) · S(scaleX,scaleY) · T(-center)
// with K = [1, tan(skewX); tan(skewY), 1], i.e. CSS skew(skewX, skewY).
// NOT skewX()·skewY() chained — their product carries a tan·tan term that
// CSS skew() does not, and the drift only shows when both axes are
// nonzero. Angles are stored in DEGREES, like rotation. A site that
// misses the shear draws a layer whose collider/mask/export no longer
// matches what is on screen.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var D2R = Math.PI / 180;

    function skewTan(layer) {
        return {
            tx: Math.tan(((layer && layer.skewX) || 0) * D2R),
            ty: Math.tan(((layer && layer.skewY) || 0) * D2R)
        };
    }

    window.LayerXform = {
        skewTan: skewTan,

        // The CSS transform string for a layer div. 05k renderLayers and
        // 05l updateLayerPosition must emit the SAME string, or whichever
        // runs later stomps the other's skew on every reorder.
        cssTransform: function (layer) {
            var t = 'translate(' + (layer.x || 0) + 'px, ' + (layer.y || 0) + 'px)' +
                    ' rotate(' + (layer.rotation || 0) + 'deg)';
            if (layer.skewX || layer.skewY) {
                t += ' skew(' + (layer.skewX || 0) + 'deg, ' + (layer.skewY || 0) + 'deg)';
            }
            t += ' scale(' + (layer.scaleX || 1) + ', ' + (layer.scaleY || 1) + ')';
            return t;
        },

        // The shear alone, for a 2D context that is already translated and
        // rotated — insert between rotate() and scale() to match CSS order.
        // Also accepts any object carrying skewX/skewY in degrees.
        shearCtx: function (ctx, layer) {
            if (!layer || (!layer.skewX && !layer.skewY)) return;
            var k = skewTan(layer);
            ctx.transform(1, k.ty, k.tx, 1, 0, 0);
        },

        // K applied to a point (forward shear), in the de-rotated frame.
        shearPoint: function (layer, x, y) {
            var k = skewTan(layer);
            return { x: x + k.tx * y, y: y + k.ty * x };
        },

        // K⁻¹ applied to a point — for hit-tests and editors mapping a
        // screen point back into the layer's pre-shear space. The signed
        // determinant is kept (a strong two-axis skew can flip it); only a
        // near-zero det (layer collapsed to a line) is clamped.
        unshearPoint: function (layer, x, y) {
            var k = skewTan(layer);
            var det = 1 - k.tx * k.ty;
            if (Math.abs(det) < 1e-4) det = (det < 0) ? -1e-4 : 1e-4;
            return { x: (x - k.tx * y) / det, y: (y - k.ty * x) / det };
        }
    };
})();
