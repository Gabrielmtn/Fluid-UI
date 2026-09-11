// ================================================================
// 06c-mp-turns.js — Swirl Together client: take turns / call and return.
// Rotation state and the two paint/settings gates, the countdown, the chip,
// the queue in the panel, the two rhythm buttons and the length slider,
// stranger-pair invites, and the call-and-return auto-pass.
//
// The multiplayer client was one 3,600-line file until 2026-09-11. It is now
// five classic scripts, loaded in this order by index.html's async chain.
// They share the global lexical scope: a function or top-level variable
// declared in an earlier file is visible to every later one, and every
// cross-file call happens at runtime (a socket message, a click, a frame),
// so only the load order matters — nothing here runs at load time except
// the init at the tail of 06e.
//   06a-mp-core.js        transport, lifecycle, lobby, message dispatch
//   06b-mp-look.js        settings lock + look snapshots and mirroring
//   06c-mp-turns.js       take turns / call and return
//   06d-mp-paint-wire.js  dabs, cursors, brush shapes, colliders, replay strokes
//   06e-mp-panel.js       the room panel, remote cursors, init (runs last)
// ================================================================

// ── Take-turns mode ─────────────────────────────────────────────────
// No points, no timer — the brush just passes around the room. While it's not
// your turn, painting/clear are gated (05d/04f read __mpTurnBlocked), your look
// settings are driven by the painter (same __mpSettingsLocked gate as 13.5),
// and the painter's edits arrive as 'turn-look' snapshots. When the brush
// reaches you, you inherit the canvas and settings as they stand — like
// picking up the brush at a shared easel.
function isMyTurn() { return turnsOn && !!turnHolderId && turnHolderId === clientId; }

// Re-derive the two gates from the current turn state (also called after code
// paths that clear __mpSettingsLocked wholesale, e.g. a host promotion).
function syncTurnGates() {
    if (turnsOn) {
        // "One swirl each" closes the paint gate the moment the stroke ends,
        // before the server has answered our pass: without it the couple of
        // hundred milliseconds of round trip are a window for a second stroke
        // that the relay would drop — painted here, on nobody else's canvas.
        // Settings stay ours until the brush actually leaves (the mirror is
        // still ours to drive, and tweaking is half of what a turn is for).
        window.__mpTurnBlocked = !isMyTurn() || _oneSwirlSpent;
        window.__mpSettingsLocked = !isMyTurn();
    } else {
        window.__mpTurnBlocked = false;
        // The watcher gate dies with the mode. Any pre-turns 13.5 host lock
        // was already superseded when turns switched on (the relay refuses
        // 'settings-lock' while turns run), so nothing legitimate is cleared
        // — without this, a watcher's settings stayed locked forever after
        // the host turned turns off.
        window.__mpSettingsLocked = false;
    }
}

function applyTurnState(wasMyTurn) {
    // Any authoritative rotation update settles an outstanding invite —
    // an accept arrives as turn-state, not as a separate result message.
    clearInviteWait();
    dismissTurnInvitePrompt();
    if (turnsOn) {
        // Turns supersede the 13.5 settings lock on both ends: the host's lock
        // intent drops (the relay refuses 'settings-lock' while turns run) and
        // any guest-side locked banner/gate is replaced by the turn state.
        settingsLockOn = false;
        setSettingsLockedByHost(false, null);
    }
    // The brush was taken from us mid-stroke (a host Skip or a pass racing
    // our drag): end the live stroke NOW. The relay already drops our splats,
    // so anything we kept painting locally would exist on no other canvas.
    if (wasMyTurn && !isMyTurn() && window.pointer && window.pointer.down) {
        try { if (typeof broadcastPointerUp === 'function') broadcastPointerUp(); } catch (_) {}
        window.pointer.down = false;
        window.pointer.moved = false;
        _dabQueue.length = 0;
        if (window.BrushEngine && window.BrushEngine.isActive()) window.BrushEngine.abort();
    }
    // "One swirl each": a fresh allowance opens when the rotation update that
    // ANSWERS our auto-pass lands — including in a room of one, where the
    // brush legitimately comes straight back to us — and whenever the brush is
    // no longer ours (a host skip, turns ending), so it is never carried into
    // a later turn. Resyncs that leave us holding an unspent turn (a join, a
    // reconnect) deliberately do not clear it.
    if (_oneSwirlPassSent || !isMyTurn() || turnModeLocal !== 'stroke') {
        _oneSwirlSpent = false;
        _oneSwirlPassSent = false;
    }
    syncTurnGates();
    syncLookMirror();
    // Whenever we hold the brush on a rotation update, (re)send our look:
    // gaining the brush snaps every watcher from the previous painter to us,
    // and a join/leave/pass resync catches late joiners who would otherwise
    // keep their own look until our next edit.
    if (isMyTurn()) broadcastTurnLook();
    updateConnectedView();
}

function resetTurnState() {
    turnsOn = false;
    turnHolderId = null;
    turnOrder = [];
    turnMsLocal = 0;
    turnDeadlineLocal = 0;
    turnModeLocal = 'timer';
    cancelOneSwirlPass();
    // The spent-paint gate is per-turn state: leaving the room (or the mode)
    // must not carry it into the next rotation, where it would block the
    // painter's first stroke with nothing left to answer it.
    _oneSwirlSpent = false;
    _oneSwirlPassSent = false;
    clearInviteWait();
    dismissTurnInvitePrompt();
    stopTurnTick();
    syncTurnGates(); // clears BOTH gates (turnsOn is false)
    syncLookMirror();
    var banner = document.getElementById('mpTurnBanner'); // legacy top-center banner
    if (banner) banner.remove();
    var chip = document.getElementById('mpTurnChip');
    if (chip) chip.remove();
    var wheel = document.getElementById('turnWheel');
    if (wheel) { wheel.style.display = 'none'; wheel.innerHTML = ''; }
    _wheelKey = '';
}

// ── Turn countdown ──────────────────────────────────────────────────
// The server owns the clock (its alarm auto-passes the brush); clients only
// RENDER the remaining time from the skew-adjusted deadline.
var turnTickTimer = null;

function fmtRemaining() {
    if (!turnDeadlineLocal) return '';
    var s = Math.max(0, Math.round((turnDeadlineLocal - Date.now()) / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
}

// What the countdown slot says. "One swirl each" has no clock, so the slot
// carries the rule instead — the thing a watcher actually wants to know is
// how the current turn ends, not that it has no timer.
function turnClockText() {
    if (isOneSwirlMode()) return 'one swirl';
    return fmtRemaining();
}

function stopTurnTick() {
    if (turnTickTimer) { clearInterval(turnTickTimer); turnTickTimer = null; }
}

function ensureTurnTick() {
    if (turnTickTimer) return;
    turnTickTimer = setInterval(function () {
        if (!turnsOn || !turnDeadlineLocal) { stopTurnTick(); return; }
        updateTurnChip();
        updateTurnStatusLine();
        var clock = document.getElementById('turnWheelClock');
        if (clock) clock.textContent = fmtRemaining();
    }, 500);
}

// Current-artist presence, bubbled onto the screen: a compact chip in the
// quality underbar (2026-08-15 user-test — replaces the fixed top-center
// banner, so turn state lives in exactly two places: the queue in the panel
// and this chip). The "settings mirror" explanation moved into the tooltip.
function updateTurnChip() {
    var legacy = document.getElementById('mpTurnBanner');
    if (legacy) legacy.remove();
    var chip = document.getElementById('mpTurnChip');
    if (!turnsOn || !isMultiplayerEnabled) {
        if (chip) chip.remove();
        return;
    }
    // Underbar lookup at CALL time, null-guarded: 06 (deferred loader) and
    // the underbar build (DCL+800ms+rAF) race in both directions. When the
    // bar is missing OR hidden (mobile/short-window media queries hide
    // #quality-underbar entirely), the chip floats fixed top-center on
    // <body> instead — the old banner's spot — so turn state is never
    // invisible; the placement is re-evaluated on every render/tick.
    var bar = document.getElementById('quality-underbar');
    var barVisible = false;
    if (bar) { try { barVisible = getComputedStyle(bar).display !== 'none'; } catch (_) {} }
    var wantParent = barVisible ? bar : document.body;
    if (!chip) {
        chip = document.createElement('button');
        chip.id = 'mpTurnChip';
        chip.type = 'button';
        chip.addEventListener('click', function () {
            // Bring the rotation into view. On mobile the sidebar is a
            // closed drawer — open it first; and the Multiplayer section
            // collapses to zero height, so expand it or the scroll lands
            // on nothing visible.
            var controls = document.getElementById('sidebar-right');
            if (document.body.classList.contains('mobile-mode') && controls &&
                !controls.classList.contains('visible')) {
                var mt = document.getElementById('mobileMenuToggle');
                if (mt) mt.click(); else controls.classList.add('visible');
            }
            var t = document.getElementById('turnWheel') || document.getElementById('turnsBtn');
            if (!t) return;
            var sec = t.closest ? t.closest('.sidebar-section') : null;
            // Through the mixer's opener when it exists: it un-hides a section
            // the user tucked away (43-ui-visibility) before expanding, so the
            // chip never scrolls to a rotation that is not on screen.
            if (sec && typeof window.openSidebarSection === 'function') window.openSidebarSection(sec);
            else if (sec) sec.classList.remove('collapsed');
            if (t.scrollIntoView) {
                try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
                catch (_) { t.scrollIntoView(); }
            }
        });
    }
    if (chip.parentElement !== wantParent) wantParent.appendChild(chip);
    chip.classList.toggle('floating', !barVisible);
    var once = isOneSwirlMode();
    // Call and return has no clock, so the chip says whose CALL it is instead.
    var t = once ? '' : fmtRemaining();
    var clock = t ? ' · ' + t : '';
    if (isMyTurn()) {
        chip.textContent = (once ? (_oneSwirlSpent ? 'Passing…' : 'Your call') : 'Your turn') + clock;
        chip.title = once
            ? 'Your call — tweak anything you like, then make one swirl and the brush passes on. Click to open the rotation.'
            : 'Your turn — everyone sees your settings. Click to open the rotation.';
        chip.classList.add('you');
    } else if (turnHolderId) {
        chip.textContent = shortName(turnHolderId) + (once ? '\u2019s call' : clock);
        chip.title = shortName(turnHolderId) + (once
            ? ' is making their call — one swirl, then the brush moves on. Your settings mirror theirs. Click to open the rotation.'
            : ' is painting — your settings mirror theirs. Click to open the rotation.');
        chip.classList.remove('you');
    } else {
        chip.textContent = 'Next painter…';
        chip.title = 'Waiting for the next painter. Click to open the rotation.';
        chip.classList.remove('you');
    }
}

// ── Rotation display ────────────────────────────────────────────────
// A plain ordered queue (2026-08-15 user-test — replaces the SVG wheel and
// its arrows): "Now" is the active painter, then Next / 2nd / 3rd… in exact
// pass order. Rows render from a generic {kind:'artist'|'phase'} list so a
// future prepare-phase row slots in without another rewrite. Dot colors
// match the artists' remote-cursor colors; your own row says "(you)".
var _wheelKey = '';

function turnPosLabel(i) {
    // Call and return names the two live roles; a longer rotation counts on.
    if (isOneSwirlMode()) {
        if (i === 0) return 'Call';
        if (i === 1) return 'Return';
    } else {
        if (i === 0) return 'Now';
        if (i === 1) return 'Next';
    }
    return i + (i === 2 ? 'nd' : i === 3 ? 'rd' : 'th');
}

function turnQueueRow(item, posText, isNow) {
    var row = document.createElement('div');
    row.className = 'mp-turn-qrow' + (isNow ? ' now' : '');
    var pos = document.createElement('span');
    pos.className = 'mp-turn-qpos';
    pos.textContent = posText;
    row.appendChild(pos);
    if (item.kind === 'artist' && item.id) {
        var dot = document.createElement('span');
        dot.className = 'mp-turn-qdot';
        dot.style.background = colorForClient(item.id);
        row.appendChild(dot);
        var name = document.createElement('span');
        name.className = 'mp-turn-qname' + (item.id === clientId ? ' you' : '');
        name.textContent = shortName(item.id) + (item.id === clientId ? ' (you)' : '');
        row.appendChild(name);
        if (isNow) {
            var brush = document.createElement('span');
            brush.className = 'mp-turn-qbrush';
            brush.textContent = 'painting';
            row.appendChild(brush);
        }
    } else {
        var ph = document.createElement('span');
        ph.className = 'mp-turn-qname mp-turn-qwait';
        ph.textContent = item.label || 'waiting…';
        row.appendChild(ph);
    }
    if (isNow) {
        // Keeps the id contract with ensureTurnTick — the 500ms tick only
        // rewrites this node's text; rotation changes rebuild the list.
        var clock = document.createElement('span');
        clock.id = 'turnWheelClock';
        clock.className = 'mp-turn-qclock' + (isMyTurn() ? ' you' : '') +
            (isOneSwirlMode() ? ' rule' : '');
        clock.textContent = turnClockText();
        row.appendChild(clock);
    }
    return row;
}

function renderTurnWheel() {
    var host = document.getElementById('turnWheel');
    if (!host) return;
    if (!turnsOn || !isMultiplayerEnabled) {
        host.style.display = 'none';
        if (host.innerHTML) host.innerHTML = '';
        _wheelKey = '';
        return;
    }
    host.style.display = '';
    var ids = turnOrder.slice();
    if (!ids.length && turnHolderId) ids = [turnHolderId];
    var key = ids.join('|') + '#' + (turnHolderId || '') + '#' + (clientId || '') +
        '#' + (turnDeadlineLocal ? 1 : 0) + '#' + turnModeLocal;
    if (key === _wheelKey) {
        // Rotation unchanged — the tick only refreshes the clock text.
        return;
    }
    _wheelKey = key;

    var holder = (turnHolderId && ids.indexOf(turnHolderId) !== -1) ? turnHolderId : null;
    var hIdx = holder ? ids.indexOf(holder) : -1;
    // Waiters in the order the brush will reach them
    var waiters = hIdx === -1 ? ids.slice()
        : ids.slice(hIdx + 1).concat(ids.slice(0, hIdx));

    // Generic row items: artists today; a 'phase' row (prepare etc.) later.
    var items = [];
    items.push(holder ? { kind: 'artist', id: holder }
                      : { kind: 'phase', label: 'waiting for a painter…' });
    for (var i = 0; i < waiters.length; i++) items.push({ kind: 'artist', id: waiters[i] });

    host.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'mp-turn-queue';
    for (var j = 0; j < items.length; j++) {
        list.appendChild(turnQueueRow(items[j], turnPosLabel(j), j === 0));
    }
    host.appendChild(list);
    if (ids.length <= 1) {
        var hint = document.createElement('div');
        hint.className = 'mp-turn-qhint';
        hint.textContent = 'waiting for another artist…';
        host.appendChild(hint);
    }
}

// Countdown + rotation-size line under the wheel (refreshed by the tick).
function updateTurnStatusLine() {
    var tStat = document.getElementById('turnStatus');
    if (!tStat) return;
    if (!turnsOn) {
        tStat.style.display = 'none';
        return;
    }
    tStat.style.display = '';
    var n = turnOrder.length;
    var once = isOneSwirlMode();
    var t = once ? 'one swirl each' : fmtRemaining();
    var who = isMyTurn()
        ? (once ? 'Your call' : 'Your turn')
        : (turnHolderId ? shortName(turnHolderId) + (once ? '\u2019s call' : ' painting') : 'Waiting');
    tStat.textContent = who + (t ? ' · ' + t : '') + ' · ' + n + (n === 1 ? ' artist' : ' artists');
    tStat.classList.toggle('mp-turn-you', isMyTurn());
}

// Panel widgets: the host's Take turns toggle + turn-length picker, the
// rotation wheel, the countdown line, and the Pass/Skip button (painter
// passes; host can skip an AFK painter).
function updateTurnUI() {
    updateTurnChip();
    var isHost = myRole === 'host';
    // Stranger pairs have no meaningful host, so both painters drive turns:
    // either may ask (consent flow) and either may stop.
    var pair = isStrangerRoom();
    var canDrive = isHost || pair;
    var stroke = turnModeLocal === 'stroke';

    // Two rhythms, one button each. While one runs only ITS button shows (as
    // "Stop …") so the panel never offers to start a second rotation on top of
    // the first. Non-drivers see both, disabled — hiding them outright made
    // the whole feature invisible to everyone but the host, who then had to
    // explain it exists. Once a rhythm runs the wheel/chip/status carry the
    // state, so a non-driver's dead buttons step out of the way.
    var rhythms = [
        { id: 'turnsBtn', mode: 'timer', start: 'Take turns', ask: 'Ask to take turns', stop: 'Stop taking turns',
          startTitle: "Take turns painting — one artist at a time while everyone else watches with the painter's settings mirrored live",
          askTitle: 'Ask your partner to take turns — nothing changes unless they agree' },
        { id: 'callReturnBtn', mode: 'stroke', start: 'Call and return', ask: 'Ask for call and return', stop: 'Stop call and return',
          startTitle: 'One swirl each, back and forth: make your call, they answer, and the brush comes back to you. No clock.',
          askTitle: 'Ask your partner to play call and return — one swirl each, back and forth. Nothing changes unless they agree' }
    ];
    rhythms.forEach(function (r) {
        var b = document.getElementById(r.id);
        if (!b) return;
        var running = turnsOn && (stroke === (r.mode === 'stroke'));
        var waiting = invitePending && invitePendingMode === r.mode;
        var show = turnsOn ? (running && canDrive) : (!invitePending || waiting);
        b.style.display = show ? '' : 'none';
        b.disabled = !canDrive || invitePending;
        if (waiting) {
            b.textContent = 'Waiting for their answer…';
            b.title = 'Your partner has been asked';
        } else if (!canDrive) {
            b.textContent = r.start + ' · host only';
            b.title = 'Only the room host can start this';
        } else if (running) {
            b.textContent = r.stop;
            b.title = 'Go back to painting at the same time';
        } else {
            b.textContent = pair ? r.ask : r.start;
            b.title = pair ? r.askTitle : r.startTitle;
        }
        b.classList.toggle('active', running);
        b.classList.toggle('mp-btn-muted', !canDrive || invitePending);
    });

    // The length belongs to the timed rhythm only. The asker picks it (it
    // rides along in the invite), so both members of a pair see it while
    // nothing runs; while turns run only the host does, because changing it
    // mid-round restarts the current turn's clock server-side.
    var row = document.getElementById('turnLengthRow');
    if (row) {
        var showRow = (canDrive && !turnsOn && !invitePending) || (isHost && turnsOn && !stroke);
        row.style.display = showRow ? '' : 'none';
        var s = document.getElementById('turnLength');
        // While turns run the slider must read the ROOM, not whatever this
        // client last chose — a host handover otherwise leaves the new host
        // looking at 1:00 in a room passing the brush every five minutes.
        if (s && turnsOn && !stroke && turnMsLocal > 0 && document.activeElement !== s) {
            var want = Math.round(turnMsLocal / 1000);
            if (want >= 30 && want <= 300 && parseInt(s.value, 10) !== want) {
                s.value = String(want);
                try { s.style.setProperty('--val', String(want)); } catch (_) {}
            }
        }
        renderTurnLengthValue();
    }

    var pBtn = document.getElementById('turnPassBtn');
    if (pBtn) {
        // Skipping SOMEONE ELSE's turn is a host power, and a stranger pair has
        // no real host — so in a pair you may only pass your own turn.
        var showPass = turnsOn && (isMyTurn() || (isHost && !pair));
        pBtn.style.display = showPass ? '' : 'none';
        pBtn.disabled = isMyTurn() && _oneSwirlSpent; // pass already on its way
        pBtn.textContent = isMyTurn()
            ? (_oneSwirlSpent ? 'Passing…' : (stroke ? 'Pass my call' : 'Pass turn'))
            : 'Skip turn';
        pBtn.title = isMyTurn()
            ? (stroke
                ? 'Hand the brush on now, without using your swirl'
                : 'Hand the brush to the next artist in the rotation')
            : 'Skip this artist and move the brush on';
    }
    syncHostBlock();
    renderTurnWheel();
    updateTurnStatusLine();
    if (turnsOn && turnDeadlineLocal) ensureTurnTick(); else stopTurnTick();
}

// Turn length for the timed rhythm, in seconds (the slider's 30s–5min range,
// clamped again here so a stray value can never ride the wire). Call and
// return sends it too but ignores it: that rhythm ends on the stroke.
function turnTimerSeconds() {
    var s = document.getElementById('turnLength');
    var v = s ? parseInt(s.value, 10) : 60;
    return isNaN(v) ? 60 : Math.max(30, Math.min(300, v));
}

function fmtTurnLength(sec) {
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
}

function renderTurnLengthValue() {
    var v = document.getElementById('turnLengthValue');
    if (v) v.textContent = fmtTurnLength(turnTimerSeconds());
}

// True while the room is passing the brush on completed strokes rather than
// on a clock. This is "Call and return" in the panel: the wire and the relay
// still call it stroke mode ("One swirl each" until 2026-09-11 — the rule is
// the same, the name says what it is for).
function isOneSwirlMode() { return turnsOn && turnModeLocal === 'stroke'; }

// ── Stranger-pair consent ───────────────────────────────────────────
// A stranger room has no real host — "host" is just whoever connected first —
// so either painter may propose taking turns and the other agrees or doesn't.
// Nothing changes on either canvas until they agree.
var invitePending = false;      // we asked; waiting on their answer
var invitePendingMode = 'timer'; // ...and which rhythm we asked for
var inviteTimeout = null;
var inviteAckTimeout = null;
var INVITE_WAIT_MS = 30000;     // matches the relay's invite TTL
var INVITE_ACK_MS = 4000;       // server ack must beat this

function clearInviteWait() {
    invitePending = false;
    if (inviteTimeout) { clearTimeout(inviteTimeout); inviteTimeout = null; }
    if (inviteAckTimeout) { clearTimeout(inviteAckTimeout); inviteAckTimeout = null; }
}

function sendTurnInvite(mode) {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    if (invitePending || turnsOn) return;
    invitePending = true;
    invitePendingMode = mode === 'stroke' ? 'stroke' : 'timer';
    partySocket.send(JSON.stringify({
        type: 'turn-invite', seconds: turnTimerSeconds(), mode: invitePendingMode
    }));
    // A relay that predates turn invites has no handler for the message and
    // simply rebroadcasts it, so nothing ever comes back. Without this probe
    // that is indistinguishable from a partner who is ignoring you — you just
    // wait 30s for "no answer". The ack turns it into a real explanation.
    inviteAckTimeout = setTimeout(function () {
        if (!invitePending) return;
        clearInviteWait();
        showTurnToast('This room\'s server is too old for turn invites — it needs a relay update.');
        updateTurnUI();
    }, INVITE_ACK_MS);
    inviteTimeout = setTimeout(function () {
        if (!invitePending) return;
        clearInviteWait();
        showTurnToast('No answer — they may not be at the keyboard.');
        updateTurnUI();
    }, INVITE_WAIT_MS);
    updateTurnUI();
}

function answerTurnInvite(accept) {
    dismissTurnInvitePrompt();
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'turn-invite-response', accept: !!accept }));
}

function dismissTurnInvitePrompt() {
    var el = document.getElementById('mpTurnInvite');
    if (el) el.remove();
}

// The partner asked us. Accept/Decline, shown near the turn banner so the
// whole turn conversation happens in one place on screen.
function showTurnInvitePrompt(fromId, seconds, mode) {
    dismissTurnInvitePrompt();
    var el = document.createElement('div');
    el.id = 'mpTurnInvite';
    el.className = 'mp-turn-invite';
    var who = fromId ? shortName(fromId) : 'Your partner';
    var once = mode === 'stroke';
    var len = (typeof seconds === 'number' && seconds > 0)
        ? (seconds >= 60 ? fmtTurnLength(seconds) : seconds + ' sec') + ' each'
        : 'no timer';
    var msg = document.createElement('span');
    msg.textContent = once
        ? who + ' wants to play call and return: one swirl each, back and forth'
        : who + ' wants to take turns painting (' + len + ')';
    var yes = document.createElement('button');
    yes.className = 'mp-invite-yes btn--emphasis';
    yes.textContent = once ? 'Call and return' : 'Take turns';
    yes.addEventListener('click', function () { answerTurnInvite(true); });
    var no = document.createElement('button');
    no.className = 'mp-invite-no';
    no.textContent = 'No thanks';
    no.addEventListener('click', function () { answerTurnInvite(false); });
    el.appendChild(msg);
    el.appendChild(yes);
    el.appendChild(no);
    document.body.appendChild(el);
    // Expire in step with the relay's TTL so a stale prompt can't linger and
    // answer an invite the server has already forgotten.
    setTimeout(function () {
        var still = document.getElementById('mpTurnInvite');
        if (still === el) el.remove();
    }, INVITE_WAIT_MS);
}

// Brief, non-blocking feedback for invite outcomes.
function showTurnToast(text) {
    var el = document.getElementById('mpTurnToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mpTurnToast';
        el.className = 'mp-turn-toast';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    if (showTurnToast._t) clearTimeout(showTurnToast._t);
    showTurnToast._t = setTimeout(function () { el.style.opacity = '0'; }, 2600);
}

function startOrStopTurns(mode) {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    // Stopping never needs permission, whichever rhythm is running.
    if (turnsOn) {
        partySocket.send(JSON.stringify({ type: 'turns', on: false }));
        return;
    }
    // Starting in a stranger pair needs the partner's yes; a hosted private
    // room does not.
    if (isStrangerRoom()) {
        sendTurnInvite(mode);
        return;
    }
    partySocket.send(JSON.stringify({
        type: 'turns', on: true, seconds: turnTimerSeconds(), mode: mode === 'stroke' ? 'stroke' : 'timer'
    }));
}

// The two rhythms. Same machinery, different way for a turn to end.
function toggleTurns() { startOrStopTurns('timer'); }
function toggleCallReturn() { startOrStopTurns('stroke'); }

function passTurn() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'turn-pass' }));
}

// ── "One swirl each": the brush passes itself ───────────────────────
// Tweak whatever you like, lay down one stroke, and the turn moves on. The
// pass is fired by the painter's own client (the relay has no idea what a
// stroke is), but NOT at pointer-up: a stroke keeps broadcasting after the
// lift — the splat-out tail and the stabilizer's catch-up dabs drain over the
// following frames — and the relay drops every one of them the instant we
// stop being the holder. Passing early would cut the stroke short on every
// other canvas while ours eased out. So the pass waits on full paint idle,
// the same gate 05j uses for the deferred arm-colour advance.
var _oneSwirlSpent = false;    // our one swirl this turn is down
var _oneSwirlPassSent = false; // ...and its pass is on the wire
var _oneSwirlTimer = null;
var _oneSwirlSettleBy = 0;
var ONE_SWIRL_SETTLE_CAP_MS = 4000; // pause escape hatch: a frozen sim never drains

function swirlFullySettled() {
    if (window.pointer && window.pointer.down) return false;
    if (window.splatOutActive) return false;
    var BE = window.BrushEngine;
    if (BE && (BE.isActive() || BE.pending())) return false;
    return true;
}

function cancelOneSwirlPass() {
    if (_oneSwirlTimer) { clearInterval(_oneSwirlTimer); _oneSwirlTimer = null; }
    _oneSwirlSettleBy = 0;
}

function scheduleOneSwirlPass() {
    if (_oneSwirlTimer) return;
    _oneSwirlSpent = true;
    syncTurnGates();      // shut the paint gate now, not on the server's answer
    updateTurnUI();
    _oneSwirlSettleBy = Date.now() + ONE_SWIRL_SETTLE_CAP_MS;
    _oneSwirlTimer = setInterval(function () {
        // The brush can move out from under us mid-drain (a host skip, turns
        // switching off) — then there is nothing left to pass.
        if (!isOneSwirlMode() || !isMyTurn()) { cancelOneSwirlPass(); return; }
        if (!swirlFullySettled() && Date.now() < _oneSwirlSettleBy) return;
        cancelOneSwirlPass();
        _oneSwirlPassSent = true;
        passTurn();
    }, 100);
}

// Throttled "not your turn" toast, fired from the gated paint/clear paths.
var _turnHintAt = 0;
var _turnHintTimer = null;
window.__mpTurnHint = function () {
    var now = Date.now();
    if (now - _turnHintAt < 1500) return;
    _turnHintAt = now;
    var el = document.getElementById('mpTurnHint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mpTurnHint';
        el.style.cssText = 'position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:10002;' +
            'padding:6px 14px;border-radius:8px;background:rgba(15,20,27,0.92);border:1px solid rgba(122,162,255,0.5);' +
            'color:#9db8ff;font-size:12px;font-weight:600;pointer-events:none;transition:opacity 0.3s;';
        document.body.appendChild(el);
    }
    el.textContent = turnHolderId
        ? ('It\'s ' + shortName(turnHolderId) + '\'s ' + (isOneSwirlMode() ? 'call' : 'turn'))
        : 'Waiting for the next painter…';
    el.style.opacity = '1';
    if (_turnHintTimer) clearTimeout(_turnHintTimer);
    _turnHintTimer = setTimeout(function () { el.style.opacity = '0'; }, 1400);
};
