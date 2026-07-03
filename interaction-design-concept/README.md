# Centering Together

A community centering exercise where everyone interacts with a shared fluid simulation in real-time.

## Overview

This is a mobile-friendly multiplayer fluid interaction demo built for interaction design presentations. When participants visit the URL, they join a shared room where everyone can see each other's interactions with the fluid simulation.

## Features

- **Real-time multiplayer** - See other participants' touches and movements
- **Mobile-first design** - Optimized for touch devices
- **Visual presence** - Each participant gets a unique color
- **Participant count** - See how many people are present
- **Breathing guide** - Subtle visual cue for mindful interaction

## Tech Stack

- **WebGL2** - Hardware-accelerated fluid simulation
- **PartyKit** - Real-time WebSocket infrastructure
- **Vanilla JS** - No framework dependencies

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Local Development

```bash
# Install dependencies
npm install

# Start PartyKit dev server
npm run dev
```

This starts the PartyKit server locally at `http://localhost:1999`.

### Deployment

1. **Deploy to PartyKit:**
   ```bash
   npm run deploy
   ```

2. **Update the host** in `public/multiplayer.js`:
   ```javascript
   return 'your-project.your-username.partykit.dev';
   ```

3. **Host static files** on GitHub Pages, Netlify, or any static host.

## Project Structure

```
interaction-design-concept/
├── party/
│   └── server.ts       # PartyKit server (WebSocket relay)
├── public/
│   ├── index.html      # Main HTML
│   ├── styles.css      # Mobile-first styles
│   ├── fluid.js        # WebGL2 fluid simulation
│   ├── multiplayer.js  # PartyKit client
│   └── app.js          # Main application logic
├── package.json
├── partykit.json       # PartyKit configuration
└── README.md
```

## Customization

### Fluid Settings

Edit `public/fluid.js` config object:

```javascript
let config = {
    SIM_RESOLUTION: 128,      // Physics resolution
    DYE_RESOLUTION: 512,      // Visual resolution
    DENSITY_DISSIPATION: 0.97, // How fast colors fade
    VELOCITY_DISSIPATION: 0.98, // How fast motion fades
    PRESSURE_ITERATIONS: 20,   // Simulation accuracy
    CURL: 30,                  // Swirl intensity
    SPLAT_RADIUS: 0.012        // Brush size
};
```

### Room Name

Change the room name in `public/multiplayer.js`:

```javascript
const ROOM_NAME = 'your-session-name';
```

## License

MIT
