/**
 * Preset Vault — durable, on-disk, non-destructive preset storage (Electron).
 *
 * WHY: user presets used to live ONLY in a single localStorage namespace, so
 * any settingsManager.clear() (or Ctrl+Shift+D nuclear reset) wiped the whole
 * library with no recovery. This module gives every preset its own file on
 * disk, keeps trashed/overwritten versions instead of destroying them, and
 * treats disk as the source of truth that re-seeds localStorage on launch —
 * so a localStorage wipe self-heals.
 *
 * Web build (no filesystem): PresetVault.available === false and every op is a
 * no-op; presets stay in localStorage and durability is via Export/Import.
 *
 * Layout (default Documents/Fluid Simulation/Presets, configurable):
 *   <vault>/<name>.fluidpreset            ← live presets, one file each
 *   <vault>/.history/<name>/<ts>.fluidpreset  ← prior versions on overwrite
 *   <vault>/.trash/<name>-<ts>.fluidpreset    ← deleted presets (recoverable)
 */
(function () {
    'use strict';

    var HISTORY_KEEP = 20;      // versions retained per preset name
    var FILE_EXT = '.fluidpreset';
    var FILE_FORMAT = 'fluidpreset';

    function sanitizeName(name) {
        // Keep spaces (Windows allows them); replace only path-illegal chars.
        return String(name).replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').replace(/\.+$/, '').trim() || 'preset';
    }
    function stamp() {
        // App runtime (not a workflow script) — Date is available.
        return new Date().toISOString().replace(/[:.]/g, '-');
    }

    /**
     * Pure-ish FS layer: everything the vault does to disk, given (fs, path,
     * dir). Kept dependency-injected so it can be unit-tested under Node.
     */
    function createVaultFS(fs, path, dir) {
        var HISTORY = path.join(dir, '.history');
        var TRASH = path.join(dir, '.trash');

        function ensure() {
            [dir, HISTORY, TRASH].forEach(function (d) {
                try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
            });
        }
        function fileFor(name) { return path.join(dir, sanitizeName(name) + FILE_EXT); }

        function list() {
            ensure();
            var out = [];
            var names;
            try { names = fs.readdirSync(dir); } catch (_) { return out; }
            names.forEach(function (fn) {
                if (fn.charAt(0) === '.' || fn.slice(-FILE_EXT.length) !== FILE_EXT) return;
                var fp = path.join(dir, fn);
                try {
                    var st = fs.statSync(fp);
                    if (!st.isFile()) return;
                    var env = JSON.parse(fs.readFileSync(fp, 'utf8'));
                    // authoritative name is the one stored inside the file
                    var name = (env && env.name) || fn.slice(0, -FILE_EXT.length);
                    if (env && env.snapshot) out.push({
                        name: name, snapshot: env.snapshot, brushPresets: env.brushPresets || null,
                        savedAt: env.savedAt || st.mtimeMs, file: fp
                    });
                } catch (e) { /* skip unreadable/corrupt file, don't throw */ }
            });
            return out;
        }

        function pruneHistory(name) {
            var hd = path.join(HISTORY, sanitizeName(name));
            var files;
            try { files = fs.readdirSync(hd).filter(function (f) { return f.slice(-FILE_EXT.length) === FILE_EXT; }); }
            catch (_) { return; }
            if (files.length <= HISTORY_KEEP) return;
            files.sort(); // timestamp-prefixed → lexical == chronological
            files.slice(0, files.length - HISTORY_KEEP).forEach(function (f) {
                try { fs.unlinkSync(path.join(hd, f)); } catch (_) {}
            });
        }

        function save(name, snapshot, brushPresets) {
            ensure();
            var fp = fileFor(name);
            // Overwrite → archive the existing version into .history first.
            if (fs.existsSync(fp)) {
                var hd = path.join(HISTORY, sanitizeName(name));
                try {
                    fs.mkdirSync(hd, { recursive: true });
                    fs.renameSync(fp, path.join(hd, stamp() + FILE_EXT));
                    pruneHistory(name);
                } catch (e) {
                    // If archiving fails, do NOT clobber — bail out so the old file survives.
                    try { if (fs.existsSync(fp)) return false; } catch (_) {}
                }
            }
            var env = { format: FILE_FORMAT, v: 1, name: name, savedAt: Date.now(), snapshot: snapshot };
            if (brushPresets) env.brushPresets = brushPresets;
            try {
                // write to temp then rename → never leave a half-written file
                var tmp = fp + '.tmp';
                fs.writeFileSync(tmp, JSON.stringify(env));
                fs.renameSync(tmp, fp);
                return true;
            } catch (e) { return false; }
        }

        function remove(name) {
            var fp = fileFor(name);
            if (!fs.existsSync(fp)) return false;
            try {
                fs.mkdirSync(TRASH, { recursive: true });
                fs.renameSync(fp, path.join(TRASH, sanitizeName(name) + '-' + stamp() + FILE_EXT));
                return true;
            } catch (e) { return false; }
        }

        function has(name) { try { return fs.existsSync(fileFor(name)); } catch (_) { return false; } }

        function trashList() {
            try {
                return fs.readdirSync(TRASH).filter(function (f) { return f.slice(-FILE_EXT.length) === FILE_EXT; })
                    .map(function (f) { return path.join(TRASH, f); });
            } catch (_) { return []; }
        }

        return { ensure: ensure, list: list, save: save, remove: remove, has: has, trashList: trashList,
                 dir: dir, historyDir: HISTORY, trashDir: TRASH };
    }

    // ── Node unit-test export (only in a pure-Node context, never in a page) ──
    if (typeof window === 'undefined' && typeof module !== 'undefined' && module.exports) {
        module.exports = { createVaultFS: createVaultFS, sanitizeName: sanitizeName };
    }

    // ── Browser / Electron-renderer wiring ─────────────────────────────────
    if (typeof window === 'undefined') return;

    var isElectron = (typeof require !== 'undefined') &&
        (typeof process !== 'undefined' && process.versions && !!process.versions.electron);

    if (!isElectron) {
        // Web build: vault unavailable, everything no-ops. Durability = Export.
        window.PresetVault = {
            available: false, dir: null,
            list: function () { return []; }, save: function () { return false; },
            remove: function () { return false; }, openFolder: function () { return false; },
            syncStartup: function () {}
        };
        return;
    }

    var fs, path, shell, remote, vaultDir, vfs;
    try {
        fs = require('fs');
        path = require('path');
        shell = require('electron').shell;
        remote = require('@electron/remote');
        var configured = null;
        try { configured = window.settingsManager && window.settingsManager.get('presetVault.path'); } catch (_) {}
        vaultDir = configured || path.join(remote.app.getPath('documents'), 'Fluid Simulation', 'Presets');
        vfs = createVaultFS(fs, path, vaultDir);
        vfs.ensure();
    } catch (e) {
        console.warn('[PresetVault] disabled (init failed):', e && e.message);
        window.PresetVault = { available: false, dir: null, list: function () { return []; },
            save: function () { return false; }, remove: function () { return false; },
            openFolder: function () { return false; }, syncStartup: function () {} };
        return;
    }

    // Capture the ORIGINAL Settings preset methods before we wrap them, so the
    // startup restore can write localStorage without recursively re-hitting disk.
    var origSave = (window.Settings && window.Settings.savePreset) ? window.Settings.savePreset.bind(window.Settings) : null;
    var origDelete = (window.Settings && window.Settings.deletePreset) ? window.Settings.deletePreset.bind(window.Settings) : null;

    var Vault = {
        available: true,
        dir: vaultDir,
        list: function () { return vfs.list(); },
        save: function (name, snapshot, brushPresets) { return vfs.save(name, snapshot, brushPresets); },
        remove: function (name) { return vfs.remove(name); },
        has: function (name) { return vfs.has(name); },
        openFolder: function () { try { vfs.ensure(); return shell.openPath(vaultDir); } catch (e) { return false; } },
        setPath: function (newDir) {
            try {
                vaultDir = newDir; vfs = createVaultFS(fs, path, vaultDir); vfs.ensure();
                Vault.dir = vaultDir;
                if (window.settingsManager) window.settingsManager.set('presetVault.path', newDir);
                return true;
            } catch (e) { return false; }
        },
        /**
         * Reconcile disk ⇄ localStorage at launch. Disk wins (it's durable):
         * every preset on disk is pushed into the localStorage mirror so the
         * existing UI shows it — this is what restores presets after a wipe.
         * Any localStorage-only preset is seeded to disk so nothing is one-sided.
         */
        syncStartup: function () {
            if (!origSave) return { restored: 0, seeded: 0 };
            var restored = 0, seeded = 0;
            var disk = vfs.list();
            var diskNames = {};
            disk.forEach(function (p) { diskNames[p.name] = true; });
            var ls = {};
            try { ls = window.Settings.getAllPresets() || {}; } catch (_) {}

            // disk → localStorage mirror (restore). origSave avoids re-writing disk.
            disk.forEach(function (p) {
                try { origSave(p.name, p.snapshot); restored++; } catch (_) {}
                if (p.brushPresets && window.settingsManager) {
                    try { window.settingsManager.set('brush.presets', p.brushPresets); } catch (_) {}
                }
            });
            // localStorage → disk (seed anything not already on disk).
            Object.keys(ls).forEach(function (name) {
                if (!diskNames[name]) { if (vfs.save(name, ls[name])) seeded++; }
            });
            return { restored: restored, seeded: seeded };
        }
    };
    window.PresetVault = Vault;

    // ── Mirror every preset write/delete to the vault, whatever the caller ──
    // Wrap Settings.savePreset/deletePreset so BOTH the sidebar and mixer paths
    // (and any future caller) keep the disk vault in sync automatically.
    if (window.Settings) {
        if (origSave) {
            window.Settings.savePreset = function (name, data) {
                var ok = origSave(name, data);
                if (ok !== false) { try { vfs.save(name, data); } catch (_) {} }
                return ok;
            };
        }
        if (origDelete) {
            window.Settings.deletePreset = function (name) {
                try { vfs.remove(name); } catch (_) {}   // soft-delete to .trash
                return origDelete(name);
            };
        }
    }

    // ── Run startup reconciliation once the app's preset UI is ready ────────
    function runStartupSync() {
        try {
            var res = Vault.syncStartup();
            if (res && (res.restored || res.seeded)) {
                console.log('[PresetVault] synced — restored ' + res.restored + ' from disk, seeded ' + res.seeded + ' to disk. Vault: ' + vaultDir);
            }
            if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
        } catch (e) { console.warn('[PresetVault] startup sync failed:', e && e.message); }
        wireFolderButton();
    }
    function wireFolderButton() {
        var btn = document.getElementById('openPresetsFolderBtn');
        if (btn) {
            btn.style.display = '';
            btn.title = 'Open your presets folder in File Explorer\n' + vaultDir;
            if (!btn._wired) { btn._wired = true; btn.addEventListener('click', function () { Vault.openFolder(); }); }
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(runStartupSync, 0); });
    } else {
        setTimeout(runStartupSync, 0);
    }
})();
