// ═══════════════════════════════════════════════════════════════════
// scripts/test/gen-shader-inventory.js — build inventory/shaders.json
//
// The pass profiler needs to put a NAME on each GPU pass, and at runtime
// all it can see is a WebGLProgram. The programs are lexical to the 05
// chunks and the Program class never records which source built it, so
// there is nothing to ask.
//
// What IS available at runtime is gl.getAttachedShaders() ->
// gl.getShaderSource(), i.e. the exact text that was compiled. So the
// identification key is derived from the source itself: the set of uniform
// NAMES the template declares.
//
// That set is a SUBSET of what the runtime sees, not an equal. Nine of
// these shaders interpolate shared GLSL chunks — obstacleSolidityGLSL,
// mobilityGLSL, rk2Backtrace, swirlGLSL — and those chunks declare
// uniforms of their own. They are also exactly the hot ones (advection,
// MacCormack, pressure, divergence, gradient, mgResidual), so matching on
// equality dropped 82% of frame time into a single unnamed bucket on the
// first run. The profiler therefore matches by best subset fit: the
// largest declared set that is contained in the program's actual uniforms
// wins.
//
// Two groups still tie on the set alone and get a substring tiebreaker:
//   blurFrag / glowBlurFrag / photoSafeLumaFrag   — all take only uTexture
//   memRefreshFrag / captureFrag                  — all take only uDye
//
// Re-run whenever a shader is added or its uniforms change:
//   node scripts/test/gen-shader-inventory.js
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'inventory', 'shaders.json');
const FILES = ['js/05a-shader-core.js', 'js/05b-shader-sim.js'];

// Substring that appears in exactly one member of its collision group.
const TIEBREAK = {
    blurFrag: '0.29411764',
    glowBlurFrag: 'sum * 0.25',
    photoSafeLumaFrag: '1.0 / 16.0',
    memRefreshFrag: 'max(d.a',
    captureFrag: 'clamp(texture(uDye',
};

function pretty(varName) {
    return varName.replace(/Frag$/, '');
}

const sources = {};
for (const f of FILES) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const re = /const\s+(\w*[Ff]rag\w*)\s*=\s*`(.*?)`/gs;
    let m;
    while ((m = re.exec(text)) !== null) sources[m[1]] = m[2];
}

const bySig = {};
for (const [name, body] of Object.entries(sources)) {
    // `uniform sampler2D uPressure, uDivergence;` declares TWO names, and
    // a regex that captures one identifier per statement silently loses the
    // rest — which weakens exactly the multi-sampler passes worth naming.
    const uniforms = [...new Set(
        [...body.matchAll(/uniform\s+\w+\s+([^;]+);/g)]
            .flatMap(x => x[1].split(','))
            .map(x => x.replace(/\/\/.*$/, '').replace(/\[[^\]]*\]/, '').trim())
            .filter(x => /^\w+$/.test(x))
    )].sort();
    const sig = uniforms.join('|');
    (bySig[sig] = bySig[sig] || []).push(name);
}

const table = {};
let collisions = 0;
for (const [sig, names] of Object.entries(bySig)) {
    if (names.length === 1) {
        table[sig] = { name: pretty(names[0]), uniforms: sig ? sig.split('|') : [] };
    } else {
        collisions++;
        const alts = names.map(n => {
            if (!TIEBREAK[n]) {
                console.error(`  ! no tiebreaker for ${n} (collides with ${names.join(', ')})`);
                process.exitCode = 1;
            }
            return { token: TIEBREAK[n] || null, name: pretty(n) };
        });
        table[sig] = { name: pretty(names[0]), uniforms: sig ? sig.split('|') : [], alts };
    }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
    generated: 'node scripts/test/gen-shader-inventory.js',
    shaders: Object.keys(sources).length,
    collisionGroups: collisions,
    table,
}, null, 2));

console.log(`${Object.keys(sources).length} shaders, ${Object.keys(table).length} signatures, ` +
            `${collisions} collision group(s) → ${path.relative(ROOT, OUT)}`);
