/**
 * ComponentRegistry - Central registry for UI components
 * Manages component registration, creation, and lifecycle
 */

class ComponentRegistry {
    constructor() {
        this.components = new Map(); // Registered component classes
        this.instances = new Map();  // Active component instances
        this.groups = new Map();     // Component groups
    }
    
    /**
     * Register a component class
     * @param {string} name - Component name
     * @param {Class} ComponentClass - Component class
     * @param {Object} metadata - Optional metadata
     */
    register(name, ComponentClass, metadata = {}) {
        if (this.components.has(name)) {
            console.warn(`Component ${name} already registered, overwriting`);
        }
        
        this.components.set(name, {
            class: ComponentClass,
            metadata: {
                name,
                description: metadata.description || '',
                category: metadata.category || 'general',
                version: metadata.version || '1.0.0',
                author: metadata.author || '',
                ...metadata
            }
        });
        
        console.log(`✓ Registered component: ${name}`);
    }
    
    /**
     * Register multiple components at once
     * @param {Object} components - Object with name: ComponentClass pairs
     */
    registerBatch(components) {
        Object.entries(components).forEach(([name, ComponentClass]) => {
            this.register(name, ComponentClass);
        });
    }
    
    /**
     * Create a component instance
     * @param {string} name - Component name
     * @param {Object} config - Component configuration
     * @returns {UIComponent}
     */
    create(name, config = {}) {
        const component = this.components.get(name);
        
        if (!component) {
            throw new Error(`Component ${name} not registered. Available: ${Array.from(this.components.keys()).join(', ')}`);
        }
        
        // Create instance
        const instance = new component.class(config);
        
        // Initialize
        instance.init();
        
        // Store instance
        this.instances.set(instance.id, instance);
        
        // Add to group if specified
        if (config.group) {
            this.addToGroup(config.group, instance);
        }
        
        return instance;
    }
    
    /**
     * Create and mount a component
     * @param {string} name - Component name
     * @param {Object} config - Component configuration
     * @param {HTMLElement} parent - Parent element to mount to
     * @returns {UIComponent}
     */
    createAndMount(name, config, parent) {
        const instance = this.create(name, config);
        instance.mount(parent);
        return instance;
    }
    
    /**
     * Get component instance by ID
     * @param {string} id - Component ID
     * @returns {UIComponent}
     */
    get(id) {
        return this.instances.get(id);
    }
    
    /**
     * Get all component instances
     * @returns {Array<UIComponent>}
     */
    getAll() {
        return Array.from(this.instances.values());
    }
    
    /**
     * Get components by category
     * @param {string} category - Category name
     * @returns {Array<UIComponent>}
     */
    getByCategory(category) {
        return this.getAll().filter(instance => {
            const componentData = this.components.get(instance.constructor.name);
            return componentData && componentData.metadata.category === category;
        });
    }
    
    /**
     * Check if component is registered
     * @param {string} name - Component name
     * @returns {boolean}
     */
    has(name) {
        return this.components.has(name);
    }
    
    /**
     * Check if instance exists
     * @param {string} id - Component ID
     * @returns {boolean}
     */
    hasInstance(id) {
        return this.instances.has(id);
    }
    
    /**
     * Destroy component instance
     * @param {string} id - Component ID
     */
    destroy(id) {
        const instance = this.instances.get(id);
        
        if (instance) {
            // Remove from groups
            this.groups.forEach((group, groupName) => {
                if (group.has(instance.id)) {
                    group.delete(instance.id);
                }
            });
            
            // Destroy instance
            instance.destroy();
            
            // Remove from registry
            this.instances.delete(id);
            
            console.log(`✓ Destroyed component: ${id}`);
        }
    }
    
    /**
     * Destroy all component instances
     */
    destroyAll() {
        const ids = Array.from(this.instances.keys());
        ids.forEach(id => this.destroy(id));
        this.groups.clear();
    }
    
    /**
     * Add component to a group
     * @param {string} groupName - Group name
     * @param {UIComponent} instance - Component instance
     */
    addToGroup(groupName, instance) {
        if (!this.groups.has(groupName)) {
            this.groups.set(groupName, new Set());
        }
        this.groups.get(groupName).add(instance.id);
    }
    
    /**
     * Get all components in a group
     * @param {string} groupName - Group name
     * @returns {Array<UIComponent>}
     */
    getGroup(groupName) {
        const group = this.groups.get(groupName);
        if (!group) {
            return [];
        }
        return Array.from(group).map(id => this.instances.get(id)).filter(Boolean);
    }
    
    /**
     * Remove component from group
     * @param {string} groupName - Group name
     * @param {string} id - Component ID
     */
    removeFromGroup(groupName, id) {
        const group = this.groups.get(groupName);
        if (group) {
            group.delete(id);
        }
    }
    
    /**
     * Get list of registered component names
     * @returns {Array<string>}
     */
    listComponents() {
        return Array.from(this.components.keys());
    }
    
    /**
     * Get component metadata
     * @param {string} name - Component name
     * @returns {Object}
     */
    getMetadata(name) {
        const component = this.components.get(name);
        return component ? component.metadata : null;
    }
    
    /**
     * Get all component metadata
     * @returns {Array<Object>}
     */
    getAllMetadata() {
        return Array.from(this.components.values()).map(c => c.metadata);
    }
    
    /**
     * Mount all components in a group to a container
     * @param {string} groupName - Group name
     * @param {HTMLElement} container - Container element
     */
    mountGroup(groupName, container) {
        const components = this.getGroup(groupName);
        components.forEach(component => {
            if (!component.mounted) {
                component.mount(container);
            }
        });
    }
    
    /**
     * Unmount all components in a group
     * @param {string} groupName - Group name
     */
    unmountGroup(groupName) {
        const components = this.getGroup(groupName);
        components.forEach(component => {
            if (component.mounted) {
                component.unmount();
            }
        });
    }
    
    /**
     * Export component states
     * @returns {Object}
     */
    exportStates() {
        const states = {};
        this.instances.forEach((instance, id) => {
            states[id] = instance.getState();
        });
        return states;
    }
    
    /**
     * Import component states
     * @param {Object} states - States object
     */
    importStates(states) {
        Object.entries(states).forEach(([id, state]) => {
            const instance = this.instances.get(id);
            if (instance) {
                instance.setState(state);
            }
        });
    }
    
    /**
     * Debug: Print registry status
     */
    debug() {
        console.group('Component Registry Status');
        console.log('Registered Components:', this.listComponents());
        console.log('Active Instances:', this.instances.size);
        console.log('Groups:', Array.from(this.groups.keys()));
        
        console.group('Instances');
        this.instances.forEach((instance, id) => {
            console.log(`- ${id}:`, {
                type: instance.constructor.name,
                mounted: instance.mounted,
                state: instance.getState()
            });
        });
        console.groupEnd();
        
        console.group('Groups');
        this.groups.forEach((group, name) => {
            console.log(`- ${name}:`, Array.from(group));
        });
        console.groupEnd();
        
        console.groupEnd();
    }
}

// Create global registry instance
if (typeof window !== 'undefined') {
    window.ComponentRegistry = new ComponentRegistry();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentRegistry;
}
