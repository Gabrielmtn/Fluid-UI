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
- **Pen Input Window**: Pop out an input surface onto a pen display or tablet screen (Display → Pen Input Window); the paint stays on your main monitor at its frame rate, with a light mirror and the brush ring under the pen — and, in the desktop app, the mouse keeps working in the main window while the pen is down

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

1. **Enable Multiplayer**: Check the "Enable Multiplayer" checkbox in the controls panel
2. **Join a Room**: The room name is shown in the multiplayer section. By default, it's based on the URL hash (e.g., `#my-room`)
3. **Share with Others**: Click "Copy Room URL" to get a shareable link
4. **Collaborate**: When multiple users are in the same room, you'll see:
   - Their cursor positions (blue circles)
   - Their fluid interactions in real-time
   - Synchronized clear and preset changes

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
│   └── 06a…06e-mp-*.js     # multiplayer client (core, look, turns, paint wire, panel)
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
