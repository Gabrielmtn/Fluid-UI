/**
 * Settings Manager
 * Robust local storage system for persisting user preferences
 * Supports namespacing, validation, migration, and export/import
 */

class SettingsManager {
    constructor(namespace = 'fluidUI') {
        this.namespace = namespace;
        this.cache = new Map();
        this.sessionCache = new Map(); // Temporary session-only storage
        this.validators = new Map();
        this.migrations = [];
        this.version = 1;
        
        // Load all settings into cache
        this.loadAll();
    }
    
    /**
     * Register a validator for a specific key
     * @param {string} key - Setting key
     * @param {function} validator - Function that returns true if value is valid
     */
    registerValidator(key, validator) {
        this.validators.set(key, validator);
    }
    
    /**
     * Register a migration function for version upgrades
     * @param {number} fromVersion - Version to migrate from
     * @param {number} toVersion - Version to migrate to
     * @param {function} migrator - Function that transforms old settings to new format
     */
    registerMigration(fromVersion, toVersion, migrator) {
        this.migrations.push({ fromVersion, toVersion, migrator });
    }
    
    /**
     * Set a temporary session value (cleared on refresh, overridden by saved settings)
     * @param {string} key - Setting key
     * @param {*} value - Value to store
     */
    setSession(key, value) {
        this.sessionCache.set(key, value);
    }
    
    /**
     * Get a session value (falls back to localStorage, then default)
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if setting doesn't exist
     * @returns {*} Setting value
     */
    getSession(key, defaultValue = null) {
        // Session values are lowest priority
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        if (this.sessionCache.has(key)) {
            return this.sessionCache.get(key);
        }
        return defaultValue;
    }
    
    /**
     * Clear session storage
     */
    clearSession() {
        this.sessionCache.clear();
    }
    
    /**
     * Get a setting value
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if setting doesn't exist
     * @returns {*} Setting value
     */
    get(key, defaultValue = null) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        
        try {
            const storageKey = this._getStorageKey(key);
            const item = localStorage.getItem(storageKey);
            
            if (item === null) {
                return defaultValue;
            }
            
            const parsed = JSON.parse(item);
            this.cache.set(key, parsed.value);
            return parsed.value;
        } catch (error) {
            console.warn(`Failed to get setting "${key}":`, error);
            return defaultValue;
        }
    }
    
    /**
     * Set a setting value
     * @param {string} key - Setting key
     * @param {*} value - Value to store
     * @param {boolean} validate - Whether to validate before storing
     * @returns {boolean} Success status
     */
    set(key, value, validate = true) {
        // Validate if validator exists
        if (validate && this.validators.has(key)) {
            const validator = this.validators.get(key);
            if (!validator(value)) {
                console.warn(`Validation failed for setting "${key}"`);
                return false;
            }
        }
        
        try {
            const storageKey = this._getStorageKey(key);
            const item = {
                value,
                timestamp: Date.now(),
                version: this.version
            };
            
            localStorage.setItem(storageKey, JSON.stringify(item));
            this.cache.set(key, value);
            
            // Dispatch event for listeners
            window.dispatchEvent(new CustomEvent('settingChanged', {
                detail: { key, value, namespace: this.namespace }
            }));
            
            return true;
        } catch (error) {
            console.error(`Failed to set setting "${key}":`, error);
            return false;
        }
    }
    
    /**
     * Remove a setting
     * @param {string} key - Setting key
     */
    remove(key) {
        try {
            const storageKey = this._getStorageKey(key);
            localStorage.removeItem(storageKey);
            this.cache.delete(key);
            return true;
        } catch (error) {
            console.error(`Failed to remove setting "${key}":`, error);
            return false;
        }
    }
    
    /**
     * Check if a setting exists
     * @param {string} key - Setting key
     * @returns {boolean}
     */
    has(key) {
        if (this.cache.has(key)) {
            return true;
        }
        
        const storageKey = this._getStorageKey(key);
        return localStorage.getItem(storageKey) !== null;
    }
    
    /**
     * Load all settings from localStorage into cache
     */
    loadAll() {
        const prefix = `${this.namespace}:`;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const settingKey = key.substring(prefix.length);
                this.get(settingKey); // Loads into cache
            }
        }
    }
    
    /**
     * Export all settings as JSON
     * @returns {string} JSON string of all settings
     */
    export() {
        const settings = {};
        const prefix = `${this.namespace}:`;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const settingKey = key.substring(prefix.length);
                settings[settingKey] = this.get(settingKey);
            }
        }
        
        return JSON.stringify({
            namespace: this.namespace,
            version: this.version,
            timestamp: Date.now(),
            settings
        }, null, 2);
    }
    
    /**
     * Import settings from JSON
     * @param {string} json - JSON string of settings
     * @param {boolean} merge - Whether to merge with existing settings or replace
     * @returns {boolean} Success status
     */
    import(json, merge = true) {
        try {
            const data = JSON.parse(json);
            
            // Validate import data
            if (!data.settings || typeof data.settings !== 'object') {
                throw new Error('Invalid settings format');
            }
            
            // Clear existing if not merging
            if (!merge) {
                this.clear();
            }
            
            // Apply migrations if needed
            let settings = data.settings;
            if (data.version < this.version) {
                settings = this._applyMigrations(settings, data.version, this.version);
            }
            
            // Import each setting
            for (const [key, value] of Object.entries(settings)) {
                this.set(key, value, true);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    }
    
    /**
     * Clear all settings in this namespace
     */
    clear() {
        const prefix = `${this.namespace}:`;
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        this.cache.clear();
    }

    /**
     * Clear settings but PRESERVE saved presets (preset.* keys). Used by the
     * "Clear" button so a settings reset never destroys the user's preset
     * library. (The on-disk Preset Vault is immune regardless, but this keeps
     * the in-session localStorage mirror intact too.)
     */
    clearExceptPresets() {
        const prefix = `${this.namespace}:`;
        const presetPrefix = `${this.namespace}:preset.`;
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix) && !key.startsWith(presetPrefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        // Rebuild cache from what survived on disk.
        this.cache.clear();
        this.loadAll();
    }

    /**
     * Get all settings as an object
     * @returns {object} All settings
     */
    getAll() {
        const settings = {};
        this.cache.forEach((value, key) => {
            settings[key] = value;
        });
        return settings;
    }
    
    /**
     * Listen for changes to a specific setting
     * @param {string} key - Setting key to watch
     * @param {function} callback - Callback function
     */
    watch(key, callback) {
        const handler = (event) => {
            if (event.detail.key === key && event.detail.namespace === this.namespace) {
                callback(event.detail.value);
            }
        };
        
        window.addEventListener('settingChanged', handler);
        
        // Return unsubscribe function
        return () => window.removeEventListener('settingChanged', handler);
    }
    
    /**
     * Get storage key with namespace
     * @private
     */
    _getStorageKey(key) {
        return `${this.namespace}:${key}`;
    }
    
    /**
     * Apply migrations to settings
     * @private
     */
    _applyMigrations(settings, fromVersion, toVersion) {
        let current = settings;
        
        // Sort migrations by version
        const sortedMigrations = this.migrations
            .filter(m => m.fromVersion >= fromVersion && m.toVersion <= toVersion)
            .sort((a, b) => a.fromVersion - b.fromVersion);
        
        // Apply each migration
        for (const migration of sortedMigrations) {
            try {
                current = migration.migrator(current);
            } catch (error) {
                console.error(`Migration from v${migration.fromVersion} to v${migration.toVersion} failed:`, error);
            }
        }
        
        return current;
    }
}

// Create global settings manager instance
window.settingsManager = new SettingsManager('fluidUI');

// Register common validators
window.settingsManager.registerValidator('statsPanel.position', (value) => {
    return value && 
           typeof value.x === 'number' && 
           typeof value.y === 'number' &&
           value.x >= 0 && value.y >= 0;
});

window.settingsManager.registerValidator('statsPanel.pinned', (value) => {
    return typeof value === 'boolean';
});

console.log('Settings Manager initialized');
