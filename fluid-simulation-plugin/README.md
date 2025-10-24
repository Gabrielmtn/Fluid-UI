# Fluid Simulation WordPress Plugin

An interactive WebGL2-based fluid simulation plugin for WordPress with advanced controls, layer management, and recording capabilities.

## Description

This plugin brings the stunning fluid simulation from the Fluid-UI project into WordPress. Create mesmerizing fluid dynamics simulations with customizable physics, colors, and interactive animations.

## Features

- **Real-time Fluid Dynamics**: WebGL2-powered fluid simulation with adjustable physics
- **Advanced Controls**:
  - Adjustable brush size, resolution, and physics parameters
  - Multiple dissipation controls (density, velocity, pressure)
  - Vorticity/curl effects
  - 8 preset configurations (Silky, Thick, Wispy, Chaotic, etc.)

- **Layer System**:
  - 10 background layers for static images
  - Adjustable opacity, position, and scale
  - Drag-and-drop image upload support
  - Layer threshold filtering

- **Color & Palette Management**:
  - Built-in color picker with saved palette
  - 4 curated color palettes
  - Random color generation
  - Step-through palette mode

- **Recording & Playback**:
  - Record fluid interactions to layers
  - Timeline visualization
  - Playback controls with speed adjustment
  - Export/Import animations as JSON

- **Interactive Animations**:
  - Smash Effect
  - Jellyfish Animation
  - Portrait Animation
  - Vortex Effect
  - Ascend Effect
  - Portal Effect
  - Freeze Mode

- **Canvas Controls**:
  - Resizable canvas with 8-direction handles
  - Corner locking system
  - Adjustable canvas opacity
  - Show/hide border controls

- **Keyboard Shortcuts**:
  - 20+ hotkeys for quick access
  - Undo/Redo support (Ctrl+Z, Ctrl+Y)
  - Brush size adjustment ([ / ])
  - Color management shortcuts
  - And more!

## Installation

1. Upload the `fluid-simulation-plugin` folder to `/wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Navigate to 'Fluid Simulation' in the WordPress admin menu to start creating

## Usage

### Admin Page

Access the fluid simulation directly from the WordPress admin menu:
1. Go to **Fluid Simulation** in your WordPress admin sidebar
2. Use the controls on the right to customize your simulation
3. Interact with the canvas by clicking and dragging

### Shortcode

Display the fluid simulation on any page or post using the shortcode:

```
[fluid_simulation]
```

With custom dimensions:

```
[fluid_simulation width="1000" height="800"]
```

## Requirements

- WordPress 5.0 or higher
- PHP 7.4 or higher
- Modern browser with WebGL 2.0 support

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari (with WebGL 2.0 support)
- Opera

## Keyboard Shortcuts

- **Ctrl+Z**: Undo
- **Ctrl+Y**: Redo
- **T**: Toggle Trail
- **C**: Toggle Cursor
- **H**: Toggle Border & Handles
- **L**: Lock/Unlock Borders
- **[ / ]**: Decrease/Increase Brush Size
- **R**: Toggle Random Colors
- **N**: Next Color
- **F1 or ?**: Toggle Hotkeys Help
- **Esc**: Close Modals

## File Structure

```
fluid-simulation-plugin/
├── admin/
│   └── templates/
│       └── admin-page.php          # Admin page template
├── assets/
│   ├── css/
│   │   └── fluid-simulation.css    # Plugin styles
│   └── js/
│       └── fluid-simulation.js     # Simulation engine
├── includes/
│   └── shortcode-template.php      # Shortcode template
├── fluid-simulation.php             # Main plugin file
└── README.md                        # Documentation
```

## Technical Details

- Uses WebGL 2.0 for GPU-accelerated rendering
- Custom GLSL shaders for physics simulation
- 9 compiled shader programs for different effects
- Navier-Stokes solver for fluid dynamics
- Frame buffer objects (FBOs) for efficient rendering
- No external JavaScript libraries required

## Development

### Customization

The plugin uses localStorage for saving user preferences like color palettes. Future enhancements could integrate with WordPress options API for server-side storage.

### Extending

Developers can modify:
- `assets/js/fluid-simulation.js` - Core simulation engine
- `assets/css/fluid-simulation.css` - Visual styling
- Templates for custom layouts

## Credits

Based on the Fluid-UI project by Gabriel Mtn
- GitHub: https://github.com/Gabrielmtn/Fluid-UI

## License

GPL v2 or later

## Changelog

### 1.0.0
- Initial release
- WordPress plugin conversion from standalone HTML application
- Admin page integration
- Shortcode support
- Full feature parity with original Fluid-UI project

## Support

For issues, feature requests, or questions:
- GitHub Issues: https://github.com/Gabrielmtn/Fluid-UI/issues

## Future Enhancements

- WordPress media library integration for image uploads
- WordPress options API for settings persistence
- Multi-instance support (multiple simulations on one page)
- Mobile touch support optimization
- Additional preset configurations
- Color palette sharing between users
- Animation presets library

## Notes

- The plugin requires WebGL 2.0 support in the browser
- Performance depends on device GPU capabilities
- Higher resolution settings require more GPU power
- Recommended to use hardware acceleration in browser settings
