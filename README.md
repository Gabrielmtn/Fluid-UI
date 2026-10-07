# Swirl Together

A playful painting game for two or more — a beautiful, interactive fluid simulation with comprehensive controls and **real-time multiplayer** support via PartyKit.

## Features

- **Advanced Fluid Simulation**: WebGL-based fluid dynamics with customizable physics
- **Rich Controls**: Extensive UI for adjusting simulation parameters
- **Recording & Playback**: Record and replay fluid interactions
- **Layer System**: Create and manage multiple visual layers
- **Presets**: Multiple artistic presets (Silky, Thick, Wispy, Chaotic, etc.)
- **Color Palettes**: Curated color palettes with step-through mode
- **Real-time Multiplayer**: Collaborate with others in the same fluid simulation
- **Pen Input Window**: Pop out an input surface onto a pen display or tablet screen (Display → Pen Input Window); the paint stays on your main monitor at its frame rate, with a light mirror and the brush ghost under the pen — and, in the desktop app, the mouse keeps working in the main window while the pen is down, and on Windows it picks up where it left off after the pen instead of starting from the tablet
- **Save picture that matches the screen**: Export → Save picture (and Mandala's Save picture) composite the background colour, image layers and text the way you see them; Export → Background switches a PNG to Transparent; GIF, JPG and video always carry the background
- **Shared-settings links**: Presets → Copy link to these settings (or Copy link on a saved preset) makes a link that carries the whole look — colours, palette, brush, fluid, symmetry, finish — and rebuilds it exactly in the browser or the desktop app, on top of the recipient's own session and never saved into it
- **Open in the desktop app**: a room or look link opened in a Windows browser offers to hand off to the Steam/itch build (`swirltogether://join/CODE`, `swirltogether://look/<settings>`), with the Steam page as the fallback
- **Mobile action row**: Look · Color · Together · Save on screen without opening the drawer; the "?" pill opens How do I…

## Multiplayer Setup

This project uses [PartyKit](https://partykit.io) for real-time multiplayer functionality.

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Running Locally

**Option 1: Combined Server (Recommended)**

```bash
npm run dev
```

This will start:
- PartyKit server on `localhost:1999`
- Static file server for the HTML/JS files

Open your browser to `http://localhost:1999`

**Option 2: Separate Servers (If Option 1 fails on Windows)**

If you encounter path-related errors on Windows, run these in separate terminals:

Terminal 1 - PartyKit server:
```bash
npm run party
```

Terminal 2 - Static file server:
```bash
npm run serve
```

Then open `http://localhost:8080` and the app will connect to PartyKit at `localhost:1999`

### Using Multiplayer

1. **Start or join a room**: Swirl Together → **Start a room** (you get a six-character code, and the invite link is copied), **Join** with a code or link, or **Stranger** to be paired with someone who is also looking. A `#CODE` in the URL joins that room.
2. **Invite**: Invite ▾ shows the code, a QR for phones, or hides it for streaming; Copy link / Copy code work in every mode. **Sync phone** makes a phone this canvas's mouse or an artist in the room.
3. **Share settings**: everyone in a room shares one set of settings. Whatever anyone changes — sliders, switches, the palette, the light, gravity — changes for everyone; incoming slider moves glide into place, and the panel says who changed what. Each person keeps their own brush.
4. **Paint together**: everyone's strokes, text and walls land on every canvas live, with each painter's cursor in their colour.

### Custom Room Names

Add a room name to the URL hash to create/join a specific room:

```
http://localhost:1999/#my-custom-room
```

### Deploying to Production

1. Update `PARTYKIT_HOST` in `js/06a-mp-core.js` with your PartyKit deployment URL
2. Deploy to PartyKit:

```bash
npm run deploy
```

3. Follow PartyKit's deployment instructions

## Project Structure

```
├── css/
│   └── styles.css          # All CSS styles
├── js/
│   ├── 01-config.js        # Global configuration and state
│   ├── 02-palettes.js      # Color palette management
│   ├── 03-recording.js     # Recording/playback system
│   ├── 04-ui-interactions.js # UI controls and interactions
│   ├── 05-fluid-sim.js     # WebGL fluid simulation engine
│   └── 06a…06e-mp-*.js     # multiplayer client (core, shared settings, glide, paint wire, panel)
├── party/
│   └── index.ts            # PartyKit server code
├── index.html              # Main HTML file
├── package.json
├── partykit.json          # PartyKit configuration
└── README.md
```

## Hotkeys

- **F1 or ?** - Toggle hotkeys overlay
- **Ctrl+Z** - Undo
- **Ctrl+Y / Ctrl+Shift+Z** - Redo
- **T** - Toggle trail
- **C** - Toggle cursor
- **H** - Toggle canvas handles
- **L** - Lock/unlock borders
- **[ / ]** - Adjust brush size
- **R** - Toggle random colors
- **A** - Toggle palette step mode
- **N** - Next color in palette

## Development

The codebase has been refactored into modular files for better maintainability:

- Configuration and state management
- Color palette utilities
- Recording system with timeline
- UI interactions and effects
- WebGL fluid simulation
- Multiplayer synchronization

## Technologies Used

- **WebGL** - GPU-accelerated fluid simulation
- **PartyKit** - Real-time multiplayer infrastructure
- **Vanilla JavaScript** - No frameworks, pure JS
- **HTML5 Canvas** - For trails and overlays

## License

Proprietary — see [LICENSE](LICENSE). Third-party components are used under
their own licenses — see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Credits

The fluid-dynamics core is derived from [Pavel Dobryakov's WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
(MIT), extensively reworked and enhanced with a brush engine, layer/mask system,
recording, audio reactivity, AI-assisted imports (Transformers.js, Apache-2.0),
and multiplayer support. The solver lineage also owes to
[Mark Harris, *Fast Fluid Dynamics Simulation on the GPU* (GPU Gems ch. 38)](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu),
[Mattias Harrysson's fluids-2d](https://github.com/mharrys/fluids-2d) and
[George Corney's GPU-Fluid-Experiments](https://github.com/haxiomic/GPU-Fluid-Experiments).
