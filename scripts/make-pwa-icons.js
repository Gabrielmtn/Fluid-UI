#!/usr/bin/env node
// Home-screen icons for the phone brush (phone/manifest.webmanifest), from the
// app's 512px shortcut icon (steam/demo-store-assets/shortcut_icon_512x512.png:
// the S in red and teal paint). Run with Electron, like make-favicon.js:
//
//     npx electron scripts/make-pwa-icons.js
//
// Writes assets/pwa/:
//   icon-512.png           the art as it is ("any": shown whole)
//   icon-192.png           the same, smaller
//   icon-maskable-512.png  the art shrunk onto the black plate, so Android's
//                          adaptive-icon mask (a circle or squircle inside the
//                          middle 80%) never cuts into the S
//   apple-touch-icon.png   180px, full bleed (iOS applies its own mask)
// Only needs re-running if the source art changes.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'steam', 'demo-store-assets', 'shortcut_icon_512x512.png');
const OUT = path.join(ROOT, 'assets', 'pwa');
const PLATE = '#000000';   // the art's own ground
const MASKABLE_SCALE = 0.84;

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 600, height: 600 });
    await win.loadURL('about:blank');
    const src = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');
    const out = await win.webContents.executeJavaScript(`(async () => {
        const img = new Image();
        await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = () => rej(new Error('could not decode the source icon'));
            img.src = ${JSON.stringify(src)};
        });
        function tile(size, scale) {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const g = c.getContext('2d');
            g.fillStyle = ${JSON.stringify(PLATE)};
            g.fillRect(0, 0, size, size);
            g.imageSmoothingQuality = 'high';
            const d = size * scale, o = (size - d) / 2;
            g.drawImage(img, o, o, d, d);
            return c.toDataURL('image/png').split(',')[1];
        }
        return {
            'icon-512.png': tile(512, 1),
            'icon-192.png': tile(192, 1),
            'icon-maskable-512.png': tile(512, ${MASKABLE_SCALE}),
            'apple-touch-icon.png': tile(180, 1)
        };
    })()`);
    fs.mkdirSync(OUT, { recursive: true });
    for (const name of Object.keys(out)) {
        const buf = Buffer.from(out[name], 'base64');
        fs.writeFileSync(path.join(OUT, name), buf);
        console.log(('assets/pwa/' + name).padEnd(34) + buf.length + ' bytes');
    }
    app.quit();
}).catch((err) => {
    console.error('make-pwa-icons failed:', err);
    app.exit(1);
});
