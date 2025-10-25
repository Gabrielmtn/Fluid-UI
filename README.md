# Fluid-UI

A beautiful, interactive fluid simulation with comprehensive controls and **real-time multiplayer** support via PartyKit.

## Features

- **Advanced Fluid Simulation**: WebGL-based fluid dynamics with customizable physics
- **Rich Controls**: Extensive UI for adjusting simulation parameters
- **Recording & Playback**: Record and replay fluid interactions
- **Layer System**: Create and manage multiple visual layers
- **Presets**: Multiple artistic presets (Silky, Thick, Wispy, Chaotic, etc.)
- **Color Palettes**: Curated color palettes with step-through mode
- **Real-time Multiplayer**: Collaborate with others in the same fluid simulation

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

Start the PartyKit development server:

```bash
npm run dev
```

This will start:
- PartyKit server on `localhost:1999`
- Static file server for the HTML/JS files

Open your browser to the URL shown in the terminal (typically `http://localhost:1999`)

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

1. Update `PARTYKIT_HOST` in `js/06-multiplayer.js` with your PartyKit deployment URL
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
│   └── 06-multiplayer.js   # PartyKit multiplayer client
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

Open source - feel free to modify and use!

## Credits

Based on an open source fluid simulation, enhanced with extensive UI controls, recording capabilities, and multiplayer support.
