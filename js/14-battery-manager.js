// Battery Manager & Performance Profiles
// Monitors battery status and adjusts performance accordingly

(function() {
    'use strict';
    
    // Performance profiles - from battery saver to extreme high-end
    const PROFILES = {
        'battery-saver': {
            name: 'Battery Saver',
            icon: '🔋',
            simResolution: 128,        // Minimal physics
            dyeResolution: 512,        // Low visual detail
            pressureIterations: 10,    // Minimal accuracy
            curl: 4,
            sharpness: 0,
            targetFPS: 30,
            fpsCap: 30,                // Hard cap to save power
            description: 'Low quality, maximum battery life'
        },
        'balanced': {
            name: 'Balanced',
            icon: '⚖️',
            simResolution: 256,        // Good physics
            dyeResolution: 1024,       // Good visuals
            pressureIterations: 25,    // Good accuracy
            curl: 6,
            sharpness: 0.3,
            targetFPS: 60,
            fpsCap: 60,
            description: 'Recommended for most systems'
        },
        'performance': {
            name: 'High',
            icon: '⚡',
            simResolution: 512,        // Higher physics
            dyeResolution: 1024,       // Good visuals
            pressureIterations: 30,    // Higher accuracy
            curl: 10,
            sharpness: 0.5,
            targetFPS: 60,
            fpsCap: 60,
            description: 'High quality, needs decent GPU'
        },
        'ultra': {
            name: 'Ultra',
            icon: '🚀',
            simResolution: 512,        // High physics
            dyeResolution: 2048,       // High visual detail
            pressureIterations: 40,    // High accuracy
            curl: 12,
            sharpness: 0.6,
            targetFPS: 120,
            fpsCap: 120,
            description: 'Very high quality, needs good GPU'
        },
        'extreme': {
            name: 'Extreme',
            icon: '🔥',
            simResolution: 512,        // High physics (512→1024 is 4x GPU cost, minimal visual gain)
            dyeResolution: 2048,       // High visual detail
            pressureIterations: 40,    // High accuracy
            curl: 16,
            sharpness: 0.8,
            targetFPS: 'native',       // Resolved to monitor Hz at runtime
            fpsCap: 'native',          // Uncap to match monitor
            description: 'Extreme quality, targets native monitor Hz'
        },
        'cinematic': {
            name: 'Cinematic',
            icon: '🎬',
            simResolution: 512,        // High physics (keeps frame budget for 4K dye)
            dyeResolution: 4096,       // 4K visual detail
            pressureIterations: 50,    // Very high accuracy
            curl: 20,
            sharpness: 1.0,
            targetFPS: 'native',       // Resolved to monitor Hz at runtime
            fpsCap: 'native',          // Uncap to match monitor
            description: '4K cinematic, for high-end GPUs only'
        }
    };
    
    class BatteryManager {
        constructor() {
            this.battery = null;
            this.currentProfile = 'balanced';
            
            // Detect device type
            const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            
            // Auto-adjust features OFF by default on desktop
            this.autoMode = isMobile; // Battery auto-adjust only on mobile
            this.isPluggedIn = true;
            
            // FPS-based adaptive quality (only default on mobile)
            this.fpsAdaptive = isMobile; // Only enabled by default on mobile
            this.fpsHistory = [];
            this.fpsCheckInterval = null;
            this.lastFpsAdjustment = 0;
            
            this.initBattery();
            this.createUI();
            this.loadSettings();
            this.startFpsMonitoring();
        }
        
        getMonitorHz() {
            // Use the globally detected display Hz (set by 05-fluid-sim.js via Electron API)
            return window.__displayHz || 60;
        }
        
        // Resolve 'native' targetFPS/fpsCap to actual monitor Hz
        resolveProfileFps(profile) {
            const hz = this.getMonitorHz();
            const target = profile.targetFPS === 'native' ? hz : profile.targetFPS;
            return target || 60;
        }
        
        async initBattery() {
            if (!navigator.getBattery) {
                this.updateUI({ level: null, charging: true });
                return;
            }
            
            try {
                this.battery = await navigator.getBattery();
                
                // Initial update
                this.updateBatteryStatus();
                
                // Listen for changes
                this.battery.addEventListener('chargingchange', () => this.updateBatteryStatus());
                this.battery.addEventListener('levelchange', () => this.updateBatteryStatus());
                
            } catch (err) {
                this.updateUI({ level: null, charging: true });
            }
        }
        
        updateBatteryStatus() {
            if (!this.battery) return;
            
            const level = Math.round(this.battery.level * 100);
            const charging = this.battery.charging;
            this.isPluggedIn = charging;
            
            this.updateUI({ level, charging });
            
            // Auto-adjust performance if enabled
            if (this.autoMode) {
                this.autoAdjustPerformance(level, charging);
            }
        }
        
        autoAdjustPerformance(level, charging) {
            // Skip if auto mode is disabled
            if (!this.autoMode) {
                return;
            }
            
            let targetProfile = this.currentProfile;
            
            if (charging) {
                // Plugged in - use performance mode
                targetProfile = 'performance';
            } else if (level <= 20) {
                // Critical battery - battery saver
                targetProfile = 'battery-saver';
            } else if (level <= 50) {
                // Low battery - balanced
                targetProfile = 'balanced';
            } else {
                // Good battery - performance
                targetProfile = 'performance';
            }
            
            if (targetProfile !== this.currentProfile) {
                this.setProfile(targetProfile);
            }
        }
        
        startFpsMonitoring() {
            if (this.fpsCheckInterval) {
                clearInterval(this.fpsCheckInterval);
            }
            
            // Check FPS every 2 seconds
            this.fpsCheckInterval = setInterval(() => {
                if (!this.fpsAdaptive) return;
                
                this.checkFpsAndAdjust();
            }, 2000);
        }
        
        checkFpsAndAdjust() {
            // Skip if disabled
            if (!this.fpsAdaptive) {
                return;
            }
            
            // Get FPS from electron-performance.js or calculate it
            let currentFps = 60;
            
            if (window.electronPerf && window.electronPerf.getFPS) {
                currentFps = window.electronPerf.getFPS();
            } else if (window.lastFPS !== undefined) {
                currentFps = window.lastFPS;
            }
            
            // Track FPS history (last 5 samples = 10 seconds)
            this.fpsHistory.push(currentFps);
            if (this.fpsHistory.length > 5) {
                this.fpsHistory.shift();
            }
            
            // Need at least 3 samples to make a decision
            if (this.fpsHistory.length < 3) return;
            
            // Calculate average FPS
            const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            
            // Cooldown: Don't adjust more than once every 10 seconds
            const now = Date.now();
            if (now - this.lastFpsAdjustment < 10000) return;
            
            const currentProfile = PROFILES[this.currentProfile];
            const targetFps = this.resolveProfileFps(currentProfile);
            
            // If FPS is significantly below target (< 70%), downgrade
            if (targetFps > 0 && avgFps < targetFps * 0.7) {
                const profiles = ['ultra', 'performance', 'balanced', 'battery-saver'];
                const currentIndex = profiles.indexOf(this.currentProfile);
                
                // Can we downgrade?
                if (currentIndex < profiles.length - 1) {
                    const newProfile = profiles[currentIndex + 1];
                    this.setProfile(newProfile, false);
                    this.lastFpsAdjustment = now;
                    
                    // Show notification
                    this.showFpsNotification('lowered', PROFILES[newProfile].name, Math.round(avgFps));
                }
            }
            // If FPS is consistently high (> 90% of target) and we're not at max, upgrade
            else if (avgFps > targetFps * 0.9 && this.currentProfile !== 'ultra') {
                const profiles = ['battery-saver', 'balanced', 'performance', 'ultra'];
                const currentIndex = profiles.indexOf(this.currentProfile);
                
                // Can we upgrade?
                if (currentIndex < profiles.length - 1) {
                    const newProfile = profiles[currentIndex + 1];
                    this.setProfile(newProfile, false);
                    this.lastFpsAdjustment = now;
                    
                    // Show notification
                    this.showFpsNotification('raised', PROFILES[newProfile].name, Math.round(avgFps));
                }
            }
        }
        
        showFpsNotification(action, profileName, fps) {
            // Create a temporary notification
            const notification = document.createElement('div');
            notification.className = 'fps-notification';
            notification.textContent = `${action === 'lowered' ? '📉' : '📈'} Quality ${action} to ${profileName} (${fps} FPS)`;
            document.body.appendChild(notification);
            
            // Animate in
            setTimeout(() => notification.classList.add('show'), 10);
            
            // Remove after 3 seconds
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
        
        setProfile(profileName, manual = false) {
            if (!PROFILES[profileName]) return;
            
            this.currentProfile = profileName;
            const profile = PROFILES[profileName];
            
            // Apply profile settings to config
            if (window.config) {
                // Guard: prevent slider event listeners from deactivating this profile
                window._profileApplying = true;
                
                // Check if resolution is changing BEFORE applying (reinit destroys sim state)
                const resChanged = config.SIM_RESOLUTION !== profile.simResolution ||
                                   config.DYE_RESOLUTION !== profile.dyeResolution;
                
                // Simulation resolution
                config.SIM_RESOLUTION = profile.simResolution;
                
                // Dye resolution
                config.DYE_RESOLUTION = profile.dyeResolution;
                
                // Pressure iterations
                const pressureSlider = document.getElementById('pressure-iterations');
                if (pressureSlider && pressureSlider.value != profile.pressureIterations) {
                    pressureSlider.value = profile.pressureIterations;
                    pressureSlider.dispatchEvent(new Event('input'));
                }
                
                // Curl strength
                const curlSlider = document.getElementById('curl');
                if (curlSlider && curlSlider.value != profile.curl) {
                    curlSlider.value = profile.curl;
                    curlSlider.dispatchEvent(new Event('input'));
                }
                
                // Sharpness
                if (typeof profile.sharpness === 'number') {
                    config.SHARPNESS = profile.sharpness;
                    const sharpSlider = document.getElementById('sharpness');
                    if (sharpSlider) {
                        sharpSlider.value = profile.sharpness;
                        sharpSlider.style.setProperty('--val', profile.sharpness);
                        const sharpSpan = document.getElementById('sharpnessValue');
                        if (sharpSpan) sharpSpan.textContent = profile.sharpness.toFixed(1);
                    }
                }
                
                // Only reinit framebuffers if resolution actually changed
                if (resChanged) {
                    window.needsFramebufferReinit = true;
                }
                
                // Clear guard — future slider changes are user-initiated
                window._profileApplying = false;
            }
            
            // Set FPS cap if profile specifies one
            if (profile.fpsCap !== undefined) {
                const hz = this.getMonitorHz();
                const capVal = profile.fpsCap === 'native' ? 0 : profile.fpsCap;
                window.fpsCap = capVal;
                // Sync the FPS cap dropdown
                const fpsCapSel = document.getElementById('fpsCap');
                if (fpsCapSel) {
                    if (profile.fpsCap === 'native') {
                        fpsCapSel.value = 'native';
                    } else {
                        fpsCapSel.value = String(capVal);
                        // If exact value not in dropdown, set to closest
                        if (fpsCapSel.value !== String(capVal)) {
                            fpsCapSel.value = 'native';
                            window.fpsCap = 0;
                        }
                    }
                }
                console.log('[Profile] ' + profileName + ' → FPS cap: ' + (capVal === 0 ? 'native (' + hz + 'Hz)' : capVal));
            }
            
            // Sync resolution dropdowns to match new profile values
            this.syncResolutionDropdowns();
            
            // Update UI
            this.updateProfileUI(profileName);
            
            // Save if manual change
            if (manual) {
                this.autoMode = false;
                this.saveSettings();
            }
        }
        
        createUI() {
            const controls = document.getElementById('sidebar-right') || document.querySelector('.controls');
            if (!controls) return;
            
            const batterySection = document.createElement('div');
            batterySection.className = 'collapsible-section';
            batterySection.innerHTML = `
                <div class="section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="section-title">🔋 Battery & Performance</span>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <!-- Battery Status -->
                    <div class="control-group" id="battery-status">
                        <div class="battery-display">
                            <div class="battery-icon">
                                <div class="battery-level" id="battery-level-bar"></div>
                            </div>
                            <div class="battery-info">
                                <div id="battery-percent">--</div>
                                <div id="battery-status-text">Checking...</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Auto Mode Toggles -->
                    <div class="control-group">
                        <label>
                            <input type="checkbox" id="battery-auto-mode">
                            Auto-adjust for battery
                        </label>
                        <div class="setting-hint">Adjusts quality based on battery level (mobile only)</div>
                    </div>
                    
                    <div class="control-group">
                        <label>
                            <input type="checkbox" id="fps-adaptive-mode">
                            Adaptive quality (FPS-based)
                        </label>
                        <div class="setting-hint">Adjusts quality if FPS drops (recommended for mobile)</div>
                    </div>
                    
                    <!-- Performance Profile Selector -->
                    <div class="control-group">
                        <label>Performance Mode</label>
                        <div class="profile-buttons" id="profile-buttons">
                            ${Object.keys(PROFILES).map(key => {
                                const p = PROFILES[key];
                                return `
                                    <button class="profile-btn" data-profile="${key}" title="${p.description}">
                                        <span class="profile-icon">${p.icon}</span>
                                        <span class="profile-name">${p.name}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <!-- Profile Description -->
                    <div class="control-group">
                        <div class="profile-description" id="profile-description">
                            ${PROFILES.balanced.description}
                        </div>
                    </div>
                    
                    <!-- Performance Stats -->
                    <div class="control-group" style="font-size: 11px; opacity: 0.7;">
                        <div id="performance-stats">
                            Target: <span id="target-fps">60</span> FPS<br>
                            Sim: <span id="sim-res">1024</span>x<span id="sim-res-h">768</span><br>
                            Dye: <span id="dye-res">1024</span>x<span id="dye-res-h">768</span>
                        </div>
                    </div>
                </div>
            `;
            
            // Insert after simulation controls
            const simSection = Array.from(controls.querySelectorAll('.collapsible-section'))
                .find(s => s.textContent.includes('Simulation'));
            if (simSection) {
                simSection.after(batterySection);
            } else {
                controls.appendChild(batterySection);
            }
            
            this.attachListeners();
        }
        
        attachListeners() {
            // Auto mode toggle
            const autoToggle = document.getElementById('battery-auto-mode');
            if (autoToggle) {
                autoToggle.addEventListener('change', (e) => {
                    this.autoMode = e.target.checked;
                    this.saveSettings();
                    if (this.autoMode && this.battery) {
                        this.updateBatteryStatus();
                    }
                });
            }
            
            // FPS adaptive toggle
            const fpsAdaptiveToggle = document.getElementById('fps-adaptive-mode');
            if (fpsAdaptiveToggle) {
                fpsAdaptiveToggle.addEventListener('change', (e) => {
                    this.fpsAdaptive = e.target.checked;
                    this.saveSettings();
                    
                    if (this.fpsAdaptive) {
                        this.fpsHistory = []; // Reset history
                        this.lastFpsAdjustment = 0;
                    }
                });
            }
            
            // Profile buttons
            const profileButtons = document.querySelectorAll('.profile-btn');
            profileButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const profile = btn.dataset.profile;
                    this.setProfile(profile, true);
                });
            });
        }
        
        updateUI({ level, charging }) {
            // Battery level bar
            const levelBar = document.getElementById('battery-level-bar');
            const percentText = document.getElementById('battery-percent');
            const statusText = document.getElementById('battery-status-text');
            
            if (level === null) {
                if (percentText) percentText.textContent = 'N/A';
                if (statusText) statusText.textContent = 'Desktop Mode';
                if (levelBar) levelBar.style.width = '100%';
                return;
            }
            
            if (levelBar) {
                levelBar.style.width = level + '%';
                
                // Color based on level
                if (charging) {
                    levelBar.style.background = 'linear-gradient(90deg, #4ade80, #22c55e)';
                } else if (level <= 20) {
                    levelBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
                } else if (level <= 50) {
                    levelBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
                } else {
                    levelBar.style.background = 'linear-gradient(90deg, #4ade80, #22c55e)';
                }
            }
            
            if (percentText) {
                percentText.textContent = level + '%';
            }
            
            if (statusText) {
                if (charging) {
                    statusText.textContent = '⚡ Charging';
                } else {
                    const hours = Math.floor(this.battery?.dischargingTime / 3600) || '?';
                    statusText.textContent = `🔋 On Battery (~${hours}h left)`;
                }
            }
        }
        
        updateProfileUI(profileName) {
            const profile = PROFILES[profileName];
            
            // Update button states
            document.querySelectorAll('.profile-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.profile === profileName);
            });
            
            // Update description
            const desc = document.getElementById('profile-description');
            if (desc) {
                desc.textContent = profile.description;
            }
            
            // Update stats — show profile's target FPS (resolving 'native' to monitor Hz)
            const resolvedTarget = this.resolveProfileFps(profile);
            const targetFpsEl = document.getElementById('target-fps');
            const simResEl = document.getElementById('sim-res');
            const simResHEl = document.getElementById('sim-res-h');
            const dyeResEl = document.getElementById('dye-res');
            const dyeResHEl = document.getElementById('dye-res-h');

            if (targetFpsEl) targetFpsEl.textContent = profile.targetFPS === 'native' ? resolvedTarget + ' (native)' : resolvedTarget;
            if (simResEl)   simResEl.textContent   = profile.simResolution;
            if (simResHEl)  simResHEl.textContent  = Math.round(profile.simResolution * 0.75);
            if (dyeResEl)   dyeResEl.textContent   = profile.dyeResolution;
            if (dyeResHEl)  dyeResHEl.textContent  = Math.round(profile.dyeResolution * 0.75);
        }
        
        // Deactivate the active profile (called when user makes custom changes)
        clearActiveProfile() {
            this.currentProfile = null;
            
            // Remove active state from all profile buttons
            document.querySelectorAll('.profile-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Update description to indicate custom
            const desc = document.getElementById('profile-description');
            if (desc) {
                desc.textContent = 'Custom settings';
            }
            
            // Update target FPS display to show current cap
            const targetFpsEl = document.getElementById('target-fps');
            if (targetFpsEl) {
                const cap = window.fpsCap;
                targetFpsEl.textContent = cap > 0 ? cap : (window.__displayHz || 60) + ' (native)';
            }
        }
        
        // Sync the resolution dropdowns in the UI to match config values
        syncResolutionDropdowns() {
            const visualResSel = document.getElementById('visualResolution');
            if (visualResSel) {
                const val = String(window.config.DYE_RESOLUTION);
                const hasOption = Array.from(visualResSel.options).some(opt => opt.value === val);
                visualResSel.value = hasOption ? val : 'custom';
                const customInput = document.getElementById('visualResolutionCustom');
                if (customInput) {
                    customInput.style.display = hasOption ? 'none' : 'block';
                    if (!hasOption) customInput.value = val;
                }
            }
            const physicsResSel = document.getElementById('physicsResolution');
            if (physicsResSel) {
                const val = String(window.config.SIM_RESOLUTION);
                const hasOption = Array.from(physicsResSel.options).some(opt => opt.value === val);
                physicsResSel.value = hasOption ? val : 'custom';
                const customInput = document.getElementById('physicsResolutionCustom');
                if (customInput) {
                    customInput.style.display = hasOption ? 'none' : 'block';
                    if (!hasOption) customInput.value = val;
                }
            }
        }
        
        saveSettings() {
            if (window.Settings) {
                Settings.saveCheckbox('batteryAutoMode', this.autoMode);
                Settings.saveCheckbox('fpsAdaptiveMode', this.fpsAdaptive);
                Settings.saveSelect('performanceProfile', this.currentProfile);
            }
        }
        
        loadSettings() {
            if (window.Settings) {
                // Default both auto-adjust features based on device type
                const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                
                this.autoMode = Settings.loadCheckbox('batteryAutoMode', isMobile);
                this.fpsAdaptive = Settings.loadCheckbox('fpsAdaptiveMode', isMobile);
                
                this.currentProfile = Settings.loadSelect('performanceProfile', 'balanced');
                
                const autoToggle = document.getElementById('battery-auto-mode');
                if (autoToggle) {
                    autoToggle.checked = this.autoMode;
                }
                
                const fpsToggle = document.getElementById('fps-adaptive-mode');
                if (fpsToggle) {
                    fpsToggle.checked = this.fpsAdaptive;
                }
                
                this.setProfile(this.currentProfile, false);
            }
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.batteryManager = new BatteryManager();
            window.clearActiveProfile = () => window.batteryManager?.clearActiveProfile();
        });
    } else {
        window.batteryManager = new BatteryManager();
        window.clearActiveProfile = () => window.batteryManager?.clearActiveProfile();
    }
})();
