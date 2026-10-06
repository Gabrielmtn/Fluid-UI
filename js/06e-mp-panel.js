// ================================================================
// 06e-mp-panel.js — Swirl Together client: the room panel + init.
// Remote cursors, connection status, who changed what (the activity line
// and the glow on the control they moved), the connected / disconnected
// views, the invite display (Code / QR / Hide), copy, the control
// listeners, the window.* exposes other modules call, and the init that
// runs last.
//
// The multiplayer client was one 3,600-line file until 2026-09-11. It is now
// five classic scripts, loaded in this order by index.html's async chain.
// They share the global lexical scope: a function or top-level variable
// declared in an earlier file is visible to every later one, and every
// cross-file call happens at runtime (a socket message, a click, a frame),
// so only the load order matters — nothing here runs at load time except
// the init at the tail of 06e.
//   06a-mp-core.js        transport, lifecycle, lobby, message dispatch
//   06b-mp-look.js        the room's shared settings
//   06c-mp-glide.js       incoming slider glide
//   06d-mp-paint-wire.js  dabs, cursors, brush shapes, colliders, replay strokes
//   06e-mp-panel.js       the room panel, remote cursors, init (runs last)
// ================================================================

function handleRemoteCursor(data) {
    const { x, y } = data.data;
    if (window.__roomTrace) window.__roomTrace.note('recv', 'cursor', data.clientId, [[x, y]]);   // 61 room report
    remoteCursors.set(data.clientId, { x, y, timestamp: data.timestamp });
    updateRemoteCursors();
}

function handleRemotePointerUp(data) {
    console.log('[Multiplayer] Received pointer-up from client:', data.clientId);
    const cursor = remoteCursors.get(data.clientId);
    if (cursor) {
        cursor.pointerDown = false;
    }
    remoteLastPositions.delete(data.clientId);
}

// Stable per-user identity derived from the clientId (no coordination needed)
function hashId(id) {
    var h = 0, s = String(id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}
function colorForClient(id) {
    return 'hsl(' + (hashId(id) % 360) + ', 80%, 62%)';
}
function shortName(id) {
    var s = String(id).replace(/[^a-zA-Z0-9]/g, '');
    return 'Artist-' + (s.slice(-2).toUpperCase() || '??');
}

// Update remote cursor display
function updateRemoteCursors() {
    // Remove old cursors (older than 5 seconds)
    const now = Date.now();
    for (const [id, cursor] of remoteCursors.entries()) {
        if (now - cursor.timestamp > 5000) {
            remoteCursors.delete(id);
            // A peer that vanished mid-drag never sends pointer-up, so their
            // last-position entry would otherwise outlive them forever.
            remoteLastPositions.delete(id);
        }
    }

    // Clear existing remote cursors
    clearRemoteCursors();

    // Create cursor elements for each remote client (distinct per-user color + label)
    for (const [id, cursor] of remoteCursors.entries()) {
        const col = colorForClient(id);
        let cursorEl = document.getElementById(`remote-cursor-${id}`);
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = `remote-cursor-${id}`;
            cursorEl.className = 'remote-cursor';
            cursorEl.style.cssText = 'position:absolute;width:12px;height:12px;border-radius:50%;' +
                // 1002: over the text layer (1001, 23-text-overlays), so words
                // on the canvas never hide where a painter is.
                'border:2px solid rgba(255,255,255,0.85);pointer-events:none;z-index:1002;' +
                'transform:translate(-50%,-50%);transition:left 0.05s, top 0.05s;';
            cursorEl.style.backgroundColor = col;
            cursorEl.style.boxShadow = '0 0 8px ' + col;
            const label = document.createElement('span');
            label.className = 'remote-cursor-label';
            // A phone brush paints here without a canvas of its own: mark
            // it, so whoever holds the phone can find themselves.
            label.textContent = (window.PhonePads && window.PhonePads.isPad(id) ? '📱 ' : '') + shortName(id);
            label.style.color = col;
            cursorEl.appendChild(label);
            canvasWrapper.appendChild(cursorEl);
        }

        // Update position (x and y are normalized 0-1)
        cursorEl.style.left = `${cursor.x * 100}%`;
        cursorEl.style.top = `${cursor.y * 100}%`;
    }
}

// Clear all remote cursors
function clearRemoteCursors() {
    const cursors = document.querySelectorAll('.remote-cursor');
    cursors.forEach(cursor => cursor.remove());
}

// ── The status line ─────────────────────────────────────────────────
// One line says everything about the room, and it is built here and nowhere
// else:   {Activity} · {people}[ · locked]
// The activity is the most important thing that is true right now: getting
// connected beats everything, then a stranger search, then sharing. People
// is "just you" or "N here" (left off until the room has answered); locked
// says nobody new can come in. The dot is green once someone else is here
// and amber until then. The room code is never printed: it is an invitation
// (see renderShareMode), and this line is on screen in every share mode.
function roomSocketOpen() {
    return isMultiplayerEnabled && !!partySocket && partySocket.readyState === WebSocket.OPEN;
}

function roomActivity() {
    if (!currentRoom) return 'Finding a stranger…';   // the lobby has not given us a room yet
    if (!roomSocketOpen()) return 'Connecting…';      // first connect and every reconnect
    var stranger = isStrangerRoom();
    if (stranger && connectedClients < 2) return 'Waiting for a stranger…';
    if (connectedClients >= 2) return 'Sharing settings';
    return 'Waiting for friends';
}

// The parts after the activity, with the sentence each one stands for (the
// line's tooltip), so a word like "locked" is never left unexplained.
function roomStatusParts() {
    var parts = [], tips = [];
    var open = !!currentRoom && roomSocketOpen();
    if (open) {
        tips.push('Everyone here shares one set of settings: what anyone changes, changes for everyone. Each person keeps their own brush.');
        parts.push(connectedClients >= 2 ? connectedClients + ' here' : 'just you');
        if (!isStrangerRoom() && roomLocked) {
            parts.push('locked');
            tips.push('Locked: nobody new can join, even with the code.');
        }
    }
    return { parts: parts, tip: tips.join('\n'), open: open, together: open && connectedClients >= 2 };
}

function renderRoomStatus() {
    var el = document.getElementById('multiplayerStatus');
    var dot = document.getElementById('connectionDot');
    var p = roomStatusParts();
    var text = [roomActivity()].concat(p.parts).join(' · ');
    if (el) {
        if (el.textContent !== text) el.textContent = text;
        el.title = p.tip;
    }
    // Amber pulses while there is no room yet, and holds steady once we
    // are in one with nobody else.
    if (dot) dot.className = 'mp-dot ' + (p.together ? 'mp-dot-connected' : p.open ? 'mp-dot-alone' : 'mp-dot-connecting');
    renderActivity();
}

// ── Who changed what ────────────────────────────────────────────────
// The room's settings move under your hands when someone else changes
// them, so the panel says who and what, in their cursor's colour, and the
// control they moved glows in that colour while it glides. Between changes
// the line says what the room is for.
var ACTIVITY_HOLD_MS = 5000;
var _activity = null;          // { who, names, until }
var _activityTimer = null;
var ROOM_SECTION_NAMES = {
    colors: 'Background', paletteIndex: 'Palette', paletteName: 'Palette', savedColors: 'Palette',
    lightPos: 'Light', lightShiftPath: 'Light Shift path', gravity: 'Gravity',
    resolution: 'Resolution', material: 'Material', ssOrigin: 'Shooting Star'
};

function controlName(id) {
    var el = document.getElementById(id);
    if (!el) return id;
    // A strip channel whose label is a menu (Curl's is the material picker,
    // reading "Swirl - Vorticity") is called what the menu shows.
    var ch = el.closest('.mixer-channel');
    var pick = ch && ch.querySelector('select');
    if (pick && pick.selectedOptions && pick.selectedOptions[0]) {
        var shown = pick.selectedOptions[0].textContent.trim();
        if (shown) return shown;
    }
    try {
        if (window.HotkeyBinds && typeof window.HotkeyBinds.nameOf === 'function') {
            var n = window.HotkeyBinds.nameOf(el);
            if (n) return n;
        }
    } catch (_) {}
    var lab = document.querySelector('label[for="' + id + '"]');
    if (lab) {
        var t = '';
        lab.childNodes.forEach(function (c) { if (c.nodeType === 3) t += c.textContent; });
        t = t.replace(/\s+/g, ' ').trim();
        if (t) return t;
    }
    return id;
}

// Where a control shows: its strip channel or its sidebar row.
function controlFace(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    return el.closest('.mixer-channel') || el.closest('.control-group') || el.closest('.checkbox-group') || el;
}

var _touchTimers = new Map();
function flashControl(id, col) {
    var face = controlFace(id);
    if (!face) return;
    face.style.setProperty('--mp-peer', col);
    face.classList.add('mp-peer-touch');
    // A drag keeps it lit: each update pushes the fade out.
    clearTimeout(_touchTimers.get(face));
    _touchTimers.set(face, setTimeout(function () {
        face.classList.remove('mp-peer-touch');
        _touchTimers.delete(face);
    }, 1400));
}

function onRoomLookChanged(change, fromId, welcome) {
    var names = [];
    var add = function (n) { if (n && names.indexOf(n) === -1) names.push(n); };
    var col = colorForClient(fromId);
    ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
        Object.keys(change[sec] || {}).forEach(function (id) { add(controlName(id)); flashControl(id, col); });
    });
    Object.keys(change).forEach(function (k) { if (ROOM_SECTION_NAMES[k]) add(ROOM_SECTION_NAMES[k]); });
    if (!names.length && !welcome) return;
    if (welcome) {
        // Arriving: the room's settings replaced ours in one go. Naming a
        // dozen controls would say less than whose settings these are.
        _activity = { who: fromId, names: [], welcome: true };
    } else if (_activity && !_activity.welcome && _activity.who === fromId && Date.now() < _activity.until) {
        // A drag is many messages: the same person moving things keeps one
        // line, newest first, rather than resetting it.
        _activity.names = names.concat(_activity.names.filter(function (n) { return names.indexOf(n) === -1; }));
    } else {
        _activity = { who: fromId, names: names };
    }
    _activity.until = Date.now() + ACTIVITY_HOLD_MS;
    clearTimeout(_activityTimer);
    _activityTimer = setTimeout(function () { _activity = null; renderActivity(); }, ACTIVITY_HOLD_MS + 50);
    renderActivity();
}

function renderActivity() {
    var el = document.getElementById('mpActivity');
    if (!el) return;
    var together = !!currentRoom && roomSocketOpen() && connectedClients >= 2;
    el.style.display = together ? '' : 'none';
    if (!together) return;
    var a = (_activity && Date.now() < _activity.until) ? _activity : null;
    var key = a ? a.who + '|' + (a.welcome ? '*' : a.names.join('|')) : '';
    if (el.dataset.key === key && el.childNodes.length) return;
    el.dataset.key = key;
    el.textContent = '';
    el.classList.toggle('live', !!a);
    if (!a) {
        el.textContent = 'Change any setting and it changes for everyone here.';
        return;
    }
    var who = document.createElement('span');
    who.className = 'mp-activity-who';
    who.style.color = colorForClient(a.who);
    who.textContent = shortName(a.who);
    if (a.welcome) {
        el.appendChild(document.createTextNode('Now on '));
        el.appendChild(who);
        el.appendChild(document.createTextNode('’s settings'));
        el.title = 'You joined, so your settings switched to the room’s: ' + shortName(a.who) + ' is the host.';
        return;
    }
    // The newest first; the rest are counted, since the sidebar has room
    // for one name (the tooltip has them all).
    var more = a.names.length - 1;
    var what = a.names[0] + (more > 0 ? ' and ' + more + ' more' : '');
    el.appendChild(who);
    el.appendChild(document.createTextNode(' changed ' + what));
    el.title = shortName(a.who) + ' changed ' + a.names.join(', ');
}

// Brief, non-blocking word about something someone else did to your work
// (06d: a wall or a line of yours edited) or a phone arriving (54, 55).
function showRoomToast(text) {
    var el = document.getElementById('mpRoomToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mpRoomToast';
        el.className = 'mp-room-toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    if (showRoomToast._t) clearTimeout(showRoomToast._t);
    showRoomToast._t = setTimeout(function () { el.style.opacity = '0'; }, 2600);
}

// 06a still calls this with its own words ("Reconnecting (2)..."). The line
// is built from state now, so a reconnect reads "Connecting…" like any other
// connect, and nothing outside this file writes the line directly.
function updateMultiplayerStatus() {
    renderRoomStatus();
}

// ─── UI helpers ───
function setShown(id, shown) {
    var el = document.getElementById(id);
    if (el) el.style.display = shown ? '' : 'none';
}

// Shown while the lobby is pairing us with a stranger (before we have a room).
// The invite has nothing to share yet and ⋯ has no room to act on, but the
// phone door in the popover stays reachable (54).
function showMatchmaking() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    ['roomDisplay', 'shareHint', 'copyRoomRow', 'lockRoomBtn', 'mpMenuBtn'].forEach(function(id) { setShown(id, false); });
    if (_openPop === 'menu') closeRoomPop();
    syncInviteBtn();
    renderRoomStatus();
}

function showConnecting() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    setShown('mpMenuBtn', !isStrangerRoom());
    setShown('roomDisplay', !isStrangerRoom());
    if (!isStrangerRoom()) renderShareMode();
    syncInviteBtn();
    renderRoomStatus();
}

// Invite ▾ in a private room. A stranger pairing has nobody to invite (and
// while the lobby looks there is no room at all), so there the button is
// the phone door, and the popover holds just that row (54).
function syncInviteBtn() {
    var b = document.getElementById('mpInviteBtn');
    if (!b) return;
    var phoneOnly = !currentRoom || isStrangerRoom();
    var label = phoneOnly ? '📱 Phone' : 'Invite ▾';
    if (b.textContent !== label) b.textContent = label;
    b.setAttribute('aria-label', phoneOnly ? 'Paint from your phone' : 'Invite');
    b.title = phoneOnly
        ? 'Paint from your phone: it becomes this canvas’s mouse'
        : 'The code, a QR or a link to send, and your phone';
}

function showConnectedUI() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    updateConnectedView();
}

// Single source of truth for the connected panel: adapts to room kind (stranger
// vs private), participant count, host role, and lock state.
function updateConnectedView() {
    var stranger = isStrangerRoom();
    var isHost = myRole === 'host';

    if (stranger) {
        // Waiting alone is NOT the same as swirling together (the status
        // line says which). It only ever reads "alone" before anyone arrives
        // now — a partner LEAVING ends the room outright (strangerPartnerLeft).
        var alone = connectedClients < 2;
        if (alone) {
            if (strangerWasPaired) {
                // They left, so the pairing is over (see strangerPartnerLeft).
                // Return: the rest of this pass would be dressing a room we
                // are no longer in.
                strangerPartnerLeft();
                return;
            }
            // Nobody has arrived yet — that is not a departure. Hold our
            // matchmaking slot while we wait, and drop it (with the lobby pin
            // socket that holds it open) the moment someone pairs with us.
            if (!strangerKeepAlive) startStrangerKeepAlive();
        } else {
            strangerWasPaired = true;
            stopStrangerKeepAlive();
            closeMatchmaking();
        }
    } else {
        stopStrangerKeepAlive();
    }

    // Room code / share / copy: private rooms only (you can't invite to a 1:1 pairing).
    setShown('roomDisplay', !stranger);
    setShown('shareHint', !stranger);
    setShown('copyRoomRow', !stranger);
    // Through renderShareMode, never straight to textContent: a direct write
    // would unmask a room the user deliberately hid.
    if (!stranger) renderShareMode();

    syncInviteBtn();

    // The ⋯ menu. Its switches keep one label and carry a tick when on
    // (aria-checked), so an item says what it does, not what it would undo.
    // Nothing in it applies while a stranger pairing waits for its other
    // half, so the button waits too.
    setShown('mpMenuBtn', !(stranger && connectedClients < 2));
    // Lock room: only the host of a private room sees it.
    var lockBtn = document.getElementById('lockRoomBtn');
    if (lockBtn) {
        var canLock = !stranger && isHost;
        lockBtn.style.display = canLock ? '' : 'none';
        lockBtn.setAttribute('aria-checked', String(!!roomLocked));
    }

    renderRoomStatus();
    // Host changes, counts and room kind decide the phone door and who
    // answers phones (js/54-phone-pads.js).
    if (window.PhonePads) window.PhonePads.onRoom();
}

function showDisconnectedUI() {
    closeRoomPop();
    var dc = document.getElementById('mpDisconnected');
    var cn = document.getElementById('mpConnected');
    if (dc) dc.style.display = '';
    if (cn) cn.style.display = 'none';
    var toggle = document.getElementById('multiplayerToggle');
    if (toggle) toggle.checked = false;
    // Reconnect button only appears after a give-up (giveUpConnection re-shows it)
    var rc = document.getElementById('reconnectBtn');
    if (rc) rc.style.display = 'none';
    if (window.PhonePads) window.PhonePads.onRoom();
}

// `notice` marks an outcome that is not a failure (a stranger leaving) so it
// does not arrive dressed as one — same slot, neutral colour.
function showMpError(msg, notice) {
    var el = document.getElementById('mpError');
    if (el) {
        el.textContent = msg;
        el.classList.toggle('mp-notice', !!notice);
        el.style.display = '';
    }
}
function hideMpError() {
    var el = document.getElementById('mpError');
    if (el) el.style.display = 'none';
}

// ── Sharing a room: code, QR, or hidden ────────────────────
// A room code on screen is a live invitation to anyone who can read it. That
// is exactly what you want at a table and exactly what you do not want on a
// stream, so how a room is shared is a choice, not a constant:
//
//   code    the six characters, to read out or type
//   qr      a scannable link, for a phone in the same room
//   hidden  nothing on screen — Copy still works, so the code can go into a
//           DM without ever being visible to a viewer
//
// The choice persists: someone who streams sets it once and should not have
// to remember again next session. Written straight to localStorage rather
// than through the settings snapshot, because a privacy choice has to survive
// a settings clear and must not wait for a Save.
var SHARE_MODE_KEY = 'swirlShareMode';
var shareMode = (function () {
    try {
        var v = localStorage.getItem(SHARE_MODE_KEY);
        return (v === 'qr' || v === 'hidden') ? v : 'code';
    } catch (_) { return 'code'; }
})();

// The link a scanned QR opens. On the web that is this origin; the desktop
// build runs from file://, which no phone can follow, so it falls back to the
// deployed host the relay already lives on.
function roomJoinUrl() {
    if (!currentRoom) return '';
    var base = (location.protocol === 'http:' || location.protocol === 'https:')
        ? location.origin + location.pathname.replace(/[^/]*$/, '')
        : 'https://' + PARTYKIT_HOST + '/';
    return base + '#' + currentRoom;
}

function setShareMode(mode) {
    shareMode = mode;
    try { localStorage.setItem(SHARE_MODE_KEY, mode); } catch (_) {}
    renderShareMode();
}

// A one-line cue that outlives the next renderShareMode (the connection
// itself re-renders the block a moment after createRoom copied the link).
var hintOverride = null;   // { text, until }
function renderShareMode() {
    var codeEl = document.getElementById('roomName');
    if (!codeEl) return;
    var qrEl = document.getElementById('roomQr');
    var hintEl = document.getElementById('shareHint');

    var ids = { code: 'shareModeCode', qr: 'shareModeQr', hidden: 'shareModeHidden' };
    Object.keys(ids).forEach(function (k) {
        var b = document.getElementById(ids[k]);
        if (b) b.setAttribute('aria-pressed', String(k === shareMode));
    });

    // QR falls back to the code rather than to an empty white box if the
    // encoder failed to load or the link outgrew the symbol.
    var qrOk = false;
    if (shareMode === 'qr' && qrEl && window.QRCode && currentRoom) {
        var svg = window.QRCode.svg(roomJoinUrl(), { margin: 3 });
        if (svg) { qrEl.innerHTML = svg; qrOk = true; }
    }
    var mode = (shareMode === 'qr' && !qrOk) ? 'code' : shareMode;

    codeEl.textContent = mode === 'hidden' ? '●●●●●●' : (currentRoom || '------');
    codeEl.classList.toggle('mp-code-hidden', mode === 'hidden');
    codeEl.style.display = mode === 'qr' ? 'none' : '';
    if (qrEl) {
        qrEl.style.display = mode === 'qr' ? '' : 'none';
        // Emptied, not just hidden. Hide mode exists so the code is not on
        // screen; leaving a rendered symbol behind display:none would put it
        // one stray style override away from being visible again.
        if (mode !== 'qr') qrEl.innerHTML = '';
    }

    if (hintEl) {
        hintEl.textContent =
            (hintOverride && Date.now() < hintOverride.until) ? hintOverride.text :
            mode === 'qr'     ? 'Point a phone camera at this to join.' :
            mode === 'hidden' ? 'Hidden, so it is safe to show on a stream. Copy still works.' :
                                'Send a friend the link, or read them the code.';
    }
}

// Copy the invite. Two buttons, independent of how the code is DISPLAYED
// (Code / QR / Hide only decide what is drawn): #copyRoomBtn copies the
// full join link — what goes into a chat, and the join box accepts a
// pasted link too (extractRoomCode) — and #copyRoomCodeBtn the bare
// six-character code for reading out or typing. Both work in Hide: the
// clipboard is not the screen, which is the point of Hide. Until 2026-09-12
// one button followed the display mode and copied the link only in QR, so a
// host showing the code had no one-click link to send.
function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
}
function copyRoomCode(fromCreate, what) {
    if (!currentRoom) return;
    var asLink = what !== 'code';
    var text = asLink ? roomJoinUrl() : currentRoom;
    var btnId = asLink ? 'copyRoomBtn' : 'copyRoomCodeBtn';
    var idle = asLink ? 'Copy link' : 'Copy code';
    var flash = function () {
        var btn = document.getElementById(btnId);
        if (btn) {
            btn.textContent = 'Copied';
            setTimeout(function () { btn.textContent = idle; }, 2000);
        }
        // Creating a room copies the link unasked; the hint says so, since a
        // button half the panel wide cannot. renderShareMode puts the mode's
        // own hint back.
        if (fromCreate) {
            hintOverride = { text: 'Link copied. Send it to a friend.', until: Date.now() + 3000 };
            renderShareMode();
            setTimeout(function () { hintOverride = null; renderShareMode(); }, 3100);
        }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flash).catch(function () { fallbackCopy(text); flash(); });
    } else {
        fallbackCopy(text); flash();
    }
}

// ── The Invite popover and the ⋯ menu ───────────────────────────────
// Two body-mounted popovers in the .brush-shape-menu skin (20 openShapeMenu):
// clear of the sidebar's overflow and stacking, closed by a press outside,
// Esc or a resize, and kept beside their button when the sidebar scrolls.
// Unlike the shape menu they are never rebuilt: the invite holds ids
// other code reads at any time (renderShareMode, copy flashes, 44's tours,
// the copy sink, 54's phone row), so each is one element, moved onto <body>
// once and then only shown and hidden. They borrow the room panel's section
// group, so their buttons take the panel's tint (01-buttons rule 2).
var ROOM_POPS = {
    invite: { pop: 'mpInvitePop', btn: 'mpInviteBtn', align: 'left' },
    menu:   { pop: 'mpRoomMenu', btn: 'mpMenuBtn', align: 'right' }
};
var _openPop = null;

function mountRoomPops() {
    Object.keys(ROOM_POPS).forEach(function (k) {
        var p = document.getElementById(ROOM_POPS[k].pop);
        if (p && p.parentElement !== document.body) document.body.appendChild(p);
    });
}

function placeRoomPop(pop, btn, align) {
    var group = btn.closest('[data-group]');
    pop.setAttribute('data-group', group ? group.getAttribute('data-group') : 'core');
    pop.style.left = '0px';
    pop.style.top = '0px';
    var b = btn.getBoundingClientRect(), r = pop.getBoundingClientRect();
    // Under the button, lined up with the edge it sits on (Invite's left,
    // ⋯'s right); flipped above when there is no room below, and kept
    // inside the window either way.
    var x = Math.min(align === 'right' ? b.right - r.width : b.left, window.innerWidth - r.width - 8);
    var y = b.bottom + 6;
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, b.top - r.height - 6);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = Math.max(8, y) + 'px';
}

function openRoomPop(which) {
    var cfg = ROOM_POPS[which];
    var pop = cfg && document.getElementById(cfg.pop);
    var btn = cfg && document.getElementById(cfg.btn);
    if (!pop || !btn) return false;
    if (_openPop && _openPop !== which) closeRoomPop();
    mountRoomPops();
    pop.hidden = false;
    placeRoomPop(pop, btn, cfg.align);
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('active');
    if (_openPop !== which) {
        _openPop = which;
        // Added straight away: the press that opened it is over by the time
        // its click runs, so it cannot close it, and an Esc pressed the
        // moment it appears has to land.
        document.addEventListener('mousedown', onRoomPopOutside, true);
        document.addEventListener('keydown', onRoomPopKey, true);
        document.addEventListener('scroll', onRoomPopScroll, true);
        window.addEventListener('resize', closeRoomPop);
    }
    return true;
}

function closeRoomPop() {
    if (!_openPop) return;
    var cfg = ROOM_POPS[_openPop];
    _openPop = null;
    var pop = document.getElementById(cfg.pop), btn = document.getElementById(cfg.btn);
    if (pop) pop.hidden = true;
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('active'); }
    document.removeEventListener('mousedown', onRoomPopOutside, true);
    document.removeEventListener('keydown', onRoomPopKey, true);
    document.removeEventListener('scroll', onRoomPopScroll, true);
    window.removeEventListener('resize', closeRoomPop);
}

function toggleRoomPop(which) {
    if (_openPop === which) closeRoomPop(); else openRoomPop(which);
}

function openRoomPopEl() {
    return _openPop ? document.getElementById(ROOM_POPS[_openPop].pop) : null;
}
function onRoomPopOutside(e) {
    var pop = openRoomPopEl();
    var btn = _openPop && document.getElementById(ROOM_POPS[_openPop].btn);
    // A press on the popover's own button is the toggle's to handle:
    // closing here would let the click that follows open it again.
    if (pop && !pop.contains(e.target) && !(btn && btn.contains(e.target))) closeRoomPop();
}
function onRoomPopKey(e) {
    if (e.key !== 'Escape') return;
    var btn = _openPop && document.getElementById(ROOM_POPS[_openPop].btn);
    closeRoomPop();
    if (btn) { try { btn.focus(); } catch (_) {} }
}
// The sidebar scrolling (a wheel, a guide step bringing the panel into
// view) carries the button away: the popover follows it while the button is
// on screen and closes once it is not.
function onRoomPopScroll(e) {
    var pop = openRoomPopEl();
    if (!pop || (e.target instanceof Node && pop.contains(e.target))) return;
    var cfg = ROOM_POPS[_openPop], btn = document.getElementById(cfg.btn);
    var b = btn ? btn.getBoundingClientRect() : null;
    if (!b || !b.width || b.bottom < 0 || b.top > window.innerHeight) { closeRoomPop(); return; }
    placeRoomPop(pop, btn, cfg.align);
}

// What happens to a popover when something inside it is picked: ⋯ items
// close it (the status line shows the result), except one marked data-stay
// that reports back on itself (Copy room report's "Copied"). In the invite,
// a control marked data-pop-close (the phone row, which opens a dialog of
// its own) closes it; Code / QR / Hide and the two copies keep it open.
function wireRoomPops() {
    var menu = document.getElementById('mpRoomMenu');
    if (menu) menu.addEventListener('click', function (e) {
        var item = e.target.closest ? e.target.closest('button') : null;
        if (item && !item.hasAttribute('data-stay')) closeRoomPop();
    });
    var inv = document.getElementById('mpInvitePop');
    if (inv) inv.addEventListener('click', function (e) {
        var item = e.target.closest ? e.target.closest('[data-pop-close]') : null;
        if (item) closeRoomPop();
    });
    [['mpInviteBtn', 'invite'], ['mpMenuBtn', 'menu']].forEach(function (pair) {
        var b = document.getElementById(pair[0]);
        if (b) b.addEventListener('click', function () { toggleRoomPop(pair[1]); });
    });
}

// Initialize multiplayer UI + auto-join from hash
function initMultiplayerUI() {
    installGlideRelease(); // 06c: a hand on a gliding slider lets go of the glide
    mountRoomPops();
    wireRoomPops();
    // Wire up buttons
    var createBtn = document.getElementById('createRoomBtn');
    if (createBtn) createBtn.addEventListener('click', createRoom);

    var joinBtn = document.getElementById('joinRoomBtn');
    var joinInput = document.getElementById('joinRoomInput');
    if (joinBtn) joinBtn.addEventListener('click', function() { joinRoom(joinInput ? joinInput.value : ''); });
    if (joinInput) {
        // Type or paste a # (or a link/hash) → clean it and auto-join the moment
        // it's a full 6-char code. No separate Join click needed.
        joinInput.addEventListener('input', function() {
            var room = extractRoomCode(joinInput.value);
            if (joinInput.value !== room) joinInput.value = room;
            if (room.length === 6 && room !== currentRoom) joinRoom(room);
        });
        joinInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') joinRoom(joinInput.value); });
        joinInput.addEventListener('focus', function() { joinInput.select(); });
    }

    var copyBtn = document.getElementById('copyRoomBtn');
    if (copyBtn) copyBtn.addEventListener('click', function() { copyRoomCode(false); });
    var copyCodeBtn = document.getElementById('copyRoomCodeBtn');
    if (copyCodeBtn) copyCodeBtn.addEventListener('click', function() { copyRoomCode(false, 'code'); });

    // Code / QR / Hide. Re-rendered rather than toggled so the QR is only
    // ever built when it is about to be looked at.
    [['shareModeCode', 'code'], ['shareModeQr', 'qr'], ['shareModeHidden', 'hidden']].forEach(function (pair) {
        var b = document.getElementById(pair[0]);
        if (b) b.addEventListener('click', function () { setShareMode(pair[1]); });
    });
    renderShareMode();

    var reconnectBtn = document.getElementById('reconnectBtn');
    if (reconnectBtn) reconnectBtn.addEventListener('click', function() {
        if (!lastRoom) return;
        reconnectBtn.style.display = 'none';
        hideMpError();
        connectToRoom(lastRoom);
    });

    var discBtn = document.getElementById('disconnectBtn');
    // Wrapped: registering the function directly would pass the MouseEvent
    // as the rememberRoom param — a deliberate Disconnect is a clean exit
    // and must NOT offer Reconnect or overwrite lastRoom.
    if (discBtn) discBtn.addEventListener('click', function () { disconnectMultiplayer(); });

    var strangerBtn = document.getElementById('strangerBtn');
    if (strangerBtn) strangerBtn.addEventListener('click', swirlWithStranger);

    var lockBtn = document.getElementById('lockRoomBtn');
    if (lockBtn) lockBtn.addEventListener('click', toggleLock);

    // Who changed what (06b calls this after every change from the room).
    window.__mpRoomLookChanged = onRoomLookChanged;

    // Auto-join if URL has room hash
    var hashRoom = getRoomFromHash();
    if (hashRoom && hashRoom !== 'DEFAULT-ROOM') {
        connectToRoom(hashRoom);
    }
}

// Expose globals
window.isProcessingRemoteEvent = function() { return isProcessingRemoteEvent; };
window.broadcastSplat = broadcastSplat;
window.queueDab = queueDab;       // 1.3: faithful dab-train broadcast (05j drain)
window.flushDabs = flushDabs;
window.broadcastCursor = broadcastCursor;
window.broadcastPointerUp = broadcastPointerUp;
window.broadcastClear = broadcastClear;
window.broadcastReplayStroke = broadcastReplayStroke;
// 33-brush-shapes calls this when a shape is picked or re-stamped, so peers
// decode the bitmap before the first dab that references it.
window.publishBrushShape = publishShape;
// 23-depth-collision calls these when a wall is built, changed, or deleted.
window.publishCollider = publishCollider;
window.broadcastColliderRemove = broadcastColliderRemove;
// 23-text-overlays calls these: our lines changed (or the layout under them),
// and one pour of a line landed on our dye. Both no-ops outside a room.
window.__mpTextChanged = scheduleTextLines;
window.__mpTextPour = queueTextPour;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.swirlWithStranger = swirlWithStranger;
window.toggleLock = toggleLock;
window.copyRoomCode = copyRoomCode;
window.disconnectMultiplayer = disconnectMultiplayer;
window.showRoomToast = showRoomToast;
// The panel's popovers, for 44's tours.
window.MPPanel = {
    open: openRoomPop,
    close: closeRoomPop,
    isOpen: function (which) { return which ? _openPop === which : !!_openPop; }
};

console.log('Multiplayer module loaded. PartyKit host:', PARTYKIT_HOST);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
} else {
    initMultiplayerUI();
}
