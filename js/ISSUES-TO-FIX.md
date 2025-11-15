# Fluid Simulation - Critical Issues & Feature Requests

**Analysis of 965 Google Play Store Reviews**
- 32 Low-Rated Reviews (1-2 stars)
- 252 Bug/Problem Reports
- 213 Feature Requests

---

## 🔴 CRITICAL BUGS (High Priority)

### 1. **Wallpaper Issues**
**Impact:** VERY HIGH - Most common complaint

- **Orientation Bug**: Wallpaper gets distorted/stretched when rotating screen
  - Appears as 4x mirrored/stretched versions
  - Only fills part of screen after orientation change
  - Requires app restart to fix
  - Affects: Samsung, Sony Xperia, Huawei EMUI devices

- **Wallpaper Stops Working**: Live wallpaper randomly resets to default
  - Black screen appears instead of simulation
  - User settings are lost
  - Requires uninstall/reinstall to fix
  - No way to save/restore preset configurations

- **Lock Screen Not Working**: Wallpaper doesn't apply to lock screen
  - Only works on home screen despite option to set both
  - Worked on older device but not newer ones (e.g., 9T Pro worked, 12T Pro doesn't)

- **Scaling Issues**: Wallpaper doesn't fill entire screen
  - Blank areas on edges
  - Upper left portion only filled
  - ~1 inch blank below and to the right

### 2. **Performance Issues**

- **Battery Drain**: Significant battery consumption
  - Especially on newer phones (S23 Ultra mentioned)
  - Live wallpaper continues running when not on home screen
  - Recognizes touches even when home screen not in focus

- **Lag/Stuttering**: 
  - Live wallpaper not as smooth as in-app
  - Stutters even on lowest resolution settings
  - High-refresh rate devices (90Hz OnePlus 7 Pro) can't maintain framerate on high quality
  - Drops to 20fps on high quality settings

- **Resolution Problems**:
  - Quality lower than previous versions
  - Can't achieve high resolution without severe performance hit

### 3. **UI/UX Bugs**

- **Brightness Control Missing**: 
  - Whites/light colors too bright and painful
  - Causes sensory overload for neurodivergent users
  - No brightness adjustment option found

- **Settings Unclear**: 
  - Many settings have no descriptions
  - Users don't understand what parameters do
  - Difficult to find optimal settings

- **Preset Management Issues**:
  - Can't load custom presets as wallpaper
  - Stuck on first preset selected
  - Presets dropdown arrow too small/hard to click
  - Cannot save/export presets to new device

- **Screenshot Feature Broken**:
  - Capture button says saved but images don't appear in gallery
  - Need way to freeze frame before screenshot
  - Menu circle blocks screenshots

### 4. **Compatibility Issues**

- **Device Incompatibility**:
  - App allows download but then shows "device doesn't support" error
  - Particularly Samsung Galaxy S6 (Verizon edition)
  - Should block incompatible devices from downloading

- **Chromecast Crashes**: App crashes when trying to cast to TV

---

## 🟡 MEDIUM PRIORITY ISSUES

### 5. **Paywall Concerns**
- Features that were free becoming paid
- Live wallpaper moved to premium (major complaint)
- Subscription model seen as too aggressive
- Price considered too high ($3-$4 vs competitors at half price)
- Free version too limited to evaluate if worth purchasing

### 6. **Background Touch Recognition**
- Live wallpaper recognizes touches even when not on home screen
- Makes phone slower/harder to use in other apps
- Should disable touch recognition when home screen not in focus

### 7. **Back Button Not Working**
- In newest paid version, back button closes app instead of returning to previous screen

---

## 💡 MOST REQUESTED FEATURES

### Visual Customization
1. **Custom Background Color/Image**
   - Allow custom wallpaper underneath fluid simulation
   - Black AMOLED wallpaper option
   - Ability to layer simulation over existing wallpapers
   - Change background from default black to white or other colors

2. **Brightness Control**
   - Toggle to reduce overall brightness
   - Reduce harsh white glow
   - Accessibility need for photosensitive users

3. **Color Control**
   - Pick single colors instead of random
   - Custom color palettes/schemes
   - Control which colors appear in rotation
   - Prevent color flashing/bleeding

4. **Gradient Feature**
   - Add gradient color options

### Interaction Features
5. **Music Reactivity**
   - Colors/motion respond to music
   - Dance/pulse with audio input

6. **Motion Controls**
   - Tilt-to-move colors
   - Shake to trigger effects
   - Accelerometer integration

7. **Screenshot/Freeze Frame**
   - Freeze frame to preserve designs
   - Save button for created patterns
   - Auto-save beautiful combinations
   - Share feature

### Settings Improvements
8. **Persistence Controls**
   - Adjust how long strokes stay visible
   - Timer for fade/dissolution
   - Keep designs longer before fading

9. **Randomize Button**
   - Randomly generate settings combinations
   - Discover new effects easily

10. **Settings Tooltips**
    - Descriptions for each setting
    - Long-press for explanations
    - Help icon next to each parameter

### Wallpaper Features
11. **Separate Lock/Home Screen**
    - Different settings for lock vs home
    - Currently forces both to be identical

12. **Wallpaper Parallax**
    - Move left/right when changing pages
    - Currently static across home screens

### Monetization
13. **Alternative to Payment**
    - Watch ads to unlock features
    - Earn features without paying
    - Free trial with all features

### Seasonal/Themed Content
14. **Holiday Themes**
    - Christmas effects
    - Halloween themes
    - Seasonal color palettes

---

## 📊 ISSUE FREQUENCY ANALYSIS

**Most Common Complaints:**
1. Wallpaper orientation/distortion bugs (15+ reports)
2. Too bright/no brightness control (8+ reports)
3. Live wallpaper stops working (7+ reports)
4. Battery drain (6+ reports)
5. Can't save presets/configurations (5+ reports)
6. Lock screen doesn't work (5+ reports)
7. Performance lag/stuttering (5+ reports)
8. Features moved to paywall (4+ reports)

**Most Requested Features:**
1. Custom background color/image (12+ requests)
2. Brightness/glow control (8+ requests)
3. Single color picker (7+ requests)
4. Music reactivity (6+ requests)
5. Screenshot/freeze frame (6+ requests)
6. Settings explanations (5+ requests)
7. Preset save/export (4+ requests)

---

## 🎯 QUICK WINS (Easy Fixes, High Impact)

1. **Add brightness slider** - Simple UI control, huge accessibility win
2. **Fix orientation bug** - Critical wallpaper issue affecting many users
3. **Add tooltips to settings** - Improve user understanding
4. **Make preset dropdown larger** - Simple UI improvement
5. **Fix screenshot save** - Implement proper gallery save
6. **Disable touch when not focused** - Prevent background interference
7. **Add device compatibility check** - Block incompatible downloads
8. **Fix back button** - Restore proper navigation

---

## 💭 DEVELOPER INSIGHTS

**Positive Patterns:**
- Users LOVE the visuals and concept
- Great for anxiety/ADHD/neurodivergent users
- Makes excellent wallpaper when it works
- Customization options highly praised
- Battery usage acceptable when optimized
- No ads widely appreciated

**Pain Points:**
- Technical issues (wallpaper bugs) preventing 5-star ratings
- Pricing/paywall strategy causing friction
- Missing "obvious" features (brightness, custom backgrounds)
- Lack of documentation for settings
- Preset/configuration management lacking

---

## 📝 NOTES
- Many 4-star reviews would become 5-star with minor fixes
- Wallpaper functionality is the #1 use case - prioritize stability
- Accessibility features (brightness, sensory control) have strong user demand
- Users willing to pay but need trial period with full features
- Export/import presets critical for user retention across devices
