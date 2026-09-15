/**
 * Hotkeys — the hotkey maker
 *
 * Everything the app needs to let a person pick their own keys: turn a key
 * press into a combo, say a combo back in words, know when the app already
 * owns a key, record one with a click-then-press picker, and fire the
 * bindings people make.
 *
 * First customer: the Text panel (js/23-text-overlays.js, editor in
 * js/20-mixer-layout.js). A line of text can carry a key that pours the
 * whole block into the fluid — a typewriter whose keys type paragraphs —
 * or shows and hides it. Built next on the same pieces: Ctrl+Shift+H to
 * bind any button or slider, and the list of every binding in Settings.
 *
 * COMBOS are strings: modifiers in a fixed order, then the physical key's
 * KeyboardEvent.code — 'KeyQ', 'Shift+Digit9', 'Ctrl+Alt+F6'; '' is none.
 * The code, not the character: Shift turns '9' into '(' and Caps Lock turns
 * 'q' into 'Q', while the code stays put. Meta folds into Ctrl, the way the
 * app's own shortcuts treat it (05n's ctrlOrMeta). What a key is CALLED
 * comes from the keyboard layout wherever the browser will say, so the key
 * an AZERTY keyboard prints 'A' on reads 'A', not 'Q'.
 *
 * BINDINGS come from SOURCES: an owner registers a function that lists its
 * bindings as they are right now, and every press asks. Nothing registers
 * or unregisters as content changes, so a binding cannot outlive the thing
 * it belongs to — a deleted line, a preset load, Clear All.
 *
 * THE APP'S OWN KEYS ALWAYS WIN. RESERVED mirrors the guard of every
 * built-in handler (05n, 05e, 21, 35, 44, 32, comfyui-bridge,
 * electron-performance, the dev keys in electron-main) — a new built-in
 * shortcut gets a rule there too. The picker will not record a press the
 * app already answers, and the dispatcher skips one too, in case a later
 * build claims a key an older binding already had.
 *
 * A binding can be HELD: give it a release() and it hears its key come back
 * up, so holding a key can mean something (a line of text keeps pouring
 * until the key comes up, like the Constant-flow brush).
 *
 * window.Hotkeys = {
 *   fromEvent, normalize, format, reservedBy,
 *   addSource, list, find, releaseAll, onChange, changed, suspend,
 *   picker, isListening
 * }
 */
(function () {
    'use strict';

    var IS_MAC = /Mac/i.test(navigator.platform || '');

    // ─── KEYS ───────────────────────────────────────────────────
    // Presses that are only a modifier going down: never a combo on their
    // own. The picker shows them as the start of one ("Ctrl+…").
    var MODIFIER_KEYS = {
        Shift: 1, Control: 1, Alt: 1, AltGraph: 1, Meta: 1, OS: 1, Hyper: 1, Super: 1,
        CapsLock: 1, NumLock: 1, ScrollLock: 1, Fn: 1, FnLock: 1
    };
    var MODIFIER_CODE = /^(Shift|Control|Alt|Meta|OS)(Left|Right)$|^(CapsLock|NumLock|ScrollLock|Fn|FnLock)$/;

    function isModifier(e) {
        return !!(MODIFIER_KEYS[e.key] || MODIFIER_CODE.test(e.code || ''));
    }

    // What a key is called on a keycap.
    var NAMED = {
        Space: 'Space', Enter: 'Enter', NumpadEnter: 'Num Enter', Tab: 'Tab', Escape: 'Esc',
        Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End',
        PageUp: 'PgUp', PageDown: 'PgDn',
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num ×', NumpadDivide: 'Num ÷',
        NumpadDecimal: 'Num .', NumpadEqual: 'Num =', NumpadComma: 'Num ,',
        ContextMenu: 'Menu', Pause: 'Pause', PrintScreen: 'PrtSc'
    };

    // The unshifted character on a US keyboard — the fallback where the
    // browser will not describe the layout (getLayoutMap is Chromium-only)…
    var US = {
        Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
        Backslash: '\\', IntlBackslash: '\\', Semicolon: ';', Quote: "'",
        Comma: ',', Period: '.', Slash: '/'
    };
    // …and what Shift makes of them, so a STORED combo can be tested against
    // handlers that compare e.key (Shift+Slash arrives as '?').
    var US_SHIFTED = {
        Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$', Digit5: '%',
        Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(', Digit0: ')',
        Backquote: '~', Minus: '_', Equal: '+', BracketLeft: '{', BracketRight: '}',
        Backslash: '|', Semicolon: ':', Quote: '"', Comma: '<', Period: '>', Slash: '?'
    };
    // e.key for the keys that do not type a character.
    var CODE_KEY = {
        Space: ' ', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Escape: 'Escape',
        Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
        PageUp: 'PageUp', PageDown: 'PageDown', ContextMenu: 'ContextMenu',
        ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight'
    };
    // …and back, for events that arrive with no code (synthetic ones, some
    // virtual keyboards). 'Enter' maps to Enter, not the numpad's.
    var KEY_CODE = { ' ': 'Space' };
    Object.keys(CODE_KEY).forEach(function (c) {
        if (c !== 'NumpadEnter' && c !== 'Space') KEY_CODE[CODE_KEY[c]] = c;
    });

    var layoutMap = null;
    try {
        if (navigator.keyboard && typeof navigator.keyboard.getLayoutMap === 'function') {
            navigator.keyboard.getLayoutMap().then(function (m) { layoutMap = m; }, function () {});
        }
    } catch (_) {}

    // Where the layout map is missing, learn the layout from keys people
    // actually press — an unmodified press says what that key types.
    var learned = {};
    window.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (e.code && e.key && e.key.length === 1) learned[e.code] = e.key;
    }, true);

    function layoutChar(code) {
        var ch = null;
        try { ch = layoutMap ? layoutMap.get(code) : null; } catch (_) {}
        if (!ch) ch = learned[code];
        return (ch && ch.length === 1 && ch.trim()) ? ch : null;
    }

    // ─── COMBOS ─────────────────────────────────────────────────
    function codeOf(e) {
        var code = e.code;
        if (code && code !== 'Unidentified') return code;
        var k = e.key || '';
        if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
        if (/^[0-9]$/.test(k)) return 'Digit' + k;
        if (/^F\d{1,2}$/.test(k)) return k;
        return KEY_CODE[k] || '';
    }

    function build(ctrl, alt, shift, code) {
        return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '') + code;
    }

    // The combo a key press makes, or '' for a press that cannot be one
    // (a lone modifier, an IME composition, a key with no identity).
    function fromEvent(e) {
        if (!e || e.isComposing || isModifier(e)) return '';
        var code = codeOf(e);
        if (!code || code === 'Unidentified' || code === 'Process') return '';
        return build(!!(e.ctrlKey || e.metaKey), !!e.altKey, !!e.shiftKey, code);
    }

    // Lenient on the way in — 'ctrl+q', 'Shift+9', 'cmd+F6' — so a combo can
    // be written by hand; always canonical on the way out. No code contains
    // '+' (the numpad's is 'NumpadAdd'), which is what makes it the separator.
    function normalizeCode(p) {
        if (/^[a-z]$/i.test(p)) return 'Key' + p.toUpperCase();
        if (/^[0-9]$/.test(p)) return 'Digit' + p;
        if (/^f\d{1,2}$/i.test(p)) return 'F' + p.slice(1);
        if (/^key[a-z]$/i.test(p)) return 'Key' + p.slice(3).toUpperCase();
        if (/^digit\d$/i.test(p)) return 'Digit' + p.slice(5);
        if (p === 'Esc') return 'Escape';
        return p;
    }

    function parse(combo) {
        if (typeof combo !== 'string' || !combo) return null;
        var out = { ctrl: false, alt: false, shift: false, code: '' };
        var parts = combo.split('+');
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim();
            if (!p) continue;
            var l = p.toLowerCase();
            if (l === 'ctrl' || l === 'control' || l === 'cmd' || l === 'meta' || l === 'mod') out.ctrl = true;
            else if (l === 'alt' || l === 'option') out.alt = true;
            else if (l === 'shift') out.shift = true;
            else out.code = normalizeCode(p);
        }
        return out.code ? out : null;
    }

    function normalize(combo) {
        var c = parse(combo);
        return c ? build(c.ctrl, c.alt, c.shift, c.code) : '';
    }

    // ─── WORDS ──────────────────────────────────────────────────
    function keyLabel(code) {
        if (NAMED[code]) return NAMED[code];
        var m;
        // Digits read as digits on every common layout's keycap, even where
        // the unshifted character is something else (AZERTY's '&').
        if ((m = /^Digit(\d)$/.exec(code))) return m[1];
        if ((m = /^Numpad(\d)$/.exec(code))) return 'Num ' + m[1];
        if (/^F\d{1,2}$/.test(code)) return code;
        var ch = layoutChar(code);
        if (ch) return ch.toUpperCase();
        if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
        return US[code] || code;
    }

    function modsLabel(ctrl, alt, shift) {
        if (IS_MAC) return (ctrl ? '⌘' : '') + (alt ? '⌥' : '') + (shift ? '⇧' : '');
        return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '');
    }

    // 'Ctrl+Shift+KeyQ' → 'Ctrl+Shift+Q' (⌘⇧Q on a Mac).
    function format(combo) {
        var c = parse(combo);
        return c ? modsLabel(c.ctrl, c.alt, c.shift) + keyLabel(c.code) : '';
    }

    // ─── THE APP'S OWN KEYS ─────────────────────────────────────
    // One rule per built-in, written the way its handler tests the press —
    // e.key for most, e.code for the multiplier digits — so a rule matches
    // exactly the presses that handler acts on, Shift and all. First match
    // wins; `says` finishes the sentence "<key> …".
    function k0(k) { return !k.ctrl && !k.alt && !k.shift; }
    function noCA(k) { return !k.ctrl && !k.alt; }
    var RESERVED = [
        // Everywhere — the picker's own keys, a focused button's, the browser's
        { says: 'already cancels and stops recordings', test: function (k) { return k.key === 'Escape'; } },
        { says: 'already moves between controls', test: function (k) { return k.key === 'Tab'; } },
        { says: 'already presses the focused button', test: function (k) { return k.key === 'Enter' && k0(k); } },
        { says: 'already freezes and pauses the fluid', test: function (k) { return k.key === ' '; } },
        { says: 'already opens the hotkey list', test: function (k) { return k.key === 'F1' || (k.shift && (k.key === '?' || k.key === '/')); } },
        { says: 'already switches fullscreen', test: function (k) { return k.key === 'F11'; } },
        { says: 'already starts recording', test: function (k) { return k.key === 'F9'; } },
        { says: 'already reloads the app', test: function (k) { return k.key === 'F5' || (k.ctrl && k.lower === 'r'); } },
        { says: 'already opens developer tools', test: function (k) { return k.key === 'F12' || (k.ctrl && k.shift && (k.lower === 'i' || k.lower === 'j')); } },
        { says: 'already resets all local data', test: function (k) { return k.ctrl && k.shift && k.lower === 'd'; } },
        { says: 'already binds a hotkey to a control', test: function (k) { return k.ctrl && k.shift && k.lower === 'h'; } },
        { says: 'already adds a recording layer', test: function (k) { return k.ctrl && k.shift && k.lower === 'n'; } },
        { says: 'already frees memory (developer)', test: function (k) { return k.ctrl && k.shift && k.lower === 'g'; } },
        { says: 'already undoes', test: function (k) { return k.ctrl && k.lower === 'z' && !k.shift; } },
        { says: 'already redoes', test: function (k) { return k.ctrl && (k.lower === 'y' || k.lower === 'z'); } },
        { says: 'already selects all', test: function (k) { return k.ctrl && !k.alt && k.lower === 'a'; } },
        { says: 'already copies', test: function (k) { return k.ctrl && !k.alt && k.lower === 'c'; } },
        { says: 'already cuts', test: function (k) { return k.ctrl && !k.alt && k.lower === 'x'; } },
        { says: 'already pastes an image as a hidden collider', test: function (k) { return k.ctrl && !k.alt && k.shift && k.lower === 'v'; } },
        { says: 'already pastes an image as a layer', test: function (k) { return k.ctrl && !k.alt && k.lower === 'v'; } },
        { says: 'already belongs to the browser', test: function (k) { return k.ctrl && !k.alt && (k.lower === 'w' || k.lower === 't' || k.lower === 'n' || k.lower === 'q'); } },
        { says: 'already closes the window', test: function (k) { return k.alt && k.key === 'F4'; } },
        // 05n — canvas, recording, colour
        { says: 'already captures a layer', test: function (k) { return k.key === 'Enter' && k.shift && noCA(k); } },
        { says: 'already sends the canvas to ComfyUI', test: function (k) { return k.key === 'Enter' && k.ctrl && !k.shift && !k.alt; } },
        { says: 'already clears the recording layer', test: function (k) { return k.key === 'Delete' && k0(k); } },
        { says: 'already toggles the cursor', test: function (k) { return k0(k) && k.lower === 'c'; } },
        { says: 'already toggles the border and handles', test: function (k) { return k0(k) && k.lower === 'h'; } },
        { says: 'already locks the borders', test: function (k) { return k0(k) && k.lower === 'l'; } },
        { says: 'already toggles random colors', test: function (k) { return k0(k) && k.lower === 'r'; } },
        { says: 'already toggles palette mode', test: function (k) { return k0(k) && k.lower === 'a'; } },
        { says: 'already starts a quick export', test: function (k) { return k0(k) && k.lower === 'e'; } },
        { says: 'already mutates the settings', test: function (k) { return k0(k) && k.lower === 'm'; } },
        { says: 'already changes the brush size', test: function (k) { return noCA(k) && (k.key === '[' || k.key === ']'); } },
        { says: 'already steps through the palette', test: function (k) { return noCA(k) && k.lower === 'n'; } },
        { says: 'already saves the color', test: function (k) { return noCA(k) && k.shift && k.lower === 's'; } },
        { says: 'already clears the colors', test: function (k) { return noCA(k) && k.shift && k.lower === 'x'; } },
        { says: 'already cycles recording layers', test: function (k) { return k0(k) && (k.key === 'ArrowUp' || k.key === 'ArrowDown'); } },
        { says: 'already changes the palette', test: function (k) { return k.ctrl && (k.key === 'ArrowLeft' || k.key === 'ArrowRight'); } },
        { says: 'already changes the resolution', test: function (k) { return k.alt && !k.ctrl && (k.key === 'ArrowUp' || k.key === 'ArrowDown'); } },
        // 05e — reads e.code, so Ctrl and Alt still reach it; Shift is left free
        { says: 'already sets the multiplier', test: function (k) { return !k.shift && /^(Digit|Numpad)[1-8]$/.test(k.code); } },
        // 21, 35, 44
        { says: 'already toggles focus mode', test: function (k) { return k0(k) && k.lower === 'f'; } },
        { says: 'already toggles zoom mode', test: function (k) { return k0(k) && k.lower === 'z'; } },
        { says: 'already resets the zoom', test: function (k) { return noCA(k) && k.key === '0'; } },
        { says: 'already opens “How do I…”', test: function (k) { return k0(k) && k.key === '/'; } }
    ];

    function facts(e) {
        var key = e.key || '';
        return {
            key: key, lower: key.length === 1 ? key.toLowerCase() : key, code: codeOf(e),
            ctrl: !!(e.ctrlKey || e.metaKey), alt: !!e.altKey, shift: !!e.shiftKey
        };
    }

    // A stored combo has no event; stand one up the way that key would
    // arrive on this layout, Shift included.
    function keyChar(code, shift) {
        if (CODE_KEY[code]) return CODE_KEY[code];
        if (/^F\d{1,2}$/.test(code)) return code;
        var m = /^Numpad(\d)$/.exec(code);
        if (m) return m[1];
        if (shift && US_SHIFTED[code]) return US_SHIFTED[code];
        var ch = layoutChar(code);
        if (!ch) {
            if ((m = /^Key([A-Z])$/.exec(code))) ch = m[1].toLowerCase();
            else if ((m = /^Digit(\d)$/.exec(code))) ch = m[1];
            else ch = US[code] || '';
        }
        return shift ? ch.toUpperCase() : ch;
    }

    function factsFromCombo(combo) {
        var c = parse(combo);
        if (!c) return null;
        var key = keyChar(c.code, c.shift);
        return {
            key: key, lower: key.length === 1 ? key.toLowerCase() : key, code: c.code,
            ctrl: c.ctrl, alt: c.alt, shift: c.shift
        };
    }

    // What the app already does with this press (a KeyboardEvent) or this
    // combo (a string) — the phrase from RESERVED — or null if it is free.
    function reservedBy(x) {
        var k = (typeof x === 'string') ? factsFromCombo(x) : (x ? facts(x) : null);
        if (!k) return null;
        for (var i = 0; i < RESERVED.length; i++) {
            try { if (RESERVED[i].test(k)) return RESERVED[i].says; } catch (_) {}
        }
        return null;
    }

    // ─── BINDINGS ───────────────────────────────────────────────
    // A source returns [{ id, combo, label, run(e), release?(e), clear?(), does? }]:
    //   id       unique across sources ('text:3')
    //   label    what the binding belongs to, as a person would name it
    //   run      fires it, once per press
    //   release  the key came back up. A binding that has one is HELD from
    //            its press until then — the window losing the keyboard ends
    //            a hold too (e is null then), since that keyup never comes
    //   clear    takes the key off it (the picker moves a key this way)
    //   does     what a press does, as a verb ('pours') — for a list of them
    var sources = [];

    function addSource(name, fn) {
        if (typeof fn !== 'function') return;
        for (var i = sources.length - 1; i >= 0; i--) {
            if (sources[i].name === name) sources.splice(i, 1);
        }
        sources.push({ name: String(name), fn: fn });
    }

    function list() {
        var out = [];
        for (var i = 0; i < sources.length; i++) {
            var got = null;
            try { got = sources[i].fn(); } catch (e) {
                console.warn('[Hotkeys] source "' + sources[i].name + '" failed', e);
            }
            if (!Array.isArray(got)) continue;
            for (var j = 0; j < got.length; j++) {
                var b = got[j];
                var combo = b ? normalize(b.combo) : '';
                if (!combo) continue;
                b.combo = combo;
                if (!b.source) b.source = sources[i].name;
                out.push(b);
            }
        }
        return out;
    }

    function find(combo, exceptId) {
        var c = normalize(combo);
        if (!c) return [];
        return list().filter(function (b) { return b.combo === c && (exceptId == null || b.id !== exceptId); });
    }

    function names(bs) {
        var n = bs.map(function (b) { return b.label || b.id; });
        if (n.length > 2) return n.slice(0, 2).join(', ') + ' and ' + (n.length - 2) + ' more';
        return n.join(' and ');
    }

    // ─── CHANGE NOTICES ─────────────────────────────────────────
    // A source calls changed() when its bindings may have moved; a view of
    // them (Settings → Hotkeys) listens with onChange. Coalesced to one call
    // a frame: a drag or a typing burst in the Text panel is dozens of changes.
    var changeFns = [], changePending = false;

    function onChange(fn) { if (typeof fn === 'function') changeFns.push(fn); }

    function changed() {
        if (changePending) return;
        changePending = true;
        requestAnimationFrame(function () {
            changePending = false;
            for (var i = 0; i < changeFns.length; i++) {
                try { changeFns[i](); } catch (e) { console.warn('[Hotkeys] change listener failed', e); }
            }
        });
    }

    // Binding a new key (49's Ctrl+Shift+H) suspends every binding, so a
    // press on the way can't fire one; holds end at once.
    var suspended = false;
    function suspend(on) {
        suspended = !!on;
        if (suspended) releaseAll();
    }

    // ─── DISPATCH ───────────────────────────────────────────────
    // WINDOW, bubble phase: after every document-level handler has had the
    // press, so anything that claimed it (preventDefault) or stopped it (the
    // modal key traps in 43, 44 and appConfirm) is already out of the way.
    // Also where the Pen Input Window's forwarded keys arrive (47).
    var SLIDER_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Home: 1, End: 1, PageUp: 1, PageDown: 1 };

    function isTyping(t) {
        if (window.__isTypingTarget) return window.__isTypingTarget(t);
        var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(t && t.isContentEditable);
    }

    function blocked(e) {
        if (listening || suspended || e.defaultPrevented) return true;
        if (isTyping(e.target)) return true;
        // A focused slider keeps its own keys: range inputs are not typing
        // targets (letters must still fire hotkeys after a fader drag), but
        // arrows, Home and End step them.
        var a = document.activeElement;
        if (a && a.tagName === 'INPUT' && a.type === 'range' && SLIDER_KEYS[e.key]
            && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return true;
        // A dialog is up: its buttons have the keyboard.
        if (document.querySelector('.delete-modal.show')) return true;
        return false;
    }

    // Held bindings, by the PHYSICAL key whose press started them: a hold
    // ends when that key comes up, whatever the modifiers did meanwhile —
    // Shift let go before the 3 of Shift+3 is still the same hold.
    var held = {};

    function releaseHeld(code, e) {
        var hs = held[code];
        if (!hs) return;
        delete held[code];
        for (var i = 0; i < hs.length; i++) {
            try { hs[i].release(e || null); } catch (err) { console.warn('[Hotkeys] release failed', hs[i].id, err); }
        }
    }

    function releaseAll() {
        Object.keys(held).forEach(function (code) { releaseHeld(code); });
    }

    window.addEventListener('keydown', function (e) {
        if (blocked(e)) return;
        var combo = fromEvent(e);
        if (!combo) return;
        var hits = find(combo);
        if (!hits.length) return;
        if (reservedBy(e)) return;          // the app's own key wins
        e.preventDefault();                 // Ctrl+S & co. must not reach the browser
        // A held key strikes once. What holding it DOES is the binding's own
        // business, timed off its press and its release — never the OS key
        // repeat, whose delay and rate are each machine's settings.
        if (e.repeat) return;
        var code = codeOf(e);
        releaseHeld(code, e);               // a hold whose keyup went missing ends here
        var holders = [];
        for (var i = 0; i < hits.length; i++) {
            try { hits[i].run(e); } catch (err) { console.warn('[Hotkeys] binding failed', hits[i].id, err); continue; }
            if (typeof hits[i].release === 'function') holders.push(hits[i]);
        }
        if (holders.length) held[code] = holders;
    });
    // Capture, and registered ahead of the picker's keyup swallow below, so a
    // hold always hears its own key come up.
    window.addEventListener('keyup', function (e) {
        var code = codeOf(e);
        if (code && held[code]) releaseHeld(code, e);
    }, true);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

    // ─── THE PICKER ─────────────────────────────────────────────
    // Click, press the keys, done. While it listens it owns the keyboard —
    // window capture, ahead of every document handler — so Z or F pressed
    // to BIND cannot also zoom or focus the canvas. Lone modifiers pass
    // through untouched: the in-place caps (17) and the Right-Shift tracker
    // (05n) keep counting them.
    //
    //   Esc                         cancel, keep the old key
    //   Backspace / Delete          remove the key
    //   Tab                         cancel and move on
    //   a key the app owns          say what it does, keep listening
    //   a key another binding has   say whose; the same press again moves it here
    //
    // opts: { value, onChange(combo, { previous, moved }),
    //         onCancel(): a listen ended with no key chosen (Esc, Tab, a
    //                click elsewhere, the window losing focus),
    //         selfId (string | fn → string): this binding's own id, so its
    //                current key is not "taken",
    //         noteEl: where messages go (default: under the picker),
    //         clearable: false hides the picker's own × (a list row that
    //                has a delete of its own),
    //         outsideCancels: false keeps it listening through clicks
    //                elsewhere (a guided flow whose other clicks mean
    //                something — 49's bind bar),
    //         listenHint: the line shown when it starts listening (false for
    //                none — a host that already says what to do),
    //         emptyLabel, hint: one line on what the key will do }
    var listening = null;   // the picker session that has the keyboard
    var swallowUps = {};    // keyups owed to presses a picker took

    window.addEventListener('keydown', function (e) {
        if (listening) listening.onKeyDown(e);
    }, true);
    window.addEventListener('keyup', function (e) {
        if (listening && isModifier(e)) listening.onMods(e);
        // A button activates on Space's KEYUP. Every key the picker took on
        // the way down is also taken on the way up, so the press that set
        // the key cannot then click the button it was typed into.
        if (e.code && swallowUps[e.code]) {
            delete swallowUps[e.code];
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
    window.addEventListener('pointerdown', function (e) {
        if (listening && !listening.contains(e.target)) listening.cancel();
    }, true);
    window.addEventListener('blur', function () {
        swallowUps = {};
        if (listening) listening.cancel();
    });

    function picker(opts) {
        opts = opts || {};
        var value = normalize(opts.value || '');
        var on = false;        // listening
        var pending = '';      // a key another binding holds, awaiting its second press
        var noteTimer = null;

        var el = document.createElement('div');
        el.className = 'hk-picker';
        var row = document.createElement('div');
        row.className = 'hk-picker-row';
        var keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = 'hk-picker-key';
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'hk-picker-clear btn--ghost';
        clearBtn.textContent = '×';
        clearBtn.title = 'Remove this hotkey';
        clearBtn.setAttribute('aria-label', 'Remove this hotkey');
        row.appendChild(keyBtn);
        row.appendChild(clearBtn);
        el.appendChild(row);
        var note = opts.noteEl || document.createElement('div');
        note.classList.add('hk-picker-note');
        note.setAttribute('aria-live', 'polite');
        if (!opts.noteEl) el.appendChild(note);

        function selfId() {
            return (typeof opts.selfId === 'function') ? opts.selfId() : opts.selfId;
        }

        // A saved key the app has since claimed (a preset from an older
        // build, a new shortcut) is shown, with the reason it is dead.
        function idleWarning() {
            var says = value ? reservedBy(value) : null;
            return says ? format(value) + ' ' + says + ', so this hotkey will not fire. Pick another.' : '';
        }

        function say(text, tone, ttl) {
            if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
            note.textContent = text || '';
            note.hidden = !text;
            if (tone) note.dataset.tone = tone; else delete note.dataset.tone;
            if (text && ttl) {
                noteTimer = setTimeout(function () { noteTimer = null; sayIdle(); }, ttl);
            }
        }
        function sayIdle() {
            var w = idleWarning();
            say(w, w ? 'warn' : '');
        }

        function paint(mods) {
            el.classList.toggle('is-listening', on);
            el.classList.toggle('is-empty', !value);
            keyBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            if (on) {
                keyBtn.textContent = mods ? mods + '…' : 'Press a key…';
                keyBtn.title = 'Press the key or combo you want. Esc cancels.';
            } else if (value) {
                keyBtn.textContent = format(value);
                keyBtn.title = format(value) + ' — click to change it.' + (opts.hint ? ' ' + opts.hint : '');
            } else {
                keyBtn.textContent = opts.emptyLabel || 'Set key';
                keyBtn.title = (opts.hint ? opts.hint + ' ' : '') + 'Click, then press a key or combo.';
            }
            clearBtn.hidden = on || !value || opts.clearable === false;
        }

        var session = {
            contains: function (t) { return opts.outsideCancels === false || el.contains(t); },
            cancel: function () {
                var was = on;
                stop();
                sayIdle();
                if (was && typeof opts.onCancel === 'function') {
                    try { opts.onCancel(); } catch (err) { console.warn('[Hotkeys] picker onCancel failed', err); }
                }
            },
            onMods: function (e) {
                paint(modsLabel(!!(e.ctrlKey || e.metaKey), !!e.altKey, !!e.shiftKey));
            },
            onKeyDown: onKeyDown
        };

        function listen() {
            if (on) return;
            if (listening && listening !== session) listening.cancel();
            on = true;
            pending = '';
            listening = session;
            paint();
            var hint = (opts.listenHint !== undefined) ? opts.listenHint
                : (value ? 'Esc cancels · Backspace removes the key' : 'Esc cancels');
            say(hint || '', '');
        }

        function stop() {
            if (!on) return;
            on = false;
            pending = '';
            if (listening === session) listening = null;
            paint();
        }

        function onKeyDown(e) {
            // Taken out of the page mid-listen: let go, and let this press
            // through to whatever it was meant for.
            if (!el.isConnected) { session.cancel(); return; }
            if (isModifier(e)) { session.onMods(e); return; }
            if (e.key === 'Tab') { session.cancel(); return; }
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.code) swallowUps[e.code] = true;
            if (e.repeat) return;
            var bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
            if (e.key === 'Escape') { session.cancel(); return; }
            if (bare && (e.key === 'Backspace' || e.key === 'Delete')) { commit('', []); return; }
            var combo = fromEvent(e);
            if (!combo) return;
            var says = reservedBy(e);
            if (says) {
                pending = '';
                paint();
                say(format(combo) + ' ' + says + ' — try another key.', 'warn');
                return;
            }
            if (combo === value) { stop(); sayIdle(); return; }
            var others = find(combo, selfId());
            if (others.length && pending !== combo) {
                pending = combo;
                paint();
                say(format(combo) + ' is on ' + names(others) + ' — press it again to move it here.', 'warn');
                return;
            }
            commit(combo, others);
        }

        // Self first, then the bindings it came from: the owner sees the new
        // key land before the old holders let go, so nothing reading the
        // bindings between the two sees this one keyless.
        function commit(combo, moved) {
            var previous = value;
            stop();
            value = combo;
            paint();
            if (combo !== previous && typeof opts.onChange === 'function') {
                try { opts.onChange(combo, { previous: previous, moved: moved }); }
                catch (err) { console.warn('[Hotkeys] picker onChange failed', err); }
            }
            moved.forEach(function (b) {
                try { if (typeof b.clear === 'function') b.clear(); }
                catch (err) { console.warn('[Hotkeys] could not take the key off', b.id, err); }
            });
            if (moved.length) say('Moved from ' + names(moved) + '.', '', 4000);
            else if (!combo && previous) say('Hotkey removed.', '', 2500);
            else sayIdle();
        }

        keyBtn.addEventListener('click', function () {
            if (on) session.cancel(); else listen();
        });
        clearBtn.addEventListener('click', function () { commit('', []); });

        paint();
        sayIdle();

        return {
            el: el,
            getValue: function () { return value; },
            // Show a key set from outside (another line selected, a preset
            // loaded). Drops any listen in progress and any old message.
            setValue: function (v) {
                stop();
                value = normalize(v || '');
                paint();
                sayIdle();
            },
            listen: listen,
            cancel: function () { session.cancel(); },
            isListening: function () { return on; },
            destroy: function () {
                stop();
                if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
                if (el.parentNode) el.parentNode.removeChild(el);
            }
        };
    }

    window.Hotkeys = {
        fromEvent: fromEvent,
        normalize: normalize,
        format: format,
        reservedBy: reservedBy,
        addSource: addSource,
        list: list,
        find: find,
        picker: picker,
        isListening: function () { return !!listening; },
        releaseAll: releaseAll,
        onChange: onChange,
        changed: changed,
        suspend: suspend
    };
})();
