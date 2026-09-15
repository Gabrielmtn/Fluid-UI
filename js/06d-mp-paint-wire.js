// ================================================================
// 06d-mp-paint-wire.js — Swirl Together client: paint over the wire.
// Custom brush shapes and colliders published in chunks, the outbound dab
// train (queueDab / flushDabs / brushWireFields), the frame-budgeted inbound
// queue and handleRemoteSplat, and replay strokes as stroke-chunk trains.
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

// ── Custom brush shapes over the wire (2026-08-21) ───────────────────────
// A stamp is a ≤128px PNG (measured 5-21KB across a real library), so it is
// cheap enough to publish ONCE per room and then reference by id on every
// dab — rather than the old behaviour, where a peer's shaped stroke printed
// as a plain built-in tip because "its bitmap can't ride the wire".
//
// Two ids per shape: the shape's own id, and `rev`, a content hash. replace()
// re-stamps a shape IN PLACE keeping its id (33-brush-shapes), so without the
// rev a peer would keep painting with the version it cached first.
const SHAPE_CHUNK_CHARS = 11000; // + envelope: comfortably under the 16KB cap
const SHAPE_MAX_CHUNKS = 32;     // ≈350KB — far above 33's 100KB-per-stamp budget
var _shapePublished = new Map(); // id → rev already sent on THIS socket

// A fresh socket is a fresh audience: whatever we published to the last room
// says nothing about what this one has.
function resetPublishedShapes() {
    _shapePublished.clear();
}

// Publish the active shape's bitmap unless this socket already sent that exact
// version. Called immediately BEFORE the dabs that reference it — messages are
// ordered on one socket, so the definition always lands first and there is no
// window where a peer sees the id without the art.
function publishShape(id) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return null;
    const BS = window.BrushShapes;
    if (!BS || typeof BS.exportShape !== 'function') return null;
    if (!id) return null;
    const e = BS.exportShape(id);
    if (!e) return null;                          // stale selection, nothing to send
    if (_shapePublished.get(id) === e.rev) return e.rev; // peers already have it
    const url = e.dataURL || '';
    const total = Math.ceil(url.length / SHAPE_CHUNK_CHARS) || 1;
    if (total > SHAPE_MAX_CHUNKS) return null;    // absurd stamp: leave peers on the tip
    for (let i = 0; i < total; i++) {
        partySocket.send(JSON.stringify({
            type: 'brush-shape',
            data: {
                id: e.id, rev: e.rev, name: e.name, seq: i, total,
                part: url.slice(i * SHAPE_CHUNK_CHARS, (i + 1) * SHAPE_CHUNK_CHARS)
            },
            timestamp: Date.now()
        }));
    }
    _shapePublished.set(id, e.rev);
    return e.rev;
}

function publishActiveShape() {
    return publishShape((window.config && window.config.BRUSH_SHAPE_ID) || null);
}

// The painter's footprint, stamped on the dabs about to go out. `tip`/`angle`
// are the built-in stamp — peers used to render remote dabs with their OWN
// tip in free paint (only the settings-lock/turn-look mirror carried the
// painter's), so these close that gap too. `shape` rides only when its bitmap
// has been published.
function brushWireFields() {
    const cfg = window.config || {};
    const f = { tip: (cfg.BRUSH_TIP | 0) || 0 };
    if (cfg.BRUSH_ANGLE) f.angle = +(+cfg.BRUSH_ANGLE).toFixed(1);
    // Push (velocity-only) has to ride the wire or peers paint dye where this
    // canvas laid none — the same class of gap as shaped strokes arriving
    // gaussian. Additive and omitted in the common case: an old receiver just
    // ignores it, and a peer on an older bundle renders the stroke the way it
    // always did (dye), which is the honest degradation.
    if (cfg.BRUSH_VELOCITY_ONLY) {
        f.push = cfg.BRUSH_VEL_MODE || 'smudge';
        f.pushS = +(+((typeof cfg.BRUSH_VEL_STRENGTH === 'number') ? cfg.BRUSH_VEL_STRENGTH : 1)).toFixed(2);
    }
    // Per-arm Pressure (bitmask, 05g): WHICH arms push is the painter's, not
    // the viewer's. Arm colours are deliberately resolved locally, but this is
    // not styling — it decides whether an arm deposits pigment at all, so
    // leaving it local meant a peer's plain stroke came out with holes wherever
    // this client had an arm marked. Omitted at 0, like `push`.
    var _ap = (typeof window.armPushMask === 'function') ? window.armPushMask() : 0;
    if (_ap) f.ap = _ap;
    // Per-stroke mirror (41-button-modes, 1=X 2=Y 3=both). Geometry, not
    // styling: a stroke painted by a mirror-bound button landed in two or four
    // places, and a peer without this saw one of them. Omitted at 0, so an
    // ordinary dab message is exactly the size it was and an older receiver
    // just ignores the field.
    var _mir = window.__strokeMirrorPin | 0;
    if (_mir) f.mir = _mir;
    const rev = publishActiveShape();
    if (rev) { f.shape = cfg.BRUSH_SHAPE_ID; f.rev = rev; }
    return f;
}

// Reassembly of chunked shape definitions, keyed so two peers sending
// different shapes — or the same shape at different revs — never interleave.
const shapeChunkBuffers = new Map(); // clientId|id|rev → {parts, received, total, at}
function handleBrushShape(data) {
    const d = data.data || {};
    if (typeof d.id !== 'string' || typeof d.part !== 'string') return;
    if (typeof d.seq !== 'number' || typeof d.total !== 'number') return;
    if (d.total < 1 || d.total > SHAPE_MAX_CHUNKS || d.seq < 0 || d.seq >= d.total) return;
    if (d.part.length > SHAPE_CHUNK_CHARS) return;
    const BS = window.BrushShapes;
    if (!BS || typeof BS.putPeer !== 'function') return;

    const now = Date.now();
    for (const [k, v] of shapeChunkBuffers) {
        if (now - v.at > 20000) shapeChunkBuffers.delete(k); // abandoned transfer
    }
    const key = data.clientId + '|' + d.id + '|' + d.rev;
    let buf = shapeChunkBuffers.get(key);
    if (!buf) {
        if (shapeChunkBuffers.size >= 8) return;  // too many in flight — drop the newcomer
        buf = { parts: new Array(d.total), received: 0, total: d.total, at: now };
        shapeChunkBuffers.set(key, buf);
    }
    if (buf.total !== d.total) return;
    if (buf.parts[d.seq] === undefined) {
        buf.parts[d.seq] = d.part;
        buf.received++;
    }
    if (buf.received !== buf.total) return;
    shapeChunkBuffers.delete(key);
    // putPeer validates the assembled string (PNG dataURL, size, count) before
    // it ever reaches an <img> — the relay vouches for nothing.
    try { BS.putPeer(d.id, buf.parts.join(''), d.rev); } catch (_) {}
}

// ── Colliders over the wire (2026-08-21) ─────────────────────────────────
// Until now a wall was invisible to everyone but the person who placed it —
// and because the obstacle field feeds vorticity, pressure and advection
// every frame, that was not just a missing decoration: the two simulations
// silently DIVERGED. The same shared stroke curled around a wall on one
// screen and straight through empty space on the other.
//
// What travels is the coverage map, not the source picture. Physics never
// resolves finer than the sim grid (512 long side on desktop), so a photo-
// derived wall that is megabytes on disk crosses as a few KB and still
// produces the same obstacle. Each client rasterizes it into its own
// obstacle field at its own resolution — visually equivalent walls, locally
// consistent physics, which is the achievable target when peers run
// different sim resolutions and aspect ratios.
const COLLIDER_WIRE_MAX = 512;   // matches the desktop sim grid's long side
const COLLIDER_CHUNK_CHARS = 11000;
const COLLIDER_MAX_CHUNKS = 32;  // ≈350KB of coverage PNG
var _colliderPublished = new Map(); // our layer index → rev last sent
var peerColliders = new Map();      // "ownerId|theirIndex" → our local layer index

var peerColliderRevs = new Map();   // "ownerId|theirIndex" → rev we built it from

function resetPublishedColliders() {
    _colliderPublished.clear();
}

// Send every wall we own. Used when someone joins: unlike a brush shape,
// which the next stroke would republish anyway, a wall that was placed
// before they arrived has no natural trigger to resend it — so a late
// joiner would sit in a room whose obstacles they cannot see and whose
// physics they cannot reproduce.
//
// force: send even what the ledger says the room already has. Used when the
// brush comes back to us (see flushStagedWork, 06c): a send that raced a
// hand-over was dropped by the relay after the ledger recorded it, and
// receivers skip a wall whose rev they already hold, so a resend costs the
// bytes and nothing on screen. The sweep at the end tells the room about
// walls that are gone here — deleted or switched off while it was someone
// else's turn, when nothing could be sent.
function republishColliders(force) {
    if (!window.layers || !isMultiplayerEnabled) return;
    var own = new Set();
    window.layers.forEach(function (l) {
        if (l && l.isCollision && !l.__peerOwner) {
            own.add(l.index);
            try { publishCollider(l.index, force); } catch (_) {}
        }
    });
    Array.from(_colliderPublished.keys()).forEach(function (idx) {
        if (!own.has(idx)) { try { retractCollider(idx); } catch (_) {} }
    });
}

// Coverage map → opaque grayscale PNG. Grayscale-with-opaque-alpha, NOT
// white-with-alpha: a canvas stores alpha premultiplied, so coverage put in
// the alpha channel comes back quantized, while a value in RGB round-trips
// exactly.
function coverageToPng(depth) {
    const sw = depth.width, sh = depth.height;
    const scale = Math.min(1, COLLIDER_WIRE_MAX / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const src = document.createElement('canvas');
    src.width = sw; src.height = sh;
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(sw, sh);
    for (let i = 0, p = 0; i < depth.data.length; i++, p += 4) {
        const v = depth.data[i];
        img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    if (dw === sw && dh === sh) return { png: src.toDataURL('image/png'), w: dw, h: dh };
    const out = document.createElement('canvas');
    out.width = dw; out.height = dh;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.drawImage(src, 0, 0, dw, dh);
    return { png: out.toDataURL('image/png'), w: dw, h: dh };
}

// The inverse, on the receiving side.
function pngToCoverage(dataURL, w, h) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth || w; c.height = img.naturalHeight || h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const d = ctx.getImageData(0, 0, c.width, c.height).data;
                const out = new Uint8Array(c.width * c.height);
                for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = d[p];
                resolve({ data: out, width: c.width, height: c.height });
            } catch (_) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = dataURL;
    });
}

// The PNG a coverage map encodes to, kept per map. Every obstacle recomposite
// asks for a publish (a Breathing ring moving, a text wall settling), and a
// wall that has not changed must cost a hash compare, not a canvas encode.
// coverageOf hands back the SAME map object until the wall really changes,
// so its data array is the key.
var _colliderPngCache = new WeakMap(); // coverage data → {png, w, h, thr, inv}
function pngForCoverage(depth) {
    var hit = _colliderPngCache.get(depth.data);
    if (hit && hit.srcW === depth.width && hit.srcH === depth.height) return hit;
    var enc = coverageToPng(depth);
    if (!enc || !enc.png) return null;
    enc.srcW = depth.width; enc.srcH = depth.height;
    _colliderPngCache.set(depth.data, enc);
    return enc;
}

// Everything a peer needs to reproduce one wall. Geometry rides NORMALIZED
// (fractions of the sender's canvas box) because layer.x/y are CSS pixels of
// a box whose size differs per client — the same reason splat positions are
// normalized.
//
// The map is what the obstacle actually draws for the layer (coverageOf,
// 23-depth-collision): a Paint Collider wall straight off its Mask, an edited
// mask's shapes, not just the depth map the layer was first built from.
// Returns null when there is nothing to say yet, {none:true} when the layer
// is no wall at all (Collision OFF, its surface gone).
function serializeCollider(layerIndex) {
    const cl = window.collisionLayers;
    if (!cl || !window.layers) return null;
    const layer = window.layers.find(l => l.index === layerIndex);
    if (!layer || !layer.isCollision) return null;
    const depth = (typeof cl.coverageOf === 'function') ? cl.coverageOf(layerIndex)
        : (typeof cl.depthOf === 'function' ? cl.depthOf(layerIndex) : null);
    if (!depth) return null;
    if (depth.none) return { none: true };
    const enc = pngForCoverage(depth);
    if (!enc || !enc.png) return null;
    const box = document.getElementById('canvas-wrapper') || (window.canvas || {});
    const bw = box.clientWidth || (window.canvas && canvas.width) || 1;
    const bh = box.clientHeight || (window.canvas && canvas.height) || 1;
    return {
        lid: layerIndex,
        w: enc.w, h: enc.h, png: enc.png,
        thr: (typeof depth.threshold === 'number') ? depth.threshold : 128,
        inv: !!depth.invert,
        mode: layer.collisionMode || 'block',
        str: (typeof layer.collisionStrength === 'number') ? layer.collisionStrength : 0.9,
        x: +((layer.x || 0) / bw).toFixed(4),
        y: +((layer.y || 0) / bh).toFixed(4),
        sx: +(layer.scaleX || 1).toFixed(4),
        sy: +(layer.scaleY || 1).toFixed(4),
        rot: +(layer.rotation || 0).toFixed(2),
        // Skew (degrees). An older peer ignores the fields — the wall
        // arrives unskewed there, same class of gap as shaped strokes.
        kx: +(layer.skewX || 0).toFixed(2),
        ky: +(layer.skewY || 0).toFixed(2),
        vis: layer.visible !== false,
        // addCollisionLayer prefixes its own 🧱, so send the bare name or the
        // wall arrives on the peer titled "🧱 🧱 Bar Wall".
        name: String(layer.title || 'Collision').replace(/^\s*🧱\s*/, '').slice(0, 40)
    };
}

// Cheap content hash so an unchanged wall is never re-sent — updateObstacle
// runs on every slider nudge and on a 120ms cadence while a live collider
// tracks a stroke, and each resend is a multi-KB chunked transfer.
function colliderRev(meta) {
    const s = meta.png.length + '|' + meta.w + 'x' + meta.h + '|' + meta.thr + '|' + meta.inv +
              '|' + meta.mode + '|' + meta.str + '|' + meta.x + ',' + meta.y +
              '|' + meta.sx + ',' + meta.sy + '|' + meta.rot + '|' + meta.kx + ',' + meta.ky +
              '|' + meta.vis;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    // Fold in a sample of the bitmap so a redrawn mask of identical length
    // still reads as a change.
    for (let i = 0; i < meta.png.length; i += 997) { h ^= meta.png.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36);
}

function publishCollider(layerIndex, force) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    if (isProcessingRemoteEvent) return;               // never echo a peer's wall back
    // Someone else's wall: never republished as ours — but a change we made
    // to it goes back to its author (see "Editing someone else's wall").
    if (isPeerCollider(layerIndex)) { publishPeerEdit(layerIndex); return; }
    const meta = serializeCollider(layerIndex);
    if (!meta) return;
    // Watchers do not reshape the painter's fluid. The relay drops these while
    // turns run (TURN_HOLDER_ONLY), so the wall waits here, STAGED: the
    // ledger keeps the last version the room got, and flushStagedWork (06c)
    // sends the current one the moment the brush reaches us. Until then it
    // stands on this canvas only — the price of letting a watcher get their
    // next move ready. The hint is for a real difference only: every obstacle
    // recomposite asks, edit or not.
    if (window.__mpTurnBlocked) {
        const pending = meta.none ? _colliderPublished.has(layerIndex)
            : _colliderPublished.get(layerIndex) !== colliderRev(meta);
        if (pending) mpStagedHint();
        return;
    }
    if (meta.none) { retractCollider(layerIndex); return; }
    const rev = colliderRev(meta);
    if (!force && _colliderPublished.get(layerIndex) === rev) return;
    const total = Math.ceil(meta.png.length / COLLIDER_CHUNK_CHARS) || 1;
    if (total > COLLIDER_MAX_CHUNKS) {
        console.warn('[Multiplayer] Collider too large to share (' + total + ' chunks) — kept local');
        return;
    }
    for (let i = 0; i < total; i++) {
        const part = meta.png.slice(i * COLLIDER_CHUNK_CHARS, (i + 1) * COLLIDER_CHUNK_CHARS);
        const d = Object.assign({}, meta, { rev, seq: i, total, part });
        delete d.png;                                   // the bitmap rides as `part`
        partySocket.send(JSON.stringify({ type: 'collider-add', data: d, timestamp: Date.now() }));
    }
    _colliderPublished.set(layerIndex, rev);
}

function broadcastColliderRemove(layerIndex) {
    if (isProcessingRemoteEvent) return;
    // The user deleted someone else's wall: it leaves the room (and is only
    // switched off on its author's machine — see retractPeerWall).
    const peerKey = peerKeyOfIndex(layerIndex);
    if (peerKey) { retractPeerWall(peerKey); return; }
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        _colliderPublished.delete(layerIndex);
        return;
    }
    // Out of turn the removal is STAGED like any other wall edit: the ledger
    // entry stays, so republishColliders' sweep sends it when the brush
    // reaches us. Dropping the entry here (as this used to, before the gate)
    // meant a wall deleted while waiting stood on everyone else's canvas for
    // the rest of the session.
    if (window.__mpTurnBlocked) {
        if (_colliderPublished.has(layerIndex)) mpStagedHint();
        return;
    }
    retractCollider(layerIndex, true);
}

// Tell the room a wall of ours is gone — deleted, switched off, or its
// surface removed. Only walls the room was actually told about are
// retracted, unless `always` (a delete: the ledger may have been reset by a
// reconnect, and an extra remove for a wall nobody holds costs nothing).
function retractCollider(layerIndex, always) {
    if (window.__mpTurnBlocked) return;   // staged: the sweep sends it later
    const had = _colliderPublished.has(layerIndex);
    _colliderPublished.delete(layerIndex);
    if (!had && !always) return;
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({
        type: 'collider-remove', data: { lid: layerIndex }, timestamp: Date.now()
    }));
}

function isPeerCollider(layerIndex) {
    for (const v of peerColliders.values()) if (v === layerIndex) return true;
    return false;
}

// Reassembly + apply for an incoming wall.
const colliderChunkBuffers = new Map(); // clientId|lid|rev → {parts, received, total, meta, at}
function handleColliderAdd(data) {
    const d = data.data || {};
    if (typeof d.lid !== 'number' || typeof d.part !== 'string') return;
    if (typeof d.seq !== 'number' || typeof d.total !== 'number') return;
    if (d.total < 1 || d.total > COLLIDER_MAX_CHUNKS || d.seq < 0 || d.seq >= d.total) return;
    if (d.part.length > COLLIDER_CHUNK_CHARS) return;
    if (!(d.w > 0 && d.h > 0 && d.w <= 2048 && d.h <= 2048)) return;

    const now = Date.now();
    for (const [k, v] of colliderChunkBuffers) {
        if (now - v.at > 20000) colliderChunkBuffers.delete(k);
    }
    // Whose wall: the sender's own, or (own) someone else's that the sender
    // reshaped on their turn — see "Editing someone else's wall".
    const owner = (typeof d.own === 'string' && d.own) ? d.own : data.clientId;
    // Already standing here at this exact version: a painter re-sends every
    // wall when the brush comes back to them (republishColliders force), and
    // rebuilding an identical wall would only churn the layer list.
    if (owner !== clientId && peerColliderRevs.get(owner + '|' + d.lid) === d.rev
        && peerColliderLayer(owner + '|' + d.lid)) return;
    const key = data.clientId + '|' + owner + '|' + d.lid + '|' + d.rev;
    let buf = colliderChunkBuffers.get(key);
    if (!buf) {
        if (colliderChunkBuffers.size >= 8) return;
        buf = { parts: new Array(d.total), received: 0, total: d.total, meta: d, at: now };
        colliderChunkBuffers.set(key, buf);
    }
    if (buf.total !== d.total) return;
    if (buf.parts[d.seq] === undefined) { buf.parts[d.seq] = d.part; buf.received++; }
    if (buf.received !== buf.total) return;
    colliderChunkBuffers.delete(key);

    const png = buf.parts.join('');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)) return;
    if (owner === clientId) { applyOwnWallReshape(data.clientId, buf.meta, png); return; }
    applyPeerCollider(owner, buf.meta, png);
}

// A partner reshaped one of OUR walls on their turn: its new coverage and
// transform land on our own layer, which stays ours (and bakes: a wall
// that was painting itself live from a Mask now keeps the shape it was
// given — collisionLayers.setCoverage).
function applyOwnWallReshape(editorId, meta, png) {
    const layer = ownColliderLayer(meta.lid);
    const cl = window.collisionLayers;
    if (!layer || !cl || typeof cl.setCoverage !== 'function') return;
    pngToCoverage(png, meta.w, meta.h).then(depth => {
        if (!depth || !ownColliderLayer(meta.lid)) return;
        const wasRemote = isProcessingRemoteEvent;
        isProcessingRemoteEvent = true;
        try {
            cl.setCoverage(meta.lid, depth, (typeof meta.thr === 'number') ? meta.thr : 128, !!meta.inv);
        } finally {
            isProcessingRemoteEvent = wasRemote;
        }
        applyColliderProps(layer, sanitizeColliderProps(Object.assign({}, meta, { on: true })));
        const m2 = serializeCollider(meta.lid);
        if (m2 && !m2.none) _colliderPublished.set(meta.lid, colliderRev(m2));
        noticeOwnEdited(editorId, 'reshaped your wall', String(layer.title || '').replace(/^\s*🧱\s*/, ''));
    });
}

function applyPeerCollider(ownerId, meta, png) {
    const cl = window.collisionLayers;
    if (!cl || typeof cl.addFromDepth !== 'function') return;
    pngToCoverage(png, meta.w, meta.h).then(depth => {
        if (!depth) return;
        const key = ownerId + '|' + meta.lid;
        const box = document.getElementById('canvas-wrapper') || (window.canvas || {});
        const bw = box.clientWidth || (window.canvas && canvas.width) || 1;
        const bh = box.clientHeight || (window.canvas && canvas.height) || 1;
        // Replace rather than stack: a peer nudging a slider republishes the
        // same wall, and without this every edit would leave another copy of
        // it standing in the room.
        removePeerCollider(key);
        // isProcessingRemoteEvent keeps addCollisionLayer's publish hook from
        // bouncing this straight back to the sender.
        const wasRemote = isProcessingRemoteEvent;
        isProcessingRemoteEvent = true;
        let idx = null;
        try {
            idx = cl.addFromDepth(depth, {
                name: meta.name || 'Collision',
                visible: meta.vis !== false,
                threshold: (typeof meta.thr === 'number') ? meta.thr : 128,
                x: (meta.x || 0) * bw, y: (meta.y || 0) * bh,
                scaleX: meta.sx || 1, scaleY: meta.sy || 1, rotation: meta.rot || 0,
                skewX: meta.kx || 0, skewY: meta.ky || 0
            });
        } finally {
            isProcessingRemoteEvent = wasRemote;
        }
        if (idx == null) return;
        const layer = window.layers && window.layers.find(l => l.index === idx);
        if (layer) {
            // Coerced: a raw peer string reaching the compositor would be
            // read as Block anyway (normalizeMode), but the layer panel shows
            // this field, and the strength scales every texel of the wall.
            layer.collisionMode = (meta.mode === 'deflect' || meta.mode === 'slow') ? meta.mode : 'block';
            if (typeof meta.str === 'number' && isFinite(meta.str)) {
                layer.collisionStrength = Math.max(0, Math.min(1, meta.str));
            }
            layer.__peerOwner = ownerId;   // marks it for cleanup when they leave
        }
        peerColliders.set(key, idx);
        if (typeof meta.rev === 'string') peerColliderRevs.set(key, meta.rev);
        // What the room just gave us is the baseline our own edits to this
        // wall are measured against (publishPeerEdit).
        setPeerBaseline(key, idx);
        try { cl.updateObstacleFromLayers(); } catch (_) {}
        if (typeof window.renderLayers === 'function') window.renderLayers();
    });
}

// The layer a peer wall of ours still lives in, or null if it is gone (the
// user deleted it from their own Layers panel).
function peerColliderLayer(key) {
    const idx = peerColliders.get(key);
    if (idx == null || !window.layers) return null;
    const owner = key.slice(0, key.lastIndexOf('|'));
    return window.layers.find(l => l.index === idx && l.__peerOwner === owner) || null;
}

function removePeerCollider(key) {
    const idx = peerColliders.get(key);
    if (idx == null) return;
    // Only if that slot still holds THEIR wall. A user who deleted it by hand
    // freed the index, and the next layer made here may have taken it — a
    // stale entry must never delete someone's own layer.
    const layer = peerColliderLayer(key);
    peerColliders.delete(key);
    peerColliderRevs.delete(key);
    peerColliderBase.delete(key);
    if (!layer) return;
    const wasRemote = isProcessingRemoteEvent;
    isProcessingRemoteEvent = true;
    try {
        if (typeof window.deleteLayer === 'function') window.deleteLayer(idx);
    } catch (_) {} finally {
        isProcessingRemoteEvent = wasRemote;
    }
}

function handleColliderRemove(data) {
    const d = data.data || {};
    if (typeof d.lid !== 'number') return;
    // own: someone took a wall out of the room on their turn. If it is ours,
    // it is switched off here, not deleted; everyone else drops their copy.
    if (typeof d.own === 'string' && d.own) {
        if (d.own === clientId) { switchOffOwnWall(d.lid, data.clientId); return; }
        _peerWallRemovesStaged.delete(d.own + '|' + d.lid);
        removePeerCollider(d.own + '|' + d.lid);
    } else {
        removePeerCollider(data.clientId + '|' + d.lid);
    }
    try { if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers(); } catch (_) {}
}

// Walls belong to the room. Leaving it takes everyone else's with us, or the
// user paints alone against obstacles they never placed and cannot explain.
function dropPeerColliders() {
    for (const key of Array.from(peerColliders.keys())) removePeerCollider(key);
    colliderChunkBuffers.clear();
    try { if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers(); } catch (_) {}
}

// ...and when one PEER leaves, what they brought leaves with them. Until the
// relay said who left (peer-left, 2026-09-15) nothing did: a departed
// painter's walls stayed in everyone's simulation, and because a reconnect
// hands out a new connection id, a painter whose socket blipped republished
// every wall under the new id and the room ended up holding two of each.
function dropPeerAssetsOf(ownerId) {
    if (!ownerId) return;
    const pre = ownerId + '|';
    let any = false;
    for (const key of Array.from(peerColliders.keys())) {
        if (key.indexOf(pre) === 0) { removePeerCollider(key); any = true; }
    }
    for (const key of Array.from(colliderChunkBuffers.keys())) {
        if (key.indexOf(pre) === 0) colliderChunkBuffers.delete(key);
    }
    if (any) {
        try { if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers(); } catch (_) {}
    }
    try {
        const T = window.textOverlays;
        if (T && typeof T.dropPeerLines === 'function') T.dropPeerLines(ownerId);
        if (T && typeof T.dropPeerStamps === 'function') T.dropPeerStamps(ownerId);
    } catch (_) {}
    remoteCursors.delete(ownerId);
    remoteLastPositions.delete(ownerId);
    try { updateRemoteCursors(); } catch (_) {}
}

// Everything the room lent us: peer stamps and peer walls. Called from BOTH
// exit paths — onMultiplayerClose for a dropped socket, and
// disconnectMultiplayer for a deliberate leave. The deliberate one nulls
// partySocket before the close event arrives, so onMultiplayerClose bails out
// of it by design; without this call, leaving a room stranded a stranger's
// wall in the user's simulation with nothing on screen to explain it.
function dropPeerAssets() {
    try {
        if (window.BrushShapes && typeof window.BrushShapes.dropPeers === 'function') {
            window.BrushShapes.dropPeers();
        }
    } catch (_) {}
    shapeChunkBuffers.clear();
    _shapePublished.clear();
    _colliderPublished.clear();
    try { dropPeerColliders(); } catch (_) {}
    // Text: everyone else's lines off the canvas (and out of the wall), their
    // pour bitmaps off the GPU, and our own ledger emptied — the next room
    // has seen none of our lines.
    try {
        const T = window.textOverlays;
        if (T && typeof T.dropPeerLines === 'function') T.dropPeerLines();
        if (T && typeof T.dropPeerStamps === 'function') T.dropPeerStamps();
    } catch (_) {}
    resetTextWire();
}

// ── Editing someone else's wall (2026-09-15) ─────────────────────────────
// "I can't edit and tweak the collider during my turn, then have it persist
// back to the original author" (Gabriel). A peer's wall sits in our Layers
// panel like any collider, and every control on it worked — locally. Now an
// edit to it goes back to its author and on to the room, and the wall stays
// the author's: they own it, it is saved on their machine only, and it
// leaves with them.
//
// Nothing marks a layer edit as one (a slider, a drag, the mask editor, the
// Collision switch all just recomposite), so the check is by comparison: the
// state of our copy as the room last had it is its BASELINE, and the
// per-recomposite publish pass (23 schedulePublishAll → publishCollider)
// compares against it. Transform, strength, mode, visibility and the
// Collision switch ride as one small collider-edit; a changed mask sends the
// wall's coverage again, as a collider-add in the author's name. Out of turn
// the change waits (the baseline stays put), and if the author changes the
// wall first, their version replaces our copy and our tweak with it.
//
// Delete on someone else's wall takes it out of the ROOM; on the author's
// machine it is switched off (Collision OFF), not deleted — a partner must
// never be able to destroy a layer someone saved.
var peerColliderBase = new Map();   // "ownerId|theirIndex" → {props, cov} as the room last had it
var _peerWallRemovesStaged = new Set(); // keys of peer walls deleted out of turn

function colliderPropsOf(layer) {
    const box = document.getElementById('canvas-wrapper') || (window.canvas || {});
    const bw = box.clientWidth || (window.canvas && canvas.width) || 1;
    const bh = box.clientHeight || (window.canvas && canvas.height) || 1;
    return {
        x: +((layer.x || 0) / bw).toFixed(4),
        y: +((layer.y || 0) / bh).toFixed(4),
        sx: +(layer.scaleX || 1).toFixed(4),
        sy: +(layer.scaleY || 1).toFixed(4),
        rot: +(layer.rotation || 0).toFixed(2),
        kx: +(layer.skewX || 0).toFixed(2),
        ky: +(layer.skewY || 0).toFixed(2),
        str: +((typeof layer.collisionStrength === 'number') ? layer.collisionStrength : 0.9).toFixed(3),
        mode: layer.collisionMode || 'block',
        vis: layer.visible !== false,
        on: !!(layer.mask && layer.mask.enabled)
    };
}

// Our copy's state: its props, and the identity of the coverage it collides
// with (coverageOf hands back the same array until the wall's shape really
// changes — see the PNG cache above).
function peerCopyState(idx) {
    const layer = window.layers && window.layers.find(l => l.index === idx);
    if (!layer) return null;
    const props = colliderPropsOf(layer);
    let cov = null;
    if (props.on && window.collisionLayers && typeof window.collisionLayers.coverageOf === 'function') {
        const c = window.collisionLayers.coverageOf(idx);
        if (c && !c.none) cov = c.data;
    }
    return { props: JSON.stringify(props), cov };
}

function setPeerBaseline(key, idx) {
    const st = peerCopyState(idx);
    if (st) peerColliderBase.set(key, st);
}

function peerKeyOfIndex(idx) {
    for (const [k, v] of peerColliders) if (v === idx) return k;
    return null;
}

function splitPeerKey(key) {
    const bar = key.lastIndexOf('|');
    return { own: key.slice(0, bar), lid: +key.slice(bar + 1) };
}

// The publish pass reached one of the room's walls: send what we changed.
function publishPeerEdit(idx) {
    if (!mpSocketOpen() || isProcessingRemoteEvent) return;
    const key = peerKeyOfIndex(idx);
    if (!key) return;
    const base = peerColliderBase.get(key);
    if (!base) return;                       // still being built from the room's copy
    const cur = peerCopyState(idx);
    if (!cur) return;
    const propsChanged = cur.props !== base.props;
    const covChanged = !!cur.cov && cur.cov !== base.cov;
    if (!propsChanged && !covChanged) return;
    if (window.__mpTurnBlocked) { mpStagedHint(); return; }
    const o = splitPeerKey(key);
    if (covChanged) {
        sendPeerCoverage(o.own, o.lid, idx);
    } else {
        partySocket.send(JSON.stringify({
            type: 'collider-edit',
            data: Object.assign({ own: o.own, lid: o.lid }, JSON.parse(cur.props)),
            timestamp: Date.now()
        }));
    }
    peerColliderBase.set(key, cur);
}

// A reshaped wall of someone else's: its coverage again, in the author's
// name (own + their index), through the ordinary chunked collider-add.
function sendPeerCoverage(own, lid, idx) {
    const meta = serializeCollider(idx);
    if (!meta || meta.none) return;
    const rev = colliderRev(meta);
    const total = Math.ceil(meta.png.length / COLLIDER_CHUNK_CHARS) || 1;
    if (total > COLLIDER_MAX_CHUNKS) return;
    for (let i = 0; i < total; i++) {
        const part = meta.png.slice(i * COLLIDER_CHUNK_CHARS, (i + 1) * COLLIDER_CHUNK_CHARS);
        const d = Object.assign({}, meta, { own, lid, rev, seq: i, total, part });
        delete d.png;
        partySocket.send(JSON.stringify({ type: 'collider-add', data: d, timestamp: Date.now() }));
    }
}

// Delete on someone else's wall (deleteLayer → broadcastColliderRemove).
function retractPeerWall(key) {
    peerColliderBase.delete(key);
    peerColliderRevs.delete(key);
    peerColliders.delete(key);
    if (!mpSocketOpen()) return;
    if (window.__mpTurnBlocked) { _peerWallRemovesStaged.add(key); mpStagedHint(); return; }
    const o = splitPeerKey(key);
    partySocket.send(JSON.stringify({ type: 'collider-remove', data: { own: o.own, lid: o.lid }, timestamp: Date.now() }));
}

// Edits to the room's walls made out of turn, now that the brush is ours.
function flushPeerWallEdits() {
    if (!mpSocketOpen() || window.__mpTurnBlocked) return;
    _peerWallRemovesStaged.forEach(function (key) {
        const o = splitPeerKey(key);
        partySocket.send(JSON.stringify({ type: 'collider-remove', data: { own: o.own, lid: o.lid }, timestamp: Date.now() }));
    });
    _peerWallRemovesStaged.clear();
    for (const idx of Array.from(peerColliders.values())) {
        try { publishPeerEdit(idx); } catch (_) {}
    }
}

function sanitizeColliderProps(d) {
    const n = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : dflt;
    return {
        x: n(d.x, -4, 4, 0), y: n(d.y, -4, 4, 0),
        sx: n(d.sx, 0.01, 50, 1), sy: n(d.sy, 0.01, 50, 1),
        rot: n(d.rot, -36000, 36000, 0),
        kx: n(d.kx, -89, 89, 0), ky: n(d.ky, -89, 89, 0),
        str: n(d.str, 0, 1, 0.9),
        mode: (d.mode === 'deflect' || d.mode === 'slow') ? d.mode : 'block',
        vis: d.vis !== false,
        on: d.on !== false
    };
}

function applyColliderProps(layer, p) {
    const box = document.getElementById('canvas-wrapper') || (window.canvas || {});
    const bw = box.clientWidth || (window.canvas && canvas.width) || 1;
    const bh = box.clientHeight || (window.canvas && canvas.height) || 1;
    layer.x = p.x * bw; layer.y = p.y * bh;
    layer.scaleX = p.sx; layer.scaleY = p.sy;
    layer.rotation = p.rot;
    layer.skewX = p.kx; layer.skewY = p.ky;
    layer.collisionStrength = p.str;
    layer.collisionMode = p.mode;
    layer.visible = p.vis;
    if (layer.mask && layer.mask.enabled !== p.on) {
        layer.mask.enabled = p.on;
        layer.__maskDirty = true;   // renderLayers re-applies the film
    }
    const wasRemote = isProcessingRemoteEvent;
    isProcessingRemoteEvent = true;
    try {
        if (typeof window.renderLayers === 'function') window.renderLayers();
        if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
    } finally {
        isProcessingRemoteEvent = wasRemote;
    }
}

// Our own layer, by the index we published it under.
function ownColliderLayer(lid) {
    return (window.layers || []).find(l => l.index === lid && l.isCollision && !l.__peerOwner) || null;
}

// The author learns their wall changed hands for a moment. Once per editor
// per few seconds — a slider drag is many edits.
var _wallNoticeAt = new Map();
function noticeOwnEdited(editorId, what, name) {
    const now = Date.now();
    if (now - (_wallNoticeAt.get(editorId) || 0) < 4000) return;
    _wallNoticeAt.set(editorId, now);
    if (typeof showTurnToast === 'function') {
        showTurnToast(shortName(editorId) + ' ' + what + (name ? ' “' + name + '”' : ''));
    }
}

function handleColliderEdit(data) {
    const d = data.data || {};
    if (typeof d.own !== 'string' || !d.own || typeof d.lid !== 'number') return;
    const p = sanitizeColliderProps(d);
    if (d.own === clientId) {
        const layer = ownColliderLayer(d.lid);
        if (!layer) return;
        applyColliderProps(layer, p);
        // The room holds this state now (the editor's copy, and everyone
        // else's from the same message), so our ledger says so too — or our
        // own next publish pass would send the same wall straight back.
        const meta = serializeCollider(d.lid);
        if (meta && meta.none) _colliderPublished.delete(d.lid);
        else if (meta) _colliderPublished.set(d.lid, colliderRev(meta));
        noticeOwnEdited(data.clientId, p.on ? 'edited your wall' : 'switched off your wall',
            String(layer.title || '').replace(/^\s*🧱\s*/, ''));
        return;
    }
    const key = d.own + '|' + d.lid;
    const layer = peerColliderLayer(key);
    if (!layer) return;
    applyColliderProps(layer, p);
    setPeerBaseline(key, layer.index);
}

// A partner took one of OUR walls out of the room: switched off here, kept.
function switchOffOwnWall(lid, editorId) {
    const layer = ownColliderLayer(lid);
    if (!layer || !layer.mask) return;
    _colliderPublished.delete(lid);        // the room holds none of it now
    if (!layer.mask.enabled) return;
    const p = sanitizeColliderProps(colliderPropsOf(layer));
    p.on = false;
    applyColliderProps(layer, p);
    noticeOwnEdited(editorId, 'switched off your wall', String(layer.title || '').replace(/^\s*🧱\s*/, ''));
}

// down=true marks a stroke-opening press stamp so the receiver starts a fresh
// segment instead of interpolating from the previous stroke's end.
function broadcastSplat(x, y, dx, dy, color, mult, radius, down) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    const now = Date.now();
    if (broadcastSplat.lastSent && now - broadcastSplat.lastSent < 33) {
        return;
    }

    // 2.3 brush-size sync: broadcast the EFFECTIVE painted radius (splat-in
    // ramp / pressure), not the base config value the callers pass — the paint
    // path publishes it to __lastPaintRadius. Peers then see the size you
    // actually painted, matching the recording/replay fix.
    const effRadius = (typeof window.__lastPaintRadius === 'number' && window.__lastPaintRadius > 0)
        ? window.__lastPaintRadius : radius;

    // Publishes the stamp bitmap first if the room has not seen it (see
    // brushWireFields) — so this press stamp's `shape` id always resolves.
    const brush = brushWireFields();

    partySocket.send(JSON.stringify({
        type: 'splat',
        // sym (2026-08-16 fidelity audit): the painter's symmetry layout
        // decides WHERE the arms land; without it peers applied dabs under
        // their OWN mode and the paint landed elsewhere. Additive field —
        // old receivers ignore it.
        data: Object.assign({ x, y, dx, dy, color, mult, radius: effRadius,
                sym: (window.config && window.config.SYMMETRY_MODE) || 'radial',
                down: !!down }, brush),
        timestamp: now
    }));
    broadcastSplat.lastSent = now;
}

// 1.3 parity fix: broadcast the ACTUAL BrushEngine dab train instead of one
// sampled splat per 33ms. The old path made the peer reconstruct a stroke it
// never saw: it gap-filled positions and divided ONE message's velocity across
// them (stepDx = canvasDx/(steps+1)). Total momentum matched, but vorticity is
// nonlinear in the velocity gradient — many weak impulses curl far less than
// the few strong ones the painter actually applied, so the painter saw
// filaments and the peer saw a diffuse blob.
//
// Two invariants make the peer's simulation identical to the painter's:
//   * position rides normalized (canvases differ in size, the artwork doesn't)
//   * velocity rides ABSOLUTE and is applied verbatim — splat() injects dx
//     straight into the velocity field (05i:122), and that field lives on the
//     sim grid, which is derived from base resolution + aspect, NOT from canvas
//     pixels. Rescaling by the receiver's width (the old dx * canvas.width) was
//     what made window size change the physics.
//
// Dabs accumulate and flush on a timer — batched, never dropped, so no sample
// is lost the way the old 33ms throttle lost them.
var _dabQueue = [];
var _dabQueueT0 = 0;     // Date.now() of the first dab in the pending batch
var _dabFlushAt = 0;
var DAB_FLUSH_MS = 33;
var DAB_MAX_PER_MSG = 96; // ~45 bytes/dab quantized — far under the 16KB relay cap
// fp16 guard for an ABSOLUTE dab velocity on receive (see the dab loop in
// handleRemoteSplat): the velocity texture is half-float (max 65504) and the
// splat ADDS to what is there, so this is the bound that keeps a forged value
// from turning the field to Inf. Real strokes sit two orders below it.
var DAB_VEL_ABS_MAX = 30000;
// Receive-side jitter buffer: a dab plays this long after the fastest transit
// seen for its stream, so ordinary network jitter never bunches dabs.
var DAB_PACE_JITTER_MS = 50;

// One dab on the wire: [x, y, dx, dy, r, share, k, t]
//   x, y   normalized 0..1 (canvases differ in size, the artwork does not)
//   dx, dy ABSOLUTE (pointer px × 10 — injected verbatim, see the note above)
//   r      normalized radius (the ramped one the painter actually used)
//   share  the dye share this dab was painted with — Flow × splat-in ramp ×
//          sampling-density share, through normalizePaintFlow, so a peer lays
//          it at the same strength in ITS flow model (Gate: convergence weight;
//          additive: colour scale off the message's `base`)   (2026-09-11)
//   k      the dab's sampling-density share on its own (__splatVelK: the swirl
//          push's velocity takes a plain linear share)
//   t      ms since the first dab of this message — the receiver plays the
//          train back at this cadence instead of dumping the batch in a frame
// Elements 5..7 are additive: an older peer indexes the first five.
function queueDab(xNorm, yNorm, dxAbs, dyAbs, radius, share, k) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) return;
    var now = Date.now();
    if (!_dabQueue.length) _dabQueueT0 = now;
    var s = (typeof share === 'number' && isFinite(share)) ? Math.max(0, Math.min(4, share)) : 1;
    var kk = (typeof k === 'number' && isFinite(k) && k > 0) ? Math.min(1, k) : 1;
    _dabQueue.push([
        +xNorm.toFixed(4), +yNorm.toFixed(4),
        +dxAbs.toFixed(3), +dyAbs.toFixed(3),
        +(radius || 0).toFixed(5),
        +s.toFixed(4), +kk.toFixed(3),
        Math.max(0, now - _dabQueueT0)
    ]);
    // Arm count is stamped per message, so a forced flush must carry the real
    // multiplier — hardcoding 1 here collapsed dense strokes to a single arm on
    // every peer. Read the lexical binding, not window.animationMultiplier:
    // 04e-anim-portal assigns the former without mirroring the latter.
    if (_dabQueue.length >= DAB_MAX_PER_MSG) flushDabs(null, currentArmMult(), true);
}

function currentArmMult() {
    return (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
}

function flushDabs(color, mult, force) {
    if (!_dabQueue.length) return;
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        _dabQueue.length = 0;
        return;
    }
    var now = Date.now();
    if (!force && now - _dabFlushAt < DAB_FLUSH_MS) return;
    _dabFlushAt = now;
    var dabs = _dabQueue.splice(0, DAB_MAX_PER_MSG);
    var last = dabs[dabs.length - 1];
    // Footprint for this batch. A stroke paints with one shape, so this rides
    // per MESSAGE like color/mult/sym rather than per dab (~25 bytes, against
    // ~30 bytes for a single dab).
    var brush = brushWireFields();
    // Legacy fields mirror the final dab in the OLD wire units (normalized
    // velocity), so a client running the previous build still renders this
    // stroke through its existing path instead of seeing nothing.
    partySocket.send(JSON.stringify({
        type: 'splat',
        data: Object.assign({
            x: last[0], y: last[1],
            dx: +(last[2] / Math.max(1, canvas.width)).toFixed(5),
            dy: +(last[3] / Math.max(1, canvas.height)).toFixed(5),
            color: color || window.__mpLastDabColor || [1, 0, 0],
            // The UNBAKED colour, beside the baked one an old receiver reads:
            // a peer that understands per-dab shares scales this by each
            // dab's own share instead of painting every dab at the last
            // dab's strength.
            base: (Array.isArray(window.__mpBaseColor) && window.__mpBaseColor.length >= 3)
                ? [+(+window.__mpBaseColor[0]).toFixed(4), +(+window.__mpBaseColor[1]).toFixed(4), +(+window.__mpBaseColor[2]).toFixed(4)]
                : undefined,
            mult: mult || 1,
            radius: last[4] || undefined,
            // Painter's arm layout — see broadcastSplat's sym note.
            sym: (window.config && window.config.SYMMETRY_MODE) || 'radial',
            dabs: dabs
        }, brush),
        timestamp: now
    }));
}

function broadcastCursor(x, y) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    if (!broadcastCursor.lastSent || Date.now() - broadcastCursor.lastSent > 50) {
        partySocket.send(JSON.stringify({
            type: 'cursor',
            data: { x, y },
            timestamp: Date.now()
        }));
        broadcastCursor.lastSent = Date.now();
    }
}

function broadcastPointerUp() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }
    // Push the stroke's tail dabs before the peer is told the stroke ended,
    // or the last sub-flush-interval dabs would be stranded in the queue.
    flushDabs(window.__mpLastDabColor, currentArmMult(), true);

    console.log('[Multiplayer] Broadcasting pointer-up');
    partySocket.send(JSON.stringify({
        type: 'pointer-up',
        timestamp: Date.now()
    }));

    // That was our swirl. In "One swirl each" the turn ends with it — once the
    // stroke has finished landing (see scheduleOneSwirlPass).
    if (isOneSwirlMode() && isMyTurn() && !_oneSwirlSpent) scheduleOneSwirlPass();
}

// Send clear event
function broadcastClear() {
    // isProcessingRemoteEvent: never echo a clear we are applying on behalf of
    // a peer (matches broadcastSplat/broadcastPreset — this one was missing it).
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    partySocket.send(JSON.stringify({
        type: 'clear',
        timestamp: Date.now()
    }));
}

// Send preset change
function broadcastPreset(presetName) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    partySocket.send(JSON.stringify({
        type: 'preset',
        data: { preset: presetName },
        timestamp: Date.now()
    }));
}

// ── Inbound paint: queued, budgeted, PACED ───────────────────────────────
// Peer dabs used to be applied synchronously inside the WebSocket message
// handler, which made received paint the one unbudgeted GPU load in the app.
// Measured with 8 clients painting flat out (MP-AUDIT-2026-08-23 §1.1): about
// 19,200 peer dabs/sec arriving at each client, each costing the SENDER's arm
// multiplier in splat passes — roughly 150k draw calls/sec on top of the local
// sim, with no cap, no coalescing to the frame, and no drop policy. The local
// brush has been frame-budgeted this whole time (BRUSH_DAB_BUDGET, drained at
// 05j); this is the other half of that rule.
//
// Messages queue here and drain from the frame loop under a budget of the same
// size, so the room's entire inbound paint costs at most what one local brush
// does, no matter how many peers are painting.
//
// PACING (2026-09-11). A message is ~33 ms of a stroke — two to five of the
// painter's frames — and used to land in ONE frame here: the sim advected
// between the painter's dabs and not between the peer's, so a watcher saw the
// stroke advance in chunks and curl differently ("staggered"). Each dab now
// carries its offset from the first dab of its message (queueDab), and the
// drain plays a message out at that cadence, a run of due dabs per frame,
// behind a small jitter buffer. The painter's brush is pinned around each RUN
// (see handleRemoteSplat), so a message may span frames without re-pinning per
// dab or leaking a peer's footprint into the next message. Old senders carry
// no offsets: their batch is due all at once, exactly the old behaviour.
//
// Kill switch: config.MP_INBOUND_QUEUE = false restores apply-on-arrival.
var _inboundSplats = [];       // [{data, n, idx, base}] — base = local ms at which dab t=0 plays
var _inboundQueuedDabs = 0;    // dabs still to apply across the queue
var _inboundDropped = 0;
// Stream clock: the smallest (local arrival − sender timestamp) seen for the
// current burst of messages. Skew and latency ride in it together, which is
// fine — only the DIFFERENCE between consecutive messages matters — and a
// quiet gap re-baselines it so a new stroke never inherits a stale estimate.
var _paceOffset = null;
var _paceLastArrival = 0;
var PACE_STREAM_GAP_MS = 800;
// Cap in QUEUED DABS rather than messages, since a message is 1 to 96 of them.
// 2000 is half a second of the drain budget: long enough to ride out a burst
// or a slow frame, short enough that a client which simply cannot keep up
// stays close to live instead of playing back an ever-lengthening tape.
var INBOUND_QUEUE_MAX_DABS = 2000;

function inboundDabCount(data) {
    var d = data && data.data;
    if (!d) return 1;
    return (Array.isArray(d.dabs) && d.dabs.length) ? Math.min(d.dabs.length, DAB_MAX_PER_MSG) : 1;
}
function dabTime(d) {
    var t = Array.isArray(d) ? d[7] : undefined;
    return (typeof t === 'number' && isFinite(t) && t >= 0) ? Math.min(t, 5000) : 0;
}

function enqueueRemoteSplat(data) {
    if (window.config && window.config.MP_INBOUND_QUEUE === false) { handleRemoteSplat(data); return; }
    var n = inboundDabCount(data);
    var dabs = data && data.data && data.data.dabs;
    // The message was flushed right after its last dab, so the sender's clock
    // for dab i is (timestamp − span + t_i); shift that onto ours and add the
    // jitter buffer. A message without offsets has span 0 and plays whole.
    var span = (Array.isArray(dabs) && dabs.length) ? dabTime(dabs[Math.min(dabs.length, DAB_MAX_PER_MSG) - 1]) : 0;
    _inboundSplats.push({ data: data, n: n, idx: 0, base: paceBase(data, span) });
    _inboundQueuedDabs += n;
    trimInbound();
}

// Local ms at which element t=0 of this message plays: the sender's clock
// for its last element is the message timestamp, so element i is at
// (timestamp − span + t_i) there — shifted onto ours through the stream
// clock, plus the jitter buffer. Shared by dab trains and text pours, so a
// painter's strokes and pours keep their relative timing here.
function paceBase(data, span) {
    var now = Date.now();
    var ts = (data && typeof data.timestamp === 'number' && isFinite(data.timestamp)) ? data.timestamp : now;
    if (_paceOffset === null || now - _paceLastArrival > PACE_STREAM_GAP_MS) _paceOffset = now - ts;
    else _paceOffset = Math.min(_paceOffset, now - ts);
    _paceLastArrival = now;
    return ts - span + _paceOffset + DAB_PACE_JITTER_MS;
}

// Overflow drops from the FRONT. Dropping paint diverges this canvas from
// the sender's permanently (there is no resync path), so it is a genuine
// loss either way — but dropping the OLDEST keeps the visible stroke head
// moving with the peer's cursor, where dropping the newest would show a
// stroke lagging further behind reality the longer the overload lasts.
function trimInbound() {
    while (_inboundQueuedDabs > INBOUND_QUEUE_MAX_DABS && _inboundSplats.length > 1) {
        var gone = _inboundSplats.shift();
        _inboundQueuedDabs -= (gone.n - gone.idx);
        _inboundDropped++;
    }
}

// Drained once per frame from 05j. Applies every dab whose play time has come,
// oldest first, up to the budget; a message that is not due yet holds the
// queue (nothing behind it can be due before it). Always retires at least one
// due dab so a train larger than the budget can never wedge the queue.
window.__mpDrainInbound = function (budget) {
    if (!_inboundSplats.length) return;
    var now = Date.now();
    var bud = Math.max(1, budget | 0);
    var spent = 0;
    var poured = 0;
    while (_inboundSplats.length && spent < bud) {
        var e = _inboundSplats[0];
        if (e.kind === 'text') {
            // A pour is one dye-sized image pass, so beside the shared budget
            // it keeps the local hold's own ceiling per frame.
            var room = Math.min(bud - spent, TEXT_POURS_PER_FRAME - poured);
            var jt = e.idx;
            while (jt < e.n && (jt - e.idx) < room && e.base + e.pours[jt][3] <= now) jt++;
            if (jt === e.idx) break; // not due yet, or this frame's pours are spent
            applyRemoteTextPours(e, e.idx, jt);
            poured += (jt - e.idx);
            spent += (jt - e.idx);
            _inboundQueuedDabs -= (jt - e.idx);
            e.idx = jt;
            if (e.idx >= e.n) _inboundSplats.shift();
            continue;
        }
        var dabs = e.data && e.data.data && e.data.data.dabs;
        if (!Array.isArray(dabs) || !dabs.length) {
            // Legacy single splat (press stamp, or a peer on the old wire).
            if (e.base > now) break;
            _inboundSplats.shift();
            _inboundQueuedDabs -= (e.n - e.idx);
            spent += 1;
            handleRemoteSplat(e.data);
            continue;
        }
        var j = e.idx;
        while (j < e.n && e.base + dabTime(dabs[j]) <= now && (spent + (j - e.idx)) < bud) j++;
        if (j === e.idx) break; // the head is not due yet
        handleRemoteSplat(e.data, e.idx, j);
        spent += (j - e.idx);
        _inboundQueuedDabs -= (j - e.idx);
        e.idx = j;
        if (e.idx >= e.n) _inboundSplats.shift();
    }
    if (_inboundQueuedDabs < 0) _inboundQueuedDabs = 0;
    if (_inboundDropped && !window.__mpDropWarned) {
        console.warn('[Multiplayer] Inbound paint over budget — dropped ' + _inboundDropped
            + ' message(s) to stay live. config.MP_INBOUND_QUEUE = false disables queueing.');
        window.__mpDropWarned = true;
        setTimeout(function () { window.__mpDropWarned = false; }, 10000);
    }
};

// A clear wipes everything queued paint would have landed on, so pending dabs
// that arrived BEFORE it are discarded rather than painted onto the fresh
// canvas. This is exactly what the old apply-on-arrival path did implicitly:
// those dabs were drawn and then erased a moment later. Net result identical,
// minus the work.
window.__mpFlushInbound = function () {
    _inboundSplats.length = 0;
    _inboundQueuedDabs = 0;
};

// Harness hook (same convention as __getObstacle / __reinitFramebuffers in
// 05c): feed a peer paint message in without a socket, and read what the queue
// is holding. No automated test has ever executed this file's message handling
// — the mp/ probes re-speak the protocol in Node and never load the client —
// so peer-render regressions have been structurally invisible. This is the
// smallest opening that lets a test drive the real receive path.
window.__mpInboundProbe = {
    push: function (msg) { enqueueRemoteSplat(msg); },
    depth: function () { return { messages: _inboundSplats.length, dabs: _inboundQueuedDabs, dropped: _inboundDropped }; },
    reset: function () { window.__mpFlushInbound(); _inboundDropped = 0; _paceOffset = null; }
};

// Peer paint numerics are UNTRUSTED. The relay enforces a 16KB size cap and
// nothing else, so every field below is whatever a modified, buggy, or hostile
// client put on the wire — and a bad value would stall or poison the receiving
// tab rather than just painting something wrong. Sanitize at the boundary,
// once, instead of hoping each downstream consumer range-checks (05g's
// applyMultiSplatWith only floors mult at 1; symmetryTransforms only
// lower-bounds the arm count).
function sanitizeRemoteNum(v, dflt) {
    return (typeof v === 'number' && isFinite(v)) ? v : dflt;
}
// Apply one message's paint — the dab train from index `from` (inclusive) to
// `to` (exclusive), or the whole message when the range is omitted — under
// the SENDER's brush. The drain calls this once per frame per message with a
// growing range, so the pin/restore below runs per run, not per dab.
function handleRemoteSplat(data, from, to) {
    if (typeof splat === 'function') {
        // A message with no payload at all is not a crash: destructuring
        // data.data used to throw straight out of the socket handler, taking
        // the rest of that message's processing with it.
        const _raw = (data && data.data) || {};
        // splat() hands this straight to gl.uniform3fv, which throws on a
        // wrong-length array and would abort the whole message handler — so a
        // peer's colour is coerced to exactly three finite channels, not merely
        // defaulted when absent.
        const color = (Array.isArray(_raw.color) && _raw.color.length >= 3)
            ? [sanitizeRemoteNum(_raw.color[0], 1), sanitizeRemoteNum(_raw.color[1], 0), sanitizeRemoteNum(_raw.color[2], 0)]
            : [1, 0, 0];
        // The unbaked colour a share-aware sender adds beside it (flushDabs).
        const base = (Array.isArray(_raw.base) && _raw.base.length >= 3)
            ? [sanitizeRemoteNum(_raw.base[0], color[0]), sanitizeRemoteNum(_raw.base[1], color[1]), sanitizeRemoteNum(_raw.base[2], color[2])]
            : null;
        // Arm count: the loop bound. A forged mult of 1e6 is one message that
        // hangs every other canvas in the room. Bounded to the Multi-Brush
        // slider's own range (index.html #multiplier, min 1 max 8) — a peer on
        // a future build with more arms then paints with fewer arms here, which
        // is a wrong picture rather than a dead tab.
        const mult = Math.max(1, Math.min(8, Math.round(sanitizeRemoteNum(_raw.mult, 1))));
        // Radius rides the same hard bounds the local brush slider clamps to,
        // so a peer can never splat a dab larger than this build can produce.
        // undefined is meaningful downstream (fall back to local SPLAT_RADIUS),
        // so only a PRESENT-but-bad value is corrected.
        const _rb = (window.ParamRegistry && window.ParamRegistry.CONFIG_BOUNDS
                     && window.ParamRegistry.CONFIG_BOUNDS.SPLAT_RADIUS) || { min: 0.001, max: 0.1 };
        const radius = (typeof _raw.radius === 'number' && isFinite(_raw.radius))
            ? Math.max(_rb.min, Math.min(_rb.max, _raw.radius))
            : undefined;
        // The LEGACY top-level fields: position normalized 0..1, velocity a
        // normalized delta (the old wire). A dab off-canvas is harmless (the
        // scissor rect just clips it away), but a non-finite one poisons the
        // velocity field with NaN for the rest of the session, and an enormous
        // delta blows it into fp16 static. Clamp position generously and this
        // velocity to one canvas per message.
        const x = Math.max(-1, Math.min(2, sanitizeRemoteNum(_raw.x, 0.5)));
        const y = Math.max(-1, Math.min(2, sanitizeRemoteNum(_raw.y, 0.5)));
        const dx = Math.max(-1, Math.min(1, sanitizeRemoteNum(_raw.dx, 0)));
        const dy = Math.max(-1, Math.min(1, sanitizeRemoteNum(_raw.dy, 0)));
        const canvasX = x * canvas.width;
        const canvasY = y * canvas.height;
        const canvasDx = dx * canvas.width;
        const canvasDy = dy * canvas.height;
        const normalizedRadius = radius;

        if (!handleRemoteSplat._logged) {
            console.log('[Multiplayer] Remote splat settings:', { mult, radius, normalizedRadius, localMult: window.animationMultiplier, localRadius: window.config?.SPLAT_RADIUS });
            handleRemoteSplat._logged = true;
            setTimeout(() => { handleRemoteSplat._logged = false; }, 5000);
        }

        isProcessingRemoteEvent = true;
        // ── Footprint: paint these dabs with the brush the SENDER used ──
        // Historically this was a flat "suppress custom stamps" (the bitmap
        // could not ride the wire), which left peers printing the viewer's own
        // tip. Now the sender publishes the stamp and names it per message, so
        // pin their footprint for the dab loop and restore it after — the same
        // pin-then-restore processReplay uses for recorded strokes (05d).
        //
        // __remoteStroke still guards the fallback: a shape we have NOT got
        // (definition still in flight, or dropped) suppresses stamps entirely
        // rather than printing the stroke in whatever shape this client has
        // selected. Peer dabs are never held waiting for an upload — a pinned
        // peer id is not in the local library, so stampPending() has nothing
        // to wait for and the dab falls through to the built-in tip.
        const _rd = data.data || {};
        let _pinShape = false, _pinTip = false, _pinAng = false, _pinPush = false;
        let _shapePrev, _tipPrev, _angPrev, _pushPrev;
        if (window.config) {
            if (typeof _rd.shape === 'string' && window.BrushShapes
                && typeof window.BrushShapes.peerReady === 'function'
                && window.BrushShapes.peerReady(_rd.shape)) {
                _pinShape = true;
                _shapePrev = window.config.BRUSH_SHAPE_ID;
                window.config.BRUSH_SHAPE_ID = _rd.shape;
            }
            if (typeof _rd.tip === 'number') {
                _pinTip = true;
                _tipPrev = window.config.BRUSH_TIP;
                window.config.BRUSH_TIP = _rd.tip | 0;
            }
            // Push is pinned UNCONDITIONALLY, unlike tip/shape/angle: those are
            // styling that can safely fall back to the viewer's own, but this
            // decides whether the dab deposits pigment at all. Reading it as
            // "absent means leave mine alone" would repaint a peer's ordinary
            // stroke as a silent push whenever this client sat in Push mode.
            _pinPush = true;
            _pushPrev = [window.config.BRUSH_VELOCITY_ONLY,
                         window.config.BRUSH_VEL_MODE,
                         window.config.BRUSH_VEL_STRENGTH,
                         window.__armPushPin,
                         window.__strokeMirrorPin];
            // Per-stroke mirror: unconditional and range-checked, exactly like
            // the arm mask beside it. Absence means "the sender did not mirror
            // this stroke", never "keep mine" — otherwise a peer's plain stroke
            // would fold in half whenever this client held a mirror-bound
            // button. Out-of-range collapses to 0 rather than reaching the
            // arm-transform builder.
            var _mirIn = (typeof _rd.mir === 'number' && isFinite(_rd.mir)) ? (_rd.mir | 0) : 0;
            window.__strokeMirrorPin = (_mirIn >= 1 && _mirIn <= 3) ? _mirIn : 0;
            // Same unconditional rule for the per-arm mask, and range-checked:
            // an arm index past the painter's count is harmless (no transform
            // carries it), but a non-integer would poison the bit test.
            window.__armPushPin = (typeof _rd.ap === 'number' && isFinite(_rd.ap))
                ? (Math.abs(_rd.ap) | 0) : 0;
            window.config.BRUSH_VELOCITY_ONLY = (typeof _rd.push === 'string');
            if (typeof _rd.push === 'string') {
                // Coerced against the known set — the mode is a raw peer string,
                // and splat() treats an unknown one as 'smudge', which for a
                // stationary hose means a dab that does nothing at all.
                window.config.BRUSH_VEL_MODE =
                    (_rd.push === 'spread' || _rd.push === 'gather' || _rd.push === 'swirl')
                        ? _rd.push : 'smudge';
                // Range-checked here as well as in splat()'s clamp, so a garbage
                // value never reaches config and gets re-persisted by the mirror.
                window.config.BRUSH_VEL_STRENGTH =
                    (typeof _rd.pushS === 'number' && isFinite(_rd.pushS))
                        ? Math.max(0, Math.min(5, _rd.pushS)) : 1;
            }
            if (typeof _rd.angle === 'number' && isFinite(_rd.angle)) {
                _pinAng = true;
                _angPrev = window.config.BRUSH_ANGLE;
                window.config.BRUSH_ANGLE = _rd.angle;
            }
        }
        window.__remoteStroke = !_pinShape;
        // Apply the SENDER's symmetry layout when the message carries it
        // (2026-08-16 fidelity audit: a mirrorX painter measured as radial on
        // the peer — the arms are positions, not styling). Unknown strings
        // old senders omit the field and keep the viewer's own mode, as before.
        // The value is COERCED through the registry before it touches config: a
        // peer on a cached bundle can still send a retired mode ('spiral'), and
        // writing that raw let the 2s mirror poll re-persist and re-broadcast it
        // — the same way a retired arm-colour mode came back from the dead once.
        var _symPrev = null;
        if (data.data && typeof data.data.sym === 'string' && window.config) {
            var _sym = data.data.sym;
            try {
                if (window.ParamRegistry && window.ParamRegistry.coerceSelect) {
                    _sym = window.ParamRegistry.coerceSelect('symmetryMode', _sym) || 'radial';
                }
            } catch (_) {}
            if (_sym !== window.config.SYMMETRY_MODE) {
                _symPrev = window.config.SYMMETRY_MODE;
                window.config.SYMMETRY_MODE = _sym;
            }
        }
        try {
            // 1.3 parity path: the sender's real dab train. Each dab is applied
            // with ITS OWN full velocity, verbatim — no gap-fill invention and
            // no dividing one message's momentum across guessed positions. This
            // is what makes the peer's curl match the painter's.
            const dabs = _raw.dabs;
            if (Array.isArray(dabs) && dabs.length) {
                // Each dab carries its own [x, y, dx, dy, r, share, k, t], so the
                // top-level sanitize above does NOT cover this path — clamp per
                // dab. The train length is capped too: the sender never packs
                // more than DAB_MAX_PER_MSG (96), and while the relay's 16KB
                // limit already bounds a forged train to roughly a few hundred,
                // the loop below is mult GL passes per entry and has no
                // business trusting that arithmetic to stay true.
                const _n = Math.min(dabs.length, DAB_MAX_PER_MSG);
                const _from = (typeof from === 'number') ? Math.max(0, Math.min(_n, from | 0)) : 0;
                const _to = (typeof to === 'number') ? Math.max(_from, Math.min(_n, to | 0)) : _n;
                for (let i = _from; i < _to; i++) {
                    const d = dabs[i];
                    if (!Array.isArray(d)) continue;
                    const px = Math.max(-1, Math.min(2, sanitizeRemoteNum(d[0], 0.5))) * canvas.width;
                    const py = Math.max(-1, Math.min(2, sanitizeRemoteNum(d[1], 0.5))) * canvas.height;
                    // Dab velocities are ABSOLUTE (queueDab: pointer px × 10,
                    // injected verbatim by splat), NOT the normalized deltas of
                    // the legacy fields above. The ±1 clamp those fields need
                    // was, here, a 1/500 momentum cut (2026-08-26 → 2026-09-11):
                    // peers got every dab's dye and almost none of its push, so
                    // strokes landed as dots that never smeared or curled —
                    // measured at 43% of the painter's dye and 0.53 correlation
                    // against their own stroke. This bound only guards fp16.
                    const ddx = Math.max(-DAB_VEL_ABS_MAX, Math.min(DAB_VEL_ABS_MAX, sanitizeRemoteNum(d[2], 0)));
                    const ddy = Math.max(-DAB_VEL_ABS_MAX, Math.min(DAB_VEL_ABS_MAX, sanitizeRemoteNum(d[3], 0)));
                    const r = (typeof d[4] === 'number' && isFinite(d[4]) && d[4] > 0)
                        ? Math.max(_rb.min, Math.min(_rb.max, d[4]))
                        : normalizedRadius;
                    // Per-dab shares (see queueDab). Applied in THIS client's flow
                    // model through the same helper the painter used: with the
                    // sender's base colour, applyPaintFlow bakes the share into
                    // the colour (additive) or sets the convergence weight (Gate);
                    // an old sender has no base, so its baked colour is used as
                    // is and only Gate gets the share. __dabShare is the channel
                    // the fixed-colour arms read (05g on the dye-share branch).
                    const fl = (typeof d[5] === 'number' && isFinite(d[5]) && d[5] >= 0 && d[5] <= 4) ? d[5] : 1;
                    const kk = (typeof d[6] === 'number' && isFinite(d[6]) && d[6] > 0 && d[6] <= 1) ? d[6] : 1;
                    let col = color;
                    if (base && typeof window.__applyPaintFlow === 'function') col = window.__applyPaintFlow(base, fl);
                    else if (fl < 1 && window.config && window.config.COLOR_GATE) window.__splatFlow = fl;
                    window.__dabShare = fl;
                    window.__splatVelK = kk;
                    try {
                        if (typeof window.applyMultiSplatWith === 'function') {
                            window.applyMultiSplatWith(px, py, ddx, ddy, col, mult, r);
                        } else {
                            splat(px, py, ddx, ddy, col);
                        }
                    } finally {
                        window.__splatFlow = 1;
                        window.__splatVelK = 1;
                        window.__dabShare = 1;
                    }
                }
                if (_to >= _n) {
                    const lastD = dabs[_n - 1];
                    if (Array.isArray(lastD)) {
                        remoteLastPositions.set(data.clientId, {
                            x: Math.max(-1, Math.min(2, sanitizeRemoteNum(lastD[0], 0.5))) * canvas.width,
                            y: Math.max(-1, Math.min(2, sanitizeRemoteNum(lastD[1], 0.5))) * canvas.height
                        });
                    }
                }
                return;
            }

            // Legacy path — a peer on the previous build, or the press stamp.
            // A press stamp OPENS a stroke, so it must never gap-fill from
            // wherever the last one ended: measured (2026-08-16 audit) as 8
            // phantom dabs painting a straight line from the end of the
            // previous stroke to the start of the next. pointer-up clears the
            // position, but the release TAIL now streams dabs after it and
            // re-seeds it, so the flag is what makes this reliable.
            if (_raw.down) remoteLastPositions.delete(data.clientId);
            const lastPos = remoteLastPositions.get(data.clientId);
            // Gap-fill between network messages at ~12px spacing (matching how
            // densely local mousemove events deposit dabs), splitting the
            // message's velocity across all dabs so total injected momentum
            // equals what the sender's stroke put in. The old loop splatted
            // every 2px (up to 30 dabs) EACH with full velocity — one message
            // injected ~30x the sender's energy and blew the velocity field
            // into fp16 static around remote strokes.
            let steps = 0;
            let distX = 0, distY = 0;
            if (lastPos && lastPos.x !== undefined && lastPos.y !== undefined) {
                distX = canvasX - lastPos.x;
                distY = canvasY - lastPos.y;
                const distance = Math.sqrt(distX * distX + distY * distY);
                if (distance > 12) {
                    steps = Math.min(Math.floor(distance / 12), 8);
                }
            }
            const stepDx = canvasDx / (steps + 1);
            const stepDy = canvasDy / (steps + 1);
            const applyOne = (px, py) => {
                if (typeof window.applyMultiSplatWith === 'function') {
                    window.applyMultiSplatWith(px, py, stepDx, stepDy, color || [1,0,0], mult || 1, normalizedRadius);
                } else {
                    splat(px, py, stepDx, stepDy, color || [1,0,0]);
                }
            };
            for (let i = 1; i <= steps; i++) {
                const t = i / (steps + 1);
                applyOne(lastPos.x + distX * t, lastPos.y + distY * t);
            }
            applyOne(canvasX, canvasY);

            remoteLastPositions.set(data.clientId, { x: canvasX, y: canvasY });
        } finally {
            isProcessingRemoteEvent = false;
            window.__remoteStroke = false;
            if (_symPrev !== null) window.config.SYMMETRY_MODE = _symPrev;
            // Restore on explicit flags, not on "was it null": BRUSH_SHAPE_ID
            // is legitimately null whenever the viewer has no shape selected,
            // and a null-sentinel check would leave the PEER's id active on
            // this client — their shape would quietly become the local brush.
            if (_pinShape) window.config.BRUSH_SHAPE_ID = _shapePrev;
            if (_pinTip) window.config.BRUSH_TIP = _tipPrev;
            if (_pinAng) window.config.BRUSH_ANGLE = _angPrev;
            if (_pinPush) {
                window.config.BRUSH_VELOCITY_ONLY = _pushPrev[0];
                window.config.BRUSH_VEL_MODE = _pushPrev[1];
                window.config.BRUSH_VEL_STRENGTH = _pushPrev[2];
                window.__armPushPin = _pushPrev[3];
                window.__strokeMirrorPin = _pushPrev[4];
            }
        }
    }
}

// Broadcast a full stroke (array of normalized events).
// The party server silently DROPS messages over MAX_MESSAGE_BYTES (16KB,
// party/shared.ts) — which is why replay never reached peers: any decent
// stroke's JSON blows the cap. Quantize the numbers (≈halves the bytes)
// and chunk under the limit; the receiver reassembles by sid/seq (2026-07-13).
const STROKE_CHUNK_EVENTS = 80; // ~90 quantized bytes/event → ~7KB/chunk, wide margin
function broadcastReplayStroke(events) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        return;
    }
    // Publish every stamp this stroke references before the events that name
    // them: a replay can span shapes the painter switched between, and the
    // one selected NOW may not be any of them.
    const shapeIds = [];
    (events || []).forEach(ev => {
        if (typeof ev.shape === 'string' && ev.shape && shapeIds.indexOf(ev.shape) < 0) {
            shapeIds.push(ev.shape);
        }
    });
    const shapeRevs = {};
    shapeIds.forEach(id => { const r = publishShape(id); if (r) shapeRevs[id] = r; });

    const q = (events || []).map(ev => {
        const o = {
            t: Math.round(ev.t || 0),
            x: +(+ev.x || 0).toFixed(4),
            y: +(+ev.y || 0).toFixed(4),
            dx: +(+ev.dx || 0).toFixed(4),
            dy: +(+ev.dy || 0).toFixed(4),
            color: (ev.color || [1, 1, 1]).map(c => +(+c).toFixed(3)),
            mult: ev.mult || 1,
            radius: +(+ev.radius || 0.01).toFixed(5)
        };
        // The footprint the dab was painted with. Dropping these here was why
        // a broadcast replay of a shaped stroke came out gaussian on peers
        // even though the events carried the shape locally (05d).
        if (typeof ev.tip === 'number') o.tip = ev.tip | 0;
        if (ev.shape && shapeRevs[ev.shape]) o.shape = ev.shape;
        // Push dabs deposit no dye — same reason the footprint rides along.
        if (ev.push) o.push = { m: ev.push.m, s: +(+ev.push.s || 1).toFixed(2) };
        // ...and WHICH arms pushed, for a stroke whose brush was painting.
        if (ev.ap) o.ap = ev.ap | 0;
        // Per-stroke mirror (41-button-modes) — where the stroke landed, not
        // how it looked. Dropping it here would send peers half the mark, the
        // same class of gap the footprint fields above close. The receiver's
        // emitReplayDab range-checks the value (05d).
        if (ev.mir) o.mir = ev.mir | 0;
        return o;
    });
    if (q.length <= STROKE_CHUNK_EVENTS) {
        partySocket.send(JSON.stringify({ type: 'stroke', data: { events: q }, timestamp: Date.now() }));
        return;
    }
    const sid = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const total = Math.ceil(q.length / STROKE_CHUNK_EVENTS);
    for (let i = 0; i < total; i++) {
        partySocket.send(JSON.stringify({
            type: 'stroke-chunk',
            data: { sid, seq: i, total, events: q.slice(i * STROKE_CHUNK_EVENTS, (i + 1) * STROKE_CHUNK_EVENTS) },
            timestamp: Date.now()
        }));
    }
}

// Reassembly of chunked stroke replays (see broadcastReplayStroke)
const strokeChunkBuffers = new Map(); // clientId|sid → { chunks, received, total, at }
function handleStrokeChunk(data) {
    const d = data.data || {};
    if (typeof d.seq !== 'number' || typeof d.total !== 'number' || !Array.isArray(d.events)) return;
    if (d.total < 1 || d.total > 64 || d.seq < 0 || d.seq >= d.total) return;
    const key = data.clientId + '|' + d.sid;
    let buf = strokeChunkBuffers.get(key);
    if (!buf) {
        buf = { chunks: new Array(d.total), received: 0, total: d.total, at: Date.now() };
        strokeChunkBuffers.set(key, buf);
    }
    if (!buf.chunks[d.seq]) {
        buf.chunks[d.seq] = d.events;
        buf.received++;
    }
    if (buf.received === buf.total) {
        strokeChunkBuffers.delete(key);
        const all = [].concat.apply([], buf.chunks);
        if (typeof window.scheduleStrokeReplay === 'function') window.scheduleStrokeReplay(all);
    }
    // GC stale partial buffers (peer left mid-stroke)
    const now = Date.now();
    strokeChunkBuffers.forEach((b, k) => { if (now - b.at > 15000) strokeChunkBuffers.delete(k); });
}

// ── Text over the wire (2026-09-15) ──────────────────────────────────────
// "People have to be able to send their dye and colliders" (Gabriel): text
// was the one mark that never left the machine it was made on. Nothing a
// line did — standing on the canvas, walling the fluid off, pouring into it
// — reached anyone else in the room. Text is two things there, and both
// travel now:
//   * LINES (text-line / text-line-remove): each visible line's look plus
//     where it stands. 23-text-overlays sets it in type on every receiving
//     canvas, and a collider line is a wall there too. A few hundred bytes a
//     line; an edit re-sends only the lines whose rev changed.
//   * POURS (text-pour): a line poured into the dye — Fluidize, a hotkey's
//     strike, each pour of a held key's flow. They ride like dabs: the look
//     once per message and [x, y, amount, t] per pour, played back at the
//     painter's cadence through the same paced queue as the dab train.
// Positions are fractions of the painter's CANVAS and type is in their CSS
// px beside their canvas size, so a receiver maps text per axis exactly as it
// maps strokes (see SWIRL TOGETHER in 23-text-overlays).
//
// Turns gate both like paint (TURN_HOLDER_ONLY on the relay). A watcher's
// line edits are STAGED — they show on their own canvas and go out when the
// brush reaches them (flushStagedWork, 06c); a watcher's pours are refused,
// like a stroke out of turn (23 asks __mpTurnBlocked before it pours).
var TEXT_LINE_THROTTLE_MS = 120;  // typing sends at most ~8 line updates a second
var TEXT_POUR_FLUSH_MS = 33;      // the dab train's cadence
var TEXT_POUR_MAX_PER_MSG = 48;   // a held key pours up to ~125/s; ~30 bytes a pour
var TEXT_POURS_PER_FRAME = 8;     // receive ceiling per frame = 23's HOLD_POURS_PER_FRAME
var TEXT_LINE_MAX_BYTES = 15500;  // under the relay's 16KB cap (shared.ts MAX_MESSAGE_BYTES)
var _textLineSent = new Map();    // our overlay id → rev the room holds
var _textLineTimer = null;
var _textLineLastAt = 0;
var _textPourQ = null;            // { key, look, cw, ch, pours: [[x,y,a,t]…], t0, last }
var _textPourTimer = null;

function mpSocketOpen() {
    return isMultiplayerEnabled && !!partySocket && partySocket.readyState === WebSocket.OPEN;
}

// A fresh socket is a fresh audience (and leaving takes our queue with us).
function resetTextWire() {
    _textLineSent.clear();
    if (_textLineTimer) { clearTimeout(_textLineTimer); _textLineTimer = null; }
    _textPourQ = null;
    if (_textPourTimer) { clearTimeout(_textPourTimer); _textPourTimer = null; }
    // Edits to another room's lines and walls mean nothing in the next one.
    _roomEdits.clear();
    if (_roomEditTimer) { clearTimeout(_roomEditTimer); _roomEditTimer = null; }
    _peerWallRemovesStaged.clear();
    peerColliderBase.clear();
}

// FNV-1a of the line as sent — any field changing is a new rev.
function textLineRev(line) {
    var s = JSON.stringify(line);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36) + '.' + s.length.toString(36);
}

// 23 calls this (window.__mpTextChanged) on every change to our lines and on
// layout changes. Throttled, not debounced: a peer watches the words appear
// as they are typed, not only when the typist pauses.
function scheduleTextLines() {
    if (!mpSocketOpen() || _textLineTimer) return;
    var wait = Math.max(0, TEXT_LINE_THROTTLE_MS - (Date.now() - _textLineLastAt));
    _textLineTimer = setTimeout(function () {
        _textLineTimer = null;
        publishTextLines(false);
    }, wait);
}

// Bring the room's copy of our lines up to date: every line whose rev moved
// (every line, when forced), then a removal for each line it holds that is
// no longer here or no longer visible.
function publishTextLines(force) {
    if (_textLineTimer) { clearTimeout(_textLineTimer); _textLineTimer = null; }
    if (!mpSocketOpen()) return;
    var T = window.textOverlays;
    if (!T || typeof T.wireLines !== 'function') return;
    var lines = T.wireLines();
    if (!lines) return; // no layout to measure yet — say nothing, rather than "all gone"
    var i, id, rev;
    if (window.__mpTurnBlocked) {
        // Staged. Only say so when something really differs from what the
        // room holds — selecting a line is a change event too.
        var differs = false;
        var here = new Set();
        for (i = 0; i < lines.length; i++) {
            here.add(lines[i].id);
            if (_textLineSent.get(lines[i].id) !== textLineRev(lines[i].line)) differs = true;
        }
        _textLineSent.forEach(function (_, sentId) { if (!here.has(sentId)) differs = true; });
        if (differs) mpStagedHint();
        return;
    }
    _textLineLastAt = Date.now();
    var seen = new Set();
    for (i = 0; i < lines.length; i++) {
        id = lines[i].id;
        seen.add(id);
        rev = textLineRev(lines[i].line);
        if (!force && _textLineSent.get(id) === rev) continue;
        var msg = JSON.stringify({ type: 'text-line', data: Object.assign({ id: id, rev: rev }, lines[i].line), timestamp: Date.now() });
        // A line is capped at 2,000 characters (23), which fits even in
        // four-byte script — this is the belt for whatever grows next.
        if (msg.length * 3 > TEXT_LINE_MAX_BYTES && new TextEncoder().encode(msg).length > TEXT_LINE_MAX_BYTES) {
            console.warn('[Multiplayer] Text line too large to share — kept local');
            continue;
        }
        partySocket.send(msg);
        _textLineSent.set(id, rev);
    }
    Array.from(_textLineSent.keys()).forEach(function (sentId) {
        if (seen.has(sentId)) return;
        partySocket.send(JSON.stringify({ type: 'text-line-remove', data: { id: sentId }, timestamp: Date.now() }));
        _textLineSent.delete(sentId);
    });
}

// 23 calls this (window.__mpTextPour) for every pour it lays. Batched per
// line like the dab train; a different line (or a canvas resize) flushes.
function queueTextPour(look, cw, ch, nx, ny, amount) {
    if (!mpSocketOpen() || isProcessingRemoteEvent) return;
    if (window.__mpTurnBlocked) return; // 23 refused it first; this is the belt
    // Fluidize hides its line two frames before it pours. That removal has
    // to reach the room FIRST: a receiver still holding the line's wall (a
    // collider line) would refuse the dye inside it (05i image splat), and
    // the pour would land as its own outline.
    if (_textLineTimer) publishTextLines(false);
    if (!(cw > 0 && ch > 0) || !isFinite(nx) || !isFinite(ny)) return;
    var key = JSON.stringify(look) + '|' + cw + 'x' + ch;
    if (_textPourQ && _textPourQ.key !== key) flushTextPours();
    var now = Date.now();
    if (!_textPourQ) _textPourQ = { key: key, look: look, cw: cw, ch: ch, pours: [], t0: now, last: now };
    var a = (typeof amount === 'number' && isFinite(amount)) ? Math.max(0, Math.min(1, amount)) : 1;
    _textPourQ.pours.push([+nx.toFixed(4), +ny.toFixed(4), +a.toFixed(4), now - _textPourQ.t0]);
    _textPourQ.last = now;
    if (_textPourQ.pours.length >= TEXT_POUR_MAX_PER_MSG || now - _textPourQ.t0 >= TEXT_POUR_FLUSH_MS) {
        flushTextPours();
    } else if (!_textPourTimer) {
        _textPourTimer = setTimeout(flushTextPours, TEXT_POUR_FLUSH_MS);
    }
}

function flushTextPours() {
    if (_textPourTimer) { clearTimeout(_textPourTimer); _textPourTimer = null; }
    var q = _textPourQ;
    _textPourQ = null;
    // No turn check here: these pours are already on this canvas (23 only
    // pours when the gate is open), and a call that was just spent still
    // holds the brush on the relay until its pass goes out — the same window
    // the stroke's tail dabs ride out in.
    if (!q || !q.pours.length || !mpSocketOpen()) return;
    partySocket.send(JSON.stringify({
        type: 'text-pour',
        data: { look: q.look, cw: q.cw, ch: q.ch, pours: q.pours },
        // Stamped with its LAST pour, not the flush: the receiver paces from
        // "timestamp = the last element" exactly as it does a dab train, so a
        // timer flush a few ms later must not push the pours late.
        timestamp: q.last
    }));
}

function pourTime(p) {
    var t = Array.isArray(p) ? p[3] : undefined;
    return (typeof t === 'number' && isFinite(t) && t >= 0) ? Math.min(t, 5000) : 0;
}

// A peer's pours: sanitized here (numbers) and in 23 (the look), then
// queued behind their dabs so strokes and pours keep their order and timing.
function enqueueRemoteTextPour(data) {
    var d = data && data.data;
    if (!d || !Array.isArray(d.pours) || !d.pours.length || !d.look || typeof d.look !== 'object') return;
    var cw = sanitizeRemoteNum(d.cw, 0), ch = sanitizeRemoteNum(d.ch, 0);
    if (!(cw >= 20 && cw <= 20000 && ch >= 20 && ch <= 20000)) return;
    var pours = [];
    for (var i = 0; i < d.pours.length && pours.length < TEXT_POUR_MAX_PER_MSG; i++) {
        var p = d.pours[i];
        if (!Array.isArray(p)) continue;
        pours.push([
            Math.max(-1, Math.min(2, sanitizeRemoteNum(p[0], 0.5))),
            Math.max(-1, Math.min(2, sanitizeRemoteNum(p[1], 0.5))),
            Math.max(0, Math.min(1, sanitizeRemoteNum(p[2], 1))),
            pourTime(p)
        ]);
    }
    if (!pours.length) return;
    var e = { kind: 'text', owner: data.clientId, look: d.look, cw: cw, ch: ch, pours: pours, n: pours.length, idx: 0, base: 0 };
    if (window.config && window.config.MP_INBOUND_QUEUE === false) { applyRemoteTextPours(e, 0, e.n); return; }
    e.base = paceBase(data, pours[pours.length - 1][3]);
    _inboundSplats.push(e);
    _inboundQueuedDabs += e.n;
    trimInbound();
}

function applyRemoteTextPours(e, from, to) {
    var T = window.textOverlays;
    if (!T || typeof T.peerPour !== 'function') return;
    try { T.peerPour(e.owner, e.look, e.cw, e.ch, e.pours.slice(from, to)); }
    catch (err) { console.warn('[Multiplayer] Text pour from a peer failed', err); }
}

function handleTextLine(data) {
    var d = data && data.data;
    var T = window.textOverlays;
    if (!d || !T || typeof T.putPeerLine !== 'function') return;
    if (typeof d.id !== 'number' && typeof d.id !== 'string') return;
    // own: an edit someone made on their turn to a line that is not theirs.
    if (typeof d.own === 'string' && d.own) {
        if (d.own === clientId) { applyOwnLineEdit(data.clientId, d); return; }
        T.putPeerLine(d.own, String(d.id), d);
        return;
    }
    T.putPeerLine(data.clientId, String(d.id), d);
}

function handleTextLineRemove(data) {
    var d = data && data.data;
    var T = window.textOverlays;
    if (!d || !T || typeof T.removePeerLine !== 'function') return;
    if (typeof d.id !== 'number' && typeof d.id !== 'string') return;
    if (typeof d.own === 'string' && d.own) {
        if (d.own === clientId) {
            // One of OUR lines, taken out of the room: hidden here, kept.
            var ownId = ownLineId(d.id);
            if (ownId != null && typeof T.hideOwnLine === 'function' && T.hideOwnLine(ownId)) {
                _textLineSent.delete(ownId);   // the room holds none of it now
                noticeOwnLine(data.clientId, 'hid your text', ownId);
            }
            return;
        }
        T.removePeerLine(d.own, String(d.id));
        return;
    }
    T.removePeerLine(data.clientId, String(d.id));
}

// Our lines have numeric ids; a partner echoes the id back as a string.
function ownLineId(v) {
    var n = (typeof v === 'number') ? v : parseInt(v, 10);
    return (isFinite(n) && String(n) === String(v)) ? n : null;
}

// A partner edited one of OUR lines on their turn.
function applyOwnLineEdit(editorId, d) {
    var T = window.textOverlays;
    var ownId = ownLineId(d.id);
    if (ownId == null || !T || typeof T.applyRoomEdit !== 'function') return;
    var wire = T.applyRoomEdit(ownId, d);
    if (!wire) return;
    // The room holds this version now (the editor's, from the same message
    // everyone else got) — record it, or our next publish pass would send
    // the same line straight back and, out of turn, call it staged.
    _textLineSent.set(ownId, textLineRev(wire));
    noticeOwnLine(editorId, 'edited your text', ownId);
}

var _lineNoticeAt = new Map();
function noticeOwnLine(editorId, what, ownId) {
    var now = Date.now();
    if (now - (_lineNoticeAt.get(editorId) || 0) < 4000) return;
    _lineNoticeAt.set(editorId, now);
    var T = window.textOverlays, ov = T && T.get ? T.get(ownId) : null;
    var first = ov ? String(ov.content || '').split('\n')[0].trim() : '';
    if (first.length > 24) first = first.slice(0, 23) + '…';
    if (typeof showTurnToast === 'function') {
        showTurnToast(shortName(editorId) + ' ' + what + (first ? ' “' + first + '”' : ''));
    }
}

// ── Our edits to the room's lines (23 updateRoomLine / removeRoomLine) ──
// Sent in the author's name (own) with the whole line as it now stands,
// throttled per line like our own. Out of turn they wait here, and the
// room's version of a line arriving first settles them (__mpRoomLineSettled
// — the author's change wins over a tweak that never went out).
var _roomEdits = new Map();        // key → {own, id, line, hide}
var _roomEditTimer = null;
var _roomEditLastAt = 0;

window.__mpRoomLineEdit = function (own, id, key, line) {
    if (!mpSocketOpen()) return;
    _roomEdits.set(key, { own: own, id: id, line: line, hide: false });
    if (window.__mpTurnBlocked) { mpStagedHint(); return; }
    scheduleRoomEdits();
};

window.__mpRoomLineHide = function (own, id, key) {
    if (!mpSocketOpen()) return;
    _roomEdits.set(key, { own: own, id: id, line: null, hide: true });
    if (window.__mpTurnBlocked) { mpStagedHint(); return; }
    flushRoomEdits();                   // at once: a Fluidize pour follows it
};

window.__mpRoomLineSettled = function (key) {
    _roomEdits.delete(key);
};

function scheduleRoomEdits() {
    if (_roomEditTimer) return;
    var wait = Math.max(0, TEXT_LINE_THROTTLE_MS - (Date.now() - _roomEditLastAt));
    _roomEditTimer = setTimeout(function () { _roomEditTimer = null; flushRoomEdits(); }, wait);
}

function flushRoomEdits() {
    if (_roomEditTimer) { clearTimeout(_roomEditTimer); _roomEditTimer = null; }
    if (!mpSocketOpen() || window.__mpTurnBlocked || !_roomEdits.size) return;
    _roomEditLastAt = Date.now();
    _roomEdits.forEach(function (e) {
        if (e.hide) {
            partySocket.send(JSON.stringify({ type: 'text-line-remove', data: { own: e.own, id: e.id }, timestamp: Date.now() }));
        } else if (e.line) {
            partySocket.send(JSON.stringify({
                type: 'text-line',
                data: Object.assign({ own: e.own, id: e.id, rev: textLineRev(e.line) }, e.line),
                timestamp: Date.now()
            }));
        }
    });
    _roomEdits.clear();
}

// The whole of our text and our walls, as the room should hold it. On a
// fresh socket (after the layer system wakes), for a newcomer, and when the
// brush reaches us. Forced: receivers skip what they already hold at that
// rev, so a resend costs bytes and nothing on screen.
function republishOwnContent() {
    try { republishColliders(true); } catch (_) {}
    try { publishTextLines(true); } catch (_) {}
    // ...and what we changed of other people's, if it waited for our turn.
    try { flushPeerWallEdits(); } catch (_) {}
    try { flushRoomEdits(); } catch (_) {}
}
