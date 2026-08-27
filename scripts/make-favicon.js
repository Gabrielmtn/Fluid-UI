#!/usr/bin/env node
// Regenerates the browser favicon from assets/boot-cursor.png — the swirl that
// stands in for the mouse cursor while the app boots. Run with Electron (the
// project's own devDependency) because that is the renderer already on hand:
//
//     npx electron scripts/make-favicon.js
//
// Writes assets/favicon.ico, assets/favicon-32.png and assets/apple-touch-icon.png.
// Nothing loads these at runtime except index.html's <link rel="icon"> tags, so
// this only needs re-running if the boot swirl art changes.
//
// Two things the art needs before it can serve as a 16px tab icon:
//   • It has NO fully-opaque pixel (measured: max alpha 250, mean colour
//     rgb(254,47,55)), so on a light tab strip it washes out to a pale smudge.
//     A near-black plate underneath fixes that and matches --ground-950.
//   • Composited once it stays washed out even on the plate, so it is drawn
//     TWICE (alpha compounds to 1-(1-a)²) and scaled to 1.22 so the swirl
//     reaches the plate edges instead of floating in dead black.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SRC = path.join(ASSETS, 'boot-cursor.png');

const PLATE = '#0a0b0e';   // --ground-950
const FILL = 1.22;         // swirl scale — >1 crops the soft edges into the plate
const PASSES = 2;          // composite count (saturation)
const RADIUS = 0.203;      // plate corner radius as a fraction of the tile
const ICO_SIZES = [16, 32, 48, 64];
const APPLE = 180;

// ICO container of PNG frames (the Vista+ form every current browser reads):
// 6-byte ICONDIR, one 16-byte ICONDIRENTRY per frame, then the payloads.
function buildIco(frames) {
    const dir = Buffer.alloc(6);
    dir.writeUInt16LE(0, 0);              // reserved
    dir.writeUInt16LE(1, 2);              // type: 1 = icon
    dir.writeUInt16LE(frames.length, 4);
    let offset = 6 + 16 * frames.length;
    const entries = frames.map(f => {
        const e = Buffer.alloc(16);
        e.writeUInt8(f.size >= 256 ? 0 : f.size, 0);   // width  (0 means 256)
        e.writeUInt8(f.size >= 256 ? 0 : f.size, 1);   // height
        e.writeUInt8(0, 2);                            // palette entries
        e.writeUInt8(0, 3);                            // reserved
        e.writeUInt16LE(1, 4);                         // colour planes
        e.writeUInt16LE(32, 6);                        // bits per pixel
        e.writeUInt32LE(f.buf.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += f.buf.length;
        return e;
    });
    return Buffer.concat([dir, ...entries, ...frames.map(f => f.buf)]);
}

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 400, height: 400 });
    await win.loadURL('about:blank');

    const src = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');
    const out = await win.webContents.executeJavaScript(`(async () => {
        const img = new Image();
        await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = () => rej(new Error('could not decode boot-cursor.png'));
            img.src = ${JSON.stringify(src)};
        });

        // Master tile at the art's native 128px, then downscale per output size —
        // compositing once at full res keeps the small frames matching the large.
        function master(size, radius) {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const g = c.getContext('2d');
            if (radius > 0) {
                g.fillStyle = ${JSON.stringify(PLATE)};
                g.beginPath();
                g.moveTo(radius, 0);
                g.arcTo(size, 0, size, size, radius);
                g.arcTo(size, size, 0, size, radius);
                g.arcTo(0, size, 0, 0, radius);
                g.arcTo(0, 0, size, 0, radius);
                g.closePath();
                g.fill();
            } else {
                g.fillStyle = ${JSON.stringify(PLATE)};
                g.fillRect(0, 0, size, size);
            }
            const d = size * ${FILL}, o = (size - d) / 2;
            for (let i = 0; i < ${PASSES}; i++) g.drawImage(img, o, o, d, d);
            return c;
        }

        const rounded = master(128, 128 * ${RADIUS});
        // Apple's launcher applies its own mask, so its source is full-bleed square.
        const square = master(${APPLE}, 0);

        function scaled(from, size) {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(from, 0, 0, size, size);
            return c.toDataURL('image/png').split(',')[1];
        }

        const ico = {};
        for (const s of ${JSON.stringify(ICO_SIZES)}) ico[s] = scaled(rounded, s);
        return { ico, apple: square.toDataURL('image/png').split(',')[1] };
    })()`);

    const frames = ICO_SIZES.map(size => ({ size, buf: Buffer.from(out.ico[size], 'base64') }));
    const ico = buildIco(frames);
    const apple = Buffer.from(out.apple, 'base64');

    fs.writeFileSync(path.join(ASSETS, 'favicon.ico'), ico);
    fs.writeFileSync(path.join(ASSETS, 'favicon-32.png'), frames[1].buf);
    fs.writeFileSync(path.join(ASSETS, 'apple-touch-icon.png'), apple);

    console.log('favicon.ico          ' + ico.length + ' bytes  (' +
        frames.map(f => f.size + 'px:' + f.buf.length).join(', ') + ')');
    console.log('favicon-32.png       ' + frames[1].buf.length + ' bytes');
    console.log('apple-touch-icon.png ' + apple.length + ' bytes (' + APPLE + 'px)');
    app.quit();
}).catch(err => {
    console.error('make-favicon failed:', err);
    app.exit(1);
});
