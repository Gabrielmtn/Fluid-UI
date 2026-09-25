// local-data-helper.js -- shared helper for the three local-data scripts in
// this folder: backup-local-data.bat, restore-local-data.bat and
// first-user-reset.bat. Plain Node, no dependencies.
//
//   node local-data-helper.js verify <src> <dst> <sums|-> <sumsRoot>
//       <src> and <dst> are both folders or both files. Every file under <dst>
//       is SHA256-hashed and compared with its counterpart under <src> (hash
//       and size); files under <src> with no counterpart are reported as
//       missing. Each <dst> hash is appended to <sums> in sha256sum format,
//       paths relative to <sumsRoot>, unless <sums> is "-". Problems go to
//       stderr. The last stdout line is "VERIFY <ok> <bad> <missing>".
//       Exit 0 when nothing is wrong, 2 otherwise.
//
//   node local-data-helper.js bundle <vault-dir> <out.fluidpresets>
//       ONE portable .fluidpresets envelope, the format the app's
//       Settings > Saved Presets > Import button reads (desktop and web),
//       from a Preset Vault folder: one <name>.fluidpreset per preset plus the
//       brush-library.json sidecar (brush presets + custom brush shapes).
//
//   node local-data-helper.js sum <file> <sums> <sumsRoot>
//       Appends <file>'s SHA256 line to <sums>.
//
//   node local-data-helper.js firstuser status   <appdata> <docs>
//   node local-data-helper.js firstuser setaside <appdata> <docs>
//   node local-data-helper.js firstuser again    <appdata> <docs> <backup-root>
//   node local-data-helper.js firstuser undo     <appdata> <docs> <backup-root>
//       First-user mode, see the block comment further down. status ends with
//       one line "MODE NORMAL -", "MODE FIRSTUSER <stamp>" or "MODE MIXED -".
//       Exit 0 on success, 1 when something was refused or failed (a failed
//       step is rolled back first).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function sha256(file) {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    try {
        const buf = Buffer.allocUnsafe(1 << 20);
        let n;
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    } finally { fs.closeSync(fd); }
    return h.digest('hex');
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } }

// Relative paths of every file under dir (recursive, dot-folders included).
function walk(dir, base, out) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, base, out);
        else if (ent.isFile()) out.push(path.relative(base, full));
    }
    return out;
}

// Compare a copy with its source. Returns { ok, bad: [rel], missing: [rel], hashes }.
function compareTrees(src, dst) {
    const res = { ok: 0, bad: [], missing: [], hashes: [] };
    const isTree = fs.statSync(dst).isDirectory();
    const rels = isTree ? walk(dst, dst, []) : [''];
    for (const rel of rels) {
        const d = isTree ? path.join(dst, rel) : dst;
        const s = isTree ? path.join(src, rel) : src;
        const hd = sha256(d), dsize = fs.statSync(d).size;
        let hs = null, ssize = -1;
        try { ssize = fs.statSync(s).size; hs = sha256(s); } catch (_) {}
        if (hs !== null && hs === hd && ssize === dsize) res.ok++;
        else res.bad.push((rel || path.basename(dst)) + (hs === null ? ' (no such source file)' : ''));
        res.hashes.push({ file: d, hash: hd });
    }
    if (isTree) {
        const have = new Set(rels);
        for (const rel of walk(src, src, [])) if (!have.has(rel)) res.missing.push(rel);
    }
    return res;
}

function appendSum(sums, hash, file, root) {
    if (sums === '-') return;
    const rel = path.relative(root, file).split(path.sep).join('/');
    fs.appendFileSync(sums, hash + ' *' + rel + '\r\n');
}

function verifyCmd(src, dst, sums, root) {
    const r = compareTrees(src, dst);
    for (const b of r.bad) console.error('  MISMATCH: ' + b);
    for (const m of r.missing) console.error('  MISSING from copy: ' + m);
    for (const h of r.hashes) appendSum(sums, h.hash, h.file, root);
    console.log('VERIFY ' + r.ok + ' ' + r.bad.length + ' ' + r.missing.length);
    return (r.bad.length || r.missing.length) ? 2 : 0;
}

function presetFiles(vaultDir) {
    try { return fs.readdirSync(vaultDir).filter(fn => !fn.startsWith('.') && fn.endsWith('.fluidpreset')); }
    catch (_) { return []; }
}

// Build the Import bundle. Returns a one-line summary; throws on failure.
function bundle(vaultDir, outFile) {
    const presets = {}; let skipped = 0;
    for (const fn of presetFiles(vaultDir).sort()) {
        try {
            const env = JSON.parse(fs.readFileSync(path.join(vaultDir, fn), 'utf8'));
            if (!env || !env.snapshot) throw new Error('no snapshot');
            presets[env.name || fn.slice(0, -'.fluidpreset'.length)] = env.snapshot;
        } catch (e) { skipped++; console.error('  skipped ' + fn + ': ' + e.message); }
    }
    let lib = null;
    try { lib = JSON.parse(fs.readFileSync(path.join(vaultDir, 'brush-library.json'), 'utf8')); } catch (_) {}
    const env = { format: 'fluid-presets', formatVersion: 1, app: 'Fluid-UI', created: Date.now(),
        source: 'Electron Preset Vault (' + vaultDir + ')', count: Object.keys(presets).length, presets };
    if (lib && Array.isArray(lib.brushPresets) && lib.brushPresets.length) env.brushPresets = lib.brushPresets;
    if (lib && Array.isArray(lib.brushShapes) && lib.brushShapes.length) env.brushShapes = lib.brushShapes;
    fs.writeFileSync(outFile, JSON.stringify(env));
    const back = JSON.parse(fs.readFileSync(outFile, 'utf8'));   // it must re-parse
    return {
        names: Object.keys(back.presets),
        line: back.count + ' presets, ' + (env.brushPresets || []).length + ' brush presets, ' +
            (env.brushShapes || []).length + ' brush shapes, ' + skipped + ' skipped, ' +
            (fs.statSync(outFile).size / 1048576).toFixed(1) + ' MB'
    };
}

// ---------------------------------------------------------------------------
// First-user mode
// ---------------------------------------------------------------------------
// Everything the desktop app keeps per user lives in two kinds of folder:
//   profile  <appdata>\<name>              localStorage (presets, brushes,
//                                          settings, first-run flags),
//                                          photo-safe.json, Chromium caches
//   vault    <docs>\<Title>\Presets        the Preset Vault (js/12b), which
//                                          the app copies INTO localStorage
//                                          at every launch
// setaside renames every one that exists to <name>.before-first-user-<stamp>
// in the same folder: instant, exact, and the app no longer finds it, so the
// next launch is a first launch. again / undo first rename the test session's
// folders to <name>.first-user-test-<stamp2>; undo then renames the originals
// back. Test folders are then moved to <backup-root>\first-user-tests\<stamp2>\
// (a copy that is verified before the original goes). Nothing else is ever
// deleted, and a failed rename is rolled back before anything else happens.
const PROFILES = ['fluid-ui-multiplayer', 'Swirl Together', 'Swirl Together Demo', 'Swirl Together Playtest'];
const VAULT_TITLES = ['Swirl Together', 'A Small Good Thing', 'Fluid Simulation'];
const ASIDE = '.before-first-user-';
const TEST = '.first-user-test-';
const STAMP_RE = /^\d{4}-\d\d-\d\d-\d{6}(-\d+)?$/;

function stampNow() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function readableStamp(st) {
    const m = /^(\d{4}-\d\d-\d\d)-(\d\d)(\d\d)(\d\d)/.exec(st || '');
    return m ? m[1] + ' ' + m[2] + ':' + m[3] + ':' + m[4] : String(st);
}
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// A rename can meet a file that OneDrive, the indexer or an antivirus holds
// for a moment. Retry briefly; never rename onto something that exists.
function renameRetry(from, to) {
    if (fs.existsSync(to)) throw new Error(to + ' already exists');
    for (let i = 0; ; i++) {
        try { fs.renameSync(from, to); return; }
        catch (e) {
            if (i >= 5 || !/^(EPERM|EBUSY|EACCES)$/.test(e.code)) throw e;
            sleepMs(700);
        }
    }
}

// Undo a list of { from, to } renames, newest first. Returns true when all went back.
function rollback(done) {
    let ok = true;
    for (const r of done.slice().reverse()) {
        try { renameRetry(r.to, r.from); }
        catch (e) { ok = false; console.error('   COULD NOT PUT BACK ' + r.to + '  (' + e.message + ')'); }
    }
    return ok;
}

function scan(appdata, docs) {
    const slots = [];
    for (const p of PROFILES) slots.push({ label: 'profile ' + p, parent: appdata, name: p, key: 'profile-' + p, vault: false });
    for (const t of VAULT_TITLES) slots.push({ label: 'vault ' + t + '\\Presets', parent: path.join(docs, t), name: 'Presets', key: 'vault-' + t, vault: true });
    const stamps = new Set();
    for (const s of slots) {
        s.live = isDir(path.join(s.parent, s.name));
        s.aside = {};
        s.tests = [];
        let names = [];
        try { names = fs.readdirSync(s.parent); } catch (_) {}
        for (const n of names) {
            let st = null, kind = null;
            if (n.startsWith(s.name + ASIDE)) { st = n.slice((s.name + ASIDE).length); kind = 'aside'; }
            else if (n.startsWith(s.name + TEST)) { st = n.slice((s.name + TEST).length); kind = 'test'; }
            if (!kind || !STAMP_RE.test(st) || !isDir(path.join(s.parent, n))) continue;
            if (kind === 'aside') { s.aside[st] = n; stamps.add(st); }
            else s.tests.push({ stamp: st, name: n });
        }
    }
    const list = [...stamps].sort();
    return { slots, stamps: list, stamp: list.length === 1 ? list[0] : null,
        mode: list.length === 0 ? 'NORMAL' : (list.length === 1 ? 'FIRSTUSER' : 'MIXED') };
}

function describe(s, dir) {
    if (!s.vault) return s.label;
    const n = presetFiles(dir).length;
    return s.label + ', ' + n + ' preset' + (n === 1 ? '' : 's');
}

function status(appdata, docs) {
    const sc = scan(appdata, docs);
    if (sc.mode === 'NORMAL') {
        const live = sc.slots.filter(s => s.live);
        console.log(' Right now: your own data is live.');
        for (const s of live) console.log('   ' + describe(s, path.join(s.parent, s.name)));
        if (!live.length) console.log('   (no profile and no vault yet: the app starts as a first-time user already)');
    } else if (sc.mode === 'FIRSTUSER') {
        console.log(' Right now: a first-user test is running, started ' + readableStamp(sc.stamp) + '.');
        for (const s of sc.slots) if (s.aside[sc.stamp]) console.log('   your data, set aside:  ' + describe(s, path.join(s.parent, s.aside[sc.stamp])));
        const live = sc.slots.filter(s => s.live);
        for (const s of live) console.log('   test session:          ' + describe(s, path.join(s.parent, s.name)));
        if (!live.length) console.log('   test session:          none yet, the app has not been started since');
    } else {
        console.log(' Right now: UNCLEAR. More than one set of data is set aside:');
        for (const st of sc.stamps) {
            const items = sc.slots.filter(s => s.aside[st]).map(s => s.label);
            console.log('   ' + readableStamp(st) + ':  ' + items.join(', '));
        }
        console.log(' The OLDEST set is your own data. Rename the other set\'s folders away by');
        console.log(' hand, or restore a backup with restore-local-data.bat.');
    }
    const left = [];
    for (const s of sc.slots) for (const t of s.tests) left.push(path.join(s.parent, t.name));
    if (left.length) {
        console.log(' Test folders still waiting to move to the backup folder:');
        for (const l of left) console.log('   ' + l);
    }
    console.log('MODE ' + sc.mode + ' ' + (sc.stamp || '-'));
    return 0;
}

function setAside(appdata, docs) {
    const sc = scan(appdata, docs);
    if (sc.mode !== 'NORMAL') {
        console.error(' ERROR: a first-user test is already running, so nothing was set aside.');
        return 1;
    }
    const todo = sc.slots.filter(s => s.live);
    if (!todo.length) {
        console.log(' Nothing to set aside: no profile and no vault on this PC.');
        console.log(' The app already starts as a first-time user.');
        return 0;
    }
    const stamp = stampNow();
    const done = [];
    for (const s of todo) {
        const from = path.join(s.parent, s.name), to = path.join(s.parent, s.name + ASIDE + stamp);
        const what = describe(s, from);
        try { renameRetry(from, to); }
        catch (e) {
            console.error(' ERROR: could not set aside ' + from);
            console.error('        ' + e.message);
            console.error(rollback(done) ? ' Everything was put back. Nothing was changed.'
                : ' Some folders could not be put back, see above. Run this with /status.');
            return 1;
        }
        done.push({ from, to, what });
    }
    for (const d of done) console.log('   set aside  ' + d.what + '  ->  ' + path.basename(d.to));
    return 0;
}

// Rename every live folder (the test session) to <name>.first-user-test-<stamp2>.
// Returns the renames, or null after rolling them back on failure.
function testAside(sc, stamp2) {
    const done = [];
    for (const s of sc.slots.filter(x => x.live)) {
        const from = path.join(s.parent, s.name), to = path.join(s.parent, s.name + TEST + stamp2);
        try { renameRetry(from, to); }
        catch (e) {
            console.error(' ERROR: could not move the test session\'s ' + from);
            console.error('        ' + e.message);
            console.error(rollback(done) ? ' Everything was put back. Nothing was changed.'
                : ' Some folders could not be put back, see above. Run this with /status.');
            return null;
        }
        done.push({ from, to, slot: s });
    }
    return done;
}

function moveTree(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) throw new Error(dest + ' already exists');
    try { fs.renameSync(src, dest); return; }              // same drive: instant
    catch (e) { if (e.code !== 'EXDEV') throw e; }
    fs.cpSync(src, dest, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
    const r = compareTrees(src, dest);
    if (r.bad.length || r.missing.length) {
        throw new Error('the copy in ' + dest + ' did not verify (' + r.bad.length + ' wrong, ' +
            r.missing.length + ' missing), so ' + src + ' was kept');
    }
    fs.rmSync(src, { recursive: true, maxRetries: 3, retryDelay: 300 });
}

// Move every <name>.first-user-test-* folder to <root>\first-user-tests\<stamp>\.
function relocateTests(appdata, docs, root, startedStamp) {
    const sc = scan(appdata, docs);
    const sessions = {};
    for (const s of sc.slots) for (const t of s.tests) (sessions[t.stamp] = sessions[t.stamp] || []).push({ s, t });
    let allOk = true;
    for (const st of Object.keys(sessions).sort()) {
        let dir = path.join(root, 'first-user-tests', st);
        for (let i = 2; fs.existsSync(dir); i++) dir = path.join(root, 'first-user-tests', st + '-' + i);
        const notes = [];
        let moved = 0;
        for (const { s, t } of sessions[st]) {
            const src = path.join(s.parent, t.name), dest = path.join(dir, s.key);
            try {
                moveTree(src, dest);
                moved++;
                if (s.vault) {
                    // An empty <Title> folder left behind was made by the test.
                    try { if (!fs.readdirSync(s.parent).length) fs.rmdirSync(s.parent); } catch (_) {}
                    const n = presetFiles(dest).length;
                    if (n) {
                        const out = path.join(dir, 'fluid-presets-' + s.key.slice('vault-'.length) + '-ALL.fluidpresets');
                        try {
                            const b = bundle(dest, out);
                            notes.push('Presets saved during the test: ' + b.names.join(', ') + '.');
                            notes.push('To keep them: Settings > Saved Presets > Import > ' + path.basename(out));
                            console.log('   ' + n + ' preset' + (n === 1 ? '' : 's') + ' saved during the test: ' + b.names.join(', '));
                            console.log('   to keep them, Import ' + out);
                        } catch (e) { console.error('   (could not bundle the test presets: ' + e.message + ')'); }
                    }
                }
            } catch (e) {
                allOk = false;
                console.error('   could not move ' + src + ' to the backup folder: ' + e.message);
                console.error('   it stays where it is; the app ignores it. Run this again later to retry.');
            }
        }
        if (moved) {
            const about = [
                'Swirl Together first-user test session.',
                'These folders are what the app held during a first-time-user test,',
                'NOT your own data. It is safe to delete this folder.',
                '',
                (st === startedStamp ? '' : 'Test ended: ' + readableStamp(st)),
                'Layout: profile-<name>\\ = a whole %APPDATA%\\<name> profile, vault-<Title>\\ = <Documents>\\<Title>\\Presets.'
            ].concat(notes.length ? [''].concat(notes) : []).filter((l, i, a) => l !== '' || a[i - 1] !== '');
            try { fs.writeFileSync(path.join(dir, 'ABOUT.txt'), about.join('\r\n') + '\r\n'); } catch (_) {}
            console.log('   test session kept in ' + dir);
        }
    }
    return allOk;
}

function again(appdata, docs, root) {
    const sc = scan(appdata, docs);
    if (sc.mode !== 'FIRSTUSER') {
        console.error(' ERROR: no single first-user test is running (mode ' + sc.mode + '). Nothing was changed.');
        return 1;
    }
    const moved = testAside(sc, stampNow());
    if (moved === null) return 1;
    if (!moved.length) {
        console.log(' The app has not been started since the reset: its next launch is already a first launch.');
    }
    relocateTests(appdata, docs, root, sc.stamp);
    return 0;
}

function undo(appdata, docs, root) {
    const sc = scan(appdata, docs);
    if (sc.mode === 'NORMAL') {
        console.log(' No first-user test is running: your own data is already live. Nothing to do.');
        return 0;
    }
    if (sc.mode === 'MIXED') { status(appdata, docs); return 1; }
    const moved = testAside(sc, stampNow());
    if (moved === null) return 1;
    const back = [];
    for (const s of sc.slots) {
        const asideName = s.aside[sc.stamp];
        if (!asideName) continue;
        const from = path.join(s.parent, asideName), to = path.join(s.parent, s.name);
        try { renameRetry(from, to); }
        catch (e) {
            console.error(' ERROR: could not put back ' + to);
            console.error('        ' + e.message);
            const ok = rollback(back);
            const ok2 = rollback(moved);
            console.error(ok && ok2 ? ' Everything was put back as it was: the test is still running. Nothing was changed.'
                : ' Some folders could not be put back, see above. Run this with /status.');
            return 1;
        }
        back.push({ from, to, what: describe(s, to) });
    }
    for (const b of back) console.log('   put back   ' + b.what);
    relocateTests(appdata, docs, root, sc.stamp);
    return 0;
}

// ---------------------------------------------------------------------------
if (require.main === module) {
    const [, , cmd, ...a] = process.argv;
    let code = null;
    try {
        if (cmd === 'verify' && a.length === 4) code = verifyCmd(a[0], a[1], a[2], a[3]);
        else if (cmd === 'bundle' && a.length === 2) { console.log('  bundle: ' + bundle(a[0], a[1]).line); code = 0; }
        else if (cmd === 'sum' && a.length === 3) { appendSum(a[1], sha256(a[0]), a[0], a[2]); code = 0; }
        else if (cmd === 'firstuser') {
            const [sub, appdata, docs, root] = a;
            if (sub === 'status' && a.length === 3) code = status(appdata, docs);
            else if (sub === 'setaside' && a.length === 3) code = setAside(appdata, docs);
            else if (sub === 'again' && a.length === 4) code = again(appdata, docs, root);
            else if (sub === 'undo' && a.length === 4) code = undo(appdata, docs, root);
        }
    } catch (e) {
        console.error(' helper error: ' + (e && e.stack || e));
        code = 1;
    }
    if (code === null) { console.error('usage: see the header of ' + path.basename(__filename)); code = 1; }
    process.exitCode = code;
}
module.exports = { sha256, compareTrees, bundle, scan };
