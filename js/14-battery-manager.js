// Battery Manager & Performance Profiles
// Monitors battery status and adjusts performance accordingly

(function() {
    'use strict';
    
    // Performance profiles - from battery saver to extreme high-end
    // EXTREME = best real-time experience (optimized for interaction)
    // CINEMATIC = maxed settings for frame capture (not for real-time use)
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
            pressureIterations: 20,    // Good accuracy
            curl: 6,
            sharpness: 0.3,
            targetFPS: 60,
            fpsCap: 60,
            description: 'Recommended for most systems'
        },
        'performance': {
            name: 'High',
            icon: '⚡',
            simResolution: 384,        // Good physics
            dyeResolution: 1024,       // Good visuals
            pressureIterations: 25,    // Good accuracy
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
            dyeResolution: 1536,       // High visual detail (1.5K)
            pressureIterations: 30,    // High accuracy
            curl: 12,
            sharpness: 0.6,
            targetFPS: 'native',       // Uncapped for high-refresh monitors
            fpsCap: 'native',
            description: 'High quality, uncapped FPS'
        },
        'extreme': {
            name: 'Extreme',
            icon: '🔥',
            simResolution: 512,        // High physics (sweet spot)
            dyeResolution: 2048,       // 2K visual detail
            pressureIterations: 35,    // High accuracy (reduced from 40)
            curl: 16,
            sharpness: 0.8,
            targetFPS: 'native',       // Uncapped - best real-time experience
            fpsCap: 'native',
            description: 'Best real-time quality, needs powerful GPU'
        },
        'gpu-share': {
            name: 'GPU Share',
            icon: '🤝',
            simResolution: 256,        // Mid-tier physics (balanced quality)
            dyeResolution: 1024,       // Keep visuals decent (same as balanced)
            pressureIterations: 18,    // Slightly reduced solver cost (vs balanced's 20)
            curl: 8,                   // Keep some vorticity
            sharpness: 0.4,            // Maintain visual clarity
            targetFPS: 60,             // Full frame rate by default
            fpsCap: 60,                // Run at 60fps until external load detected
            description: 'Optimized for running alongside GPU apps - enable Adaptive Quality',
            
            // Enhanced adaptive behavior for this profile (USER MUST ENABLE)
            adaptiveConfig: {
                enabled: false,         // User must enable "Adaptive quality" checkbox
                checkInterval: 1500,    // Check every 1.5s for stability
                minSamples: 3,          // Wait for 3 samples to confirm pressure
                cooldown: 8000,         // 8s between adjustments to prevent jitter
                fpsThreshold: 0.70,     // Downgrade if <70% of target (more tolerant)
                upgradeThreshold: 0.92, // Upgrade if >92% sustained
                
                // Tiered response levels
                tiers: [
                    {
                        name: 'normal',
                        fpsCap: 60,
                        pressureIterations: 18,
                        minDuration: 0  // Start here
                    },
                    {
                        name: 'constrained',
                        fpsCap: 40,
                        pressureIterations: 15,
                        minDuration: 3000  // Must be struggling for 3s
                    },
                    {
                        name: 'yielding',
                        fpsCap: 30,
                        pressureIterations: 12,
                        simResolution: 192,  // Only now drop sim res
                        minDuration: 6000  // Must be struggling for 6s
                    }
                ]
            }
        },
        'cinematic': {
            name: 'Cinematic',
            icon: '🎬',
            simResolution: 512,        // High physics
            dyeResolution: 4096,       // 4K visual detail
            pressureIterations: 50,    // Maximum accuracy
            curl: 20,
            sharpness: 1.0,
            targetFPS: 30,             // Capped - for frame capture, not real-time
            fpsCap: 30,                // 30fps is fine for video capture
            description: '4K capture mode - NOT for real-time use',
            isCaptureModeOnly: true    // Flag for UI warnings
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
            
            // Tiered adaptive system state
            this.currentAdaptiveTier = 0;
            this.pressureStartTime = null;
            this.lastAdaptiveChange = 0;
            this.baseProfileSettings = null; // Store original profile settings
            
            // Interaction burst mode state
            this.inBurstMode = false;
            this.baseFpsCap = null;
            this.burstTimeout = null;
            this.lastInteractionTime = 0;
            
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
            
            const profile = PROFILES[this.currentProfile];
            const interval = profile?.adaptiveConfig?.checkInterval || 2000;
            
            // Check FPS at profile-specific interval (default 2s)
            this.fpsCheckInterval = setInterval(() => {
                if (!this.shouldRunAdaptive()) return;
                
                this.checkPerformanceAndAdapt();
            }, interval);
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
        
        showAdaptiveNotification(tierName) {
            const tierIcons = {
                'normal': '⚖️',
                'constrained': '⚡',
                'yielding': '🤝'
            };
            
            const notification = document.createElement('div');
            notification.className = 'fps-notification';
            notification.textContent = `${tierIcons[tierName] || '⚙️'} GPU Share: ${tierName}`;
            document.body.appendChild(notification);
            
            setTimeout(() => notification.classList.add('show'), 10);
            
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 3000);
            
            // Update tier indicator if present
            this.updateTierIndicator(tierName, tierIcons[tierName] || '⚙️');
        }
        
        updateTierIndicator(tierName, icon) {
            const tierIndicator = document.getElementById('adaptive-tier');
            if (!tierIndicator) return;
            
            const tierIconEl = document.getElementById('tier-icon');
            const tierNameEl = document.getElementById('tier-name');
            
            if (tierIconEl) tierIconEl.textContent = icon;
            if (tierNameEl) tierNameEl.textContent = tierName.charAt(0).toUpperCase() + tierName.slice(1);
            
            // Show indicator
            tierIndicator.style.display = 'flex';
        }
        
        applyAdaptiveTier(tierIndex) {
            const profile = PROFILES[this.currentProfile];
            if (!profile.adaptiveConfig) return;
            
            const tier = profile.adaptiveConfig.tiers[tierIndex];
            if (!tier) return;
            
            // Apply tier settings WITHOUT changing the profile
            // This preserves visual settings while throttling compute
            
            if (tier.fpsCap !== undefined) {
                window.fpsCap = tier.fpsCap;
                this.syncFpsCapUI(tier.fpsCap);
            }
            
            if (tier.pressureIterations !== undefined) {
                config.PRESSURE_ITERATIONS = tier.pressureIterations;
                this.syncPressureIterationsUI(tier.pressureIterations);
            }
            
            if (tier.simResolution !== undefined) {
                // Only change if different (framebuffer reinit is expensive)
                if (config.SIM_RESOLUTION !== tier.simResolution) {
                    config.SIM_RESOLUTION = tier.simResolution;
                    window.needsFramebufferReinit = true;
                }
            }
            
            // Visual feedback
            this.showAdaptiveNotification(tier.name);
        }
        
        syncFpsCapUI(capValue) {
            const fpsCapSel = document.getElementById('fpsCap');
            if (fpsCapSel) {
                fpsCapSel.value = String(capValue);
            }
        }
        
        syncPressureIterationsUI(value) {
            const pressureSlider = document.getElementById('pressure-iterations');
            if (pressureSlider) {
                pressureSlider.value = value;
                pressureSlider.dispatchEvent(new Event('input', { bubbles: false }));
            }
        }
        
        getCurrentFPS() {
            // Get FPS from electron-performance.js or calculate it
            if (window.electronPerf && window.electronPerf.getFPS) {
                return window.electronPerf.getFPS();
            } else if (window.lastFPS !== undefined) {
                return window.lastFPS;
            }
            return 60; // Default fallback
        }
        
        shouldRunAdaptive() {
            // Always respect user's checkbox setting
            // The adaptiveConfig just defines HOW to adapt, not WHETHER to adapt
            return this.fpsAdaptive;
        }
        
        checkPerformanceAndAdapt() {
            const profile = PROFILES[this.currentProfile];
            // No active profile (desktop boots profile-less): there is no
            // ladder to walk — live quality adaptation is the QualityGovernor's
            // job until the user explicitly picks a profile.
            if (!profile) return;
            const adaptiveConfig = profile.adaptiveConfig;
            
            // If profile doesn't have adaptiveConfig, use old profile-switching
            if (!adaptiveConfig) {
                this.checkFpsAndAdjust();
                return;
            }
            
            // Get current performance metrics
            const currentFps = this.getCurrentFPS();
            const targetFps = this.resolveProfileFps(profile);
            
            // Track history
            this.fpsHistory.push(currentFps);
            if (this.fpsHistory.length > 10) this.fpsHistory.shift();
            
            // Need minimum samples
            if (this.fpsHistory.length < adaptiveConfig.minSamples) return;
            
            // Calculate average
            const avgFps = this.fpsHistory.reduce((a, b) => a + b) / this.fpsHistory.length;
            const fpsRatio = avgFps / targetFps;
            
            // Determine current tier
            const currentTier = this.currentAdaptiveTier || 0;
            const maxTier = adaptiveConfig.tiers.length - 1;
            
            // Check if we need to downgrade
            if (fpsRatio < adaptiveConfig.fpsThreshold) {
                const now = Date.now();
                
                // Has pressure been sustained long enough for next tier?
                if (!this.pressureStartTime) {
                    this.pressureStartTime = now;
                }
                
                const pressureDuration = now - this.pressureStartTime;
                const nextTier = Math.min(currentTier + 1, maxTier);
                const nextTierConfig = adaptiveConfig.tiers[nextTier];
                
                if (pressureDuration >= nextTierConfig.minDuration && currentTier < maxTier) {
                    // Downgrade to next tier
                    this.currentAdaptiveTier = nextTier;
                    this.applyAdaptiveTier(nextTier);
                    this.lastAdaptiveChange = now;
                    this.pressureStartTime = now; // Reset for next tier
                }
            }
            // Check if we can upgrade
            else if (fpsRatio > adaptiveConfig.upgradeThreshold && currentTier > 0) {
                const now = Date.now();
                
                // Cooldown check
                if (now - this.lastAdaptiveChange < adaptiveConfig.cooldown) return;
                
                // Upgrade to previous tier
                this.currentAdaptiveTier = currentTier - 1;
                this.applyAdaptiveTier(this.currentAdaptiveTier);
                this.lastAdaptiveChange = now;
                this.pressureStartTime = null; // Clear pressure timer
            }
        }
        
        handlePointerInput() {
            // Mark interaction time
            this.lastInteractionTime = Date.now();
            
            // If in GPU Share mode with adaptive, enter burst mode
            const profile = PROFILES[this.currentProfile];
            if (profile?.adaptiveConfig?.enabled) {
                this.enterInteractionBurst();
            }
        }
        
        enterInteractionBurst() {
            if (this.inBurstMode) {
                clearTimeout(this.burstTimeout);
            } else {
                this.inBurstMode = true;
                this.baseFpsCap = window.fpsCap;
                window.fpsCap = this.baseFpsCap + 10; // Bump by 10 FPS
            }
            
            // Exit burst mode after 300ms of no interaction
            this.burstTimeout = setTimeout(() => {
                window.fpsCap = this.baseFpsCap;
                this.inBurstMode = false;
            }, 300);
        }
        
        setProfile(profileName, manual = false) {
            if (!PROFILES[profileName]) return;
            
            const profile = PROFILES[profileName];
            
            // Warn user if selecting capture-only mode
            if (profile.isCaptureModeOnly && manual) {
                console.warn('[Profile] ⚠️ Cinematic mode is for frame capture only - expect input lag during real-time use');
            }
            
            this.currentProfile = profileName;
            
            // Reset adaptive tier state when switching profiles
            this.currentAdaptiveTier = 0;
            this.pressureStartTime = null;
            this.lastAdaptiveChange = 0;
            this.fpsHistory = [];
            
            // Hide tier indicator when switching profiles
            const tierIndicator = document.getElementById('adaptive-tier');
            if (tierIndicator) {
                tierIndicator.style.display = 'none';
            }
            
            // Restart FPS monitoring with new profile's interval
            this.startFpsMonitoring();
            
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
                    <div class="checkbox-group">
                        <input type="checkbox" id="battery-auto-mode">
                        <label for="battery-auto-mode">Auto-adjust for battery</label>
                    </div>
                    <div class="setting-hint" style="margin-top:-4px;margin-bottom:8px;">Adjusts quality based on battery level</div>
                    
                    <div class="checkbox-group">
                        <input type="checkbox" id="fps-adaptive-mode">
                        <label for="fps-adaptive-mode">Adaptive quality (FPS-based)</label>
                    </div>
                    <div class="setting-hint" style="margin-top:-4px;">Adjusts quality if FPS drops</div>
                    
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
                    
                    <!-- Adaptive Tier Indicator -->
                    <div class="adaptive-tier-indicator" id="adaptive-tier" style="display: none;">
                        <span id="tier-icon">⚖️</span>
                        <span id="tier-name">Normal</span>
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
            // window.config is provided by the async-loaded 04a; the deferred
            // setProfile can fire before it exists. Re-syncs once config is ready.
            if (!window.config) return;
            // Profiles / the FPS-adaptive tier use non-preset resolutions (dye 1536,
            // sim 192); 05h's setResolutionDropdown injects them as options so the
            // dropdown shows the real value instead of going blank. Inline fallback
            // in case this runs before 05h has defined the helper.
            const set = window.setResolutionDropdown || function (sel, value) {
                if (!sel) return;
                const v = String(value);
                const has = Array.prototype.some.call(sel.options, function (o) { return o.value === v; });
                if (!has) {
                    const o = document.createElement('option');
                    o.value = v; o.textContent = v + ' (custom)'; o.setAttribute('data-injected', '1');
                    sel.appendChild(o);
                }
                sel.value = v;
            };
            const visualResSel = document.getElementById('visualResolution');
            if (visualResSel) set(visualResSel, window.config.DYE_RESOLUTION);
            const physicsResSel = document.getElementById('physicsResolution');
            if (physicsResSel) set(physicsResSel, window.config.SIM_RESOLUTION);
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
                
                // Desktop always boots at the raw config defaults (highest sim
                // quality — the QualityGovernor scales down live if the GPU can't
                // keep up). The persisted profile is deliberately NOT applied at
                // boot on desktop: adaptive downgrades during one session (e.g. a
                // backgrounded window walking the ladder to battery-saver) would
                // otherwise leave every future boot degraded. Profiles stay fully
                // usable as in-session tools. Mobile keeps the 'balanced' boot.
                this.currentProfile = isMobile ? Settings.loadSelect('performanceProfile', 'balanced') : null;
                
                const autoToggle = document.getElementById('battery-auto-mode');
                if (autoToggle) {
                    autoToggle.checked = this.autoMode;
                }
                
                const fpsToggle = document.getElementById('fps-adaptive-mode');
                if (fpsToggle) {
                    fpsToggle.checked = this.fpsAdaptive;
                }
                
                // PERF: defer profile application so it doesn't block initial render,
                // AND wait for window.config (provided by the async-loaded 04a) — else
                // the profile's resolution silently no-ops (and used to crash).
                let _profileTries = 0;
                const applyProfileWhenReady = () => {
                    if (window.config) {
                        if (this.currentProfile) {
                            this.setProfile(this.currentProfile, false);
                        } else {
                            this.clearActiveProfile();
                        }
                    } else if (_profileTries++ < 600) {
                        requestAnimationFrame(applyProfileWhenReady);
                    }
                };
                requestAnimationFrame(() => requestAnimationFrame(applyProfileWhenReady));
            }
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Defer initialization to allow render loop to start first
            requestAnimationFrame(() => {
                window.batteryManager = new BatteryManager();
                window.clearActiveProfile = () => window.batteryManager?.clearActiveProfile();
                window.batteryHandleInput = () => window.batteryManager?.handlePointerInput();
            });
        });
    } else {
        requestAnimationFrame(() => {
            window.batteryManager = new BatteryManager();
            window.clearActiveProfile = () => window.batteryManager?.clearActiveProfile();
            window.batteryHandleInput = () => window.batteryManager?.handlePointerInput();
        });
    }
})();
