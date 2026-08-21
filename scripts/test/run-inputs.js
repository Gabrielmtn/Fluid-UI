// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-inputs.js — hotkey/controls conformance suite.
//
// Drives every binding in scripts/test/inventory/hotkeys.json (written
// by the inventory agents from the ACTUAL handlers in 05n and friends,
// not the F1 sheet) and checks each entry's `assertion` expression
// before/after firing the synthesized event.
//
// An entry passes when its assertion flips the way the inventory says
// it should. Failures come in two flavours:
//   BROKEN   the handler exists but the state did not change
//   MISMATCH the F1 sheet advertises a binding the handlers don't have
//            (these are pre-flagged in the inventory's meta.mismatches —
//            reported here so they stay visible until fixed)
//
// Usage (app running with the debug port):
//   node scripts/test/run-inputs.js
//   node scripts/test/run-inputs.js --only "Space"
//
// The suite runs THAWED (real clock): hotkey handlers are synchronous
// DOM listeners, and several toggle rAF-driven behaviour that is
// awkward mid-freeze. Determinism is not needed here — assertions are
// about discrete state flips, not field contents.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { connect, waitReady } = require('./cdp');

const INV = path.join(__dirname, 'inventory', 'hotkeys.json');

function argv(name, def) {
    const i = process.argv.indexOf('--' + name);
    return i === -1 ? def : process.argv[i + 1];
}

async function main() {
    if (!fs.existsSync(INV)) throw new Error('no inventory/hotkeys.json — run the inventory agents first');
    const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
    const only = argv('only', null);
    const port = parseInt(argv('port', '9333'), 10);

    const page = await connect(port);
    await waitReady(page);
    const inst = await page.evalFile(path.join(__dirname, 'harness.js'));
    if (inst && inst.error) throw new Error('harness: ' + inst.error);

    const bindings = (inv.keyboard || []).filter(b =>
        !only || (b.keys || '').toLowerCase().includes(only.toLowerCase()));

    let pass = 0, fail = 0, skip = 0;
    for (const b of bindings) {
        if (!b.assertion || !b.event) {
            skip++;
            console.log(`~ SKIP ${b.keys}: no ${b.assertion ? 'event' : 'assertion'} in inventory`);
            continue;
        }
        // Each binding runs page-side: capture assertion, fire, recapture.
        // Bindings marked toggle:true fire twice to restore state.
        const r = await page.eval(`
(function(){
    var b = ${JSON.stringify(b)};
    function probe() { try { return String((0, eval)(b.assertion.expr)); } catch (e) { return 'EVAL-ERR: ' + e.message; } }
    var before = probe();
    window.__test.key(b.event);
    var after = probe();
    var restored = null;
    if (b.toggle) { window.__test.key(b.event); restored = probe(); }
    return { before: before, after: after, restored: restored };
})()`, { timeoutMs: 30000 });

        const changed = r.before !== r.after;
        const expected = b.assertion.expect ? (r.after === String(b.assertion.expect)) : changed;
        if (expected) {
            pass++;
            console.log(`✓ ${b.keys} (${r.before} → ${r.after}${r.restored !== null ? ' → ' + r.restored : ''})`);
        } else {
            fail++;
            console.log(`✗ BROKEN ${b.keys}: assertion '${b.assertion.expr}' ${r.before} → ${r.after} (expected ${b.assertion.expect || 'a change'})`);
        }
    }

    for (const m of (inv.meta && inv.meta.mismatches) || []) {
        console.log(`! MISMATCH ${typeof m === 'string' ? m : JSON.stringify(m)}`);
    }

    console.log(`\n${pass} pass, ${fail} broken, ${skip} skipped, ${((inv.meta && inv.meta.mismatches) || []).length} sheet mismatches`);
    page.close();
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
